import { describe, expect, it } from 'vitest';
import type { Eff } from '../../src/engine/decide';
import { GameOver } from '../../src/engine/decide';
import { applyAnswer, newGame } from '../../src/engine/game';
import { buildIsland } from '../../src/engine/island';
import { addBlight, addFear, damage } from '../../src/engine/ops';
import { build, explore, ravage } from '../../src/engine/phases';
import { createState } from '../../src/engine/setup';
import { SPIRITS, SPIRIT_ORDER } from '../../src/engine/spiritData';
import { count, dahanCount, presenceOnIsland, space } from '../../src/engine/state';
import type { GameSetup, GameState, InvaderCard } from '../../src/engine/state';
import type { PieceKind } from '../../src/engine/types';

const solo = (over: Partial<GameSetup> = {}): GameSetup => ({ v: 2, seed: 1, spirits: ['river'], boards: ['A'], adversary: 'none', adversaryLevel: 0, ...over });

/** Run an engine generator to completion, answering each decision with the first (or a chosen) option. */
function run<T>(gen: Eff<T>, pick: (labels: string[]) => number = () => 0): T {
  let r = gen.next();
  while (!r.done) {
    const d = r.value[0];
    r = gen.next({ d: d.id, k: d.options[pick(d.options.map((o) => o.label))].key });
  }
  return r.value;
}

/** An in-play state with an empty board A (no pieces), for isolated rule checks. */
function blank(): GameState {
  const gs = createState(solo());
  for (const sp of gs.spaces) {
    sp.pieces = [];
    sp.blight = 0;
  }
  gs.phase = 'SETUP'; // suspends win/loss checks for isolated rule tests
  space(gs, 'A5').presence[0] = 2;
  return gs;
}
const put = (gs: GameState, id: string, ...kinds: PieceKind[]) => kinds.forEach((kind) => space(gs, id).pieces.push({ kind, dmg: 0 }));
const card = (t: InvaderCard['terrains']): InvaderCard => ({ id: 'x', stage: 1, terrains: t, escalation: false });

describe('island boards', () => {
  it('board A adjacency and coastal lands match the physical board', () => {
    const isl = buildIsland(['A']);
    const a = (id: string) => isl.spaces.find((s) => s.id === id)!;
    expect(a('A1').adj).toEqual(['A0', 'A2', 'A4', 'A5', 'A6']);
    expect(a('A5').adj).toEqual(['A1', 'A4', 'A6', 'A7', 'A8']);
    expect(isl.spaces.filter((s) => s.coastal).map((s) => s.id)).toEqual(['A1', 'A2', 'A3']);
    expect(a('A1').terrain).toBe('MOUNTAIN');
    expect(a('A8').terrain).toBe('JUNGLE');
  });
  it('every board has 2 of each terrain and lands 1-3 coastal', () => {
    for (const b of ['A', 'B', 'C', 'D'] as const) {
      const isl = buildIsland([b]);
      const lands = isl.spaces.filter((s) => s.num > 0);
      for (const t of ['JUNGLE', 'MOUNTAIN', 'SANDS', 'WETLAND']) expect(lands.filter((s) => s.terrain === t).length).toBe(2);
      expect(lands.filter((s) => s.coastal).map((s) => s.num)).toEqual([1, 2, 3]);
      expect(isl.spaces.reduce((n, s) => n + s.adj.length, 0) % 2).toBe(0);
    }
  });
  it('multi-board islands connect boards symmetrically', () => {
    for (const boards of [['A', 'B'], ['A', 'B', 'C'], ['A', 'B', 'C', 'D']] as const) {
      const isl = buildIsland([...boards]);
      const byId = new Map(isl.spaces.map((s) => [s.id, s]));
      for (const s of isl.spaces) for (const n of s.adj) expect(byId.get(n)!.adj).toContain(s.id);
      // every board touches at least one other board
      for (const b of boards) {
        const cross = isl.spaces.filter((s) => s.boardName === b).some((s) => s.adj.some((n) => !n.startsWith(b)));
        expect(cross).toBe(true);
      }
      // oceans never join other boards
      for (const s of isl.spaces.filter((x) => x.num === 0)) expect(s.adj.every((n) => n.startsWith(s.boardName))).toBe(true);
    }
  });
});

