import { Inked, roundRect, useUid } from './shared';

/** Reclaim: an open hand inside a circling return arrow. */
export default function ReclaimIcon({ size = 24 }: { size?: number }) {
  const id = useUid('rc');
  const skin = `url(#${id}-s)`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Reclaim">
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8e2bf" />
          <stop offset="1" stopColor="#d4a874" />
        </linearGradient>
      </defs>
      <Inked
        parts={[
          { d: 'M33.6 25.4 A15 15 0 1 0 8.4 27.6', stroke: '#e8b23a', sw: 3.2 },
          { d: 'M3.6 24.4 L8.6 32.4 L13 24 Z', fill: '#e8b23a' },
        ]}
      />
      <Inked
        parts={[
          { d: roundRect(13.4, 12.4, 3.2, 12, 1.6), fill: skin },
          { d: roundRect(16.8, 9.6, 3.2, 14, 1.6), fill: skin },
          { d: roundRect(20.2, 10.2, 3.2, 14, 1.6), fill: skin },
          { d: roundRect(23.6, 13, 3, 12, 1.5), fill: skin },
          { d: 'M14.4 28 C11.4 26.4 9.4 23.2 9.2 21 C9 19.4 10.6 18.8 11.6 19.8 L15.4 23.4 Z', fill: skin },
          { d: roundRect(13.4, 19.6, 13.2, 13.4, 4.4), fill: skin },
        ]}
      />
      <path d="M16.6 13.8 V20.4 M20 12.6 V20.4 M23.4 14.6 V20.4" stroke="#b07a48" strokeWidth="0.7" />
      <path d="M16 27 Q20 29.4 24.4 27" stroke="#b07a48" strokeWidth="0.8" fill="none" />
    </svg>
  );
}
