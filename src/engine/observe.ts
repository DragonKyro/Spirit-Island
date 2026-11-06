// The neural AI's view of a decision: a set of tokens (one per space, Spirit, card,
// plus a global, a decision and one per option) built from public information only.
// Deck orders, removed and face-down cards, the unflipped Blight Card and the RNG
// never reach it (tests check that observations don't change when determinize()
// re-deals the hidden parts).
//
// Each token block has categorical columns (`cat`, indices for embeddings; 0 means
// none / unknown) and numeric columns (`num`, scaled to about [0, 1] in normal play and
// clamped to [0, NUM_MAX] when random play piles pieces up). Column names are
// exported (`*_CAT`, `*_NUM`), so a trainer can read the layout. Bump OBS_VERSION
// whenever the layout or a vocabulary changes.

import { ADVERSARY_ORDER } from './adversary';
import { CARDS, CARD_LIST } from './cardData';
import type { LandFilter } from './cardData';
import { DECISION_KINDS } from './decide';
import type { Decision, Option } from './decide';
import { FEAR_CARDS } from './fearCards';
import { unseenInvaderCards } from './hidden';
import { BLIGHT_CARD_INFO, cardPlays, distancesFrom, elementsOf, energyIncome, presenceLands } from './ops';
import { matchesCard } from './setup';
import { INNATES, SPIRITS, SPIRIT_ORDER } from './spiritData';
import type { GrowthItem } from './spiritData';
import { count, isSacredSite, meetsThreshold, presenceOf } from './state';
import type { GameState, InvaderCard, Space, SpiritState, TrackSlot } from './state';
import { ELEMENTS, LAND_TERRAINS } from './types';
import type { Element, PieceKind, Terrain } from './types';

export const OBS_VERSION = 1;

// ─── Vocabularies (index 0 = none / unknown) ──────────────────────────────────

const TERRAINS: Terrain[] = [...LAND_TERRAINS, 'OCEAN'];
const PIECES: PieceKind[] = ['explorer', 'town', 'city', 'dahan'];
/** Power Cards, then Innate Powers */
export const POWER_VOCAB: string[] = ['', ...CARD_LIST.map((c) => `card:${c.id}`), ...Object.keys(INNATES).map((id) => `innate:${id}`)];
const RULE_SOURCES = [
  'rule:growth', 'rule:play-cards', 'rule:setup', 'rule:blight-cascade', 'rule:choke-the-land-with-green',
  'rule:ally-of-the-dahan', 'rule:mining-rush', 'rule:land-rush', 'rule:building-boom', 'rule:royal-backing',
];
const BLIGHT_IDS = Object.keys(BLIGHT_CARD_INFO).sort();
/** what asked for a decision (Decision.sourceId) */
export const SOURCE_VOCAB: string[] = [...POWER_VOCAB, ...FEAR_CARDS.map((c) => `fear:${c.id}`), ...BLIGHT_IDS.map((id) => `blight:${id}`), ...RULE_SOURCES];
export const OPTION_CLASSES = [
  'other', 'land', 'piece', 'card', 'element', 'spirit', 'done', 'cancel', 'yes', 'no', 'minor', 'major',
  'energyTrack', 'cardTrack', 'destroyedPresence', 'movePresence', 'play', 'reclaim', 'resolveCard', 'resolveInnate',
  'repeat', 'growth', 'index', 'ok',
] as const;
const ZONES = ['', 'hand', 'played', 'discard', 'offered', 'innate'] as const;
const PHASES = ['', 'SETUP', 'SPIRIT', 'FAST', 'INVADER', 'SLOW', 'TIME_PASSES', 'GAME_OVER'];
const FILTERS: LandFilter['t'][] = ['any', 'coastal', 'inland', 'terrain', 'invaders', 'noInvaders', 'dahan', 'blight', 'noBlight'];

const POWER_INDEX = new Map(POWER_VOCAB.map((k, i) => [k, i]));
const SOURCE_INDEX = new Map(SOURCE_VOCAB.map((k, i) => [k, i]));

// ─── Layout ───────────────────────────────────────────────────────────────────

