import { INK, Inked, Num, roman, useUid } from './shared';

const SHIELD = 'M8 6 H32 V23.6 C32 30 26.4 34.6 20 37.6 C13.6 34.6 8 30 8 23.6 Z';
const TONES: Record<1 | 2 | 3, [string, string]> = {
  1: ['#e8b048', '#8a5a12'],
  2: ['#e0672c', '#8a2a0e'],
  3: ['#c42a20', '#4e0a08'],
};

/** Terror level: a horned banner-shield bearing the level numeral; hotter colour per level. */
export default function TerrorLevelIcon({ size = 24, level }: { size?: number; level: 1 | 2 | 3 }) {
  const id = useUid('tl');
  const [hi, lo] = TONES[level];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`Terror Level ${level}`}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
      </defs>
      <Inked
        parts={[
          { d: 'M10.4 7 C6.6 6 4 3.6 3.6 0.8 C6.6 2.4 9.6 3.2 13.6 3.6 Z', fill: '#d9c7a2' },
          { d: 'M29.6 7 C33.4 6 36 3.6 36.4 0.8 C33.4 2.4 30.4 3.2 26.4 3.6 Z', fill: '#d9c7a2' },
          { d: SHIELD, fill: `url(#${id}-g)` },
        ]}
      />
      <path d={SHIELD} transform="translate(20 21) scale(0.78) translate(-20 -21)" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="1" />
      <Num value={roman(level)} y={19.6} fs={level === 3 ? 14 : 17} fill="#fff4dc" halo={INK} />
    </svg>
  );
}
