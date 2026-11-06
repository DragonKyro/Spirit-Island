import { FearMask } from './FearIcon';
import { INK, SERIF, useUid } from './shared';

const SPIKES = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const p = (ang: number, r: number) => `${(30 + Math.cos(ang) * r).toFixed(2)} ${(36 + Math.sin(ang) * r).toFixed(2)}`;
  return `M${p(a - 0.12, 12)} L${p(a, i % 2 ? 24 : 30)} L${p(a + 0.12, 12)} Z`;
}).join(' ');

/** Back of a fear card: the horned mask over a dark violet starburst. */
export default function FearCardBack({ width = 60 }: { width?: number }) {
  const id = useUid('fc');
  return (
    <svg width={width} height={+(width * 1.4).toFixed(1)} viewBox="0 0 60 84" role="img" aria-label="Fear card">
      <defs>
        <radialGradient id={`${id}-bg`} cx="0.5" cy="0.42" r="0.7">
          <stop offset="0" stopColor="#5a2f5e" />
          <stop offset="1" stopColor="#140a17" />
        </radialGradient>
      </defs>
      <rect x="0.6" y="0.6" width="58.8" height="82.8" rx="4" fill={`url(#${id}-bg)`} stroke={INK} strokeWidth="1.2" />
      <rect x="3.6" y="3.6" width="52.8" height="76.8" rx="2.4" fill="none" stroke="#b89a6a" strokeWidth="0.8" />
      <path d={SPIKES} fill="#8a4a7a" opacity="0.55" />
      <g transform="translate(9 15) scale(1.05)">
        <FearMask />
      </g>
      <text x="30" y="74" textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize="8" letterSpacing="2" fill="#e2cda0" stroke={INK} strokeWidth="1.2" paintOrder="stroke">
        FEAR
      </text>
    </svg>
  );
}
