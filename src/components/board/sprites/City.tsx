import { Inked, Scorch, useUid } from '../../art/shared';

/** Crenellated top edge from x0 to x1 (n merlons), continuing an open path. */
function crenels(x0: number, x1: number, top: number, drop: number, n: number): string {
  const seg = (x1 - x0) / (2 * n - 1);
  let d = '';
  for (let i = 0; i < 2 * n - 1; i++) {
    const x = +(x0 + seg * (i + 1)).toFixed(2);
    d += i % 2 === 0 ? ` H${x} V${top + drop}` : ` H${x} V${top}`;
  }
  return d;
}

const CURTAIN = `M2.2 36.4 V23.2${crenels(2.2, 37.8, 23.2, 2.4, 7)} V36.4 Z`;
const KEEP = `M13.8 28 V5.6${crenels(13.8, 26.2, 5.6, 2.2, 3)} V28 Z`;

/** City: a crenellated keep flanked by a spired tower and a gabled hall, behind a curtain wall. */
export default function City({ size = 38, damaged = 0 }: { size?: number; damaged?: number }) {
  const id = useUid('city');
  const hurt = damaged > 0;
  const stone = `url(#${id}-s)`;
  const roof = `url(#${id}-r)`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={hurt ? 'City (damaged)' : 'City'}>
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#f2ecdd" />
          <stop offset="1" stopColor="#a49882" />
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9623f" />
          <stop offset="1" stopColor="#8a2c1c" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="37" rx="18" ry="2.4" fill="#000" opacity="0.32" />
      <g transform={hurt ? 'translate(20 20.5) rotate(80) scale(0.84) translate(-20 -18.6)' : undefined}>
        <Inked
          parts={[
            { d: 'M20 6 V0.8', stroke: '#4a3020', sw: 0.9 },
            { d: 'M20.3 0.9 L26 2.7 L20.3 4.6 Z', fill: '#c8352a' },
            { d: 'M4.6 12.8 H12.6 V28 H4.6 Z', fill: stone },
            { d: 'M3.4 13.4 L8.6 3.6 L13.8 13.4 Z', fill: roof },
            { d: 'M27.2 15 H36 V28 H27.2 Z', fill: stone },
            { d: 'M25.8 15.6 L31.6 7.4 L37.4 15.6 Z', fill: roof },
            { d: KEEP, fill: stone },
            { d: CURTAIN, fill: stone },
          ]}
        />
        <path d="M8.6 4 L13.4 13.2 H8.6 Z M31.6 7.8 L37 15.4 H31.6 Z" fill="#000" opacity="0.2" />
        <path d="M22.6 7.8 H26 V28 H22.6 Z" fill="#000" opacity="0.1" />
        <g fill="#2a1d14">
          <rect x="16.3" y="11" width="1.5" height="3.6" />
          <rect x="22.2" y="11" width="1.5" height="3.6" />
          <rect x="19.2" y="16.6" width="1.6" height="3.8" />
          <rect x="7.9" y="16.4" width="1.5" height="3.6" />
          <rect x="30.4" y="18.4" width="2.6" height="3" />
        </g>
        <path
          d="M2.4 30.4 H16.8 M23.2 30.4 H37.6 M2.4 33.6 H16.8 M23.2 33.6 H37.6 M7 27.6 V30.4 M12.4 27.6 V30.4 M28 27.6 V30.4 M33.4 27.6 V30.4 M4.6 30.4 V33.6 M10 30.4 V33.6 M30.4 30.4 V33.6 M35.6 30.4 V33.6"
          stroke="#857a65"
          strokeWidth="0.6"
        />
        <path d="M16.8 36.4 V30.8 Q20 26.8 23.2 30.8 V36.4 Z" fill="#2a1a10" />
        <path d="M18.4 29.6 V36.2 M20 28.6 V36.2 M21.6 29.6 V36.2 M17 32.4 H23" stroke="#7a6048" strokeWidth="0.5" />
      </g>
      {hurt && <Scorch cx={20} cy={25} r={9} />}
    </svg>
  );
}