export const LAND_CAT = ['terrain', 'landNumber'] as const;
export const LAND_NUM = [
  'coastal', 'explorer', 'town', 'city', 'dahan', 'townDmg', 'cityDmg', 'dahanDmg', 'blight',
  'myPresence', 'otherPresence', 'mySacredSite', 'otherSacredSite', 'defend',
  'skipAll', 'skipRavage', 'skipBuild', 'skipExplore', 'dahanSafe', 'dahanSimultaneous', 'dahanBonusHealth', 'dahanImmune',
  'blightStaysOnCard', 'dreadApparitions', 'vengeance',
  'ravageHere', 'buildHere', 'highImmigrationHere', 'exploredThisPhase', 'nextExploreChance',
  'distMyPresence', 'distMySacredSite', 'adjTownCity', 'focus', 'about',
] as const;
export const SPIRIT_CAT = ['spirit'] as const;
const TRACK_NUM = (t: string) => [`${t}Energy`, `${t}Plays`, ...ELEMENTS.map((e) => `${t}${e}`), `${t}Any`, `${t}ReclaimOne`, `${t}End`];
export const SPIRIT_NUM = [
  'isMe', 'decides', 'energy', 'income', 'cardPlays', 'energyRevealed', 'cardRevealed', 'presenceOnIsland', 'destroyed',
  ...ELEMENTS.map((e) => `el${e}`),
  ...[0, 1].flatMap((i) => [0, 1, 2, 3].map((t) => `innate${i}Tier${t}`)),
  ...TRACK_NUM('nextE'), ...TRACK_NUM('nextC'),
  'hand', 'discard', 'played', 'used', 'bonusCardPlays', 'slowAsFast', 'usedSlowAsFast', 'repeats', 'rangeBonus',
  'reclaimOneUsed', 'constancy', 'entwined', 'drownedHealth', 'anyChoices',
] as const;
export const CARD_CAT = ['power', 'zone'] as const;
export const CARD_NUM = [
  'mine', 'cost', 'fast', ...ELEMENTS.map((e) => `el${e}`), 'unique', 'minor', 'major', 'innate',
  'range', 'rangeSacred', 'targetsSpirit', ...FILTERS.map((f) => `filter_${f}`), 'affordable', 'usedThisTurn', 'tiersMet',
] as const;
export const GLOBAL_CAT = ['adversary', 'level', 'blightCard', 'phase'] as const;
const CARD_SLOT = (t: string) => [...LAND_TERRAINS.map((x) => `${t}${x}`), `${t}COASTAL`, `${t}Has`];
export const GLOBAL_NUM = [
  'turn', 'players', 'difficulty',
  'fearPool', 'fearGenerated', 'fearEarned', 'fearEarnedTotal', 'tl1', 'tl2', 'tl3', 'toTL2', 'toTL3', 'fearDeck', 'fearRevealed',
  'blightOnCard', 'blightFlipped', 'blightOnIsland',
  'deck', 'deckStage1', 'deckStage2', 'deckStage3', 'nextStage1', 'nextStage2', 'nextStage3',
  ...CARD_SLOT('ravage'), ...CARD_SLOT('build'), ...CARD_SLOT('highImmigration'), ...CARD_SLOT('explored'), 'invaderDiscard',
  'avoidDahan', 'overseasTrade', 'tradeSuffers', 'fearResolvedThisTurn', 'minorDeck', 'majorDeck',
] as const;
export const DECISION_CAT = ['kind', 'source', 'aboutPiece'] as const;
export const DECISION_NUM = ['anyPlayer', 'aboutN', 'aboutMax', 'options', 'hasDone'] as const;
export const OPTION_CAT = ['class', 'piece', 'element'] as const;
export const OPTION_NUM = [
  'done', 'dmg', 'position', 'value',
  'gPresence', 'gRange', 'gGainCard', 'gReclaimAll', 'gReclaimOne', 'gEnergy', 'gCardPlay', 'gOcean',
] as const;
/** references from an option to other tokens (row index in that block, -1 = none) */
export const OPTION_REF = ['land', 'card', 'spirit'] as const;
export const DECISION_REF = ['aboutLand', 'owner', 'sourceCard'] as const;
/** distances between land tokens are capped here (unreachable counts as this too) */
export const MAX_DIST = 7;
/** numeric features are clamped to [0, NUM_MAX] */
export const NUM_MAX = 3;

export interface TokenBlock {
  n: number;
  /** n × catWidth, row-major */
  cat: Int32Array;
  /** n × numWidth, row-major */
  num: Float32Array;
}

