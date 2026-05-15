import { Land, cityCount, explorerCount, townCount } from '../../engine/land';
import { LandLayout, TERRAIN_FILL, TERRAIN_STROKE, polygonPath } from '../../data/boardLayout';
import { Spirit } from '../../engine/spirit';
import Explorer from './sprites/Explorer';
import Town from './sprites/Town';
import City from './sprites/City';
import Dahan from './sprites/Dahan';
import Blight from './sprites/Blight';
import Presence from './sprites/Presence';

interface Props {
  land: Land;
  layout: LandLayout;
  spirits: Spirit[];
  selected?: boolean;
  onClick?: () => void;
}

interface Slot {
  type: 'explorer' | 'town' | 'city' | 'dahan' | 'blight' | 'presence';
  count: number;
  color?: string;
}

const SPRITE_SIZE = 22;

export default function LandShape({ land, layout, spirits, selected, onClick }: Props) {
  const slots: Slot[] = [];
  const explorers = explorerCount(land);
  const towns = townCount(land);
  const cities = cityCount(land);
  if (explorers > 0) slots.push({ type: 'explorer', count: explorers });
  if (towns > 0) slots.push({ type: 'town', count: towns });
  if (cities > 0) slots.push({ type: 'city', count: cities });
  if (land.dahan.length > 0) slots.push({ type: 'dahan', count: land.dahan.length });
  if (land.blight > 0) slots.push({ type: 'blight', count: land.blight });
  for (const spirit of spirits) {
    const c = land.presence[spirit.name] ?? 0;
    if (c > 0) slots.push({ type: 'presence', count: c, color: spirit.color });
  }

  // Lay sprites in a small grid below the centroid
  const rows = Math.ceil(slots.length / 3);
  const gridStartY = layout.centerY - rows * 14 + 4;

  return (
    <g
      className={`land${selected ? ' selected' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <path
        d={polygonPath(layout.vertices)}
        fill={TERRAIN_FILL[layout.terrain]}
        stroke={selected ? '#fff' : TERRAIN_STROKE[layout.terrain]}
        strokeWidth={selected ? 3 : 1.4}
      />
      {/* terrain texture hint: subtle darker overlay near edges */}
      <path
        d={polygonPath(layout.vertices)}
        fill="url(#land-vignette)"
        opacity="0.35"
        pointerEvents="none"
      />
      {/* land number label */}
      <text
        x={layout.centerX}
        y={layout.centerY - 38}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="#fff"
        stroke="#000"
        strokeWidth="0.4"
        pointerEvents="none"
      >
        {layout.number}
      </text>
      <text
        x={layout.centerX}
        y={layout.centerY - 26}
        textAnchor="middle"
        fontSize="8.5"
        fill="rgba(255,255,255,0.7)"
        pointerEvents="none"
      >
        {layout.terrain}
      </text>

      {/* sprite grid */}
      {slots.map((slot, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = layout.centerX - 24 + col * 22;
        const y = gridStartY + row * 22 + 8;
        return (
          <g key={`${slot.type}-${i}`} transform={`translate(${x - SPRITE_SIZE / 2}, ${y - SPRITE_SIZE / 2})`} pointerEvents="none">
            {slot.type === 'explorer' && <Explorer size={SPRITE_SIZE} />}
            {slot.type === 'town' && <Town size={SPRITE_SIZE} />}
            {slot.type === 'city' && <City size={SPRITE_SIZE + 4} />}
            {slot.type === 'dahan' && <Dahan size={SPRITE_SIZE} />}
            {slot.type === 'blight' && <Blight size={SPRITE_SIZE} />}
            {slot.type === 'presence' && <Presence size={SPRITE_SIZE} color={slot.color ?? '#d4a14a'} />}
            {slot.count > 1 && (
              <g>
                <circle cx={SPRITE_SIZE - 2} cy={SPRITE_SIZE - 2} r="6.5" fill="#1a1d24" stroke="#fff" strokeWidth="0.8" />
                <text x={SPRITE_SIZE - 2} y={SPRITE_SIZE + 0.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
                  {slot.count}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
