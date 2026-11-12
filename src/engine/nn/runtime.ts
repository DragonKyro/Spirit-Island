// The trained Spirit Island policy network, in plain TypeScript (no dependencies).
//
// A port of the policy half of training/spirit/model.py (SpiritNet): token embeddings,
// a pre-norm transformer over [global, decision, spirits, lands, cards] with a learned
// attention bias by hop distance between lands, and an option head that scores each
// option from its own row plus the tokens it points at. training/spirit/test_training.py
// checks that this gives the same logits as PyTorch on the same weights.
//
// Weights come from the shipped int8 file (model.py: export_quantized); they are
// dequantized once into Float32Arrays. One decision is a few million multiply-adds.
// Only the best option matters in play, so there is no sampling here: `choose` is greedy.

import { fitObservation, capsFor } from './fit';
import type { FittedObservation } from './fit';
import type { Observation } from '../observe';

const MAGIC = 'SIQ8';
const FORMAT = 'spirit-island/tokens-q8@1';
const LN_EPS = 1e-5;

interface Tensor {
  shape: number[];
  data: Float32Array;
}

interface Header {
  format: string;
  game: string;
  obsVersion: number;
  arch: {
    width: number;
    layers: number;
    heads: number;
    ffn: number;
    spec: { obsVersion: number; shape: { lands: number; spirits: number; cards: number; options: number }; maxDist: number };
  };
  tensors: { name: string; shape: number[]; dtype: 'i8' | 'f32'; offset: number; scaleOffset?: number }[];
  meta: Record<string, unknown>;
}

// ── math on row-major Float32Arrays ──

/** out[i, j] = Σ_k x[i, k] · w[j, k] + b[j]   (x: n×nIn, w: nOut×nIn) */
function linear(x: Float32Array, n: number, nIn: number, w: Tensor, b?: Tensor): Float32Array {
  const nOut = w.shape[0];
  const W = w.data;
  const out = new Float32Array(n * nOut);
  for (let i = 0; i < n; i++) {
    const xi = i * nIn;
    const oi = i * nOut;
    for (let j = 0; j < nOut; j++) {
      const wj = j * nIn;
      let sum = b ? b.data[j] : 0;
      for (let k = 0; k < nIn; k++) sum += x[xi + k] * W[wj + k];
      out[oi + j] = sum;
    }
  }
  return out;
}

function layerNorm(x: Float32Array, n: number, d: number, w: Tensor, b: Tensor): Float32Array {
  const out = new Float32Array(n * d);
  for (let i = 0; i < n; i++) {
    const o = i * d;
    let mean = 0;
    for (let k = 0; k < d; k++) mean += x[o + k];
    mean /= d;
    let v = 0;
    for (let k = 0; k < d; k++) v += (x[o + k] - mean) ** 2;
    const inv = 1 / Math.sqrt(v / d + LN_EPS);
    for (let k = 0; k < d; k++) out[o + k] = (x[o + k] - mean) * inv * w.data[k] + b.data[k];
  }
  return out;
}

/** erf to ~1e-12: the Maclaurin series below 2.5, a continued fraction for the tail (PyTorch's GELU is exact, not the tanh approximation). */
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  if (a < 2.5) {
    // erf(x) = 2/√π Σ (−1)^n x^(2n+1) / (n! (2n+1))
    let term = a;
    let sum = a;
    const a2 = a * a;
    for (let n = 1; n < 40; n++) {
      term *= -a2 / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-12) break;
    }
    return s * (2 / Math.sqrt(Math.PI)) * sum;
  }
  // erfc(x) = e^(−x²)/√π · 1 / (x + (1/2) / (x + (2/2) / (x + (3/2) / (x + …))))
  let f = 0;
  for (let k = 40; k >= 1; k--) f = k / 2 / (a + f);
  const erfc = Math.exp(-a * a) / Math.sqrt(Math.PI) / (a + f);
  return s * (1 - erfc);
}

const gelu = (x: number) => 0.5 * x * (1 + erf(x * Math.SQRT1_2));

export class SpiritPolicy {
  readonly obsVersion: number;
  readonly meta: Record<string, unknown>;
  /** Spirits per game the network was trained for (its token layout), 1 = solo */
  readonly players: number;
  private readonly t = new Map<string, Tensor>();
  private readonly d: number;
  private readonly layers: number;
  private readonly heads: number;
  private readonly maxDist: number;

  private constructor(h: Header, tensors: Map<string, Tensor>) {
    this.obsVersion = h.obsVersion;
    this.meta = h.meta;
    this.players = h.arch.spec.shape.spirits;
    this.d = h.arch.width;
    this.layers = h.arch.layers;
    this.heads = h.arch.heads;
    this.maxDist = h.arch.spec.maxDist;
    this.t = tensors;
  }

