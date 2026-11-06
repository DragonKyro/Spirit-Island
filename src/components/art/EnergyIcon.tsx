import { INK, Num, useUid } from './shared';

const DOTS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  return [+(20 + Math.cos(a) * 14.6).toFixed(2), +(20 + Math.sin(a) * 14.6).toFixed(2)] as const;
});

/** Energy: a gold coin with a beaded rim; shows `value` when given, otherwise a spark. */
export default function EnergyIcon({ size = 24, value }: { size?: number; value?: number }) {
  const id = useUid('en');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={value === undefined ? 'Energy' : `${value} Energy`}>
      <defs>
        <radialGradient id={`${id}-c`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="0.5" stopColor="#f0c04a" />
          <stop offset="1" stopColor="#a8701a" />
        </radialGradient>
        <linearGradient id={`${id}-i`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c99430" />
          <stop offset="1" stopColor="#f7d878" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="17.6" fill={INK} />
      <circle cx="20" cy="20" r="16.2" fill={`url(#${id}-c)`} />
      {DOTS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.85" fill="#7a4c10" />
      ))}
      <circle cx="20" cy="20" r="12.2" fill={`url(#${id}-i)`} stroke="#7a4c10" strokeWidth="1" />
      {value === undefined ? (
        <path d="M20 10.4 Q21.6 18.4 29.6 20 Q21.6 21.6 20 29.6 Q18.4 21.6 10.4 20 Q18.4 18.4 20 10.4 Z" fill="#fff6d2" stroke="#7a4c10" strokeWidth="1.1" strokeLinejoin="round" />
      ) : (
        <Num value={value} fill="#3a2406" halo="#fff4c8" />
      )}
    </svg>
  );
}
