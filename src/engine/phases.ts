// The sequence of play:
//   Spirit Phase (Growth → Gain Energy → Play Cards) → Fast Powers →
//   Invader Phase (Blighted Island → Fear → [High Immigration] Ravage → Build → Explore → Advance) →
//   Slow Powers → Time Passes.

import { CARD_EFFECTS, cardRangeBonus } from './cards';
import { CARDS } from './cardData';
import { choose, confirm, parallel } from './decide';
import type { Decision, Eff, Option } from './decide';
import { FEAR_BY_ID } from './fearCards';
import { INNATE_EFFECTS, innateMayBeFast, tiersMet } from './innates';
import {
  BLIGHT_CARD_INFO,
  addBlight,
  addPieces,
  addPresenceTo,
  anySlotCount,
  cardPlays,
  checkEnd,
  chooseElement,
  chooseLandTarget,
  chooseSpiritTarget,
  ctxFor,
  damage,
  damageDahanEfficiently,
  destroyOnePresence,
  destroyPresenceAt,
  elementsOf,
  energyIncome,
  forgetPowerCard,
  gainEnergy,
  gainPowerCard,
  hasReclaimOne,
  landName,
  log,
  reclaimAll,
  reclaimOne,
  addPresence,
} from './ops';
import type { Ctx } from './ops';
import { adversarySetup, matchesCard, placeStartingPresence } from './setup';
import { INNATES, SPIRITS } from './spiritData';
import type { GrowthItem } from './spiritData';
import {
  adjacent,
  attackOf,
  count,
  dahanCount,
  hasInvaders,
  invaderCardLabel,
  invaders,
  isSacredSite,
  lands,
  presenceOf,
  space,
  spiritById,
  townCity,
} from './state';
import type { GameState, InvaderCard, Space, SpiritState } from './state';
import type { Speed } from './types';

// ─── Whole game ───────────────────────────────────────────────────────────────

export function* gameLoop(gs: GameState): Eff {
  yield* setupPhase(gs);
  for (;;) {
    gs.turn++;
    yield* spiritPhase(gs);
    yield* powerPhase(gs, 'FAST');
    yield* invaderPhase(gs);
    yield* powerPhase(gs, 'SLOW');
    yield* timePasses(gs);
  }
}

function* setupPhase(gs: GameState): Eff {
  gs.phase = 'SETUP';
  yield* adversarySetup(gs);
  for (const s of gs.spirits) yield* placeStartingPresence(gs, s);
  // Invaders' starting action: reveal the top card, Explore, put it in the Build space.
  gs.phase = 'INVADER';
  const card = gs.invader.deck.shift()!;
  log(gs, `Invaders' first Explore: ${invaderCardLabel(card)}`, 0);
  yield* explore(gs, card);
  gs.invader.build = [card];
  gs.invader.lastExplored = [card];
  checkEnd(gs);
}

// ─── Spirit Phase ─────────────────────────────────────────────────────────────

export function growthLabel(it: GrowthItem): string {
  switch (it.t) {
    case 'reclaimAll': return 'Reclaim All';
    case 'reclaimOne': return 'Reclaim One';
    case 'gainCard': return 'Gain Power Card';
    case 'energy': return `+${it.n} Energy`;
    case 'cardPlay': return `+${it.n} Card Play`;
    case 'gatherPresenceOceans': return 'Gather 1 Presence into each Ocean';
    case 'pushPresenceOceans': return 'Push 1 Presence from each Ocean';
    case 'presence': {
      const f = it.filter === 'dahan' ? ' (land with Dahan)'
        : it.filter === 'dahanOrInvaders' ? ' (land with Dahan or Invaders)'
        : it.filter === 'jungleWetland' ? ' (Jungle / Wetland)'
        : it.filter === 'ocean' ? ' (Ocean)'
        : it.filter === 'coastal' ? ' (Coastal)' : '';
      return `Add Presence ${it.range === 'any' ? 'anywhere' : `Range ${it.range}`}${f}`;
    }
  }
}

const movesPresence = (it: GrowthItem) => it.t === 'presence' || it.t === 'gatherPresenceOceans' || it.t === 'pushPresenceOceans';

