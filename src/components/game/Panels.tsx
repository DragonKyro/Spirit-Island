import { useEffect, useRef, useState } from 'react';
import { ADVERSARIES, adversaryLevel } from '../../engine/adversary';
import type { Decision, Option } from '../../engine/decide';
import { BLIGHT_CARD_INFO, cardPlays, elementsOf, energyIncome } from '../../engine/ops';
import { SPIRITS } from '../../engine/spiritData';
import { invaderCardLabel, meetsThreshold } from '../../engine/state';
import type { GameState, InvaderCard, SpiritState, TrackSlot } from '../../engine/state';
import { ELEMENTS } from '../../engine/types';
import type { Elements } from '../../engine/types';
import {
  BlightCardArt,
  CardPlayIcon,
  ElementIcon,
  EnergyIcon,
  FastIcon,
  FearCardBack,
  FearIcon,
  InvaderCardArt,
  ReclaimIcon,
  SlowIcon,
  SPIRIT_COLORS,
  SpiritEmblem,
  TerrorLevelIcon,
} from '../art';
import Blight from '../board/sprites/Blight';
import City from '../board/sprites/City';
import Dahan from '../board/sprites/Dahan';
import Explorer from '../board/sprites/Explorer';
import Presence from '../board/sprites/Presence';
import Town from '../board/sprites/Town';
import PowerCard from '../cards/PowerCard';
import { showPreview } from '../cards/CardPreview';
import { cardImage } from '../../data/cardImages';
import { CARDS } from '../../engine/cardData';
import { FEAR_BY_ID } from '../../engine/fearCards';

/** Card choices that read best as the cards themselves (keep 1 of 4, Forget, Reclaim, gifts…). */
const isCardPick = (main: Option[]) =>
  main.length > 0 && main.every((o) => o.card && !/^(play|card|repeat):/.test(o.key));

// ─── Decision panel ───────────────────────────────────────────────────────────

function OptionIcon({ o }: { o: Option }) {
  if (o.element) return <ElementIcon element={o.element} size={18} />;
  switch (o.piece) {
    case 'explorer': return <Explorer size={20} damaged={o.dmg ?? 0} />;
    case 'town': return <Town size={20} damaged={o.dmg ?? 0} />;
    case 'city': return <City size={20} damaged={o.dmg ?? 0} />;
    case 'dahan': return <Dahan size={20} damaged={o.dmg ?? 0} />;
  }
  return null;
}

