import { useMemo, useState } from 'react';
import type { Decision, Option } from '../engine/decide';
import { score } from '../engine/game';
import { useGameStore } from '../store/gameStore';
import { SPIRIT_COLORS, SpiritEmblem, TerrainDefs } from './art';
import IslandMap from './board/Map';
import { CardPreviewHost } from './cards/CardPreview';
import { DecisionPanel, InvaderBoard, LogPanel, SpiritPanel } from './game/Panels';

const PHASE_LABEL: Record<string, string> = {
  SETUP: 'Setup',
  SPIRIT: 'Spirit Phase',
  FAST: 'Fast Powers',
  INVADER: 'Invader Phase',
  SLOW: 'Slow Powers',
  TIME_PASSES: 'Time Passes',
  GAME_OVER: 'Game Over',
};

interface Popover {
  x: number;
  y: number;
  space: string;
  items: { d: Decision; o: Option }[];
}

export default function GameView({ onExit, online }: { onExit: () => void; online?: React.ReactNode }) {
  const { game, mode, seat, answer, undo, canUndo } = useGameStore();
  useGameStore((s) => s.tick); // re-render on every engine step
  const [tab, setTab] = useState<number | null>(null);
  const [pop, setPop] = useState<Popover | null>(null);

  const gs = game?.gs;
  const { mine, others } = useMemo(() => {
    if (!gs) return { mine: [] as Decision[], others: [] as Decision[] };
    if (mode === 'local') return { mine: gs.pending, others: [] as Decision[] };
    const m = gs.pending.filter((d) => seat !== null && (d.owner === seat || d.owner === -1));
    return { mine: m, others: gs.pending.filter((d) => !m.includes(d)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs, gs?.pending, mode, seat]);

  if (!game || !gs) return null;

  const respond = (d: number, k: string) => {
    setPop(null);
    answer(d, k);
  };

  // Map: spaces offered by the decisions this device can answer.
  const bySpace = new Map<string, { d: Decision; o: Option }[]>();
  for (const d of mine) for (const o of d.options) if (o.space) bySpace.set(o.space, [...(bySpace.get(o.space) ?? []), { d, o }]);
  const selectable = new Map<string, string>([...bySpace.entries()].map(([k, v]) => [k, v.map((x) => x.o.label).join(' / ')]));
  const focus = mine.flatMap((d) => d.focus ?? []);
  const onSelect = (spaceId: string, ev: React.MouseEvent) => {
    const items = bySpace.get(spaceId) ?? [];
    if (items.length === 1) respond(items[0].d.id, items[0].o.key);
    else if (items.length > 1) {
      const host = (ev.currentTarget as Element).closest('.map-wrap')!.getBoundingClientRect();
      setPop({ x: ev.clientX - host.left, y: ev.clientY - host.top, space: spaceId, items });
    }
  };

  // Cards: playing from hand / resolving from play.
  const cardActions = new Map<string, () => void>();
  for (const d of mine) {
    for (const o of d.options) {
      if (o.card && (o.key.startsWith('play:') || o.key.startsWith('card:'))) cardActions.set(o.card, () => respond(d.id, o.key));
    }
  }

  const spirits = gs.spirits;
  const defaultTab = seat ?? (mine.find((d) => d.owner >= 0)?.owner ?? 0);
  const shown = spirits[tab ?? defaultTab] ?? spirits[0];
  const sc = score(gs);
  const over = gs.result.kind !== 'IN_PROGRESS';

  return (
    <div className="game-view">
      <TerrainDefs />
      <CardPreviewHost />
      <header className="game-header">
        <button className="secondary" onClick={onExit}>
          ← Menu
        </button>
        <div className="gh-turn">
          Turn {Math.max(1, gs.turn)} · <strong>{PHASE_LABEL[gs.phase]}</strong>
        </div>
        <div className="gh-spirits">
          {spirits.map((s) => (
            <span key={s.index} className="gh-spirit" style={{ color: SPIRIT_COLORS[s.id] }} title={s.name}>
              <SpiritEmblem spirit={s.id} size={22} />
              {gs.setup.names?.[s.index] && <small>{gs.setup.names[s.index]}</small>}
            </span>
          ))}
        </div>
        {mode === 'local' && (
          <button className="secondary" disabled={!canUndo()} onClick={() => { setPop(null); undo(); }} title="Undo your last choice">
            ↶ Undo
          </button>
        )}
      </header>
      <div className="game-body">
        <div className="map-wrap" onClick={(e) => { if (e.target === e.currentTarget) setPop(null); }}>
          <IslandMap key={gs.setup.seed} gs={gs} selectable={selectable} focus={focus} onSelect={onSelect} />
          <div className="map-help">Scroll to zoom · drag to pan · double-click to reset</div>
          {pop && (
            <div className="map-pop" style={{ left: pop.x, top: pop.y }}>
              <div className="small dim">{pop.space}</div>
              {pop.items.map(({ d, o }) => (
                <button key={`${d.id}:${o.key}`} onClick={() => respond(d.id, o.key)}>
                  {o.label}
                </button>
              ))}
              <button className="secondary" onClick={() => setPop(null)}>
                Cancel
              </button>
            </div>
          )}
          {over && (
            <div className="game-over">
              <h2>{gs.result.kind === 'DEFEAT' ? 'Defeat' : gs.result.kind === 'SACRIFICE_VICTORY' ? 'Sacrifice Victory' : 'Victory!'}</h2>
              <p>{'reason' in gs.result ? gs.result.reason : ''}</p>
              {sc && (
                <table className="score">
                  <tbody>
                    {sc.parts.map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>Score</td>
                      <td>{sc.total}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              <button className="primary" onClick={onExit}>
                Back to menu
              </button>
            </div>
          )}
        </div>
        <aside className="sidebar">
          {online}
          <DecisionPanel gs={gs} mine={mine} others={others} onAnswer={respond} />
          <InvaderBoard gs={gs} />
          {spirits.length > 1 && (
            <div className="spirit-tabs">
              {spirits.map((s) => (
                <button key={s.index} className={s === shown ? 'active' : ''} onClick={() => setTab(s.index)} style={{ borderColor: SPIRIT_COLORS[s.id] }}>
                  <SpiritEmblem spirit={s.id} size={18} /> {gs.setup.names?.[s.index] ?? s.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
          <SpiritPanel gs={gs} s={shown} playable={cardActions} />
          <LogPanel gs={gs} />
        </aside>
      </div>
    </div>
  );
}
