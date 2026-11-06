// Heuristic AI for Spirit Island.
//
// Most decisions are made by one-step lookahead: for each option, replay the game
// to this point, apply the option, auto-finish the rest of the current action with
// quick rules (`quickPick`), and score the resulting position (`evaluate`). Because
// the engine is deterministic and replays fast (~13µs per logged answer), this works
// uniformly for every card and rule. Menus where the payoff is far away (which cards
// to play, which card to draft) use rules of thumb instead (`cardValue`).

import { CARD_EFFECTS } from './cards';
import { CARDS } from './cardData';
import { GameOver } from './decide';
import type { Decision, Eff, Option } from './decide';
import { tiersMet } from './innates';
import { applyAnswer, replay } from './game';
import type { Game } from './game';
import { cardPlays, distancesFrom, elementsOf, energyIncome, landTargets, presenceLands } from './ops';
import { matchesCard } from './setup';
import { SPIRITS } from './spiritData';
import {
  attackOf,
  count,
  dahanCount,
  hasInvaders,
  invaderCount,
  invaders,
  isSacredSite,
  lands,
  meetsThreshold,
  presenceOf,
  presenceOnIsland,
  space,
  spiritById,
  totalPresenceIn,
} from './state';
import type { GameState, Space, SpiritState } from './state';
import type { Element, Elements } from './types';

// ─── Position evaluation ──────────────────────────────────────────────────────

/** Evaluation weights (tuned against tests/engine/aiBench.test.ts). */
export const W = {
  explorer1: 1.3, explorerLate: 0.5, town: 3.4, townTL3: 1.2, city: 5.5,
  blight: 6, cardHealthy: 18, cardFlippedBase: 30, cardFlipped: 60,
  fearCard: 15, earnedUnresolved: 3, tl2: 24, tl3: 60,
  dahan: 1.0,
  presence: 2.5, lastPresence: 60, twoPresence: 15, track: 3.0, energy: 1.0, hand: 0.6, discard: 0.4,
  reach: 0.6, sacred: 1.0, spread: 0, oceanPresence: 2.5,
  ravageBlight: 11, ravageCascade: 9, ravagePresence: 3, ravageDahan: 1.2, fightBack: 2.5,
  buildCity: 3.5, buildTown: 2.6,
};

/** Projected damage of the coming Ravage / Build (cards already in their action spaces). */
export function threat(gs: GameState): number {
  const W = activeW;
  let t = 0;
  const earth = spiritById(gs, 'earth');
  const ts = spiritById(gs, 'thunderspeaker');
  for (const c of gs.invader.ravage) {
    for (const sp of lands(gs)) {
      if (!matchesCard(sp, c) || !hasInvaders(sp) || sp.mods.skipAll || sp.mods.skipRavage) continue;
      const attack = invaders(sp).reduce((a, p) => a + attackOf(gs, p.kind as 'explorer' | 'town' | 'city'), 0);
      const def = sp.defend + (earth && isSacredSite(gs, earth, sp) ? 3 : 0);
      const dmg = Math.max(0, attack - def);
      if (dmg >= 2) t += W.ravageBlight + (sp.blight > 0 ? W.ravageCascade : 0) + W.ravagePresence * totalPresenceIn(sp) + (gs.blight.onCard <= 2 ? 10 : 0);
      // Sweden 1 (Heavy Mining): 6+ Damage adds a second Blight
      if (dmg >= 6 && gs.setup.adversary === 'sweden' && gs.setup.adversaryLevel >= 1) t += 9;
      const d = dahanCount(sp);
      const killed = sp.mods.dahanSafe ? 0 : Math.min(d, Math.floor(dmg / 2));
      t += W.ravageDahan * killed;
      // Thunderspeaker (Sworn to Victory): each Dahan a Ravage kills costs a nearby Presence
      if (ts && killed > 0) {
        const near = [sp, ...sp.adj.map((id) => space(gs, id))].reduce((a, x) => a + presenceOf(x, ts.index), 0);
        t += W.ravagePresence * 1.5 * Math.min(killed, near);
      }
      // surviving Dahan strike back
      t -= Math.min(W.fightBack * (d - killed), 0.8 * attack);
    }
  }
  const builds = [...gs.invader.build, ...(gs.invader.highImmigration ?? [])];
  const englandServants = gs.setup.adversary === 'england' && gs.setup.adversaryLevel >= 1;
  for (const c of builds) {
    for (const sp of lands(gs)) {
      if (!matchesCard(sp, c) || sp.mods.skipAll || sp.mods.skipBuild) continue;
      if (!hasInvaders(sp)) {
        // England 1: Build Cards also hit empty lands next to 2+ Town / City
        const near = englandServants ? sp.adj.reduce((a, id) => a + count(space(gs, id), 'town') + count(space(gs, id), 'city'), 0) : 0;
        if (near < 2) continue;
      }
      t += count(sp, 'town') > count(sp, 'city') ? W.buildCity : W.buildTown;
    }
  }
  // England: Proud & Mighty Capital (7+ Town / City in one land loses)
  if (gs.setup.adversary === 'england') {
    for (const sp of lands(gs)) {
      const tc = count(sp, 'town') + count(sp, 'city');
      if (tc >= 4) t += (tc - 3) * (tc - 3) * 4;
    }
  }
  return t;
}

