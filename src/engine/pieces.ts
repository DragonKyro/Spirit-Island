export type Terrain = 'JUNGLE' | 'MOUNTAIN' | 'SANDS' | 'WETLAND';
export type InvaderType = 'EXPLORER' | 'TOWN' | 'CITY';
export type Element = 'SUN' | 'MOON' | 'FIRE' | 'AIR' | 'WATER' | 'EARTH' | 'PLANT' | 'ANIMAL';
export type PowerSpeed = 'FAST' | 'SLOW';

export const INVADER_HEALTH: Record<InvaderType, number> = {
  EXPLORER: 1,
  TOWN: 2,
  CITY: 3,
};

export const INVADER_DAMAGE: Record<InvaderType, number> = {
  EXPLORER: 1,
  TOWN: 2,
  CITY: 3,
};

export const INVADER_FEAR: Record<InvaderType, number> = {
  EXPLORER: 0,
  TOWN: 1,
  CITY: 2,
};

export const DAHAN_HEALTH = 2;
export const DAHAN_DAMAGE = 2;

export interface Invader {
  type: InvaderType;
  damageTaken: number;
}

export function makeInvader(type: InvaderType): Invader {
  return { type, damageTaken: 0 };
}

export function invaderRemainingHealth(inv: Invader): number {
  return INVADER_HEALTH[inv.type] - inv.damageTaken;
}

export function invaderIsDestroyed(inv: Invader): boolean {
  return inv.damageTaken >= INVADER_HEALTH[inv.type];
}

export interface Dahan {
  damageTaken: number;
}

export function makeDahan(): Dahan {
  return { damageTaken: 0 };
}

export function dahanRemainingHealth(d: Dahan): number {
  return DAHAN_HEALTH - d.damageTaken;
}

export function dahanIsDestroyed(d: Dahan): boolean {
  return d.damageTaken >= DAHAN_HEALTH;
}

export interface PowerCard {
  name: string;
  cost: number;
  speed: PowerSpeed;
  range: number;
  target: string;
  elements: Element[];
  description: string;
}
