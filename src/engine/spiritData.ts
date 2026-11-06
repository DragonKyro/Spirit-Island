// Spirit panels for the 8 base-game Spirits (revised edition): Growth, Presence
// Tracks, Innate Power thresholds, Special Rules and Setup. Innate effects live in
// innates.ts; special rules are implemented where they apply (ops.ts / phases.ts).

import type { LandFilter, TargetSpec } from './cardData';
import type { TrackSlot } from './state';
import type { Element, Elements, SpiritId, Speed } from './types';

export type PresenceFilter = 'dahan' | 'dahanOrInvaders' | 'jungleWetland' | 'ocean' | 'coastal';

export type GrowthItem =
  | { t: 'reclaimAll' }
  | { t: 'reclaimOne' }
  | { t: 'gainCard' }
  | { t: 'energy'; n: number }
  | { t: 'presence'; range: number | 'any'; filter?: PresenceFilter }
  | { t: 'cardPlay'; n: number }
  /** Ocean: Gather 1 of your Presence into each Ocean */
  | { t: 'gatherPresenceOceans' }
  /** Ocean: Push 1 of your Presence from each Ocean */
  | { t: 'pushPresenceOceans' };

export interface InnateData {
  id: string;
  name: string;
  speed: Speed;
  target: TargetSpec;
  /** Thunderspeaker: with these elements this Power may be Fast */
  fastIf?: Elements;
  tiers: { need: Elements; text: string }[];
}

export interface SpiritData {
  id: SpiritId;
  name: string;
  complexity: 'Low' | 'Moderate' | 'High';
  color: string;
  summary: string;
  growth: { always?: GrowthItem[]; options: GrowthItem[][] };
  energyTrack: TrackSlot[];
  cardTrack: TrackSlot[];
  innates: InnateData[];
  specialRules: { name: string; text: string }[];
  setupText: string;
}

/** Parse a presence track written like "1,air,2,reclaim-one,any". */
function track(spec: string, kind: 'energy' | 'plays'): TrackSlot[] {
  return spec.split(',').map((tok) => {
    const t = tok.trim();
    if (/^\d+$/.test(t)) return kind === 'energy' ? { energy: Number(t) } : { plays: Number(t) };
    if (t === 'reclaim-one') return { reclaimOne: true };
    if (t === 'any') return { any: true };
    return { element: t.toUpperCase() as Element };
  });
}

const els = (spec: string): Elements => {
  const out: Elements = {};
  for (const part of spec.split(',')) {
    const [n, el] = part.trim().split('-');
    out[el.toUpperCase() as Element] = Number(n);
  }
  return out;
};

const landT = (n: number, sacred = false, filter: LandFilter = { t: 'any' }): TargetSpec => ({
  kind: 'land',
  range: { n, sacred },
  filter,
});