/** Per-Spirit adjustments to W, applied while that Spirit is in the game. */
export const SPIRIT_W: Partial<Record<SpiritState['id'], Partial<typeof W>>> = {};

let activeW: typeof W = W;
function weightsFor(gs: GameState): typeof W {
  const extra = gs.spirits.map((s) => SPIRIT_W[s.id]).filter(Boolean);
  if (!extra.length) return W;
  return Object.assign({}, W, ...extra);
}

/** Score a position for the Spirits (all players are one team). Higher is better. */
export function evaluate(gs: GameState): number {
  const prev = activeW;
  activeW = weightsFor(gs);
  try {
    return evaluateWith(gs, activeW);
  } finally {
    activeW = prev;
  }
}

function evaluateWith(gs: GameState, W: typeof activeW): number {
  const r = gs.result.kind;
  if (r === 'VICTORY') return 1e6 + gs.invader.deck.length;
  if (r === 'SACRIFICE_VICTORY') return 5e5;
  if (r === 'DEFEAT') return -1e6 + gs.turn;
  const f = gs.fear;
  const tl = f.terrorLevel;
  // what still has to go for victory matters most
  const wE = tl === 1 ? W.explorer1 : W.explorerLate;
  const wT = tl <= 2 ? W.town : W.townTL3;
  const wC = W.city;
  let v = 0;
  let blight = 0;
  let dahan = 0;
  for (const sp of lands(gs)) {
    blight += sp.blight;
    for (const p of sp.pieces) {
      if (p.kind === 'dahan') dahan++;
      else {
        const w = p.kind === 'explorer' ? wE : p.kind === 'town' ? wT : wC;
        v -= w * (1 - 0.15 * p.dmg);
      }
    }
  }
  v -= W.blight * blight;
  v += W.dahan * dahan;
  const left = gs.blight.onCard;
  v -= gs.blight.flipped ? W.cardFlippedBase + W.cardFlipped / (left + 0.5) : W.cardHealthy / (left + 1);
  v += W.fearCard * (f.earnedTotal + f.generated / f.poolSize) + W.earnedUnresolved * f.earned.length;
  v += tl === 3 ? W.tl3 : tl === 2 ? W.tl2 : 0;
  for (const s of gs.spirits) {
    const p = presenceOnIsland(gs, s.index);
    const inOcean = gs.spaces.filter((x) => x.num === 0).reduce((a, x) => a + presenceOf(x, s.index), 0);
    v += W.presence * (p - inOcean) + W.oceanPresence * inOcean;
    if (p <= 1) v -= W.lastPresence;
    else if (p === 2) v -= W.twoPresence;
    v += W.track * (s.energyRevealed + s.cardRevealed);
    v += W.energy * Math.min(s.energy, 15);
    // cards are the Spirit's actions: a hand to play from matters a lot
    v += W.hand * Math.min(s.hand.length, cardPlays(s) + 3) + W.discard * s.discard.length + 0.6 * s.played.length;
    // reach: invaded lands within Range 1 of this Spirit, and Sacred Sites
    const near = distancesFrom(gs, presenceLands(gs, s), 1);
    for (const id of near.keys()) if (hasInvaders(space(gs, id))) v += W.reach;
    const mine = presenceLands(gs, s);
    for (const sp of mine) if (isSacredSite(gs, s, sp)) v += W.sacred;
    v += W.spread * mine.length;
  }
  v -= threat(gs);
  return v;
}

