// Island boards A–D and how they join for 1–4 players.
//
// Board facts (terrain, adjacency within a board, starting pieces, and where each
// land touches the board's three joinable edges) follow the physical base-game
// boards. Boards are 60° rhombi; the Ocean runs along one edge and the other three
// edges ("sides") can join neighbouring boards. Side positions are measured on a
// 0..13 scale along the edge, matching the land boundaries printed on the boards.

import type { BoardName, LandTerrain, PieceKind, Terrain } from './types';

export interface BoardDef {
  name: BoardName;
  /** index 1..8 (index 0 = Ocean) */
  terrains: readonly LandTerrain[];
  /** within-board adjacency as [a, b] pairs (0 = Ocean) */
  edges: readonly (readonly [number, number])[];
  /** starting pieces per land (index 1..8): 'E','T','C','D' (dahan),'B' (blight) */
  setup: readonly string[];
  /**
   * The 3 joinable sides (0 = bottom, 1 = right, 2 = top), each listing the lands
   * along it in clockwise order and the break points between them (0..13 scale).
   */
  sides: readonly { lands: readonly number[]; breaks: readonly number[] }[];
}

const J = 'JUNGLE', M = 'MOUNTAIN', S = 'SANDS', W = 'WETLAND';

function pairs(spec: Record<number, number[]>): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, bs] of Object.entries(spec)) for (const b of bs) out.push([Number(a), b]);
  return out;
}

export const BOARDS: Record<BoardName, BoardDef> = {
  A: {
    name: 'A',
    terrains: [M, W, J, S, W, M, S, J],
    edges: pairs({ 0: [1, 2, 3], 1: [2, 4, 5, 6], 2: [3, 4], 3: [4], 4: [5], 5: [6, 7, 8], 6: [8], 7: [8] }),
    setup: ['', 'CD', 'DD', 'B', '', 'D', 'DD', 'T'],
    sides: [
      { lands: [7, 5, 4, 3], breaks: [1, 3, 7] },
      { lands: [8, 7], breaks: [5] },
      { lands: [1, 6, 8], breaks: [3, 7] },
    ],
  },
  B: {
    name: 'B',
    terrains: [W, M, S, J, S, W, M, J],
    edges: pairs({ 0: [1, 2, 3], 1: [2, 4, 5, 6], 2: [3, 4], 3: [4], 4: [5, 7], 5: [6, 7], 6: [7, 8], 7: [8] }),
    setup: ['D', 'C', 'DD', 'B', '', 'T', 'D', 'DD'],
    sides: [
      { lands: [7, 4, 3], breaks: [1, 5] },
      { lands: [8, 7], breaks: [5] },
      { lands: [1, 6, 8], breaks: [1, 7] },
    ],
  },
  C: {
    name: 'C',
    terrains: [J, S, M, J, W, S, M, W],
    edges: pairs({ 0: [1, 2, 3], 1: [2, 5, 6], 2: [3, 4, 5], 3: [4], 4: [5, 7], 5: [6, 7], 6: [7, 8], 7: [8] }),
    setup: ['D', 'C', 'DD', '', 'DDB', 'D', 'T', ''],
    sides: [
      { lands: [4, 3], breaks: [7] },
      { lands: [8, 7, 4], breaks: [7, 11] },
      { lands: [1, 6, 8], breaks: [3, 7] },
    ],
  },
  D: {
    name: 'D',
    terrains: [W, J, W, S, M, J, S, M],
    edges: pairs({ 0: [1, 2, 3], 1: [2, 5, 7, 8], 2: [3, 4, 5], 3: [4], 4: [5, 6], 5: [6, 7], 6: [7], 7: [8] }),
    setup: ['DD', 'CD', '', '', 'DB', '', 'TDD', ''],
    sides: [
      { lands: [6, 4, 3], breaks: [3, 9] },
      { lands: [8, 7, 6], breaks: [5, 11] },
      { lands: [1, 8], breaks: [11] },
    ],
  },
};

// ─── Board placement on a 60° lattice ─────────────────────────────────────────
// Coordinates are (x, d60): x along 0°, d60 along 60°. A board's corners, going
// counter-clockwise with the Ocean on the left: 0 = ocean-bottom, 1 = obtuse
// bottom-right, 2 = top-right point, 3 = ocean-top. Side i runs corner i → i+1.

export type Coord = readonly [number, number];
const ANGLES: Coord[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0]];
const add = (a: Coord, b: Coord): Coord => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Coord, b: Coord): Coord => [a[0] - b[0], a[1] - b[1]];
const eq = (a: Coord, b: Coord) => a[0] === b[0] && a[1] === b[1];

export interface Orientation {
  offset: Coord;
  /** rotation in 60° steps, 0..5 */
  rot: number;
}

function cornerOffset(i: number, rot: number): Coord {
  switch (i) {
    case 0: return [0, 0];
    case 1: return ANGLES[rot];
    case 2: return add(ANGLES[rot], ANGLES[rot + 1]);
    default: return ANGLES[rot + 1];
  }
}

export function corners(o: Orientation): Coord[] {
  return [0, 1, 2, 3].map((i) => add(o.offset, cornerOffset(i, o.rot)));
}