export interface Observation {
  version: number;
  /** one per space (lands and Oceans), in GameState.spaces order */
  land: TokenBlock;
  /** one per Spirit, in seat order */
  spirit: TokenBlock;
  /** every Power Card in a hand / play area / discard or on offer, and every Innate Power */
  card: TokenBlock;
  global: TokenBlock;
  decision: TokenBlock;
  option: TokenBlock;
  optionRef: Int32Array;
  decisionRef: Int32Array;
  /** land × land hop distances, capped at MAX_DIST */
  dist: Uint8Array;
  /** row ids, to map tokens back (space ids; power keys like `card:<id>`) */
  landIds: string[];
  cardKeys: string[];
}

/** column name → index, per layout (looked up on every write, so built once) */
const COLUMNS = new WeakMap<readonly string[], Map<string, number>>();

class Block {
  readonly cat: Int32Array;
  readonly num: Float32Array;
  private readonly cols: Map<string, number>;
  constructor(readonly n: number, private readonly cw: number, private readonly nw: number, names: readonly string[]) {
    this.cat = new Int32Array(n * cw);
    this.num = new Float32Array(n * nw);
    let cols = COLUMNS.get(names);
    if (!cols) COLUMNS.set(names, (cols = new Map(names.map((k, i) => [k, i]))));
    this.cols = cols;
  }
  setCat(row: number, col: number, v: number): void {
    this.cat[row * this.cw + col] = v;
  }
  /** set numeric column `name` of `row` */
  set(row: number, name: string, v: number): void {
    const col = this.cols.get(name);
    if (col === undefined) throw new Error(`observe: no column ${name}`);
    this.num[row * this.nw + col] = Number.isFinite(v) ? Math.min(NUM_MAX, Math.max(0, v)) : 0;
  }
  done(): TokenBlock {
    return { n: this.n, cat: this.cat, num: this.num };
  }
}

const block = (n: number, cat: readonly string[], num: readonly string[]) => new Block(n, cat.length, num.length, num);
const flag = (b: unknown) => (b ? 1 : 0);

// ─── Pieces of the encoding ───────────────────────────────────────────────────

/** Terrains and Coastal matched by an Invader Card, in CARD_SLOT order. */
function cardMask(cards: InvaderCard[]): number[] {
  const m = [0, 0, 0, 0, 0, cards.length ? 1 : 0];
  for (const c of cards) {
    if (c.terrains === 'COASTAL') m[4] = 1;
    else for (const t of c.terrains) m[LAND_TERRAINS.indexOf(t)] = 1;
  }
  return m;
}

function trackFeatures(prefix: string, slot: TrackSlot | undefined): [string, number][] {
  if (!slot) return [[`${prefix}End`, 1]];
  return [
    [`${prefix}Energy`, (slot.energy ?? 0) / 5],
    [`${prefix}Plays`, (slot.plays ?? 0) / 4],
    ...(slot.element ? [[`${prefix}${slot.element}`, 1] as [string, number]] : []),
    [`${prefix}Any`, flag(slot.any)],
    [`${prefix}ReclaimOne`, flag(slot.reclaimOne)],
  ];
}

function optionClass(o: Option, dec: Decision): (typeof OPTION_CLASSES)[number] {
  const k = o.key;
  if (dec.kind === 'yesNo') return k === 'yes' ? 'yes' : 'no';
  if (k === 'cancel') return 'cancel';
  if (o.done || k === 'done' || k === 'none') return 'done';
  if (dec.kind === 'growth') return 'growth';
  if (k === 'minor' || k === 'major') return k;
  if (dec.kind === 'presenceTrack') {
    if (k === 'energy') return 'energyTrack';
    if (k === 'card') return 'cardTrack';
    if (k === 'destroyed') return 'destroyedPresence';
    if (k.startsWith('move:')) return 'movePresence';
  }
  if (k.startsWith('play:')) return 'play';
  if (k === 'reclaim') return 'reclaim';
  if (k.startsWith('card:')) return 'resolveCard';
  if (k.startsWith('innate:')) return 'resolveInnate';
  if (k.startsWith('repeat:')) return 'repeat';
  if (k === 'ok') return 'ok';
  if (o.piece || (PIECES as string[]).includes(k)) return 'piece';
  if (o.space) return 'land';
  if (o.card) return 'card';
  if (o.element) return 'element';
  if (o.spirit !== undefined) return 'spirit';
  if (/^\d+$/.test(k)) return 'index';
  return 'other';
}

