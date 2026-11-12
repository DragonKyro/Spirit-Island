import { INK, Inked, spiralPath, useUid } from '../../art/shared';

const BODY =
  'M20 6.4 C27.6 6.4 32 12.4 32 19.4 C32 24 33.6 27 33.1 31 C32.7 34.2 30.6 36.2 29.7 33.4 C29.1 31.6 27.5 31.8 26.8 33.7 C25.8 37.8 23.1 38.6 22.6 34.4 C22.2 32.6 19.6 32.4 18.6 34.4 C17.6 36.6 14.9 36.2 14.7 33.6 C14.5 31.8 12.6 31.6 11.6 33.2 C10.3 35.3 7.1 34.6 7.1 31 C7.1 27 8 24 8 19.4 C8 12.4 12.4 6.4 20 6.4 Z';
const EYES =
  'M11.6 20.6 C11.6 17.6 13.4 16.8 15.6 17 C18 17.2 19 19 18.6 21.2 C18.2 23.6 16.4 24.8 14.4 24.4 C12.6 24 11.6 22.6 11.6 20.6 Z M28.4 20.6 C28.4 17.6 26.6 16.8 24.4 17 C22 17.2 21 19 21.4 21.2 C21.8 23.6 23.6 24.8 25.6 24.4 C27.4 24 28.4 22.6 28.4 20.6 Z';

/** Blight: a dripping, skull-faced stain of grey-purple corruption crowned with a swirl. */
export default function Blight({ size = 26 }: { size?: number }) {
  const id = useUid('blight');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Blight">
      <defs>
        <radialGradient id={`${id}-b`} cx="0.42" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#9a88aa" />
          <stop offset="0.5" stopColor="#5a4868" />
          <stop offset="1" stopColor="#2a1f33" />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="36.6" rx="13" ry="2.2" fill="#000" opacity="0.3" />
      <Inked parts={[{ d: BODY, fill: `url(#${id}-b)` }]} ink="#140c18" />
      <path d={spiralPath(20, 13.6, 4.6, 2, Math.PI)} fill="none" stroke="#d2c2df" strokeWidth="1.3" strokeLinecap="round" />
      <path d={EYES} fill="#120914" />
      <circle cx="15.4" cy="21" r="1.1" fill="#d7a8f5" />
      <circle cx="24.6" cy="21" r="1.1" fill="#d7a8f5" />
      <path d="M19 25.4 H21 L20 27.6 Z" fill={INK} />
      <path d="M15.4 26 V30.6 M24.6 26 V31.4 M20 29 V33" stroke="#1a101e" strokeWidth="1.1" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}
