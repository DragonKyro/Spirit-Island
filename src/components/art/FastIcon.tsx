import { Inked, spiralPath, useUid } from './shared';

const BIRD =
  'M3.4 19.6 L9 16.8 C10.6 13.6 13.6 12.6 16 13.8 C19.4 13.6 21.6 11 23.6 7.4 C26.4 3.4 31.4 2.4 37 3 C31.6 5.2 28.6 8.6 27.4 13.4 C30.6 13 34 13.4 37.6 14.6 L31.4 19 L36.4 24.6 C31 24.6 26.6 23.8 22.4 22.6 C17.6 23.6 12.6 22.6 9.8 19.8 Z';
const LOWER_WING = 'M15.6 21.4 C19.6 25.6 24.6 29.6 31.4 32.4 C28.2 28.6 26.4 25.2 25.8 21.6 Z';

/** Fast power: a swooping red swift. */
export default function FastIcon({ size = 24 }: { size?: number }) {
  const id = useUid('fa');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Fast">
      <defs>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a5a" />
          <stop offset="0.5" stopColor="#d8342a" />
          <stop offset="1" stopColor="#8a1414" />
        </linearGradient>
      </defs>
      <g transform="translate(0 3)">
        <Inked
          parts={[
            { d: LOWER_WING, fill: '#9a1a14' },
            { d: BIRD, fill: `url(#${id}-b)` },
          ]}
        />
        <path d={spiralPath(18.6, 18, 3.6, 1.6, Math.PI)} fill="none" stroke="#ffe0c8" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M24.6 10.4 Q27 7.4 31 5.4 M19.6 24 Q23.6 27.6 27.6 29.6" fill="none" stroke="#ffb8a0" strokeWidth="0.9" strokeLinecap="round" />
        <circle cx="11.6" cy="16.6" r="1" fill="#1a0806" />
      </g>
    </svg>
  );
}
