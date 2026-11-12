// Turns per-board geometry (boardGeometry.ts) into SVG paths for a whole island:
// each board is rotated/translated to its place in the standard layout, and interior
// borders / coastlines get a deterministic organic wobble. Board edges (where boards
// join) stay straight so neighbouring boards line up exactly.

import { BOARD_GEOMETRY } from './boardGeometry';
import type { Pt } from './boardGeometry';
import type { Orientation } from '../engine/island';

/** SVG units per board edge length. */
export const S = 1000;
const H = Math.sqrt(3) / 2;

export interface SpaceShape {
  id: string;
  /** SVG path */
  path: string;
  /** area centroid, SVG coords */
  cx: number;
  cy: number;
  /** approximate radius of the inscribed area, for laying out pieces */
  r: number;
  ocean: boolean;
}

export interface IslandShape {
  spaces: Record<string, SpaceShape>;
  /** outline of each board (rhombus), SVG path */
  boardOutlines: string[];
  viewBox: { x: number; y: number; w: number; h: number };
}

function transform(o: Orientation, p: Pt): [number, number] {
  const a = (o.rot * Math.PI) / 3;
  const x = p[0] * Math.cos(a) - p[1] * Math.sin(a);
  const y = p[0] * Math.sin(a) + p[1] * Math.cos(a);
  const wx = x + o.offset[0] + 0.5 * o.offset[1];
  const wy = y + o.offset[1] * H;
  return [wx * S, -wy * S];
}

const isBoundary = (v: string) => /^(O|BR|TR|TL|[btr]\d+|w0[13])$/.test(v);
const sideOf = (v: string): string | null => {
  if (v === 'O') return 'bw';
  if (v === 'BR') return 'br';
  if (v === 'TR') return 'tr';
  if (v === 'TL') return 'tw';
  if (/^w0[13]$/.test(v)) return 'w';
  return v[0];
};
/** Do both endpoints lie on one straight edge of the rhombus? */
function onSameEdge(u: string, v: string): boolean {
  if (!isBoundary(u) || !isBoundary(v)) return false;
  const a = sideOf(u)!, b = sideOf(v)!;
  return [...a].some((c) => b.includes(c));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Canonical wobbly polyline for the border a→b (a < b), including both endpoints. */
function canonicalEdge(board: string, a: string, b: string, pa: Pt, pb: Pt, coast: boolean): Pt[] {
  if (onSameEdge(a, b)) return [pa, pb];
  const seed = hash(`${board}:${a}|${b}`);
  const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const amp = len * (coast ? 0.09 : 0.06);
  const n = 10;
  const ph1 = (seed % 1000) / 159, ph2 = ((seed >> 10) % 1000) / 211;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t);
    const off = amp * env * (0.65 * Math.sin(2 * Math.PI * t * 1.5 + ph1) + 0.35 * Math.sin(2 * Math.PI * t * 3.5 + ph2));
    pts.push([pa[0] + dx * t + nx * off, pa[1] + dy * t + ny * off]);
  }
  return pts;
}

function facePoints(board: string, face: readonly string[], verts: Record<string, Pt>, coastFace: boolean, neighbourIsOcean: (u: string, v: string) => boolean): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < face.length; i++) {
    const u = face[i], v = face[(i + 1) % face.length];
    const coast = coastFace || neighbourIsOcean(u, v);
    const [a, b] = u < v ? [u, v] : [v, u];
    const pts = canonicalEdge(board, a, b, verts[a], verts[b], coast);
    const dir = u < v ? pts : [...pts].reverse();
    out.push(...dir.slice(0, -1)); // the next edge starts at v
  }
  return out;
}

function centroid(pts: [number, number][]): [number, number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a /= 2;
  return [cx / (6 * a), cy / (6 * a), Math.abs(a)];
}

export function islandShape(boards: readonly string[], orientations: readonly Orientation[]): IslandShape {
  const spaces: Record<string, SpaceShape> = {};
  const outlines: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  boards.forEach((name, bi) => {
    const g = BOARD_GEOMETRY[name];
    const o = orientations[bi];
    const oceanEdges = new Set<string>();
    const f0 = g.faces[0];
    for (let i = 0; i < f0.length; i++) {
      const u = f0[i], v = f0[(i + 1) % f0.length];
      oceanEdges.add(u < v ? `${u}|${v}` : `${v}|${u}`);
    }
    const isOceanEdge = (u: string, v: string) => oceanEdges.has(u < v ? `${u}|${v}` : `${v}|${u}`);
    g.faces.forEach((face, num) => {
      const local = facePoints(name, face, g.verts, num === 0, isOceanEdge);
      const world = local.map((p) => transform(o, p));
      const straight = face.map((v) => transform(o, g.verts[v]));
      const [cx, cy, area] = centroid(straight);
      for (const [x, y] of world) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      spaces[`${name}${num}`] = {
        id: `${name}${num}`,
        path: 'M' + world.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z',
        cx,
        cy,
        r: Math.sqrt(area / Math.PI),
        ocean: num === 0,
      };
    });
    const corners: Pt[] = [[0, 0], [1, 0], [1.5, H], [0.5, H]];
    outlines.push('M' + corners.map((p) => transform(o, p).map((n) => n.toFixed(1)).join(',')).join('L') + 'Z');
  });
  const pad = 60;
  return {
    spaces,
    boardOutlines: outlines,
    viewBox: { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad },
  };
}
