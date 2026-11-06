import { INK, SERIF, roman, useUid } from './shared';
import { TerrainBadge } from './TerrainIcon';
import { TERRAIN_BASE_COLORS, TERRAIN_PATTERN_IDS, type TerrainKind } from './terrainColors';

const GOLD = '#d4ac5c';
const isTerrain = (t: string): t is TerrainKind => t in TERRAIN_BASE_COLORS;
const title = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/** Fills the 52×60 art window with a terrain (base colour + half-scale pattern). */
function TerrainFill({ terrain }: { terrain: TerrainKind }) {
  return (
    <>
      <rect x="4" y="4" width="52" height="60" fill={TERRAIN_BASE_COLORS[terrain]} />
      <g transform="scale(0.5)">
        <rect x="8" y="8" width="104" height="120" fill={`url(#${TERRAIN_PATTERN_IDS[terrain]})`} />
      </g>
    </>
  );
}

function Badge({ terrain, cx, cy, s }: { terrain: TerrainKind; cx: number; cy: number; s: number }) {
  return (
    <g transform={`translate(${cx - 20 * s} ${cy - 20 * s}) scale(${s})`}>
      <TerrainBadge terrain={terrain} />
    </g>
  );
}

const SHORE = 'C22 16 32 26 25 38 C19 48 26 56 22 64';

function CoastalArt() {
  return (
    <>
      <TerrainFill terrain="JUNGLE" />
      <path d={`M4 4 H33 C27 16 37 26 30 38 C24 48 31 56 27 64 H4 Z`} fill="#dcbc7a" />
      <path d={`M4 4 H28 ${SHORE} H4 Z`} fill={TERRAIN_BASE_COLORS.OCEAN} />
      <g transform="scale(0.5)">
        <path d="M8 8 H56 C44 32 64 52 50 76 C38 96 52 112 44 128 H8 Z" fill={`url(#${TERRAIN_PATTERN_IDS.OCEAN})`} />
      </g>
      <path d={`M28 4 ${SHORE}`} fill="none" stroke="#eaf7ff" strokeWidth="1.6" strokeDasharray="5 2" strokeLinecap="round" />
      <Badge terrain="OCEAN" cx={30} cy={34} s={0.75} />
    </>
  );
}

/**
 * Invader card face: terrain art (diagonal split for two terrains, ocean-and-shore for
 * terrains=['COASTAL']), stage numeral, optional escalation flag. revealed=false = card back.
 */
export default function InvaderCardArt({
  terrains,
  stage,
  width = 60,
  revealed = true,
  escalation = false,
}: {
  terrains: string[];
  stage: 1 | 2 | 3;
  width?: number;
  revealed?: boolean;
  escalation?: boolean;
}) {
  const id = useUid('ic');
  const height = +(width * 1.4).toFixed(1);
  const known = terrains.filter(isTerrain);
  const coastal = terrains.includes('COASTAL');
  const label = terrains.map(title).join(' & ');
  const fs = Math.min(7, 50 / Math.max(1, label.length * 0.6));
  const name = revealed ? `Invader card: ${label}, stage ${stage}` : `Invader card back, stage ${stage}`;

  if (!revealed) {
    return (
      <svg width={width} height={height} viewBox="0 0 60 84" role="img" aria-label={name}>
        <defs>
          <radialGradient id={`${id}-bk`} cx="0.5" cy="0.45" r="0.7">
            <stop offset="0" stopColor="#7a4426" />
            <stop offset="1" stopColor="#2a150c" />
          </radialGradient>
        </defs>
        <rect x="0.6" y="0.6" width="58.8" height="82.8" rx="4" fill={`url(#${id}-bk)`} stroke={INK} strokeWidth="1.2" />
        <rect x="3.6" y="3.6" width="52.8" height="76.8" rx="2.4" fill="none" stroke={GOLD} strokeWidth="0.8" />
        <g stroke={GOLD} strokeWidth="1" opacity="0.7">
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1={30 + Math.cos(a) * 17} y1={38 + Math.sin(a) * 17} x2={30 + Math.cos(a) * (i % 2 ? 21 : 25)} y2={38 + Math.sin(a) * (i % 2 ? 21 : 25)} />;
          })}
        </g>
        <circle cx="30" cy="38" r="15" fill="#3a2014" stroke={GOLD} strokeWidth="1.4" />
        <circle cx="30" cy="38" r="12.6" fill="none" stroke={GOLD} strokeWidth="0.5" opacity="0.7" />
        <text x="30" y="43.4" textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize={stage === 3 ? 13 : 15} fill="#f2d99c">
          {roman(stage)}
        </text>
        <text x="30" y="73" textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize="5.6" letterSpacing="1" fill={GOLD}>
          INVADERS
        </text>
      </svg>
    );
  }

  return (
    <svg width={width} height={height} viewBox="0 0 60 84" role="img" aria-label={name}>
      <defs>
        <linearGradient id={`${id}-p`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#f6ebcf" />
          <stop offset="1" stopColor="#d6bf8e" />
        </linearGradient>
        <clipPath id={`${id}-w`}>
          <rect x="4" y="4" width="52" height="60" rx="2" />
        </clipPath>
        <clipPath id={`${id}-a`}>
          <path d="M4 4 H56 L4 64 Z" />
        </clipPath>
        <clipPath id={`${id}-b`}>
          <path d="M56 4 V64 H4 Z" />
        </clipPath>
      </defs>
      <rect x="0.6" y="0.6" width="58.8" height="82.8" rx="4" fill={`url(#${id}-p)`} stroke={INK} strokeWidth="1.2" />
      <g clipPath={`url(#${id}-w)`}>
        {coastal ? (
          <CoastalArt />
        ) : known.length >= 2 ? (
          <>
            <g clipPath={`url(#${id}-a)`}>
              <TerrainFill terrain={known[0]} />
            </g>
            <g clipPath={`url(#${id}-b)`}>
              <TerrainFill terrain={known[1]} />
            </g>
            <path d="M56 4 L4 64" stroke={INK} strokeWidth="2.6" />
            <path d="M56 4 L4 64" stroke="#f6ebcf" strokeWidth="1.1" />
            <Badge terrain={known[0]} cx={18.5} cy={21} s={0.6} />
            <Badge terrain={known[1]} cx={41.5} cy={47} s={0.6} />
          </>
        ) : known.length === 1 ? (
          <>
            <TerrainFill terrain={known[0]} />
            <Badge terrain={known[0]} cx={30} cy={36} s={0.85} />
          </>
        ) : (
          <rect x="4" y="4" width="52" height="60" fill="#8a7a62" />
        )}
      </g>
      <rect x="4" y="4" width="52" height="60" rx="2" fill="none" stroke={INK} strokeWidth="1.2" />
      <circle cx="11" cy="11" r="5.6" fill={INK} stroke={GOLD} strokeWidth="0.9" />
      <text x="11" y="13.1" textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize={stage === 3 ? 5 : 6} fill="#f6e3b0">
        {roman(stage)}
      </text>
      {escalation && (
        <g>
          <circle cx="49" cy="11" r="5.6" fill="#f6ebcf" stroke={INK} strokeWidth="0.9" />
          <path d="M46.8 15.4 V6.6" stroke={INK} strokeWidth="1" strokeLinecap="round" />
          <path d="M47.2 6.8 L52.6 8.8 L47.2 11 Z" fill="#c8352a" stroke={INK} strokeWidth="0.6" strokeLinejoin="round" />
        </g>
      )}
      <text x="30" y={72.6 + fs * 0.35} textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize={+fs.toFixed(2)} fill={INK}>
        {label}
      </text>
    </svg>
  );
}
