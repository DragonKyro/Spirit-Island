// Game state and read-only queries over it. Mutating operations live in ops.ts.

import type { Rng } from './rng';
import type { SpaceDef, IslandDef } from './island';
import type {
  AdversaryId,
  BoardName,
  Element,
  Elements,
  InvaderKind,
  LandTerrain,
  Piece,
  PieceKind,
  SpiritId,
  Terrain,
} from './types';
import { ELEMENTS, isInvader } from './types';
import type { Decision } from './decide';

// ─── Invader deck ─────────────────────────────────────────────────────────────

export interface InvaderCard {
  id: string;
  stage: 1 | 2 | 3;
  /** terrains this card matches, or 'COASTAL' for the Stage II Coastal Lands card */
  terrains: LandTerrain[] | 'COASTAL';
  escalation: boolean;
}

export function invaderCardLabel(c: InvaderCard): string {
  if (c.terrains === 'COASTAL') return 'Coastal Lands';
  return c.terrains.map((t) => t.charAt(0) + t.slice(1).toLowerCase()).join(' + ');
}

// ─── Spaces ───────────────────────────────────────────────────────────────────

/** Effects on one land that last until Time Passes. */
export interface LandMods {
  skipAll?: boolean;
  skipRavage?: boolean;
  skipBuild?: boolean;
  skipExplore?: boolean;
  /** Concealing Shadows: Dahan take no damage from Ravaging Invaders. */
  dahanSafe?: boolean;
  /** Words of Warning: Dahan deal Damage simultaneously with Invaders during Ravage. */
  dahanSimultaneous?: boolean;
  /** Infinite Vitality */
  dahanBonusHealth?: number;
  dahanImmune?: boolean;
  blightStaysOnCard?: boolean;
  /** Dread Apparitions: Defend 1 per Fear Powers generate here. */
  dreadApparitions?: boolean;
  /** Vengeance of the Dead: spirit index + may deal into adjacent lands */
  vengeance?: { spirit: number; adjacent: boolean }[];
}

export interface Space extends SpaceDef {
  pieces: Piece[];
  blight: number;
  /** presence count per spirit index */
  presence: number[];
  defend: number;
  mods: LandMods;
}

// ─── Spirits ──────────────────────────────────────────────────────────────────

export interface RepeatGrant {
  source: string;
  /** Gift of Strength: free repeat of a card costing <= maxCost. Powerstorm: pay the cost again. */
  maxCost: number;
  payCost: boolean;
  uses: number;
}

export interface SpiritState {
  index: number;
  id: SpiritId;
  name: string;
  color: string;
  energy: number;
  /** presence lifted off each track (0 = only the first space revealed) */
  energyRevealed: number;
  cardRevealed: number;
  /** destroyed presence (removed from the game; A Spread of Rampant Green can reuse it) */
  destroyed: number;
  hand: string[];
  discard: string[];
  played: string[];
  /** cards already resolved this turn (card ids) and innates used (innate ids) */
  used: string[];
  /** cards resolved during the Fast phase this turn (a Repeat matches the original's speed) */
  usedFast: string[];
  /** element choices for "Any" track spaces this turn */
  anyChoices: Element[];
  /** extra elements gained this turn (Elemental Boon, Spirits May Yet Dream...) */
  bonusElements: Elements;
  bonusCardPlays: number;
  /** Slow Powers this spirit may still use as Fast this turn, by source */
  slowAsFast: { lightningAir: number; boon: number };
  usedSlowAsFast: number;
  repeats: RepeatGrant[];
  rangeBonus: number;
  reclaimOneUsed: boolean;
  /** Gift of Constancy: may Reclaim this many played cards at end of turn */
  constancy: number;
  /** Entwined Power partners (may use each other's Presence to target) */
  entwined: number[];
  /** Ocean's Hungry Grasp: drowned Invader health not yet exchanged for Energy */
  drownedHealth: number;
}

// ─── Fear / Blight ────────────────────────────────────────────────────────────