describe('setup', () => {
  it('every Spirit has 13 Presence in total (tracks + starting)', () => {
    for (const sid of SPIRIT_ORDER) {
      const g = newGame(solo({ spirits: [sid], boards: ['A'] }));
      // answer any setup choices
      while (g.gs.phase !== 'SPIRIT' && g.gs.pending.length) applyAnswer(g, { d: g.gs.pending[0].id, k: g.gs.pending[0].options[0].key });
      const d = SPIRITS[sid];
      const onTracks = d.energyTrack.length - 1 + d.cardTrack.length - 1;
      expect(onTracks + presenceOnIsland(g.gs, 0), sid).toBe(13);
    }
  });
  it('starting pieces of board A, and starting Presence placements', () => {
    const g = newGame(solo({ spirits: ['lightning'] }));
    const gs = g.gs;
    expect(count(space(gs, 'A2'), 'city')).toBe(1);
    expect(count(space(gs, 'A8'), 'town')).toBe(1);
    expect(space(gs, 'A4').blight).toBe(1);
    expect(gs.spaces.reduce((n, s) => n + dahanCount(s), 0)).toBe(6);
    expect(space(gs, 'A7').presence[0]).toBe(2); // highest-numbered Sands
  });
  it('decks: 3/4/5 Invader cards, 9 Fear cards, Healthy Island 2 per player + 1, uniques in hand', () => {
    const gs = createState(solo({ spirits: ['shadows', 'earth'], boards: ['A', 'B'] }));
    expect(gs.invader.deck.map((c) => c.stage).join('')).toBe('111222233333');
    expect(gs.fear.deck.length).toBe(9);
    expect(gs.fear.poolSize).toBe(8);
    expect(gs.blight.onCard).toBe(5);
    expect(gs.spirits[0].hand.length).toBe(4);
  });
  it('Brandenburg-Prussia reorders the Invader Deck; England / Sweden change setup', () => {
    expect(createState(solo({ adversary: 'prussia', adversaryLevel: 6 })).invader.deck.map((c) => c.stage).join('')).toBe('32223333');
    expect(createState(solo({ adversary: 'prussia', adversaryLevel: 2 })).invader.deck.map((c) => c.stage).join('')).toBe('111322223333');
    const eng = newGame(solo({ adversary: 'england', adversaryLevel: 2 }));
    expect(count(space(eng.gs, 'A1'), 'city')).toBe(1);
    expect(count(space(eng.gs, 'A2'), 'town')).toBe(1);
    expect(eng.gs.fear.deck.length).toBe(11);
    const swe = newGame(solo({ adversary: 'sweden', adversaryLevel: 2 }));
    expect(count(space(swe.gs, 'A4'), 'city')).toBe(1);
    expect(space(swe.gs, 'A4').blight).toBe(0);
    expect(space(swe.gs, 'A5').blight).toBe(1);
  });
});

describe('invader actions', () => {
  it('Explore: only lands with or next to Town/City, or Coastal', () => {
    const gs = blank();
    put(gs, 'A8', 'town'); // A8 (Jungle) is a source; A3 (Jungle) is coastal
    run(explore(gs, card(['JUNGLE'])));
    expect(count(space(gs, 'A8'), 'explorer')).toBe(1);
    expect(count(space(gs, 'A3'), 'explorer')).toBe(1);
    const gs2 = blank();
    run(explore(gs2, card(['SANDS']))); // A4 / A7 inland, no towns anywhere
    expect(count(space(gs2, 'A4'), 'explorer') + count(space(gs2, 'A7'), 'explorer')).toBe(0);
  });
  it('Build: City if more Towns than Cities, else Town; never in empty lands', () => {
    const gs = blank();
    put(gs, 'A6', 'town');
    put(gs, 'A1', 'explorer');
    run(build(gs, space(gs, 'A6'), true));
    run(build(gs, space(gs, 'A1'), true));
    run(build(gs, space(gs, 'A2'), true));
    expect(count(space(gs, 'A6'), 'city')).toBe(1);
    expect(count(space(gs, 'A1'), 'town')).toBe(1);
    expect(space(gs, 'A2').pieces.length).toBe(0);
  });
  it('Ravage: 2+ Damage adds 1 Blight, Dahan die efficiently, survivors fight back', () => {
    const gs = blank();
    put(gs, 'A6', 'town', 'explorer', 'dahan', 'dahan'); // 3 damage: blight, 1 dahan destroyed, 1 damaged
    gs.blight.onCard = 10;
    run(ravage(gs, space(gs, 'A6')));
    const sp = space(gs, 'A6');
    expect(sp.blight).toBe(1);
    expect(dahanCount(sp)).toBe(1);
    // surviving Dahan deals 2 damage: kills the explorer and... first option assigns to first group
    expect(sp.pieces.filter((p) => p.kind !== 'dahan').length).toBeLessThan(2);
  });
  it('Defend reduces Ravage damage; below 2 no Blight', () => {
    const gs = blank();
    put(gs, 'A6', 'town');
    space(gs, 'A6').defend = 1;
    run(ravage(gs, space(gs, 'A6')));
    expect(space(gs, 'A6').blight).toBe(0);
  });
  it('Blight Cascades into an adjacent land and destroys Presence', () => {
    const gs = blank();
    gs.blight.onCard = 10;
    const a6 = space(gs, 'A6');
    a6.blight = 1;
    a6.presence[0] = 1;
    run(addBlight(gs, a6));
    expect(a6.blight).toBe(2);
    expect(a6.presence[0]).toBe(0);
    const cascaded = a6.adj.map((id) => space(gs, id)).filter((s) => s.blight > 0);
    expect(cascaded.length).toBe(1);
    expect(gs.blight.onCard).toBe(8);
  });
  it('the Blight Card flips to Blighted Island, and losing its last Blight is a defeat', () => {
    const gs = blank();
    gs.blight.onCard = 1;
    run(addBlight(gs, space(gs, 'A1')));
    expect(gs.blight.flipped).toBe(true);
    expect(gs.blight.onCard).toBeGreaterThanOrEqual(4);
    gs.blight.onCard = 1;
    gs.phase = 'INVADER';
    put(gs, 'A3', 'city');
    expect(() => run(addBlight(gs, space(gs, 'A2')))).toThrow(GameOver);
  });
});

