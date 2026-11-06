// Power Card data for the base game (revised edition text). Effects are implemented
// in cards.ts, keyed by the same id.
//
// Card text transcribed from the community Spirit Island Card Katalog
// (github.com/oberien/spirit-island-card-katalog). Card text © Greater Than Games.

import type { Element, LandTerrain, SpiritId, Speed } from './types';

export type CardType = 'unique' | 'minor' | 'major';

export interface RangeSpec {
  n: number;
  /** measure from Sacred Sites instead of any Presence */
  sacred?: boolean;
  /** measure only from Presence in these terrains */
  fromTerrain?: LandTerrain[];
}

export type LandFilter =
  | { t: 'any' }
  | { t: 'coastal' }
  | { t: 'inland' }
  | { t: 'terrain'; terrains: LandTerrain[] }
  | { t: 'invaders' }
  | { t: 'noInvaders' }
  | { t: 'dahan' }
  | { t: 'blight' }
  | { t: 'noBlight' };

export type TargetSpec =
  | { kind: 'land'; range: RangeSpec; filter: LandFilter }
  | { kind: 'spirit'; who: 'any' | 'another' };

export interface CardData {
  id: string;
  name: string;
  type: CardType;
  spirit?: SpiritId;
  cost: number;
  speed: Speed;
  elements: Element[];
  target: TargetSpec;
  text: string;
}

const ANY: LandFilter = { t: 'any' };
const T = (...terrains: LandTerrain[]): LandFilter => ({ t: 'terrain', terrains });
const land = (n: number, filter: LandFilter = ANY, extra: Partial<RangeSpec> = {}): TargetSpec => ({
  kind: 'land',
  range: { n, ...extra },
  filter,
});
const ss = (n: number, filter: LandFilter = ANY): TargetSpec => land(n, filter, { sacred: true });
const spirit = (who: 'any' | 'another' = 'any'): TargetSpec => ({ kind: 'spirit', who });

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function card(
  type: CardType,
  sp: SpiritId | undefined,
  name: string,
  cost: number,
  speed: Speed,
  target: TargetSpec,
  elements: Element[],
  text: string,
): CardData {
  return { id: slug(name), name, type, spirit: sp, cost, speed, elements, target, text };
}

const u = (sp: SpiritId) => (name: string, cost: number, speed: Speed, target: TargetSpec, elements: Element[], text: string) =>
  card('unique', sp, name, cost, speed, target, elements, text);
const minor = (name: string, cost: number, speed: Speed, target: TargetSpec, elements: Element[], text: string) =>
  card('minor', undefined, name, cost, speed, target, elements, text);
const major = (name: string, cost: number, speed: Speed, target: TargetSpec, elements: Element[], text: string) =>
  card('major', undefined, name, cost, speed, target, elements, text);

const L = u('lightning'), R = u('river'), SH = u('shadows'), V = u('earth');
const TS = u('thunderspeaker'), OC = u('ocean'), BR = u('bringer'), G = u('green');

