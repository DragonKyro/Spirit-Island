import { useEffect, useRef, useState } from 'react';
import type { ViewName } from '../App';
import Map from './board/Map';
import { useGameStore } from '../store/gameStore';
import { invaderCardLabel } from '../engine/invaderDeck';
import { cardPlays, energyPerTurn } from '../engine/spirit';

export default function GameView({ onNavigate }: { onNavigate: (v: ViewName) => void }) {
  const state = useGameStore((s) => s.state);
  const advance = useGameStore((s) => s.advancePhase);
  const runTurn = useGameStore((s) => s.runFullTurn);
  const [selectedLand, setSelectedLand] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.eventLog.length]);

  if (state.spirits.length === 0) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>No game in progress.</p>
        <button onClick={() => onNavigate('home')}>Back to Menu</button>
      </div>
    );
  }

  const fs = state.fearSystem;
  const bc = state.blightCard;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', height: '100vh', gap: '0' }}>
      {/* Main board */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          padding: '0.5rem 1rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          borderBottom: '1px solid #3a3f4a',
          background: 'var(--panel)',
        }}>
          <button onClick={() => onNavigate('home')}>Menu</button>
          <span style={{ fontWeight: 700 }}>Turn {state.turnNumber + 1}</span>
          <span style={{ color: 'var(--ink-dim)' }}>Phase: {state.phase}</span>
          <span style={{ color: 'var(--ink-dim)' }}>
            Difficulty: {state.difficulty} ({state.adversary.name})
          </span>
          {state.result !== 'IN_PROGRESS' && (
            <span style={{ color: state.result === 'VICTORY' ? 'var(--good)' : 'var(--danger)', fontWeight: 700 }}>
              {state.result}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button onClick={advance} disabled={state.result !== 'IN_PROGRESS'}>Next Phase</button>
            <button className="primary" onClick={runTurn} disabled={state.result !== 'IN_PROGRESS'}>Run Full Turn</button>
          </div>
        </header>

        <div style={{ flex: 1, padding: '0.5rem', overflow: 'auto' }}>
          <Map
            lands={state.lands}
            spirits={state.spirits}
            selectedIndex={selectedLand}
            onLandClick={(i) => setSelectedLand(i === selectedLand ? null : i)}
          />
        </div>
      </div>

      {/* Right sidebar */}
      <aside style={{
        borderLeft: '1px solid #3a3f4a',
        background: 'var(--panel)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <section style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #3a3f4a' }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Invader Deck</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
            <div style={card()}>
              <small>Ravage</small>
              <div>{state.invaderDeck.ravageCard ? invaderCardLabel(state.invaderDeck.ravageCard) : '—'}</div>
            </div>
            <div style={card()}>
              <small>Build</small>
              <div>{state.invaderDeck.buildCard ? invaderCardLabel(state.invaderDeck.buildCard) : '—'}</div>
            </div>
            <div style={card()}>
              <small>Deck</small>
              <div>{state.invaderDeck.deck.length} cards</div>
            </div>
          </div>
        </section>

        <section style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #3a3f4a' }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Fear</h3>
          <div>Terror Level: <strong>{fs.terrorLevel}</strong></div>
          <div>Pool: {fs.generatedFear}/{fs.fearPool} · Earned: {fs.totalCardsEarned} cards</div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--ink-dim)' }}>
            Win at TL{fs.terrorLevel}: {fs.terrorLevel === 1 ? 'No invaders' : fs.terrorLevel === 2 ? 'No towns/cities' : 'No cities'}
          </div>
        </section>

        <section style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #3a3f4a' }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Blight</h3>
          {bc ? (
            <>
              <div>{bc.name}</div>
              <div style={{ color: bc.isFlipped ? 'var(--danger)' : 'var(--ink-dim)', fontSize: '0.85rem' }}>
                {bc.isFlipped ? 'Blighted Island' : 'Healthy Island'} · {bc.blightRemaining} remaining
              </div>
            </>
          ) : <em>—</em>}
        </section>

        <section style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #3a3f4a' }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Spirits</h3>
          {state.spirits.map((s) => (
            <div key={s.name} style={{ marginBottom: '0.5rem', padding: '0.4rem', background: 'var(--panel-2)', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: s.color }}>{s.name}</strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-dim)' }}>
                Energy: {s.energy} (+{energyPerTurn(s)}/turn) · Card Plays: {cardPlays(s)} · Hand: {s.hand.length}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-dim)' }}>
                Presence on board: {s.presenceOnBoard}
              </div>
            </div>
          ))}
        </section>

        <section style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #3a3f4a' }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Event Log</h3>
          <div
            ref={logRef}
            style={{
              maxHeight: '320px',
              overflowY: 'auto',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              color: 'var(--ink-dim)',
              whiteSpace: 'pre-wrap',
              background: 'var(--bg)',
              padding: '0.4rem',
              borderRadius: '4px',
            }}
          >
            {state.eventLog.join('\n')}
          </div>
        </section>
      </aside>
    </div>
  );
}

function card(): React.CSSProperties {
  return {
    background: 'var(--panel-2)',
    padding: '0.4rem 0.6rem',
    borderRadius: '4px',
    fontSize: '0.85rem',
    minWidth: '95px',
    flex: '1',
  };
}
