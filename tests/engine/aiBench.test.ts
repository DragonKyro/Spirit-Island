// Opt-in AI strength benchmark: AI_BENCH=1 npx vitest run tests/engine/aiBench.test.ts
import { describe, expect, it } from 'vitest';
import { DEEP, SPIRIT_W, W, aiChoose } from '../../src/engine/ai';
import { applyAnswer, newGame } from '../../src/engine/game';
import type { AdversaryId } from '../../src/engine/types';
import type { SpiritId } from '../../src/engine/types';

describe.skipIf(!process.env.AI_BENCH)('AI benchmark (solo, no adversary)', () => {
  it('plays full games and reports the win rate', () => {
    // AI_W='{"blight":8}' overrides evaluation weights for tuning
    if (process.env.AI_W) Object.assign(W, JSON.parse(process.env.AI_W));
    // AI_SW='{"ocean":{"oceanPresence":1}}' overrides per-Spirit weights
    if (process.env.AI_SW) Object.assign(SPIRIT_W, JSON.parse(process.env.AI_SW));
    if (process.env.AI_DEEP === '0') DEEP.targets = false;
    if (process.env.AI_DEEP_ALL === '0') DEEP.all = false;
    if (process.env.AI_HORIZON) DEEP.horizon = Number(process.env.AI_HORIZON);
    if (process.env.AI_SAMPLES) DEEP.samples = Number(process.env.AI_SAMPLES);
    const rows: string[] = [];
    const t0 = performance.now();
    let wins = 0;
    let games = 0;
    const all = ['river', 'lightning', 'earth', 'shadows', 'thunderspeaker', 'green', 'ocean', 'bringer'] as SpiritId[];
    for (const sid of process.env.AI_SPIRITS ? (process.env.AI_SPIRITS.split(',') as SpiritId[]) : all) {
      for (let seed = 1; seed <= Number(process.env.AI_SEEDS ?? 5); seed++) {
        const adv = (process.env.AI_ADV ?? 'none') as AdversaryId;
        const g = newGame({ v: 2, seed: seed * 101, spirits: [sid], boards: [(['A', 'B', 'C', 'D'] as const)[seed % 4]], adversary: adv, adversaryLevel: adv === 'none' ? 0 : Number(process.env.AI_LVL ?? 1) });
        let steps = 0;
        while (g.gs.result.kind === 'IN_PROGRESS' && steps < 6000) {
          const d = g.gs.pending[0];
          applyAnswer(g, { d: d.id, k: aiChoose(g, d) });
          steps++;
        }
        expect(g.gs.result.kind).not.toBe('IN_PROGRESS');
        games++;
        if (g.gs.result.kind !== 'DEFEAT') wins++;
        rows.push(`${sid.padEnd(15)} seed ${seed}: turn ${g.gs.turn} ${g.gs.result.kind} ${'reason' in g.gs.result ? g.gs.result.reason.slice(0, 40) : ''}`);
      }
    }
    console.log(`${rows.join('\n')}\nwins ${wins}/${games} in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  }, 3600000);
});