export function DecisionPanel({
  gs,
  mine,
  others,
  onAnswer,
}: {
  gs: GameState;
  mine: Decision[];
  others: Decision[];
  onAnswer: (d: number, k: string) => void;
}) {
  const ownerName = (d: Decision) => (d.owner === -1 ? 'Any player' : gs.spirits[d.owner]?.name ?? '');
  return (
    <section className="panel decision-panel">
      {gs.activity && <div className="dp-activity">{gs.activity}</div>}
      {mine.length === 0 && others.length === 0 && gs.result.kind === 'IN_PROGRESS' && <p className="dim">Resolving…</p>}
      {mine.map((d) => {
        const owner = d.owner >= 0 ? gs.spirits[d.owner] : null;
        const main = d.options.filter((o) => !o.done);
        const done = d.options.filter((o) => o.done);
        return (
          <div key={d.id} className="dp-decision" style={owner ? { borderColor: SPIRIT_COLORS[owner.id] } : undefined}>
            <div className="dp-head">
              {owner && <SpiritEmblem spirit={owner.id} size={22} />}
              <span className="dp-owner">{ownerName(d)}</span>
              {d.source && <span className="dp-source">{d.source}</span>}
            </div>
            <div className="dp-prompt">{d.prompt}</div>
            {d.show && <img className="dp-show" src={cardImage(d.show.kind, d.show.id)} alt="" />}
            {main.some((o) => o.space) && <div className="dp-hint">Click a highlighted land on the map, or choose below.</div>}
            {isCardPick(main) ? (
              <div className="dp-cardpick">
                {main.map((o) => (
                  <button
                    key={o.key}
                    className="dp-cardbtn"
                    onClick={() => { showPreview(null); onAnswer(d.id, o.key); }}
                    onMouseEnter={() => showPreview(cardImage('powers', o.card!))}
                    onMouseLeave={() => showPreview(null)}
                    title={CARDS[o.card!]?.text}
                  >
                    <img src={cardImage('powers', o.card!)} alt={o.label} />
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
            ) : (
            <div className="dp-options">
              {main.map((o) => (
                <button key={o.key} className="dp-option" onClick={() => onAnswer(d.id, o.key)} title={o.hint}>
                  <OptionIcon o={o} />
                  <span>{o.label}</span>
                  {o.hint && <small>{o.hint}</small>}
                </button>
              ))}
            </div>
            )}
            {done.length > 0 && (
              <div className="dp-done">
                {done.map((o) => (
                  <button key={o.key} className="secondary" onClick={() => onAnswer(d.id, o.key)}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {others.length > 0 && (
        <div className="dp-waiting">
          {others.map((d) => (
            <div key={d.id}>
              ⏳ Waiting for <strong>{ownerName(d)}</strong>: {d.prompt}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Invader board ────────────────────────────────────────────────────────────

function CardSlot({ label, cards, back }: { label: string; cards: InvaderCard[]; back?: { stage: 1 | 2 | 3; count: number } }) {
  return (
    <div className="ib-slot">
      <div className="ib-cards">
        {back ? (
          back.count > 0 ? <InvaderCardArt terrains={[]} stage={back.stage} revealed={false} width={54} /> : <div className="ib-empty">empty</div>
        ) : cards.length ? (
          cards.map((c) => (
            <InvaderCardArt key={c.id} terrains={c.terrains === 'COASTAL' ? ['COASTAL'] : c.terrains} stage={c.stage} escalation={c.escalation} width={54} />
          ))
        ) : (
          <div className="ib-empty">—</div>
        )}
      </div>
      <div className="ib-label">{label}</div>
      {back && <div className="ib-count">{back.count} left</div>}
      {!back && cards.length > 0 && <div className="ib-count">{cards.map(invaderCardLabel).join(', ')}</div>}
    </div>
  );
}

const VICTORY = ['', 'No Invaders on the island', 'No Towns or Cities', 'No Cities'];

export function InvaderBoard({ gs }: { gs: GameState }) {
  const adv = ADVERSARIES[gs.setup.adversary];
  const lvl = adversaryLevel(gs.setup.adversary, gs.setup.adversaryLevel);
  const f = gs.fear;
  const toTL2 = Math.max(0, f.groups[0] - f.earnedTotal);
  const toTL3 = Math.max(0, f.groups[0] + f.groups[1] - f.earnedTotal);
  const binfo = BLIGHT_CARD_INFO[gs.blight.card];
  const inv = gs.invader;
  return (
    <section className="panel invader-board">
      <div className="ib-adversary" title={adv.summary}>
        <strong>{adv.name}</strong>
        {gs.setup.adversary !== 'none' && (
          <span>
            {' '}
            · Level {gs.setup.adversaryLevel} ({lvl.name}) · Difficulty {gs.difficulty}
          </span>
        )}
        {adv.escalation && <div className="dim small">Escalation — {adv.escalation.name}: {adv.escalation.text}</div>}
        {adv.lossCondition && <div className="dim small">{adv.lossCondition}</div>}
      </div>
      <div className="ib-row">
        <div className="ib-fear">
          <div className="ib-title">
            <FearIcon size={18} /> Fear
          </div>
          <div className="fear-track" title={`${f.generated} of ${f.poolSize} Fear generated`}>
            {Array.from({ length: f.poolSize }, (_, i) => (
              <span key={i} className={`fear-pip${i < f.generated ? ' on' : ''}`} />
            ))}
          </div>
          <div className="small">
            {f.generated}/{f.poolSize} · Deck {f.deck.length}
            {f.terrorLevel === 1 && toTL2 > 0 ? ` · TL II in ${toTL2}` : f.terrorLevel < 3 && toTL3 > 0 ? ` · TL III in ${toTL3}` : ''}
          </div>
          {f.earned.length > 0 && (
            <div className="ib-earned">
              {f.earned.map((_, i) => (
                <FearCardBack key={i} width={22} />
              ))}
              <span className="small"> {f.earned.length} earned</span>
            </div>
          )}
          {f.revealed.length > 0 && (
            <div className="tiny">
              Face-up:{' '}
              {f.revealed.map((id) => (
                <span key={id} className="revealed-fear" onMouseEnter={() => showPreview(cardImage('fears', id))} onMouseLeave={() => showPreview(null)}>
                  {FEAR_BY_ID[id]?.name}{' '}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="ib-terror" title={`Victory: ${VICTORY[f.terrorLevel]}`}>
          <TerrorLevelIcon level={f.terrorLevel} size={40} />
          <div className="small">Terror {['', 'I', 'II', 'III'][f.terrorLevel]}</div>
          <div className="tiny">{VICTORY[f.terrorLevel]}</div>
        </div>
        <div
          className="ib-blight"
          title={gs.blight.flipped ? `${binfo.name}: ${binfo.text}` : 'Healthy Island'}
          onMouseEnter={() => gs.blight.flipped && showPreview(cardImage('blights', gs.blight.card))}
          onMouseLeave={() => showPreview(null)}
        >
          <BlightCardArt width={44} flipped={gs.blight.flipped} />
          <div className="small">
            <Blight size={14} /> {gs.blight.onCard} left
          </div>
          <div className="tiny">{gs.blight.flipped ? binfo.name : 'Healthy Island'}</div>
        </div>
      </div>
      <div className="ib-track">
        <CardSlot label="Discard" cards={inv.discard.slice(-1)} />
        {inv.highImmigration && <CardSlot label="High Immig." cards={inv.highImmigration} />}
        <CardSlot label="Ravage" cards={inv.ravage} />
        <CardSlot label="Build" cards={inv.build} />
        <CardSlot label="Explore" cards={[]} back={{ stage: inv.deck[0]?.stage ?? 3, count: inv.deck.length }} />
      </div>
    </section>
  );
}

// ─── Spirit panel ─────────────────────────────────────────────────────────────

function ElementRow({ el }: { el: Elements }) {
  return (
    <div className="element-row">
      {ELEMENTS.map((e) => (
        <span key={e} className={`el${(el[e] ?? 0) > 0 ? ' on' : ''}`} title={e}>
          <ElementIcon element={e} size={20} />
          <b>{el[e] ?? 0}</b>
        </span>
      ))}
    </div>
  );
}

function Slot({ t, covered, color, kind }: { t: TrackSlot; covered: boolean; color: string; kind: 'energy' | 'plays' }) {
  return (
    <span className={`track-slot${covered ? ' covered' : ''}`}>
      {t.energy !== undefined && kind === 'energy' && <EnergyIcon size={26} value={t.energy} />}
      {t.plays !== undefined && <CardPlayIcon size={26} value={t.plays} />}
      {t.element && <ElementIcon element={t.element} size={22} />}
      {t.any && <span className="any-el">Any</span>}
      {t.reclaimOne && <ReclaimIcon size={24} />}
      {covered && (
        <span className="slot-presence">
          <Presence size={20} color={color} />
        </span>
      )}
    </span>
  );
}

export function SpiritPanel({
  gs,
  s,
  playable,
}: {
  gs: GameState;
  s: SpiritState;
  /** card id → answer it, when playing that card is a current option */
  playable: Map<string, () => void>;
}) {
  const d = SPIRITS[s.id];
  const el = elementsOf(s);
  const color = SPIRIT_COLORS[s.id];
  const [showRules, setShowRules] = useState(false);
  return (
    <section className="panel spirit-panel" style={{ ['--spirit' as string]: color }}>
      <div className="sp-head">
        <SpiritEmblem spirit={s.id} size={48} />
        <div className="sp-title">
          <div className="sp-name">{s.name}</div>
          <div className="sp-stats">
            <span title="Energy (income per turn in brackets)">
              <EnergyIcon size={20} /> {s.energy} <span className="dim">(+{energyIncome(s)})</span>
            </span>
            <span title="Card plays this turn">
              <CardPlayIcon size={20} /> {s.played.length}/{cardPlays(s)}
            </span>
            {s.destroyed > 0 && <span className="dim" title="Destroyed Presence">☠ {s.destroyed}</span>}
            {s.id === 'ocean' && s.drownedHealth > 0 && <span className="dim">Drowned {s.drownedHealth}</span>}
          </div>
        </div>
      </div>
      <ElementRow el={el} />
      <div className="tracks">
        <div className="track">
          {d.energyTrack.map((t, i) => (
            <Slot key={i} t={t} covered={i > s.energyRevealed} color={color} kind="energy" />
          ))}
        </div>
        <div className="track">
          {d.cardTrack.map((t, i) => (
            <Slot key={i} t={t} covered={i > s.cardRevealed} color={color} kind="plays" />
          ))}
        </div>
      </div>
      <div className="innates">
        {d.innates.map((inn) => (
          <div key={inn.id} className={`innate${s.used.includes(inn.id) ? ' used' : ''}`}>
            <div className="innate-name">
              {inn.speed === 'FAST' ? <FastIcon size={16} /> : <SlowIcon size={16} />} {inn.name}
              <span className="dim small"> · Innate</span>
            </div>
            {inn.fastIf && (
              <div className={`tier${meetsThreshold(el, inn.fastIf) ? ' met' : ''}`}>
                <span className="need">
                  {ELEMENTS.filter((e) => inn.fastIf![e]).map((e) => (
                    <span key={e}>
                      {inn.fastIf![e]}
                      <ElementIcon element={e} size={13} />
                    </span>
                  ))}
                </span>
                This Power may be Fast.
              </div>
            )}
            {inn.tiers.map((t, i) => (
              <div key={i} className={`tier${meetsThreshold(el, t.need) ? ' met' : ''}`}>
                <span className="need">
                  {ELEMENTS.filter((e) => t.need[e]).map((e) => (
                    <span key={e}>
                      {t.need[e]}
                      <ElementIcon element={e} size={13} />
                    </span>
                  ))}
                </span>
                {t.text}
              </div>
            ))}
          </div>
        ))}
      </div>
      <button className="link small" onClick={() => setShowRules((v) => !v)}>
        {showRules ? 'Hide' : 'Show'} special rules
      </button>
      {showRules && (
        <div className="special-rules">
          {d.specialRules.map((r) => (
            <p key={r.name}>
              <strong>{r.name}.</strong> {r.text}
            </p>
          ))}
        </div>
      )}
      {s.played.length > 0 && (
        <>
          <div className="cards-label">In play</div>
          <div className="card-row">
            {s.played.map((id) => (
              <PowerCard key={id} id={id} state={s.used.includes(id) ? 'used' : 'played'} highlight={playable.has(id)} onClick={playable.get(id)} />
            ))}
          </div>
        </>
      )}
      <div className="cards-label">Hand ({s.hand.length})</div>
      <div className="card-row">
        {s.hand.map((id) => (
          <PowerCard key={id} id={id} state="hand" highlight={playable.has(id)} onClick={playable.get(id)} />
        ))}
      </div>
      {s.discard.length > 0 && (
        <details>
          <summary className="cards-label">Discard ({s.discard.length})</summary>
          <div className="card-row">
            {s.discard.map((id) => (
              <PowerCard key={id} id={id} size="sm" state="discard" />
            ))}
          </div>
        </details>
      )}
      <div className="tiny dim">{gs.spirits.length > 1 ? `Board ${gs.island.boards[s.index]}` : ''}</div>
    </section>
  );
}

// ─── Log ──────────────────────────────────────────────────────────────────────

export function LogPanel({ gs }: { gs: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  const n = gs.log.length;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [n]);
  const recent = gs.log.slice(-300);
  return (
    <section className="panel log-panel">
      <div className="ib-title">Log</div>
      <div className="log" ref={ref}>
        {recent.map((e, i) => (
          <div key={n - recent.length + i} className={`log-line d${e.depth ?? 1}`}>
            {e.text}
          </div>
        ))}
      </div>
    </section>
  );
}
