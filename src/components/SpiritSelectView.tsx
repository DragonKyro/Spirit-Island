import { useState } from 'react';
import type { ViewName } from '../App';
import { ALL_ADVERSARIES, Adversary } from '../engine/adversary';
import { ALL_SPIRITS } from '../engine/spirit';
import { useGameStore } from '../store/gameStore';
import Presence from './board/sprites/Presence';

const SPIRIT_DESCRIPTIONS: Record<string, string> = {
  "Lightning's Swift Strike": 'Fast and aggressive. Strikes hard early with Fire and Air.',
  'Vital Strength of the Earth': 'Defensive powerhouse. Heals the land with Sun and Earth.',
  'River Surges in Sunlight': 'Versatile and flexible. Pushes invaders with Water.',
  'Shadows Flicker Like Flame': 'Fear-focused. Whispers terror with Moon and Fire.',
};

const SPIRIT_COLORS: Record<string, string> = {
  "Lightning's Swift Strike": '#f0c84a',
  'Vital Strength of the Earth': '#a5733a',
  'River Surges in Sunlight': '#5aa8d4',
  'Shadows Flicker Like Flame': '#8b5dbd',
};

export default function SpiritSelectView({ onNavigate }: { onNavigate: (v: ViewName) => void }) {
  const [selectedSpirits, setSelectedSpirits] = useState<string[]>([]);
  const [adversaryName, setAdversaryName] = useState<string>('No Adversary');
  const [adversaryLevel, setAdversaryLevel] = useState(0);
  const startGame = useGameStore((s) => s.startGame);

  const adversary: Adversary = ALL_ADVERSARIES[adversaryName];
  const availableLevels = adversary.levels.map((l) => l.level);

  function toggleSpirit(name: string) {
    setSelectedSpirits((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function handleStart() {
    if (selectedSpirits.length === 0) return;
    const spirits = selectedSpirits.map((n) => ALL_SPIRITS[n]());
    startGame(spirits, adversary, adversaryLevel);
    onNavigate('game');
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ color: 'var(--accent)' }}>Choose Your Spirits</h2>
      <p style={{ color: 'var(--ink-dim)', marginBottom: '1.5rem' }}>
        Select one or more spirits. Solo mode uses 1 spirit; multi-spirit games use 1 board for all.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {Object.keys(ALL_SPIRITS).map((name) => {
          const selected = selectedSpirits.includes(name);
          return (
            <button
              key={name}
              onClick={() => toggleSpirit(name)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '1rem',
                background: selected ? 'var(--panel-2)' : 'var(--panel)',
                border: `2px solid ${selected ? SPIRIT_COLORS[name] : '#3a3f4a'}`,
                borderRadius: '10px',
                gap: '0.5rem',
                textAlign: 'center',
              }}
            >
              <Presence size={56} color={SPIRIT_COLORS[name]} />
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{name}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ink-dim)' }}>
                {SPIRIT_DESCRIPTIONS[name]}
              </div>
            </button>
          );
        })}
      </div>

      <h3 style={{ marginTop: '2rem' }}>Adversary</h3>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {Object.keys(ALL_ADVERSARIES).map((name) => (
          <button
            key={name}
            onClick={() => {
              setAdversaryName(name);
              setAdversaryLevel(ALL_ADVERSARIES[name].levels[0].level);
            }}
            className={adversaryName === name ? 'primary' : ''}
          >
            {name}
          </button>
        ))}
      </div>

      {adversary.name !== 'No Adversary' && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Level (Difficulty)</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {availableLevels.map((lvl) => {
              const lvlInfo = adversary.levels.find((l) => l.level === lvl)!;
              return (
                <button
                  key={lvl}
                  onClick={() => setAdversaryLevel(lvl)}
                  className={adversaryLevel === lvl ? 'primary' : ''}
                  title={lvlInfo.description}
                >
                  Lv {lvl} (D{lvlInfo.difficulty})
                </button>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
        <button onClick={() => onNavigate('home')}>Back</button>
        <button
          className="primary"
          onClick={handleStart}
          disabled={selectedSpirits.length === 0}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}