describe('fear', () => {
  it('earning Fear Cards raises the Terror Level at the dividers', () => {
    const gs = blank();
    put(gs, 'A1', 'city'); // keep the game from being won
    addFear(gs, 4 * 3);
    expect(gs.fear.earned.length).toBe(3);
    expect(gs.fear.terrorLevel).toBe(2);
    addFear(gs, 4 * 3);
    expect(gs.fear.terrorLevel).toBe(3);
  });
  it('destroying a Town / City generates 1 / 2 Fear', () => {
    const gs = blank();
    put(gs, 'A1', 'city', 'town', 'explorer');
    run(damage(null, gs, space(gs, 'A1'), 5, { owner: 0 }), (labels) => Math.max(0, labels.findIndex((l) => !l.includes('Explorer'))));
    expect(gs.fear.generated).toBe(3);
  });
});

describe('review fixes', () => {
  it('only Spirit Powers may Push into an in-play Ocean', async () => {
    const { pushDestinations } = await import('../../src/engine/ops');
    const gs = createState(solo({ spirits: ['ocean'] }));
    space(gs, 'A0').presence[0] = 1; // Ocean's Presence puts the Ocean in play
    const a1 = space(gs, 'A1');
    expect(pushDestinations(gs, a1, true).map((s) => s.id)).toContain('A0');
    expect(pushDestinations(gs, a1, false).map((s) => s.id)).not.toContain('A0');
  });
  it('a repeated Powerstorm grants no further Repeats', async () => {
    const { CARD_EFFECTS } = await import('../../src/engine/cards');
    const gs = blank();
    const s = gs.spirits[0];
    const base = { gs, self: s, source: 'Powerstorm', power: { id: 'powerstorm', kind: 'card' as const }, targetSpirit: s };
    run(CARD_EFFECTS.powerstorm({ ...base }, {}));
    expect(s.repeats.length).toBe(1);
    run(CARD_EFFECTS.powerstorm({ ...base, isRepeat: true }, {}));
    expect(s.repeats.length).toBe(1);
    expect(s.energy).toBe(6);
  });
  it('Poisoned Land deals its Damage before adding Blight (a lethal hit wins, not loses)', async () => {
    const { CARD_EFFECTS } = await import('../../src/engine/cards');
    const gs = blank();
    gs.phase = 'SLOW';
    gs.blight.flipped = true;
    gs.blight.onCard = 1; // the Blight would be the last one
    put(gs, 'A6', 'city', 'town');
    const ctx = { gs, self: gs.spirits[0], source: 'Poisoned Land', power: { id: 'poisoned-land', kind: 'card' as const }, target: space(gs, 'A6') };
    try {
      run(CARD_EFFECTS['poisoned-land'](ctx, {}));
      throw new Error('expected the game to end');
    } catch (e) {
      expect(e).toBeInstanceOf(GameOver);
      expect((e as GameOver).result.kind).toBe('VICTORY');
    }
  });
  it('Massive Flooding can be resolved at a lower threshold', async () => {
    const { INNATE_EFFECTS } = await import('../../src/engine/innates');
    const gs = blank();
    put(gs, 'A6', 'explorer', 'explorer', 'town');
    const ctx = { gs, self: gs.spirits[0], source: 'Massive Flooding', power: { id: 'massive-flooding', kind: 'innate' as const }, target: space(gs, 'A6') };
    const gen = INNATE_EFFECTS['massive-flooding'](ctx, [0, 1, 2], {});
    const first = gen.next();
    expect(first.done).toBe(false);
    const d = (first.value as { options: { key: string }[] }[])[0];
    expect(d.options.map((o) => o.key)).toEqual(['2', '1', '0']);
  });
});

