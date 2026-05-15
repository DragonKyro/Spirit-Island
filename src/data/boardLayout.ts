import { Terrain } from '../engine/pieces';

/**
 * Solo island board layout — pointy-top hex grid.
 *
 * Coast row (lands 1-4) sits along the top, ocean above.
 * Inland row (lands 5-8) sits below, offset right by half a hex width.
 *
 * Coordinates in SVG units (viewBox 800x500).
 */

export const VIEWBOX = { width: 800, height: 500 };

const R = 78; // hex circumradius (center to corner)
const SQ3 = Math.sqrt(3);
const HEX_W = SQ3 * R; // hex width (corner to corner horizontally; flat-to-flat for pointy)
const HEX_H = 2 * R; // hex height (corner to corner vertically)
const ROW_VSPACE = 1.5 * R; // vertical spacing between rows

// Top-left center anchor
const X0 = 70 + HEX_W / 2;
const Y0 = 90 + HEX_H / 2;

export interface LandLayout {
  index: number; // 0-based land index
  number: number; // 1-based land number (matches engine)
  terrain: Terrain;
  isCoastal: boolean;
  centerX: number;
  centerY: number;
  /** Polygon vertices (closed path) */
  vertices: Array<[number, number]>;
}

/** Pointy-top hex vertices: angles 30, 90, 150, 210, 270, 330 (in degrees). */
function hexVertices(cx: number, cy: number, r: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((30 + i * 60) * Math.PI) / 180;
    out.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return out;
}

function hexCenter(col: number, row: number): [number, number] {
  const x = X0 + col * HEX_W + (row % 2) * (HEX_W / 2);
  const y = Y0 + row * ROW_VSPACE;
  return [x, y];
}

const RAW: Array<{
  number: number;
  terrain: Terrain;
  isCoastal: boolean;
  col: number;
  row: number;
}> = [
  { number: 1, terrain: 'JUNGLE', isCoastal: true, col: 0, row: 0 },
  { number: 2, terrain: 'MOUNTAIN', isCoastal: true, col: 1, row: 0 },
  { number: 3, terrain: 'SANDS', isCoastal: true, col: 2, row: 0 },
  { number: 4, terrain: 'WETLAND', isCoastal: true, col: 3, row: 0 },
  { number: 5, terrain: 'JUNGLE', isCoastal: false, col: 0, row: 1 },
  { number: 6, terrain: 'MOUNTAIN', isCoastal: false, col: 1, row: 1 },
  { number: 7, terrain: 'SANDS', isCoastal: false, col: 2, row: 1 },
  { number: 8, terrain: 'WETLAND', isCoastal: false, col: 3, row: 1 },
];

export const BOARD_LAYOUT: LandLayout[] = RAW.map((entry, i) => {
  const [cx, cy] = hexCenter(entry.col, entry.row);
  return {
    index: i,
    number: entry.number,
    terrain: entry.terrain,
    isCoastal: entry.isCoastal,
    centerX: cx,
    centerY: cy,
    vertices: hexVertices(cx, cy, R),
  };
});

/**
 * Bidirectional adjacency derived from engine. Some Python data is asymmetric;
 * we draw the union here so all valid game connections are visualized.
 */
export const ADJACENCY_EDGES: Array<[number, number]> = [
  [0, 1], [0, 4], [0, 5],
  [1, 2], [1, 4], [1, 5],
  [2, 3], [2, 5], [2, 6], [2, 4],
  [3, 6], [3, 7], [3, 5],
  [4, 5],
  [5, 6], [5, 7],
  [6, 7],
];

/**
 * Adjacency pairs that are NOT hex-neighbors in our layout. These need to be
 * drawn as additional connector lines so players see the connection.
 */
export const NON_HEX_BRIDGES: Array<[number, number]> = [
  // L1 (idx 0) ↔ L6 (idx 5) — non-hex
  [0, 5],
  // L5 (idx 4) ↔ L3 (idx 2) — non-hex
  [4, 2],
  // L6 (idx 5) ↔ L4 (idx 3) — non-hex
  [5, 3],
  // L6 (idx 5) ↔ L8 (idx 7) — non-hex
  [5, 7],
];

export const TERRAIN_FILL: Record<Terrain, string> = {
  JUNGLE: '#4a7c3f',
  MOUNTAIN: '#7a7065',
  SANDS: '#d4b87a',
  WETLAND: '#5a8a8a',
};

export const TERRAIN_STROKE: Record<Terrain, string> = {
  JUNGLE: '#2d5026',
  MOUNTAIN: '#4d4640',
  SANDS: '#a08856',
  WETLAND: '#3a5f5f',
};

export function polygonPath(vertices: Array<[number, number]>): string {
  return vertices
    .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`))
    .join(' ') + ' Z';
}