export interface FearState {
  poolSize: number;
  generated: number;
  deck: string[];
  /** earned, awaiting resolution (in order) */
  earned: string[];
  discard: string[];
  /** cards per terror level group, top to bottom */
  groups: [number, number, number];
  /** total cards earned so far (for terror level) */
  earnedTotal: number;
  terrorLevel: 1 | 2 | 3;
  /** Spirits May Yet Dream: fear cards turned face up */
  revealed: string[];
}

export interface BlightState {
  card: string;
  flipped: boolean;
  onCard: number;
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export type Phase = 'SETUP' | 'SPIRIT' | 'FAST' | 'INVADER' | 'SLOW' | 'TIME_PASSES' | 'GAME_OVER';

export type GameResult =
  | { kind: 'IN_PROGRESS' }
  | { kind: 'VICTORY'; reason: string }
  | { kind: 'SACRIFICE_VICTORY'; reason: string }
  | { kind: 'DEFEAT'; reason: string };

export interface TurnFlags {
  /** fear cards that restrict Build / Explore this turn: card id -> terror level */
  avoidDahan?: number;
  overseasTrade?: number;
  tradeSuffers1?: boolean;
  /** count of fear cards resolved this Invader Phase (England L6) */
  fearResolvedThisTurn: number;
}

export interface LogEntry {
  turn: number;
  phase: Phase;
  text: string;
  /** indent level for nesting */
  depth?: number;
}

export interface GameSetup {
  /** protocol/rules version */
  v: 1;
  seed: number;
  /** spirit per player, in seat order */
  spirits: SpiritId[];
  /** board per player (same length as spirits) */
  boards: BoardName[];
  adversary: AdversaryId;
  adversaryLevel: number;
  /** optional display names per seat */
  names?: string[];
  /** seats played by the built-in AI (presentation only: never changes how answers replay) */
  ai?: boolean[];
}

export interface GameState {
  setup: GameSetup;
  island: IslandDef;
  spaces: Space[];
  spaceIndex: Record<string, number>;
  spirits: SpiritState[];
  rng: Rng;
  turn: number;
  phase: Phase;
  result: GameResult;
  difficulty: number;
  invader: {
    deck: InvaderCard[];
    /** England High Immigration slot (null = tile not in play) */
    highImmigration: InvaderCard[] | null;
    ravage: InvaderCard[];
    build: InvaderCard[];
    discard: InvaderCard[];
    /** cards revealed this phase for display */
    lastExplored: InvaderCard[];
  };
  fear: FearState;
  blight: BlightState;
  minorDeck: string[];
  minorDiscard: string[];
  majorDeck: string[];
  majorDiscard: string[];
  turnFlags: TurnFlags;
  /** next Decision id */
  nextId: number;
  log: LogEntry[];
  /** what is currently being resolved (for UI headers) */
  activity: string | null;
  /** the same as an id (`card:<id>`, `innate:<id>`, `fear:<id>`, `blight:<id>`), stamped on Decisions as `sourceId` */
  activityId: string | null;
  /**
   * Skip the game log (simulations and training). A runtime switch, not part of the
   * setup: the log is never read by the rules, so a quiet game plays out identically.
   */
  quiet?: boolean;
  /** pending decisions (mirrors the driver, for convenience) */
  pending: Decision[];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function space(gs: GameState, id: string): Space {
  return gs.spaces[gs.spaceIndex[id]];
}

export function adjacent(gs: GameState, sp: Space): Space[] {
  return sp.adj.map((id) => space(gs, id));
}

export function lands(gs: GameState): Space[] {
  return gs.spaces.filter((s) => s.num > 0);
}

export function count(sp: Space, kind: PieceKind): number {
  let n = 0;
  for (const p of sp.pieces) if (p.kind === kind) n++;
  return n;
}

export function invaders(sp: Space): Piece[] {
  return sp.pieces.filter((p) => isInvader(p.kind));
}

export function invaderCount(sp: Space): number {
  return invaders(sp).length;
}

export function hasInvaders(sp: Space): boolean {
  return sp.pieces.some((p) => isInvader(p.kind));
}

export function townCity(sp: Space): number {
  return count(sp, 'town') + count(sp, 'city');
}

export function dahanCount(sp: Space): number {
  return count(sp, 'dahan');
}

export function presenceOf(sp: Space, spirit: number): number {
  return sp.presence[spirit] ?? 0;
}

export function totalPresenceIn(sp: Space): number {
  return sp.presence.reduce((a, b) => a + b, 0);
}

export function spiritById(gs: GameState, id: SpiritId): SpiritState | undefined {
  return gs.spirits.find((s) => s.id === id);
}

/** Is this Ocean in play (Ocean's Hungry Grasp has Presence on its board)? */
export function oceanInPlay(gs: GameState, sp: Space): boolean {
  if (sp.num !== 0) return false;
  const ocean = spiritById(gs, 'ocean');
  if (!ocean) return false;
  return gs.spaces.some((s) => s.board === sp.board && presenceOf(s, ocean.index) > 0);
}

/** Lands (and in-play Oceans) that Spirit Powers can affect. */
export function powerSpaces(gs: GameState): Space[] {
  return gs.spaces.filter((s) => s.num > 0 || oceanInPlay(gs, s));
}

/** Terrain as seen by Spirit Powers and Blight (in-play Oceans are Coastal Wetlands). */
export function powerTerrain(gs: GameState, sp: Space): Terrain {
  return sp.num === 0 && oceanInPlay(gs, sp) ? 'WETLAND' : sp.terrain;
}

export function isCoastalForPowers(gs: GameState, sp: Space): boolean {
  return sp.coastal || (sp.num === 0 && oceanInPlay(gs, sp));
}

export function isSacredSite(_gs: GameState, spirit: SpiritState, sp: Space): boolean {
  const n = presenceOf(sp, spirit.index);
  if (n >= 2) return true;
  // River's Domain: Presence in Wetlands counts as Sacred Site.
  if (spirit.id === 'river' && n >= 1 && sp.terrain === 'WETLAND') return true;
  return false;
}

export function anySacredSite(gs: GameState, sp: Space): boolean {
  return gs.spirits.some((s) => isSacredSite(gs, s, sp));
}

export function presenceOnIsland(gs: GameState, spirit: number): number {
  let n = 0;
  for (const sp of gs.spaces) n += presenceOf(sp, spirit);
  return n;
}

/** Health of a piece, including modifiers. */
export function healthOf(gs: GameState, sp: Space, kind: PieceKind): number {
  if (kind === 'dahan') return 2 + (sp.mods.dahanBonusHealth ?? 0);
  const base = kind === 'explorer' ? 1 : kind === 'town' ? 2 : 3;
  // England level 5 (Local Autonomy): Town / City have +1 Health.
  if (kind !== 'explorer' && gs.setup.adversary === 'england' && gs.setup.adversaryLevel >= 5) return base + 1;
  return base;
}

export function remainingHealth(gs: GameState, sp: Space, p: Piece): number {
  return healthOf(gs, sp, p.kind) - p.dmg;
}

/** Damage an Invader deals during Ravage. */
export function attackOf(gs: GameState, kind: InvaderKind): number {
  const sweden3 = gs.setup.adversary === 'sweden' && gs.setup.adversaryLevel >= 3;
  if (kind === 'explorer') return 1;
  if (kind === 'town') return sweden3 ? 3 : 2;
  return sweden3 ? 5 : 3;
}

// ─── Spirit track helpers (track definitions live in spirits.ts) ──────────────

export interface TrackSlot {
  energy?: number;
  plays?: number;
  element?: Element;
  any?: true;
  reclaimOne?: true;
}

export function elementsTotal(e: Elements): number {
  return ELEMENTS.reduce((s, el) => s + (e[el] ?? 0), 0);
}

export function meetsThreshold(have: Elements, need: Elements): boolean {
  for (const el of ELEMENTS) if ((have[el] ?? 0) < (need[el] ?? 0)) return false;
  return true;
}
