// Presence disk drawing shared by the Presence sprite and SacredSiteIcon (40×40 user space).
import { INK, Inked, spiralPath, useUid } from './shared';

interface DiskProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  h: number;
  color: string;
}

/** One oblique disk with an engraved spiral on its face. (cx, cy) = centre of the top face. */
export function PresenceDisk({ cx, cy, rx, ry, h, color }: DiskProps) {
  const id = useUid('pd');
  const L = cx - rx;
  const R = cx + rx;
  const sil = `M${L} ${cy} A${rx} ${ry} 0 0 1 ${R} ${cy} L${R} ${cy + h} A${rx} ${ry} 0 0 1 ${L} ${cy + h} Z`;
  const rim = `M${L} ${cy} L${L} ${cy + h} A${rx} ${ry} 0 0 0 ${R} ${cy + h} L${R} ${cy} A${rx} ${ry} 0 0 1 ${L} ${cy} Z`;
  const spiral = spiralPath(0, 0, rx * 0.74, 2.25, -Math.PI / 2);
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-hl`} cx="0.36" cy="0.28" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path d={sil} fill={INK} stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
      <path d={rim} fill={color} />
      <path d={rim} fill={`url(#${id}-rim)`} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id}-hl)`} />
      <g transform={`translate(${cx} ${cy}) scale(1 ${(ry / rx).toFixed(3)})`} fill="none" strokeLinecap="round">
        <path d={spiral} stroke="#fff" strokeOpacity="0.45" strokeWidth={rx * 0.07} transform={`translate(0 ${rx * 0.07})`} />
        <path d={spiral} stroke="#000" strokeOpacity="0.5" strokeWidth={rx * 0.11} />
      </g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="0.8" />
    </g>
  );
}

const RAYS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const p = (ang: number, rx: number, ry: number) =>
    `${(20 + Math.cos(ang) * rx).toFixed(2)} ${(26.4 + Math.sin(ang) * ry).toFixed(2)}`;
  const tip = i % 2 ? 15.6 : 19.6;
  return `M${p(a - 0.3, 8, 5)} L${p(a, tip, tip * 0.6)} L${p(a + 0.3, 8, 5)} Z`;
}).join(' ');

/** Full presence piece in a 40×40 box; `sacred` = stacked disks over a radiant burst. */
export function PresenceArt({ color, sacred = false }: { color: string; sacred?: boolean }) {
  const id = useUid('pa');
  if (!sacred) {
    return (
      <g>
        <ellipse cx="20" cy="31.5" rx="15.5" ry="4" fill="#000" opacity="0.3" />
        <PresenceDisk cx={20} cy={16} rx={15} ry={9.5} h={6.5} color={color} />
      </g>
    );
  }
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-g`}>
          <stop offset="0.3" stopColor={color} stopOpacity="0.75" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="23" rx="20" ry="17" fill={`url(#${id}-g)`} />
      <Inked parts={[{ d: RAYS, fill: color }]} w={2.2} />
      <path d={RAYS} fill="#000" opacity="0.3" />
      <PresenceDisk cx={20} cy={24.4} rx={11} ry={6.8} h={4.4} color={color} />
      <PresenceDisk cx={20} cy={15.4} rx={11} ry={6.8} h={4.4} color={color} />
    </g>
  );
}