// ─── Card heuristics ──────────────────────────────────────────────────────────

const sumMatches = (t: string, re: RegExp) => [...t.matchAll(re)].reduce((a, m) => a + Number(m[1]), 0);

/** Next-tier elements the Spirit's Innate Powers want. */
function wantedElements(s: SpiritState, have: Elements): Set<Element> {
  const want = new Set<Element>();
  for (const inn of SPIRITS[s.id].innates) {
    const next = inn.tiers.find((t) => !meetsThreshold(have, t.need));
    if (!next) continue;
    for (const [e, n] of Object.entries(next.need) as [Element, number][]) if ((have[e] ?? 0) < n) want.add(e);
  }
  return want;
}

/** Rough worth of a Power Card for Spirit `s` right now (forPlay: also requires a sensible target). */
export function cardValue(gs: GameState, s: SpiritState, id: string, forPlay: boolean): number {
  const c = CARDS[id];
  const t = c.text;
  let v = 0;
  v += 1.1 * sumMatches(t, /(\d+) Fear/g);
  const dmg = Math.min(12, sumMatches(t, /(\d+) Damage/g));
  v += 1.3 * dmg;
  if (/Damage to each/.test(t)) v += 2;
  if (/Destroy (?:\d+ |all )?Town/.test(t)) v += 3.5;
  if (/Destroy (?:\d+ |all )?City/.test(t)) v += 5;
  if (/Destroy (?:\d+|up to \d+|all) Explorer/.test(t)) v += 1.5;
  v += 0.45 * Math.min(10, sumMatches(t, /Defend (\d+)/g));
  if (/Push[^.]*?(Explorer|Town)/.test(t)) v += 2;
  if (/Gather[^.]*?(Explorer|Town)/.test(t)) v += 0.8;
  if (/[Rr]emove 1 Blight/.test(t)) v += lands(gs).some((sp) => sp.blight > 0) ? 3.5 : 0.4;
  if (/Add 1 Blight/.test(t)) v -= 3;
  if (/[Dd]estroy (?:\d+|all) Dahan/.test(t)) v -= 2;
  v += 0.9 * sumMatches(t, /gains? (\d+) Energy/g);
  if (/[Gg]ain(?:s)? a (?:Minor |Major )?Power/.test(t)) v += 2.5;
  if (/skip all Actions/.test(t)) v += 5;
  if (/Add 1 Presence/.test(t)) v += 2.5;
  if (/Repeat|as if they were Fast|\+2 Range/.test(t)) v += 2;
  // elements: thresholds on the card itself, and innates it helps reach
  const after: Elements = { ...elementsOf(s) };
  for (const e of c.elements) after[e] = (after[e] ?? 0) + 1;
  const want = wantedElements(s, elementsOf(s));
  for (const e of c.elements) if (want.has(e)) v += 0.7;
  const thr = t.match(/If you have ([^:]+):/);
  if (thr) {
    const need: Elements = {};
    for (const part of thr[1].split(',')) {
      const m = part.trim().match(/(\d+) (\w+)/);
      if (m) need[m[2].toUpperCase() as Element] = Number(m[1]);
    }
    if (meetsThreshold(after, need)) v += 3;
  }
  v -= 0.45 * c.cost;
  if (!forPlay) {
    if (c.cost > energyIncome(s) * 2.5 + 1) v -= 2;
    return v;
  }
  if (c.target.kind === 'land') {
    const tg = landTargets(gs, s, c.target.range, c.target.filter).map((x) => x.sp);
    if (!tg.length) return -5;
    const offensive = dmg > 0 || /Destroy|Push[^.]*?(Explorer|Town)/.test(t);
    if (offensive && !tg.some(hasInvaders)) v *= 0.3;
    const urgent = tg.some((sp) => gs.invader.ravage.some((card) => matchesCard(sp, card)) && hasInvaders(sp));
    if (urgent) v *= 1.25;
  }
  return v;
}