function* spiritPhase(gs: GameState): Eff {
  gs.phase = 'SPIRIT';
  log(gs, `━━ Turn ${gs.turn} ━━ Spirit Phase`, 0);
  yield* parallel(gs.spirits.map((s) => spiritTurn(gs, s)));
}

function* spiritTurn(gs: GameState, s: SpiritState): Eff {
  yield* growth(gs, s);
  gainEnergy(gs, s, energyIncome(s), 'Energy from Presence Track');
  yield* playCards(gs, s);
}

function* growth(gs: GameState, s: SpiritState): Eff {
  const g = SPIRITS[s.id].growth;
  const options: Option[] = g.options.map((items, i) => ({ key: String(i), label: items.map(growthLabel).join(' · ') }));
  const k = yield* choose(gs, s.index, `${s.name}: choose Growth${g.always ? ` (plus: ${g.always.map(growthLabel).join(', ')})` : ''}`, options, {
    always: true,
    source: 'Growth',
  });
  const items = [...(g.always ?? []), ...g.options[Number(k)]];
  log(gs, `${s.name} Grows: ${items.map(growthLabel).join(', ')}`);
  const rest = [...items];
  while (rest.length) {
    let idx = 0;
    const distinct = new Set(rest.map(growthLabel)).size > 1;
    if (rest.length > 1 && distinct && rest.some(movesPresence)) {
      const ik = yield* choose(gs, s.index, 'Growth: what next?', rest.map((it, i) => ({ key: String(i), label: growthLabel(it) })), { source: 'Growth' });
      idx = Number(ik);
    }
    const [it] = rest.splice(idx, 1);
    yield* growthItem(gs, s, it);
  }
}

function* growthItem(gs: GameState, s: SpiritState, it: GrowthItem): Eff {
  switch (it.t) {
    case 'reclaimAll': reclaimAll(gs, s); return;
    case 'reclaimOne': yield* reclaimOne(gs, s, 'Growth: Reclaim One'); return;
    case 'gainCard': yield* gainPowerCard(gs, s, { source: 'Growth' }); return;
    case 'energy': gainEnergy(gs, s, it.n, 'Growth'); return;
    case 'cardPlay': s.bonusCardPlays += it.n; log(gs, `${s.name} gains ${it.n} extra Card Play this turn`); return;
    case 'presence': yield* addPresence(gs, s, it.range, it.filter, 'Growth', { viaGrowth: true }); return;
    case 'gatherPresenceOceans':
      for (const ocean of gs.spaces.filter((x) => x.num === 0)) {
        const srcs = adjacent(gs, ocean).filter((x) => presenceOf(x, s.index) > 0);
        if (!srcs.length) continue;
        const k = yield* choose(gs, s.index, `Gather 1 Presence into the Ocean of board ${ocean.boardName} from…`, srcs.map((x) => ({ key: x.id, label: landName(x), space: x.id })), { source: 'Growth' });
        space(gs, k).presence[s.index]--;
        addPresenceTo(gs, s, ocean, 'Gathered');
      }
      return;
    case 'pushPresenceOceans':
      for (const ocean of gs.spaces.filter((x) => x.num === 0 && presenceOf(x, s.index) > 0)) {
        const dests = adjacent(gs, ocean).filter((x) => x.num > 0 && x.coastal);
        if (!dests.length) continue;
        const k = yield* choose(gs, s.index, `Push 1 Presence from the Ocean of board ${ocean.boardName} to…`, dests.map((x) => ({ key: x.id, label: landName(x), space: x.id })), { source: 'Growth' });
        ocean.presence[s.index]--;
        addPresenceTo(gs, s, space(gs, k), 'Pushed');
      }
      return;
  }
}

