// Building a fresh GameState from a GameSetup, and the Setup steps that may need choices.

import { ADVERSARIES, adversaryLevel } from './adversary';
import { MAJOR_IDS, MINOR_IDS, uniquesOf } from './cardData';
import { choose } from './decide';
import type { Eff } from './decide';
import { FEAR_CARDS } from './fearCards';
import { buildIsland, setupPieces } from './island';
import { BLIGHT_CARD_INFO, addPieces, landName, log } from './ops';
import { makeRng, shuffled } from './rng';
import { SPIRITS } from './spiritData';
import { count, dahanCount, invaderCount, space } from './state';
import type { GameSetup, GameState, InvaderCard, Space, SpiritState } from './state';
import type { LandTerrain } from './types';

const STAGE1: InvaderCard[] = (['JUNGLE', 'MOUNTAIN', 'SANDS', 'WETLAND'] as LandTerrain[]).map((t) => ({
  id: `1-${t}`,
  stage: 1,
  terrains: [t],
  escalation: false,
}));
const STAGE2: InvaderCard[] = [
  ...(['JUNGLE', 'MOUNTAIN', 'SANDS', 'WETLAND'] as LandTerrain[]).map((t) => ({ id: `2-${t}`, stage: 2 as const, terrains: [t], escalation: true })),
  { id: '2-COASTAL', stage: 2, terrains: 'COASTAL', escalation: true },
];
const PAIRS: [LandTerrain, LandTerrain][] = [
  ['JUNGLE', 'MOUNTAIN'],
  ['JUNGLE', 'SANDS'],
  ['JUNGLE', 'WETLAND'],
  ['MOUNTAIN', 'SANDS'],
  ['MOUNTAIN', 'WETLAND'],
  ['SANDS', 'WETLAND'],
];
const STAGE3: InvaderCard[] = PAIRS.map((p) => ({ id: `3-${p.join('-')}`, stage: 3, terrains: p, escalation: false }));

export const ALL_INVADER_CARDS = [...STAGE1, ...STAGE2, ...STAGE3];

/** Invader Deck: 3 Stage I + 4 Stage II + 5 Stage III (or an adversary's order). */
export function buildInvaderDeck(gs: GameState): InvaderCard[] {
  const order = adversaryLevel(gs.setup.adversary, gs.setup.adversaryLevel).deckOrder ?? '111-2222-33333';
  const pools: Record<string, InvaderCard[]> = {
    '1': shuffled(gs.rng, STAGE1),
    '2': shuffled(gs.rng, STAGE2),
    '3': shuffled(gs.rng, STAGE3),
  };
  const deck: InvaderCard[] = [];
  for (const ch of order.replace(/-/g, '')) deck.push(pools[ch].shift()!);
  return deck;
}

export function matchesCard(sp: Space, c: InvaderCard): boolean {
  if (sp.num === 0) return false;
  if (c.terrains === 'COASTAL') return sp.coastal;
  return c.terrains.includes(sp.terrain as LandTerrain);
}

function freshSpirit(index: number, id: SpiritState['id']): SpiritState {
  const d = SPIRITS[id];
  return {
    index,
    id,
    name: d.name,
    color: d.color,
    energy: 0,
    energyRevealed: 0,
    cardRevealed: 0,
    destroyed: 0,
    hand: uniquesOf(id),
    discard: [],
    played: [],
    used: [],
    usedFast: [],
    anyChoices: [],
    bonusElements: {},
    bonusCardPlays: 0,
    slowAsFast: { lightningAir: 0, boon: 0 },
    usedSlowAsFast: 0,
    repeats: [],
    rangeBonus: 0,
    reclaimOneUsed: false,
    constancy: 0,
    entwined: [],
    drownedHealth: 0,
  };
}

