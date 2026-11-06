import type { ReactElement } from 'react';
import { INK, Inked, circlePath, ellipsePath, useUid } from './shared';

export type ElementKind = 'SUN' | 'MOON' | 'FIRE' | 'AIR' | 'WATER' | 'EARTH' | 'PLANT' | 'ANIMAL';

/** [badge light, badge dark, glyph fill, glyph ink] */
const TONES: Record<ElementKind, [string, string, string, string]> = {
  SUN: ['#ffe27a', '#d08a12', '#fff7d0', '#8a4e06'],
  MOON: ['#a7acd8', '#3a3e70', '#f4f2ff', '#22254a'],
  FIRE: ['#ff8a4a', '#9a1e0e', '#ffd04a', '#560c04'],
  AIR: ['#ece6fb', '#9a8cc8', '#ffffff', '#4e4282'],
  WATER: ['#7cc4f4', '#1b5aa6', '#e8f7ff', '#0b3468'],
  EARTH: ['#c9a87c', '#5e4026', '#e2d0ae', '#36220f'],
  PLANT: ['#9ed86a', '#2c6a20', '#e2f8b8', '#173d0e'],
  ANIMAL: ['#e0805a', '#7a2414', '#fbe2c8', '#4a1408'],
};

const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const p = (ang: number, r: number) => `${(20 + Math.cos(ang) * r).toFixed(2)} ${(20 + Math.sin(ang) * r).toFixed(2)}`;
  return `M${p(a - 0.3, 7.4)} L${p(a, 13.6)} L${p(a + 0.3, 7.4)} Z`;
}).join(' ');

function glyph(el: ElementKind, fill: string, ink: string): ReactElement {
  switch (el) {
    case 'SUN':
      return (
        <>
          <Inked parts={[{ d: SUN_RAYS, fill }, { d: circlePath(20, 20, 6.4), fill }]} w={2} ink={ink} />
          <circle cx="20" cy="20" r="3.6" fill="#ffd34a" />
        </>
      );
    case 'MOON':
      return (
        <g transform="rotate(-24 20 20)">
          <Inked parts={[{ d: 'M24 8.6 A11.6 11.6 0 1 0 24 31.4 A12.6 12.6 0 0 1 24 8.6 Z', fill }]} w={2} ink={ink} />
          <path d="M14 13 A9 9 0 0 0 14.4 27.4" fill="none" stroke="#c9c6ea" strokeWidth="1.2" />
        </g>
      );
    case 'FIRE':
      return (
        <>
          <Inked parts={[{ d: 'M20 5.6 C22 11.6 28.4 14 28.4 22.4 C28.4 28.4 24.6 32.6 20 32.6 C15.4 32.6 11.6 28.4 11.6 22.8 C11.6 18.6 14.2 16.6 15.4 12.8 C17 16 17.6 17 18.6 17.6 C18.6 13.2 19 9.4 20 5.6 Z', fill }]} w={2} ink={ink} />
          <path d="M20 18.2 C21.6 21.4 24.2 23 24.2 26.4 C24.2 29 22.3 30.6 20 30.6 C17.7 30.6 15.8 29 15.8 26.4 C15.8 23.6 18.4 22 20 18.2 Z" fill="#fff4c0" />
        </>
      );
    case 'AIR':
      return (
        <Inked
          parts={[
            { d: 'M7.6 15.4 H22.4 C26.6 15.4 27.4 10.4 24.4 9.4 C22 8.6 20.2 10.8 21.6 12.4', stroke: fill, sw: 2.4 },
            { d: 'M5.8 21.4 H28.4 C32.6 21.4 34.2 25.8 31.2 28 C28.8 29.8 25.8 27.6 27.6 25.4', stroke: fill, sw: 2.4 },
            { d: 'M9.6 27.4 H18.2 C21.2 27.4 21.8 31.4 19.2 32', stroke: fill, sw: 2.4 },
          ]}
          w={2}
          ink={ink}
        />
      );
    case 'WATER':
      return (
        <>
          <Inked parts={[{ d: 'M20 5.4 C24.2 12.6 29.4 17.6 29.4 23.6 C29.4 28.8 25.2 33 20 33 C14.8 33 10.6 28.8 10.6 23.6 C10.6 17.6 15.8 12.6 20 5.4 Z', fill }]} w={2} ink={ink} />
          <path d="M14.8 23.4 C14.8 26.6 16.6 29 19.4 29.6" fill="none" stroke="#5aa6e6" strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case 'EARTH':
      return (
        <>
          <Inked parts={[{ d: 'M4.8 30.4 L13.6 15 L18.2 21 L24.2 9.6 L35.2 30.4 Z', fill }]} w={2} ink={ink} />
          <path d="M24.2 9.6 L35.2 30.4 H28 L25.6 21.6 Z M13.6 15 L18.2 21 L16.4 30.4 H12.8 L15 21 Z" fill="#000" opacity="0.28" />
          <path d="M8.6 26 H18 M21.4 24.6 H30" stroke={ink} strokeWidth="0.9" opacity="0.6" />
        </>
      );
    case 'PLANT':
      return (
        <>
          <Inked parts={[{ d: 'M8.6 31.4 C8.4 18.4 16.4 8.8 31.6 8.4 C31.6 22.6 23 31.4 8.6 31.4 Z', fill }]} w={2} ink={ink} />
          <path d="M8.6 31.4 C15.6 24.4 21.6 17.6 27.4 12.4 M14.4 25 L13.8 19.4 M14.4 25 L20.2 25.4 M19.6 19.8 L19.4 14.8 M19.6 19.8 L24.8 20.2" fill="none" stroke={ink} strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
        </>
      );
    case 'ANIMAL':
      return (
        <Inked
          parts={[
            { d: 'M12.6 28 C12.6 23.2 16.4 20.4 20 20.4 C23.6 20.4 27.4 23.2 27.4 28 C27.4 31.6 24.2 32.2 20 31 C15.8 32.2 12.6 31.6 12.6 28 Z', fill },
            { d: ellipsePath(10.8, 18.4, 2.8, 3.6), fill, transform: 'rotate(-28 10.8 18.4)' },
            { d: ellipsePath(16.2, 12.8, 2.9, 3.8), fill, transform: 'rotate(-9 16.2 12.8)' },
            { d: ellipsePath(23.8, 12.8, 2.9, 3.8), fill, transform: 'rotate(9 23.8 12.8)' },
            { d: ellipsePath(29.2, 18.4, 2.8, 3.6), fill, transform: 'rotate(28 29.2 18.4)' },
          ]}
          w={2}
          ink={ink}
        />
      );
  }
}

/** One of the eight elements as a coloured badge with its emblem. */
export default function ElementIcon({ size = 24, element }: { size?: number; element: ElementKind }) {
  const id = useUid('el');
  const [light, dark, fill, ink] = TONES[element];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={element.charAt(0) + element.slice(1).toLowerCase()}>
      <defs>
        <radialGradient id={`${id}-b`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18.4" fill={INK} />
      <circle cx="20" cy="20" r="17" fill={`url(#${id}-b)`} />
      <circle cx="20" cy="20" r="15.6" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.8" />
      {glyph(element, fill, ink)}
    </svg>
  );
}
