import type { ReactElement } from 'react';
import { INK, Inked, circlePath, ellipsePath, mirrorPath, spiralPath, useUid, type Part } from './shared';
import { SPIRIT_COLORS, type SpiritKey } from './spiritColors';

type U = (name: string) => string;
type Stops = [number, string, number?][];

const Lin = ({ id, stops, x2 = 0, y2 = 1 }: { id: string; stops: Stops; x2?: number; y2?: number }) => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
    {stops.map(([o, c, op], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={op ?? 1} />)}
  </linearGradient>
);
const Rad = ({ id, stops, cx = 0.5, cy = 0.5, r = 0.5 }: { id: string; stops: Stops; cx?: number; cy?: number; r?: number }) => (
  <radialGradient id={id} cx={cx} cy={cy} r={r}>
    {stops.map(([o, c, op], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={op ?? 1} />)}
  </radialGradient>
);
const url = (id: string) => `url(#${id})`;
const star = (x: number, y: number, s: number) => `M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`;
const petals = (x: number, y: number, r: number): Part[] =>
  [0, 72, 144, 216, 288].map((a) => ({ d: ellipsePath(x, y - r, r * 0.55, r * 0.9), fill: '#f7a6c8', transform: `rotate(${a} ${x} ${y})` }));

// ---- Lightning's Swift Strike: a thunderbird of crackling lightning --------------------------
const THUNDERBIRD = mirrorPath(
  [
    [50, 20], [46.6, 22.6], [45, 28], [40, 30.4], [33, 24], [26, 27.4], [17, 19.6], [12, 26.4], [21, 31],
    [9, 35], [22, 37.4], [14.6, 43.6], [30, 41.6], [26.6, 49.6], [39, 44.4], [42, 52], [37, 67], [44.4, 61.4], [50, 77],
  ],
  50,
);
function Lightning(u: U) {
  return (
    <>
      <defs>
        <Rad id={u('bg')} cy={0.4} r={0.7} stops={[[0, '#4d5294'], [1, '#15163a']]} />
        <Rad id={u('gl')} stops={[[0, '#fff6a8', 0.85], [1, '#ffd84a', 0]]} />
        <Lin id={u('b')} stops={[[0, '#fffbe0'], [0.5, '#ffd83a'], [1, '#e8960e']]} />
      </defs>
      <rect width="100" height="100" fill={url(u('bg'))} />
      <g fill="#2a2b5a">
        <circle cx="18" cy="12" r="14" />
        <circle cx="42" cy="5" r="14" />
        <circle cx="68" cy="7" r="15" />
        <circle cx="88" cy="16" r="12" />
      </g>
      <circle cx="50" cy="46" r="36" fill={url(u('gl'))} />
      <path d="M17 44 L11 56 L17.4 57 L9 76 M83 44 L89 56 L82.6 57 L91 76 M30 66 L27 74 L31 75 L28 84" stroke="#fff6b0" strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Inked parts={[{ d: THUNDERBIRD, fill: url(u('b')) }]} w={3} />
      <path d="M50 34 L46.4 45 L52 45 L48.4 58" stroke="#fffdf0" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      <path d="M48.3 27.4 L50 32.4 L51.7 27.4 Z" fill="#e07a10" stroke={INK} strokeWidth="0.8" strokeLinejoin="round" />
      <circle cx="47.4" cy="25.4" r="1.1" fill={INK} />
      <circle cx="52.6" cy="25.4" r="1.1" fill={INK} />
    </>
  );
}

// ---- River Surges in Sunlight: a sunlit river winding toward the viewer ----------------------
const RIVER = 'M47.6 48 C44 52 36 56 34 62 C32 69 40 73 44 79 C48 85 40 92 26 100 H74 C72 92 73 84 67 76 C61 70 54 68 56 62 C57.4 57 57 52 52.4 48 Z';
function River(u: U) {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const p = (ang: number, r: number) => `${(50 + Math.cos(ang) * r).toFixed(1)} ${(30 + Math.sin(ang) * r).toFixed(1)}`;
    return `M${p(a - 0.12, 13)} L${p(a, 25)} L${p(a + 0.12, 13)} Z`;
  }).join(' ');
  return (
    <>
      <defs>
        <Lin id={u('sky')} stops={[[0, '#ffe7a0'], [0.5, '#f4ae4a']]} />
        <Rad id={u('sun')} stops={[[0.3, '#fffbe6'], [1, '#ffe9a0', 0]]} />
        <Lin id={u('w')} stops={[[0, '#a8e0fa'], [0.4, '#4fa6e8'], [1, '#1d5fae']]} />
      </defs>
      <rect width="100" height="100" fill={url(u('sky'))} />
      <circle cx="50" cy="30" r="26" fill={url(u('sun'))} />
      <path d={rays} fill="#fff6d0" opacity="0.8" />
      <circle cx="50" cy="30" r="10.5" fill="#fff8dc" stroke="#e0902a" strokeWidth="1.4" />
      <path d="M0 50 C14 44 30 47 44 48 C58 49 72 44 100 48 V100 H0 Z" fill="#7db35a" stroke={INK} strokeWidth="1.2" />
      <path d="M0 68 C16 62 28 66 38 70 L34 100 H0 Z M100 64 C84 60 72 66 64 72 L72 100 H100 Z" fill="#4c8a38" />
      <path d={RIVER} fill={url(u('w'))} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M40 61 h6 M49 72 h6 M44 86 h9 M56 93 h7 M48.4 52 h3" stroke="#fff3a0" strokeWidth="1.5" strokeLinecap="round" />
    </>
  );
}

