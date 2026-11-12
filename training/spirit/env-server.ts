// stdio bridge from SpiritVecEnv to an out-of-process learner (Python).
// One JSON object per line in, one per line out, strictly request/response.
//
//   → {"cmd":"spec","players":1}
//   ← {"ok":true, obsVersion, shape:{lands,spirits,cards,options}, num:{…}, cat:{…}, refs:{…},
//      vocab:{…}, columns:{…}, maxDist}
//   → {"cmd":"reset","options":{numEnvs, seed, players, mix, fixed, maxSteps, maxPhaseSteps, shaping,
//      speedBonus, quota, teacher, driver, policyPath, probeShare, probeMix}}
//   → {"cmd":"step","actions":[optionIndex, …]}              (one per env)
//   ← {"ok":true,"n":…,"reward":[…],"done":[…],"episodes":[…],"binary":[[name, bytes], …]}
//     followed by those raw arrays, in that order (little-endian): f32 features, i16
//     categorical ids / refs / teacher, u8 masks / distances / active
//   → {"cmd":"configure","options":{mix?, teacher?, shaping?, speedBonus?, probeMix?, probeShare?}}  ← {"ok":true}
//   → {"cmd":"policyLogits","path":"<shipped policy .bin>"}
//   ← {"ok":true,"logits":[[…] | null, …]}   (the TS runtime's option logits per env; parity checks)
//   → {"cmd":"close"}
//   ← {"ok":false,"error":"…"}                               (on any failure)
//
// Nothing else is written to stdout; diagnostics go to stderr.

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { SpiritPolicy } from '../../src/engine/nn/runtime';
import { SpiritVecEnv, envSpec } from './vec-env';
import type { VecBatch, VecEnvOptions } from './vec-env';

/** The arrays of a batch reply, in wire order. */
export const BATCH_ARRAYS = [
  'active', 'probe', 'landNum', 'landCat', 'landMask', 'dist', 'spiritNum', 'spiritCat', 'spiritMask',
  'cardNum', 'cardCat', 'cardMask', 'globalNum', 'globalCat', 'decisionNum', 'decisionCat', 'decisionRef',
  'optionNum', 'optionCat', 'optionRef', 'optionMask', 'teacher',
] as const;

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function writeBatch(b: VecBatch): void {
  const arrays = BATCH_ARRAYS.map((k) => [k, b[k]] as const);
  const header = {
    ok: true,
    n: b.active.length,
    reward: Array.from(b.reward),
    done: Array.from(b.done),
    episodes: b.episodes,
    binary: arrays.map(([k, a]) => [k, a.byteLength]),
  };
  process.stdout.write(Buffer.concat([Buffer.from(JSON.stringify(header) + '\n'), ...arrays.map(([, a]) => bytes(a))]));
}

let env: SpiritVecEnv | null = null;

interface Request {
  cmd?: string;
  players?: number;
  options?: Partial<VecEnvOptions>;
  actions?: number[];
  path?: string;
}

function handle(msg: Request): object | VecBatch {
  switch (msg.cmd) {
    case 'spec':
      return { ok: true, ...envSpec(msg.players ?? 1) };
    case 'reset':
      env = new SpiritVecEnv(msg.options ?? {});
      return env.reset();
    case 'step':
      if (!env) throw new Error('step before reset');
      if (!Array.isArray(msg.actions)) throw new Error('step needs "actions": number[]');
      return env.step(msg.actions);
    case 'configure':
      if (!env) throw new Error('configure before reset');
      env.configure(msg.options ?? {});
      return { ok: true };
    case 'policyLogits': {
      if (!env) throw new Error('policyLogits before reset');
      if (!msg.path) throw new Error('policyLogits needs "path"');
      return { ok: true, logits: env.policyLogits(SpiritPolicy.parse(readFileSync(msg.path))) };
    }
    case 'close':
      process.exit(0);
    // eslint-disable-next-line no-fallthrough
    default:
      throw new Error(`unknown cmd ${JSON.stringify(msg.cmd)}`);
  }
}

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return;
  let reply: object | VecBatch;
  try {
    reply = handle(JSON.parse(line));
  } catch (e) {
    reply = { ok: false, error: (e as Error).stack ?? (e as Error).message };
  }
  if (reply && 'active' in reply) writeBatch(reply as VecBatch);
  else process.stdout.write(JSON.stringify(reply) + '\n');
});
