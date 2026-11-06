import { useMemo, useRef, useState } from 'react';
import { islandShape } from '../../data/boardLayout';
import type { GameState, Space } from '../../engine/state';
import { isSacredSite } from '../../engine/state';
import { BLIGHTED_OVERLAY_ID, SPIRIT_COLORS, TERRAIN_PATTERN_IDS, TERRAIN_BASE_COLORS } from '../art';
import Blight from './sprites/Blight';
import City from './sprites/City';
import Dahan from './sprites/Dahan';
import Explorer from './sprites/Explorer';
import Presence from './sprites/Presence';
import Town from './sprites/Town';
import DefendIcon from '../art/DefendIcon';

export interface MapProps {
  gs: GameState;
  /** spaces that can be clicked right now, with a label for the tooltip */
  selectable: Map<string, string>;
  focus: string[];
  onSelect: (spaceId: string, ev: React.MouseEvent) => void;
}

interface Group {
  key: string;
  n: number;
  render: (size: number) => JSX.Element;
}

function groupsFor(gs: GameState, sp: Space): Group[] {
  const out: Group[] = [];
  gs.spirits.forEach((s) => {
    const n = sp.presence[s.index] ?? 0;
    if (n > 0) {
      const sacred = isSacredSite(gs, s, sp);
      out.push({ key: `p${s.index}`, n, render: (z) => <Presence size={z} color={SPIRIT_COLORS[s.id]} sacred={sacred} /> });
    }
  });
  if (sp.blight > 0) out.push({ key: 'blight', n: sp.blight, render: (z) => <Blight size={z} /> });
  const byKind = new Map<string, number>();
  for (const p of sp.pieces) byKind.set(`${p.kind}:${p.dmg}`, (byKind.get(`${p.kind}:${p.dmg}`) ?? 0) + 1);
  const order = ['city', 'town', 'explorer', 'dahan'];
  [...byKind.entries()]
    .sort((a, b) => order.indexOf(a[0].split(':')[0]) - order.indexOf(b[0].split(':')[0]) || Number(a[0].split(':')[1]) - Number(b[0].split(':')[1]))
    .forEach(([k, n]) => {
      const [kind, dmgS] = k.split(':');
      const dmg = Number(dmgS);
      const render =
        kind === 'city' ? (z: number) => <City size={z} damaged={dmg} />
        : kind === 'town' ? (z: number) => <Town size={z} damaged={dmg} />
        : kind === 'explorer' ? (z: number) => <Explorer size={z} damaged={dmg} />
        : (z: number) => <Dahan size={z} damaged={dmg} />;
      out.push({ key: k, n, render });
    });
  return out;
}

