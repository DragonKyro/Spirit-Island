// Innate Power effects. `tiers` = indexes of the thresholds the Spirit meets
// (in printed order); "Instead" tiers replace lower ones, "Also" tiers add.

import { has } from './cards';
import { choose, confirm } from './decide';
import type { Eff } from './decide';
import { INNATES } from './spiritData';
import {
  addFear,
  chooseElement,
  chooseLandTarget,
  damage,
  damageEach,
  damageOne,
  destroyKinds,
  drownFrom,
  elementsOf,
  gather,
  landName,
  log,
  push,
  removeBlight,
} from './ops';
import type { Ctx } from './ops';
import { count, dahanCount, meetsThreshold } from './state';
import { ELEMENTS } from './types';
import type { Elements } from './types';

export type InnateEffect = (ctx: Ctx, tiers: number[], el: Elements) => Eff;

export function tiersMet(id: string, el: Elements): number[] {
  return INNATES[id].tiers.map((t, i) => (meetsThreshold(el, t.need) ? i : -1)).filter((i) => i >= 0);
}

const top = (tiers: number[]) => (tiers.length ? Math.max(...tiers) : -1);

export const INNATE_EFFECTS: Record<string, InnateEffect> = {
  'thundering-destruction': function* (ctx, tiers) {
    const sp = ctx.target!;
    let kind: 'town' | 'city' = 'town';
    if (tiers.includes(1) && count(sp, 'city') > 0) {
      const city = yield* confirm(ctx.gs, ctx.self.index, 'Thundering Destruction: destroy 1 City instead of 1 Town?', 'Destroy City', 'Destroy Town');
      if (city) kind = 'city';
    }
    yield* destroyKinds(ctx, ctx.gs, sp, [kind], 1);
    if (tiers.includes(2)) yield* destroyKinds(ctx, ctx.gs, sp, ['town', 'city'], 1);
    if (tiers.includes(3)) yield* destroyKinds(ctx, ctx.gs, sp, ['town', 'city'], 1);
  },

  'massive-flooding': function* (ctx, tiers) {
    const sp = ctx.target!;
    let t = top(tiers);
    if (tiers.length > 1) {
      const labels = ['Push 1 Explorer / Town', '2 Damage, Push up to 3 Explorer / Town', '2 Damage to each Invader'];
      t = Number(yield* choose(ctx.gs, ctx.self.index, 'Massive Flooding: resolve which level?', tiers.map((i) => ({ key: String(i), label: labels[i] })).reverse()));
    }
    if (t >= 2) yield* damageEach(ctx, ctx.gs, sp, 2);
    else if (t === 1) {
      yield* damage(ctx, ctx.gs, sp, 2);
      yield* push(ctx, sp, ['explorer', 'town'], 3, true);
    } else yield* push(ctx, sp, ['explorer', 'town'], 1, false);
  },

  'gift-of-strength': function* (ctx, tiers) {
    const t = top(tiers);
    const maxCost = t >= 2 ? 6 : t === 1 ? 3 : 1;
    ctx.targetSpirit!.repeats.push({ source: 'Gift of Strength', maxCost, payCost: false, uses: 1 });
    log(ctx.gs, `${ctx.targetSpirit!.name} may Repeat 1 Power Card costing ${maxCost} or less this turn`);
  },

  'darkness-swallows-the-unwary': function* (ctx, tiers) {
    const sp = ctx.target!;
    if (tiers.includes(0)) yield* gather(ctx, sp, ['explorer'], 1, false);
    if (tiers.includes(1)) {
      const before = count(sp, 'explorer');
      const max = Math.min(2, before);
      let n = 0;
      for (let i = 0; i < max; i++) {
        const go = yield* confirm(ctx.gs, ctx.self.index, `Darkness Swallows the Unwary: destroy an Explorer? (${i}/${max})`, 'Destroy', 'Stop');
        if (!go) break;
        yield* destroyKinds(ctx, ctx.gs, sp, ['explorer'], 1);
        n++;
      }
      // 1 Fear per Explorer destroyed (Bringer never shares a land-effect with this, so count directly)
      addFear(ctx.gs, Math.min(n, before - count(sp, 'explorer')), ctx);
    }
    if (tiers.includes(2)) {
      const killed = yield* damage(ctx, ctx.gs, sp, 3);
      addFear(ctx.gs, killed, ctx);
    }
  },

  'gather-the-warriors': function* (ctx, _tiers, el) {
    const sp = ctx.target!;
    yield* gather(ctx, sp, ['dahan'], el.AIR ?? 0, true);
    yield* push(ctx, sp, ['dahan'], el.SUN ?? 0, true);
  },

  'lead-the-furious-assault': function* (ctx, tiers) {
    const sp = ctx.target!;
    if (tiers.includes(0)) yield* destroyKinds(ctx, ctx.gs, sp, ['town'], Math.floor(dahanCount(sp) / 2));
    if (tiers.includes(1)) yield* destroyKinds(ctx, ctx.gs, sp, ['city'], Math.floor(dahanCount(sp) / 3));
  },

  'creepers-tear-into-mortar': function* (ctx, tiers) {
    const times = 1 + (tiers.includes(1) ? 1 : 0) + (tiers.includes(2) ? 1 : 0);
    let sp = ctx.target!;
    for (let i = 0; i < times; i++) {
      if (i > 0) {
        const next = yield* chooseLandTarget(ctx.gs, ctx.self, { n: 0 }, { t: 'any' }, 'Creepers Tear into Mortar (Repeat)', 0, { optional: "Don't repeat" });
        if (!next) break;
        sp = next;
      }
      yield* damageOne({ ...ctx, target: sp }, sp, 1, ['town', 'city']);
    }
  },

  'all-enveloping-green': function* (ctx, tiers) {
    const sp = ctx.target!;
    const d = tiers.includes(1) ? 4 : 2;
    sp.defend += d;
    log(ctx.gs, `Defend ${d} in ${landName(sp)}`);
    if (tiers.includes(2)) removeBlight(ctx.gs, sp, 'All-Enveloping Green');
  },

  'pound-ships-to-splinters': function* (ctx, tiers) {
    let f = 1;
    if (tiers.includes(1)) f += 1;
    if (tiers.includes(2)) f += 2;
    addFear(ctx.gs, f, ctx);
  },

  'ocean-breaks-the-shore': function* (ctx, tiers) {
    const sp = ctx.target!;
    let kind: 'town' | 'city' = 'town';
    if (tiers.includes(1) && count(sp, 'city') > 0) {
      const city = yield* confirm(ctx.gs, ctx.self.index, 'Ocean Breaks the Shore: Drown 1 City instead of 1 Town?', 'Drown City', 'Drown Town');
      if (city) kind = 'city';
    }
    yield* drownFrom(ctx, sp, [kind], 1);
    if (tiers.includes(2)) yield* drownFrom(ctx, sp, ['town', 'city'], 1);
  },

  'spirits-may-yet-dream': function* (ctx, tiers) {
    const gs = ctx.gs;
    if (tiers.includes(0)) {
      const hidden = gs.fear.deck.map((id, i) => ({ id, i })).filter(({ id }) => !gs.fear.revealed.includes(id));
      if (hidden.length) {
        const k = yield* choose(gs, ctx.self.index, 'Spirits May Yet Dream: turn which face-down Fear Card face-up?', hidden.map(({ id, i }) => ({ key: id, label: i === 0 ? 'Top card of the Fear Deck' : `Fear Deck card #${i + 1}` })));
        gs.fear.revealed.push(k);
        log(gs, `A Fear Card is turned face-up`);
      }
    }
    if (tiers.includes(1)) {
      const t = ctx.targetSpirit!;
      const owned = elementsOf(t);
      const among = ELEMENTS.filter((e) => (owned[e] ?? 0) >= 1);
      if (among.length) {
        const e = yield* chooseElement(gs, t.index, 'Spirits May Yet Dream: gain an Element you have at least 1 of', among);
        t.bonusElements[e] = (t.bonusElements[e] ?? 0) + 1;
      }
    }
  },

  'night-terrors': function* (ctx, tiers) {
    addFear(ctx.gs, 1 + (tiers.includes(1) ? 1 : 0) + (tiers.includes(2) ? 1 : 0), ctx);
  },
};

/** Thunderspeaker's innates may be Fast with 4 Air. */
export function innateMayBeFast(id: string, el: Elements): boolean {
  const f = INNATES[id].fastIf;
  return !!f && meetsThreshold(el, f);
}

export { has };