function* playCards(gs: GameState, s: SpiritState): Eff {
  for (;;) {
    const left = cardPlays(s) - s.played.length;
    const options: Option[] = [];
    for (const id of s.hand) {
      const c = CARDS[id];
      if (left > 0 && s.energy >= c.cost) options.push({ key: `play:${id}`, label: `Play ${c.name} (${c.cost} Energy)`, card: id });
    }
    if (hasReclaimOne(s) && !s.reclaimOneUsed && s.discard.length) options.push({ key: 'reclaim', label: 'Reclaim One (Presence Track)' });
    options.push({ key: 'done', label: s.played.length ? 'Done playing cards' : 'Play no cards', done: true });
    const k = yield* choose(gs, s.index, `${s.name}: play Power Cards (${Math.max(0, left)} play${left === 1 ? '' : 's'} left, ${s.energy} Energy)`, options, {
      always: true,
      source: 'Play Power Cards',
    });
    if (k === 'done') return;
    if (k === 'reclaim') {
      if (yield* reclaimOne(gs, s)) s.reclaimOneUsed = true;
      continue;
    }
    const id = k.slice(5);
    const c = CARDS[id];
    s.energy -= c.cost;
    s.hand.splice(s.hand.indexOf(id), 1);
    s.played.push(id);
    log(gs, `${s.name} plays ${c.name} (${c.speed === 'FAST' ? 'Fast' : 'Slow'}, ${c.cost} Energy)`);
  }
}

// ─── Fast / Slow Powers ───────────────────────────────────────────────────────

interface PowerChoice {
  key: string;
  label: string;
  card?: string;
  hint?: string;
}

function slowAsFastLeft(s: SpiritState): number {
  const air = s.id === 'lightning' ? elementsOf(s).AIR ?? 0 : 0;
  return air + s.slowAsFast.boon - s.usedSlowAsFast;
}

export function availablePowers(_gs: GameState, s: SpiritState, speed: Speed): PowerChoice[] {
  const out: PowerChoice[] = [];
  const el = elementsOf(s);
  const swift = speed === 'FAST' && slowAsFastLeft(s) > 0;
  for (const id of s.played) {
    if (s.used.includes(id)) continue;
    const c = CARDS[id];
    if (c.speed === speed) out.push({ key: `card:${id}`, label: c.name, card: id });
    else if (swift && c.speed === 'SLOW') out.push({ key: `card:${id}`, label: `${c.name} (as Fast)`, card: id, hint: 'Slow Power used as Fast' });
  }
  for (const inn of SPIRITS[s.id].innates) {
    if (s.used.includes(inn.id) || !tiersMet(inn.id, el).length) continue;
    if (inn.speed === speed) out.push({ key: `innate:${inn.id}`, label: `${inn.name} (Innate)` });
    else if (speed === 'FAST' && (innateMayBeFast(inn.id, el) || swift)) out.push({ key: `innate:${inn.id}`, label: `${inn.name} (Innate, as Fast)` });
  }
  s.repeats.forEach((r, ri) => {
    if (r.uses <= 0) return;
    for (const id of s.used) {
      const c = CARDS[id];
      if (!c || c.cost > r.maxCost) continue;
      // a Repeat happens at the speed the original was used at
      if ((speed === 'FAST') !== s.usedFast.includes(id)) continue;
      if (r.payCost && s.energy < c.cost) continue;
      out.push({ key: `repeat:${ri}:${id}`, label: `Repeat ${c.name} (${r.source}${r.payCost ? `, pay ${c.cost} Energy` : ''})`, card: id });
    }
  });
  return out;
}

function* powerPhase(gs: GameState, speed: Speed): Eff {
  gs.phase = speed === 'FAST' ? 'FAST' : 'SLOW';
  log(gs, `━━ ${speed === 'FAST' ? 'Fast' : 'Slow'} Powers`, 0);
  if (speed === 'FAST') {
    for (const s of gs.spirits) {
      while (s.anyChoices.length < anySlotCount(s)) {
        s.anyChoices.push(yield* chooseElement(gs, s.index, `${s.name}: choose the Element for your "Any" Presence Track space this turn`));
      }
    }
  }
  const done = new Set<number>();
  const cache = new Map<number, { sig: string; dec: Decision }>();
  for (;;) {
    const decs: Decision[] = [];
    for (const s of gs.spirits) {
      if (done.has(s.index)) continue;
      const av = availablePowers(gs, s, speed);
      const options: Option[] = [
        ...av.map((p) => ({ key: p.key, label: `Resolve ${p.label}`, card: p.card, hint: p.hint })),
        { key: 'done', label: av.length ? `Done with ${speed === 'FAST' ? 'Fast' : 'Slow'} Powers` : 'Continue', done: true },
      ];
      const sig = options.map((o) => o.key).join('|');
      const c = cache.get(s.index);
      if (c && c.sig === sig) decs.push(c.dec);
      else {
        const dec: Decision = {
          id: gs.nextId++,
          owner: s.index,
          prompt: `${s.name}: ${av.length ? `resolve a ${speed === 'FAST' ? 'Fast' : 'Slow'} Power` : `no ${speed === 'FAST' ? 'Fast' : 'Slow'} Powers to resolve`}`,
          options,
          source: speed === 'FAST' ? 'Fast Powers' : 'Slow Powers',
        };
        cache.set(s.index, { sig, dec });
        decs.push(dec);
      }
    }
    if (!decs.length) return;
    const ans = yield decs;
    const dec = decs.find((d) => d.id === ans.d);
    if (!dec) continue;
    const s = gs.spirits[dec.owner];
    if (ans.k === 'done') {
      done.add(s.index);
      continue;
    }
    yield* resolvePower(gs, s, speed, ans.k);
    cache.clear();
  }
}

