// The 15 base-game Fear Cards. Card text © Greater Than Games (transcribed via the
// Spirit Island Card Katalog). "Each player" effects run one player at a time, in seat order.

import { choose } from './decide';
import type { Eff, Option } from './decide';
import {
  ctxFor,
  damage,
  destroyKinds,
  gainEnergy,
  gather,
  landName,
  log,
  movePiece,
  pickPiece,
  piecesOf,
  push,
  pushDestinations,
  removeHealthWorth,
  removeOneFrom,
  removePiece,
  replacePiece,
} from './ops';
import type { Ctx } from './ops';
import {
  adjacent,
  anySacredSite,
  count,
  dahanCount,
  hasInvaders,
  invaderCount,
  isSacredSite,
  lands,
  space,
  totalPresenceIn,
  townCity,
} from './state';
import type { GameState, Space } from './state';
import type { InvaderKind } from './types';

export interface FearCardDef {
  id: string;
  name: string;
  levels: [string, string, string];
  effect: (gs: GameState, level: 1 | 2 | 3) => Eff;
}

const ET: InvaderKind[] = ['explorer', 'town'];

function* eachPlayer(gs: GameState, name: string, fn: (ctx: Ctx) => Eff): Eff {
  for (const s of gs.spirits) yield* fn(ctxFor(gs, s, name));
}

const opt = (sp: Space): Option => ({ key: sp.id, label: landName(sp), space: sp.id });

function* chooseLand(ctx: Ctx, prompt: string, cands: Space[], allowSkip = false): Eff<Space | null> {
  if (!cands.length) return null;
  const options = cands.map(opt);
  if (allowSkip) options.push({ key: 'skip', label: 'Skip', done: true });
  const k = yield* choose(ctx.gs, ctx.self.index, prompt, options, { source: ctx.source, always: allowSkip });
  return k === 'skip' ? null : space(ctx.gs, k);
}

function defendAll(gs: GameState, pred: (sp: Space) => boolean, amount: (sp: Space) => number) {
  for (const sp of lands(gs)) {
    if (!pred(sp)) continue;
    const n = amount(sp);
    if (n > 0) {
      sp.defend += n;
      log(gs, `Defend ${n} in ${landName(sp)}`);
    }
  }
}

const inland = (sp: Space) => sp.num > 0 && !sp.coastal;