// ─── Quick rules (used to finish an action during lookahead) ──────────────────

function danger(gs: GameState, sp: Space): number {
  let d = 0;
  if (gs.invader.ravage.some((c) => matchesCard(sp, c))) d += 3;
  if (gs.invader.build.some((c) => matchesCard(sp, c))) d += 2;
  return d;
}

function presenceLandScore(gs: GameState, s: SpiritState, sp: Space): number {
  let v = 0;
  if (hasInvaders(sp)) v += 1 + 0.5 * invaderCount(sp);
  v += 0.6 * dahanCount(sp);
  const mine = presenceOf(sp, s.index);
  if (mine === 1) v += 2.5;
  if (mine >= 2) v -= 0.5;
  if (sp.blight > 0) v -= 2;
  if (gs.invader.ravage.some((c) => matchesCard(sp, c)) && hasInvaders(sp)) v -= 3;
  if (s.id === 'thunderspeaker' && dahanCount(sp)) v += 1;
  return v;
}

const KILL: Record<string, number> = { city: 5, town: 3, explorer: 1 };

/** A fast, reasonable default for any decision. */
export function quickPick(gs: GameState, dec: Decision): string {
  const opts = dec.options;
  const live = opts.filter((o) => !o.done && o.key !== 'cancel');
  if (!live.length) return opts[0].key;
  if (live.length === 1) return live[0].key;
  const s = dec.owner >= 0 ? gs.spirits[dec.owner] : gs.spirits[0];
  if (opts.some((o) => o.element)) return pickElement(s, opts);
  if (isPresenceSource(dec)) return pickPresenceSource(s, opts);
  // Damage allocation: destroy the most valuable Invader you can.
  if (live.every((o) => o.piece) && /Assign Damage|Damage to which|Destroy which/.test(dec.prompt)) {
    return [...live].sort((a, b) => scorePiece(b) - scorePiece(a))[0].key;
  }
  // Land choices
  if (live.every((o) => o.space)) {
    const pr = dec.prompt;
    let score: (sp: Space) => number;
    if (/Presence/.test(pr) && /add|Setup|Gather 1 Presence|Push 1 Presence/i.test(pr)) score = (sp) => presenceLandScore(gs, s, sp);
    else if (/Push the (Explorer|Town|terrified)/.test(pr)) score = (sp) => -danger(gs, sp) - 0.5 * totalPresenceIn(sp);
    else if (/Push the Dahan/.test(pr)) score = (sp) => invaderCount(sp) + danger(gs, sp);
    else if (/[Cc]ascade/.test(pr)) score = (sp) => -3 * totalPresenceIn(sp) - (sp.blight > 0 ? 5 : 0) - dahanCount(sp);
    else score = (sp) => invaderCount(sp) + danger(gs, sp) + (sp.blight > 0 ? 1 : 0);
    return [...live].sort((a, b) => score(space(gs, b.space!)) - score(space(gs, a.space!)))[0].key;
  }
  // Pushing / gathering pieces: prefer Towns over Explorers out of danger
  if (live.every((o) => o.piece)) return [...live].sort((a, b) => scorePiece(b) - scorePiece(a))[0].key;
  if (opts.some((o) => o.key === 'yes')) return 'yes';
  return live[0].key;
}

function scorePiece(o: Option): number {
  const base = KILL[o.piece ?? ''] ?? 0;
  return (/^Destroy/.test(o.label) ? 10 : 0) + base + (o.dmg ?? 0) * 0.1;
}

