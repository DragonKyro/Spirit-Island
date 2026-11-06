import { CARDS } from '../../engine/cardData';
import type { CardData, TargetSpec } from '../../engine/cardData';
import { FILTER_LABEL } from '../../engine/ops';
import { cardImage } from '../../data/cardImages';
import { ElementIcon, FastIcon, SlowIcon, SPIRIT_COLORS } from '../art';
import { showPreview } from './CardPreview';

export function targetText(t: TargetSpec): { range: string; target: string } {
  if (t.kind === 'spirit') return { range: '—', target: t.who === 'another' ? 'Another Spirit' : 'Any Spirit' };
  const from = t.range.sacred ? 'Sacred Site ' : t.range.fromTerrain ? `${t.range.fromTerrain.map((x) => x[0] + x.slice(1).toLowerCase()).join('/')} ` : '';
  return { range: `${from}${t.range.n}`, target: FILTER_LABEL(t.filter).replace(/^an? /, '').replace(/^land with /, '').replace(/^any land$/, 'Any') };
}

/** Card text with "If you have X:" thresholds set apart. */
function CardText({ text }: { text: string }) {
  const m = text.match(/^(.*?)(If you have [^:]+:)(.*)$/);
  if (!m) return <p className="pc-text">{text}</p>;
  return (
    <>
      <p className="pc-text">{m[1].trim()}</p>
      <p className="pc-threshold">
        <strong>{m[2]}</strong> {m[3].trim()}
      </p>
    </>
  );
}

export interface PowerCardProps {
  id: string;
  size?: 'sm' | 'md';
  state?: 'hand' | 'played' | 'used' | 'discard' | 'offer';
  onClick?: () => void;
  highlight?: boolean;
  disabled?: boolean;
}

export default function PowerCard({ id, size = 'md', state, onClick, highlight, disabled }: PowerCardProps) {
  const c: CardData = CARDS[id];
  const tt = targetText(c.target);
  const accent = c.type === 'unique' ? SPIRIT_COLORS[c.spirit!] : c.type === 'minor' ? '#58a59b' : '#d08a3a';
  return (
    <div
      className={`power-card pc-${size} pc-${c.type}${state ? ` pc-${state}` : ''}${highlight ? ' pc-highlight' : ''}${onClick && !disabled ? ' pc-clickable' : ''}`}
      style={{ ['--pc-accent' as string]: accent }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => showPreview(cardImage('powers', id))}
      onMouseLeave={() => showPreview(null)}
      title={`${c.name} — ${c.cost} Energy, ${c.speed === 'FAST' ? 'Fast' : 'Slow'}. ${c.text}`}
    >
      <div className="pc-head">
        <div className={`pc-cost ${c.speed === 'FAST' ? 'fast' : 'slow'}`}>{c.cost}</div>
        <div className="pc-name">{c.name}</div>
        <div className="pc-speed">{c.speed === 'FAST' ? <FastIcon size={size === 'sm' ? 16 : 20} /> : <SlowIcon size={size === 'sm' ? 16 : 20} />}</div>
      </div>
      <div className="pc-body">
        <div className="pc-elements">
          {c.elements.map((e, i) => (
            <ElementIcon key={i} element={e} size={size === 'sm' ? 14 : 18} />
          ))}
        </div>
        <div className="pc-main">
          <div className="pc-target">
            <span>
              <em>Range</em> {tt.range}
            </span>
            <span>
              <em>Target</em> {tt.target}
            </span>
          </div>
          {size === 'md' && <CardText text={c.text} />}
        </div>
      </div>
      <div className="pc-foot">{c.type === 'unique' ? 'Unique' : c.type === 'minor' ? 'Minor' : 'Major'}</div>
    </div>
  );
}
