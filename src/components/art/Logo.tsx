import { INK, SERIF, spiralPath, useUid } from './shared';

const ISLAND = 'M74 170 C102 154 140 144 176 138 L212 84 L232 104 L252 72 L290 122 C332 128 374 148 406 170 C330 182 150 182 74 170 Z';
const ROCK = 'M212 84 L232 104 L252 72 L274 102 C252 110 226 112 196 122 Z';
// Tail rises from the peak into a spiral drawn outside-in (its outer end sits at 264,38).
const SWIRL = `M252 74 C256 64 264 52 264 38 L${spiralPath(240, 38, 24, 1.75, Math.PI / 2).slice(1).split(' L').reverse().join(' L')}`;

/** "SPIRIT ISLAND" title lockup over an island with a rising spirit swirl. */
export default function Logo({ width = 420 }: { width?: number }) {
  const id = useUid('logo');
  return (
    <svg width={width} height={+((width * 200) / 480).toFixed(1)} viewBox="0 0 480 200" role="img" aria-label="Spirit Island">
      <defs>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a8cc4" />
          <stop offset="1" stopColor="#123a5e" />
        </linearGradient>
        <linearGradient id={`${id}-land`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#86cc58" />
          <stop offset="1" stopColor="#2a6224" />
        </linearGradient>
        <linearGradient id={`${id}-txt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8dc" />
          <stop offset="0.55" stopColor="#f2c25a" />
          <stop offset="1" stopColor="#b06c18" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="#ffeeb0" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd56a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="242" cy="44" r="46" fill={`url(#${id}-glow)`} />
      <ellipse cx="240" cy="172" rx="214" ry="22" fill={`url(#${id}-sea)`} stroke={INK} strokeWidth="3" />
      <path d="M60 176 q9 -5 18 0 M120 186 q9 -5 18 0 M330 186 q9 -5 18 0 M398 176 q9 -5 18 0" stroke="#a9d4ee" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d={ISLAND} fill={`url(#${id}-land)`} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d={ROCK} fill="#9a8f82" />
      <path d="M252 72 L274 102 L262 104 L254 86 Z M212 84 L232 104 L222 108 L214 96 Z" fill="#000" opacity="0.25" />
      <path d="M252 72 L259 82 L254 80 L250 84 L246 80 L243 82 Z" fill="#f4f1ea" />
      <g fill="#2a6a22" stroke={INK} strokeWidth="2">
        <circle cx="120" cy="160" r="8" />
        <circle cx="134" cy="155" r="7" />
        <circle cx="350" cy="156" r="8" />
        <circle cx="364" cy="162" r="6.5" />
      </g>
      <path d={SWIRL} fill="none" stroke="#fff6d0" strokeWidth="12" strokeLinecap="round" opacity="0.35" />
      <path d={SWIRL} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d={SWIRL} fill="none" stroke="#ffd56a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <text
        x="240"
        y="152"
        textAnchor="middle"
        fontFamily={SERIF}
        fontWeight={700}
        fontSize="54"
        letterSpacing="3"
        textLength="420"
        lengthAdjust="spacingAndGlyphs"
        fill={`url(#${id}-txt)`}
        stroke={INK}
        strokeWidth="7"
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        SPIRIT ISLAND
      </text>
    </svg>
  );
}