export function* resolvePower(gs: GameState, s: SpiritState, speed: Speed, key: string): Eff<boolean> {
  const [kind, a, b] = key.split(':');
  let id: string;
  let repeat: { ri: number } | null = null;
  if (kind === 'repeat') {
    repeat = { ri: Number(a) };
    id = b;
  } else id = a;
  const isCard = kind !== 'innate';
  const name = isCard ? CARDS[id].name : INNATES[id].name;
  const el = elementsOf(s);
  const target = isCard ? CARDS[id].target : INNATES[id].target;
  gs.activity = `${s.name}: ${name}${repeat ? ' (Repeat)' : ''}`;
  const ctx: Ctx = ctxFor(gs, s, name, { power: { id, kind: isCard ? 'card' : 'innate' }, dreamed: new Set(), dreamDmg: new Map(), isRepeat: !!repeat });
  if (target.kind === 'land') {
    const t = yield* chooseLandTarget(gs, s, target.range, target.filter, name, isCard ? cardRangeBonus(id, el) : 0);
    if (!t) {
      gs.activity = null;
      return false;
    }
    ctx.target = t;
  } else {
    const t = yield* chooseSpiritTarget(gs, s, target.who, name);
    if (!t) {
      gs.activity = null;
      return false;
    }
    ctx.targetSpirit = t;
  }
  // Mark as used / pay for repeats.
  if (repeat) {
    const r = s.repeats[repeat.ri];
    r.uses--;
    if (r.payCost) gainEnergy(gs, s, -CARDS[id].cost, `${r.source} repeat`);
  } else {
    s.used.push(id);
    if (speed === 'FAST') s.usedFast.push(id);
    const printed = isCard ? CARDS[id].speed : INNATES[id].speed;
    if (speed === 'FAST' && printed === 'SLOW' && !(kind === 'innate' && innateMayBeFast(id, el))) s.usedSlowAsFast++;
  }
  log(gs, `${s.name} resolves ${name}${repeat ? ' (Repeat)' : ''}${ctx.target ? ` on ${landName(ctx.target)}` : ctx.targetSpirit ? ` targeting ${ctx.targetSpirit.name}` : ''}`, 0);
  if (isCard) yield* CARD_EFFECTS[id](ctx, el);
  else yield* INNATE_EFFECTS[id](ctx, tiersMet(id, el), el);
  gs.activity = null;
  checkEnd(gs);
  return true;
}

// ─── Invader Phase ────────────────────────────────────────────────────────────

