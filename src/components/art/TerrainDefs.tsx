// Seamless painterly terrain fills. Mount <TerrainDefs/> once anywhere in the document, then
// reference e.g. fill="url(#terrain-jungle)" from any SVG. All tiles are userSpaceOnUse.
import type { ReactElement, ReactNode } from 'react';
import { waveLine } from './shared';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface P {
  x: number;
  y: number;
  a: number;
  b: number;
  c: number;
}

/** Jittered grid of points with three random attributes each. */
function points(seed: number, w: number, h: number, cols: number, rows: number): P[] {
  const r = rng(seed);
  const out: P[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      out.push({ x: ((i + 0.1 + r() * 0.8) * w) / cols, y: ((j + 0.1 + r() * 0.8) * h) / rows, a: r(), b: r(), c: r() });
  return out;
}

/** Repeat a feature of radius `rad` at the wrap offsets it needs to tile seamlessly. */
function tiled(key: string, p: P, rad: number, w: number, h: number, draw: (x: number, y: number) => ReactNode): ReactElement[] {
  const xs = [0, ...(p.x - rad < 0 ? [w] : []), ...(p.x + rad > w ? [-w] : [])];
  const ys = [0, ...(p.y - rad < 0 ? [h] : []), ...(p.y + rad > h ? [-h] : [])];
  return xs.flatMap((dx) => ys.map((dy) => <g key={`${key}${dx},${dy}`}>{draw(p.x + dx, p.y + dy)}</g>));
}

const r1 = (n: number) => +n.toFixed(1);
const leaf = (len: number) => `M0 0 Q${len / 2} ${-len * 0.38} ${len} 0 Q${len / 2} ${len * 0.38} 0 0 Z`;

// ---- Jungle: dense layered canopy ------------------------------------------------------------
const JW = 64;
const JUNGLE: ReactElement[] = (() => {
  const greens = ['#2f6a28', '#3a7a2f', '#2a5e24', '#356f2b', '#43813a', '#28561f'];
  const lobes: [number, number, number][] = [
    [0, 0, 1],
    [-0.75, 0.35, 0.7],
    [0.7, 0.4, 0.75],
  ];
  const els: ReactElement[] = [<rect key="bg" width={JW} height={JW} fill="#1d3f19" />];
  const canopy = (seed: number, cols: number, rmin: number, rvar: number, key: string) =>
    points(seed, JW, JW, cols, cols).forEach((p, i) => {
      const r = rmin + p.a * rvar;
      const fill = greens[Math.floor(p.b * greens.length)];
      const rot = p.c * 360;
      els.push(
        ...tiled(`${key}${i}`, p, r * 1.8, JW, JW, (x, y) => (
          <>
            <g transform={`translate(${r1(x + 1.2)} ${r1(y + 1.8)}) rotate(${Math.round(rot)})`} fill="#10260c" opacity="0.8">
              {lobes.map(([lx, ly, lr], k) => (
                <circle key={k} cx={r1(lx * r)} cy={r1(ly * r)} r={r1(lr * r)} />
              ))}
            </g>
            <g transform={`translate(${r1(x)} ${r1(y)}) rotate(${Math.round(rot)})`} fill={fill}>
              {lobes.map(([lx, ly, lr], k) => (
                <circle key={k} cx={r1(lx * r)} cy={r1(ly * r)} r={r1(lr * r)} />
              ))}
            </g>
            <circle cx={r1(x - r * 0.25)} cy={r1(y - r * 0.3)} r={r1(r * 0.5)} fill="#7cbc55" opacity="0.3" />
          </>
        )),
      );
    });
  canopy(11, 4, 6.5, 3, 'a');
  canopy(23, 3, 4, 2.4, 'b');
  points(37, JW, JW, 4, 3).forEach((p, i) => {
    const len = 5 + p.a * 3;
    els.push(
      ...tiled(`l${i}`, p, len, JW, JW, (x, y) => (
        <g transform={`translate(${r1(x)} ${r1(y)}) rotate(${Math.round(p.b * 360)})`}>
          <path d={leaf(len)} fill="#86c35a" opacity="0.75" />
          <path d={`M0.6 0 H${r1(len - 1)}`} stroke="#2f5f22" strokeWidth="0.5" />
        </g>
      )),
    );
  });
  return els;
})();

// ---- Mountain: grey-brown strata with lit ridges ---------------------------------------------
const MW = 72;
const MOUNTAIN: ReactElement[] = (() => {
  const els: ReactElement[] = [<rect key="bg" width={MW} height={MW} fill="#7b7064" />];
  points(5, MW, MW, 3, 3).forEach((p, i) => {
    const r = 10 + p.a * 6;
    els.push(...tiled(`p${i}`, p, r, MW, MW, (x, y) => <ellipse cx={r1(x)} cy={r1(y)} rx={r1(r)} ry={r1(r * 0.6)} fill={p.b > 0.5 ? '#8c8174' : '#6d6257'} opacity="0.6" />));
  });
  for (let k = 0; k < 6; k++) {
    const y = k * 12 + 6;
    els.push(
      <path key={`s${k}`} d={waveLine(0, MW, y, 2.2, MW / (1 + (k % 2)), k * 1.3, 3)} fill="none" stroke="#5a5046" strokeWidth="1.6" opacity="0.65" />,
      <path key={`h${k}`} d={waveLine(0, MW, y + 1.8, 2.2, MW / (1 + (k % 2)), k * 1.3, 3)} fill="none" stroke="#a89d8f" strokeWidth="0.8" opacity="0.7" />,
    );
  }
  points(9, MW, MW, 3, 3).forEach((p, i) => {
    const s = 7 + p.a * 6;
    const h2 = 0.25 + p.b * 0.3;
    // ridgeline: base-left, shoulder, main peak, saddle, second peak, base-right
    const R: [number, number][] = [
      [-1.3, 0.45],
      [-0.6, -0.05],
      [-0.2, -0.6],
      [0.25, -0.2],
      [0.55, -h2],
      [1.3, 0.45],
    ];
    const at = (x: number, y: number, [u, v]: [number, number]) => `${r1(x + u * s)} ${r1(y + v * s)}`;
    els.push(
      ...tiled(`r${i}`, p, s * 1.3, MW, MW, (x, y) => (
        <>
          <path d={`M${R.map((q) => at(x, y, q)).join(' L')} Z`} fill="#a59a8c" opacity="0.8" />
          <path d={`M${at(x, y, R[2])} L${at(x, y, R[3])} L${at(x, y, R[4])} L${at(x, y, R[5])} L${at(x, y, [0.1, 0.45])} L${at(x, y, [0, 0])} Z`} fill="#51473e" opacity="0.8" />
          <path d={`M${R.map((q) => at(x, y, q)).join(' L')}`} fill="none" stroke="#3e352e" strokeWidth="0.7" strokeLinejoin="round" opacity="0.8" />
        </>
      )),
    );
  });
  points(17, MW, MW, 6, 5).forEach((p, i) => {
    els.push(<circle key={`d${i}`} cx={r1(p.x)} cy={r1(p.y)} r={r1(0.5 + p.a)} fill={p.b > 0.5 ? '#bdb2a4' : '#4e453d'} opacity="0.7" />);
  });
  return els;
})();

// ---- Sands: warm ochre with dune ripples --------------------------------------------------------
const SW = 64;
const SANDS: ReactElement[] = (() => {
  const els: ReactElement[] = [<rect key="bg" width={SW} height={SW} fill="#d4ac66" />];
  points(3, SW, SW, 2, 2).forEach((p, i) => {
    els.push(...tiled(`p${i}`, p, 16, SW, SW, (x, y) => <ellipse cx={r1(x)} cy={r1(y)} rx="16" ry="8" fill="#e6c482" opacity="0.5" />));
  });
  for (let k = 0; k < 8; k++) {
    const y = k * 8 + 4;
    const ph = k * 0.9;
    els.push(
      <path key={`s${k}`} d={waveLine(0, SW, y + 1.3, 2.2, SW, ph)} fill="none" stroke="#b08446" strokeWidth="1.2" opacity="0.75" />,
      <path key={`h${k}`} d={waveLine(0, SW, y, 2.2, SW, ph)} fill="none" stroke="#f0d69e" strokeWidth="0.9" opacity="0.85" />,
    );
  }
  points(19, SW, SW, 6, 6).forEach((p, i) => {
    els.push(<circle key={`d${i}`} cx={r1(p.x)} cy={r1(p.y)} r={r1(0.4 + p.a * 0.5)} fill={p.b > 0.5 ? '#9a733a' : '#f7e6b8'} opacity="0.7" />);
  });
  return els;
})();

// ---- Wetland: teal marsh, pools with glints, reed clumps ----------------------------------------
const WW = 60;
const WETLAND: ReactElement[] = (() => {
  const els: ReactElement[] = [<rect key="bg" width={WW} height={WW} fill="#4a7c69" />];
  points(29, WW, WW, 3, 3).forEach((p, i) => {
    const r = 6 + p.a * 4;
    els.push(...tiled(`g${i}`, p, r, WW, WW, (x, y) => <ellipse cx={r1(x)} cy={r1(y)} rx={r1(r)} ry={r1(r * 0.7)} fill={p.b > 0.5 ? '#5f9163' : '#3f6e5c'} opacity="0.7" />));
  });
  points(41, WW, WW, 2, 2).forEach((p, i) => {
    const rx = 7 + p.a * 4;
    els.push(
      ...tiled(`w${i}`, p, rx, WW, WW, (x, y) => (
        <>
          <ellipse cx={r1(x)} cy={r1(y)} rx={r1(rx)} ry={r1(2.6 + p.b)} fill="#2d6070" />
          <path d={`M${r1(x - rx * 0.5)} ${r1(y - 0.6)} H${r1(x + rx * 0.1)} M${r1(x + rx * 0.3)} ${r1(y + 0.6)} H${r1(x + rx * 0.6)}`} stroke="#bfe8e6" strokeWidth="0.8" strokeLinecap="round" />
        </>
      )),
    );
  });
  points(53, WW, WW, 3, 3).forEach((p, i) => {
    const hgt = 8 + p.a * 5;
    const lean = (p.b - 0.5) * 4;
    els.push(
      ...tiled(`r${i}`, p, hgt, WW, WW, (x, y) => (
        <>
          {[0, 1, 2, 3, 4].map((j) => {
            const bx = x + (j - 2) * 0.9;
            const tx = x + (j - 2) * 2 + lean;
            return <path key={j} d={`M${r1(bx)} ${r1(y)} Q${r1(bx + lean * 0.3)} ${r1(y - hgt * 0.6)} ${r1(tx)} ${r1(y - hgt + (j % 2) * 1.5)}`} fill="none" stroke="#24452f" strokeWidth="0.65" />;
          })}
          {p.c > 0.4 && <ellipse cx={r1(x - 0.5 + lean * 0.8)} cy={r1(y - hgt + 1.4)} rx="0.8" ry="1.8" fill="#6b4526" />}
        </>
      )),
    );
  });
  return els;
})();

// ---- Ocean: deep blue with staggered wave crests ------------------------------------------------
const OW = 64;
const OCEAN: ReactElement[] = (() => {
  const els: ReactElement[] = [<rect key="bg" width={OW} height={OW} fill="#1b4870" />];
  points(61, OW, OW, 2, 2).forEach((p, i) => {
    els.push(...tiled(`p${i}`, p, 14, OW, OW, (x, y) => <ellipse cx={r1(x)} cy={r1(y)} rx="14" ry="7" fill={p.a > 0.5 ? '#163c5f' : '#22557f'} opacity="0.7" />));
  });
  for (let row = 0; row < 4; row++) {
    const y = 8 + row * 16;
    for (let j = 0; j < 3; j++) {
      const x = (row % 2 ? 0 : 16) + j * 32;
      if (x > OW) continue;
      els.push(
        <path key={`w${row}-${j}`} d={`M${x - 7} ${y} C${x - 4} ${y - 4.5} ${x + 4} ${y - 4.5} ${x + 7} ${y}`} fill="none" stroke="#5a8fbc" strokeWidth="1.5" strokeLinecap="round" />,
        <path key={`h${row}-${j}`} d={`M${x - 3.6} ${y - 1.6} C${x - 2} ${y - 3.4} ${x + 2} ${y - 3.4} ${x + 3.6} ${y - 1.6}`} fill="none" stroke="#a9d4ee" strokeWidth="0.8" strokeLinecap="round" />,
      );
    }
  }
  points(67, OW, OW, 4, 4).forEach((p, i) => {
    els.push(<circle key={`f${i}`} cx={r1(p.x)} cy={r1(p.y)} r={r1(0.4 + p.a * 0.5)} fill="#cfe8f6" opacity="0.5" />);
  });
  return els;
})();

// ---- Blighted overlay: translucent grey-purple rot, ash and cracks ------------------------------
const BW = 56;
const BLIGHTED: ReactElement[] = (() => {
  const els: ReactElement[] = [];
  points(71, BW, BW, 3, 3).forEach((p, i) => {
    const r = 6 + p.a * 5;
    els.push(...tiled(`b${i}`, p, r, BW, BW, (x, y) => <ellipse cx={r1(x)} cy={r1(y)} rx={r1(r)} ry={r1(r * (0.6 + p.b * 0.4))} fill="#33263f" opacity="0.4" />));
  });
  points(73, BW, BW, 2, 2).forEach((p, i) => {
    const rr = rng(100 + i);
    let d = '';
    let x = 0;
    let y = 0;
    for (let s = 0; s < 5; s++) {
      x += (rr() - 0.5) * 9;
      y += 1.5 + rr() * 3;
      d += ` L${r1(x)} ${r1(y)}`;
    }
    els.push(
      ...tiled(`c${i}`, p, 16, BW, BW, (cx, cy) => (
        <path d={`M0 0${d} M${r1(x * 0.5)} ${r1(y * 0.5)} l3.4 1.6`} transform={`translate(${r1(cx)} ${r1(cy - 8)})`} fill="none" stroke="#1a1022" strokeWidth="0.9" opacity="0.7" strokeLinejoin="round" />
      )),
    );
  });
  points(79, BW, BW, 5, 5).forEach((p, i) => {
    els.push(<circle key={`a${i}`} cx={r1(p.x)} cy={r1(p.y)} r={r1(0.6 + p.a * 1.6)} fill={p.b > 0.4 ? '#8d8098' : '#4b3a58'} opacity="0.5" />);
  });
  return els;
})();

const PATTERNS: [string, number, ReactElement[]][] = [
  ['terrain-jungle', JW, JUNGLE],
  ['terrain-mountain', MW, MOUNTAIN],
  ['terrain-sands', SW, SANDS],
  ['terrain-wetland', WW, WETLAND],
  ['terrain-ocean', OW, OCEAN],
  ['terrain-blighted-overlay', BW, BLIGHTED],
];

/** Hidden SVG holding the shared terrain <pattern> defs. Render once per page. */
export default function TerrainDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {PATTERNS.map(([id, size, els]) => (
          <pattern key={id} id={id} patternUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
            {els}
          </pattern>
        ))}
      </defs>
    </svg>
  );
}
