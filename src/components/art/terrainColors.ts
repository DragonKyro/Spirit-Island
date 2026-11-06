export type TerrainKind = 'JUNGLE' | 'MOUNTAIN' | 'SANDS' | 'WETLAND' | 'OCEAN';

/** Solid fallback fills (the dominant tone of each terrain pattern). */
export const TERRAIN_BASE_COLORS: Record<TerrainKind, string> = {
  JUNGLE: '#3a6e30',
  MOUNTAIN: '#857a6d',
  SANDS: '#d6b06a',
  WETLAND: '#4d8070',
  OCEAN: '#1d4a74',
};

/** Pattern ids rendered by <TerrainDefs/>; use as fill={`url(#${TERRAIN_PATTERN_IDS.JUNGLE})`}. */
export const TERRAIN_PATTERN_IDS: Record<TerrainKind, string> = {
  JUNGLE: 'terrain-jungle',
  MOUNTAIN: 'terrain-mountain',
  SANDS: 'terrain-sands',
  WETLAND: 'terrain-wetland',
  OCEAN: 'terrain-ocean',
};

export const BLIGHTED_OVERLAY_ID = 'terrain-blighted-overlay';