export const SPIRITS: Record<SpiritId, SpiritData> = {
  lightning: {
    id: 'lightning',
    name: "Lightning's Swift Strike",
    complexity: 'Low',
    color: '#f2c94c',
    summary: 'Strikes fast and hard at Towns and Cities; many card plays, little Energy.',
    growth: {
      options: [
        [{ t: 'reclaimAll' }, { t: 'gainCard' }, { t: 'energy', n: 1 }],
        [{ t: 'presence', range: 2 }, { t: 'presence', range: 0 }],
        [{ t: 'presence', range: 1 }, { t: 'energy', n: 3 }],
      ],
    },
    energyTrack: track('1,1,2,2,3,4,4,5', 'energy'),
    cardTrack: track('2,3,4,5,6', 'plays'),
    innates: [
      {
        id: 'thundering-destruction',
        name: 'Thundering Destruction',
        speed: 'SLOW',
        target: landT(1, true, { t: 'invaders' }),
        tiers: [
          { need: els('3-fire,2-air'), text: 'Destroy 1 Town.' },
          { need: els('4-fire,3-air'), text: 'You may instead destroy 1 City.' },
          { need: els('5-fire,4-air,1-water'), text: 'Also, Destroy 1 Town / City.' },
          { need: els('5-fire,5-air,2-water'), text: 'Also, Destroy 1 Town / City.' },
        ],
      },
    ],
    specialRules: [
      {
        name: 'Swiftness of Lightning',
        text: 'For every Air you have, you may use 1 Slow Power as if it were Fast. (Power Cards or your Innate Powers.)',
      },
    ],
    setupText: 'Put 2 Presence on your starting board in the highest-numbered Sands.',
  },

  river: {
    id: 'river',
    name: 'River Surges in Sunlight',
    complexity: 'Low',
    color: '#4aa3df',
    summary: 'Pushes Invaders around and floods them; Wetlands are its Sacred Sites.',
    growth: {
      options: [
        [{ t: 'reclaimAll' }, { t: 'gainCard' }, { t: 'energy', n: 1 }],
        [{ t: 'presence', range: 1 }, { t: 'presence', range: 1 }],
        [{ t: 'gainCard' }, { t: 'presence', range: 2 }],
      ],
    },
    energyTrack: track('1,2,2,3,4,4,5', 'energy'),
    cardTrack: track('1,2,2,3,reclaim-one,4,5', 'plays'),
    innates: [
      {
        id: 'massive-flooding',
        name: 'Massive Flooding',
        speed: 'SLOW',
        target: landT(1, true),
        tiers: [
          { need: els('1-sun,2-water'), text: 'Push 1 Explorer / Town.' },
          { need: els('2-sun,3-water'), text: 'Instead, 2 Damage. Push up to 3 Explorer / Town.' },
          { need: els('3-sun,4-water,1-earth'), text: 'Instead, 2 Damage to each Invader.' },
        ],
      },
    ],
    specialRules: [{ name: "River's Domain", text: 'Your Presence in Wetlands count as Sacred Sites.' }],
    setupText: 'Put 1 Presence on your starting board in the highest-numbered Wetland.',
  },

  earth: {
    id: 'earth',
    name: 'Vital Strength of the Earth',
    complexity: 'Low',
    color: '#b07b46',
    summary: 'Slow, sturdy and defensive; huge Energy, few card plays.',
    growth: {
      options: [
        [{ t: 'reclaimAll' }, { t: 'presence', range: 2 }],
        [{ t: 'gainCard' }, { t: 'presence', range: 0 }],
        [{ t: 'presence', range: 1 }, { t: 'energy', n: 2 }],
      ],
    },
    energyTrack: track('2,3,4,6,7,8', 'energy'),
    cardTrack: track('1,1,2,2,3,4', 'plays'),
    innates: [
      {
        id: 'gift-of-strength',
        name: 'Gift of Strength',
        speed: 'FAST',
        target: { kind: 'spirit', who: 'any' },
        tiers: [
          { need: els('1-sun,2-earth,2-plant'), text: 'Once this turn, Target Spirit may Repeat 1 Power Card with Energy cost of 1 or less.' },
          { need: els('2-sun,3-earth,2-plant'), text: 'Instead, the Energy cost limit is 3 or less.' },
          { need: els('2-sun,4-earth,3-plant'), text: 'Instead, the Energy cost limit is 6 or less.' },
        ],
      },
    ],
    specialRules: [{ name: "Earth's Vitality", text: 'Defend 3 in every land where you have Sacred Site.' }],
    setupText: 'Put 2 Presence on your starting board in the highest-numbered Mountain. Put 1 Presence in the highest-numbered Jungle.',
  },

  shadows: {
    id: 'shadows',
    name: 'Shadows Flicker Like Flame',
    complexity: 'Low',
    color: '#9b6bd6',
    summary: 'Fear and misdirection; can reach any land with Dahan.',
    growth: {
      options: [
        [{ t: 'reclaimAll' }, { t: 'gainCard' }],
        [{ t: 'gainCard' }, { t: 'presence', range: 1 }],
        [{ t: 'presence', range: 3 }, { t: 'energy', n: 3 }],
      ],
    },
    energyTrack: track('0,1,3,4,5,6', 'energy'),
    cardTrack: track('1,2,3,3,4,5', 'plays'),
    innates: [
      {
        id: 'darkness-swallows-the-unwary',
        name: 'Darkness Swallows the Unwary',
        speed: 'FAST',
        target: landT(1, true),
        tiers: [
          { need: els('2-moon,1-fire'), text: 'Gather 1 Explorer.' },
          { need: els('3-moon,2-fire'), text: 'Destroy up to 2 Explorer. 1 Fear per Explorer destroyed.' },
          { need: els('4-moon,3-fire,2-air'), text: '3 Damage. 1 Fear per Invader destroyed by this Damage.' },
        ],
      },
    ],
    specialRules: [
      {
        name: 'Shadows of the Dahan',
        text: "Whenever you use a Power, you may pay 1 Energy to target a land with Dahan regardless of the Power's Range. (Power Cards or your Innate Powers.)",
      },
    ],
    setupText: 'Put 2 Presence on your starting board in the highest-numbered Jungle. Put 1 Presence in land #5.',
  },

  thunderspeaker: {
    id: 'thunderspeaker',
    name: 'Thunderspeaker',
    complexity: 'Moderate',
    color: '#e8783a',
    summary: 'Leads the Dahan to war; its Presence travels with them.',
    growth: {
      options: [
        [{ t: 'reclaimAll' }, { t: 'gainCard' }, { t: 'gainCard' }],
        [{ t: 'presence', range: 2, filter: 'dahan' }, { t: 'presence', range: 1, filter: 'dahan' }],
        [{ t: 'presence', range: 1 }, { t: 'energy', n: 4 }],
      ],
    },
    energyTrack: track('1,air,2,fire,sun,3', 'energy'),
    cardTrack: track('1,2,2,3,reclaim-one,3,4', 'plays'),
    innates: [
      {
        id: 'gather-the-warriors',
        name: 'Gather the Warriors',
        speed: 'SLOW',
        target: landT(1),
        fastIf: els('4-air'),
        tiers: [{ need: els('1-animal'), text: 'Gather up to 1 Dahan per Air you have. Push up to 1 Dahan per Sun you have.' }],
      },
      {
        id: 'lead-the-furious-assault',
        name: 'Lead the Furious Assault',
        speed: 'SLOW',
        target: landT(0),
        fastIf: els('4-air'),
        tiers: [
          { need: els('2-sun,1-fire'), text: 'Destroy 1 Town for every 2 Dahan in target land.' },
          { need: els('4-sun,3-fire'), text: 'Destroy 1 City for every 3 Dahan in target land.' },
        ],
      },
    ],
    specialRules: [
      {
        name: 'Ally of the Dahan',
        text: 'Your Presence may move with Dahan. (Whenever a Dahan moves from 1 of your lands to another land, you may move 1 Presence along with it.)',
      },
      {
        name: 'Sworn to Victory',
        text: 'After a Ravage Action destroys 1 or more Dahan, for each Dahan Destroyed, Destroy 1 of your Presence within Range 1.',
      },
    ],
    setupText: 'Put 2 Presence on your starting board: 1 in each of the 2 lands with the most Dahan.',
  },

  green: {
    id: 'green',
    name: 'A Spread of Rampant Green',
    complexity: 'Moderate',
    color: '#5cb85c',
    summary: 'Spreads Presence relentlessly and chokes Invader actions in its Sacred Sites.',
    growth: {
      always: [{ t: 'presence', range: 2, filter: 'jungleWetland' }],
      options: [
        [{ t: 'reclaimAll' }, { t: 'gainCard' }],
        [{ t: 'presence', range: 1 }, { t: 'cardPlay', n: 1 }],
        [{ t: 'gainCard' }, { t: 'energy', n: 3 }],
      ],
    },
    energyTrack: track('0,1,plant,2,2,plant,3', 'energy'),
    cardTrack: track('1,1,2,2,3,4', 'plays'),
    innates: [
      {
        id: 'creepers-tear-into-mortar',
        name: 'Creepers Tear into Mortar',
        speed: 'SLOW',
        target: landT(0),
        tiers: [
          { need: els('1-moon,2-plant'), text: '1 Damage to 1 Town / City.' },
          { need: els('2-moon,3-plant'), text: 'Repeat this Power.' },
          { need: els('3-moon,4-plant'), text: 'Repeat this Power again.' },
        ],
      },
      {
        id: 'all-enveloping-green',
        name: 'All-Enveloping Green',
        speed: 'FAST',
        target: landT(1, true),
        tiers: [
          { need: els('1-water,3-plant'), text: 'Defend 2.' },
          { need: els('2-water,4-plant'), text: 'Instead, Defend 4.' },
          { need: els('3-water,1-earth,5-plant'), text: 'Also, remove 1 Blight.' },
        ],
      },
    ],
    specialRules: [
      {
        name: 'Choke the Land with Green',
        text: 'Whenever Invaders would Ravage or Build in a land with your Sacred Site, you may prevent it by destroying one of your Presence in that land.',
      },
      {
        name: 'Steady Regeneration',
        text: 'When adding Presence to the board via Growth, you may optionally use your destroyed Presence. If the island is Healthy, do so freely. If the island is Blighted, doing so costs 1 Energy per destroyed Presence you add.',
      },
    ],
    setupText: 'Put 1 Presence on your starting board in the highest-numbered Wetland, and 1 in the Jungle without any Dahan.',
  },

  ocean: {
    id: 'ocean',
    name: "Ocean's Hungry Grasp",
    complexity: 'High',
    color: '#2bb5a8',
    summary: 'Lives in the Ocean and drags coastal Invaders to a watery grave.',
    growth: {
      options: [
        [{ t: 'reclaimAll' }, { t: 'gainCard' }, { t: 'gatherPresenceOceans' }, { t: 'energy', n: 2 }],
        [{ t: 'presence', range: 'any', filter: 'ocean' }, { t: 'presence', range: 'any', filter: 'ocean' }, { t: 'energy', n: 1 }],
        [{ t: 'gainCard' }, { t: 'presence', range: 1, filter: 'coastal' }, { t: 'pushPresenceOceans' }],
      ],
    },
    energyTrack: track('0,moon,water,1,earth,water,2', 'energy'),
    cardTrack: track('1,2,2,3,4,5', 'plays'),
    innates: [
      {
        id: 'pound-ships-to-splinters',
        name: 'Pound Ships to Splinters',
        speed: 'FAST',
        target: { kind: 'land', range: { n: 0 }, filter: { t: 'coastal' } },
        tiers: [
          { need: els('1-moon,1-air,2-water'), text: '1 Fear.' },
          { need: els('2-moon,1-air,3-water'), text: '+1 Fear.' },
          { need: els('3-moon,2-air,4-water'), text: '+2 Fear.' },
        ],
      },
      {
        id: 'ocean-breaks-the-shore',
        name: 'Ocean Breaks the Shore',
        speed: 'SLOW',
        target: { kind: 'land', range: { n: 0 }, filter: { t: 'coastal' } },
        tiers: [
          { need: els('2-water,1-earth'), text: 'Drown 1 Town.' },
          { need: els('3-water,2-earth'), text: 'You may instead Drown 1 City.' },
          { need: els('4-water,3-earth'), text: 'Also, Drown 1 Town / City.' },
        ],
      },
    ],
    specialRules: [
      {
        name: 'Ocean in Play',
        text: 'You may add/move Presence into Oceans, but may not add/move Presence into Inland lands. On boards where you have 1 or more Presence, Oceans are treated as Coastal Wetlands for Spirit Powers and Blight. You Drown any Invaders or Dahan moved to those Oceans.',
      },
      {
        name: 'Drowning',
        text: 'Destroy Drowned pieces, placing Drowned Invaders here. At any time you may exchange (X) Health of these Invaders for 1 Energy, where X = number of players.',
      },
    ],
    setupText: 'Put 1 Presence in the Ocean of your starting board, and 1 in a Coastal land of your choice.',
  },

  bringer: {
    id: 'bringer',
    name: 'Bringer of Dreams and Nightmares',
    complexity: 'High',
    color: '#7a7fe8',
    summary: 'Its Powers never truly destroy — they terrify, generating Fear and driving Invaders away.',
    growth: {
      options: [
        [{ t: 'reclaimAll' }, { t: 'gainCard' }],
        [{ t: 'reclaimOne' }, { t: 'presence', range: 0 }],
        [{ t: 'gainCard' }, { t: 'presence', range: 1 }],
        [{ t: 'presence', range: 4, filter: 'dahanOrInvaders' }, { t: 'energy', n: 2 }],
      ],
    },
    energyTrack: track('2,air,3,moon,4,any,5', 'energy'),
    cardTrack: track('2,2,2,3,3,any', 'plays'),
    innates: [
      {
        id: 'spirits-may-yet-dream',
        name: 'Spirits May Yet Dream',
        speed: 'FAST',
        target: { kind: 'spirit', who: 'any' },
        tiers: [
          { need: els('2-moon,2-air'), text: "Turn any face-down Fear Card face-up. (It's earned/resolved normally, but players can see what's coming.)" },
          { need: els('3-moon'), text: 'Target Spirit gains an Element they have at least 1 of.' },
        ],
      },
      {
        id: 'night-terrors',
        name: 'Night Terrors',
        speed: 'FAST',
        target: { kind: 'land', range: { n: 0 }, filter: { t: 'invaders' } },
        tiers: [
          { need: els('1-moon,1-air'), text: '1 Fear.' },
          { need: els('2-moon,1-air,1-animal'), text: '+1 Fear.' },
          { need: els('3-moon,2-air,1-animal'), text: '+1 Fear.' },
        ],
      },
    ],
    specialRules: [
      {
        name: 'To Dream a Thousand Deaths',
        text: 'Your Powers never cause Damage, nor can they Destroy anything other than your own Presence. When a Power of yours would Destroy (or deal enough Damage to Destroy) Explorer / Town / City, generate 0 / 2 / 5 Fear instead. The Power Pushes all Explorer / Town it would Destroy. A single Power cannot Destroy a given Invader more than once; Powers which cause Damage via Dahan are affected too.',
      },
    ],
    setupText: 'Put 2 Presence on your starting board in the highest-numbered Sands.',
  },
};

export const SPIRIT_ORDER: SpiritId[] = ['lightning', 'river', 'earth', 'shadows', 'thunderspeaker', 'green', 'ocean', 'bringer'];

export const INNATES: Record<string, InnateData & { spirit: SpiritId }> = Object.fromEntries(
  SPIRIT_ORDER.flatMap((sid) => SPIRITS[sid].innates.map((i) => [i.id, { ...i, spirit: sid }])),
);
