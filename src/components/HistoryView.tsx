import { useState } from 'react';
import { ADVERSARIES } from '../engine/adversary';
import { SPIRITS } from '../engine/spiritData';
import type { SpiritId } from '../engine/types';
import { clearHistory, loadHistory } from '../store/history';
import type { HistoryEntry } from '../store/history';
import { SpiritEmblem } from './art';

const won = (e: HistoryEntry) => e.result !== 'DEFEAT';
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');

export default function HistoryView({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState(loadHistory);
  const wins = list.filter(won).length;
  const best = list.reduce((m, e) => Math.max(m, e.score), -Infinity);
  const bySpirit = new Map<SpiritId, { games: number; wins: number; best: number }>();
  for (const e of list) {
    for (const s of e.spirits) {
      const r = bySpirit.get(s) ?? { games: 0, wins: 0, best: -Infinity };
      r.games++;
      if (won(e)) r.wins++;
      r.best = Math.max(r.best, e.score);
      bySpirit.set(s, r);
    }
  }
  return (
    <div className="history-view">
      <header className="setup-head">
        <button className="secondary" onClick={onBack}>
          ← Back
        </button>
        <h2>History &amp; stats</h2>
      </header>
      {list.length === 0 ? (
        <p className="dim">No finished games yet.</p>
      ) : (
        <>
          <div className="hist-summary">
            <div><b>{list.length}</b><span>games</span></div>
            <div><b>{wins}</b><span>victories</span></div>
            <div><b>{pct(wins, list.length)}</b><span>win rate</span></div>
            <div><b>{Number.isFinite(best) ? best : '—'}</b><span>best score</span></div>
          </div>
          <h3>By Spirit</h3>
          <div className="hist-spirits">
            {[...bySpirit.entries()]
              .sort((a, b) => b[1].games - a[1].games)
              .map(([id, r]) => (
                <div key={id} className="hist-spirit">
                  <SpiritEmblem spirit={id} size={36} />
                  <div>
                    <div className="small">{SPIRITS[id].name}</div>
                    <div className="tiny dim">
                      {r.games} played · {r.wins} won ({pct(r.wins, r.games)}) · best {r.best}
                    </div>
                  </div>
                </div>
              ))}
          </div>
          <h3>Games</h3>
          <table className="adv-table hist-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Spirits</th>
                <th>Adversary</th>
                <th>Result</th>
                <th>Turns</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className={won(e) ? 'win' : 'loss'}>
                  <td>
                    {new Date(e.date).toLocaleDateString()} <span className="tiny dim">{e.mode === 'online' ? 'online' : ''}</span>
                  </td>
                  <td>
                    {e.spirits.map((s, i) => (
                      <span key={s} title={SPIRITS[s].name} className="hist-chip">
                        <SpiritEmblem spirit={s} size={20} />
                        {e.names?.[i] && <span className="tiny">{e.names[i]}</span>}
                      </span>
                    ))}
                  </td>
                  <td>
                    {e.adversary === 'none' ? '—' : `${ADVERSARIES[e.adversary].name.replace('The Kingdom of ', '')} ${e.level}`}
                    <span className="tiny dim"> (diff. {e.difficulty})</span>
                  </td>
                  <td title={e.reason}>{e.result === 'DEFEAT' ? 'Defeat' : e.result === 'SACRIFICE_VICTORY' ? 'Sacrifice victory' : `Victory (TL ${e.terrorLevel})`}</td>
                  <td>{e.turns}</td>
                  <td>{e.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="secondary small"
            onClick={() => {
              if (confirm('Clear all game history?')) {
                clearHistory();
                setList([]);
              }
            }}
          >
            Clear history
          </button>
        </>
      )}
    </div>
  );
}
