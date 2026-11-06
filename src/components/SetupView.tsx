import { useState } from 'react';
import { ADVERSARIES, ADVERSARY_ORDER, adversaryLevel } from '../engine/adversary';
import { SPIRITS, SPIRIT_ORDER } from '../engine/spiritData';
import type { GameSetup } from '../engine/state';
import { BOARD_NAMES } from '../engine/types';
import type { AdversaryId, BoardName, SpiritId } from '../engine/types';
import { SPIRIT_COLORS, SpiritEmblem } from './art';

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}

/** Shuffle board letters for players who didn't pick one. */
export function assignBoards(chosen: (BoardName | null)[]): BoardName[] {
  const free = BOARD_NAMES.filter((b) => !chosen.includes(b)).sort(() => Math.random() - 0.5);
  return chosen.map((b) => b ?? free.shift()!);
}

export default function SetupView({ onStart, onBack }: { onStart: (s: GameSetup) => void; onBack: () => void }) {
  const [spirits, setSpirits] = useState<SpiritId[]>(['river']);
  const [boards, setBoards] = useState<(BoardName | null)[]>([null]);
  const [ai, setAI] = useState<boolean[]>([false]);
  const [adv, setAdv] = useState<AdversaryId>('none');
  const [level, setLevel] = useState(0);

  const toggle = (id: SpiritId) => {
    const i = spirits.indexOf(id);
    if (i >= 0) {
      if (spirits.length === 1) return;
      setSpirits(spirits.filter((s) => s !== id));
      setBoards(boards.filter((_, j) => j !== i));
      setAI(ai.filter((_, j) => j !== i));
    } else if (spirits.length < 4) {
      setSpirits([...spirits, id]);
      setBoards([...boards, null]);
      setAI([...ai, spirits.length > 0]);
    }
  };
  const a = ADVERSARIES[adv];
  const lvl = adversaryLevel(adv, level);

  const start = () =>
    onStart({ v: 1, seed: randomSeed(), spirits, boards: assignBoards(boards), adversary: adv, adversaryLevel: adv === 'none' ? 0 : level, ...(ai.some(Boolean) ? { ai } : {}) });

  return (
    <div className="setup-view">
      <header className="setup-head">
        <button className="secondary" onClick={onBack}>
          ← Back
        </button>
        <h2>New game</h2>
      </header>
      <p className="dim">
        Choose 1 Spirit for a solo game, or up to 4 (one island board each) — play them all yourself, or let the AI play some of them as teammates. Make every Spirit AI to watch a game. New players: try a Low-complexity Spirit.
      </p>
      <div className="spirit-grid">
        {SPIRIT_ORDER.map((id) => {
          const d = SPIRITS[id];
          const idx = spirits.indexOf(id);
          return (
            <button key={id} className={`spirit-card${idx >= 0 ? ' chosen' : ''}`} style={{ ['--spirit' as string]: SPIRIT_COLORS[id] }} onClick={() => toggle(id)}>
              <SpiritEmblem spirit={id} size={72} />
              <div className="sc-name">{d.name}</div>
              <div className={`sc-complexity c-${d.complexity.toLowerCase()}`}>{d.complexity}</div>
              <div className="sc-summary">{d.summary}</div>
              {idx >= 0 && <div className="sc-badge">{spirits.length > 1 ? `Player ${idx + 1}` : 'Chosen'}</div>}
            </button>
          );
        })}
      </div>
      <div className="setup-options">
        <div className="opt">
          <label>Players &amp; island boards</label>
          {spirits.map((s, i) => (
            <div key={s} className="board-pick">
              <SpiritEmblem spirit={s} size={20} />
              <button
                className={`seat-kind${ai[i] ? ' is-ai' : ''}`}
                onClick={() => setAI(ai.map((x, j) => (j === i ? !x : x)))}
                title="Who plays this Spirit"
              >
                {ai[i] ? '🤖 AI' : '👤 You'}
              </button>
              <select
                value={boards[i] ?? ''}
                onChange={(e) => {
                  const nb = [...boards];
                  nb[i] = (e.target.value || null) as BoardName | null;
                  setBoards(nb);
                }}
              >
                <option value="">Random board</option>
                {BOARD_NAMES.map((b) => (
                  <option key={b} value={b} disabled={boards.includes(b) && boards[i] !== b}>
                    Board {b}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="opt">
          <label>Adversary</label>
          <select value={adv} onChange={(e) => { setAdv(e.target.value as AdversaryId); setLevel(0); }}>
            {ADVERSARY_ORDER.map((id) => (
              <option key={id} value={id}>{ADVERSARIES[id].name}</option>
            ))}
          </select>
          {adv !== 'none' && (
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {a.levels.map((l) => (
                <option key={l.level} value={l.level}>
                  Level {l.level} — {l.name} (Difficulty {l.difficulty})
                </option>
              ))}
            </select>
          )}
          <p className="small dim">{a.summary}</p>
          {adv !== 'none' && (
            <ul className="small adv-levels">
              {a.escalation && <li><strong>Escalation — {a.escalation.name}:</strong> {a.escalation.text}</li>}
              {a.lossCondition && <li><strong>Loss:</strong> {a.lossCondition}</li>}
              {a.levels.filter((l) => l.level >= 1 && l.level <= level).map((l) => (
                <li key={l.level}><strong>L{l.level} {l.name}:</strong> {l.text}</li>
              ))}
              <li>Fear Deck: {lvl.fear.join(' / ')}</li>
            </ul>
          )}
        </div>
      </div>
      <button className="primary big" onClick={start}>
        Begin
      </button>
    </div>
  );
}