function isPresenceSource(dec: Decision): boolean {
  return dec.options.some((o) => o.key === 'energy' || o.key === 'card' || o.key.startsWith('move:')) && /Take the Presence/.test(dec.prompt);
}

function pickPresenceSource(s: SpiritState, opts: Option[]): string {
  const d = SPIRITS[s.id];
  // Card Plays are only useful if there is Energy to pay for them (and vice versa).
  const plays = cardPlays(s);
  const income = energyIncome(s);
  const wEnergy = plays > income + 1 ? 1.6 : income > 2 * plays + 1 ? 0.6 : 1.0;
  const wPlays = plays > income + 1 ? 0.3 : income > 2 * plays + 1 ? 1.8 : 1.2;
  const gain = (track: 'energy' | 'card') => {
    const slots = track === 'energy' ? d.energyTrack : d.cardTrack;
    const rev = track === 'energy' ? s.energyRevealed : s.cardRevealed;
    const cur = Math.max(0, ...slots.slice(0, rev + 1).map((x) => (track === 'energy' ? x.energy : x.plays) ?? 0));
    let v = 0;
    for (let i = rev + 1, w = 1; i < slots.length && i <= rev + 2; i++, w *= 0.5) {
      const sl = slots[i];
      const n = (track === 'energy' ? sl.energy : sl.plays) ?? 0;
      v += w * (Math.max(0, n - cur) * (track === 'energy' ? wEnergy : wPlays) + (sl.element || sl.any ? 0.8 : 0) + (sl.reclaimOne ? 1.0 : 0));
    }
    return v;
  };
  const cands: [string, number][] = [];
  for (const o of opts) {
    if (o.key === 'energy') cands.push([o.key, gain('energy') + 0.01]);
    else if (o.key === 'card') cands.push([o.key, gain('card') + (s.cardRevealed <= s.energyRevealed ? 0.05 : 0)]);
    else if (o.key === 'destroyed') cands.push([o.key, -0.5]);
    else cands.push([o.key, -1]);
  }
  return cands.sort((a, b) => b[1] - a[1])[0][0];
}

function pickElement(s: SpiritState, opts: Option[]): string {
  const have = elementsOf(s);
  let best = opts[0].key;
  let bestV = -1;
  for (const o of opts) {
    if (!o.element) continue;
    const e2: Elements = { ...have, [o.element]: (have[o.element] ?? 0) + 1 };
    let v = 0;
    for (const inn of SPIRITS[s.id].innates) for (const t of inn.tiers) if (meetsThreshold(e2, t.need)) v += 1;
    if (wantedElements(s, have).has(o.element)) v += 0.5;
    if (v > bestV) {
      bestV = v;
      best = o.key;
    }
  }
  return best;
}

// ─── Lookahead ────────────────────────────────────────────────────────────────

/** Answer non-menu decisions with quick rules until a menu (or the game end) is reached. */
function complete(sim: Game, maxSteps = 120): void {
  for (let i = 0; i < maxSteps; i++) {
    if (sim.gs.result.kind !== 'IN_PROGRESS') return;
    const d = sim.gs.pending.find((x) => !x.menu);
    if (!d) return;
    applyAnswer(sim, { d: d.id, k: quickPick(sim.gs, d) });
  }
}

const MAX_BRANCH = 12;

function lookahead(game: Game, dec: Decision): { key: string; scores: Record<string, number> } {
  let cands = dec.options;
  if (cands.length > MAX_BRANCH) {
    const quick = quickPick(game.gs, dec);
    const keep = new Set([quick, ...cands.filter((o) => o.done || o.key === 'cancel').map((o) => o.key)]);
    cands = [...cands.filter((o) => keep.has(o.key)), ...cands.filter((o) => !keep.has(o.key)).slice(0, MAX_BRANCH - keep.size)];
  }
  const scores: Record<string, number> = {};
  let best = cands[0].key;
  let bestV = -Infinity;
  for (const o of cands) {
    const sim = replay(game.setup, game.answers);
    if (!applyAnswer(sim, { d: dec.id, k: o.key })) continue;
    complete(sim);
    // tie-breaks: act rather than pass; aim at lands that actually hold Invaders
    const v = evaluate(sim.gs) - (o.done || o.key === 'cancel' ? 0.05 : 0);
    scores[o.key] = v;
    if (v > bestV) {
      bestV = v;
      best = o.key;
    }
  }
  return { key: best, scores };
}