export const CARD_LIST: CardData[] = [
  // ── Lightning's Swift Strike ──
  L('Shatter Homesteads', 2, 'SLOW', ss(2), ['FIRE', 'AIR'], '1 Fear. Destroy 1 Town.'),
  L('Raging Storm', 3, 'SLOW', land(1), ['FIRE', 'AIR', 'WATER'], '1 Damage to each Invader.'),
  L("Lightning's Boon", 1, 'FAST', spirit(), ['FIRE', 'AIR'], 'Target Spirit may use up to 2 Slow Powers as if they were Fast Powers this turn.'),
  L('Harbingers of the Lightning', 0, 'SLOW', land(1), ['FIRE', 'AIR'], 'Push up to 2 Dahan. 1 Fear if you pushed any Dahan into a land with Town / City.'),
  // ── River Surges in Sunlight ──
  R('Flash Floods', 2, 'FAST', land(1), ['SUN', 'WATER'], '1 Damage. If target land is Coastal, +1 Damage.'),
  R('Wash Away', 1, 'SLOW', land(1), ['WATER', 'EARTH'], 'Push up to 3 Explorer / Town.'),
  R('Boon of Vigor', 0, 'FAST', spirit(), ['SUN', 'WATER', 'PLANT'], 'If you target yourself, gain 1 Energy. If you target another Spirit, they gain 1 Energy per Power Card they played this turn.'),
  R("River's Bounty", 0, 'SLOW', land(0), ['SUN', 'WATER', 'ANIMAL'], 'Gather up to 2 Dahan. If there are now at least 2 Dahan, add 1 Dahan and gain 1 Energy.'),
  // ── Shadows Flicker Like Flame ──
  SH('Concealing Shadows', 0, 'FAST', land(0), ['MOON', 'AIR'], '1 Fear. Dahan take no Damage from Ravaging Invaders this turn.'),
  SH('Favors Called Due', 1, 'SLOW', land(1), ['MOON', 'AIR', 'ANIMAL'], 'Gather up to 4 Dahan. If Invaders are present and Dahan now outnumber them, 3 Fear.'),
  SH('Mantle of Dread', 1, 'SLOW', spirit(), ['MOON', 'FIRE', 'AIR'], '2 Fear. Target Spirit may Push 1 Explorer and 1 Town from a land where it has Presence.'),
  SH('Crops Wither and Fade', 1, 'SLOW', land(0), ['MOON', 'FIRE', 'PLANT'], '2 Fear. Replace 1 Town with 1 Explorer. -or- Replace 1 City with 1 Town.'),
  // ── Vital Strength of the Earth ──
  V('Guard the Healing Land', 3, 'FAST', ss(1), ['WATER', 'EARTH', 'PLANT'], 'Remove 1 Blight. Defend 4.'),
  V('A Year of Perfect Stillness', 3, 'FAST', land(1), ['SUN', 'EARTH'], 'Invaders skip all Actions in target land this turn.'),
  V('Rituals of Destruction', 3, 'SLOW', ss(1, { t: 'dahan' }), ['SUN', 'MOON', 'FIRE', 'EARTH', 'PLANT'], '2 Damage. If target land has at least 3 Dahan, +3 Damage and 2 Fear.'),
  V('Draw of the Fruitful Earth', 1, 'SLOW', land(1), ['EARTH', 'PLANT', 'ANIMAL'], 'Gather up to 2 Explorer. Gather up to 2 Dahan.'),
  // ── Thunderspeaker ──
  TS('Manifestation of Power and Glory', 3, 'SLOW', land(0, { t: 'dahan' }), ['SUN', 'FIRE', 'AIR'], '1 Fear. Each Dahan deals Damage equal to the number of your Presence in target land.'),
  TS('Words of Warning', 1, 'FAST', land(1, { t: 'dahan' }), ['SUN', 'AIR', 'ANIMAL'], 'Defend 3. During Ravage, Dahan in target land deal Damage simultaneously with Invaders.'),
  TS('Sudden Ambush', 2, 'FAST', land(1), ['FIRE', 'AIR', 'ANIMAL'], 'You may Gather 1 Dahan. Each Dahan destroys 1 Explorer.'),
  TS('Voice of Thunder', 0, 'SLOW', land(1), ['SUN', 'AIR'], 'Push up to 4 Dahan. -or- If Invaders are present, 2 Fear.'),
  // ── Ocean's Hungry Grasp ──
  OC('Call of the Deeps', 0, 'FAST', land(0, { t: 'coastal' }), ['MOON', 'AIR', 'WATER'], 'Gather 1 Explorer. If target land is the Ocean, you may Gather another Explorer.'),
  OC('Grasping Tide', 1, 'FAST', land(1, { t: 'coastal' }), ['MOON', 'WATER'], '2 Fear. Defend 4.'),
  OC('Swallow the Land-Dwellers', 0, 'SLOW', land(0, { t: 'coastal' }), ['WATER', 'EARTH'], 'Drown 1 Explorer, 1 Town, and 1 Dahan.'),
  OC('Tidal Boon', 1, 'SLOW', spirit('another'), ['MOON', 'WATER', 'EARTH'], 'Target Spirit gains 2 Energy and may Push 1 Town and up to 2 Dahan from one of their lands. If Dahan are pushed to your Ocean, you may move them to any Coastal land instead of Drowning them.'),
  // ── Bringer of Dreams and Nightmares ──
  BR('Predatory Nightmares', 2, 'SLOW', ss(1, { t: 'invaders' }), ['MOON', 'FIRE', 'EARTH', 'ANIMAL'], '2 Damage. Push up to 2 Dahan.'),
  BR('Dread Apparitions', 2, 'FAST', land(1, { t: 'invaders' }), ['MOON', 'AIR'], 'When Powers generate Fear in target land, Defend 1 per Fear. 1 Fear. (Fear from To Dream a Thousand Deaths counts. Fear from destroying Town / City does not.)'),
  BR("Call on Midnight's Dream", 0, 'FAST', land(0), ['MOON', 'ANIMAL'], 'If target land has Dahan, gain a Major Power. If you Forget this Power, gain Energy equal to Dahan and you may play the Major Power immediately, paying its cost. -or- If Invaders are present, 2 Fear.'),
  BR('Dreams of the Dahan', 0, 'FAST', land(2), ['MOON', 'AIR'], 'Gather up to 2 Dahan. -or- If target land has Town / City, 1 Fear for each Dahan, to a maximum of 3 Fear.'),
  // ── A Spread of Rampant Green ──
  G('Overgrow in a Night', 2, 'FAST', land(1), ['MOON', 'PLANT'], 'Add 1 Presence. -or- If target land has your Presence and Invaders, 3 Fear.'),
  G('Gift of Proliferation', 1, 'FAST', spirit('another'), ['MOON', 'PLANT'], 'Target Spirit adds 1 Presence up to 1 Range from their Presence.'),
  G('Fields Choked with Growth', 0, 'SLOW', land(1), ['SUN', 'WATER', 'PLANT'], 'Push 1 Town. -or- Push 3 Dahan.'),
  G('Stem the Flow of Fresh Water', 0, 'SLOW', ss(1), ['WATER', 'PLANT'], '1 Damage to 1 Town / City. If target land is Mountain / Sands, instead, 1 Damage to each Town / City.'),

  // ── Minor Powers ──
  minor('Savage Mawbeasts', 0, 'SLOW', ss(1), ['FIRE', 'ANIMAL'], 'If target land is Jungle / Wetland, 1 Fear and 1 Damage. If you have 3 Animal: +1 Damage.'),
  minor('Voracious Growth', 1, 'SLOW', ss(1, T('JUNGLE', 'WETLAND')), ['WATER', 'PLANT'], '2 Damage. -or- Remove 1 Blight.'),
  minor('Rouse the Trees and Stones', 1, 'SLOW', ss(1, { t: 'noBlight' }), ['FIRE', 'EARTH', 'PLANT'], '2 Damage. Push 1 Explorer.'),
  minor('Encompassing Ward', 1, 'FAST', spirit(), ['SUN', 'WATER', 'EARTH'], 'Target Spirit provides Defend 2 in each of its lands.'),
  minor('Song of Sanctity', 1, 'SLOW', land(1, T('MOUNTAIN', 'JUNGLE')), ['SUN', 'WATER', 'PLANT'], 'If target land has Explorer, Push all Explorer. Otherwise, remove 1 Blight.'),
  minor('Uncanny Melting', 1, 'SLOW', ss(1), ['SUN', 'MOON', 'WATER'], 'If Invaders are present, 1 Fear. If target land is Sands / Wetland, remove 1 Blight.'),
  minor('Shadows of the Burning Forest', 0, 'SLOW', land(0, { t: 'invaders' }), ['MOON', 'FIRE', 'PLANT'], '2 Fear. If target land is Mountain / Jungle, Push 1 Explorer and 1 Town.'),
  minor('Steam Vents', 1, 'FAST', land(0), ['FIRE', 'AIR', 'WATER', 'EARTH'], 'Destroy 1 Explorer. If you have 3 Earth: You may instead destroy 1 Town.'),
  minor("Veil the Night's Hunt", 1, 'FAST', land(2, { t: 'dahan' }), ['MOON', 'AIR', 'ANIMAL'], 'Each Dahan deals 1 Damage to a different Invader. -or- Push up to 3 Dahan.'),
  minor('Elemental Boon', 1, 'FAST', spirit(), [], 'Target Spirit gains 3 different Elements of their choice. If you target another Spirit, you also gain the chosen Elements.'),
  minor('Devouring Ants', 1, 'SLOW', ss(1), ['SUN', 'EARTH', 'ANIMAL'], '1 Fear. 1 Damage. Destroy 1 Dahan. If target land is Jungle / Sands, +1 Damage.'),
  minor('Dark and Tangled Woods', 1, 'FAST', land(1), ['MOON', 'EARTH', 'PLANT'], '2 Fear. If target land is Mountain / Jungle, Defend 3.'),
  minor('Sap the Strength of Multitudes', 0, 'FAST', land(0), ['WATER', 'ANIMAL'], 'Defend 5. If you have 1 Air: Increase this Power\'s Range by 1.'),
  minor('Drift Down into Slumber', 0, 'FAST', land(2), ['AIR', 'EARTH', 'PLANT'], 'Defend 1. If target land is Jungle / Sands, instead, Defend 4.'),
  minor('Land of Haunts and Embers', 0, 'FAST', land(2), ['MOON', 'FIRE', 'AIR'], '2 Fear. Push up to 2 Explorer / Town. If target land has Blight, +2 Fear. Push up to 2 more Explorer / Town. Add 1 Blight.'),
  minor("Nature's Resilience", 1, 'FAST', ss(1), ['EARTH', 'PLANT', 'ANIMAL'], 'Defend 6. If you have 2 Water: You may instead remove 1 Blight.'),
  minor('Visions of Fiery Doom', 1, 'FAST', land(0), ['MOON', 'FIRE'], '1 Fear. Push 1 Explorer / Town. If you have 2 Fire: +1 Fear.'),
  minor('Pull Beneath the Hungry Earth', 1, 'SLOW', land(1), ['MOON', 'WATER', 'EARTH'], 'If target land has your Presence, 1 Fear and 1 Damage. If target land is Sands / Wetland, 1 Damage.'),
  minor('Call of the Dahan Ways', 1, 'SLOW', land(1, { t: 'dahan' }), ['MOON', 'WATER', 'ANIMAL'], 'Replace 1 Explorer with 1 Dahan. If you have 2 Moon: You may instead replace 1 Town with 1 Dahan.'),
  minor('Call to Bloodshed', 1, 'SLOW', land(1, { t: 'dahan' }), ['SUN', 'FIRE', 'ANIMAL'], '1 Damage per Dahan. -or- Gather up to 3 Dahan.'),
  minor('Call to Isolation', 0, 'FAST', land(1, { t: 'dahan' }), ['SUN', 'AIR', 'ANIMAL'], 'Push 1 Explorer / Town per Dahan. -or- Push 1 Dahan.'),
  minor('Call to Migrate', 1, 'SLOW', land(1), ['FIRE', 'AIR', 'ANIMAL'], 'Gather up to 3 Dahan. Push up to 3 Dahan.'),
  minor('Call to Tend', 1, 'SLOW', land(1, { t: 'dahan' }), ['WATER', 'PLANT', 'ANIMAL'], 'Remove 1 Blight. -or- Push up to 3 Dahan.'),
  minor("Quicken the Earth's Struggles", 1, 'FAST', ss(0), ['MOON', 'FIRE', 'EARTH', 'ANIMAL'], '1 Damage to each Town / City. -or- Defend 10.'),
  minor('Delusions of Danger', 1, 'FAST', land(1), ['SUN', 'MOON', 'AIR'], 'Push 1 Explorer. -or- 2 Fear.'),
  minor('Drought', 1, 'SLOW', land(1), ['SUN', 'FIRE', 'EARTH'], 'Destroy 3 Town. 1 Damage to each Town / City. Add 1 Blight. If you have 3 Sun: Destroy 1 City.'),
  minor('Gift of Constancy', 0, 'FAST', spirit(), ['SUN', 'EARTH'], 'Target Spirit gains 2 Energy. At end of turn, target Spirit may Reclaim 1 Power Card instead of discarding it. If you target another Spirit, you may also Reclaim 1 Power Card instead of discarding it.'),
  minor('Enticing Splendor', 0, 'FAST', land(0, { t: 'noBlight' }), ['SUN', 'AIR', 'PLANT'], 'Gather 1 Explorer / Town. -or- Gather up to 2 Dahan.'),
  minor('Entrancing Apparitions', 1, 'FAST', land(1), ['MOON', 'AIR', 'WATER'], 'Defend 2. If no Invaders are present, Gather up to 2 Explorer.'),
  minor('Gift of Living Energy', 0, 'FAST', spirit(), ['SUN', 'FIRE', 'PLANT'], 'Target Spirit gains 1 Energy, +1 Energy if target Spirit is not yourself. If you have at least 2 Sacred Sites, target Spirit gains +1 Energy.'),
  minor('Gift of Power', 0, 'SLOW', spirit(), ['MOON', 'WATER', 'EARTH', 'PLANT'], 'Target Spirit gains a Minor Power Card.'),
  minor('Gnawing Rootbiters', 0, 'SLOW', land(1), ['EARTH', 'ANIMAL'], 'Push up to 2 Town.'),
  minor('Lure of the Unknown', 0, 'FAST', land(2, { t: 'noInvaders' }), ['MOON', 'FIRE', 'AIR', 'PLANT'], 'Gather 1 Explorer / Town.'),
  minor('Purifying Flame', 1, 'SLOW', ss(1), ['SUN', 'FIRE', 'AIR', 'PLANT'], '1 Damage per Blight. If target land is Mountain / Sands, you may instead remove 1 Blight.'),
  minor('Rain of Blood', 0, 'SLOW', ss(1, { t: 'invaders' }), ['AIR', 'WATER', 'ANIMAL'], '2 Fear. If target land has at least 2 Town / City, +1 Fear.'),
  minor('Reaching Grasp', 0, 'FAST', spirit(), ['SUN', 'AIR', 'WATER'], 'Target Spirit gets +2 Range with all their Powers.'),

  // ── Major Powers ──
  major('Accelerated Rot', 4, 'SLOW', land(2, T('JUNGLE', 'WETLAND')), ['SUN', 'WATER', 'PLANT'], '2 Fear. 4 Damage. If you have 3 Sun, 2 Water, 3 Plant: +5 Damage. Remove 1 Blight.'),
  major('Cleansing Floods', 5, 'SLOW', land(1, ANY, { fromTerrain: ['WETLAND'] }), ['SUN', 'WATER'], '4 Damage. Remove 1 Blight. If you have 4 Water: +10 Damage.'),
  major('Pillar of Living Flame', 5, 'SLOW', ss(2), ['FIRE'], '3 Fear. 5 Damage. If target land is Jungle / Wetland, add 1 Blight. If you have 4 Fire: +2 Fear and +5 Damage.'),
  major('Poisoned Land', 3, 'SLOW', land(1), ['EARTH', 'PLANT', 'ANIMAL'], '1 Fear. 7 Damage. Add 1 Blight and destroy all Dahan. If you have 3 Earth, 2 Plant, 2 Animal: For each Blight then present, +1 Fear and +4 Damage.'),
  major('Terrifying Nightmares', 4, 'FAST', land(2), ['MOON', 'AIR'], '2 Fear. Push up to 4 Explorer / Town. If you have 4 Moon: +4 Fear.'),
  major('The Trees and Stones Speak of War', 2, 'FAST', land(1, { t: 'dahan' }), ['SUN', 'EARTH', 'PLANT'], 'For each Dahan in target land, 1 Damage and Defend 2. If you have 2 Sun, 2 Earth, 2 Plant: You may Push up to 2 Dahan, moving each one\'s Defend with them.'),
  major('Entwined Power', 2, 'FAST', spirit('another'), ['MOON', 'WATER', 'PLANT'], 'You and target Spirit may use each other\'s Presence to target Powers. Target Spirit gains a Power Card. You gain one of the Power Cards they did not keep. If you have 2 Water, 4 Plant: You and target Spirit each gain 3 Energy and may gift the other 1 Power from hand.'),
  major('Paralyzing Fright', 4, 'FAST', ss(1), ['AIR', 'EARTH'], '4 Fear. Invaders skip all Actions in target land this turn. If you have 2 Air, 3 Earth: +4 Fear.'),
  major('Powerstorm', 3, 'FAST', spirit(), ['SUN', 'FIRE', 'AIR'], 'Target Spirit gains 3 Energy. Once this turn, target may Repeat a Power Card by paying its cost again. If you have 2 Sun, 2 Fire, 3 Air: Target may Repeat up to 2 more Power Cards by paying their costs.'),
  major('Talons of Lightning', 6, 'FAST', land(1, T('MOUNTAIN', 'WETLAND')), ['FIRE', 'AIR'], '3 Fear. 5 Damage. If you have 3 Fire, 3 Air: Destroy 1 Town in each adjacent land. Increase this Power\'s Range to 3.'),
  major('The Jungle Hungers', 3, 'SLOW', land(1, ANY, { fromTerrain: ['JUNGLE'] }), ['MOON', 'PLANT'], 'Destroy all Explorer and all Town. Destroy all Dahan. If you have 2 Moon, 3 Plant: Destroy 1 City. Do not destroy any Dahan.'),
  major('The Land Thrashes in Furious Pain', 4, 'SLOW', land(2, { t: 'blight' }), ['MOON', 'FIRE', 'EARTH'], '2 Damage per Blight in target land. +1 Damage per Blight in adjacent lands. If you have 3 Moon, 3 Earth: Repeat on an adjacent land.'),
  major('Tsunami', 6, 'SLOW', ss(2, { t: 'coastal' }), ['WATER', 'EARTH'], '2 Fear. 8 Damage. Destroy 2 Dahan. If you have 3 Water, 2 Earth: In each other Coastal land on the same board: 1 Fear, 4 Damage, and Destroy 1 Dahan.'),
  major('Vigor of the Breaking Dawn', 3, 'FAST', land(2, { t: 'dahan' }), ['SUN', 'ANIMAL'], '2 Damage per Dahan in target land. If you have 3 Sun, 2 Animal: You may Push up to 2 Dahan. In lands you Pushed Dahan to, 2 Damage per Dahan.'),
  major('Vengeance of the Dead', 3, 'FAST', land(3), ['MOON', 'FIRE', 'ANIMAL'], '3 Fear. After each effect that destroys Town / City / Dahan in target land, 1 Damage per Town / City / Dahan destroyed. If you have 3 Animal: Damage from this Power may be dealt into adjacent lands.'),
  major('Wrap in Wings of Sunlight', 3, 'FAST', land(0), ['SUN', 'AIR', 'ANIMAL'], 'Move up to 5 Dahan from target land to any land. Defend 5 in that land. If you have 2 Sun, 2 Air, 2 Animal: First, Gather up to 3 Dahan.'),
  major('Blazing Renewal', 5, 'FAST', spirit(), ['FIRE', 'EARTH', 'PLANT'], 'Target Spirit adds 2 of their destroyed Presence into a single land, up to 2 Range from your Presence. If any Presence was added, 2 Damage to each Town / City in that land. If you have 3 Fire, 3 Earth, 2 Plant: 4 Damage in that land.'),
  major('Winds of Rust and Atrophy', 3, 'FAST', ss(3), ['AIR', 'WATER', 'ANIMAL'], '1 Fear and Defend 6. Replace 1 City with 1 Town or 1 Town with 1 Explorer. If you have 3 Air, 3 Water, 2 Animal: Repeat this Power.'),
  major('Indomitable Claim', 4, 'FAST', land(1), ['SUN', 'EARTH'], 'Add 1 Presence in target land even if you normally could not due to land type. Defend 20. If you have 2 Sun, 3 Earth: 3 Fear if Invaders are present. Invaders skip all Actions in target land this turn.'),
  major('Mists of Oblivion', 4, 'SLOW', land(3), ['MOON', 'AIR', 'WATER'], '1 Fear per Town / City this Power destroys (to a maximum of 4). 1 Damage to each Invader. If you have 2 Moon, 3 Air, 2 Water: 3 Damage.'),
  major('Infinite Vitality', 3, 'FAST', ss(1), ['EARTH', 'PLANT', 'ANIMAL'], 'Dahan have +4 Health while in target land. Whenever Blight would be added to target land, instead leave it on the card. If you have 4 Earth: Dahan ignore Damage and Destruction effects. Remove 1 Blight from target or adjacent land.'),
  major('Dissolve the Bonds of Kinship', 4, 'SLOW', land(1), ['FIRE', 'WATER', 'ANIMAL'], 'Replace 1 City with 2 Explorer. Replace 1 Town with 1 Explorer. Replace 1 Dahan with 1 Explorer. Push all Explorer from target land to as many different lands as possible. If you have 2 Fire, 2 Water, 3 Animal: Before Pushing, Explorer and Town / City do Damage to each other.'),
];

export const CARDS: Record<string, CardData> = Object.fromEntries(CARD_LIST.map((c) => [c.id, c]));

export const MINOR_IDS = CARD_LIST.filter((c) => c.type === 'minor').map((c) => c.id);
export const MAJOR_IDS = CARD_LIST.filter((c) => c.type === 'major').map((c) => c.id);

export function uniquesOf(sp: SpiritId): string[] {
  return CARD_LIST.filter((c) => c.type === 'unique' && c.spirit === sp).map((c) => c.id);
}
