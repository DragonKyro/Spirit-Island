import { Inked, mirrorPath, useUid } from './shared';

const HORN_L = 'M12.6 11.6 C8 10.6 4.4 7 4 1.4 C7.4 4.6 11.4 6 16.2 7.2 Z';
const HORN_R = 'M27.4 11.6 C32 10.6 35.6 7 36 1.4 C32.6 4.6 28.6 6 23.8 7.2 Z';
const FACE = mirrorPath(
  [
    [20, 2.6],
    [18, 6.2],
    [12, 7.6],
    [8.6, 11],
    [9, 19.4],
    [4.4, 21.4],
    [9.4, 23.6],
    [11.6, 29.4],
    [20, 37],
  ],
  20,
);
const EYES = 'M11.4 15.4 L18.2 18.4 L17.2 21.8 C14 21.8 11.8 19.6 11.4 15.4 Z M28.6 15.4 L21.8 18.4 L22.8 21.8 C26 21.8 28.2 19.6 28.6 15.4 Z';
const MOUTH = 'M13.2 26.8 L15.8 25.6 L17.4 28.2 L20 25.8 L22.6 28.2 L24.2 25.6 L26.8 26.8 C24.6 32.4 15.4 32.4 13.2 26.8 Z';

/** Horned fear mask in a 40×40 user space (shared by FearIcon and FearCardBack). */
export function FearMask() {
  const id = useUid('fm');
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#6e4a3c" />
          <stop offset="1" stopColor="#24140f" />
        </linearGradient>
        <linearGradient id={`${id}-h`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#d9c7a2" />
          <stop offset="1" stopColor="#8a7454" />
        </linearGradient>
        <radialGradient id={`${id}-e`} cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#fff1a0" />
          <stop offset="1" stopColor="#ff6a1f" />
        </radialGradient>
      </defs>
      <Inked
        parts={[
          { d: HORN_L, fill: `url(#${id}-h)` },
          { d: HORN_R, fill: `url(#${id}-h)` },
          { d: FACE, fill: `url(#${id}-m)` },
        ]}
      />
      <path d="M14 9.6 Q20 7 26 9.6 M20 6 V12.4" stroke="#a07a5e" strokeWidth="0.9" fill="none" opacity="0.8" />
      <path d={EYES} fill={`url(#${id}-e)`} stroke="#1c0c06" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M19 22.2 H21 L20 24.8 Z" fill="#120806" />
      <path d={MOUTH} fill="#120806" />
      <path d="M15.8 26.4 L17.3 28 L18.8 26.6 M21.2 26.6 L22.7 28 L24.2 26.4" stroke="#e8dcc0" strokeWidth="0.8" fill="none" />
      <path d="M10.8 24.6 Q12.6 27 12.6 30 M29.2 24.6 Q27.4 27 27.4 30" stroke="#b5482e" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Fear: a horned, spiky mask with ember eyes. */
export default function FearIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Fear">
      <FearMask />
    </svg>
  );
}
