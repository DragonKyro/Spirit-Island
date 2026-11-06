import { INK, Num, useUid } from './shared';

const SHIELD = 'M20 3.4 C25 6 29.6 6.6 33.6 6 C33.6 20.4 29 30.4 20 36.6 C11 30.4 6.4 20.4 6.4 6 C10.4 6.6 15 6 20 3.4 Z';

/** Defend: a stone-and-steel heater shield; shows `value` when given. */
export default function DefendIcon({ size = 24, value }: { size?: number; value?: number }) {
  const id = useUid('df');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={value === undefined ? 'Defend' : `Defend ${value}`}>
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dfe8ef" />
          <stop offset="0.5" stopColor="#8fa3b5" />
          <stop offset="1" stopColor="#465a6e" />
        </linearGradient>
      </defs>
      <path d={SHIELD} fill={`url(#${id}-s)`} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d={SHIELD} transform="translate(20 20) scale(0.74) translate(-20 -19.4)" fill="none" stroke="#f4f8fb" strokeWidth="1.2" opacity="0.7" />
      <path d="M20 3.6 C25 6 29.6 6.6 33.4 6.2 C33.4 20 29 30.2 20 36.4 Z" fill="#000" opacity="0.14" />
      {value === undefined ? (
        <path d="M20 11 V29 M13 17 H27" stroke="#2d3b4a" strokeWidth="2.4" strokeLinecap="round" />
      ) : (
        <Num value={value} y={19} fill="#fff" halo={INK} />
      )}
    </svg>
  );
}