/** Everything that needs no player choice. */
export function createState(setup: GameSetup): GameState {
  const n = setup.spirits.length;
  if (n < 1 || n > 4) throw new Error('Spirit Island supports 1–4 players');
  if (setup.boards.length !== n) throw new Error('One board per player');
  const island = buildIsland(setup.boards);
  const rng = makeRng(setup.seed);
  const spaces: Space[] = island.spaces.map((d) => {
    const { pieces, blight } = setupPieces(d.boardName, d.num);
    return { ...d, pieces: pieces.map((kind) => ({ kind, dmg: 0 })), blight, presence: new Array(n).fill(0), defend: 0, mods: {} };
  });
  const lvl = adversaryLevel(setup.adversary, setup.adversaryLevel);
  const englandResolve = setup.adversary === 'england' && setup.adversaryLevel >= 6;
  const gs: GameState = {
    setup,
    island,
    spaces,
    spaceIndex: Object.fromEntries(spaces.map((s, i) => [s.id, i])),
    spirits: setup.spirits.map((id, i) => freshSpirit(i, id)),
    rng,
    turn: 0,
    phase: 'SETUP',
    result: { kind: 'IN_PROGRESS' },
    difficulty: lvl.difficulty,
    invader: { deck: [], highImmigration: null, ravage: [], build: [], discard: [], lastExplored: [] },
    fear: {
      poolSize: (englandResolve ? 5 : 4) * n,
      generated: 0,
      deck: [],
      earned: [],
      discard: [],
      groups: lvl.fear,
      earnedTotal: 0,
      terrorLevel: 1,
      revealed: [],
    },
    blight: { card: '', flipped: false, onCard: 0 },
    minorDeck: [],
    minorDiscard: [],
    majorDeck: [],
    majorDiscard: [],
    turnFlags: { fearResolvedThisTurn: 0 },
    nextId: 1,
    log: [],
    activity: null,
    pending: [],
  };

  // Decks (fixed draw order from the seed).
  gs.invader.deck = buildInvaderDeck(gs);
  const fearCount = lvl.fear[0] + lvl.fear[1] + lvl.fear[2];
  gs.fear.deck = shuffled(gs.rng, FEAR_CARDS.map((c) => c.id)).slice(0, fearCount);
  const blights = shuffled(gs.rng, Object.keys(BLIGHT_CARD_INFO));
  gs.blight.card = blights[0];
  gs.blight.onCard = 2 * n + 1;
  gs.minorDeck = shuffled(gs.rng, MINOR_IDS);
  gs.majorDeck = shuffled(gs.rng, MAJOR_IDS);
  if (setup.adversary === 'england' && setup.adversaryLevel >= 3) gs.invader.highImmigration = [];

  log(gs, `Island of ${n} board${n > 1 ? 's' : ''} (${setup.boards.join(', ')}); ${ADVERSARIES[setup.adversary].name}${setup.adversary !== 'none' ? ` level ${setup.adversaryLevel}` : ''} (Difficulty ${lvl.difficulty}).`, 0);
  log(gs, `Fear Deck: ${fearCount} cards (${lvl.fear.join(' / ')}); Fear Pool ${gs.fear.poolSize}. Blight Card: Healthy Island with ${gs.blight.onCard} Blight.`, 0);
  return gs;
}

const boardLands = (gs: GameState, board: number) => gs.spaces.filter((s) => s.board === board && s.num > 0);
const landNum = (gs: GameState, board: number, num: number) => gs.spaces.find((s) => s.board === board && s.num === num)!;
const highest = (gs: GameState, board: number, t: LandTerrain) =>
  boardLands(gs, board).filter((s) => s.terrain === t).sort((a, b) => b.num - a.num)[0];