// ---- Vital Strength of the Earth: a stone giant with a glowing heart -------------------------
const GIANT = 'M4 100 V80 L19 56 L30 50 L38 33 L50 22 L62 33 L70 50 L81 56 L96 80 V100 Z';
const HEART = 'M50 78 C39 70 39 61 44.4 60 C47.6 59.4 50 62 50 64.4 C50 62 52.4 59.4 55.6 60 C61 61 61 70 50 78 Z';
function Earth(u: U) {
  return (
    <>
      <defs>
        <Rad id={u('bg')} cy={0.25} r={0.8} stops={[[0, '#f0c886'], [1, '#7a4a26']]} />
        <Lin id={u('s')} x2={0.3} stops={[[0, '#b8987a'], [1, '#5a4230']]} />
        <Rad id={u('gl')} stops={[[0, '#ffd56a', 0.9], [1, '#ff9a2a', 0]]} />
      </defs>
      <rect width="100" height="100" fill={url(u('bg'))} />
      <Inked parts={[{ d: GIANT, fill: url(u('s')) }]} w={3} />
      <path d="M50 22 L38 33 L30 50 L42 53 L46 37 Z M19 56 L30 50 L34 64 L22 70 Z" fill="#e0c29a" opacity="0.5" />
      <path d="M50 22 L62 33 L70 50 L81 56 L96 80 V100 H74 L66 60 L56 40 Z" fill="#000" opacity="0.22" />
      <path d="M35 46 Q42 41 48 45.6 M52 45.6 Q58 41 65 46" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <ellipse cx="42" cy="49.6" rx="3.6" ry="1.9" fill="#ffd96a" stroke={INK} strokeWidth="0.8" />
      <ellipse cx="58" cy="49.6" rx="3.6" ry="1.9" fill="#ffd96a" stroke={INK} strokeWidth="0.8" />
      <circle cx="50" cy="68" r="17" fill={url(u('gl'))} />
      <path d="M50 78 L47.6 86 L51 94 L49 100 M42 66 L33 70 L27 79 L20 82 M58 66 L67 71 L73 80 L80 83" stroke="#ffcf6a" strokeWidth="1.4" fill="none" strokeLinejoin="round" opacity="0.85" />
      <path d={HEART} fill="#ffb42a" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M44.6 63 Q46 61.4 47.8 62.6" stroke="#fff3c4" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </>
  );
}

// ---- Shadows Flicker Like Flame: a violet shadow-flame with burning eyes ----------------------
const FLAME =
  'M50 11 C54 22 63 25 65 35 C67 30 66 26 64 20 C73 29 78 44 74 57 C71 68 63 77 50 81 C37 77 29 68 26 57 C22 44 28 31 36 25 C36 31 38 34 41 36 C40 27 44 19 50 11 Z';