function sideCoords(o: Orientation, i: number): [Coord, Coord] {
  const c = corners(o);
  return [c[i], c[i + 1]];
}

const HOME: Orientation = { offset: [0, 0], rot: 0 };

/** Place a board so its side `moving` lies against the (already placed) side `stationary`. */
function toMatchSide(moving: number, stationary: [Coord, Coord]): Orientation {
  const angle = sub(stationary[1], stationary[0]);
  const step = ANGLES.findIndex((a) => eq(a, angle));
  const rot = (((step - (moving === 2 ? 3 : moving) + 3) % 6) + 6) % 6;
  return { offset: sub(stationary[1], cornerOffset(moving, rot)), rot };
}

/** Standard island layouts for 1–4 boards (each player has one board). */
export function standardLayout(n: number): Orientation[] {
  if (n <= 1) return [HOME];
  if (n === 2) return [HOME, toMatchSide(0, sideCoords(HOME, 0))];
  if (n === 3) return [HOME, toMatchSide(0, sideCoords(HOME, 1)), toMatchSide(1, sideCoords(HOME, 0))];
  const tl = toMatchSide(0, sideCoords(HOME, 2));
  return [HOME, tl, toMatchSide(1, sideCoords(tl, 1)), toMatchSide(1, sideCoords(HOME, 1))];
}

// ─── Assembled island ─────────────────────────────────────────────────────────

export interface SpaceDef {
  id: string; // e.g. "A5"
  board: number; // index into the island's boards
  boardName: BoardName;
  num: number; // 0 = Ocean, 1..8 = land
  terrain: Terrain;
  coastal: boolean;
  adj: string[];
}

export interface IslandDef {
  boards: BoardName[];
  orientations: Orientation[];
  spaces: SpaceDef[];
}

export function setupPieces(board: BoardName, num: number): { pieces: PieceKind[]; blight: number } {
  const code = num >= 1 ? BOARDS[board].setup[num - 1] : '';
  const pieces: PieceKind[] = [];
  let blight = 0;
  for (const ch of code) {
    if (ch === 'E') pieces.push('explorer');
    else if (ch === 'T') pieces.push('town');
    else if (ch === 'C') pieces.push('city');
    else if (ch === 'D') pieces.push('dahan');
    else if (ch === 'B') blight++;
  }
  return { pieces, blight };
}

export function buildIsland(boardNames: BoardName[]): IslandDef {
  const orientations = standardLayout(boardNames.length);
  const spaces: SpaceDef[] = [];
  const byId = new Map<string, SpaceDef>();
  boardNames.forEach((name, bi) => {
    const def = BOARDS[name];
    for (let num = 0; num <= 8; num++) {
      const sp: SpaceDef = {
        id: `${name}${num}`,
        board: bi,
        boardName: name,
        num,
        terrain: num === 0 ? 'OCEAN' : def.terrains[num - 1],
        coastal: false,
        adj: [],
      };
      spaces.push(sp);
      byId.set(sp.id, sp);
    }
  });
  const link = (a: string, b: string) => {
    const sa = byId.get(a)!, sb = byId.get(b)!;
    if (!sa.adj.includes(b)) sa.adj.push(b);
    if (!sb.adj.includes(a)) sb.adj.push(a);
  };
  boardNames.forEach((name) => {
    for (const [a, b] of BOARDS[name].edges) link(`${name}${a}`, `${name}${b}`);
  });

  // Join boards along shared sides.
  for (let b1 = 0; b1 < boardNames.length; b1++) {
    for (let b2 = b1 + 1; b2 < boardNames.length; b2++) {
      for (let s1 = 0; s1 < 3; s1++) {
        const [f1, t1] = sideCoords(orientations[b1], s1);
        for (let s2 = 0; s2 < 3; s2++) {
          const [f2, t2] = sideCoords(orientations[b2], s2);
          if (eq(f1, t2) && eq(t1, f2)) {
            joinSides(boardNames[b2], BOARDS[boardNames[b2]].sides[s2], boardNames[b1], BOARDS[boardNames[b1]].sides[s1], link);
          }
        }
      }
    }
  }

  for (const sp of spaces) {
    if (sp.num === 0) continue;
    sp.coastal = sp.adj.some((id) => byId.get(id)!.num === 0);
    sp.adj.sort();
  }
  return { boards: boardNames, orientations, spaces };
}

/** Lands along two touching sides are adjacent where their stretches overlap or meet. */
function joinSides(
  nameA: string,
  a: { lands: readonly number[]; breaks: readonly number[] },
  nameB: string,
  b: { lands: readonly number[]; breaks: readonly number[] },
  link: (x: string, y: string) => void,
) {
  const thisLands = a.lands;
  const thisBreaks = [0, ...a.breaks, 13];
  const otherLands = [...b.lands].reverse();
  const otherBreaks = [0, ...b.breaks, 13].map((x) => 13 - x).reverse();
  let i = 0, j = 0;
  for (;;) {
    link(`${nameA}${thisLands[i]}`, `${nameB}${otherLands[j]}`);
    if (i >= thisBreaks.length - 2 && j >= otherBreaks.length - 2) break;
    if (j >= otherBreaks.length - 2 || (i < thisBreaks.length - 2 && thisBreaks[i + 1] < otherBreaks[j + 1])) i++;
    else j++;
  }
}
