import { Terrain } from '../engine/pieces';

/**
 * Solo island board layout — modeled on Spirit Island **Board D**.
 *
 * Ocean wraps around the upper-left of the island. Three coastal lands
 * (L1 top, L2 large mid-left, L3 lower-left) touch the ocean; the rest
 * are inland with rocky-cliff outer borders. L5 sits at the center and
 * borders six other lands — this is what makes Board D feel irregular
 * compared to a hex grid.
 *
 * Terrains (matching Board D):
 *   L1=Wetland L2=Jungle  L3=Wetland L4=Sands
 *   L5=Mountain L6=Jungle L7=Sands   L8=Mountain
 *
 * Adjacency (symmetric, 14 edges):
 *   L1: 2,5,8         L2: 1,3,4,5       L3: 2,4
 *   L4: 2,3,5,6       L5: 1,2,4,6,7,8   L6: 4,5,7
 *   L7: 5,6,8         L8: 1,5,7
 */

export const VIEWBOX = { width: 1000, height: 700 };

type Point = readonly [number, number];

const V = {
  // ── Outer boundary points ──────────────────────────────────────────────
  // Ocean coast (clockwise from inner corner of ocean inlet)
  bInner:    [55, 130],    // upper-left inner corner — L1's coast & L2's coast meet here
  bTop_18:   [560, 65],    // top edge — where L1's ocean coast ends and L8's rocky cliff begins
  // Rocky cliff (clockwise from top-right)
  bNE:       [925, 100],   // NE corner
  bE_78:     [970, 290],   // east cliff between L7 and L8
  bE_67:     [955, 470],   // east cliff between L6 and L7
  bSE:       [890, 605],   // SE corner
  bS_46:     [610, 645],   // south cliff between L4 and L6
  bS_34:     [255, 645],   // south cliff between L3 and L4
  bSW:       [85, 590],    // SW corner — bottom cliff ends, west ocean coast begins
  bW_23:     [30, 415],    // west ocean coast between L2 and L3
  // ── Interior 3-way junctions ───────────────────────────────────────────
  j125:      [270, 200],   // L1 / L2 / L5
  j158:      [475, 200],   // L1 / L5 / L8
  j234:      [170, 480],   // L2 / L3 / L4
  j245:      [290, 360],   // L2 / L4 / L5
  j456:      [475, 470],   // L4 / L5 / L6
  j567:      [650, 410],   // L5 / L6 / L7
  j578:      [645, 230],   // L5 / L7 / L8
} as const satisfies Record<string, Point>;

type VertexName = keyof typeof V;

export interface LandLayout {
  index: number;
  number: number;
  terrain: Terrain;
  isCoastal: boolean;
  centerX: number;
  centerY: number;
  vertices: Point[];
  path: string;
}

interface LandSpec {
  terrain: Terrain;
  isCoastal: boolean;
  vertexNames: VertexName[]; // clockwise
}

const SPECS: LandSpec[] = [
  // L1 — Wetland, coastal — small top piece
  { terrain: 'WETLAND',  isCoastal: true,  vertexNames: ['bInner', 'bTop_18', 'j158', 'j125'] },
  // L2 — Jungle, coastal — large mid-left
  { terrain: 'JUNGLE',   isCoastal: true,  vertexNames: ['bInner', 'j125', 'j245', 'j234', 'bW_23'] },
  // L3 — Wetland, coastal — lower-left
  { terrain: 'WETLAND',  isCoastal: true,  vertexNames: ['bW_23', 'j234', 'bS_34', 'bSW'] },
  // L4 — Sands, inland — bottom-center
  { terrain: 'SANDS',    isCoastal: false, vertexNames: ['j234', 'j245', 'j456', 'bS_46', 'bS_34'] },
  // L5 — Mountain, inland — central hub (6 neighbors)
  { terrain: 'MOUNTAIN', isCoastal: false, vertexNames: ['j125', 'j158', 'j578', 'j567', 'j456', 'j245'] },
  // L6 — Jungle, inland — lower-right
  { terrain: 'JUNGLE',   isCoastal: false, vertexNames: ['j456', 'j567', 'bE_67', 'bSE', 'bS_46'] },
  // L7 — Sands, inland — mid-right
  { terrain: 'SANDS',    isCoastal: false, vertexNames: ['j578', 'bE_78', 'bE_67', 'j567'] },
  // L8 — Mountain, inland — top-right
  { terrain: 'MOUNTAIN', isCoastal: false, vertexNames: ['bTop_18', 'bNE', 'bE_78', 'j578', 'j158'] },
];

/**
 * Edges that lie on the OCEAN COAST. These curve gently with a coastline
 * bulge. Everything else (interior shared borders + rocky cliff outer
 * edges) is also curved but with a tighter, more deterministic wiggle.
 */
const OCEAN_COAST_EDGES = new Set<string>([
  edgeKey('bInner', 'bTop_18'), // top of L1
  edgeKey('bInner', 'bW_23'),   // left side of L2
  edgeKey('bW_23', 'bSW'),      // left side of L3
]);

const ROCKY_CLIFF_EDGES = new Set<string>([
  edgeKey('bTop_18', 'bNE'),  // top of L8
  edgeKey('bNE', 'bE_78'),    // east of L8
  edgeKey('bE_78', 'bE_67'),  // east of L7
  edgeKey('bE_67', 'bSE'),    // east of L6
  edgeKey('bSE', 'bS_46'),    // south of L6
  edgeKey('bS_46', 'bS_34'),  // south of L4
  edgeKey('bS_34', 'bSW'),    // south of L3
]);