function Shadows(u: U) {
  return (
    <>
      <defs>
        <Rad id={u('bg')} cy={0.55} r={0.7} stops={[[0, '#3f235c'], [1, '#0b0612']]} />
        <Lin id={u('f')} stops={[[0, '#ecd4ff'], [0.45, '#8f4ee0'], [1, '#3a1670']]} />
        <Rad id={u('e')} stops={[[0, '#fff2a0', 0.8], [1, '#ffcf40', 0]]} />
      </defs>
      <rect width="100" height="100" fill={url(u('bg'))} />
      <path d="M20 44 C13 36 18 26 25 29 M80 44 C87 36 82 26 75 29 M30 86 C24 82 24 76 29 75" stroke="#a274e8" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7" />
      <Inked parts={[{ d: FLAME, fill: url(u('f')) }]} w={3} />
      <path d="M50 35 C54 43 61 47 61 57 C61 66 56 72 50 72 C44 72 39 66 39 57 C39 48 46 43 50 35 Z" fill="#1c0a34" opacity="0.85" />
      <ellipse cx="50" cy="56" rx="20" ry="9" fill={url(u('e'))} />
      <g transform="translate(50 56) scale(1.35) translate(-50 -56)">
        <path d="M37.4 56.4 Q43 50.6 48.4 56 Q43 59 37.4 56.4 Z M62.6 56.4 Q57 50.6 51.6 56 Q57 59 62.6 56.4 Z" fill="#fff4b8" />
        <ellipse cx="43.2" cy="55.6" rx="0.9" ry="2.2" fill="#3a1a00" />
        <ellipse cx="56.8" cy="55.6" rx="0.9" ry="2.2" fill="#3a1a00" />
      </g>
      <circle cx="24" cy="62" r="1.2" fill="#c79bff" />
      <circle cx="77" cy="66" r="1" fill="#c79bff" />
      <circle cx="70" cy="18" r="0.9" fill="#c79bff" />
    </>
  );
}

// ---- Thunderspeaker: a storm drum beneath thunder, over the Dahan villages --------------------
const hut = (x: number, y: number, s: number) =>
  `M${x - 9 * s} ${y} C${x - 9 * s} ${y - 8 * s} ${x - 4 * s} ${y - 11 * s} ${x} ${y - 11 * s} C${x + 4 * s} ${y - 11 * s} ${x + 9 * s} ${y - 8 * s} ${x + 9 * s} ${y} Z`;
function Thunderspeaker(u: U) {
  const cloud: Part[] = [
    [24, 26, 12], [42, 18, 14], [61, 19, 13], [78, 27, 10], [14, 34, 8], [50, 30, 11], [70, 34, 9], [33, 35, 8],
  ].map(([x, y, r]) => ({ d: circlePath(x, y, r), fill: '#4a3a4c' }));
  return (
    <>
      <defs>
        <Lin id={u('bg')} stops={[[0, '#ffc063'], [1, '#b8461a']]} />
        <Lin id={u('d')} x2={1} y2={0} stops={[[0, '#6a3214'], [0.4, '#b0622e'], [1, '#5a280e']]} />
      </defs>
      <rect width="100" height="100" fill={url(u('bg'))} />
      <Inked parts={cloud} w={2.6} />
      <path d="M16 30 C22 22 30 22 34 26 M38 16 C44 10 52 12 54 16 M64 14 C70 12 76 16 78 22" stroke="#7a6678" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M30 40 L25 50 L29 51 L24 60 M74 40 L78 48 L75 49 L79 56" stroke="#fff3a0" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
      <Inked parts={[{ d: 'M54 33 L43 52 L51 52 L43 71 L65 45 L55.6 45 L61.6 33 Z', fill: '#ffe95a' }]} w={2.6} />
      <path d="M0 82 C25 73 75 73 100 82 V100 H0 Z" fill="#5a2810" stroke={INK} strokeWidth="1.4" />
      <path d={`${hut(20, 80, 1)} ${hut(80, 80, 1)} ${hut(33, 79, 0.65)} ${hut(67, 79, 0.65)}`} fill="#2a140a" />
      <path d="M17.6 80 V75.4 Q20 73 22.4 75.4 V80 Z M77.6 80 V75.4 Q80 73 82.4 75.4 V80 Z" fill="#f0a050" />
      <Inked
        parts={[
          { d: 'M39.6 82 L42 95 H58 L60.4 82 Z', fill: url(u('d')) },
          { d: ellipsePath(50, 82, 10.4, 3.2), fill: '#f2dcae' },
        ]}
        w={2.4}
      />
      <path d="M41 84.6 L44.2 93 L47.4 84.8 L50.4 93.2 L53.4 84.8 L56.4 93 L59 84.6" stroke="#f2dcae" strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <path d="M38 75 Q35 77 34 80 M62 75 Q65 77 66 80 M40 72 Q36 73 33 76 M60 72 Q64 73 67 76" stroke="#fff3c0" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.8" />
    </>
  );
}

