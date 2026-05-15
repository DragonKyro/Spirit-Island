import { Land } from '../../engine/land';
import { BOARD_LAYOUT, OCEAN_PATH, VIEWBOX } from '../../data/boardLayout';
import { Spirit } from '../../engine/spirit';
import LandShape from './LandShape';

interface Props {
  lands: Land[];
  spirits: Spirit[];
  selectedIndex?: number | null;
  onLandClick?: (index: number) => void;
}

export default function Map({ lands, spirits, selectedIndex, onLandClick }: Props) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      style={{ width: '100%', height: 'auto', display: 'block', background: 'transparent' }}
    >
      <defs>
        <radialGradient id="ocean-grad" cx="20%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#3a78a0" />
          <stop offset="100%" stopColor="#0a1f33" />
        </radialGradient>
        <linearGradient id="cliff-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2a221c" />
          <stop offset="100%" stopColor="#1a1410" />
        </linearGradient>
        <radialGradient id="land-vignette" cx="50%" cy="50%" r="55%">
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
        <pattern id="ocean-waves" x="0" y="0" width="60" height="20" patternUnits="userSpaceOnUse">
          <path d="M 0 10 Q 15 4 30 10 T 60 10" fill="none" stroke="rgba(180,210,230,0.18)" strokeWidth="0.9" />
          <path d="M 0 16 Q 15 10 30 16 T 60 16" fill="none" stroke="rgba(180,210,230,0.12)" strokeWidth="0.8" />
        </pattern>
      </defs>

      {/* Rocky cliff / "outside" background fills the whole viewBox */}
      <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#cliff-grad)" />

      {/* Ocean — fills just the actual sea area (upper-left), bounded by the coast */}
      <path d={OCEAN_PATH} fill="url(#ocean-grad)" />
      <path d={OCEAN_PATH} fill="url(#ocean-waves)" />

      {/* Lands */}
      {BOARD_LAYOUT.map((layout, i) => (
        <LandShape
          key={layout.index}
          layout={layout}
          land={lands[i]}
          spirits={spirits}
          selected={selectedIndex === i}
          onClick={onLandClick ? () => onLandClick(i) : undefined}
        />
      ))}

      {/* Compass — placed over the ocean */}
      <g transform="translate(40, 50)">
        <circle r="22" fill="rgba(20,30,40,0.6)" stroke="#d4a14a" strokeWidth="1" />
        <path d="M 0 -16 L 4 0 L 0 16 L -4 0 Z" fill="#d4a14a" />
        <text y="-20" textAnchor="middle" fontSize="9" fill="#d4a14a" fontWeight="700">N</text>
      </g>
    </svg>
  );
}