function* invaderPhase(gs: GameState): Eff {
  gs.phase = 'INVADER';
  gs.turnFlags.fearResolvedThisTurn = 0;
  log(gs, '━━ Invader Phase', 0);

  // 1. Blighted Island
  if (gs.blight.flipped) {
    const info = BLIGHT_CARD_INFO[gs.blight.card];
    log(gs, `Blighted Island — ${info.name}: ${info.text}`, 0);
    for (const s of gs.spirits) {
      if (gs.blight.card === 'downward-spiral') yield* destroyOnePresence(gs, s, 'Downward Spiral');
      else {
        const k = yield* choose(gs, s.index, `Memory Fades to Dust: ${s.name} must Forget a Power or destroy 1 Presence`, [
          { key: 'forget', label: 'Forget a Power Card' },
          { key: 'presence', label: 'Destroy 1 Presence' },
        ], { source: 'Memory Fades to Dust', always: true });
        if (k === 'forget') yield* forgetPowerCard(gs, s, 'Memory Fades to Dust: Forget a Power Card');
        else yield* destroyOnePresence(gs, s, 'Memory Fades to Dust');
      }
    }
  }

  // 2. Fear
  while (gs.fear.earned.length) {
    const id = gs.fear.earned.shift()!;
    const card = FEAR_BY_ID[id];
    const tl = gs.fear.terrorLevel;
    gs.activity = `Fear Card: ${card.name}`;
    yield* choose(gs, -1, `Fear Card — ${card.name} (Terror Level ${tl}): ${card.levels[tl - 1]}`, [{ key: 'ok', label: 'Resolve' }], { always: true, source: 'Fear', show: { kind: 'fears', id } });
    log(gs, `Fear Card: ${card.name} — ${card.levels[tl - 1]}`, 0);
    yield* card.effect(gs, tl);
    gs.fear.discard.push(id);
    gs.fear.revealed = gs.fear.revealed.filter((r) => r !== id);
    gs.turnFlags.fearResolvedThisTurn++;
    gs.activity = null;
    checkEnd(gs);
  }

  // 3. Invader Actions
  const inv = gs.invader;
  if (inv.highImmigration?.length) {
    const twice = gs.setup.adversary === 'england' && gs.setup.adversaryLevel >= 6 && gs.turnFlags.fearResolvedThisTurn === 0;
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      for (const c of inv.highImmigration) {
        log(gs, `High Immigration Build: ${invaderCardLabel(c)}`, 0);
        yield* buildCard(gs, c);
      }
    }
  }
  for (const c of inv.ravage) {
    log(gs, `Ravage: ${invaderCardLabel(c)}`, 0);
    for (const sp of lands(gs).filter((x) => matchesCard(x, c))) yield* ravage(gs, sp);
  }
  for (const c of inv.build) {
    log(gs, `Build: ${invaderCardLabel(c)}`, 0);
    yield* buildCard(gs, c);
  }
  const card = inv.deck.shift();
  if (!card) {
    checkEnd(gs, 'Time runs out: the Invader Deck is empty when the Invaders need to Explore.');
    throw new Error('unreachable');
  }
  log(gs, `Explore: ${invaderCardLabel(card)}${card.escalation && gs.setup.adversary !== 'none' ? ' — Escalation!' : ''}`, 0);
  if (card.escalation) yield* escalation(gs);
  yield* explore(gs, card);

  // 4. Advance Invader Cards
  if (inv.highImmigration) {
    inv.discard.push(...inv.highImmigration);
    const sliding = inv.ravage;
    if (gs.setup.adversaryLevel < 4 && sliding.some((c) => c.stage === 2)) {
      inv.discard.push(...sliding);
      inv.highImmigration = null;
      log(gs, 'A Stage II card reaches High Immigration: the tile is removed.', 0);
    } else inv.highImmigration = sliding;
  } else inv.discard.push(...inv.ravage);
  inv.ravage = inv.build;
  inv.build = [card];
  inv.lastExplored = [card];
}

/** Rampant Green may stop a Ravage / Build in its Sacred Site by destroying a Presence there. */
function* chokeTheLand(gs: GameState, sp: Space, action: string): Eff<boolean> {
  const g = spiritById(gs, 'green');
  if (!g || !isSacredSite(gs, g, sp)) return false;
  const yes = yield* confirm(gs, g.index, `Choke the Land with Green: destroy 1 of your Presence in ${sp.id} to prevent this ${action}?`, `Prevent ${action}`, 'Allow it', {
    source: 'Choke the Land with Green',
    focus: [sp.id],
  });
  if (!yes) return false;
  yield* destroyPresenceAt(gs, g, sp, 'Choke the Land with Green');
  log(gs, `${action} in ${landName(sp)} prevented`);
  return true;
}

