import { useState } from 'react';
import { ADVERSARIES, ADVERSARY_ORDER } from '../engine/adversary';
import { uniquesOf } from '../engine/cardData';
import { SPIRITS, SPIRIT_ORDER } from '../engine/spiritData';
import { RULES_SECTIONS } from '../data/rulesContent';
import { SpiritEmblem, TerrainDefs } from './art';
import { RULE_FIGURES } from './rules/RuleFigures';
import PowerCard from './cards/PowerCard';
import { CardPreviewHost } from './cards/CardPreview';

const EXTRA = ['Spirits', 'Adversaries'] as const;

const ALL_SECTIONS = [...RULES_SECTIONS.map((s) => s.title), ...EXTRA];

export default function RulesView({ onBack, initial }: { onBack: () => void; initial?: string | null }) {
  const [sel, setSel] = useState<string>(initial && ALL_SECTIONS.includes(initial) ? initial : RULES_SECTIONS[0].title);
  const section = RULES_SECTIONS.find((s) => s.title === sel);
  return (
    <div className="rules-view">
      <CardPreviewHost />
      <TerrainDefs />
      <aside className="rules-nav">
        <button onClick={onBack} className="secondary wide">
          ← Back
        </button>
        <h3>Rules</h3>
        {ALL_SECTIONS.map((t) => (
          <button key={t} className={`nav-item${t === sel ? ' active' : ''}`} onClick={() => setSel(t)}>
            {t}
          </button>
        ))}
      </aside>
      <main className="rules-main">
        <h2>{sel}</h2>
        {section && <pre className="rules-text">{section.body}</pre>}
        {RULE_FIGURES[sel] && <div className="rule-figs">{RULE_FIGURES[sel]()}</div>}
        {sel === 'Spirits' &&
          SPIRIT_ORDER.map((id) => {
            const d = SPIRITS[id];
            return (
              <div key={id} className="rules-spirit">
                <div className="rs-head">
                  <SpiritEmblem spirit={id} size={56} />
                  <div>
                    <h3>{d.name}</h3>
                    <div className="dim">{d.complexity} complexity — {d.summary}</div>
                  </div>
                </div>
                <p><strong>Setup:</strong> {d.setupText}</p>
                {d.specialRules.map((r) => (
                  <p key={r.name}><strong>{r.name}:</strong> {r.text}</p>
                ))}
                {d.innates.map((inn) => (
                  <p key={inn.id}>
                    <strong>{inn.name}</strong> ({inn.speed === 'FAST' ? 'Fast' : 'Slow'} Innate):{' '}
                    {inn.tiers.map((t) => `[${Object.entries(t.need).map(([e, n]) => `${n} ${e.toLowerCase()}`).join(', ')}] ${t.text}`).join(' ')}
                  </p>
                ))}
                <div className="card-row">
                  {uniquesOf(id).map((c) => (
                    <PowerCard key={c} id={c} />
                  ))}
                </div>
              </div>
            );
          })}
        {sel === 'Adversaries' &&
          ADVERSARY_ORDER.filter((a) => a !== 'none').map((id) => {
            const a = ADVERSARIES[id];
            return (
              <div key={id} className="rules-adv">
                <h3>{a.name}</h3>
                <p className="dim">{a.summary}</p>
                {a.lossCondition && <p><strong>Additional loss condition —</strong> {a.lossCondition}</p>}
                {a.escalation && <p><strong>Escalation — {a.escalation.name}:</strong> {a.escalation.text}</p>}
                <table className="adv-table">
                  <thead>
                    <tr><th>Level</th><th>Difficulty</th><th>Fear Cards</th><th>Effect</th></tr>
                  </thead>
                  <tbody>
                    {a.levels.map((l) => (
                      <tr key={l.level}>
                        <td>{l.level}</td>
                        <td>{l.difficulty}</td>
                        <td>{l.fear.reduce((x, y) => x + y, 0)} ({l.fear.join('/')})</td>
                        <td><strong>{l.name}.</strong> {l.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
      </main>
    </div>
  );
}