describe('power menu', () => {
  it('only lists Powers that have a legal target', async () => {
    const { availablePowers } = await import('../../src/engine/phases');
    const gs = blank();
    const s = gs.spirits[0];
    s.played = ['shatter-homesteads']; // Range 2 from a Sacred Site
    s.cardRevealed = 0;
    // River's only Presence: a single one in Mountain A1 (not a Sacred Site, not a Wetland)
    space(gs, 'A5').presence[0] = 0;
    space(gs, 'A1').presence[0] = 1;
    expect(availablePowers(gs, s, 'SLOW').map((p) => p.key)).not.toContain('card:shatter-homesteads');
    space(gs, 'A1').presence[0] = 2;
    expect(availablePowers(gs, s, 'SLOW').map((p) => p.key)).toContain('card:shatter-homesteads');
  });
});

describe('targeting Powers (no cancel)', () => {
  it('a chosen Power is targeted and resolved: target prompts offer no way out, and it is not offered again', () => {
    for (const sid of SPIRIT_ORDER) {
      const g = newGame(solo({ spirits: [sid], seed: 3 }), { quiet: true });
      let targets = 0;
      let menus = 0;
      let last: { owner: number; key: string; when: string } | null = null;
      for (let steps = 0; g.gs.result.kind === 'IN_PROGRESS' && steps < 3000; steps++) {
        const d = g.gs.pending[0];
        const when = `${g.gs.turn}:${g.gs.phase}`;
        if ((d.kind === 'targetLand' || d.kind === 'targetSpirit') && !/\(Repeat\)/.test(d.prompt)) {
          targets++;
          expect(d.options.every((o) => !o.done), d.prompt).toBe(true);
        }
        if (d.menu === 'power') {
          menus++;
          // the Power chosen last time was used: it is not offered again this phase (it was with "cancel")
          if (last && last.owner === d.owner && last.when === when && !last.key.startsWith('repeat:')) {
            expect(d.options.some((o) => o.key === last!.key), `${sid}: ${last.key} offered again`).toBe(false);
          }
          const p = d.options.find((o) => !o.done);
          last = p ? { owner: d.owner, key: p.key, when } : null;
        }
        applyAnswer(g, { d: d.id, k: (d.options.find((o) => !o.done) ?? d.options[0]).key });
      }
      expect(menus, sid).toBeGreaterThan(0);
      expect(targets + menus, sid).toBeGreaterThan(1);
    }
  }, 60_000);

  it('no phase can go on forever: random play never needs more than 250 answers in one phase', async () => {
    const { playRandomly, sampleSetups } = await import('./play');
    let worst = 0;
    for (const setup of sampleSetups()) {
      for (const seed of [1, 2, 3]) {
        const g = newGame({ ...setup, seed: setup.seed + seed }, { quiet: true });
        let mark = '';
        let since = 0;
        playRandomly(g, seed, (game) => {
          const m = `${game.gs.turn}:${game.gs.phase}`;
          since = m === mark ? since + 1 : 0;
          mark = m;
          worst = Math.max(worst, since);
        }, 20000);
        expect(g.gs.result.kind).not.toBe('IN_PROGRESS');
      }
    }
    expect(worst).toBeLessThan(250);
  }, 120_000);

  it('Reclaim One from the card-play menu is used once it is chosen: no None to come back from', () => {
    const g = newGame(solo({ spirits: ['river'], seed: 11 }), { quiet: true });
    const s = g.gs.spirits[0];
    let ready = false;
    for (let steps = 0; steps < 200; steps++) {
      const d = g.gs.pending[0];
      if (!ready && d.menu === 'growth') {
        // River's card track: 1, 2, 2, 3, Reclaim One, … — reveal it, put a card in the discard,
        // and grow without Reclaim All (River's first option), which would empty the discard again
        s.cardRevealed = 4;
        s.discard.push(s.hand.pop()!);
        ready = true;
        applyAnswer(g, { d: d.id, k: '1' });
        continue;
      }
      if (d.menu === 'play' && d.options.some((o) => o.key === 'reclaim')) {
        applyAnswer(g, { d: d.id, k: 'reclaim' });
        const q = g.gs.pending[0];
        // the prompt has only cards (with one card in the discard it resolves by itself)
        if (q.kind === 'cardReclaim') {
          expect(q.options.every((o) => !o.done)).toBe(true);
          applyAnswer(g, { d: q.id, k: q.options[0].key });
        }
        const back = g.gs.pending.find((x) => x.menu === 'play');
        expect(back).toBeTruthy();
        expect(back!.options.some((o) => o.key === 'reclaim')).toBe(false);
        expect(s.discard).toHaveLength(0);
        return;
      }
      applyAnswer(g, { d: d.id, k: (d.options.find((o) => !o.done) ?? d.options[0]).key });
    }
    throw new Error('River was never offered Reclaim One');
  });
});
