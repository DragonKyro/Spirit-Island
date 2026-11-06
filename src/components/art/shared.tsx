// Shared drawing helpers for the inline-SVG art. Not part of the public art API.
import { useId } from 'react';

/** Near-black warm ink used for all bold outlines. */
export const INK = '#1c130e';
export const PARCHMENT = '#f1e4c3';
export const SERIF = "'Palatino Linotype', 'Book Antiqua', Georgia, 'Times New Roman', serif";

/** CSS-safe unique id prefix for <defs> inside one component instance. */
export function useUid(prefix = 'si'): string {
  return `${prefix}-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}

const f = (n: number) => +n.toFixed(2);

export type Pt = readonly [number, number];

/** Closed polygon from left-half points (top→bottom), mirrored across x = axis. */
export function mirrorPath(pts: readonly Pt[], axis: number): string {
  const right = [...pts].reverse().map(([x, y]) => [f(2 * axis - x), y] as const);
  return `M${[...pts, ...right].map(([x, y]) => `${x} ${y}`).join(' L')} Z`;
}

export const circlePath = (cx: number, cy: number, r: number) => ellipsePath(cx, cy, r, r);

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${cy} a${rx} ${ry} 0 1 0 ${f(2 * rx)} 0 a${rx} ${ry} 0 1 0 ${f(-2 * rx)} 0 Z`;
}

export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y} H${f(x + w - r)} a${r} ${r} 0 0 1 ${r} ${r} V${f(y + h - r)} a${r} ${r} 0 0 1 ${-r} ${r} H${f(x + r)} a${r} ${r} 0 0 1 ${-r} ${-r} V${f(y + r)} a${r} ${r} 0 0 1 ${r} ${-r} Z`;
}

/** Archimedean spiral polyline from the centre outwards. */
export function spiralPath(cx: number, cy: number, rMax: number, turns: number, start = 0): string {
  const steps = Math.ceil(turns * 28);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * turns * Math.PI * 2;
    pts.push(`${f(cx + Math.cos(a) * rMax * t)} ${f(cy + Math.sin(a) * rMax * t)}`);
  }
  return `M${pts.join(' L')}`;
}

/** Periodic wavy line across [x0, x1] (used by patterns so tiles wrap). */
export function waveLine(x0: number, x1: number, y: number, amp: number, period: number, phase = 0, step = 4): string {
  const pts: string[] = [];
  for (let x = x0; x <= x1 + 0.001; x += step) {
    pts.push(`${f(x)} ${f(y + amp * Math.sin(((x - x0) / period) * Math.PI * 2 + phase))}`);
  }
  return `M${pts.join(' L')}`;
}

export const roman = (n: number) => ['I', 'II', 'III', 'IV', 'V', 'VI'][n - 1] ?? String(n);

/** One silhouette fragment. Filled parts get an ink outline; stroke-only parts get a wider ink under-stroke. */
export interface Part {
  d: string;
  fill?: string;
  stroke?: string;
  sw?: number;
  transform?: string;
  opacity?: number;
}

/**
 * Two-pass "bold outline" renderer: all outlines first, then all fills, so
 * overlapping parts merge into one inked silhouette (the rulebook look).
 */
export function Inked({ parts, w = 2.6, ink = INK }: { parts: readonly Part[]; w?: number; ink?: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {parts.map((p, i) => (
        <path key={`o${i}`} d={p.d} transform={p.transform} fill={p.fill ? ink : 'none'} stroke={ink} strokeWidth={(p.sw ?? 0) + w} />
      ))}
      {parts.map((p, i) => (
        <path key={`f${i}`} d={p.d} transform={p.transform} opacity={p.opacity} fill={p.fill ?? 'none'} stroke={p.stroke ?? 'none'} strokeWidth={p.sw} />
      ))}
    </g>
  );
}

/** Centred bold numeral (optionally haloed so it reads on any background). */
export function Num({ value, x = 20, y = 20, fs, fill = INK, halo }: { value: number | string; x?: number; y?: number; fs?: number; fill?: string; halo?: string }) {
  const s = String(value);
  const size = fs ?? (s.length > 1 ? 15 : 19);
  return (
    <text
      x={x}
      y={+(y + size * 0.35).toFixed(2)}
      textAnchor="middle"
      fontFamily={SERIF}
      fontWeight={700}
      fontSize={size}
      fill={fill}
      stroke={halo}
      strokeWidth={halo ? +(size * 0.16).toFixed(2) : undefined}
      strokeLinejoin="round"
      paintOrder="stroke"
      letterSpacing={s.length > 1 ? -0.5 : undefined}
    >
      {s}
    </text>
  );
}

/** Crack + scorch marks drawn over a damaged piece. */
export function Scorch({ cx = 20, cy = 24, r = 8 }: { cx?: number; cy?: number; r?: number }) {
  const id = useUid('sc');
  const crack = `M${f(cx - r)} ${f(cy - r * 0.55)} l${f(r * 0.55)} ${f(r * 0.35)} l${f(r * 0.2)} ${f(-r * 0.45)} l${f(r * 0.5)} ${f(r * 0.6)} l${f(r * 0.3)} ${f(-r * 0.25)} l${f(r * 0.45)} ${f(r * 0.5)}`;
  return (
    <g pointerEvents="none">
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor="#140a05" stopOpacity="0.7" />
          <stop offset="0.6" stopColor="#3b1a08" stopOpacity="0.3" />
          <stop offset="1" stopColor="#3b1a08" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.75} fill={`url(#${id})`} />
      <path d={crack} fill="none" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={crack} transform="translate(0.5 0.6)" fill="none" stroke="#ffb35c" strokeWidth="0.5" opacity="0.8" />
      <circle cx={cx + r * 0.35} cy={cy + r * 0.3} r="0.9" fill="#ff7a2a" />
      <circle cx={cx - r * 0.45} cy={cy + r * 0.2} r="0.6" fill="#ffb35c" />
    </g>
  );
}