  /** Read a shipped policy file (see training/spirit/model.py: export_quantized). */
  static parse(file: ArrayBuffer | Uint8Array): SpiritPolicy {
    const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(...bytes.subarray(0, 4));
    if (magic !== MAGIC) throw new Error('not a Spirit Island policy file');
    const n = view.getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + n))) as Header;
    if (header.format !== FORMAT) throw new Error(`unsupported policy format ${header.format}`);
    const blob = 8 + n;
    const tensors = new Map<string, Tensor>();
    for (const t of header.tensors) {
      const count = t.shape.reduce((a, b) => a * b, 1);
      const data = new Float32Array(count);
      if (t.dtype === 'i8') {
        const rows = t.shape[0];
        const cols = count / rows;
        for (let r = 0; r < rows; r++) {
          const scale = view.getFloat32(blob + t.scaleOffset! + 4 * r, true);
          for (let c = 0; c < cols; c++) data[r * cols + c] = view.getInt8(blob + t.offset + r * cols + c) * scale;
        }
      } else {
        for (let k = 0; k < count; k++) data[k] = view.getFloat32(blob + t.offset + 4 * k, true);
      }
      tensors.set(t.name, { shape: t.shape, data });
    }
    return new SpiritPolicy(header, tensors);
  }

  private T(name: string): Tensor {
    const t = this.t.get(name);
    if (!t) throw new Error(`policy file has no tensor ${name}`);
    return t;
  }

  /** Σ embeddings of the categorical columns + Linear(numeric), then x + MLP(x). */
  private tokenIn(prefix: string, n: number, cat: Int32Array, cw: number, num: Float32Array, nw: number): Float32Array {
    const d = this.d;
    const x = linear(num, n, nw, this.T(`${prefix}.num.weight`), this.T(`${prefix}.num.bias`));
    for (let k = 0; k < cw; k++) {
      const emb = this.T(`${prefix}.embs.${k}.weight`);
      const rows = emb.shape[0];
      for (let i = 0; i < n; i++) {
        const r = Math.min(Math.max(cat[i * cw + k], 0), rows - 1);
        for (let j = 0; j < d; j++) x[i * d + j] += emb.data[r * d + j];
      }
    }
    const h = layerNorm(x, n, d, this.T(`${prefix}.mlp.0.weight`), this.T(`${prefix}.mlp.0.bias`));
    const h1 = linear(h, n, d, this.T(`${prefix}.mlp.1.weight`), this.T(`${prefix}.mlp.1.bias`));
    for (let i = 0; i < h1.length; i++) if (h1[i] < 0) h1[i] = 0;
    const h2 = linear(h1, n, d, this.T(`${prefix}.mlp.3.weight`), this.T(`${prefix}.mlp.3.bias`));
    for (let i = 0; i < x.length; i++) x[i] += h2[i];
    return x;
  }

  /** One logit per option of a fitted observation (see fit.ts). */
  logits(o: FittedObservation): Float32Array {
    if (o.version !== this.obsVersion) throw new Error(`observation v${o.version}, policy trained on v${this.obsVersion}`);
    const d = this.d;
    const P = o.spirit.n;
    const L = o.land.n;
    const C = o.card.n;
    const nTok = 2 + P + L + C;
    const s0 = 2 + P;
    const te = this.T('type_emb.weight').data;

    const parts: [Float32Array, number, number][] = [
      [this.tokenIn('global_in', 1, o.global.cat, o.global.cat.length, o.global.num, o.global.num.length), 1, 0],
      [this.tokenIn('decision_in', 1, o.decision.cat, o.decision.cat.length, o.decision.num, o.decision.num.length), 1, 1],
      [this.tokenIn('spirit_in', P, o.spirit.cat, o.spirit.cat.length / P, o.spirit.num, o.spirit.num.length / P), P, 2],
      [this.tokenIn('land_in', L, o.land.cat, o.land.cat.length / L, o.land.num, o.land.num.length / L), L, 3],
      [C ? this.tokenIn('card_in', C, o.card.cat, o.card.cat.length / C, o.card.num, o.card.num.length / C) : new Float32Array(0), C, 4],
    ];
    let x: Float32Array = new Float32Array(nTok * d);
    let at = 0;
    for (const [rows, n, type] of parts) {
      for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) x[(at + i) * d + j] = rows[i * d + j] + te[type * d + j];
      at += n;
    }

    // attention bias: learned per head by hop distance, for land–land pairs only
    const dh = this.heads;
    const biasTable = this.T('dist_bias.weight').data; // [maxDist + 1, heads]
    const bias = new Float32Array(dh * nTok * nTok);
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        const dist = Math.min(Math.max(o.dist[i * L + j], 0), this.maxDist);
        for (let h = 0; h < dh; h++) bias[(h * nTok + s0 + i) * nTok + s0 + j] = biasTable[dist * dh + h];
      }
    }

    for (let l = 0; l < this.layers; l++) x = this.block(l, x, nTok, bias);
    x = layerNorm(x, nTok, d, this.T('norm.weight'), this.T('norm.bias'));

    // options: [own row | land | card | spirit tokens it points at | decision token] → MLP → logit
    const n = o.option.n;
    const opt = this.tokenIn('option_in', n, o.option.cat, o.option.cat.length / n, o.option.num, o.option.num.length / n);
    const z = new Float32Array(n * 5 * d);
    const dec = x.subarray(d, 2 * d);
    // token rows in x: spirits start at 2, lands at s0, cards at s0 + L
    const starts = [s0, s0 + L, 2];
    for (let r = 0; r < n; r++) {
      const base = r * 5 * d;
      z.set(opt.subarray(r * d, (r + 1) * d), base);
      for (let k = 0; k < 3; k++) {
        const ref = o.optionRef[r * 3 + k];
        if (ref >= 0) z.set(x.subarray((starts[k] + ref) * d, (starts[k] + ref + 1) * d), base + (1 + k) * d);
      }
      z.set(dec, base + 4 * d);
    }
    const h = linear(z, n, 5 * d, this.T('option_head.0.weight'), this.T('option_head.0.bias'));
    for (let i = 0; i < h.length; i++) if (h[i] < 0) h[i] = 0;
    return linear(h, n, d, this.T('option_head.2.weight'), this.T('option_head.2.bias'));
  }

  private block(l: number, x: Float32Array, nTok: number, bias: Float32Array): Float32Array {
    const d = this.d;
    const heads = this.heads;
    const dh = d / heads;
    const p = `blocks.${l}`;
    const h = layerNorm(x, nTok, d, this.T(`${p}.ln1.weight`), this.T(`${p}.ln1.bias`));
    const qkv = linear(h, nTok, d, this.T(`${p}.qkv.weight`), this.T(`${p}.qkv.bias`));
    // qkv row layout: [which (q, k, v)][head][dh]
    const att = new Float32Array(nTok * d);
    const scale = 1 / Math.sqrt(dh);
    const scores = new Float32Array(nTok);
    for (let hd = 0; hd < heads; hd++) {
      for (let i = 0; i < nTok; i++) {
        const qo = i * 3 * d + hd * dh;
        let max = -Infinity;
        for (let j = 0; j < nTok; j++) {
          const ko = j * 3 * d + d + hd * dh;
          let dot = 0;
          for (let e = 0; e < dh; e++) dot += qkv[qo + e] * qkv[ko + e];
          const s = dot * scale + bias[(hd * nTok + i) * nTok + j];
          scores[j] = s;
          if (s > max) max = s;
        }
        let sum = 0;
        for (let j = 0; j < nTok; j++) {
          scores[j] = Math.exp(scores[j] - max);
          sum += scores[j];
        }
        const out = i * d + hd * dh;
        for (let j = 0; j < nTok; j++) {
          const w = scores[j] / sum;
          const vo = j * 3 * d + 2 * d + hd * dh;
          for (let e = 0; e < dh; e++) att[out + e] += w * qkv[vo + e];
        }
      }
    }
    const proj = linear(att, nTok, d, this.T(`${p}.proj.weight`), this.T(`${p}.proj.bias`));
    const y = new Float32Array(x.length);
    for (let i = 0; i < y.length; i++) y[i] = x[i] + proj[i];
    const h2 = layerNorm(y, nTok, d, this.T(`${p}.ln2.weight`), this.T(`${p}.ln2.bias`));
    const f = linear(h2, nTok, d, this.T(`${p}.ff.0.weight`), this.T(`${p}.ff.0.bias`));
    for (let i = 0; i < f.length; i++) f[i] = gelu(f[i]);
    const g = linear(f, nTok, this.T(`${p}.ff.0.weight`).shape[0], this.T(`${p}.ff.2.weight`), this.T(`${p}.ff.2.bias`));
    for (let i = 0; i < y.length; i++) y[i] += g[i];
    return y;
  }

  /** Fit `o` to this network's token caps and score its options. */
  scoreOptions(o: Observation): Float32Array {
    return this.logits(fitObservation(o, capsFor(this.players)));
  }

  /** Index of the best option (greedy), among those the network can see. */
  choose(o: Observation): number {
    const l = this.scoreOptions(o);
    let best = 0;
    for (let i = 1; i < l.length; i++) if (l[i] > l[best]) best = i;
    return best;
  }
}
