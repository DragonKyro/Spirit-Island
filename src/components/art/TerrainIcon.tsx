import { INK, Inked, circlePath, useUid } from './shared';
import { TERRAIN_BASE_COLORS, type TerrainKind } from './terrainColors';

const HEX = 'M20 2.4 L35.4 11.2 V28.8 L20 37.6 L4.6 28.8 V11.2 Z';
const LIGHT: Record<TerrainKind, string> = {
  JUNGLE: '#7cb85a',
  MOUNTAIN: '#b9afa2',
  SANDS: '#f2d595',
  WETLAND: '#86b9a6',
  OCEAN: '#4f8fc4',
};

/** The terrain motif alone, in a 40×40 user space. */
export function TerrainGlyph({ terrain }: { terrain: TerrainKind }) {
  switch (terrain) {
    case 'JUNGLE':
      return (
        <Inked
          w={2}
          parts={[
            { d: 'M13 22 V30 M27 22 V30 M20 26 V32', stroke: '#6a4524', sw: 2.2 },
            { d: circlePath(13, 19, 6), fill: '#2f6b28' },
            { d: circlePath(27, 18.4, 6.4), fill: '#2f6b28' },
            { d: circlePath(20, 13.4, 6.6), fill: '#3f8a32' },
            { d: circlePath(20, 23, 6.2), fill: '#4f9d3c' },
            { d: circlePath(18.2, 21, 2.2), fill: '#8fd060' },
          ]}
        />
      );
    case 'MOUNTAIN':
      return (
        <>
          <Inked w={2} parts={[{ d: 'M4.6 30 L15 13 L19.6 19.6 L25 10.4 L35.4 30 Z', fill: '#9a8f82' }]} />
          <path d="M25 10.4 L35.4 30 H28.4 L26 20 Z M15 13 L19.6 19.6 L17.6 30 H13.4 L16 20 Z" fill="#000" opacity="0.3" />
          <path d="M25 10.4 L28.2 16.4 L26.4 15.4 L25 17 L23.4 15.4 L21.8 16 Z M15 13 L17.6 16.8 L15.8 16.2 L14.6 17.4 L13.2 16 Z" fill="#f4f1ea" />
        </>
      );
    case 'SANDS':
      return (
        <>
          <circle cx="27" cy="12" r="4.4" fill="#fff3b8" stroke={INK} strokeWidth="1.6" />
          <Inked
            w={2}
            parts={[
              { d: 'M4.6 26 C10 18.4 17.6 18.6 23.4 24.4 C27.2 21.4 32 20.6 35.4 22.4 V31 H4.6 Z', fill: '#e9c27a' },
              { d: 'M4.6 30.6 C12.6 25.4 22.6 25.8 35.4 29.4 V32 H4.6 Z', fill: '#c4954c' },
            ]}
          />
          <path d="M9 24.6 C12.6 21.8 16.4 21.6 19.6 23.6" fill="none" stroke="#fff0c4" strokeWidth="1" />
        </>
      );
    case 'WETLAND':
      return (
        <>
          <Inked
            w={2}
            parts={[
              { d: 'M14 29 C14 22 13 17 11.4 12.6 M18.6 29 C18.6 21 19 15.4 20 10.4 M23.6 29 C23.6 23 25 18.6 27.4 15', stroke: '#2d5a38', sw: 1.6 },
              { d: 'M11.4 15.4 C10.2 12.4 10.6 9.6 11.2 8.4 C12.4 9.6 12.8 12.4 12.4 15.6 Z', fill: '#7a4e2a' },
              { d: 'M20 13.4 C19.2 10.4 19.6 7.4 20.4 6.2 C21.4 7.6 21.4 10.4 21 13.4 Z', fill: '#7a4e2a' },
            ]}
          />
          <path d="M6 30 Q10 28 14 30 T22 30 T30 30 T36 30 M9 34 Q13 32 17 34 T25 34 T32 34" fill="none" stroke="#d6f0ee" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
    case 'OCEAN':
      return (
        <Inked
          w={2}
          parts={[
            { d: 'M8 15.6 Q11.5 11.4 15 15.6 T22 15.6 T29 15.6 T32.4 14.4', stroke: '#e8f6ff', sw: 2 },
            { d: 'M7.4 22.6 Q11 18.4 14.6 22.6 T21.8 22.6 T29 22.6 T32.8 21.4', stroke: '#b9def6', sw: 2 },
            { d: 'M10 29.4 Q13.4 25.6 16.8 29.4 T23.6 29.4 T30 28.4', stroke: '#8cc4ea', sw: 1.8 },
          ]}
        />
      );
  }
}

/** Hex badge + motif in a 40×40 user space (used inside cards). */
export function TerrainBadge({ terrain }: { terrain: TerrainKind }) {
  const id = useUid('tb');
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-g`} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor={LIGHT[terrain]} />
          <stop offset="1" stopColor={TERRAIN_BASE_COLORS[terrain]} />
        </radialGradient>
      </defs>
      <path d={HEX} fill={`url(#${id}-g)`} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d={HEX} transform="translate(20 20) scale(0.86) translate(-20 -20)" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.9" />
      <TerrainGlyph terrain={terrain} />
    </g>
  );
}

/** Small terrain badge (as on invader cards). */
export default function TerrainIcon({ size = 24, terrain }: { size?: number; terrain: TerrainKind }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={terrain.charAt(0) + terrain.slice(1).toLowerCase()}>
      <TerrainBadge terrain={terrain} />
    </svg>
  );
}