// ─── Turn rollouts ────────────────────────────────────────────────────────────

/** Growth by rule of thumb (used inside rollouts). */
function quickGrowth(s: SpiritState, opts: Option[]): string {
  let best = opts[0].key;
  let bestV = -Infinity;
  for (const o of opts) {
    const l = o.label;
    const presence = (l.match(/Add Presence/g) ?? []).length;
    let v = 2 * presence + (/\+(\d+) Energy/.test(l) ? Number(l.match(/\+(\d+) Energy/)![1]) * 0.5 : 0);
    if (/Gain Power Card/.test(l)) v += s.hand.length < 4 ? 2 : 0.5;
    if (/Reclaim All/.test(l)) v += 0.9 * s.discard.length - (s.hand.length >= 3 ? 2 : 0);
    if (/Reclaim One/.test(l)) v += s.discard.length ? 1 : 0;
    if (v > bestV) {
      bestV = v;
      best = o.key;
    }
  }
  return best;
}

/** Card choices (keep / forget / reclaim / gift) by card value. */
function cardPick(gs: GameState, s: SpiritState, dec: Decision): string | null {
  const opts = dec.options;
  const cardOpts = opts.filter((o) => o.card && !o.done);
  if (!cardOpts.length || cardOpts.length !== opts.filter((o) => !o.done).length || /^(play|card|repeat):/.test(cardOpts[0].key)) return null;
  const val = (o: Option) => cardValue(gs, s, o.card!, false);
  if (/Forget|gift/.test(dec.prompt)) return [...cardOpts].sort((a, b) => val(a) - val(b))[0].key;
  return [...cardOpts].sort((a, b) => val(b) - val(a))[0].key;
}

/** The AI's fast policy: good enough to play out the rest of a turn quickly. */
function fastPolicy(gs: GameState, d: Decision): string {
  const s = d.owner >= 0 ? gs.spirits[d.owner] : null;
  if (s) {
    if (d.menu === 'play') return planPlay(gs, s, d.options);
    if (d.menu === 'power') return (d.options.find((o) => !o.done) ?? d.options[0]).key;
    if (d.menu === 'growth') return quickGrowth(s, d.options);
    if (/gain a Minor or a Major Power/.test(d.prompt)) return s.energy >= 6 && energyIncome(s) >= 3 ? 'major' : 'minor';
    const c = cardPick(gs, s, d);
    if (c) return c;
  }
  return quickPick(gs, d);
}

/** Play the rest of this turn (powers, the Invader Phase, Time Passes) with the fast policy. */
function rolloutTurn(sim: Game, maxSteps = 500): void {
  const startTurn = sim.gs.turn;
  for (let i = 0; i < maxSteps; i++) {
    const gs = sim.gs;
    if (gs.result.kind !== 'IN_PROGRESS' || !gs.pending.length) return;
    if (gs.turn > startTurn && gs.pending.some((d) => d.menu === 'growth')) return;
    const d = gs.pending.find((x) => !x.menu) ?? gs.pending[0];
    applyAnswer(sim, { d: d.id, k: fastPolicy(gs, d) });
  }
}

