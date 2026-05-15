import { useState } from 'react';
import { RULES_SECTIONS } from '../data/rulesContent';

export default function RulesView({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState(0);
  const section = RULES_SECTIONS[selected];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100vh' }}>
      <aside style={{
        background: 'var(--panel)',
        borderRight: '1px solid #3a3f4a',
        padding: '1rem',
        overflowY: 'auto',
      }}>
        <button onClick={onBack} style={{ marginBottom: '1rem', width: '100%' }}>← Back</button>
        <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Sections</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {RULES_SECTIONS.map((s, i) => (
            <li key={s.title}>
              <button
                onClick={() => setSelected(i)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: '0.25rem',
                  background: i === selected ? 'var(--panel-2)' : 'transparent',
                  border: 'none',
                  borderLeft: i === selected ? '3px solid var(--accent)' : '3px solid transparent',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0',
                  fontSize: '0.9rem',
                }}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main style={{ padding: '2rem', overflowY: 'auto', maxWidth: '900px' }}>
        <h2 style={{ color: 'var(--accent)' }}>{section.title}</h2>
        <pre style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'Georgia, serif',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          color: 'var(--ink)',
        }}>
          {section.body}
        </pre>
      </main>
    </div>
  );
}
