// Primitive game operations: pieces, Damage, Destroy, Push/Gather, Blight, Presence,
// Fear, Energy, Power Cards, targeting, and win/loss checks. Anything that may need
// a player's choice is a generator (see decide.ts).

import { CARDS } from './cardData';
import type { LandFilter, RangeSpec } from './cardData';
import { GameOver, choose, confirm } from './decide';
import type { Eff, Option } from './decide';
import { shuffled } from './rng';
import { SPIRITS } from './spiritData';
import type { PresenceFilter } from './spiritData';
import {
  adjacent,
  count,
  dahanCount,
  hasInvaders,
  healthOf,
  invaders,
  isCoastalForPowers,
  isSacredSite,
  lands,
  oceanInPlay,
  powerSpaces,
  powerTerrain,
  presenceOf,
  presenceOnIsland,
  remainingHealth,
  space,
  spiritById,
  townCity,
} from './state';
import type { GameResult, GameState, Space, SpiritState, TrackSlot } from './state';
import { ELEMENT_LABEL, ELEMENTS, PIECE_LABEL, TERRAIN_LABEL, isInvader } from './types';
import type { Element, Elements, InvaderKind, Piece, PieceKind } from './types';

// ─── Context ──────────────────────────────────────────────────────────────────

/** Who is acting and why. `power` is set while resolving a Spirit Power. */
export interface Ctx {
  gs: GameState;
  /** the Spirit whose player makes choices (the Power's user, or the player resolving a Fear effect) */
  self: SpiritState;
  source: string;
  power?: { id: string; kind: 'card' | 'innate' };
  target?: Space;
  targetSpirit?: SpiritState;
  /** To Dream a Thousand Deaths: Invaders this Power already "destroyed", and its pretend Damage */
  dreamed?: Set<Piece>;
  dreamDmg?: Map<Piece, number>;
  /** Tidal Boon: Dahan pushed into Ocean may be saved */
  saveDahan?: boolean;
  /** resolving a Repeat — Repeats never chain */
  isRepeat?: boolean;
}

export function ctxFor(gs: GameState, self: SpiritState, source: string, extra: Partial<Ctx> = {}): Ctx {
  return { gs, self, source, ...extra };
}

const dreams = (ctx: Ctx | null | undefined): ctx is Ctx => !!ctx && !!ctx.power && ctx.self.id === 'bringer';

// ─── Log ──────────────────────────────────────────────────────────────────────

export function log(gs: GameState, text: string, depth = 1): void {
  if (gs.quiet) return;
  gs.log.push({ turn: gs.turn, phase: gs.phase, text, depth });
}

export const landName = (sp: Space) =>
  sp.num === 0 ? `Ocean (${sp.boardName})` : `${sp.id} ${TERRAIN_LABEL[sp.terrain]}`;

// ─── Win / loss ───────────────────────────────────────────────────────────────

export function winReason(gs: GameState): string | null {
  const ls = lands(gs);
  switch (gs.fear.terrorLevel) {
    case 1:
      return ls.some(hasInvaders) ? null : 'Terror Level I: no Invaders remain on the island.';
    case 2:
      return ls.some((s) => townCity(s) > 0) ? null : 'Terror Level II: no Towns or Cities remain.';
    default:
      return ls.some((s) => count(s, 'city') > 0) ? null : 'Terror Level III: no Cities remain.';
  }
}

export function lossReason(gs: GameState): string | null {
  for (const sp of gs.spirits) {
    if (presenceOnIsland(gs, sp.index) === 0) return `${sp.name} has no Presence left on the island.`;
  }
  if (gs.setup.adversary === 'england') {
    const cap = lands(gs).find((s) => townCity(s) >= 7);
    if (cap) return `Proud & Mighty Capital: ${cap.id} holds 7 or more Towns / Cities.`;
  }
  return null;
}

