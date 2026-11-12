import { INK, SERIF, useUid } from './shared';

const ISLAND = 'M5 52 C9 45 15 41 21 39.6 L27.6 27 L31.4 32.4 L34.4 29.4 C40 33.4 47.6 40 55 50.4 C46 54.6 15 55 5 52 Z';
const PEAK = 'M27.6 27 L31.4 32.4 L34.4 29.4 L37 32 C33 34.6 26 35 22.6 37.6 Z';

/** Blight card: healthy (green island, blue sea) or flipped (withered grey island, murky sky). */
export default function BlightCardArt({ width = 60, flipped }: { width?: number; flipped: boolean }) {
  const id = useUid('bc');
  const c = flipped
    ? { sky: ['#4a3f58', '#a59cae'], sea: ['#5a5e6c', '#2a2c38'], land: ['#857a8a', '#3e3446'], peak: '#5e5464', sun: '#d8d0c0' }
    : { sky: ['#8fcdf0', '#eef6dc'], sea: ['#3a8cc4', '#184a7a'], land: ['#7cc452', '#2c6626'], peak: '#9a8f82', sun: '#fff1a8' };
  return (
    <svg width={width} height={+(width * 1.4).toFixed(1)} viewBox="0 0 60 84" role="img" aria-label={flipped ? 'Blighted Island' : 'Healthy Island'}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.sky[0]} />
          <stop offset="1" stopColor={c.sky[1]} />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.sea[0]} />
          <stop offset="1" stopColor={c.sea[1]} />
        </linearGradient>
        <linearGradient id={`${id}-land`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={c.land[0]} />
          <stop offset="1" stopColor={c.land[1]} />
        </linearGradient>
        <clipPath id={`${id}-w`}>
          <rect x="4" y="4" width="52" height="60" rx="2" />
        </clipPath>
      </defs>
      <rect x="0.6" y="0.6" width="58.8" height="82.8" rx="4" fill={flipped ? '#2a2030' : '#efe2c0'} stroke={INK} strokeWidth="1.2" />
      <g clipPath={`url(#${id}-w)`}>
        <rect x="4" y="4" width="52" height="60" fill={`url(#${id}-sky)`} />
        <circle cx="45" cy="15" r="6" fill={c.sun} opacity={flipped ? 0.45 : 1} />
        {flipped && <path d="M4 20 C14 14 22 22 32 17 C40 13 48 20 56 16 V8 H4 Z" fill="#2e2638" opacity="0.6" />}
        <rect x="4" y="45" width="52" height="19" fill={`url(#${id}-sea)`} />
        <path d="M8 58 q3 -2 6 0 M30 61 q3 -2 6 0 M44 57 q3 -2 6 0" stroke={flipped ? '#8a8a96' : '#bfe4f7'} strokeWidth="0.8" fill="none" />
        <path d={ISLAND} fill={`url(#${id}-land)`} stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
        <path d={PEAK} fill={c.peak} />
        {flipped ? (
          <g>
            <path d="M12 47 v-5 l-1.6 -2 M12 44 l1.8 -1.6 M44 46.4 v-5.4 l1.6 -1.8 M44 43 l-1.8 -1.4 M36 42 v-4 l1.2 -1.4" stroke="#1e1724" strokeWidth="0.9" fill="none" strokeLinecap="round" />
            <ellipse cx="20" cy="47" rx="5" ry="1.8" fill="#2a1f33" opacity="0.8" />
            <ellipse cx="38" cy="46" rx="4" ry="1.5" fill="#2a1f33" opacity="0.8" />
            <ellipse cx="29" cy="40" rx="3" ry="1.3" fill="#2a1f33" opacity="0.7" />
          </g>
        ) : (
          <g fill="#2a6a22" stroke={INK} strokeWidth="0.6">
            <circle cx="13" cy="46" r="2.6" />
            <circle cx="17.4" cy="44.4" r="2.2" />
            <circle cx="40" cy="42.4" r="2.6" />
            <circle cx="45" cy="45.4" r="2.2" />
            <circle cx="24" cy="43" r="1.8" />
          </g>
        )}
      </g>
      <rect x="4" y="4" width="52" height="60" rx="2" fill="none" stroke={INK} strokeWidth="1.2" />
      <text x="30" y="74.6" textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize="5.2" letterSpacing="0.4" fill={flipped ? '#cbbcd6' : INK}>
        {flipped ? 'BLIGHTED ISLAND' : 'HEALTHY ISLAND'}
      </text>
    </svg>
  );
}
