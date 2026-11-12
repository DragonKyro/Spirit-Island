import { describe, expect, it } from 'vitest';
import { makeRng, nextInt } from '../../src/engine/rng';
import type { GameSetup } from '../../src/engine/state';
import { SpiritVecEnv } from './vec-env';
import type { Episode, VecBatch, VecEnvOptions } from './vec-env';

/** Drive every env with uniformly random legal options until `episodes` games finish (or all go idle). */
function run(episodes: number, opts: Partial<VecEnvOptions> = {}, onBatch?: (b: VecBatch, env: SpiritVecEnv) => void) {
  const env = new SpiritVecEnv({ numEnvs: 6, seed: 3, ...opts });
  const O = env.shape.options;
  const r = makeRng(17);
  let batch = env.reset();
  const done: Episode[] = [...batch.episodes];
  let rows = 0;
  const t0 = performance.now();
  for (let steps = 0; done.length < episodes && steps < 20000; steps++) {
    onBatch?.(batch, env);
    if (batch.active.every((a) => !a)) break;
    const actions = Array.from(batch.active, (a, i) => {
      if (!a) return 0;
      const legal: number[] = [];
      for (let k = 0; k < O; k++) if (batch.optionMask[i * O + k]) legal.push(k);
      return legal[nextInt(r, legal.length)];
    });
    rows += batch.active.reduce((x, a) => x + a, 0);
    batch = env.step(actions);
    done.push(...batch.episodes);
  }
  return { env, done, rows, ms: performance.now() - t0 };
}

const won = (e: Episode) => e.result === 'VICTORY' || e.result === 'SACRIFICE_VICTORY';

describe('SpiritVecEnv', () => {
  it('random play: real choices only, well-formed rows, games end with ±1', () => {
    const { done, rows, ms } = run(12, {}, (b, env) => {
      const { lands: L, cards: C, options: O } = env.shape;
      b.active.forEach((a, i) => {
        if (!a) return;
        const legal = b.optionMask.subarray(i * O, (i + 1) * O).reduce((x, m) => x + m, 0);
        expect(legal).toBeGreaterThan(1);
        for (let k = 0; k < O * 3; k += 3) {
          const ref = b.optionRef.subarray(i * O * 3, (i + 1) * O * 3);
          expect(ref[k]).toBeLessThan(L);
          expect(ref[k + 1]).toBeLessThan(C);
        }
      });
      expect(b.landNum.every(Number.isFinite)).toBe(true);
      expect(b.cardNum.every(Number.isFinite)).toBe(true);
    });
    expect(done.length).toBeGreaterThanOrEqual(12);
    for (const e of done) {
      expect(['VICTORY', 'SACRIFICE_VICTORY', 'DEFEAT']).toContain(e.result);
      // no shaping: the reward is just the result (a win is worth more the sooner it comes)
      if (won(e)) expect(e.reward).toBeGreaterThanOrEqual(1);
      else expect(e.reward).toBe(-1);
      expect(e.invalid).toBe(0);
    }
    console.log(`random play: ${rows} decisions in ${ms.toFixed(0)} ms (${((rows / ms) * 1000).toFixed(0)}/s), ${done.length} games`);
  }, 120_000);

  it('shaping adds up to a constant per game: never more than its scale away from the result', () => {
    const { done } = run(10, { shaping: 0.3, seed: 5 });
    for (const e of done) {
      const result = won(e) ? 1 : -1;
      expect(Math.abs(e.reward - result)).toBeLessThanOrEqual(0.3 + 0.25 + 1e-6);
    }
  }, 120_000);

  it('labels rows with the heuristic\'s choice when the teacher is on', () => {
    let labelled = 0;
    let rows = 0;
    run(2, { teacher: 'quick', numEnvs: 3 }, (b, env) => {
      const O = env.shape.options;
      b.active.forEach((a, i) => {
        if (!a) return;
        rows++;
        const t = b.teacher[i];
        if (t >= 0) {
          labelled++;
          expect(b.optionMask[i * O + t]).toBe(1);
        }
      });
    });
    expect(labelled).toBeGreaterThan(0.95 * rows);
  }, 120_000);

  it('fixed setups: each env plays its share, then goes idle', () => {
    const fixed: GameSetup[] = [0, 1, 2, 3, 4].map((k) => ({
      v: 2, seed: 40 + k, spirits: [(['river', 'earth', 'shadows', 'green', 'bringer'] as const)[k]], boards: [(['A', 'B', 'C', 'D', 'A'] as const)[k]], adversary: 'none', adversaryLevel: 0,
    }));
    const { done } = run(99, { fixed, numEnvs: 2 });
    expect(done.map((e) => e.setup.seed).sort()).toEqual([40, 41, 42, 43, 44]);
    expect(done.map((e) => e.env).sort()).toEqual([0, 0, 0, 1, 1]);
  }, 120_000);

  it('the same seed and answers give the same games', () => {
    const a = run(4, { seed: 9, numEnvs: 2 }).done.map((e) => [e.setup, e.result, e.turn, e.decisions]);
    const b = run(4, { seed: 9, numEnvs: 2 }).done.map((e) => [e.setup, e.result, e.turn, e.decisions]);
    expect(b).toEqual(a);
  }, 120_000);

  it('the heuristic driver plays whole games itself (baselines)', () => {
    const fixed: GameSetup[] = [{ v: 2, seed: 7, spirits: ['lightning'], boards: ['B'], adversary: 'none', adversaryLevel: 0 }];
    const env = new SpiritVecEnv({ numEnvs: 1, fixed, driver: 'heuristic' });
    const b = env.reset();
    expect(b.active[0]).toBe(0);
    expect(b.episodes).toHaveLength(1);
    expect(['VICTORY', 'SACRIFICE_VICTORY', 'DEFEAT']).toContain(b.episodes[0].result);
    expect(b.episodes[0].decisions).toBe(0);
  }, 120_000);

  it('multiplayer tables: every Spirit is the learner, one team reward', () => {
    const { done } = run(3, { players: 2, numEnvs: 3, seed: 11 });
    for (const e of done) {
      expect(e.setup.spirits).toHaveLength(2);
      expect(new Set(e.setup.boards).size).toBe(2);
    }
  }, 120_000);

  it('probe games: drawn from probeMix, flagged on every row, reported as probes', () => {
    const probeMix = [{ spirit: 'ocean' as const, adversary: 'sweden' as const, level: 1, weight: 1 }];
    let flagged = 0;
    const { done } = run(16, { probeShare: 0.5, probeMix, seed: 21 }, (b) => b.active.forEach((a, i) => (flagged += a && b.probe[i] ? 1 : 0)));
    const probes = done.filter((e) => e.probe);
    expect(probes.length).toBeGreaterThan(2);
    expect(done.length - probes.length).toBeGreaterThan(2);
    for (const e of probes) expect([e.setup.spirits[0], e.setup.adversary, e.setup.adversaryLevel]).toEqual(['ocean', 'sweden', 1]);
    expect(flagged).toBeGreaterThan(0);
  }, 120_000);

  it('a game stuck in one phase is cut off as a loss', () => {
    const { done } = run(4, { maxPhaseSteps: 6, numEnvs: 2 });
    expect(done.length).toBeGreaterThan(0);
    for (const e of done) {
      expect(e.result).toBe('TRUNCATED');
      expect(e.reason).toMatch(/^stuck: 6 answers in one phase/);
      expect(e.reward).toBe(-1);
    }
  }, 120_000);
});