// ---- A Spread of Rampant Green: curling vines and flowers --------------------------------------
function Green(u: U) {
  const leaf = (x: number, y: number, a: number, s = 1): Part => ({
    d: `M${x} ${y} Q${x + 5 * s} ${y - 4 * s} ${x + 11 * s} ${y} Q${x + 5 * s} ${y + 4 * s} ${x} ${y} Z`,
    fill: '#7ccc52',
    transform: `rotate(${a} ${x} ${y})`,
  });
  return (
    <>
      <defs>
        <Rad id={u('bg')} r={0.7} stops={[[0, '#e2f5b4'], [1, '#3a7a2c']]} />
      </defs>
      <rect width="100" height="100" fill={url(u('bg'))} />
      <Inked
        w={2.4}
        parts={[
          { d: 'M6 92 C22 76 30 66 42 62', stroke: '#2a6a22', sw: 3.4 },
          { d: 'M94 12 C80 26 76 34 64 40', stroke: '#2a6a22', sw: 3.4 },
          { d: 'M90 88 C80 80 82 70 90 66 C95 64 98 70 94 72', stroke: '#2a6a22', sw: 2.6 },
          { d: 'M10 14 C20 22 18 32 10 34 C5 35 3 30 7 28', stroke: '#2a6a22', sw: 2.6 },
          { d: spiralPath(52, 51, 22, 2.1, 0.6), stroke: '#2f7a26', sw: 4.4 },
          leaf(30, 70, -40), leaf(20, 80, 30, 0.9), leaf(70, 32, 140), leaf(80, 22, 210, 0.9),
          leaf(74, 52, 70, 0.9), leaf(36, 40, 200, 0.9), leaf(60, 76, -20, 0.8), leaf(86, 72, 200, 0.8),
          ...petals(24, 28, 5.6), ...petals(76, 64, 5), ...petals(70, 14, 4.4), ...petals(36, 86, 4.4),
        ]}
      />
      {[[24, 28, 2.6], [76, 64, 2.4], [70, 14, 2], [36, 86, 2]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#ffd23a" stroke={INK} strokeWidth="0.8" />
      ))}
    </>
  );
}

// ---- Ocean's Hungry Grasp: a great wave with a toothed maw and a rising tentacle ------------------
const UPPER = 'M100 8 C74 2 44 10 28 28 C22 35 20 43 24 49 C26 43 30 40 36 40 C56 36 80 38 100 45 Z';
const LOWER = 'M100 100 H18 C24 86 34 76 48 72 C64 66 82 63 100 63 Z';
const TENTACLE = 'M2 100 C0 86 4 74 12 68 C18 63 18 58 14 58 C11 58 10 61 12 63 C8 63 7 57 11 54 C17 50 24 57 20 65 C15 74 10 86 12 100 Z';
function Ocean(u: U) {
  const upperTeeth = [44, 52, 60, 68, 76, 84, 92].map((x) => {
    const y = 39.2 + ((x - 36) / 64) * 5.6;
    return `M${x - 3} ${y.toFixed(1)} L${x} ${(y + 7).toFixed(1)} L${x + 3} ${(y + 0.4).toFixed(1)} Z`;
  });
  const lowerTeeth = [54, 62, 70, 78, 86, 94].map((x) => {
    const y = 71 - ((x - 48) / 52) * 8;
    return `M${x - 3} ${y.toFixed(1)} L${x} ${(y - 7).toFixed(1)} L${x + 3} ${(y - 0.4).toFixed(1)} Z`;
  });
  return (
    <>
      <defs>
        <Lin id={u('bg')} stops={[[0, '#2a8c8c'], [1, '#05262c']]} />
        <Lin id={u('w')} x2={0.4} stops={[[0, '#5cc9bf'], [0.5, '#1d8a88'], [1, '#0b4f58']]} />
      </defs>
      <rect width="100" height="100" fill={url(u('bg'))} />
      <path d="M24 49 C32 38 60 36 100 44 V66 C80 63 60 66 48 72 C38 66 30 58 24 49 Z" fill="#02161a" />
      <Inked parts={[{ d: upperTeeth.join(' '), fill: '#eefcf8' }, { d: lowerTeeth.join(' '), fill: '#eefcf8' }]} w={1.6} />
      <Inked parts={[{ d: TENTACLE, fill: '#2a8a70' }, { d: UPPER, fill: url(u('w')) }, { d: LOWER, fill: url(u('w')) }]} w={3} />
      {[[10, 80], [9, 90], [13, 71], [16, 62]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.3" fill="#bdf0dc" stroke={INK} strokeWidth="0.5" />
      ))}
      <path d="M100 12 C76 6 48 13 31 29 M31 29 C27 33 25 37 25 41 M28 31 C24 30 21 32 21 35 M26 36 C22 36 20 39 21 42" stroke="#effffb" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M58 22 C66 18 80 17 92 20 M56 84 C66 78 80 74 94 74" stroke="#9fe6dc" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M62 28 Q70 22 78 28 Q70 32 62 28 Z" fill="#eaffd0" stroke={INK} strokeWidth="1.2" />
      <ellipse cx="70" cy="27.6" rx="1.2" ry="2.6" fill={INK} />
    </>
  );
}