/** Adversary setup changes to the island (before Spirits place Presence). */
export function* adversarySetup(gs: GameState): Eff {
  const { adversary: adv, adversaryLevel: lvl } = gs.setup;
  gs.island.boards.forEach((_, b) => {
    if (adv === 'prussia' && lvl >= 1) addPieces(gs, landNum(gs, b, 3), 'town', 1, 'Fast Start');
    if (adv === 'england' && lvl >= 2) {
      addPieces(gs, landNum(gs, b, 1), 'city', 1, 'Criminals and Malcontents');
      addPieces(gs, landNum(gs, b, 2), 'town', 1, 'Criminals and Malcontents');
    }
    if (adv === 'sweden' && lvl >= 2) {
      const l4 = landNum(gs, b, 4);
      addPieces(gs, l4, 'city', 1, 'Population Pressure at Home');
      if (l4.blight > 0) {
        l4.blight--;
        landNum(gs, b, 5).blight++;
        log(gs, `Blight moved from ${l4.id} to land #5 (Population Pressure at Home)`);
      }
    }
    if (adv === 'sweden' && lvl >= 6) {
      const l8 = landNum(gs, b, 8);
      addPieces(gs, l8, 'town', 1, 'Prospecting Outpost');
      l8.blight++;
      log(gs, `+1 Blight (from the box) in ${l8.id} (Prospecting Outpost)`);
    }
  });
  if (adv === 'sweden' && lvl >= 4) {
    const card = gs.invader.deck.shift()!;
    gs.invader.discard.push(card);
    log(gs, `Royal Backing: discarded the top Invader Card (${card.terrains === 'COASTAL' ? 'Coastal' : card.terrains.join('/')})`);
    for (let b = 0; b < gs.island.boards.length; b++) {
      const cands = boardLands(gs, b).filter((s) => card.terrains !== 'COASTAL' && card.terrains.includes(s.terrain as LandTerrain));
      if (!cands.length) continue;
      const fewest = Math.min(...cands.map(invaderCount));
      const tied = cands.filter((s) => invaderCount(s) === fewest);
      const k = yield* choose(gs, -1, 'Royal Backing: add 1 Town to which land (fewest Invaders)?', tied.map((s) => ({ key: s.id, label: landName(s), space: s.id })), { source: 'Royal Backing' });
      addPieces(gs, space(gs, k), 'town', 1, 'Royal Backing');
    }
  }
}

/** Each Spirit's Setup instructions (starting Presence on its own board). */
export function* placeStartingPresence(gs: GameState, s: SpiritState): Eff {
  const b = s.index;
  const put = (sp: Space, n = 1) => {
    sp.presence[s.index] += n;
    log(gs, `${s.name}: ${n} starting Presence in ${landName(sp)}`);
  };
  const pick = function* (prompt: string, cands: Space[]): Eff<Space> {
    const k = yield* choose(gs, s.index, prompt, cands.map((c) => ({ key: c.id, label: landName(c), space: c.id })), { source: 'Setup' });
    return space(gs, k);
  };
  switch (s.id) {
    case 'lightning':
    case 'bringer':
      put(highest(gs, b, 'SANDS'), 2);
      break;
    case 'river':
      put(highest(gs, b, 'WETLAND'));
      break;
    case 'earth':
      put(highest(gs, b, 'MOUNTAIN'), 2);
      put(highest(gs, b, 'JUNGLE'));
      break;
    case 'shadows':
      put(highest(gs, b, 'JUNGLE'), 2);
      put(landNum(gs, b, 5));
      break;
    case 'thunderspeaker': {
      const ls = boardLands(gs, b);
      const most = (pool: Space[]) => pool.filter((x) => dahanCount(x) === Math.max(...pool.map(dahanCount)));
      const first = yield* pick('Thunderspeaker Setup: Presence in a land with the most Dahan', most(ls));
      put(first);
      const second = yield* pick('Thunderspeaker Setup: Presence in the land with the next-most Dahan', most(ls.filter((x) => x !== first)));
      put(second);
      break;
    }
    case 'green': {
      put(highest(gs, b, 'WETLAND'));
      const jungles = boardLands(gs, b).filter((x) => x.terrain === 'JUNGLE');
      const noDahan = jungles.filter((x) => count(x, 'dahan') === 0);
      put(noDahan.length === 1 ? noDahan[0] : yield* pick('Rampant Green Setup: Presence in a Jungle without Dahan', noDahan.length ? noDahan : jungles));
      break;
    }
    case 'ocean': {
      put(gs.spaces.find((x) => x.board === b && x.num === 0)!);
      put(yield* pick("Ocean's Hungry Grasp Setup: Presence in a Coastal land of your choice", boardLands(gs, b).filter((x) => x.coastal)));
      break;
    }
  }
}