const ISLAND_CENTER: Point = [500, 380];

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildPath(vertexNames: VertexName[]): string {
  const verts: Point[] = vertexNames.map((n) => V[n]);
  let path = `M ${verts[0][0].toFixed(1)} ${verts[0][1].toFixed(1)}`;

  for (let i = 0; i < vertexNames.length; i++) {
    const fromName = vertexNames[i];
    const toName = vertexNames[(i + 1) % vertexNames.length];
    const from = V[fromName];
    const to = V[toName];
    const ek = edgeKey(fromName, toName);
    const isCoast = OCEAN_COAST_EDGES.has(ek);
    const isCliff = ROCKY_CLIFF_EDGES.has(ek);
    const isExterior = isCoast || isCliff;

    // Canonical direction = name-sorted (so both polygons sharing this
    // edge produce identical control points).
    const canonicalForward = fromName < toName;
    const a = canonicalForward ? from : to;
    const b = canonicalForward ? to : from;

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) {
      path += ` L ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
      continue;
    }

    const px = -dy / len; // perpendicular
    const py = dx / len;

    let sign: 1 | -1;
    let offset: number;
    if (isExterior) {
      const midX = (a[0] + b[0]) / 2;
      const midY = (a[1] + b[1]) / 2;
      const outX = midX - ISLAND_CENTER[0];
      const outY = midY - ISLAND_CENTER[1];
      const dot = px * outX + py * outY;
      sign = dot >= 0 ? 1 : -1;
      // Coastline bulges more than cliffs.
      offset = isCoast ? 22 + (hash(ek) % 14) : 12 + (hash(ek) % 9);
    } else {
      sign = hash(ek) % 2 === 0 ? 1 : -1;
      offset = 9 + (hash(ek + 'i') % 8);
    }

    const cp1Canon: Point = [a[0] + 0.30 * dx + sign * offset * px, a[1] + 0.30 * dy + sign * offset * py];
    const cp2Canon: Point = [a[0] + 0.70 * dx + sign * offset * px, a[1] + 0.70 * dy + sign * offset * py];

    const cp1 = canonicalForward ? cp1Canon : cp2Canon;
    const cp2 = canonicalForward ? cp2Canon : cp1Canon;

    path += ` C ${cp1[0].toFixed(1)} ${cp1[1].toFixed(1)} ${cp2[0].toFixed(1)} ${cp2[1].toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
  }

  return path + ' Z';
}

function centroid(points: Point[]): Point {
  let cx = 0, cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  return [cx / points.length, cy / points.length];
}

export const BOARD_LAYOUT: LandLayout[] = SPECS.map((spec, i) => {
  const verts: Point[] = spec.vertexNames.map((n) => V[n]);
  const [cx, cy] = centroid(verts);
  return {
    index: i,
    number: i + 1,
    terrain: spec.terrain,
    isCoastal: spec.isCoastal,
    centerX: cx,
    centerY: cy,
    vertices: verts,
    path: buildPath(spec.vertexNames),
  };
});

/**
 * Ocean polygon — a path that fills the upper-left of the viewBox along
 * the actual coastline of the island. Drawn beneath the lands.
 */
export const OCEAN_PATH: string = (() => {
  // CW around the ocean region:
  // 1. start at viewBox corner near upper edge above L1's coast end
  // 2. follow the top edge of viewBox left
  // 3. follow viewBox left edge down past the SW corner of the island
  // 4. enter the island via SW corner of L3, follow the coast UP and around
  //    back to the top edge
  const lines: string[] = [];
  lines.push(`M ${V.bTop_18[0]} 0`);          // top of viewBox above where ocean ends
  lines.push(`L 0 0`);                         // top-left corner of viewBox
  lines.push(`L 0 ${V.bSW[1] + 20}`);          // down the left edge of viewBox
  lines.push(`L ${V.bSW[0]} ${V.bSW[1]}`);     // step in to SW corner of island
  // Now trace the coast upward (the same curves the lands use, in reverse)
  // bSW → bW_23 → bInner → bTop_18, but using the SAME bezier shape.
  lines.push(coastSegment('bSW', 'bW_23'));
  lines.push(coastSegment('bW_23', 'bInner'));
  lines.push(coastSegment('bInner', 'bTop_18'));
  // Close the path back to the start point at the top
  lines.push(`L ${V.bTop_18[0]} 0`);
  lines.push('Z');
  return lines.join(' ');
})();

function coastSegment(fromName: VertexName, toName: VertexName): string {
  // Re-derive the same curve used in land polygons, so the ocean's
  // border exactly matches the land borders.
  const from = V[fromName];
  const to = V[toName];
  const ek = edgeKey(fromName, toName);
  const canonicalForward = fromName < toName;
  const a = canonicalForward ? from : to;
  const b = canonicalForward ? to : from;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const px = -dy / len;
  const py = dx / len;
  const midX = (a[0] + b[0]) / 2;
  const midY = (a[1] + b[1]) / 2;
  const outX = midX - ISLAND_CENTER[0];
  const outY = midY - ISLAND_CENTER[1];
  const dot = px * outX + py * outY;
  const sign = dot >= 0 ? 1 : -1;
  const offset = 22 + (hash(ek) % 14);
  const cp1Canon: Point = [a[0] + 0.30 * dx + sign * offset * px, a[1] + 0.30 * dy + sign * offset * py];
  const cp2Canon: Point = [a[0] + 0.70 * dx + sign * offset * px, a[1] + 0.70 * dy + sign * offset * py];
  const cp1 = canonicalForward ? cp1Canon : cp2Canon;
  const cp2 = canonicalForward ? cp2Canon : cp1Canon;
  return `C ${cp1[0].toFixed(1)} ${cp1[1].toFixed(1)} ${cp2[0].toFixed(1)} ${cp2[1].toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
}

export const NON_HEX_BRIDGES: ReadonlyArray<readonly [number, number]> = [];

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
