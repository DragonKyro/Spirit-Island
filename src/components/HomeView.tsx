import type { ViewName } from '../App';

export default function HomeView({ onNavigate }: { onNavigate: (v: ViewName) => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <h1>Spirit Island</h1>
      <p style={{ color: 'var(--ink-dim)', marginBottom: '2rem' }}>Solo digital adaptation</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: '240px' }}>
        <button className="primary" onClick={() => onNavigate('select')}>New Game</button>
        <button onClick={() => onNavigate('rules')}>Rules</button>
      </div>
    </div>
  );
}