export default function IslandMap({ gs, selectable, focus, onSelect }: MapProps) {
  const shape = useMemo(() => islandShape(gs.island.boards, gs.island.orientations), [gs.island]);
  const vb = shape.viewBox;
  const visible = gs.spaces;

  // Zoom (wheel, about the cursor) and pan (drag); double-click resets. A drag never counts as a click.
  const [view, setView] = useState({ k: 1, x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const w = vb.w / view.k, h = vb.h / view.k;
  const toUser = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const s = Math.max(w / r.width, h / r.height); // preserveAspectRatio meet
    return { x: view.x + (clientX - r.left - r.width / 2) * s, y: view.y + (clientY - r.top - r.height / 2) * s, s };
  };
  const onWheel = (e: React.WheelEvent) => {
    const k2 = Math.min(5, Math.max(1, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const p = toUser(e.clientX, e.clientY);
    const f = view.k / k2;
    setView({ k: k2, x: p.x + (view.x - p.x) * f, y: p.y + (view.y - p.y) * f });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !(e.buttons & 1)) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    const { s } = toUser(e.clientX, e.clientY);
    setView((v) => ({ ...v, x: d.vx - dx * s, y: d.vy - dy * s }));
  };
  const onPointerUp = () => {
    suppressClick.current = !!drag.current?.moved;
    drag.current = null;
  };
  const select = (id: string, e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSelect(id, e);
  };

  return (
    <svg
      ref={svgRef}
      className="island-map"
      viewBox={`${view.x - w / 2} ${view.y - h / 2} ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="The island"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onDoubleClick={() => setView({ k: 1, x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 })}
    >
      <defs>
        <radialGradient id="map-sea" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stopColor="#1e5480" />
          <stop offset="100%" stopColor="#0a2238" />
        </radialGradient>
        <filter id="map-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="map-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
      <rect x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} fill="url(#map-sea)" />
      <rect x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} fill={`url(#${TERRAIN_PATTERN_IDS.OCEAN})`} opacity={0.35} />
      <g filter="url(#map-shadow)">
        {shape.boardOutlines.map((d, i) => (
          <path key={i} d={d} fill="#2a2a1e" stroke="#120d08" strokeWidth={10} strokeLinejoin="round" />
        ))}
      </g>
      {visible.map((sp) => {
        const sh = shape.spaces[sp.id];
        if (!sh) return null;
        const sel = selectable.has(sp.id);
        const foc = focus.includes(sp.id);
        const fill = sp.num === 0 ? TERRAIN_PATTERN_IDS.OCEAN : TERRAIN_PATTERN_IDS[sp.terrain];
        return (
          <g
            key={sp.id}
            className={`land${sel ? ' selectable' : ''}`}
            onClick={sel ? (e) => select(sp.id, e) : undefined}
            style={{ cursor: sel ? 'pointer' : 'default' }}
          >
            <title>{sel ? `${sp.id}: ${selectable.get(sp.id)}` : sp.id}</title>
            <path d={sh.path} fill={TERRAIN_BASE_COLORS[sp.terrain]} />
            <path d={sh.path} fill={`url(#${fill})`} opacity={sp.num === 0 ? 0.9 : 1} />
            {sp.blight > 0 && <path d={sh.path} fill={`url(#${BLIGHTED_OVERLAY_ID})`} opacity={Math.min(0.9, 0.45 + 0.15 * sp.blight)} />}
            <path d={sh.path} fill="none" stroke={sp.num === 0 ? '#9fd3ff55' : '#1c130e'} strokeWidth={sp.num === 0 ? 3 : 5} strokeLinejoin="round" />
            {foc && <path d={sh.path} fill="none" stroke="#ffe9a8" strokeWidth={9} strokeDasharray="22 14" strokeLinejoin="round" />}
            {sel && <path className="sel-ring" d={sh.path} fill="#ffd96620" stroke="#ffd966" strokeWidth={12} strokeLinejoin="round" filter="url(#map-glow)" />}
          </g>
        );
      })}
      {visible.map((sp) => {
        const sh = shape.spaces[sp.id];
        if (!sh) return null;
        const gr = groupsFor(gs, sp);
        const cell = Math.max(46, Math.min(74, sh.r * 0.62));
        const cols = gr.length <= 2 ? gr.length : gr.length <= 4 ? 2 : 3;
        const rows = Math.ceil(gr.length / Math.max(1, cols));
        const x0 = sh.cx - (cols * cell) / 2;
        const y0 = sh.cy - (rows * cell) / 2 + 10;
        const label = sp.num === 0 ? '' : String(sp.num);
        return (
          <g key={`pieces-${sp.id}`} pointerEvents="none">
            {label && (
              <g transform={`translate(${sh.cx}, ${y0 - 22})`}>
                <circle r={17} fill="#f1e4c3" stroke="#1c130e" strokeWidth={3} opacity={0.92} />
                <text textAnchor="middle" dy={7} fontSize={21} fontWeight={700} fill="#1c130e" fontFamily="Georgia, serif">
                  {gs.island.boards.length > 1 ? `${sp.boardName}${label}` : label}
                </text>
              </g>
            )}
            {gr.map((g, i) => {
              const c = i % cols, r = Math.floor(i / cols);
              const x = x0 + c * cell, y = y0 + r * cell;
              return (
                <g key={g.key} transform={`translate(${x}, ${y})`}>
                  {g.render(cell)}
                  {g.n > 1 && (
                    <g transform={`translate(${cell - 12}, ${cell - 12})`}>
                      <circle r={14} fill="#1c130e" stroke="#f1e4c3" strokeWidth={2.5} />
                      <text textAnchor="middle" dy={6} fontSize={17} fontWeight={700} fill="#f1e4c3" fontFamily="Georgia, serif">
                        {g.n}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            {sp.defend > 0 && (
              <g transform={`translate(${sh.cx + (cols * cell) / 2 - 8}, ${y0 - 44})`}>
                <DefendIcon size={40} value={sp.defend} />
              </g>
            )}
            {(sp.mods.skipAll || sp.mods.dahanSafe || sp.mods.blightStaysOnCard || sp.mods.vengeance?.length || sp.mods.dreadApparitions) && (
              <text x={sh.cx} y={y0 + rows * cell + 22} textAnchor="middle" fontSize={18} fill="#ffe9a8" stroke="#1c130e" strokeWidth={4} paintOrder="stroke" fontFamily="Georgia, serif">
                {[sp.mods.skipAll && 'Invaders skip', sp.mods.dahanSafe && 'Dahan concealed', sp.mods.blightStaysOnCard && 'Vital', sp.mods.vengeance?.length && 'Vengeance', sp.mods.dreadApparitions && 'Dread'].filter(Boolean).join(' · ')}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
