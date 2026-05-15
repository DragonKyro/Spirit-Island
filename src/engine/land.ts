import {
  Dahan,
  Invader,
  InvaderType,
  Terrain,
  makeDahan,
  makeInvader,
  INVADER_DAMAGE,
} from './pieces';

export interface Land {
  number: number;
  terrain: Terrain;
  isCoastal: boolean;
  adjacentIndices: number[];
  invaders: Invader[];
  dahan: Dahan[];
  blight: number;
  presence: Record<string, number>;
  defend: number;
}

export function hasInvaders(land: Land): boolean {
  return land.invaders.length > 0;
}

export function hasTownOrCity(land: Land): boolean {
  return land.invaders.some((i) => i.type === 'TOWN' || i.type === 'CITY');
}

export function hasBlight(land: Land): boolean {
  return land.blight > 0;
}

export function hasDahan(land: Land): boolean {
  return land.dahan.length > 0;
}

export function countByType(land: Land, type: InvaderType): number {
  return land.invaders.filter((i) => i.type === type).length;
}

export function explorerCount(land: Land): number {
  return countByType(land, 'EXPLORER');
}

export function townCount(land: Land): number {
  return countByType(land, 'TOWN');
}

export function cityCount(land: Land): number {
  return countByType(land, 'CITY');
}

export function totalInvaderDamage(land: Land): number {
  return land.invaders.reduce((sum, inv) => sum + INVADER_DAMAGE[inv.type], 0);
}

export function totalPresence(land: Land): number {
  return Object.values(land.presence).reduce((a, b) => a + b, 0);
}

export function hasPresence(land: Land, spiritName?: string): boolean {
  if (spiritName) return (land.presence[spiritName] ?? 0) > 0;
  return totalPresence(land) > 0;
}

/**
 * Standard solo island board: 8 lands.
 *   Ocean
 *  [1][2][3][4]   <- coastal
 *  [5][6][7][8]   <- inland
 */
export function createSoloBoard(): Land[] {
  const lands: Land[] = [
    makeLand(1, 'JUNGLE', true),
    makeLand(2, 'MOUNTAIN', true),
    makeLand(3, 'SANDS', true),
    makeLand(4, 'WETLAND', true),
    makeLand(5, 'JUNGLE', false),
    makeLand(6, 'MOUNTAIN', false),
    makeLand(7, 'SANDS', false),
    makeLand(8, 'WETLAND', false),
  ];
  lands[0].adjacentIndices = [1, 4, 5];
  lands[1].adjacentIndices = [0, 2, 4, 5];
  lands[2].adjacentIndices = [1, 3, 5, 6];
  lands[3].adjacentIndices = [2, 6, 7];
  lands[4].adjacentIndices = [0, 1, 2, 5];
  lands[5].adjacentIndices = [1, 2, 3, 4, 6, 7];
  lands[6].adjacentIndices = [2, 3, 5, 7];
  lands[7].adjacentIndices = [3, 6];
  return lands;
}

function makeLand(number: number, terrain: Terrain, isCoastal: boolean): Land {
  return {
    number,
    terrain,
    isCoastal,
    adjacentIndices: [],
    invaders: [],
    dahan: [],
    blight: 0,
    presence: {},
    defend: 0,
  };
}

/**
 * Standard Board D solo setup:
 * Land 1: 1 Town + 1 Dahan
 * Land 2: 1 City + 1 Dahan
 * Land 3: 1 Dahan
 * Land 4: 1 Dahan
 * Land 5: 1 Town + 1 Dahan + 1 Blight
 * Land 7: 1 Explorer + 1 Dahan
 */
export function populateBoard(lands: Land[]): void {
  lands[0].invaders.push(makeInvader('TOWN'));
  lands[0].dahan.push(makeDahan());

  lands[1].invaders.push(makeInvader('CITY'));
  lands[1].dahan.push(makeDahan());

  lands[2].dahan.push(makeDahan());
  lands[3].dahan.push(makeDahan());

  lands[4].invaders.push(makeInvader('TOWN'));
  lands[4].dahan.push(makeDahan());
  lands[4].blight = 1;

  lands[6].invaders.push(makeInvader('EXPLORER'));
  lands[6].dahan.push(makeDahan());
}