export function* ravage(gs: GameState, sp: Space): Eff {
  if (!hasInvaders(sp)) return;
  if (sp.mods.skipAll || sp.mods.skipRavage) {
    log(gs, `Invaders in ${landName(sp)} skip Ravage`);
    return;
  }
  if (yield* chokeTheLand(gs, sp, 'Ravage')) return;
  const attack = invaders(sp).reduce((a, p) => a + attackOf(gs, p.kind as 'explorer' | 'town' | 'city'), 0);
  const earth = spiritById(gs, 'earth');
  const defend = sp.defend + (earth && isSacredSite(gs, earth, sp) ? 3 : 0);
  const dmg = Math.max(0, attack - defend);
  log(gs, `Ravage in ${landName(sp)}: ${attack} Damage${defend ? `, Defend ${defend}` : ''} → ${dmg}`);
  const strikeFirst = sp.mods.dahanSimultaneous ? dahanCount(sp) * 2 : 0;

  // 1. Invaders damage the land
  if (dmg >= 2) {
    const added = yield* addBlight(gs, sp, { why: 'Ravage' });
    const sweden = gs.setup.adversary === 'sweden';
    if (sweden && gs.setup.adversaryLevel >= 1 && dmg >= 6) {
      yield* addBlight(gs, sp, { cascade: false, destroyPresence: false, why: 'Heavy Mining' });
    }
    if (added && sweden && gs.setup.adversaryLevel >= 5) {
      const adj = adjacent(gs, sp).filter((x) => x.num > 0 && townCity(x) === 0);
      if (adj.length) {
        const k = yield* choose(gs, -1, 'Mining Rush: add 1 Town to an adjacent land without Town / City', adj.map((x) => ({ key: x.id, label: landName(x), space: x.id })), { source: 'Mining Rush' });
        addPieces(gs, space(gs, k), 'town', 1, 'Mining Rush');
      }
    }
  }
  // 2. Invaders fight the Dahan
  let killed = 0;
  if (dmg > 0 && !sp.mods.dahanSafe) killed = yield* damageDahanEfficiently(gs, sp, dmg);
  // 3. Dahan fight back
  const strike = sp.mods.dahanSimultaneous ? strikeFirst : dahanCount(sp) * 2;
  if (strike > 0 && hasInvaders(sp)) {
    yield* damage(null, gs, sp, strike, { owner: -1, source: 'Dahan fight back' });
  }
  // Thunderspeaker: Sworn to Victory
  const ts = spiritById(gs, 'thunderspeaker');
  if (ts && killed > 0) {
    for (let i = 0; i < killed; i++) {
      const near = [sp, ...adjacent(gs, sp)].filter((x) => presenceOf(x, ts.index) > 0);
      if (!near.length) break;
      yield* destroyOnePresence(gs, ts, 'Sworn to Victory', near);
    }
  }
}

function* buildCard(gs: GameState, c: InvaderCard): Eff {
  for (const sp of lands(gs).filter((x) => matchesCard(x, c))) yield* build(gs, sp, true);
}

export function* build(gs: GameState, sp: Space, fromCard: boolean): Eff {
  if (sp.mods.skipAll || sp.mods.skipBuild) {
    if (hasInvaders(sp)) log(gs, `Invaders in ${landName(sp)} skip Build`);
    return;
  }
  if (!hasInvaders(sp)) {
    const servants =
      fromCard && gs.setup.adversary === 'england' && gs.setup.adversaryLevel >= 1 &&
      adjacent(gs, sp).reduce((a, x) => a + townCity(x), 0) >= 2;
    if (!servants) return;
  }
  const f = gs.turnFlags;
  if (f.avoidDahan === 2 && dahanCount(sp) > townCity(sp)) return void log(gs, `No Build in ${landName(sp)} (Avoid the Dahan)`);
  if (f.avoidDahan === 3 && dahanCount(sp) > 0) return void log(gs, `No Build in ${landName(sp)} (Avoid the Dahan)`);
  if (f.tradeSuffers1 && count(sp, 'city') > 0) return void log(gs, `No Build in ${landName(sp)} (Trade Suffers)`);
  if (f.overseasTrade === 3 && sp.coastal) return void log(gs, `No Build in ${landName(sp)} (Overseas Trade Seem Safer)`);
  const kind = count(sp, 'town') > count(sp, 'city') ? 'city' : 'town';
  if (f.overseasTrade === 2 && sp.coastal && kind === 'city') return void log(gs, `No City built in ${landName(sp)} (Overseas Trade Seem Safer)`);
  if (yield* chokeTheLand(gs, sp, 'Build')) return;
  addPieces(gs, sp, kind, 1, 'Build');
}

