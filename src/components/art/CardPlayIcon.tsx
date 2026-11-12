import { INK, Num, roundRect, spiralPath, useUid } from './shared';

const CARD = roundRect(11.5, 7, 17, 25, 2.6);

/** Card plays: a fanned pair of power cards; shows `value` on the front card when given. */
export default function CardPlayIcon({ size = 24, value }: { size?: number; value?: number }) {
  const id = useUid('cp');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={value === undefined ? 'Card Plays' : `${value} Card Plays`}>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fbf2da" />
          <stop offset="1" stopColor="#d9c08e" />
        </linearGradient>
      </defs>
      <g transform="rotate(-15 20 34)">
        <path d={CARD} fill="#7a5a8a" stroke={INK} strokeWidth="2.2" />
        <path d={roundRect(13.5, 9, 13, 21, 1.4)} fill="none" stroke="#c7a8d6" strokeWidth="0.8" />
      </g>
      <g transform="rotate(9 20 34) translate(1.5 0.5)">
        <path d={CARD} fill={`url(#${id}-f)`} stroke={INK} strokeWidth="2.2" />
        <path d={roundRect(13.5, 9, 13, 21, 1.4)} fill="none" stroke="#9a7a46" strokeWidth="0.8" />
        {value === undefined ? (
          <path d={spiralPath(20, 19.5, 5.5, 2.2)} fill="none" stroke="#6a4a26" strokeWidth="1.4" strokeLinecap="round" />
        ) : (
          <Num value={value} y={19.5} fs={String(value).length > 1 ? 12 : 15} fill="#3a2406" />
        )}
      </g>
    </svg>
  );
}