// ---- Bringer of Dreams and Nightmares: a dreaming moon with a heavy-lidded eye ------------------
function Bringer(u: U) {
  const stars: [number, number, number][] = [[18, 24, 2.6], [82, 20, 3], [86, 60, 2.2], [13, 62, 2], [32, 11, 1.8], [70, 88, 2], [24, 84, 2.4], [60, 9, 1.6]];
  return (
    <>
      <defs>
        <Rad id={u('bg')} cy={0.45} r={0.7} stops={[[0, '#5c48c4'], [1, '#120c38']]} />
        <Rad id={u('m')} cx={0.4} cy={0.35} r={0.7} stops={[[0, '#fbf8ff'], [1, '#ac9eea']]} />
        <Rad id={u('i')} stops={[[0, '#c2a8ff'], [0.6, '#6a44d8'], [1, '#2a1676']]} />
      </defs>
      <rect width="100" height="100" fill={url(u('bg'))} />
      <path d={stars.map(([x, y, s]) => star(x, y, s)).join(' ')} fill="#fff4d0" />
      <path d="M8 78 C22 66 34 86 50 77 C64 69 74 84 92 74 M16 90 C30 82 40 94 54 88 C64 84 72 92 84 88" stroke="#b9a2ff" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.75" />
      <Inked parts={[{ d: circlePath(50, 45, 26), fill: url(u('m')) }]} w={3} />
      <g fill="#b7a8ee" opacity="0.6">
        <circle cx="36" cy="32" r="3" />
        <circle cx="64" cy="62" r="3.6" />
        <circle cx="66" cy="30" r="2" />
        <circle cx="34" cy="60" r="2.2" />
      </g>
      <path d="M30 46 Q50 28 70 46 Q50 62 30 46 Z" fill="#fff" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="50" cy="46.4" r="8" fill={url(u('i'))} stroke={INK} strokeWidth="1" />
      <circle cx="50" cy="46.4" r="3.2" fill={INK} />
      <circle cx="52.4" cy="44.4" r="1.4" fill="#fff" />
      <path d="M29 45.4 Q50 26 71 45.4 Q50 37.4 29 45.4 Z" fill="#8f7ddc" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M33 50 l-3 3 M40 54 l-1.6 3.6 M50 55.6 v3.8 M60 54 l1.6 3.6 M67 50 l3 3" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
    </>
  );
}

const MOTIFS: Record<SpiritKey, (u: U) => ReactElement> = {
  lightning: Lightning,
  river: River,
  earth: Earth,
  shadows: Shadows,
  thunderspeaker: Thunderspeaker,
  green: Green,
  ocean: Ocean,
  bringer: Bringer,
};

const NAMES: Record<SpiritKey, string> = {
  lightning: "Lightning's Swift Strike",
  river: 'River Surges in Sunlight',
  earth: 'Vital Strength of the Earth',
  shadows: 'Shadows Flicker Like Flame',
  thunderspeaker: 'Thunderspeaker',
  green: 'A Spread of Rampant Green',
  ocean: "Ocean's Hungry Grasp",
  bringer: 'Bringer of Dreams and Nightmares',
};

/** Circular portrait emblem for a base-game spirit, ringed in its presence colour. */
export default function SpiritEmblem({ spirit, size = 64 }: { spirit: SpiritKey; size?: number }) {
  const id = useUid('se');
  const u: U = (n) => `${id}-${n}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={NAMES[spirit]}>
      <defs>
        <clipPath id={u('clip')}>
          <circle cx="50" cy="50" r="45" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="49" fill={INK} />
      <g clipPath={url(u('clip'))}>{MOTIFS[spirit](u)}</g>
      <circle cx="50" cy="50" r="45.6" fill="none" stroke={SPIRIT_COLORS[spirit]} strokeWidth="3.2" />
      <circle cx="50" cy="50" r="47.8" fill="none" stroke={INK} strokeWidth="1.2" />
      <circle cx="50" cy="50" r="43.8" fill="none" stroke={INK} strokeWidth="1" opacity="0.6" />
    </svg>
  );
}