function growthFeatures(items: GrowthItem[]): [string, number][] {
  let presence = 0;
  let range = 0;
  const f: Record<string, number> = { gGainCard: 0, gReclaimAll: 0, gReclaimOne: 0, gEnergy: 0, gCardPlay: 0, gOcean: 0 };
  for (const it of items) {
    if (it.t === 'presence') {
      presence++;
      range = Math.max(range, it.range === 'any' ? 4 : it.range);
    } else if (it.t === 'gainCard') f.gGainCard++;
    else if (it.t === 'reclaimAll') f.gReclaimAll = 1;
    else if (it.t === 'reclaimOne') f.gReclaimOne = 1;
    else if (it.t === 'energy') f.gEnergy += it.n / 4;
    else if (it.t === 'cardPlay') f.gCardPlay += it.n / 2;
    else f.gOcean = 1;
  }
  return [['gPresence', presence / 3], ['gRange', range / 4], ...Object.entries(f)];
}

/** Hop distances between all spaces (BFS over adjacency); the island never changes, so cached per island. */
const DISTANCES = new WeakMap<object, Uint8Array>();
function hopDistances(gs: GameState): Uint8Array {
  const cached = DISTANCES.get(gs.island);
  if (cached) return cached.slice();
  const d = computeDistances(gs);
  DISTANCES.set(gs.island, d);
  return d.slice();
}

function computeDistances(gs: GameState): Uint8Array {
  const n = gs.spaces.length;
  const out = new Uint8Array(n * n).fill(MAX_DIST);
  for (let i = 0; i < n; i++) {
    out[i * n + i] = 0;
    const queue = [i];
    for (let q = 0; q < queue.length; q++) {
      const a = queue[q];
      const d = out[i * n + a];
      if (d + 1 >= MAX_DIST) continue;
      for (const id of gs.spaces[a].adj) {
        const b = gs.spaceIndex[id];
        if (out[i * n + b] > d + 1) {
          out[i * n + b] = d + 1;
          queue.push(b);
        }
      }
    }
  }
  return out;
}

// ─── observe ──────────────────────────────────────────────────────────────────

/**
 * Encode decision `dec` for the Spirit in seat `seat` (default: the decision's owner;
 * seat 0 for "any player" decisions). Pure: `gs` is not changed.
 */