/** End the game if a victory or defeat condition is met right now. */
export function checkEnd(gs: GameState, forcedLoss?: string): void {
  if (gs.phase === 'SETUP' || gs.result.kind !== 'IN_PROGRESS') return;
  const lose = forcedLoss ?? lossReason(gs);
  const win = winReason(gs);
  let result: Exclude<GameResult, { kind: 'IN_PROGRESS' }> | null = null;
  if (lose && win) result = { kind: 'SACRIFICE_VICTORY', reason: `${win} (but ${lose})` };
  else if (win) result = { kind: 'VICTORY', reason: win };
  else if (lose) result = { kind: 'DEFEAT', reason: lose };
  if (result) throw new GameOver(result);
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

export function addPieces(gs: GameState, sp: Space, kind: PieceKind, n = 1, why = ''): void {
  if (n <= 0) return;
  for (let i = 0; i < n; i++) sp.pieces.push({ kind, dmg: 0 });
  log(gs, `+${n} ${PIECE_LABEL[kind]} in ${landName(sp)}${why ? ` (${why})` : ''}`);
  if (kind === 'town' || kind === 'city') checkEnd(gs);
}

/** Remove (not Destroy): no Fear, no triggers. */
export function removePiece(gs: GameState, sp: Space, p: Piece, why = ''): void {
  const i = sp.pieces.indexOf(p);
  if (i < 0) return;
  sp.pieces.splice(i, 1);
  log(gs, `Removed ${PIECE_LABEL[p.kind]} from ${landName(sp)}${why ? ` (${why})` : ''}`);
  checkEnd(gs);
}

/** Replace a piece; a replaced Invader keeps its Damage (never enough to destroy it). */
export function replacePiece(gs: GameState, sp: Space, p: Piece, kind: PieceKind, n = 1): void {
  const i = sp.pieces.indexOf(p);
  if (i < 0) return;
  const keep = isInvader(p.kind) && isInvader(kind) ? p.dmg : 0;
  sp.pieces.splice(i, 1);
  for (let k = 0; k < n; k++) {
    sp.pieces.push({ kind, dmg: Math.min(keep, healthOf(gs, sp, kind) - 1) });
  }
  log(gs, `Replaced ${PIECE_LABEL[p.kind]} with ${n > 1 ? `${n} ` : ''}${PIECE_LABEL[kind]} in ${landName(sp)}`);
  checkEnd(gs);
}

/** Pick one piece of `kind` in a land, asking only when pieces differ (by Damage). */
export function* pickPiece(gs: GameState, owner: number, sp: Space, kind: PieceKind, prompt: string): Eff<Piece | null> {
  const ps = sp.pieces.filter((p) => p.kind === kind);
  if (!ps.length) return null;
  const gr = groups(ps);
  if (gr.length === 1) return gr[0];
  const k = yield* choose(gs, owner, prompt, gr.map((p) => ({ key: pieceKey(p), label: pieceLabel(p), piece: p.kind, dmg: p.dmg, space: sp.id })), { focus: [sp.id] });
  return ps.find((p) => pieceKey(p) === k)!;
}

export function piecesOf(sp: Space, kinds: readonly PieceKind[]): Piece[] {
  return sp.pieces.filter((p) => kinds.includes(p.kind));
}

/** Distinct (kind, damage) groups — the only distinctions a player can meaningfully make. */
function groups(ps: Piece[]): Piece[] {
  const seen = new Set<string>();
  const out: Piece[] = [];
  for (const p of ps) {
    const k = `${p.kind}:${p.dmg}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

const pieceKey = (p: Piece) => `${p.kind}:${p.dmg}`;
const pieceLabel = (p: Piece, eff = p.dmg) => `${PIECE_LABEL[p.kind]}${eff > 0 ? ` (${eff} dmg)` : ''}`;

// ─── Fear ─────────────────────────────────────────────────────────────────────

/** Generate Fear. Pass `ctx` when a Power generates it (Dread Apparitions cares). */
export function addFear(gs: GameState, n: number, ctx?: Ctx): void {
  if (n <= 0) return;
  if (ctx?.power && ctx.target?.mods.dreadApparitions) {
    ctx.target.defend += n;
    log(gs, `Dread Apparitions: Defend ${n} in ${landName(ctx.target)}`);
  }
  const f = gs.fear;
  f.generated += n;
  log(gs, `+${n} Fear${ctx ? ` (${ctx.source})` : ''}`);
  while (f.generated >= f.poolSize) {
    f.generated -= f.poolSize;
    earnFearCard(gs);
  }
}

function earnFearCard(gs: GameState): void {
  const f = gs.fear;
  const card = f.deck.shift();
  if (!card) return;
  f.earned.push(card);
  f.earnedTotal++;
  log(gs, `A Fear Card is earned!`, 1);
  const tl2 = f.groups[0];
  const tl3 = f.groups[0] + f.groups[1];
  if (f.terrorLevel < 3 && f.earnedTotal >= tl3 && f.deck.length > 0) {
    f.terrorLevel = 3;
    log(gs, 'Terror Level III — victory now requires only that no Cities remain.', 0);
  } else if (f.terrorLevel === 1 && f.earnedTotal >= tl2) {
    f.terrorLevel = 2;
    log(gs, 'Terror Level II — victory now requires no Towns or Cities.', 0);
  }
  if (f.deck.length === 0 && gs.phase !== 'SETUP') {
    throw new GameOver({ kind: 'VICTORY', reason: 'Every Fear Card has been earned — the Invaders flee the island in terror!' });
  }
  checkEnd(gs);
}

// ─── Damage & Destroy ─────────────────────────────────────────────────────────

function effDmg(ctx: Ctx | null, p: Piece): number {
  return p.dmg + (dreams(ctx) ? ctx.dreamDmg?.get(p) ?? 0 : 0);
}

function damageable(ctx: Ctx | null, sp: Space, kinds?: readonly InvaderKind[]): Piece[] {
  return invaders(sp).filter(
    (p) => (!kinds || kinds.includes(p.kind as InvaderKind)) && !(dreams(ctx) && ctx.dreamed?.has(p)),
  );
}

/** Apply `n` Damage to one Invader (Bringer's Powers only pretend). Returns true if it was destroyed. */
export function* hit(ctx: Ctx | null, gs: GameState, sp: Space, p: Piece, n: number): Eff<boolean> {
  if (dreams(ctx)) {
    const m = (ctx.dreamDmg ??= new Map());
    const v = (m.get(p) ?? 0) + n;
    m.set(p, v);
    if (p.dmg + v >= healthOf(gs, sp, p.kind)) {
      yield* dreamDestroy(ctx, sp, p);
      return true;
    }
    return false;
  }
  p.dmg += n;
  if (p.dmg >= healthOf(gs, sp, p.kind)) {
    yield* destroyPiece(ctx, gs, sp, p);
    return true;
  }
  return false;
}

/**
 * Deal `amount` Damage to Invaders in a land, divided as the acting player chooses.
 * Each choice either destroys one Invader (spending exactly its remaining Health) or,
 * when not enough Damage is left, puts all the rest on one Invader.
 * Returns the number of Invaders destroyed.
 */
export function* damage(
  ctx: Ctx | null,
  gs: GameState,
  sp: Space,
  amount: number,
  opts: { kinds?: readonly InvaderKind[]; owner?: number; source?: string } = {},
): Eff<number> {
  let left = amount;
  let killed = 0;
  const owner = opts.owner ?? ctx?.self.index ?? -1;
  if (amount > 0) log(gs, `${amount} Damage in ${landName(sp)}${opts.source ? ` (${opts.source})` : ''}`);
  while (left > 0) {
    const targets = damageable(ctx, sp, opts.kinds);
    if (targets.length === 0) break;
    const seen = new Set<string>();
    const gr = targets.filter((p) => {
      const key = `${p.kind}:${effDmg(ctx, p)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const options: Option[] = gr.map((p) => {
      const rh = healthOf(gs, sp, p.kind) - effDmg(ctx, p);
      return {
        key: `${p.kind}:${effDmg(ctx, p)}`,
        label: left >= rh ? `Destroy ${pieceLabel(p, effDmg(ctx, p))} — ${rh} Damage` : `Damage ${pieceLabel(p, effDmg(ctx, p))} +${left}`,
        piece: p.kind,
        dmg: effDmg(ctx, p),
        space: sp.id,
      };
    });
    const k = yield* choose(gs, owner, `Assign Damage in ${landName(sp)} (${left} left)`, options, {
      source: opts.source ?? ctx?.source,
      focus: [sp.id],
      kind: 'damage',
      about: { space: sp.id, n: left },
    });
    const p = targets.find((q) => `${q.kind}:${effDmg(ctx, q)}` === k)!;
    const use = Math.min(left, healthOf(gs, sp, p.kind) - effDmg(ctx, p));
    left -= use;
    if (yield* hit(ctx, gs, sp, p, use)) killed++;
  }
  return killed;
}

/** `n` Damage to each Invader (of the given kinds) present now. */
export function* damageEach(ctx: Ctx | null, gs: GameState, sp: Space, n: number, kinds?: readonly InvaderKind[]): Eff<number> {
  let killed = 0;
  const targets = damageable(ctx, sp, kinds);
  if (targets.length) log(gs, `${n} Damage to each ${kinds ? kinds.map((k) => PIECE_LABEL[k]).join(' / ') : 'Invader'} in ${landName(sp)}`);
  for (const p of targets) {
    if (!sp.pieces.includes(p)) continue;
    if (yield* hit(ctx, gs, sp, p, n)) killed++;
  }
  return killed;
}

/** `n` Damage to one chosen Invader of the given kinds. */
export function* damageOne(ctx: Ctx, sp: Space, n: number, kinds: readonly InvaderKind[]): Eff<boolean> {
  const targets = damageable(ctx, sp, kinds);
  if (!targets.length) return false;
  const gr = groups(targets);
  const k = yield* choose(
    ctx.gs,
    ctx.self.index,
    `${n} Damage to which Invader?`,
    gr.map((p) => ({ key: pieceKey(p), label: pieceLabel(p), piece: p.kind, dmg: p.dmg, space: sp.id })),
    { focus: [sp.id], kind: 'damage', about: { space: sp.id, n } },
  );
  const p = targets.find((q) => pieceKey(q) === k)!;
  return yield* hit(ctx, ctx.gs, sp, p, n);
}

/** Destroy a specific piece (handles Fear, Infinite Vitality, Bringer, Vengeance of the Dead). */
export function* destroyPiece(ctx: Ctx | null, gs: GameState, sp: Space, p: Piece, why = ''): Eff<boolean> {
  if (!sp.pieces.includes(p)) return false;
  if (p.kind === 'dahan' && sp.mods.dahanImmune) {
    log(gs, `Dahan in ${landName(sp)} ignore Destruction (Infinite Vitality)`);
    return false;
  }
  if (dreams(ctx)) {
    if (isInvader(p.kind)) yield* dreamDestroy(ctx, sp, p);
    else log(gs, `To Dream a Thousand Deaths: Bringer's Powers cannot destroy Dahan`);
    return false;
  }
  sp.pieces.splice(sp.pieces.indexOf(p), 1);
  log(gs, `Destroyed ${PIECE_LABEL[p.kind]} in ${landName(sp)}${why ? ` (${why})` : ''}`);
  if (p.kind === 'town') addFear(gs, 1);
  if (p.kind === 'city') addFear(gs, 2);
  checkEnd(gs);
  if (p.kind !== 'explorer' && sp.mods.vengeance?.length) {
    for (const v of sp.mods.vengeance) {
      const avenger = gs.spirits[v.spirit];
      const vctx = ctxFor(gs, avenger, 'Vengeance of the Dead', { power: { id: 'vengeance-of-the-dead', kind: 'card' }, target: sp });
      let where = sp;
      if (v.adjacent) {
        const opts = [sp, ...adjacent(gs, sp).filter((s) => s.num > 0)].filter((s) => hasInvaders(s));
        if (opts.length > 1) {
          const k = yield* choose(gs, avenger.index, 'Vengeance of the Dead: deal 1 Damage in which land?', opts.map((s) => ({ key: s.id, label: landName(s), space: s.id })), { sourceId: 'card:vengeance-of-the-dead' });
          where = space(gs, k);
        } else if (opts.length === 1) where = opts[0];
      }
      yield* damage(vctx, gs, where, 1, { source: 'Vengeance of the Dead' });
    }
  }
  return true;
}

/** Bringer: would-be destruction becomes Fear, and Explorers / Towns are Pushed instead. */
function* dreamDestroy(ctx: Ctx, sp: Space, p: Piece): Eff {
  const gs = ctx.gs;
  ctx.dreamed ??= new Set();
  if (ctx.dreamed.has(p)) return;
  ctx.dreamed.add(p);
  const fear = p.kind === 'town' ? 2 : p.kind === 'city' ? 5 : 0;
  log(gs, `To Dream a Thousand Deaths: the ${PIECE_LABEL[p.kind]} in ${landName(sp)} suffers nightmares`);
  if (fear) addFear(gs, fear, ctx);
  if (p.kind === 'explorer' || p.kind === 'town') {
    const dests = pushDestinations(gs, sp, true);
    if (dests.length) {
      const k = yield* choose(gs, ctx.self.index, `Push the terrified ${PIECE_LABEL[p.kind]} to…`, dests.map(destOpt), { focus: [sp.id], kind: 'pushTo', about: { space: sp.id, piece: p.kind } });
      yield* movePiece(ctx, gs, sp, space(gs, k), p);
    }
  }
}

/** Destroy up to `n` (or all) pieces of the given kinds; the player picks among distinct groups. */
export function* destroyKinds(ctx: Ctx | null, gs: GameState, sp: Space, kinds: readonly PieceKind[], n: number | 'all', why = ''): Eff<number> {
  let done = 0;
  const skip = new Set<Piece>();
  while (n === 'all' || done < n) {
    const cands = sp.pieces.filter(
      (p) => kinds.includes(p.kind) && !skip.has(p) && !(dreams(ctx) && ctx.dreamed?.has(p)) && !(p.kind === 'dahan' && sp.mods.dahanImmune),
    );
    if (!cands.length) break;
    let p: Piece;
    const kindsPresent = [...new Set(cands.map((c) => c.kind))];
    if (n !== 'all' && kindsPresent.length > 1) {
      const k = yield* choose(
        gs,
        ctx?.self.index ?? -1,
        `Destroy which piece in ${landName(sp)}?`,
        kindsPresent.map((kind) => ({ key: kind, label: PIECE_LABEL[kind], piece: kind, space: sp.id })),
        { focus: [sp.id] },
      );
      p = leastDamaged(cands.filter((c) => c.kind === k));
    } else {
      p = leastDamaged(cands.filter((c) => c.kind === cands[0].kind));
    }
    const ok = yield* destroyPiece(ctx, gs, sp, p, why);
    if (!ok) skip.add(p);
    done++;
  }
  return done;
}

const leastDamaged = (ps: Piece[]) => ps.reduce((a, b) => (b.dmg < a.dmg ? b : a));

/** Invaders damage Dahan "as efficiently as possible". Returns Dahan destroyed. */
export function* damageDahanEfficiently(gs: GameState, sp: Space, amount: number): Eff<number> {
  if (sp.mods.dahanImmune) return 0;
  let left = amount;
  let killed = 0;
  const h = healthOf(gs, sp, 'dahan');
  // finish damaged Dahan first, then healthy ones; leftover damages one more
  const ordered = sp.pieces.filter((p) => p.kind === 'dahan').sort((a, b) => b.dmg - a.dmg);
  for (const d of ordered) {
    if (left <= 0) break;
    const need = h - d.dmg;
    if (left >= need) {
      left -= need;
      d.dmg = h;
      if (yield* destroyPiece(null, gs, sp, d, 'Ravage')) killed++;
    } else {
      d.dmg += left;
      left = 0;
      log(gs, `A Dahan in ${landName(sp)} is damaged`);
    }
  }
  return killed;
}

// ─── Movement ─────────────────────────────────────────────────────────────────

/** Where a piece can be Pushed. In-play Oceans count only for Spirit Powers (never Fear, Invaders…). */
export function pushDestinations(gs: GameState, from: Space, byPower = false): Space[] {
  return adjacent(gs, from).filter((s) => s.num > 0 || (byPower && oceanInPlay(gs, s)));
}

const destOpt = (s: Space): Option => ({ key: s.id, label: landName(s), space: s.id });

/** Move a piece between spaces: Drowning, and Thunderspeaker's Presence moving with Dahan. */
export function* movePiece(ctx: Ctx | null, gs: GameState, from: Space, to: Space, p: Piece): Eff {
  const i = from.pieces.indexOf(p);
  if (i < 0) return;
  from.pieces.splice(i, 1);
  to.pieces.push(p);
  log(gs, `${PIECE_LABEL[p.kind]} ${landName(from)} → ${landName(to)}`);
  if (p.kind === 'dahan') {
    const ts = spiritById(gs, 'thunderspeaker');
    if (ts && presenceOf(from, ts.index) > 0 && to.num > 0) {
      const go = yield* confirm(gs, ts.index, `Ally of the Dahan: move 1 Presence with the Dahan from ${from.id} to ${to.id}?`, 'Move Presence', 'Stay', {
        sourceId: 'rule:ally-of-the-dahan',
        about: { space: from.id },
        source: 'Ally of the Dahan',
        focus: [from.id, to.id],
      });
      if (go) {
        from.presence[ts.index]--;
        to.presence[ts.index] = (to.presence[ts.index] ?? 0) + 1;
        log(gs, `Thunderspeaker's Presence travels with the Dahan to ${to.id}`);
      }
    }
  }
  if (to.num === 0 && oceanInPlay(gs, to)) yield* drown(ctx, gs, to, p);
}

/** Drown a piece (Ocean's Hungry Grasp): destroy it; Invader Health becomes Energy. */
export function* drown(ctx: Ctx | null, gs: GameState, sp: Space, p: Piece): Eff {
  const ocean = spiritById(gs, 'ocean');
  if (p.kind === 'dahan' && ctx?.saveDahan && ocean && oceanInPlay(gs, sp)) {
    const coastal = lands(gs).filter((s) => s.coastal);
    const opts: Option[] = [{ key: 'drown', label: 'Let it Drown', done: true }, ...coastal.map(destOpt)];
    const k = yield* choose(gs, ocean.index, 'Tidal Boon: move the Dahan to any Coastal land instead of Drowning it?', opts, { always: true, kind: 'pushTo', sourceId: 'card:tidal-boon', about: { space: sp.id, piece: 'dahan' } });
    if (k !== 'drown') {
      sp.pieces.splice(sp.pieces.indexOf(p), 1);
      space(gs, k).pieces.push(p);
      log(gs, `The Dahan is carried safely to ${k}`);
      return;
    }
  }
  if (!sp.pieces.includes(p)) return;
  sp.pieces.splice(sp.pieces.indexOf(p), 1);
  log(gs, `${PIECE_LABEL[p.kind]} Drowned`);
  if (p.kind === 'town') addFear(gs, 1);
  if (p.kind === 'city') addFear(gs, 2);
  if (ocean && isInvader(p.kind)) {
    ocean.drownedHealth += p.kind === 'explorer' ? 1 : p.kind === 'town' ? 2 : 3;
    const x = gs.spirits.length;
    const energy = Math.floor(ocean.drownedHealth / x);
    if (energy > 0) {
      ocean.drownedHealth -= energy * x;
      ocean.energy += energy;
      log(gs, `Ocean exchanges drowned Invaders for ${energy} Energy`);
    }
  }
  checkEnd(gs);
}

/** Ocean's "Drown" effects: move a piece from a land into the Ocean of its board, drowning it. */
export function* drownFrom(ctx: Ctx, sp: Space, kinds: readonly PieceKind[], n: number): Eff<number> {
  const gs = ctx.gs;
  let done = 0;
  while (done < n) {
    const cands = piecesOf(sp, kinds);
    if (!cands.length) break;
    const gr = groups(cands);
    const k = yield* choose(gs, ctx.self.index, `Drown which piece in ${landName(sp)}?`, gr.map((p) => ({ key: pieceKey(p), label: pieceLabel(p), piece: p.kind, space: sp.id })));
    const p = cands.find((q) => pieceKey(q) === k)!;
    sp.pieces.splice(sp.pieces.indexOf(p), 1);
    const oceanSp = gs.spaces.find((s) => s.board === sp.board && s.num === 0)!;
    oceanSp.pieces.push(p);
    yield* drown(ctx, gs, oceanSp, p);
    done++;
  }
  return done;
}

/**
 * Push pieces of `kinds` out of `from`. `max` pieces; `upTo` lets the player stop early.
 * Returns where each pushed piece went.
 */
export function* push(
  ctx: Ctx,
  from: Space,
  kinds: readonly PieceKind[],
  max: number,
  upTo: boolean,
  opts: { dest?: (s: Space) => boolean; label?: string } = {},
): Eff<{ kind: PieceKind; to: Space }[]> {
  const gs = ctx.gs;
  const moved: { kind: PieceKind; to: Space }[] = [];
  while (moved.length < max) {
    const cands = piecesOf(from, kinds);
    if (!cands.length) break;
    const dests = pushDestinations(gs, from, !!ctx.power).filter((s) => !opts.dest || opts.dest(s));
    if (!dests.length) break;
    const gr = groups(cands);
    const options: Option[] = gr.map((p) => ({ key: pieceKey(p), label: `Push ${pieceLabel(p)}`, piece: p.kind, dmg: p.dmg, space: from.id }));
    if (upTo) options.push({ key: 'done', label: moved.length ? 'Done pushing' : 'Push nothing', done: true });
    const k = yield* choose(gs, ctx.self.index, `${opts.label ?? 'Push'} from ${landName(from)} (${moved.length}/${max})`, options, { focus: [from.id], kind: 'push', about: { space: from.id, n: moved.length, max } });
    if (k === 'done') break;
    const p = cands.find((q) => pieceKey(q) === k)!;
    const to = space(gs, yield* choose(gs, ctx.self.index, `Push the ${PIECE_LABEL[p.kind]} to…`, dests.map(destOpt), { focus: [from.id], kind: 'pushTo', about: { space: from.id, piece: p.kind } }));
    yield* movePiece(ctx, gs, from, to, p);
    moved.push({ kind: p.kind, to });
  }
  return moved;
}

/** Gather pieces of `kinds` into `to` from adjacent spaces. Returns the number gathered. */
export function* gather(
  ctx: Ctx,
  to: Space,
  kinds: readonly PieceKind[],
  max: number,
  upTo: boolean,
  opts: { from?: (s: Space) => boolean; label?: string } = {},
): Eff<number> {
  const gs = ctx.gs;
  let n = 0;
  while (n < max) {
    const sources = adjacent(gs, to).filter((s) => (s.num > 0 || (!!ctx.power && oceanInPlay(gs, s))) && (!opts.from || opts.from(s)));
    const options: Option[] = [];
    for (const s of sources) {
      for (const p of groups(piecesOf(s, kinds))) {
        options.push({ key: `${s.id}|${pieceKey(p)}`, label: `${pieceLabel(p)} from ${s.id}`, piece: p.kind, dmg: p.dmg, space: s.id });
      }
    }
    if (!options.length) break;
    if (upTo) options.push({ key: 'done', label: n ? 'Done gathering' : 'Gather nothing', done: true });
    const k = yield* choose(gs, ctx.self.index, `${opts.label ?? 'Gather'} into ${landName(to)} (${n}/${max})`, options, { focus: [to.id], kind: 'gather', about: { space: to.id, n, max } });
    if (k === 'done') break;
    const [sid, pk] = k.split('|');
    const src = space(gs, sid);
    const p = src.pieces.find((q) => pieceKey(q) === pk)!;
    yield* movePiece(ctx, gs, src, to, p);
    n++;
  }
  return n;
}

// ─── Blight ───────────────────────────────────────────────────────────────────

function takeBlightFromCard(gs: GameState): void {
  const b = gs.blight;
  b.onCard--;
  if (b.onCard > 0) return;
  if (!b.flipped) {
    b.flipped = true;
    const card = BLIGHT_CARD_INFO[b.card];
    b.onCard += card.perPlayer * gs.spirits.length;
    log(gs, `The last Blight leaves the Healthy Island — the island is now BLIGHTED (${card.name}). ${card.text}`, 0);
  } else {
    checkEnd(gs, 'The last Blight came off the Blight Card — the island is overrun.');
    throw new GameOver({ kind: 'DEFEAT', reason: 'The last Blight came off the Blight Card — the island is overrun.' });
  }
}

/** Blighted Island cards in the base game. */
export const BLIGHT_CARD_INFO: Record<string, { name: string; perPlayer: number; text: string }> = {
  'downward-spiral': {
    name: 'Downward Spiral',
    perPlayer: 5,
    text: 'At the start of each Invader Phase each Spirit destroys 1 of their Presence.',
  },
  'memory-fades-to-dust': {
    name: 'Memory Fades to Dust',
    perPlayer: 4,
    text: 'At the start of each Invader Phase each Spirit Forgets a Power or destroys 1 of their Presence.',
  },
};

export interface BlightOpts {
  cascade?: boolean;
  destroyPresence?: boolean;
  /** from the box instead of the Blight Card (some Setup effects) */
  fromBox?: boolean;
  why?: string;
}

/** Add 1 Blight: takes it from the Blight Card, destroys Presence, Cascades. Returns false if prevented. */
export function* addBlight(gs: GameState, sp: Space, opts: BlightOpts = {}): Eff<boolean> {
  if (sp.mods.blightStaysOnCard) {
    log(gs, `Blight would be added to ${landName(sp)}, but stays on the card (Infinite Vitality)`);
    return false;
  }
  const had = sp.blight > 0;
  if (!opts.fromBox) takeBlightFromCard(gs);
  sp.blight++;
  log(gs, `+1 Blight in ${landName(sp)}${opts.why ? ` (${opts.why})` : ''}`);
  if (opts.destroyPresence !== false) {
    for (const s of gs.spirits) {
      if (presenceOf(sp, s.index) > 0) yield* destroyPresenceAt(gs, s, sp, 'Blight');
    }
  }
  if (had && opts.cascade !== false) {
    const adj = adjacent(gs, sp).filter((s) => s.num > 0 || oceanInPlay(gs, s));
    if (adj.length) {
      const k = yield* choose(gs, -1, `Blight cascades from ${sp.id} — choose an adjacent land`, adj.map((s) => ({ ...destOpt(s), hint: s.blight ? `${s.blight} Blight` : undefined })), {
        source: 'Blight Cascade',
        focus: [sp.id],
        kind: 'cascade',
        sourceId: 'rule:blight-cascade',
        about: { space: sp.id },
      });
      yield* addBlight(gs, space(gs, k), { ...opts, why: 'Cascade', fromBox: false });
    }
  }
  return true;
}

export function removeBlight(gs: GameState, sp: Space, why = ''): boolean {
  if (sp.blight <= 0) return false;
  sp.blight--;
  gs.blight.onCard++;
  log(gs, `Removed 1 Blight from ${landName(sp)}${why ? ` (${why})` : ''}`);
  return true;
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export function* destroyPresenceAt(gs: GameState, s: SpiritState, sp: Space, why: string): Eff {
  if (presenceOf(sp, s.index) <= 0) return;
  sp.presence[s.index]--;
  s.destroyed++;
  log(gs, `${s.name}: Presence destroyed in ${landName(sp)} (${why})`);
  checkEnd(gs);
}

export function presenceLands(gs: GameState, s: SpiritState): Space[] {
  return gs.spaces.filter((sp) => presenceOf(sp, s.index) > 0);
}

export function* destroyOnePresence(gs: GameState, s: SpiritState, why: string, among?: Space[]): Eff<boolean> {
  const where = (among ?? presenceLands(gs, s)).filter((sp) => presenceOf(sp, s.index) > 0);
  if (!where.length) return false;
  const k = yield* choose(gs, s.index, `${why}: destroy 1 of your Presence`, where.map((sp) => ({ ...destOpt(sp), hint: `${presenceOf(sp, s.index)} Presence` })), { source: why, kind: 'presenceDestroy' });
  yield* destroyPresenceAt(gs, s, space(gs, k), why);
  return true;
}

export function addPresenceTo(gs: GameState, s: SpiritState, sp: Space, why = ''): void {
  sp.presence[s.index] = (sp.presence[s.index] ?? 0) + 1;
  log(gs, `${s.name}: +1 Presence in ${landName(sp)}${why ? ` (${why})` : ''}`);
}

// ─── Presence tracks / elements / energy ──────────────────────────────────────

export function energySlots(s: SpiritState): TrackSlot[] {
  return SPIRITS[s.id].energyTrack.slice(0, s.energyRevealed + 1);
}
export function cardSlots(s: SpiritState): TrackSlot[] {
  return SPIRITS[s.id].cardTrack.slice(0, s.cardRevealed + 1);
}

export function energyIncome(s: SpiritState): number {
  return Math.max(0, ...energySlots(s).map((t) => t.energy ?? 0));
}

export function cardPlays(s: SpiritState): number {
  return Math.max(0, ...cardSlots(s).map((t) => t.plays ?? 0)) + s.bonusCardPlays;
}

export function hasReclaimOne(s: SpiritState): boolean {
  return [...energySlots(s), ...cardSlots(s)].some((t) => t.reclaimOne);
}

export function anySlotCount(s: SpiritState): number {
  return [...energySlots(s), ...cardSlots(s)].filter((t) => t.any).length;
}

export function trackElements(s: SpiritState): Elements {
  const e: Elements = {};
  for (const t of [...energySlots(s), ...cardSlots(s)]) if (t.element) e[t.element] = (e[t.element] ?? 0) + 1;
  return e;
}

/** All Elements a Spirit has this turn. */
export function elementsOf(s: SpiritState): Elements {
  const e: Elements = { ...trackElements(s) };
  for (const id of s.played) for (const el of CARDS[id].elements) e[el] = (e[el] ?? 0) + 1;
  for (const el of s.anyChoices) e[el] = (e[el] ?? 0) + 1;
  for (const el of ELEMENTS) if (s.bonusElements[el]) e[el] = (e[el] ?? 0) + (s.bonusElements[el] ?? 0);
  return e;
}

export function elementsText(e: Elements): string {
  const parts = ELEMENTS.filter((el) => (e[el] ?? 0) > 0).map((el) => `${e[el]} ${ELEMENT_LABEL[el]}`);
  return parts.length ? parts.join(', ') : 'none';
}

export function gainEnergy(gs: GameState, s: SpiritState, n: number, why = ''): void {
  if (n === 0) return;
  s.energy = Math.max(0, s.energy + n);
  log(gs, `${s.name} ${n > 0 ? 'gains' : 'loses'} ${Math.abs(n)} Energy${why ? ` (${why})` : ''}`);
}

export function* chooseElement(gs: GameState, owner: number, prompt: string, among: readonly Element[] = ELEMENTS): Eff<Element> {
  const k = yield* choose(gs, owner, prompt, among.map((el) => ({ key: el, label: ELEMENT_LABEL[el], element: el })), { always: true });
  return k as Element;
}

// ─── Power Cards ──────────────────────────────────────────────────────────────

export function drawPowerCards(gs: GameState, deck: 'minor' | 'major', n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let pile = deck === 'minor' ? gs.minorDeck : gs.majorDeck;
    if (pile.length === 0) {
      const disc = deck === 'minor' ? gs.minorDiscard : gs.majorDiscard;
      if (disc.length === 0) break;
      const re = shuffled(gs.rng, disc);
      disc.length = 0;
      if (deck === 'minor') gs.minorDeck = re;
      else gs.majorDeck = re;
      pile = re;
      log(gs, `${deck === 'minor' ? 'Minor' : 'Major'} Power discard reshuffled`);
    }
    out.push(pile.shift()!);
  }
  return out;
}

export function discardPowerCard(gs: GameState, id: string): void {
  const t = CARDS[id].type;
  if (t === 'minor') gs.minorDiscard.push(id);
  else if (t === 'major') gs.majorDiscard.push(id);
}

/** "Gain a Power Card": choose Minor or Major, draw 4, keep 1. Gaining a Major forces a Forget. */
export function* gainPowerCard(
  gs: GameState,
  s: SpiritState,
  opts: { deck?: 'minor' | 'major'; source?: string } = {},
): Eff<{ kept: string | null; rest: string[]; forgot: string | null }> {
  let deck = opts.deck;
  if (!deck) {
    deck = (yield* choose(gs, s.index, `${s.name}: gain a Minor or a Major Power?`, [
      { key: 'minor', label: 'Minor Power', hint: `${gs.minorDeck.length} in deck` },
      { key: 'major', label: 'Major Power', hint: 'must Forget a Power Card' },
    ], { source: opts.source ?? 'Gain Power Card', always: true, kind: 'powerDeck' })) as 'minor' | 'major';
  }
  const drawn = drawPowerCards(gs, deck, 4);
  if (!drawn.length) return { kept: null, rest: [], forgot: null };
  const k = yield* choose(gs, s.index, `Choose 1 ${deck === 'minor' ? 'Minor' : 'Major'} Power to keep`, drawn.map((id) => ({ key: id, label: CARDS[id].name, card: id })), {
    source: opts.source ?? 'Gain Power Card',
    always: true,
    kind: 'cardKeep',
  });
  s.hand.push(k);
  const rest = drawn.filter((id) => id !== k);
  for (const id of rest) discardPowerCard(gs, id);
  log(gs, `${s.name} gains ${CARDS[k].name}`);
  let forgot: string | null = null;
  if (deck === 'major') forgot = yield* forgetPowerCard(gs, s, 'You gained a Major Power: Forget a Power Card');
  return { kept: k, rest, forgot };
}

/** Forget a Power Card from hand, discard, or play. */
export function* forgetPowerCard(gs: GameState, s: SpiritState, prompt: string, opts: { optional?: boolean } = {}): Eff<string | null> {
  const options: Option[] = [
    ...s.hand.map((id) => ({ key: `hand:${id}`, label: `${CARDS[id].name} (hand)`, card: id })),
    ...s.played.map((id) => ({ key: `played:${id}`, label: `${CARDS[id].name} (in play)`, card: id })),
    ...s.discard.map((id) => ({ key: `discard:${id}`, label: `${CARDS[id].name} (discard)`, card: id })),
  ];
  if (opts.optional) options.push({ key: 'none', label: "Don't Forget", done: true });
  if (!options.length) return null;
  const k = yield* choose(gs, s.index, prompt, options, { always: true, source: 'Forget a Power', kind: 'cardForget' });
  if (k === 'none') return null;
  const [where, id] = k.split(':') as ['hand' | 'played' | 'discard', string];
  const pile = s[where];
  pile.splice(pile.indexOf(id), 1);
  discardPowerCard(gs, id);
  log(gs, `${s.name} Forgets ${CARDS[id].name}`);
  return id;
}

export function reclaimAll(gs: GameState, s: SpiritState): void {
  if (!s.discard.length) return;
  s.hand.push(...s.discard);
  log(gs, `${s.name} Reclaims ${s.discard.length} card${s.discard.length > 1 ? 's' : ''}`);
  s.discard = [];
}

export function* reclaimOne(gs: GameState, s: SpiritState, why = 'Reclaim One'): Eff<boolean> {
  if (!s.discard.length) return false;
  const k = yield* choose(gs, s.index, `${why}: return 1 card from your discard to hand`, [
    ...s.discard.map((id) => ({ key: id, label: CARDS[id].name, card: id })),
    { key: 'none', label: 'None', done: true },
  ], { always: true, source: why, kind: 'cardReclaim' });
  if (k === 'none') return false;
  s.discard.splice(s.discard.indexOf(k), 1);
  s.hand.push(k);
  log(gs, `${s.name} Reclaims ${CARDS[k].name}`);
  return true;
}

// ─── Range & targeting ────────────────────────────────────────────────────────

/** BFS distances over spaces Powers can use (lands, plus in-play Oceans). */
export function distancesFrom(gs: GameState, from: Space[], max: number): Map<string, number> {
  const ok = new Set(powerSpaces(gs).map((s) => s.id));
  const dist = new Map<string, number>();
  const queue: Space[] = [];
  for (const s of from) if (ok.has(s.id) && !dist.has(s.id)) { dist.set(s.id, 0); queue.push(s); }
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur.id)!;
    if (d >= max) continue;
    for (const n of adjacent(gs, cur)) {
      if (ok.has(n.id) && !dist.has(n.id)) {
        dist.set(n.id, d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Lands a Power's Range is measured from (own Presence, plus Entwined partners'). */
export function rangeSources(gs: GameState, s: SpiritState, r: RangeSpec): Space[] {
  const who = [s, ...s.entwined.map((i) => gs.spirits[i])];
  return gs.spaces.filter((sp) =>
    who.some((w) => {
      if (presenceOf(sp, w.index) <= 0) return false;
      if (r.sacred && !isSacredSite(gs, w, sp)) return false;
      if (r.fromTerrain && !r.fromTerrain.includes(powerTerrain(gs, sp) as never)) return false;
      return true;
    }),
  );
}

export function landMatches(gs: GameState, sp: Space, f: LandFilter): boolean {
  switch (f.t) {
    case 'any': return true;
    case 'coastal': return isCoastalForPowers(gs, sp);
    case 'inland': return sp.num > 0 && !sp.coastal;
    case 'terrain': return f.terrains.includes(powerTerrain(gs, sp) as never);
    case 'invaders': return hasInvaders(sp);
    case 'noInvaders': return !hasInvaders(sp);
    case 'dahan': return dahanCount(sp) > 0;
    case 'blight': return sp.blight > 0;
    case 'noBlight': return sp.blight === 0;
  }
}

export const FILTER_LABEL = (f: LandFilter): string => {
  switch (f.t) {
    case 'any': return 'any land';
    case 'coastal': return 'a Coastal land';
    case 'inland': return 'an Inland land';
    case 'terrain': return f.terrains.map((t) => TERRAIN_LABEL[t]).join(' / ');
    case 'invaders': return 'a land with Invaders';
    case 'noInvaders': return 'a land without Invaders';
    case 'dahan': return 'a land with Dahan';
    case 'blight': return 'a land with Blight';
    case 'noBlight': return 'a land without Blight';
  }
};

/** Lands a Power could target, and whether Shadows must pay 1 Energy to reach them. */
export function landTargets(gs: GameState, s: SpiritState, r: RangeSpec, f: LandFilter, bonus = 0): { sp: Space; paid: boolean }[] {
  const n = r.n + bonus + s.rangeBonus;
  const dist = distancesFrom(gs, rangeSources(gs, s, r), n);
  const out: { sp: Space; paid: boolean }[] = [];
  for (const sp of powerSpaces(gs)) {
    if (!landMatches(gs, sp, f)) continue;
    if (dist.has(sp.id)) out.push({ sp, paid: false });
    else if (s.id === 'shadows' && s.energy >= 1 && dahanCount(sp) > 0) out.push({ sp, paid: true });
  }
  return out;
}

export function* chooseLandTarget(gs: GameState, s: SpiritState, r: RangeSpec, f: LandFilter, source: string, bonus = 0): Eff<Space | null> {
  const cands = landTargets(gs, s, r, f, bonus);
  if (!cands.length) return null;
  const options: Option[] = cands.map(({ sp, paid }) => ({
    key: sp.id,
    label: landName(sp),
    space: sp.id,
    hint: paid ? 'pay 1 Energy (Shadows of the Dahan)' : undefined,
  }));
  options.push({ key: 'cancel', label: 'Cancel', done: true });
  const k = yield* choose(gs, s.index, `${source}: choose a target land (${FILTER_LABEL(f)}, Range ${r.n + bonus + s.rangeBonus}${r.sacred ? ' from Sacred Site' : ''})`, options, {
    always: true,
    source,
    kind: 'targetLand',
  });
  if (k === 'cancel') return null;
  const pick = cands.find((c) => c.sp.id === k)!;
  if (pick.paid) gainEnergy(gs, s, -1, 'Shadows of the Dahan');
  return pick.sp;
}

export function* chooseSpiritTarget(gs: GameState, s: SpiritState, who: 'any' | 'another', source: string): Eff<SpiritState | null> {
  const cands = gs.spirits.filter((x) => who === 'any' || x !== s || gs.spirits.length === 1);
  const options: Option[] = cands.map((x) => ({ key: String(x.index), label: x === s ? `${x.name} (yourself)` : x.name, spirit: x.index }));
  options.push({ key: 'cancel', label: 'Cancel', done: true });
  const k = yield* choose(gs, s.index, `${source}: choose a target Spirit`, options, { always: true, source, kind: 'targetSpirit' });
  if (k === 'cancel') return null;
  return gs.spirits[Number(k)];
}

// ─── Presence placement (Growth & Powers) ─────────────────────────────────────

/** Can Spirit `s` add / move Presence into this space at all? */
export function presenceAllowed(_gs: GameState, s: SpiritState, sp: Space, ignoreTerrain = false): boolean {
  if (s.id === 'ocean') {
    if (ignoreTerrain) return sp.num > 0 || sp.num === 0;
    return sp.num === 0 || sp.coastal;
  }
  return sp.num > 0;
}

function presenceFilterOk(sp: Space, f?: PresenceFilter): boolean {
  switch (f) {
    case undefined: return true;
    case 'dahan': return dahanCount(sp) > 0;
    case 'dahanOrInvaders': return dahanCount(sp) > 0 || hasInvaders(sp);
    case 'jungleWetland': return sp.terrain === 'JUNGLE' || sp.terrain === 'WETLAND';
    case 'ocean': return sp.num === 0;
    case 'coastal': return sp.coastal;
  }
}

export function presenceDestinations(gs: GameState, s: SpiritState, range: number | 'any', f?: PresenceFilter, from?: Space[]): Space[] {
  const all = gs.spaces.filter((sp) => presenceAllowed(gs, s, sp) && presenceFilterOk(sp, f));
  if (range === 'any') return all;
  // Range for Growth counts over every space this Spirit's Presence can be in.
  const srcs = from ?? presenceLands(gs, s);
  const ok = new Set(gs.spaces.filter((sp) => sp.num > 0 || (s.id === 'ocean' && sp.num === 0)).map((sp) => sp.id));
  const dist = new Map<string, number>();
  const queue = srcs.filter((sp) => ok.has(sp.id));
  for (const q of queue) dist.set(q.id, 0);
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur.id)!;
    if (d >= range) continue;
    for (const n of adjacent(gs, cur)) if (ok.has(n.id) && !dist.has(n.id)) { dist.set(n.id, d + 1); queue.push(n); }
  }
  return all.filter((sp) => dist.has(sp.id));
}

export type PresenceSource = 'energy' | 'card' | 'destroyed' | `move:${string}`;

function trackRevealHint(slot: TrackSlot | undefined): string {
  if (!slot) return '';
  if (slot.energy !== undefined) return `reveals ${slot.energy} Energy`;
  if (slot.plays !== undefined) return `reveals ${slot.plays} Card Plays`;
  if (slot.element) return `reveals ${ELEMENT_LABEL[slot.element]}`;
  if (slot.any) return 'reveals any Element';
  if (slot.reclaimOne) return 'reveals Reclaim One';
  return '';
}

/** Ask where a new Presence comes from: a track, the board (move), or (Rampant Green) destroyed Presence. */
export function* choosePresenceSource(gs: GameState, s: SpiritState, viaGrowth: boolean, exclude?: Space): Eff<PresenceSource | null> {
  const data = SPIRITS[s.id];
  const options: Option[] = [];
  if (s.energyRevealed < data.energyTrack.length - 1) {
    options.push({ key: 'energy', label: 'From Energy track', hint: trackRevealHint(data.energyTrack[s.energyRevealed + 1]) });
  }
  if (s.cardRevealed < data.cardTrack.length - 1) {
    options.push({ key: 'card', label: 'From Card Play track', hint: trackRevealHint(data.cardTrack[s.cardRevealed + 1]) });
  }
  if (viaGrowth && s.id === 'green' && s.destroyed > 0 && (!gs.blight.flipped || s.energy >= 1)) {
    options.push({ key: 'destroyed', label: 'Destroyed Presence (Steady Regeneration)', hint: gs.blight.flipped ? 'costs 1 Energy' : 'free while Healthy' });
  }
  for (const sp of presenceLands(gs, s)) {
    if (sp === exclude) continue;
    options.push({ key: `move:${sp.id}`, label: `Move 1 from ${landName(sp)}`, space: sp.id });
  }
  if (!options.length) return null;
  return (yield* choose(gs, s.index, 'Take the Presence from…', options, { source: 'Add Presence', kind: 'presenceTrack' })) as PresenceSource;
}

/** Take a Presence from its source and put it on `dest`. */
export function placePresence(gs: GameState, s: SpiritState, src: PresenceSource, dest: Space, why = ''): void {
  if (src === 'energy') s.energyRevealed++;
  else if (src === 'card') s.cardRevealed++;
  else if (src === 'destroyed') {
    s.destroyed--;
    if (gs.blight.flipped) gainEnergy(gs, s, -1, 'Steady Regeneration');
  } else {
    const from = space(gs, src.slice(5));
    from.presence[s.index]--;
  }
  addPresenceTo(gs, s, dest, why);
}

/** Add 1 Presence within `range` (Growth / "Add 1 Presence" effects). */
export function* addPresence(
  gs: GameState,
  s: SpiritState,
  range: number | 'any',
  f: PresenceFilter | undefined,
  why: string,
  opts: { viaGrowth?: boolean; only?: Space[] } = {},
): Eff<boolean> {
  const dests = opts.only ?? presenceDestinations(gs, s, range, f);
  if (!dests.length) {
    log(gs, `${s.name}: nowhere to add Presence (${why})`);
    return false;
  }
  const dk = yield* choose(gs, s.index, `${why}: add a Presence${range === 'any' ? '' : ` (Range ${range})`}`, dests.map((sp) => ({ ...destOpt(sp), hint: presenceOf(sp, s.index) ? `${presenceOf(sp, s.index)} here` : undefined })), {
    source: why,
    kind: 'presenceAdd',
  });
  const dest = space(gs, dk);
  const src = yield* choosePresenceSource(gs, s, !!opts.viaGrowth, dest);
  if (!src) return false;
  placePresence(gs, s, src, dest, why);
  return true;
}

// ─── misc ─────────────────────────────────────────────────────────────────────

export function remaining(gs: GameState, sp: Space, p: Piece): number {
  return remainingHealth(gs, sp, p);
}

export function invaderHealthTotal(gs: GameState, sp: Space): number {
  return invaders(sp).reduce((a, p) => a + healthOf(gs, sp, p.kind), 0);
}

/** Remove up to `health` worth of Invaders (Fear cards), player choosing which. */
export function* removeHealthWorth(ctx: Ctx, sp: Space, health: number): Eff<number> {
  const gs = ctx.gs;
  let left = health;
  let n = 0;
  for (;;) {
    const cands = invaders(sp).filter((p) => healthOf(gs, sp, p.kind) <= left);
    if (!cands.length) break;
    const kinds = [...new Set(cands.map((p) => p.kind))];
    const k = yield* choose(gs, ctx.self.index, `Remove Invaders from ${landName(sp)} (${left} Health left)`, [
      ...kinds.map((kind) => ({ key: kind, label: `Remove ${PIECE_LABEL[kind]}`, piece: kind, space: sp.id })),
      { key: 'done', label: 'Done', done: true },
    ], { focus: [sp.id] });
    if (k === 'done') break;
    const p = cands.find((q) => q.kind === k)!;
    left -= healthOf(gs, sp, p.kind);
    removePiece(gs, sp, p, ctx.source);
    n++;
  }
  return n;
}

/** Remove 1 piece of the given kinds from a chosen land among `where` (Fear cards). */
export function* removeOneFrom(ctx: Ctx, where: Space[], kinds: readonly InvaderKind[], prompt: string): Eff<boolean> {
  const gs = ctx.gs;
  const options: Option[] = [];
  for (const sp of where) {
    for (const kind of kinds) if (count(sp, kind) > 0) options.push({ key: `${sp.id}|${kind}`, label: `${PIECE_LABEL[kind]} from ${landName(sp)}`, space: sp.id, piece: kind });
  }
  if (!options.length) return false;
  const k = yield* choose(gs, ctx.self.index, prompt, options, { source: ctx.source });
  const [sid, kind] = k.split('|');
  const sp = space(gs, sid);
  removePiece(gs, sp, sp.pieces.find((p) => p.kind === kind)!, ctx.source);
  return true;
}
