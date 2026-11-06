// Power Card effects, keyed by card id (see cardData.ts for cost/speed/range/text).
// Each effect runs with ctx.target (land) or ctx.targetSpirit already chosen, and
// `el` = the user's Elements at resolution time.

import { CARDS } from './cardData';
import { choose, confirm } from './decide';
import type { Eff } from './decide';
import {
  addBlight,
  addFear,
  addPieces,
  addPresenceTo,
  choosePresenceSource,
  chooseElement,
  chooseLandTarget,
  ctxFor,
  damage,
  damageEach,
  damageOne,
  destroyKinds,
  distancesFrom,
  drownFrom,
  forgetPowerCard,
  gainEnergy,
  gainPowerCard,
  gather,
  hit,
  landName,
  log,
  movePiece,
  pickPiece,
  placePresence,
  presenceAllowed,
  presenceDestinations,
  presenceLands,
  push,
  pushDestinations,
  removeBlight,
  replacePiece,
} from './ops';
import type { Ctx } from './ops';
import { SPIRITS } from './spiritData';
import {
  adjacent,
  count,
  dahanCount,
  hasInvaders,
  invaderCount,
  invaders,
  isCoastalForPowers,
  isSacredSite,
  meetsThreshold,
  powerTerrain,
  presenceOf,
  space,
  townCity,
} from './state';
import type { Space, SpiritState } from './state';
import { ELEMENTS, PIECE_LABEL } from './types';
import type { Element, Elements, LandTerrain, PieceKind } from './types';

export type CardEffect = (ctx: Ctx, el: Elements) => Eff;

/** "3-fire,2-air" → threshold check */
export function has(el: Elements, spec: string): boolean {
  const need: Elements = {};
  for (const part of spec.split(',')) {
    const [n, e] = part.split('-');
    need[e.toUpperCase() as Element] = Number(n);
  }
  return meetsThreshold(el, need);
}

const T = (ctx: Ctx): Space => ctx.target!;
const isT = (ctx: Ctx, ...ts: LandTerrain[]) => ts.includes(powerTerrain(ctx.gs, T(ctx)) as LandTerrain);
const fear = (ctx: Ctx, n: number) => addFear(ctx.gs, n, ctx);
function defend(ctx: Ctx, sp: Space, n: number) {
  sp.defend += n;
  log(ctx.gs, `Defend ${n} in ${landName(sp)}`);
}

/** Let the player pick one branch of an "-or-" card. Unavailable branches are hidden when possible. */
function* either(ctx: Ctx, a: { label: string; ok: boolean }, b: { label: string; ok: boolean }): Eff<0 | 1> {
  const opts = [];
  if (a.ok) opts.push({ key: '0', label: a.label });
  if (b.ok) opts.push({ key: '1', label: b.label });
  if (!opts.length) opts.push({ key: '0', label: a.label });
  const k = yield* choose(ctx.gs, ctx.self.index, `${ctx.source}: choose one`, opts);
  return k === '1' ? 1 : 0;
}

function* replaceOne(ctx: Ctx, sp: Space, from: PieceKind, to: PieceKind, n = 1): Eff<boolean> {
  const p = yield* pickPiece(ctx.gs, ctx.self.index, sp, from, `Replace which ${PIECE_LABEL[from]}?`);
  if (!p) return false;
  replacePiece(ctx.gs, sp, p, to, n);
  return true;
}

/** Target Spirit (owner of the choices) acting under the same Power. */
const asSpirit = (ctx: Ctx, s: SpiritState): Ctx => ({ ...ctx, self: s });