export function* explore(gs: GameState, card: InvaderCard): Eff {
  const swayed = card.escalation && gs.setup.adversary === 'sweden';
  // All Explores happen at once: decide sources first.
  const targets = lands(gs).filter((sp) => {
    if (!matchesCard(sp, card)) return false;
    if (sp.mods.skipAll || sp.mods.skipExplore) return false;
    return townCity(sp) > 0 || sp.coastal || adjacent(gs, sp).some((a) => a.num > 0 && townCity(a) > 0);
  });
  for (const sp of targets) {
    if (gs.turnFlags.avoidDahan === 1 && dahanCount(sp) >= 2) {
      log(gs, `No Explore into ${landName(sp)} (Avoid the Dahan)`);
      continue;
    }
    addPieces(gs, sp, 'explorer', 1, 'Explore');
    if (swayed && dahanCount(sp) > 0 && invaders(sp).length >= dahanCount(sp)) {
      const d = sp.pieces.find((p) => p.kind === 'dahan')!;
      sp.pieces.splice(sp.pieces.indexOf(d), 1);
      sp.pieces.push({ kind: 'town', dmg: 0 });
      log(gs, `Swayed by the Invaders: a Dahan in ${landName(sp)} becomes a Town`);
      checkEnd(gs);
    }
  }
}

function* escalation(gs: GameState): Eff {
  const adv = gs.setup.adversary;
  if (adv === 'none' || adv === 'sweden') return; // Sweden's escalation happens during Explore
  for (let b = 0; b < gs.island.boards.length; b++) {
    const bl = lands(gs).filter((x) => x.board === b);
    if (!bl.some((x) => townCity(x) > 0)) continue;
    if (adv === 'prussia') {
      const cands = bl.filter((x) => count(x, 'town') === 0);
      if (!cands.length) continue;
      const k = yield* choose(gs, -1, `Land Rush: add 1 Town to a land without Town (board ${gs.island.boards[b]})`, cands.map((x) => ({ key: x.id, label: landName(x), space: x.id })), { source: 'Escalation: Land Rush' });
      addPieces(gs, space(gs, k), 'town', 1, 'Land Rush');
    } else {
      const most = Math.max(...bl.map(townCity));
      const cands = bl.filter((x) => townCity(x) === most);
      const k = yield* choose(gs, -1, `Building Boom: Build in the land with the most Town / City (board ${gs.island.boards[b]})`, cands.map((x) => ({ key: x.id, label: landName(x), space: x.id })), { source: 'Escalation: Building Boom' });
      yield* build(gs, space(gs, k), false);
    }
  }
}

// ─── Time Passes ──────────────────────────────────────────────────────────────

function* timePasses(gs: GameState): Eff {
  gs.phase = 'TIME_PASSES';
  for (const s of gs.spirits) {
    for (let i = 0; i < s.constancy && s.played.length; i++) {
      const k = yield* choose(gs, s.index, 'Gift of Constancy: Reclaim 1 played card instead of discarding it?', [
        ...s.played.map((id) => ({ key: id, label: CARDS[id].name, card: id })),
        { key: 'none', label: 'Discard all', done: true },
      ], { always: true, source: 'Gift of Constancy' });
      if (k === 'none') break;
      s.played.splice(s.played.indexOf(k), 1);
      s.hand.push(k);
    }
    s.discard.push(...s.played);
    s.played = [];
    s.used = [];
    s.usedFast = [];
    s.anyChoices = [];
    s.bonusElements = {};
    s.bonusCardPlays = 0;
    s.slowAsFast = { lightningAir: 0, boon: 0 };
    s.usedSlowAsFast = 0;
    s.repeats = [];
    s.rangeBonus = 0;
    s.reclaimOneUsed = false;
    s.constancy = 0;
    s.entwined = [];
  }
  for (const sp of gs.spaces) {
    sp.defend = 0;
    sp.mods = {};
    for (const p of sp.pieces) p.dmg = 0;
  }
  gs.turnFlags = { fearResolvedThisTurn: 0 };
  log(gs, 'Time Passes: played cards discarded; Damage, Elements and Defend clear.', 0);
}
