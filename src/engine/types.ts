// Core vocabulary shared by every engine module. String-literal unions (not enums)
// so everything stays plain JSON.

export type LandTerrain = 'JUNGLE' | 'MOUNTAIN' | 'SANDS' | 'WETLAND';
export type Terrain = LandTerrain | 'OCEAN';
export const LAND_TERRAINS: readonly LandTerrain[] = ['JUNGLE', 'MOUNTAIN', 'SANDS', 'WETLAND'];

export type Element = 'SUN' | 'MOON' | 'FIRE' | 'AIR' | 'WATER' | 'EARTH' | 'PLANT' | 'ANIMAL';
export const ELEMENTS: readonly Element[] = ['SUN', 'MOON', 'FIRE', 'AIR', 'WATER', 'EARTH', 'PLANT', 'ANIMAL'];
export type Elements = Partial<Record<Element, number>>;

export type Speed = 'FAST' | 'SLOW';

export type InvaderKind = 'explorer' | 'town' | 'city';
export type PieceKind = InvaderKind | 'dahan';
export const INVADER_KINDS: readonly InvaderKind[] = ['explorer', 'town', 'city'];

/** One Explorer / Town / City / Dahan on the island. `dmg` clears when Time Passes. */
export interface Piece {
  kind: PieceKind;
  dmg: number;
}

export const isInvader = (k: PieceKind): k is InvaderKind => k !== 'dahan';

export const PIECE_LABEL: Record<PieceKind, string> = {
  explorer: 'Explorer',
  town: 'Town',
  city: 'City',
  dahan: 'Dahan',
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  JUNGLE: 'Jungle',
  MOUNTAIN: 'Mountain',
  SANDS: 'Sands',
  WETLAND: 'Wetland',
  OCEAN: 'Ocean',
};

export const ELEMENT_LABEL: Record<Element, string> = {
  SUN: 'Sun',
  MOON: 'Moon',
  FIRE: 'Fire',
  AIR: 'Air',
  WATER: 'Water',
  EARTH: 'Earth',
  PLANT: 'Plant',
  ANIMAL: 'Animal',
};

export type SpiritId =
  | 'lightning'
  | 'river'
  | 'earth'
  | 'shadows'
  | 'thunderspeaker'
  | 'green'
  | 'ocean'
  | 'bringer';

export type AdversaryId = 'none' | 'prussia' | 'england' | 'sweden';
export type BoardName = 'A' | 'B' | 'C' | 'D';
export const BOARD_NAMES: readonly BoardName[] = ['A', 'B', 'C', 'D'];