/** Each Dahan deals 1 Damage to a different Invader. */
function* dahanEachHitDifferent(ctx: Ctx, sp: Space): Eff {
  const hitAlready = new Set<object>();
  for (let i = dahanCount(sp); i > 0; i--) {
    const cands = invaders(sp).filter((p) => !hitAlready.has(p) && !ctx.dreamed?.has(p));
    if (!cands.length) break;
    const seen = new Set<string>();
    const opts = cands.filter((p) => {
      const k = `${p.kind}:${p.dmg}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const k = yield* choose(ctx.gs, ctx.self.index, `A Dahan strikes: 1 Damage to which Invader? (${i} Dahan left)`, opts.map((p) => ({ key: `${p.kind}:${p.dmg}`, label: `${PIECE_LABEL[p.kind]}${p.dmg ? ` (${p.dmg} dmg)` : ''}`, piece: p.kind, space: sp.id })));
    const p = cands.find((q) => `${q.kind}:${q.dmg}` === k)!;
    hitAlready.add(p);
    yield* hit(ctx, ctx.gs, sp, p, 1);
  }
}

function* repeatOn(ctx: Ctx, el: Elements, effect: CardEffect, cardId: string, label: string): Eff {
  const c = CARDS[cardId];
  if (c.target.kind !== 'land') return;
  const t = yield* chooseLandTarget(ctx.gs, ctx.self, c.target.range, c.target.filter, `${label} (Repeat)`);
  if (!t) return;
  yield* effect({ ...ctx, target: t, dreamed: new Set(), dreamDmg: new Map(), isRepeat: true }, el);
}

export const CARD_EFFECTS: Record<string, CardEffect> = {
  // ─── Lightning's Swift Strike ───────────────────────────────────────────────
  'shatter-homesteads': function* (ctx) {
    fear(ctx, 1);
    yield* destroyKinds(ctx, ctx.gs, T(ctx), ['town'], 1);
  },
  'raging-storm': function* (ctx) {
    yield* damageEach(ctx, ctx.gs, T(ctx), 1);
  },
  'lightnings-boon': function* (ctx) {
    const t = ctx.targetSpirit!;
    t.slowAsFast.boon += 2;
    log(ctx.gs, `${t.name} may use up to 2 Slow Powers as Fast this turn`);
  },
  'harbingers-of-the-lightning': function* (ctx) {
    const moved = yield* push(ctx, T(ctx), ['dahan'], 2, true);
    if (moved.some((m) => townCity(m.to) > 0)) fear(ctx, 1);
  },

  // ─── River Surges in Sunlight ───────────────────────────────────────────────
  'flash-floods': function* (ctx) {
    yield* damage(ctx, ctx.gs, T(ctx), isCoastalForPowers(ctx.gs, T(ctx)) ? 2 : 1);
  },
  'wash-away': function* (ctx) {
    yield* push(ctx, T(ctx), ['explorer', 'town'], 3, true);
  },
  'boon-of-vigor': function* (ctx) {
    const t = ctx.targetSpirit!;
    if (t === ctx.self) gainEnergy(ctx.gs, t, 1, 'Boon of Vigor');
    else gainEnergy(ctx.gs, t, t.played.length, 'Boon of Vigor');
  },
  'rivers-bounty': function* (ctx) {
    yield* gather(ctx, T(ctx), ['dahan'], 2, true);
    if (dahanCount(T(ctx)) >= 2) {
      addPieces(ctx.gs, T(ctx), 'dahan', 1, "River's Bounty");
      gainEnergy(ctx.gs, ctx.self, 1, "River's Bounty");
    }
  },

  // ─── Shadows Flicker Like Flame ─────────────────────────────────────────────
  'concealing-shadows': function* (ctx) {
    fear(ctx, 1);
    T(ctx).mods.dahanSafe = true;
    log(ctx.gs, `Dahan in ${landName(T(ctx))} take no Damage from Ravaging Invaders this turn`);
  },
  'favors-called-due': function* (ctx) {
    yield* gather(ctx, T(ctx), ['dahan'], 4, true);
    if (hasInvaders(T(ctx)) && dahanCount(T(ctx)) > invaderCount(T(ctx))) fear(ctx, 3);
  },
  'mantle-of-dread': function* (ctx) {
    fear(ctx, 2);
    const t = ctx.targetSpirit!;
    const tc = asSpirit(ctx, t);
    const lands = presenceLands(ctx.gs, t).filter((sp) => count(sp, 'explorer') + count(sp, 'town') > 0);
    if (!lands.length) return;
    const k = yield* choose(ctx.gs, t.index, 'Mantle of Dread: Push 1 Explorer and 1 Town from one of your lands?', [
      ...lands.map((sp) => ({ key: sp.id, label: landName(sp), space: sp.id })),
      { key: 'none', label: "Don't Push", done: true },
    ]);
    if (k === 'none') return;
    const sp = space(ctx.gs, k);
    yield* push(tc, sp, ['explorer'], 1, true);
    yield* push(tc, sp, ['town'], 1, true);
  },
  'crops-wither-and-fade': function* (ctx) {
    fear(ctx, 2);
    const sp = T(ctx);
    const pick = yield* either(ctx, { label: 'Replace 1 Town with 1 Explorer', ok: count(sp, 'town') > 0 }, { label: 'Replace 1 City with 1 Town', ok: count(sp, 'city') > 0 });
    if (pick === 0) yield* replaceOne(ctx, sp, 'town', 'explorer');
    else yield* replaceOne(ctx, sp, 'city', 'town');
  },

  // ─── Vital Strength of the Earth ────────────────────────────────────────────
  'guard-the-healing-land': function* (ctx) {
    removeBlight(ctx.gs, T(ctx), ctx.source);
    defend(ctx, T(ctx), 4);
  },
  'a-year-of-perfect-stillness': function* (ctx) {
    T(ctx).mods.skipAll = true;
    log(ctx.gs, `Invaders skip all Actions in ${landName(T(ctx))} this turn`);
  },
  'rituals-of-destruction': function* (ctx) {
    let dmg = 2;
    if (dahanCount(T(ctx)) >= 3) {
      dmg += 3;
      fear(ctx, 2);
    }
    yield* damage(ctx, ctx.gs, T(ctx), dmg);
  },
  'draw-of-the-fruitful-earth': function* (ctx) {
    yield* gather(ctx, T(ctx), ['explorer'], 2, true);
    yield* gather(ctx, T(ctx), ['dahan'], 2, true);
  },

  // ─── Thunderspeaker ─────────────────────────────────────────────────────────
  'manifestation-of-power-and-glory': function* (ctx) {
    fear(ctx, 1);
    const n = dahanCount(T(ctx)) * presenceOf(T(ctx), ctx.self.index);
    yield* damage(ctx, ctx.gs, T(ctx), n);
  },
  'words-of-warning': function* (ctx) {
    defend(ctx, T(ctx), 3);
    T(ctx).mods.dahanSimultaneous = true;
  },
  'sudden-ambush': function* (ctx) {
    yield* gather(ctx, T(ctx), ['dahan'], 1, true);
    yield* destroyKinds(ctx, ctx.gs, T(ctx), ['explorer'], dahanCount(T(ctx)));
  },
  'voice-of-thunder': function* (ctx) {
    const pick = yield* either(ctx, { label: 'Push up to 4 Dahan', ok: dahanCount(T(ctx)) > 0 }, { label: '2 Fear (Invaders present)', ok: hasInvaders(T(ctx)) });
    if (pick === 0) yield* push(ctx, T(ctx), ['dahan'], 4, true);
    else if (hasInvaders(T(ctx))) fear(ctx, 2);
  },

  // ─── Ocean's Hungry Grasp ───────────────────────────────────────────────────
  'call-of-the-deeps': function* (ctx) {
    yield* gather(ctx, T(ctx), ['explorer'], 1, false);
    if (T(ctx).num === 0) yield* gather(ctx, T(ctx), ['explorer'], 1, true);
  },
  'grasping-tide': function* (ctx) {
    fear(ctx, 2);
    defend(ctx, T(ctx), 4);
  },
  'swallow-the-land-dwellers': function* (ctx) {
    yield* drownFrom(ctx, T(ctx), ['explorer'], 1);
    yield* drownFrom(ctx, T(ctx), ['town'], 1);
    yield* drownFrom(ctx, T(ctx), ['dahan'], 1);
  },
  'tidal-boon': function* (ctx) {
    const t = ctx.targetSpirit!;
    gainEnergy(ctx.gs, t, 2, 'Tidal Boon');
    const lands = presenceLands(ctx.gs, t).filter((sp) => count(sp, 'town') + dahanCount(sp) > 0);
    if (!lands.length) return;
    const k = yield* choose(ctx.gs, t.index, 'Tidal Boon: Push 1 Town and up to 2 Dahan from one of your lands?', [
      ...lands.map((sp) => ({ key: sp.id, label: landName(sp), space: sp.id })),
      { key: 'none', label: "Don't Push", done: true },
    ]);
    if (k === 'none') return;
    const tc: Ctx = { ...asSpirit(ctx, t), saveDahan: true };
    const sp = space(ctx.gs, k);
    yield* push(tc, sp, ['town'], 1, true);
    yield* push(tc, sp, ['dahan'], 2, true);
  },

  // ─── Bringer of Dreams and Nightmares ───────────────────────────────────────
  'predatory-nightmares': function* (ctx) {
    yield* damage(ctx, ctx.gs, T(ctx), 2);
    yield* push(ctx, T(ctx), ['dahan'], 2, true);
  },
  'dread-apparitions': function* (ctx) {
    T(ctx).mods.dreadApparitions = true;
    fear(ctx, 1);
  },
  'call-on-midnights-dream': function* (ctx) {
    const sp = T(ctx);
    const pick = yield* either(ctx, { label: 'Gain a Major Power (Dahan present)', ok: dahanCount(sp) > 0 }, { label: '2 Fear (Invaders present)', ok: hasInvaders(sp) });
    if (pick === 1) {
      if (hasInvaders(sp)) fear(ctx, 2);
      return;
    }
    if (!dahanCount(sp)) return;
    const res = yield* gainPowerCard(ctx.gs, ctx.self, { deck: 'major', source: ctx.source });
    if (res.forgot === 'call-on-midnights-dream' && res.kept) {
      gainEnergy(ctx.gs, ctx.self, dahanCount(sp), ctx.source);
      const c = CARDS[res.kept];
      if (ctx.self.energy >= c.cost && ctx.self.hand.includes(res.kept)) {
        const play = yield* confirm(ctx.gs, ctx.self.index, `Play ${c.name} immediately, paying ${c.cost} Energy?`, 'Play it', 'Keep in hand');
        if (play) {
          ctx.self.energy -= c.cost;
          ctx.self.hand.splice(ctx.self.hand.indexOf(res.kept), 1);
          ctx.self.played.push(res.kept);
          log(ctx.gs, `${ctx.self.name} plays ${c.name}`);
        }
      }
    }
  },
  'dreams-of-the-dahan': function* (ctx) {
    const sp = T(ctx);
    const pick = yield* either(ctx, { label: 'Gather up to 2 Dahan', ok: true }, { label: '1 Fear per Dahan (max 3)', ok: townCity(sp) > 0 });
    if (pick === 0) yield* gather(ctx, sp, ['dahan'], 2, true);
    else if (townCity(sp) > 0) fear(ctx, Math.min(3, dahanCount(sp)));
  },

  // ─── A Spread of Rampant Green ──────────────────────────────────────────────
  'overgrow-in-a-night': function* (ctx) {
    const sp = T(ctx);
    const canFear = presenceOf(sp, ctx.self.index) > 0 && hasInvaders(sp);
    const pick = yield* either(ctx, { label: 'Add 1 Presence', ok: presenceAllowed(ctx.gs, ctx.self, sp) }, { label: '3 Fear', ok: canFear });
    if (pick === 1) {
      if (canFear) fear(ctx, 3);
      return;
    }
    const src = yield* choosePresenceSource(ctx.gs, ctx.self, false, sp);
    if (src) placePresence(ctx.gs, ctx.self, src, sp, ctx.source);
  },
  'gift-of-proliferation': function* (ctx) {
    const t = ctx.targetSpirit!;
    const dests = presenceDestinations(ctx.gs, t, 1);
    if (!dests.length) return;
    const k = yield* choose(ctx.gs, t.index, 'Gift of Proliferation: add 1 Presence (Range 1)', dests.map((sp) => ({ key: sp.id, label: landName(sp), space: sp.id })), { kind: 'presenceAdd' });
    const src = yield* choosePresenceSource(ctx.gs, t, false, space(ctx.gs, k));
    if (src) placePresence(ctx.gs, t, src, space(ctx.gs, k), ctx.source);
  },
  'fields-choked-with-growth': function* (ctx) {
    const sp = T(ctx);
    const pick = yield* either(ctx, { label: 'Push 1 Town', ok: count(sp, 'town') > 0 }, { label: 'Push 3 Dahan', ok: dahanCount(sp) > 0 });
    if (pick === 0) yield* push(ctx, sp, ['town'], 1, false);
    else yield* push(ctx, sp, ['dahan'], 3, false);
  },
  'stem-the-flow-of-fresh-water': function* (ctx) {
    if (isT(ctx, 'MOUNTAIN', 'SANDS')) yield* damageEach(ctx, ctx.gs, T(ctx), 1, ['town', 'city']);
    else yield* damageOne(ctx, T(ctx), 1, ['town', 'city']);
  },

  // ─── Minor Powers ───────────────────────────────────────────────────────────
  'savage-mawbeasts': function* (ctx, el) {
    let dmg = 0;
    if (isT(ctx, 'JUNGLE', 'WETLAND')) {
      fear(ctx, 1);
      dmg += 1;
    }
    if (has(el, '3-animal')) dmg += 1;
    yield* damage(ctx, ctx.gs, T(ctx), dmg);
  },
  'voracious-growth': function* (ctx) {
    const pick = yield* either(ctx, { label: '2 Damage', ok: true }, { label: 'Remove 1 Blight', ok: T(ctx).blight > 0 });
    if (pick === 0) yield* damage(ctx, ctx.gs, T(ctx), 2);
    else removeBlight(ctx.gs, T(ctx), ctx.source);
  },
  'rouse-the-trees-and-stones': function* (ctx) {
    yield* damage(ctx, ctx.gs, T(ctx), 2);
    yield* push(ctx, T(ctx), ['explorer'], 1, false);
  },
  'encompassing-ward': function* (ctx) {
    for (const sp of presenceLands(ctx.gs, ctx.targetSpirit!)) defend(ctx, sp, 2);
  },
  'song-of-sanctity': function* (ctx) {
    const n = count(T(ctx), 'explorer');
    if (n > 0) yield* push(ctx, T(ctx), ['explorer'], n, false);
    else removeBlight(ctx.gs, T(ctx), ctx.source);
  },
  'uncanny-melting': function* (ctx) {
    if (hasInvaders(T(ctx))) fear(ctx, 1);
    if (isT(ctx, 'SANDS', 'WETLAND')) removeBlight(ctx.gs, T(ctx), ctx.source);
  },
  'shadows-of-the-burning-forest': function* (ctx) {
    fear(ctx, 2);
    if (isT(ctx, 'MOUNTAIN', 'JUNGLE')) {
      yield* push(ctx, T(ctx), ['explorer'], 1, false);
      yield* push(ctx, T(ctx), ['town'], 1, false);
    }
  },
  'steam-vents': function* (ctx, el) {
    let kind: PieceKind = 'explorer';
    if (has(el, '3-earth') && count(T(ctx), 'town') > 0) {
      const town = yield* confirm(ctx.gs, ctx.self.index, 'Steam Vents: destroy 1 Town instead of 1 Explorer?', 'Destroy Town', 'Destroy Explorer');
      if (town) kind = 'town';
    }
    yield* destroyKinds(ctx, ctx.gs, T(ctx), [kind], 1);
  },
  'veil-the-nights-hunt': function* (ctx) {
    const pick = yield* either(ctx, { label: 'Each Dahan deals 1 Damage to a different Invader', ok: hasInvaders(T(ctx)) }, { label: 'Push up to 3 Dahan', ok: true });
    if (pick === 0) yield* dahanEachHitDifferent(ctx, T(ctx));
    else yield* push(ctx, T(ctx), ['dahan'], 3, true);
  },
  'elemental-boon': function* (ctx) {
    const t = ctx.targetSpirit!;
    const picked: Element[] = [];
    for (let i = 0; i < 3; i++) {
      const el = yield* chooseElement(ctx.gs, t.index, `Elemental Boon: choose a different Element (${i + 1}/3)`, ELEMENTS.filter((e) => !picked.includes(e)));
      picked.push(el);
    }
    for (const e of picked) t.bonusElements[e] = (t.bonusElements[e] ?? 0) + 1;
    if (t !== ctx.self) for (const e of picked) ctx.self.bonusElements[e] = (ctx.self.bonusElements[e] ?? 0) + 1;
    log(ctx.gs, `${t.name} gains ${picked.join(', ')}`);
  },
  'devouring-ants': function* (ctx) {
    fear(ctx, 1);
    yield* damage(ctx, ctx.gs, T(ctx), isT(ctx, 'JUNGLE', 'SANDS') ? 2 : 1);
    yield* destroyKinds(ctx, ctx.gs, T(ctx), ['dahan'], 1);
  },
  'dark-and-tangled-woods': function* (ctx) {
    fear(ctx, 2);
    if (isT(ctx, 'MOUNTAIN', 'JUNGLE')) defend(ctx, T(ctx), 3);
  },
  'sap-the-strength-of-multitudes': function* (ctx) {
    defend(ctx, T(ctx), 5);
  },
  'drift-down-into-slumber': function* (ctx) {
    defend(ctx, T(ctx), isT(ctx, 'JUNGLE', 'SANDS') ? 4 : 1);
  },
  'land-of-haunts-and-embers': function* (ctx) {
    fear(ctx, 2);
    yield* push(ctx, T(ctx), ['explorer', 'town'], 2, true);
    if (T(ctx).blight > 0) {
      fear(ctx, 2);
      yield* push(ctx, T(ctx), ['explorer', 'town'], 2, true);
    }
    yield* addBlight(ctx.gs, T(ctx), { why: ctx.source });
  },
  'natures-resilience': function* (ctx, el) {
    if (has(el, '2-water') && T(ctx).blight > 0) {
      const rb = yield* confirm(ctx.gs, ctx.self.index, "Nature's Resilience: remove 1 Blight instead of Defend 6?", 'Remove Blight', 'Defend 6');
      if (rb) {
        removeBlight(ctx.gs, T(ctx), ctx.source);
        return;
      }
    }
    defend(ctx, T(ctx), 6);
  },
  'visions-of-fiery-doom': function* (ctx, el) {
    fear(ctx, has(el, '2-fire') ? 2 : 1);
    yield* push(ctx, T(ctx), ['explorer', 'town'], 1, false);
  },
  'pull-beneath-the-hungry-earth': function* (ctx) {
    let dmg = 0;
    if (presenceOf(T(ctx), ctx.self.index) > 0) {
      fear(ctx, 1);
      dmg++;
    }
    if (isT(ctx, 'SANDS', 'WETLAND')) dmg++;
    yield* damage(ctx, ctx.gs, T(ctx), dmg);
  },
  'call-of-the-dahan-ways': function* (ctx, el) {
    let from: PieceKind = 'explorer';
    if (has(el, '2-moon') && count(T(ctx), 'town') > 0) {
      const town = yield* confirm(ctx.gs, ctx.self.index, 'Call of the Dahan Ways: replace 1 Town (instead of 1 Explorer) with 1 Dahan?', 'Replace Town', 'Replace Explorer');
      if (town) from = 'town';
    }
    yield* replaceOne(ctx, T(ctx), from, 'dahan');
  },
  'call-to-bloodshed': function* (ctx) {
    const pick = yield* either(ctx, { label: '1 Damage per Dahan', ok: hasInvaders(T(ctx)) }, { label: 'Gather up to 3 Dahan', ok: true });
    if (pick === 0) yield* damage(ctx, ctx.gs, T(ctx), dahanCount(T(ctx)));
    else yield* gather(ctx, T(ctx), ['dahan'], 3, true);
  },
  'call-to-isolation': function* (ctx) {
    const pick = yield* either(ctx, { label: 'Push 1 Explorer / Town per Dahan', ok: count(T(ctx), 'explorer') + count(T(ctx), 'town') > 0 }, { label: 'Push 1 Dahan', ok: true });
    if (pick === 0) yield* push(ctx, T(ctx), ['explorer', 'town'], dahanCount(T(ctx)), false);
    else yield* push(ctx, T(ctx), ['dahan'], 1, false);
  },
  'call-to-migrate': function* (ctx) {
    yield* gather(ctx, T(ctx), ['dahan'], 3, true);
    yield* push(ctx, T(ctx), ['dahan'], 3, true);
  },
  'call-to-tend': function* (ctx) {
    const pick = yield* either(ctx, { label: 'Remove 1 Blight', ok: T(ctx).blight > 0 }, { label: 'Push up to 3 Dahan', ok: true });
    if (pick === 0) removeBlight(ctx.gs, T(ctx), ctx.source);
    else yield* push(ctx, T(ctx), ['dahan'], 3, true);
  },
  'quicken-the-earths-struggles': function* (ctx) {
    const pick = yield* either(ctx, { label: '1 Damage to each Town / City', ok: townCity(T(ctx)) > 0 }, { label: 'Defend 10', ok: true });
    if (pick === 0) yield* damageEach(ctx, ctx.gs, T(ctx), 1, ['town', 'city']);
    else defend(ctx, T(ctx), 10);
  },
  'delusions-of-danger': function* (ctx) {
    const pick = yield* either(ctx, { label: 'Push 1 Explorer', ok: count(T(ctx), 'explorer') > 0 }, { label: '2 Fear', ok: true });
    if (pick === 0) yield* push(ctx, T(ctx), ['explorer'], 1, false);
    else fear(ctx, 2);
  },
  drought: function* (ctx, el) {
    yield* destroyKinds(ctx, ctx.gs, T(ctx), ['town'], 3);
    yield* damageEach(ctx, ctx.gs, T(ctx), 1, ['town', 'city']);
    yield* addBlight(ctx.gs, T(ctx), { why: ctx.source });
    if (has(el, '3-sun')) yield* destroyKinds(ctx, ctx.gs, T(ctx), ['city'], 1);
  },
  'gift-of-constancy': function* (ctx) {
    const t = ctx.targetSpirit!;
    gainEnergy(ctx.gs, t, 2, 'Gift of Constancy');
    t.constancy += 1;
    if (t !== ctx.self) ctx.self.constancy += 1;
  },
  'enticing-splendor': function* (ctx) {
    const pick = yield* either(ctx, { label: 'Gather 1 Explorer / Town', ok: true }, { label: 'Gather up to 2 Dahan', ok: true });
    if (pick === 0) yield* gather(ctx, T(ctx), ['explorer', 'town'], 1, false);
    else yield* gather(ctx, T(ctx), ['dahan'], 2, true);
  },
  'entrancing-apparitions': function* (ctx) {
    defend(ctx, T(ctx), 2);
    if (!hasInvaders(T(ctx))) yield* gather(ctx, T(ctx), ['explorer'], 2, true);
  },
  'gift-of-living-energy': function* (ctx) {
    const t = ctx.targetSpirit!;
    let n = 1;
    if (t !== ctx.self) n++;
    if (ctx.gs.spaces.filter((sp) => isSacredSite(ctx.gs, ctx.self, sp)).length >= 2) n++;
    gainEnergy(ctx.gs, t, n, 'Gift of Living Energy');
  },
  'gift-of-power': function* (ctx) {
    yield* gainPowerCard(ctx.gs, ctx.targetSpirit!, { deck: 'minor', source: ctx.source });
  },
  'gnawing-rootbiters': function* (ctx) {
    yield* push(ctx, T(ctx), ['town'], 2, true);
  },
  'lure-of-the-unknown': function* (ctx) {
    yield* gather(ctx, T(ctx), ['explorer', 'town'], 1, false);
  },
  'purifying-flame': function* (ctx) {
    if (isT(ctx, 'MOUNTAIN', 'SANDS') && T(ctx).blight > 0) {
      const rb = yield* confirm(ctx.gs, ctx.self.index, 'Purifying Flame: remove 1 Blight instead of dealing Damage?', 'Remove Blight', '1 Damage per Blight');
      if (rb) {
        removeBlight(ctx.gs, T(ctx), ctx.source);
        return;
      }
    }
    yield* damage(ctx, ctx.gs, T(ctx), T(ctx).blight);
  },
  'rain-of-blood': function* (ctx) {
    fear(ctx, townCity(T(ctx)) >= 2 ? 3 : 2);
  },
  'reaching-grasp': function* (ctx) {
    ctx.targetSpirit!.rangeBonus += 2;
    log(ctx.gs, `${ctx.targetSpirit!.name} gets +2 Range with all their Powers this turn`);
  },

  // ─── Major Powers ───────────────────────────────────────────────────────────
  'accelerated-rot': function* (ctx, el) {
    fear(ctx, 2);
    const big = has(el, '3-sun,2-water,3-plant');
    yield* damage(ctx, ctx.gs, T(ctx), big ? 9 : 4);
    if (big) removeBlight(ctx.gs, T(ctx), ctx.source);
  },
  'cleansing-floods': function* (ctx, el) {
    yield* damage(ctx, ctx.gs, T(ctx), has(el, '4-water') ? 14 : 4);
    removeBlight(ctx.gs, T(ctx), ctx.source);
  },
  'pillar-of-living-flame': function* (ctx, el) {
    const big = has(el, '4-fire');
    fear(ctx, big ? 5 : 3);
    yield* damage(ctx, ctx.gs, T(ctx), big ? 10 : 5);
    if (isT(ctx, 'JUNGLE', 'WETLAND')) yield* addBlight(ctx.gs, T(ctx), { why: ctx.source });
  },
  'poisoned-land': function* (ctx, el) {
    // Printed order: 1 Fear. 7 Damage. Add 1 Blight and destroy all Dahan. (Threshold: per Blight then present.)
    fear(ctx, 1);
    yield* damage(ctx, ctx.gs, T(ctx), 7);
    yield* addBlight(ctx.gs, T(ctx), { why: ctx.source });
    yield* destroyKinds(ctx, ctx.gs, T(ctx), ['dahan'], 'all');
    if (has(el, '3-earth,2-plant,2-animal')) {
      const b = T(ctx).blight;
      fear(ctx, b);
      yield* damage(ctx, ctx.gs, T(ctx), 4 * b);
    }
  },
  'terrifying-nightmares': function* (ctx, el) {
    fear(ctx, has(el, '4-moon') ? 6 : 2);
    yield* push(ctx, T(ctx), ['explorer', 'town'], 4, true);
  },
  'the-trees-and-stones-speak-of-war': function* (ctx, el) {
    const sp = T(ctx);
    const d = dahanCount(sp);
    yield* damage(ctx, ctx.gs, sp, d);
    defend(ctx, sp, 2 * d);
    if (has(el, '2-sun,2-earth,2-plant')) {
      const moved = yield* push(ctx, sp, ['dahan'], 2, true, { label: 'Push Dahan (their Defend moves with them)' });
      for (const m of moved) {
        sp.defend -= 2;
        m.to.defend += 2;
      }
    }
  },
  'entwined-power': function* (ctx, el) {
    const t = ctx.targetSpirit!;
    const gs = ctx.gs;
    if (t !== ctx.self) {
      if (!ctx.self.entwined.includes(t.index)) ctx.self.entwined.push(t.index);
      if (!t.entwined.includes(ctx.self.index)) t.entwined.push(ctx.self.index);
    }
    const res = yield* gainPowerCard(gs, t, { source: ctx.source });
    // The user gains one of the cards the target did not keep (taking it back out of the discard).
    const left = res.rest.filter((id) => gs.minorDiscard.includes(id) || gs.majorDiscard.includes(id));
    if (left.length) {
      const k = yield* choose(gs, ctx.self.index, 'Entwined Power: gain one of the cards they did not keep', left.map((id) => ({ key: id, label: CARDS[id].name, card: id })), { always: true, kind: 'cardKeep' });
      const pile = CARDS[k].type === 'minor' ? gs.minorDiscard : gs.majorDiscard;
      pile.splice(pile.indexOf(k), 1);
      ctx.self.hand.push(k);
      log(gs, `${ctx.self.name} gains ${CARDS[k].name}`);
      if (CARDS[k].type === 'major') yield* forgetPowerCard(gs, ctx.self, 'You gained a Major Power: Forget a Power Card');
    }
    if (has(el, '2-water,4-plant')) {
      gainEnergy(gs, ctx.self, 3, ctx.source);
      if (t !== ctx.self) gainEnergy(gs, t, 3, ctx.source);
      if (t !== ctx.self) {
        for (const [from, to] of [[ctx.self, t], [t, ctx.self]] as const) {
          if (!from.hand.length) continue;
          const k = yield* choose(gs, from.index, `Entwined Power: gift 1 Power from your hand to ${to.name}?`, [
            ...from.hand.map((id) => ({ key: id, label: CARDS[id].name, card: id })),
            { key: 'none', label: "Don't gift", done: true },
          ], { always: true });
          if (k !== 'none') {
            from.hand.splice(from.hand.indexOf(k), 1);
            to.hand.push(k);
            log(gs, `${from.name} gifts ${CARDS[k].name} to ${to.name}`);
          }
        }
      }
    }
  },
  'paralyzing-fright': function* (ctx, el) {
    fear(ctx, has(el, '2-air,3-earth') ? 8 : 4);
    T(ctx).mods.skipAll = true;
    log(ctx.gs, `Invaders skip all Actions in ${landName(T(ctx))} this turn`);
  },
  powerstorm: function* (ctx, el) {
    const t = ctx.targetSpirit!;
    gainEnergy(ctx.gs, t, 3, 'Powerstorm');
    // Repeats never chain: a repeated Powerstorm grants no further Repeats.
    if (!ctx.isRepeat) t.repeats.push({ source: 'Powerstorm', maxCost: 99, payCost: true, uses: has(el, '2-sun,2-fire,3-air') ? 3 : 1 });
  },
  'talons-of-lightning': function* (ctx, el) {
    fear(ctx, 3);
    yield* damage(ctx, ctx.gs, T(ctx), 5);
    if (has(el, '3-fire,3-air')) {
      for (const adj of adjacent(ctx.gs, T(ctx))) {
        if (adj.num > 0) yield* destroyKinds(ctx, ctx.gs, adj, ['town'], 1);
      }
    }
  },
  'the-jungle-hungers': function* (ctx, el) {
    yield* destroyKinds(ctx, ctx.gs, T(ctx), ['explorer', 'town'], 'all');
    if (has(el, '2-moon,3-plant')) yield* destroyKinds(ctx, ctx.gs, T(ctx), ['city'], 1);
    else yield* destroyKinds(ctx, ctx.gs, T(ctx), ['dahan'], 'all');
  },
  'the-land-thrashes-in-furious-pain': function* thrash(ctx, el) {
    const run = function* (sp: Space): Eff {
      const n = 2 * sp.blight + adjacent(ctx.gs, sp).reduce((a, s) => a + s.blight, 0);
      yield* damage({ ...ctx, target: sp }, ctx.gs, sp, n);
    };
    yield* run(T(ctx));
    if (has(el, '3-moon,3-earth') && !ctx.isRepeat) {
      const adj = adjacent(ctx.gs, T(ctx)).filter((s) => s.num > 0);
      if (adj.length) {
        const k = yield* choose(ctx.gs, ctx.self.index, 'Repeat on an adjacent land', adj.map((s) => ({ key: s.id, label: landName(s), space: s.id })));
        yield* run(space(ctx.gs, k));
      }
    }
  },
  tsunami: function* (ctx, el) {
    fear(ctx, 2);
    yield* damage(ctx, ctx.gs, T(ctx), 8);
    yield* destroyKinds(ctx, ctx.gs, T(ctx), ['dahan'], 2);
    if (has(el, '3-water,2-earth') && (yield* confirm(ctx.gs, ctx.self.index, 'Tsunami threshold: also 1 Fear, 4 Damage and destroy 1 Dahan in each other Coastal land on this board?', 'Use threshold', 'Skip it'))) {
      for (const sp of ctx.gs.spaces) {
        if (sp === T(ctx) || sp.board !== T(ctx).board || sp.num === 0 || !sp.coastal) continue;
        const c2 = { ...ctx, target: sp };
        fear(c2, 1);
        yield* damage(c2, ctx.gs, sp, 4);
        yield* destroyKinds(c2, ctx.gs, sp, ['dahan'], 1);
      }
    }
  },
  'vigor-of-the-breaking-dawn': function* (ctx, el) {
    yield* damage(ctx, ctx.gs, T(ctx), 2 * dahanCount(T(ctx)));
    if (has(el, '3-sun,2-animal')) {
      const moved = yield* push(ctx, T(ctx), ['dahan'], 2, true);
      const dests = [...new Set(moved.map((m) => m.to))];
      for (const sp of dests) yield* damage({ ...ctx, target: sp }, ctx.gs, sp, 2 * dahanCount(sp));
    }
  },
  'vengeance-of-the-dead': function* (ctx, el) {
    fear(ctx, 3);
    (T(ctx).mods.vengeance ??= []).push({ spirit: ctx.self.index, adjacent: has(el, '3-animal') });
    log(ctx.gs, `The dead of ${landName(T(ctx))} will take vengeance this turn`);
  },
  'wrap-in-wings-of-sunlight': function* (ctx, el) {
    const sp = T(ctx);
    if (has(el, '2-sun,2-air,2-animal')) yield* gather(ctx, sp, ['dahan'], 3, true);
    const dests = ctx.gs.spaces.filter((s) => s.num > 0);
    const k = yield* choose(ctx.gs, ctx.self.index, 'Wrap in Wings of Sunlight: move up to 5 Dahan to which land? (Defend 5 there)', dests.map((s) => ({ key: s.id, label: landName(s), space: s.id })));
    const to = space(ctx.gs, k);
    let moved = 0;
    while (to !== sp && moved < 5 && dahanCount(sp) > 0) {
      const go = yield* confirm(ctx.gs, ctx.self.index, `Move a Dahan to ${to.id}? (${moved}/5 moved)`, 'Move a Dahan', 'Stop');
      if (!go) break;
      const d = sp.pieces.find((p) => p.kind === 'dahan')!;
      yield* movePiece(ctx, ctx.gs, sp, to, d);
      moved++;
    }
    defend(ctx, to, 5);
  },
  'blazing-renewal': function* (ctx, el) {
    const t = ctx.targetSpirit!;
    const gs = ctx.gs;
    if (t.destroyed <= 0) {
      log(gs, `${t.name} has no destroyed Presence to return`);
      return;
    }
    const near = distancesFrom(gs, presenceLands(gs, ctx.self), 2);
    const dests = gs.spaces.filter((s) => near.has(s.id) && presenceAllowed(gs, t, s));
    if (!dests.length) return;
    const k = yield* choose(gs, t.index, 'Blazing Renewal: return up to 2 destroyed Presence into which land?', dests.map((s) => ({ key: s.id, label: landName(s), space: s.id })), { kind: 'presenceAdd' });
    const sp = space(gs, k);
    const n = Math.min(2, t.destroyed);
    for (let i = 0; i < n; i++) {
      t.destroyed--;
      addPresenceTo(gs, t, sp, 'Blazing Renewal');
    }
    const c2 = { ...ctx, target: sp };
    yield* damageEach(c2, gs, sp, 2, ['town', 'city']);
    if (has(el, '3-fire,3-earth,2-plant')) yield* damage(c2, gs, sp, 4);
  },
  'winds-of-rust-and-atrophy': function* winds(ctx, el) {
    const once = function* (c: Ctx): Eff {
      const sp = c.target!;
      fear(c, 1);
      defend(c, sp, 6);
      const pick = yield* either(c, { label: 'Replace 1 City with 1 Town', ok: count(sp, 'city') > 0 }, { label: 'Replace 1 Town with 1 Explorer', ok: count(sp, 'town') > 0 });
      if (pick === 0) yield* replaceOne(c, sp, 'city', 'town');
      else yield* replaceOne(c, sp, 'town', 'explorer');
    };
    yield* once(ctx);
    if (has(el, '3-air,3-water,2-animal') && !ctx.isRepeat) yield* repeatOn(ctx, el, function* (c) { yield* once(c); }, 'winds-of-rust-and-atrophy', ctx.source);
  },
  'indomitable-claim': function* (ctx, el) {
    const sp = T(ctx);
    const src = yield* choosePresenceSource(ctx.gs, ctx.self, false, sp);
    if (src) placePresence(ctx.gs, ctx.self, src, sp, ctx.source);
    defend(ctx, sp, 20);
    if (has(el, '2-sun,3-earth')) {
      if (hasInvaders(sp)) fear(ctx, 3);
      sp.mods.skipAll = true;
      log(ctx.gs, `Invaders skip all Actions in ${landName(sp)} this turn`);
    }
  },
  'mists-of-oblivion': function* (ctx, el) {
    // Damage never moves pieces (Bringer's Powers destroy nothing), so a drop here = this Power's kills.
    const before = townCity(T(ctx));
    yield* damageEach(ctx, ctx.gs, T(ctx), 1);
    if (has(el, '2-moon,3-air,2-water')) yield* damage(ctx, ctx.gs, T(ctx), 3);
    const destroyed = ctx.self.id === 'bringer' ? 0 : Math.max(0, before - townCity(T(ctx)));
    fear(ctx, Math.min(4, destroyed));
  },
  'infinite-vitality': function* (ctx, el) {
    const sp = T(ctx);
    sp.mods.dahanBonusHealth = (sp.mods.dahanBonusHealth ?? 0) + 4;
    sp.mods.blightStaysOnCard = true;
    log(ctx.gs, `Dahan in ${landName(sp)} have +4 Health; Blight added there stays on the card`);
    if (has(el, '4-earth')) {
      sp.mods.dahanImmune = true;
      const opts = [sp, ...adjacent(ctx.gs, sp)].filter((s) => s.blight > 0);
      if (opts.length) {
        const k = yield* choose(ctx.gs, ctx.self.index, 'Infinite Vitality: remove 1 Blight from target or adjacent land', opts.map((s) => ({ key: s.id, label: landName(s), space: s.id })));
        removeBlight(ctx.gs, space(ctx.gs, k), ctx.source);
      }
    }
  },
  'dissolve-the-bonds-of-kinship': function* (ctx, el) {
    const sp = T(ctx);
    const gs = ctx.gs;
    yield* replaceOne(ctx, sp, 'city', 'explorer', 2);
    yield* replaceOne(ctx, sp, 'town', 'explorer');
    yield* replaceOne(ctx, sp, 'dahan', 'explorer');
    if (has(el, '2-fire,2-water,3-animal')) {
      const exDmg = count(sp, 'explorer');
      const tcDmg = count(sp, 'town') * 2 + count(sp, 'city') * 3;
      yield* damage(ctx, gs, sp, exDmg, { kinds: ['town', 'city'], source: 'Explorers strike the settlements' });
      yield* damage(ctx, gs, sp, tcDmg, { kinds: ['explorer'], source: 'Settlements strike the Explorers' });
    }
    // Push all Explorer to as many different lands as possible.
    const used = new Set<string>();
    while (count(sp, 'explorer') > 0) {
      const dests = pushDestinations(gs, sp, true);
      if (!dests.length) break;
      const fresh = dests.filter((d) => !used.has(d.id));
      const pool = fresh.length ? fresh : dests;
      const k = yield* choose(gs, ctx.self.index, `Push an Explorer from ${sp.id} (spread them out)`, pool.map((s) => ({ key: s.id, label: landName(s), space: s.id })), { focus: [sp.id], kind: 'pushTo', about: { space: sp.id, piece: 'explorer' } });
      used.add(k);
      yield* movePiece(ctx, gs, sp, space(gs, k), sp.pieces.find((p) => p.kind === 'explorer')!);
    }
  },
};

/** Thresholds that change a card's own Range. */
export function cardRangeBonus(id: string, el: Elements): number {
  if (id === 'talons-of-lightning' && has(el, '3-fire,3-air')) return 2;
  if (id === 'sap-the-strength-of-multitudes' && has(el, '1-air')) return 1;
  return 0;
}

export const ALL_SPIRIT_IDS = Object.keys(SPIRITS);

export { ctxFor };
