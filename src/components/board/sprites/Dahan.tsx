import { Inked, useUid } from '../../art/shared';

const WALLS = 'M9.6 26 H30.4 L31 35 H9 Z';
const DOME =
  'M4.6 28 C4 16.4 11 9.8 20 9.8 C29 9.8 36 16.4 35.4 28 Q32.7 26.2 30.2 28 Q27.6 26.2 25.1 28 Q22.6 26.2 20 28 Q17.4 26.2 14.9 28 Q12.4 26.2 9.8 28 Q7.3 26.2 4.6 28 Z';

/** Dahan: a round thatched village dwelling. Damaged = flipped upside down with a red tint. */
export default function Dahan({ size = 28, damaged = 0 }: { size?: number; damaged?: number }) {
  const id = useUid('dahan');
  const hurt = damaged > 0;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={hurt ? 'Dahan (damaged)' : 'Dahan'}>
      <defs>
        <linearGradient id={`${id}-t`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f0c477" />
          <stop offset="0.55" stopColor="#c98a42" />
          <stop offset="1" stopColor="#8a5526" />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b56a3e" />
          <stop offset="1" stopColor="#7a3f22" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="36.4" rx="15" ry="2.4" fill="#000" opacity="0.32" />
      <g transform={hurt ? 'rotate(180 20 22.4)' : undefined}>
        <Inked
          parts={[
            { d: WALLS, fill: `url(#${id}-c)` },
            { d: DOME, fill: `url(#${id}-t)` },
            { d: 'M18.2 10.6 Q20 3.8 21.8 10.6 Z', fill: '#7a4a22' },
          ]}
        />
        <path d="M17.2 35 V30.6 Q20 27.8 22.8 30.6 V35 Z" fill="#2b170c" />
        <path d="M11.4 29.4 V34 M28.6 29.4 V34" stroke="#5a2c14" strokeWidth="1" />
        <g fill="none" stroke="#8a5424" strokeWidth="0.9" strokeLinecap="round">
          <path d="M7.4 22.4 Q20 14.6 32.6 22.4" />
          <path d="M10.8 16.4 Q20 11.4 29.2 16.4" />
          <path d="M9 25 l1 -2.4 M14 23.4 l0.6 -2.6 M20 22.8 v-2.6 M26 23.4 l-0.6 -2.6 M31 25 l-1 -2.4 M15.2 17.6 l0.4 -2 M24.8 17.6 l-0.4 -2" />
        </g>
        <path d="M12 14 Q16 11.2 20 11" stroke="#fff3cf" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round" />
        {hurt && (
          <g fill="#d0301e" opacity="0.42">
            <path d={WALLS} />
            <path d={DOME} />
          </g>
        )}
      </g>
    </svg>
  );
}
