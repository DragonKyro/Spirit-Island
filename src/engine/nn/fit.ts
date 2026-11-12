// Fitting an observation to the sizes a network was trained on.
//
// The trainer pads every row to fixed sizes (a table of `players` Spirits has at most
// `caps.lands` land tokens, `caps.cards` card tokens and `caps.options` options) and drops
// whatever does not fit. The app must drop exactly the same tokens, so both go through
// this function: training/spirit/vec-env.ts pads its result, the runtime reads it as is.

import { CARD_CAT, CARD_NUM, LAND_CAT, LAND_NUM, OPTION_CAT, OPTION_NUM, OPTION_REF, SPIRIT_CAT, SPIRIT_NUM } from '../observe';
import type { Observation, TokenBlock } from '../observe';

export interface Caps {
  lands: number;
  spirits: number;
  cards: number;
  options: number;
}

/** Padded sizes for a table of `players` Spirits. */
export function capsFor(players: number): Caps {
  return { lands: 9 * players, spirits: players, cards: 12 + 12 * players, options: 16 + 8 * players };
}

export interface FittedObservation extends Observation {
  /** tokens / options that did not fit (never seen by the network) */
  overflow: number;
}

function cut(b: TokenBlock, max: number, cw: number, nw: number): TokenBlock {
  if (b.n <= max) return b;
  return { n: max, cat: b.cat.subarray(0, max * cw), num: b.num.subarray(0, max * nw) };
}

const keep = (v: number, n: number) => (v >= 0 && v < n ? v : -1);

/** `o` cut to `caps`, with references to dropped tokens set to −1. Rows and references are otherwise untouched. */
export function fitObservation(o: Observation, caps: Caps): FittedObservation {
  const land = cut(o.land, caps.lands, LAND_CAT.length, LAND_NUM.length);
  const spirit = cut(o.spirit, caps.spirits, SPIRIT_CAT.length, SPIRIT_NUM.length);
  const card = cut(o.card, caps.cards, CARD_CAT.length, CARD_NUM.length);
  const option = cut(o.option, caps.options, OPTION_CAT.length, OPTION_NUM.length);
  const overflow = o.land.n - land.n + (o.spirit.n - spirit.n) + (o.card.n - card.n) + (o.option.n - option.n);
  // (the global and decision blocks always hold exactly one token: nothing to cut)
  if (!overflow) return { ...o, overflow: 0, decisionRef: refit(o.decisionRef, land.n, spirit.n, card.n) };
  const nl = land.n;
  let dist = o.dist;
  if (nl !== o.land.n) {
    dist = new Uint8Array(nl * nl);
    for (let r = 0; r < nl; r++) for (let c = 0; c < nl; c++) dist[r * nl + c] = o.dist[r * o.land.n + c];
  }
  const optionRef = new Int32Array(option.n * OPTION_REF.length);
  for (let r = 0; r < option.n; r++) {
    optionRef[r * 3] = keep(o.optionRef[r * 3], nl);
    optionRef[r * 3 + 1] = keep(o.optionRef[r * 3 + 1], card.n);
    optionRef[r * 3 + 2] = keep(o.optionRef[r * 3 + 2], spirit.n);
  }
  return {
    ...o,
    land, spirit, card, option, dist, optionRef,
    decisionRef: refit(o.decisionRef, nl, spirit.n, card.n),
    landIds: o.landIds.slice(0, nl),
    cardKeys: o.cardKeys.slice(0, card.n),
    overflow,
  };
}

function refit(ref: Int32Array, lands: number, spirits: number, cards: number): Int32Array {
  return Int32Array.from([keep(ref[0], lands), keep(ref[1], spirits), keep(ref[2], cards)]);
}