/** Score options by playing out the turn after each one (`turns` turns for the big menu choices). */
function rolloutChoose(game: Game, dec: Decision, keys: string[], turns = 1): string {
  let best = keys[0];
  let bestV = -Infinity;
  for (const k of keys) {
    const sim = replay(game.setup, game.answers);
    if (!applyAnswer(sim, { d: dec.id, k })) continue;
    for (let t = 0; t < turns && sim.gs.result.kind === 'IN_PROGRESS'; t++) {
      rolloutTurn(sim);
      if (t + 1 < turns) {
        // step into the next turn's Growth so the next rollout covers that whole turn
        const g = sim.gs.pending.find((d) => d.menu === 'growth');
        if (g) applyAnswer(sim, { d: g.id, k: fastPolicy(sim.gs, g) });
      }
    }
    const v = evaluate(sim.gs);
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/** Search options (the benchmark can flip these). */
export const DEEP = { targets: true, all: true, horizon: 1 };

/** Per-game memory: Powers the AI decided not to use this phase (so it stops re-opening them). */
const declined = new Map<string, Set<string>>();
const lastMenuPick = new Map<string, string>();

const memKey = (game: Game, owner: number) => `${game.setup.seed}|${game.gs.turn}|${game.gs.phase}|${owner}`;

/** Choose an option for `dec` (a pending decision of `game`). */
/** A cheap choice (no rollouts): for when a full think takes too long. */
export function aiQuickChoose(game: Game, dec: Decision): string {
  return fastPolicy(game.gs, dec);
}

export function aiChoose(game: Game, dec: Decision): string {
  const gs = game.gs;
  const opts = dec.options;
  if (opts.length === 1) return opts[0].key;
  const s = dec.owner >= 0 ? gs.spirits[dec.owner] : null;

  if (dec.menu === 'growth' && s) return rolloutChoose(game, dec, opts.map((o) => o.key), DEEP.horizon);
  if (dec.menu === 'play' && s) {
    if (opts.some((o) => o.key === 'reclaim')) return 'reclaim';
    const plays = opts.filter((o) => o.key.startsWith('play:'));
    if (!plays.length) return opts.find((o) => o.done)!.key;
    // the few most promising cards (by simulated value) plus passing, each played out to the end of the turn
    const ranked = plays.map((o) => [o.key, playValue(gs, s, o.key.slice(5))] as const).sort((a, b) => b[1] - a[1]);
    const keys = [...ranked.slice(0, 4).map(([k]) => k), opts.find((o) => o.done)!.key];
    return rolloutChoose(game, dec, keys, DEEP.horizon);
  }
  if (dec.menu === 'power' && s) {
    const k = memKey(game, dec.owner);
    const no = declined.get(k) ?? new Set();
    const pick = opts.find((o) => !o.done && !no.has(o.key));
    const key = pick?.key ?? opts.find((o) => o.done)!.key;
    lastMenuPick.set(k, key);
    return key;
  }
  if (s && opts.some((o) => o.element)) return pickElement(s, opts);
  if (s && isPresenceSource(dec)) return pickPresenceSource(s, opts);
  if (s && /gain a Minor or a Major Power/.test(dec.prompt)) {
    return s.energy >= 6 && energyIncome(s) >= 3 && opts.some((o) => o.key === 'major') ? 'major' : 'minor';
  }
  if (s) {
    const c = cardPick(gs, s, dec);
    if (c) return c;
  }

  // Power targets: play the turn out for each candidate land (AI_DEEP_TARGETS)
  if (DEEP.targets && dec.owner >= 0 && /choose a target land/.test(dec.prompt)) {
    const keys = opts.map((o) => o.key).slice(0, 10);
    const k2 = rolloutChoose(game, dec, keys);
    if (k2 === 'cancel') {
      const k = memKey(game, dec.owner);
      const last = lastMenuPick.get(k);
      if (last) declined.set(k, new Set([...(declined.get(k) ?? []), last]));
    }
    return k2;
  }
  if (DEEP.all) return rolloutChoose(game, dec, opts.map((o) => o.key).slice(0, 10));
  const { key } = lookahead(game, dec);
  if ((key === 'cancel' || opts.find((o) => o.key === key)?.done) && dec.owner >= 0 && gs.activity) {
    // declining a Power at target selection: don't offer it to ourselves again this phase
    const k = memKey(game, dec.owner);
    const last = lastMenuPick.get(k);
    if (last && key === 'cancel') {
      const set = declined.get(k) ?? new Set<string>();
      set.add(last);
      declined.set(k, set);
    }
  }
  return key;
}

/** Card plays: Reclaim One if available, then the best-valued affordable card while it is worth it. */
function planPlay(gs: GameState, s: SpiritState, opts: Option[]): string {
  if (opts.some((o) => o.key === 'reclaim')) return 'reclaim';
  const plays = opts.filter((o) => o.key.startsWith('play:'));
  if (!plays.length || cardPlays(s) - s.played.length <= 0) return opts.find((o) => o.done)!.key;
  const scored = plays.map((o) => [o.key, playValue(gs, s, o.key.slice(5))] as const).sort((a, b) => b[1] - a[1]);
  if (scored[0][1] > 0.4) return scored[0][0];
  return opts.find((o) => o.done)!.key;
}

// ─── Simulated card value ─────────────────────────────────────────────────────

/** Run an effect generator on a private copy of the state, answering with quick rules. */
function runEffect(gen: Eff, g2: GameState): void {
  let r = gen.next();
  let steps = 0;
  while (!r.done && steps++ < 200) {
    const d = r.value[0];
    r = gen.next({ d: d.id, k: quickPick(g2, d) });
  }
}

/** For Slow Powers: judge against the Ravage that comes after this Invader Phase. */
function asNextTurn(g: GameState): GameState {
  const c = structuredClone(g);
  c.invader.ravage = c.invader.build;
  c.invader.build = [];
  return c;
}

/**
 * Value of playing card `id` now: the best improvement its effect makes over every
 * legal target (simulated on a copy of the state), minus what its Energy is worth,
 * plus Innate tiers its Elements unlock.
 */
export function playValue(gs: GameState, s: SpiritState, id: string): number {
  const c = CARDS[id];
  const slow = c.speed === 'SLOW';
  const base0 = slow ? asNextTurn(gs) : gs;
  const before = evaluate(base0);
  const after = { ...elementsOf(s) };
  for (const e of c.elements) after[e] = (after[e] ?? 0) + 1;
  let best = -Infinity;
  const tryOne = (setup: (g2: GameState, ctx: Ctx2) => void) => {
    const g2 = structuredClone(base0);
    g2.pending = [];
    const s2 = g2.spirits[s.index];
    s2.played = [...s2.played, id];
    const ctx: Ctx2 = { gs: g2, self: s2, source: c.name, power: { id, kind: 'card' }, dreamed: new Set(), dreamDmg: new Map() };
    setup(g2, ctx);
    let v: number;
    try {
      runEffect(CARD_EFFECTS[id](ctx, after), g2);
      v = evaluate(g2);
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
      v = e.result.kind === 'DEFEAT' ? -1e6 : 1e6;
    }
    best = Math.max(best, v - before);
  };
  if (c.target.kind === 'land') {
    const tg = landTargets(gs, s, c.target.range, c.target.filter);
    if (!tg.length) return -5;
    for (const { sp, paid } of tg.slice(0, 14)) {
      tryOne((g2, ctx) => {
        ctx.target = space(g2, sp.id);
        if (paid) g2.spirits[s.index].energy -= 1;
      });
    }
  } else {
    for (const t of gs.spirits) {
      if (c.target.who === 'another' && t === s && gs.spirits.length > 1) continue;
      tryOne((g2, ctx) => {
        ctx.targetSpirit = g2.spirits[t.index];
      });
    }
  }
  // Elements: newly met Innate tiers are worth having
  let unlock = 0;
  for (const inn of SPIRITS[s.id].innates) unlock += tiersMet(inn.id, after).length - tiersMet(inn.id, elementsOf(s)).length;
  return (slow ? 0.85 : 1) * best - 0.5 * c.cost + 2.5 * Math.max(0, unlock);
}

type Ctx2 = Parameters<(typeof CARD_EFFECTS)[string]>[0];

/** Explain the AI's choice (for hints): its pick and the lookahead scores when computed. */
export function aiSuggest(game: Game, dec: Decision): { key: string; scores?: Record<string, number> } {
  if (dec.menu || dec.options.length === 1) return { key: aiChoose(game, dec) };
  const key = aiChoose(game, dec);
  return { key };
}

export const _test = { lookahead, complete };