export const FEAR_CARDS: FearCardDef[] = [
  {
    id: 'fear-of-the-unseen',
    name: 'Fear of the Unseen',
    levels: [
      'Each player removes 1 Explorer / Town from a land with Sacred Site.',
      'Each player removes 1 Explorer / Town from a land with Presence.',
      'Each player removes 1 Explorer / Town from a land with Presence, or 1 City from a land with Sacred Site.',
    ],
    effect: function* (gs, tl) {
      yield* eachPlayer(gs, 'Fear of the Unseen', function* (ctx) {
        if (tl === 1) {
          yield* removeOneFrom(ctx, lands(gs).filter((sp) => anySacredSite(gs, sp)), ET, 'Remove 1 Explorer / Town from a land with Sacred Site');
        } else if (tl === 2) {
          yield* removeOneFrom(ctx, lands(gs).filter((sp) => totalPresenceIn(sp) > 0), ET, 'Remove 1 Explorer / Town from a land with Presence');
        } else {
          const opts: Option[] = [];
          for (const sp of lands(gs)) {
            if (totalPresenceIn(sp) > 0) for (const k of ET) if (count(sp, k)) opts.push({ key: `${sp.id}|${k}`, label: `${k === 'town' ? 'Town' : 'Explorer'} from ${landName(sp)}`, space: sp.id });
            if (anySacredSite(gs, sp) && count(sp, 'city')) opts.push({ key: `${sp.id}|city`, label: `City from ${landName(sp)}`, space: sp.id });
          }
          if (!opts.length) return;
          const k = yield* choose(gs, ctx.self.index, 'Remove an Invader', opts, { source: ctx.source });
          const [sid, kind] = k.split('|');
          const sp = space(gs, sid);
          removePiece(gs, sp, sp.pieces.find((p) => p.kind === kind)!, ctx.source);
        }
      });
    },
  },
  {
    id: 'scapegoats',
    name: 'Scapegoats',
    levels: [
      'Each Town destroys 1 Explorer in its land.',
      'Each Town destroys 1 Explorer in its land. Each City destroys 2 Explorer in its land.',
      'Destroy all Explorer in lands with Town / City. Each City destroys 1 Town in its land.',
    ],
    effect: function* (gs, tl) {
      for (const sp of lands(gs)) {
        if (tl === 3) {
          if (townCity(sp) > 0) yield* destroyKinds(null, gs, sp, ['explorer'], 'all', 'Scapegoats');
          yield* destroyKinds(null, gs, sp, ['town'], count(sp, 'city'), 'Scapegoats');
        } else {
          const n = count(sp, 'town') + (tl === 2 ? 2 * count(sp, 'city') : 0);
          if (n) yield* destroyKinds(null, gs, sp, ['explorer'], n, 'Scapegoats');
        }
      }
    },
  },
  {
    id: 'emigration-accelerates',
    name: 'Emigration Accelerates',
    levels: [
      'Each player removes 1 Explorer from a Coastal land.',
      'Each player removes 1 Explorer / Town from a Coastal land.',
      'Each player removes 1 Explorer / Town from any land.',
    ],
    effect: function* (gs, tl) {
      yield* eachPlayer(gs, 'Emigration Accelerates', function* (ctx) {
        const where = tl === 3 ? lands(gs) : lands(gs).filter((s) => s.coastal);
        yield* removeOneFrom(ctx, where, tl === 1 ? ['explorer'] : ET, tl === 3 ? 'Remove 1 Explorer / Town from any land' : `Remove 1 ${tl === 1 ? 'Explorer' : 'Explorer / Town'} from a Coastal land`);
      });
    },
  },
  {
    id: 'dahan-on-their-guard',
    name: 'Dahan on their Guard',
    levels: [
      'In each land, Defend 1 per Dahan.',
      'In each land with Dahan, Defend 1, plus an additional Defend 1 per Dahan.',
      'In each land, Defend 2 per Dahan.',
    ],
    effect: function* (gs, tl) {
      defendAll(gs, (sp) => dahanCount(sp) > 0, (sp) => (tl === 1 ? dahanCount(sp) : tl === 2 ? 1 + dahanCount(sp) : 2 * dahanCount(sp)));
    },
  },
  {
    id: 'tall-tales-of-savagery',
    name: 'Tall Tales of Savagery',
    levels: [
      'Each player removes 1 Explorer from a land with Dahan.',
      'Each player removes 2 Explorer or 1 Town from a land with Dahan.',
      'Remove 2 Explorer or 1 Town from each land with Dahan. Then, remove 1 City from each land with at least 2 Dahan.',
    ],
    effect: function* (gs, tl) {
      const twoOrTown = function* (ctx: Ctx, sp: Space): Eff {
        const canTown = count(sp, 'town') > 0;
        const canEx = count(sp, 'explorer') > 0;
        if (!canTown && !canEx) return;
        let pick = canTown ? 'town' : 'explorer';
        if (canTown && canEx) pick = yield* choose(gs, ctx.self.index, `Tall Tales of Savagery in ${sp.id}`, [{ key: 'explorer', label: 'Remove 2 Explorer' }, { key: 'town', label: 'Remove 1 Town' }], { source: ctx.source });
        if (pick === 'town') removePiece(gs, sp, sp.pieces.find((p) => p.kind === 'town')!, ctx.source);
        else for (const p of piecesOf(sp, ['explorer']).slice(0, 2)) removePiece(gs, sp, p, ctx.source);
      };
      if (tl === 3) {
        const ctx = ctxFor(gs, gs.spirits[0], 'Tall Tales of Savagery');
        for (const sp of lands(gs)) if (dahanCount(sp) > 0) yield* twoOrTown({ ...ctx, self: gs.spirits[0] }, sp);
        for (const sp of lands(gs)) if (dahanCount(sp) >= 2 && count(sp, 'city')) removePiece(gs, sp, sp.pieces.find((p) => p.kind === 'city')!, 'Tall Tales of Savagery');
        return;
      }
      yield* eachPlayer(gs, 'Tall Tales of Savagery', function* (ctx) {
        const withDahan = lands(gs).filter((sp) => dahanCount(sp) > 0);
        if (tl === 1) {
          yield* removeOneFrom(ctx, withDahan, ['explorer'], 'Remove 1 Explorer from a land with Dahan');
        } else {
          const sp = yield* chooseLand(ctx, 'Choose a land with Dahan: remove 2 Explorer or 1 Town', withDahan.filter((s) => count(s, 'explorer') + count(s, 'town') > 0));
          if (sp) yield* twoOrTown(ctx, sp);
        }
      });
    },
  },
  {
    id: 'retreat',
    name: 'Retreat!',
    levels: [
      'Each player may Push up to 2 Explorer from an Inland land.',
      'Each player may Push up to 3 Explorer / Town from an Inland land.',
      'Each player may Push any number of Explorer / Town from one land.',
    ],
    effect: function* (gs, tl) {
      yield* eachPlayer(gs, 'Retreat!', function* (ctx) {
        const kinds = tl === 1 ? (['explorer'] as InvaderKind[]) : ET;
        const cands = lands(gs).filter((sp) => (tl === 3 || inland(sp)) && piecesOf(sp, kinds).length > 0);
        const sp = yield* chooseLand(ctx, `Retreat!: choose a land to Push from`, cands, true);
        if (!sp) return;
        yield* push(ctx, sp, kinds, tl === 1 ? 2 : tl === 2 ? 3 : 99, true);
      });
    },
  },
  {
    id: 'dahan-raid',
    name: 'Dahan Raid',
    levels: [
      'Each player chooses a different land with Dahan. 1 Damage there.',
      'Each player chooses a different land with Dahan. 1 Damage per Dahan there.',
      'Each player chooses a different land with Dahan. 2 Damage per Dahan there.',
    ],
    effect: function* (gs, tl) {
      const chosen = new Set<string>();
      yield* eachPlayer(gs, 'Dahan Raid', function* (ctx) {
        const sp = yield* chooseLand(ctx, 'Dahan Raid: choose a land with Dahan', lands(gs).filter((s) => dahanCount(s) > 0 && !chosen.has(s.id)));
        if (!sp) return;
        chosen.add(sp.id);
        const n = tl === 1 ? 1 : tl === 2 ? dahanCount(sp) : 2 * dahanCount(sp);
        yield* damage(null, gs, sp, n, { owner: ctx.self.index, source: 'Dahan Raid' });
      });
    },
  },
  {
    id: 'dahan-enheartened',
    name: 'Dahan Enheartened',
    levels: [
      'Each player may Push 1 Dahan from a land with Invaders or Gather 1 Dahan into a land with Invaders.',
      'Each player chooses a different land. In chosen lands: Gather up to 2 Dahan, then 1 Damage if Dahan are present.',
      'Each player chooses a different land. In chosen lands: Gather up to 2 Dahan, then 1 Damage per Dahan present.',
    ],
    effect: function* (gs, tl) {
      const chosen = new Set<string>();
      yield* eachPlayer(gs, 'Dahan Enheartened', function* (ctx) {
        if (tl === 1) {
          const k = yield* choose(gs, ctx.self.index, 'Dahan Enheartened', [
            { key: 'push', label: 'Push 1 Dahan from a land with Invaders' },
            { key: 'gather', label: 'Gather 1 Dahan into a land with Invaders' },
            { key: 'skip', label: 'Skip', done: true },
          ], { source: ctx.source, always: true });
          if (k === 'push') {
            const sp = yield* chooseLand(ctx, 'Push 1 Dahan from which land?', lands(gs).filter((s) => hasInvaders(s) && dahanCount(s) > 0), true);
            if (sp) yield* push(ctx, sp, ['dahan'], 1, true);
          } else if (k === 'gather') {
            const sp = yield* chooseLand(ctx, 'Gather 1 Dahan into which land?', lands(gs).filter((s) => hasInvaders(s) && adjacent(gs, s).some((a) => dahanCount(a) > 0)), true);
            if (sp) yield* gather(ctx, sp, ['dahan'], 1, true);
          }
          return;
        }
        const sp = yield* chooseLand(ctx, 'Dahan Enheartened: choose a land', lands(gs).filter((s) => !chosen.has(s.id)));
        if (!sp) return;
        chosen.add(sp.id);
        yield* gather(ctx, sp, ['dahan'], 2, true);
        const d = dahanCount(sp);
        if (d > 0) yield* damage(null, gs, sp, tl === 2 ? 1 : d, { owner: ctx.self.index, source: 'Dahan Enheartened' });
      });
    },
  },
  {
    id: 'avoid-the-dahan',
    name: 'Avoid the Dahan',
    levels: [
      'Invaders do not Explore into lands with at least 2 Dahan.',
      'Invaders do not Build in lands where Dahan outnumber Town / City.',
      'Invaders do not Build in lands with Dahan.',
    ],
    effect: function* (gs, tl) {
      gs.turnFlags.avoidDahan = tl;
    },
  },
  {
    id: 'seek-safety',
    name: 'Seek Safety',
    levels: [
      'Each player may Push 1 Explorer into a land with more Town / City than the land it came from.',
      'Each player may Gather 1 Explorer into a land with Town / City, or Gather 1 Town into a land with City.',
      'Each player may remove up to 3 Health worth of Invaders from a land without City.',
    ],
    effect: function* (gs, tl) {
      yield* eachPlayer(gs, 'Seek Safety', function* (ctx) {
        if (tl === 1) {
          const opts: Option[] = [];
          for (const sp of lands(gs)) {
            if (!count(sp, 'explorer')) continue;
            for (const to of pushDestinations(gs, sp, false)) {
              if (to.num > 0 && townCity(to) > townCity(sp)) opts.push({ key: `${sp.id}>${to.id}`, label: `Explorer ${sp.id} → ${to.id}`, space: sp.id });
            }
          }
          if (!opts.length) return;
          opts.push({ key: 'skip', label: 'Skip', done: true });
          const k = yield* choose(gs, ctx.self.index, 'Seek Safety: Push 1 Explorer toward the settlements?', opts, { source: ctx.source, always: true });
          if (k === 'skip') return;
          const [a, b] = k.split('>');
          const from = space(gs, a);
          yield* movePiece(ctx, gs, from, space(gs, b), from.pieces.find((p) => p.kind === 'explorer')!);
        } else if (tl === 2) {
          const k = yield* choose(gs, ctx.self.index, 'Seek Safety', [
            { key: 'ex', label: 'Gather 1 Explorer into a land with Town / City' },
            { key: 'town', label: 'Gather 1 Town into a land with City' },
            { key: 'skip', label: 'Skip', done: true },
          ], { source: ctx.source, always: true });
          if (k === 'skip') return;
          const kind: InvaderKind = k === 'ex' ? 'explorer' : 'town';
          const targets = lands(gs).filter((s) => (k === 'ex' ? townCity(s) > 0 : count(s, 'city') > 0) && adjacent(gs, s).some((a) => a.num > 0 && count(a, kind) > 0));
          const sp = yield* chooseLand(ctx, `Gather 1 ${kind === 'town' ? 'Town' : 'Explorer'} into which land?`, targets, true);
          if (sp) yield* gather(ctx, sp, [kind], 1, true);
        } else {
          const sp = yield* chooseLand(ctx, 'Seek Safety: remove up to 3 Health of Invaders from a land without City', lands(gs).filter((s) => hasInvaders(s) && !count(s, 'city')), true);
          if (sp) yield* removeHealthWorth(ctx, sp, 3);
        }
      });
    },
  },
  {
    id: 'wary-of-the-interior',
    name: 'Wary of the Interior',
    levels: [
      'Each player removes 1 Explorer from an Inland land.',
      'Each player removes 1 Explorer / Town from an Inland land.',
      'Each player removes 1 Explorer / Town from any land.',
    ],
    effect: function* (gs, tl) {
      yield* eachPlayer(gs, 'Wary of the Interior', function* (ctx) {
        const where = tl === 3 ? lands(gs) : lands(gs).filter(inland);
        yield* removeOneFrom(ctx, where, tl === 1 ? ['explorer'] : ET, `Remove 1 ${tl === 1 ? 'Explorer' : 'Explorer / Town'} from ${tl === 3 ? 'any' : 'an Inland'} land`);
      });
    },
  },
  {
    id: 'belief-takes-root',
    name: 'Belief Takes Root',
    levels: [
      'Defend 2 in all lands with Presence.',
      'Defend 2 in all lands with Presence. Each Spirit gains 1 Energy per Sacred Site they have in lands with Invaders.',
      'Each player chooses a different land and removes up to 2 Health worth of Invaders per Presence there.',
    ],
    effect: function* (gs, tl) {
      if (tl < 3) {
        defendAll(gs, (sp) => totalPresenceIn(sp) > 0, () => 2);
        if (tl === 2) {
          for (const s of gs.spirits) {
            const n = lands(gs).filter((sp) => hasInvaders(sp) && isSacredSite(gs, s, sp)).length;
            gainEnergy(gs, s, n, 'Belief Takes Root');
          }
        }
        return;
      }
      const chosen = new Set<string>();
      yield* eachPlayer(gs, 'Belief Takes Root', function* (ctx) {
        const sp = yield* chooseLand(ctx, 'Belief Takes Root: choose a land (remove 2 Health of Invaders per Presence there)', lands(gs).filter((s) => !chosen.has(s.id) && totalPresenceIn(s) > 0 && hasInvaders(s)));
        if (!sp) return;
        chosen.add(sp.id);
        yield* removeHealthWorth(ctx, sp, 2 * totalPresenceIn(sp));
      });
    },
  },
  {
    id: 'isolation',
    name: 'Isolation',
    levels: [
      'Each player removes 1 Explorer / Town from a land where it is the only Invader.',
      'Each player removes 1 Explorer / Town from a land with 2 or fewer Invaders.',
      'Each player removes an Invader from a land with 2 or fewer Invaders.',
    ],
    effect: function* (gs, tl) {
      yield* eachPlayer(gs, 'Isolation', function* (ctx) {
        const where = lands(gs).filter((sp) => (tl === 1 ? invaderCount(sp) === 1 : invaderCount(sp) > 0 && invaderCount(sp) <= 2));
        yield* removeOneFrom(ctx, where, tl === 3 ? ['explorer', 'town', 'city'] : ET, tl === 1 ? 'Remove a lone Explorer / Town' : 'Remove an Invader from a land with 2 or fewer Invaders');
      });
    },
  },
  {
    id: 'overseas-trade-seem-safer',
    name: 'Overseas Trade Seem Safer',
    levels: [
      'Defend 3 in all Coastal lands.',
      'Defend 6 in all Coastal lands. Invaders do not Build City in Coastal lands this turn.',
      'Defend 9 in all Coastal lands. Invaders do not Build in Coastal lands this turn.',
    ],
    effect: function* (gs, tl) {
      defendAll(gs, (sp) => sp.coastal, () => 3 * tl);
      if (tl > 1) gs.turnFlags.overseasTrade = tl;
    },
  },
  {
    id: 'trade-suffers',
    name: 'Trade Suffers',
    levels: [
      'Invaders do not Build in lands with City.',
      'Each player may replace 1 Town with 1 Explorer in a Coastal land.',
      'Each player may replace 1 City with 1 Town or 1 Town with 1 Explorer in a Coastal land.',
    ],
    effect: function* (gs, tl) {
      if (tl === 1) {
        gs.turnFlags.tradeSuffers1 = true;
        return;
      }
      yield* eachPlayer(gs, 'Trade Suffers', function* (ctx) {
        const opts: Option[] = [];
        for (const sp of lands(gs).filter((s) => s.coastal)) {
          if (count(sp, 'town')) opts.push({ key: `${sp.id}|town`, label: `Town → Explorer in ${landName(sp)}`, space: sp.id });
          if (tl === 3 && count(sp, 'city')) opts.push({ key: `${sp.id}|city`, label: `City → Town in ${landName(sp)}`, space: sp.id });
        }
        if (!opts.length) return;
        opts.push({ key: 'skip', label: 'Skip', done: true });
        const k = yield* choose(gs, ctx.self.index, 'Trade Suffers: replace an Invader?', opts, { source: ctx.source, always: true });
        if (k === 'skip') return;
        const [sid, kind] = k.split('|');
        const sp = space(gs, sid);
        const p = yield* pickPiece(gs, ctx.self.index, sp, kind as InvaderKind, `Replace which ${kind === 'town' ? 'Town' : 'City'}?`);
        if (p) replacePiece(gs, sp, p, kind === 'town' ? 'explorer' : 'town');
      });
    },
  },
];

export const FEAR_BY_ID: Record<string, FearCardDef> = Object.fromEntries(FEAR_CARDS.map((c) => [c.id, c]));