export function observe(gs: GameState, dec: Decision, seat = dec.owner >= 0 ? dec.owner : 0): Observation {
  const me = gs.spirits[seat];
  const spaces = gs.spaces;
  const landIds = spaces.map((s) => s.id);
  const landRow = new Map(landIds.map((id, i) => [id, i]));
  const inv = gs.invader;

  // ── lands ──
  const land = block(spaces.length, LAND_CAT, LAND_NUM);
  const myLands = presenceLands(gs, me);
  const nearPresence = distancesFrom(gs, myLands, 4);
  const nearSacred = distancesFrom(gs, myLands.filter((sp) => isSacredSite(gs, me, sp)), 4);
  const top = inv.deck[0];
  const pool = top ? unseenInvaderCards(gs)[top.stage] : [];
  const focus = new Set(dec.focus ?? []);
  spaces.forEach((sp: Space, i) => {
    land.setCat(i, 0, TERRAINS.indexOf(sp.terrain) + 1);
    land.setCat(i, 1, sp.num);
    const sum = (k: PieceKind) => sp.pieces.reduce((a, p) => a + (p.kind === k ? p.dmg : 0), 0);
    const mine = presenceOf(sp, seat);
    const others = sp.presence.reduce((a, n, j) => a + (j === seat ? 0 : n), 0);
    const m = sp.mods;
    const set = (k: (typeof LAND_NUM)[number], v: number) => land.set(i, k, v);
    set('coastal', flag(sp.coastal));
    set('explorer', count(sp, 'explorer') / 4);
    set('town', count(sp, 'town') / 3);
    set('city', count(sp, 'city') / 2);
    set('dahan', count(sp, 'dahan') / 4);
    set('townDmg', sum('town') / 2);
    set('cityDmg', sum('city') / 3);
    set('dahanDmg', sum('dahan') / 2);
    set('blight', sp.blight / 2);
    set('myPresence', mine / 3);
    set('otherPresence', others / 3);
    set('mySacredSite', flag(isSacredSite(gs, me, sp)));
    set('otherSacredSite', flag(gs.spirits.some((s) => s !== me && isSacredSite(gs, s, sp))));
    set('defend', sp.defend / 5);
    set('skipAll', flag(m.skipAll));
    set('skipRavage', flag(m.skipRavage));
    set('skipBuild', flag(m.skipBuild));
    set('skipExplore', flag(m.skipExplore));
    set('dahanSafe', flag(m.dahanSafe));
    set('dahanSimultaneous', flag(m.dahanSimultaneous));
    set('dahanBonusHealth', (m.dahanBonusHealth ?? 0) / 3);
    set('dahanImmune', flag(m.dahanImmune));
    set('blightStaysOnCard', flag(m.blightStaysOnCard));
    set('dreadApparitions', flag(m.dreadApparitions));
    set('vengeance', (m.vengeance?.length ?? 0) / 2);
    set('ravageHere', flag(inv.ravage.some((c) => matchesCard(sp, c))));
    set('buildHere', flag(inv.build.some((c) => matchesCard(sp, c))));
    set('highImmigrationHere', flag(inv.highImmigration?.some((c) => matchesCard(sp, c))));
    set('exploredThisPhase', flag(inv.lastExplored.some((c) => matchesCard(sp, c))));
    set('nextExploreChance', pool.length ? pool.filter((c) => matchesCard(sp, c)).length / pool.length : 0);
    set('distMyPresence', (nearPresence.get(sp.id) ?? 5) / 5);
    set('distMySacredSite', (nearSacred.get(sp.id) ?? 5) / 5);
    set('adjTownCity', sp.adj.reduce((a, id) => a + count(spaces[gs.spaceIndex[id]], 'town') + count(spaces[gs.spaceIndex[id]], 'city'), 0) / 4);
    set('focus', flag(focus.has(sp.id)));
    set('about', flag(dec.about?.space === sp.id));
  });

  // ── Spirits ──
  const spirit = block(gs.spirits.length, SPIRIT_CAT, SPIRIT_NUM);
  gs.spirits.forEach((s: SpiritState, i) => {
    const d = SPIRITS[s.id];
    const el = elementsOf(s);
    spirit.setCat(i, 0, SPIRIT_ORDER.indexOf(s.id) + 1);
    const set = (k: string, v: number) => spirit.set(i, k, v);
    set('isMe', flag(i === seat));
    set('decides', flag(dec.owner === i || dec.owner === -1));
    set('energy', s.energy / 10);
    set('income', energyIncome(s) / 5);
    set('cardPlays', cardPlays(s) / 4);
    set('energyRevealed', s.energyRevealed / (d.energyTrack.length - 1));
    set('cardRevealed', s.cardRevealed / (d.cardTrack.length - 1));
    set('presenceOnIsland', spaces.reduce((a, sp) => a + presenceOf(sp, i), 0) / 10);
    set('destroyed', s.destroyed / 5);
    for (const e of ELEMENTS) set(`el${e}`, (el[e] ?? 0) / 4);
    d.innates.forEach((inn, j) => inn.tiers.forEach((t, k) => set(`innate${j}Tier${k}`, flag(meetsThreshold(el, t.need)))));
    for (const [k, v] of trackFeatures('nextE', d.energyTrack[s.energyRevealed + 1])) set(k, v);
    for (const [k, v] of trackFeatures('nextC', d.cardTrack[s.cardRevealed + 1])) set(k, v);
    set('hand', s.hand.length / 8);
    set('discard', s.discard.length / 8);
    set('played', s.played.length / 4);
    set('used', s.used.length / 4);
    set('bonusCardPlays', s.bonusCardPlays / 2);
    set('slowAsFast', (s.slowAsFast.lightningAir + s.slowAsFast.boon) / 2);
    set('usedSlowAsFast', s.usedSlowAsFast / 2);
    set('repeats', s.repeats.reduce((a, r) => a + r.uses, 0) / 2);
    set('rangeBonus', s.rangeBonus / 2);
    set('reclaimOneUsed', flag(s.reclaimOneUsed));
    set('constancy', s.constancy / 2);
    set('entwined', s.entwined.length / 2);
    set('drownedHealth', s.drownedHealth / 10);
    set('anyChoices', s.anyChoices.length / 2);
  });

  // ── cards (Power Cards held or offered, and Innate Powers) ──
  const rows: { key: string; zone: (typeof ZONES)[number]; owner: number }[] = [];
  const zones = ['hand', 'played', 'discard'] as const;
  gs.spirits.forEach((s, i) => {
    for (const z of zones) for (const id of s[z]) rows.push({ key: `card:${id}`, zone: z, owner: i });
    for (const inn of SPIRITS[s.id].innates) rows.push({ key: `innate:${inn.id}`, zone: 'innate', owner: i });
  });
  for (const o of dec.options) {
    if (o.card && !rows.some((r) => r.key === `card:${o.card}`)) rows.push({ key: `card:${o.card}`, zone: 'offered', owner: -1 });
  }
  const card = block(rows.length, CARD_CAT, CARD_NUM);
  rows.forEach((r, i) => {
    card.setCat(i, 0, POWER_INDEX.get(r.key) ?? 0);
    card.setCat(i, 1, ZONES.indexOf(r.zone));
    const set = (k: string, v: number) => card.set(i, k, v);
    const owner = r.owner >= 0 ? gs.spirits[r.owner] : me;
    set('mine', flag(r.owner === seat));
    const [kind, id] = r.key.split(':');
    if (kind === 'card') {
      const c = CARDS[id];
      set('cost', c.cost / 5);
      set('fast', flag(c.speed === 'FAST'));
      for (const e of c.elements) set(`el${e}`, 1);
      set(c.type, 1);
      set('affordable', flag(owner.energy >= c.cost));
      set('usedThisTurn', flag(owner.used.includes(id)));
      if (c.target.kind === 'land') {
        set('range', c.target.range.n / 3);
        set('rangeSacred', flag(c.target.range.sacred));
        set(`filter_${c.target.filter.t}`, 1);
      } else set('targetsSpirit', 1);
    } else {
      const inn = INNATES[id];
      set('innate', 1);
      set('fast', flag(inn.speed === 'FAST'));
      set('usedThisTurn', flag(owner.used.includes(id)));
      const el = elementsOf(owner);
      set('tiersMet', inn.tiers.filter((t) => meetsThreshold(el, t.need)).length / inn.tiers.length);
      if (inn.target.kind === 'land') {
        set('range', inn.target.range.n / 3);
        set('rangeSacred', flag(inn.target.range.sacred));
        set(`filter_${inn.target.filter.t}`, 1);
      } else set('targetsSpirit', 1);
    }
  });
  const cardKeys = rows.map((r) => r.key);
  /** a power key's row, preferring the given owner's copy */
  const cardRow = (key: string, owner = seat) => {
    const i = rows.findIndex((r) => r.key === key && (r.owner === owner || r.owner === -1));
    return i >= 0 ? i : rows.findIndex((r) => r.key === key);
  };

  // ── global ──
  const global = block(1, GLOBAL_CAT, GLOBAL_NUM);
  const f = gs.fear;
  global.setCat(0, 0, ADVERSARY_ORDER.indexOf(gs.setup.adversary));
  global.setCat(0, 1, gs.setup.adversaryLevel);
  global.setCat(0, 2, gs.blight.flipped ? BLIGHT_IDS.indexOf(gs.blight.card) + 1 : 0);
  global.setCat(0, 3, PHASES.indexOf(gs.phase));
  {
    const set = (k: string, v: number) => global.set(0, k, v);
    set('turn', gs.turn / 12);
    set('players', gs.spirits.length / 4);
    set('difficulty', gs.difficulty / 11);
    set('fearPool', f.poolSize / 8);
    set('fearGenerated', f.generated / Math.max(1, f.poolSize));
    set('fearEarned', f.earned.length / 3);
    set('fearEarnedTotal', f.earnedTotal / 9);
    set(`tl${f.terrorLevel}`, 1);
    set('toTL2', Math.max(0, f.groups[0] - f.earnedTotal) / 4);
    set('toTL3', Math.max(0, f.groups[0] + f.groups[1] - f.earnedTotal) / 8);
    set('fearDeck', f.deck.length / 12);
    set('fearRevealed', f.revealed.length / 2);
    set('blightOnCard', gs.blight.onCard / 10);
    set('blightFlipped', flag(gs.blight.flipped));
    set('blightOnIsland', spaces.reduce((a, sp) => a + sp.blight, 0) / 10);
    set('deck', inv.deck.length / 12);
    for (const st of [1, 2, 3] as const) set(`deckStage${st}`, inv.deck.filter((c) => c.stage === st).length / 5);
    if (top) set(`nextStage${top.stage}`, 1);
    const slot = (name: string, cards: InvaderCard[]) => cardMask(cards).forEach((v, j) => set(`${name}${[...LAND_TERRAINS, 'COASTAL', 'Has'][j]}`, v));
    slot('ravage', inv.ravage);
    slot('build', inv.build);
    slot('highImmigration', inv.highImmigration ?? []);
    slot('explored', inv.lastExplored);
    set('invaderDiscard', inv.discard.length / 12);
    set('avoidDahan', (gs.turnFlags.avoidDahan ?? 0) / 3);
    set('overseasTrade', (gs.turnFlags.overseasTrade ?? 0) / 3);
    set('tradeSuffers', flag(gs.turnFlags.tradeSuffers1));
    set('fearResolvedThisTurn', gs.turnFlags.fearResolvedThisTurn / 3);
    set('minorDeck', gs.minorDeck.length / 36);
    set('majorDeck', gs.majorDeck.length / 22);
  }

  // ── the decision ──
  const decision = block(1, DECISION_CAT, DECISION_NUM);
  decision.setCat(0, 0, DECISION_KINDS.indexOf(dec.kind) + 1);
  decision.setCat(0, 1, SOURCE_INDEX.get(dec.sourceId ?? '') ?? 0);
  decision.setCat(0, 2, dec.about?.piece ? PIECES.indexOf(dec.about.piece) + 1 : 0);
  decision.set(0, 'anyPlayer', flag(dec.owner === -1));
  decision.set(0, 'aboutN', (dec.about?.n ?? 0) / 5);
  decision.set(0, 'aboutMax', (dec.about?.max ?? 0) / 5);
  decision.set(0, 'options', dec.options.length / 12);
  decision.set(0, 'hasDone', flag(dec.options.some((o) => o.done)));
  const src = dec.sourceId && POWER_INDEX.has(dec.sourceId) ? cardRow(dec.sourceId) : -1;
  const decisionRef = Int32Array.from([dec.about?.space ? landRow.get(dec.about.space) ?? -1 : -1, dec.owner, src]);

  // ── options ──
  const n = dec.options.length;
  const option = block(n, OPTION_CAT, OPTION_NUM);
  const optionRef = new Int32Array(n * OPTION_REF.length).fill(-1);
  const growth = SPIRITS[(dec.owner >= 0 ? gs.spirits[dec.owner] : me).id].growth;
  dec.options.forEach((o, i) => {
    const cls = optionClass(o, dec);
    option.setCat(i, 0, OPTION_CLASSES.indexOf(cls));
    const piece = o.piece ?? ((PIECES as string[]).includes(o.key) ? (o.key as PieceKind) : undefined);
    option.setCat(i, 1, piece ? PIECES.indexOf(piece) + 1 : 0);
    option.setCat(i, 2, o.element ? ELEMENTS.indexOf(o.element as Element) + 1 : 0);
    option.set(i, 'done', flag(o.done));
    option.set(i, 'dmg', (o.dmg ?? 0) / 3);
    option.set(i, 'position', n > 1 ? i / (n - 1) : 0);
    if (cls === 'index' || cls === 'growth') option.set(i, 'value', Number(o.key) / 4);
    if (cls === 'growth') {
      for (const [k, v] of growthFeatures([...(growth.always ?? []), ...(growth.options[Number(o.key)] ?? [])])) option.set(i, k, v);
    }
    const sp = o.space ?? (o.key.startsWith('move:') ? o.key.slice(5) : undefined);
    if (sp !== undefined) optionRef[i * 3] = landRow.get(sp) ?? -1;
    const powerKey = o.card ? `card:${o.card}` : o.key.startsWith('innate:') ? o.key : null;
    if (powerKey) optionRef[i * 3 + 1] = cardRow(powerKey, dec.owner);
    if (o.spirit !== undefined) optionRef[i * 3 + 2] = o.spirit;
  });

  return {
    version: OBS_VERSION,
    land: land.done(),
    spirit: spirit.done(),
    card: card.done(),
    global: global.done(),
    decision: decision.done(),
    option: option.done(),
    optionRef,
    decisionRef,
    dist: hopDistances(gs),
    landIds,
    cardKeys,
  };
}
