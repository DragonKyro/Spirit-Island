// Illustrations for the rules reference, drawn with the real game components.
// Before/after examples are produced by running the actual engine on a prepared
// position, so they always show exactly what happens in play.

import { useMemo } from 'react';
import type { Eff } from '../../engine/decide';
import { newGame } from '../../engine/game';
import { addBlight, distancesFrom } from '../../engine/ops';
import { build, explore, ravage } from '../../engine/phases';
import { createState } from '../../engine/setup';
import { space } from '../../engine/state';
import type { GameSetup, GameState, InvaderCard } from '../../engine/state';
import { ELEMENTS, ELEMENT_LABEL } from '../../engine/types';
import type { PieceKind } from '../../engine/types';
import {
  BlightCardArt,
  CardPlayIcon,
  ElementIcon,
  EnergyIcon,
  FastIcon,
  FearCardBack,
  FearIcon,
  InvaderCardArt,
  SlowIcon,
  TerrainIcon,
  TerrorLevelIcon,
} from '../art';
import IslandMap from '../board/Map';
import type { MapArrow } from '../board/Map';
import Blight from '../board/sprites/Blight';
import City from '../board/sprites/City';
import Dahan from '../board/sprites/Dahan';
import Explorer from '../board/sprites/Explorer';
import Presence from '../board/sprites/Presence';
import Town from '../board/sprites/Town';
import PowerCard from '../cards/PowerCard';
import { SpiritPanel } from '../game/Panels';
import { cardImage } from '../../data/cardImages';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SOLO: GameSetup = { v: 2, seed: 11, spirits: ['river'], boards: ['A'], adversary: 'none', adversaryLevel: 0 };

/** Board A with no pieces at all (Setup phase: no win/loss checks). */
function emptyBoard(setup: Partial<GameSetup> = {}): GameState {
  const gs = createState({ ...SOLO, ...setup });
  for (const sp of gs.spaces) {
    sp.pieces = [];
    sp.blight = 0;
    sp.presence = sp.presence.map(() => 0);
  }
  gs.blight.onCard = 20;
  return gs;
}

const put = (gs: GameState, id: string, ...kinds: PieceKind[]) => kinds.forEach((kind) => space(gs, id).pieces.push({ kind, dmg: 0 }));
const clone = (gs: GameState): GameState => structuredClone(gs);

/** Run an engine step, always taking the first option offered. Returns the log lines it wrote. */
function runFirst(gs: GameState, gen: Eff<unknown>): string[] {
  const start = gs.log.length;
  let r = gen.next();
  while (!r.done) {
    const d = r.value[0];
    r = gen.next({ d: d.id, k: d.options[0].key });
  }
  return gs.log.slice(start).map((e) => e.text);
}

const card = (terrains: InvaderCard['terrains'], stage: 1 | 2 | 3 = 1): InvaderCard => ({ id: 'fig', stage, terrains, escalation: false });

function Fig({ caption, children, wide }: { caption: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <figure className={`rule-fig${wide ? ' wide' : ''}`}>
      <div className="rule-fig-body">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function MiniMap({ gs, highlight = [], focus = [], arrows, zoom, height = 250 }: { gs: GameState; highlight?: string[]; focus?: string[]; arrows?: MapArrow[]; zoom?: { space: string; k: number }; height?: number }) {
  const sel = useMemo(() => new Map(highlight.map((id) => [id, id])), [highlight]);
  return (
    <div className="fig-map" style={{ height }}>
      <IslandMap gs={gs} selectable={sel} focus={focus} onSelect={() => {}} arrows={arrows} initialView={zoom} />
    </div>
  );
}

function BeforeAfter({ before, after, highlight, arrows, zoom, notes }: { before: GameState; after: GameState; highlight?: string[]; arrows?: MapArrow[]; zoom?: { space: string; k: number }; notes?: string[] }) {
  return (
    <>
      <div className="fig-pair">
        <div>
          <div className="fig-tag">Before</div>
          <MiniMap gs={before} focus={highlight} zoom={zoom} />
        </div>
        <div className="fig-arrow">→</div>
        <div>
          <div className="fig-tag">After</div>
          <MiniMap gs={after} highlight={highlight} arrows={arrows} zoom={zoom} />
        </div>
      </div>
      {notes && notes.length > 0 && (
        <div className="fig-log">
          <div className="fig-tag">Game log</div>
          {notes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── figures ──────────────────────────────────────────────────────────────────

function TurnFlow() {
  const step = (icon: React.ReactNode, title: string, items: string[], tone: string) => (
    <div className={`flow-step ${tone}`}>
      <div className="flow-head">
        {icon}
        <strong>{title}</strong>
      </div>
      <ol>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ol>
    </div>
  );
  return (
    <Fig wide caption="Every turn runs left to right. In the app the current phase is shown in the header, and the game waits for you only when a rule offers a choice.">
      <div className="flow">
        {step(<EnergyIcon size={26} />, '1 Spirit Phase', ['Growth', 'Gain Energy', 'Play & pay for cards'], 'tone-spirit')}
        {step(<FastIcon size={26} />, '2 Fast Powers', ['Fast cards', 'Fast Innates'], 'tone-fast')}
        {step(<FearIcon size={26} />, '3 Invader Phase', ['Blighted Island', 'Fear Cards', 'Ravage', 'Build', 'Explore', 'Advance cards'], 'tone-invader')}
        {step(<SlowIcon size={26} />, '4 Slow Powers', ['Slow cards', 'Slow Innates'], 'tone-slow')}
        {step(<span className="flow-glyph">⌛</span>, '5 Time Passes', ['Discard played cards', 'Damage, Elements & Defend clear'], 'tone-time')}
      </div>
    </Fig>
  );
}

function StartingBoard() {
  const g = useMemo(() => newGame(SOLO), []);
  return (
    <Fig caption="Board A after Setup: a City and Dahan in land 2, Dahan in 3, 6 and 7, Blight in 4, a Town in 8 — and River's starting Presence in land 5. The first Invader Card (Sands) already Explored land 4 and land 7 and now waits in the Build space.">
      <MiniMap gs={g.gs} height={300} />
    </Fig>
  );
}

function SpiritPanelFig() {
  const g = useMemo(() => newGame(SOLO), []);
  return (
    <Fig caption="River Surges in Sunlight at the start of the game. Top track: Energy per turn; bottom track: Card Plays. Presence sits on every space but the first — lift Presence off a track (left to right) when you add it to the island, revealing a bigger number, an Element, or Reclaim One. Below: the Innate Power (a threshold lights up when you have its Elements) and the hand of 4 Unique Powers.">
      <div className="fig-panel">
        <SpiritPanel gs={g.gs} s={g.gs.spirits[0]} playable={new Map()} />
      </div>
    </Fig>
  );
}

function CardAnatomy() {
  return (
    <Fig
      wide
      caption={
        <>
          The same card drawn by the app (left) and the printed card (right). <b>Cost</b> is the circle — red for <FastIcon size={14} /> Fast, blue for <SlowIcon size={14} /> Slow. The <b>Elements</b> run down the left edge and count as soon as the card is paid for. <b>Range</b> is measured from your Presence (or Sacred Site); <b>Target</b> is the land type it may affect. Hover any card in the app to see its printed version.
        </>
      }
    >
      <div className="fig-cards">
        <PowerCard id="flash-floods" />
        <img className="fig-scan" src={cardImage('powers', 'flash-floods')} alt="Flash Floods card" />
        <PowerCard id="drought" />
        <img className="fig-scan" src={cardImage('powers', 'drought')} alt="Drought card" />
      </div>
    </Fig>
  );
}

function ElementsLegend() {
  return (
    <Fig caption="The 8 Elements. Your Elements this turn are shown under your Spirit's name; threshold effects need all of the listed Elements at once.">
      <div className="fig-legend">
        {ELEMENTS.map((e) => (
          <span key={e}>
            <ElementIcon element={e} size={32} />
            {ELEMENT_LABEL[e]}
          </span>
        ))}
      </div>
    </Fig>
  );
}

function RangeFig() {
  const gs = useMemo(() => {
    const g = emptyBoard();
    space(g, 'A5').presence[0] = 1;
    return g;
  }, []);
  const r1 = [...distancesFrom(gs, [space(gs, 'A5')], 1).keys()];
  return (
    <Fig caption="Range 1 from River's Presence in land 5 (glowing): land 5 itself (Range 0) and every land adjacent to it. When you choose a target, exactly these lands light up on the map.">
      <MiniMap gs={gs} highlight={r1} height={280} />
    </Fig>
  );
}

function SacredSiteFig() {
  const gs = useMemo(() => {
    const g = emptyBoard({ spirits: ['lightning'] });
    space(g, 'A7').presence[0] = 2;
    space(g, 'A3').presence[0] = 1;
    return g;
  }, []);
  return (
    <Fig caption="Two of Lightning's Presence in land 7 make it a Sacred Site — drawn with a radiant crown. The single Presence in land 3 is not. (River's Presence in any Wetland also counts as a Sacred Site.)">
      <MiniMap gs={gs} focus={['A7']} zoom={{ space: 'A7', k: 2.2 }} />
    </Fig>
  );
}

function InvaderTrack() {
  return (
    <Fig
      wide
      caption="The Invader Cards on the Invader board. Each card affects every land of its terrain: the Ravage card's lands Ravage, then the Build card's lands Build, then a new card is revealed from the deck to Explore. At the end of the phase every card slides one space left."
    >
      <div className="fig-track">
        <div><InvaderCardArt terrains={['WETLAND']} stage={1} width={70} /><span>Discard</span></div>
        <div className="fig-slide">←</div>
        <div><InvaderCardArt terrains={['JUNGLE']} stage={1} width={70} /><span>Ravage</span></div>
        <div className="fig-slide">←</div>
        <div><InvaderCardArt terrains={['SANDS']} stage={1} width={70} /><span>Build</span></div>
        <div className="fig-slide">←</div>
        <div><InvaderCardArt terrains={['MOUNTAIN', 'WETLAND']} stage={2} width={70} escalation /><span>Explore (new)</span></div>
        <div><InvaderCardArt terrains={[]} stage={3} width={70} revealed={false} /><span>Deck</span></div>
      </div>
    </Fig>
  );
}

function ExploreFig() {
  const data = useMemo(() => {
    const before = emptyBoard();
    put(before, 'A1', 'town');
    const after = clone(before);
    const notes = runFirst(after, explore(after, card(['SANDS'])));
    return { before, after, notes };
  }, []);
  return (
    <Fig wide caption="Explore with a Sands card. Land 4 gets an Explorer because it is next to the Town in land 1. Land 7 is Sands too, but it is Inland and has no Town or City in or next to it — so nothing arrives there.">
      <BeforeAfter before={data.before} after={data.after} highlight={['A4', 'A7']} zoom={{ space: 'A5', k: 1.5 }} notes={data.notes} />
    </Fig>
  );
}

function BuildFig() {
  const data = useMemo(() => {
    const before = emptyBoard();
    put(before, 'A1', 'explorer');
    put(before, 'A6', 'town');
    const after = clone(before);
    const notes = [...runFirst(after, build(after, space(after, 'A1'), true)), ...runFirst(after, build(after, space(after, 'A6'), true))];
    return { before, after, notes };
  }, []);
  return (
    <Fig wide caption="Build with a Mountain card. Land 1 has only an Explorer, so a Town is built; land 6 has more Towns than Cities, so a City is built. A Mountain with no Invaders would get nothing.">
      <BeforeAfter before={data.before} after={data.after} highlight={['A1', 'A6']} zoom={{ space: 'A1', k: 1.8 }} notes={data.notes} />
    </Fig>
  );
}

function RavageFig() {
  const data = useMemo(() => {
    const before = emptyBoard();
    put(before, 'A5', 'town', 'explorer', 'dahan', 'dahan');
    const after = clone(before);
    const notes = runFirst(after, ravage(after, space(after, 'A5')));
    return { before, after, notes };
  }, []);
  return (
    <Fig
      wide
      caption="Ravage in land 5: the Town and Explorer deal 3 Damage. 2 or more Damage to the land adds Blight. Against the Dahan, 2 Damage destroys one and the last 1 Damage leaves the other damaged (shown upside down). The surviving Dahan then fights back with 2 Damage — here destroying the Town, which also generates 1 Fear."
    >
      <BeforeAfter before={data.before} after={data.after} highlight={['A5']} zoom={{ space: 'A5', k: 2 }} notes={data.notes} />
    </Fig>
  );
}

function CascadeFig() {
  const data = useMemo(() => {
    const before = emptyBoard();
    space(before, 'A6').blight = 1;
    space(before, 'A6').presence[0] = 1;
    const after = clone(before);
    const notes = runFirst(after, addBlight(after, space(after, 'A6'), { why: 'Ravage' }));
    const to = after.spaces.find((s) => s.id !== 'A6' && s.blight > 0)!.id;
    return { before, after, notes, to };
  }, []);
  return (
    <Fig wide caption={`Land 6 already has Blight, so a second Blight Cascades into an adjacent land (here ${data.to}; in play you choose which). Adding Blight also destroyed River's Presence in land 6.`}>
      <BeforeAfter before={data.before} after={data.after} highlight={['A6', data.to]} arrows={[{ from: 'A6', to: data.to, color: '#b07cff' }]} zoom={{ space: 'A6', k: 1.6 }} notes={data.notes} />
    </Fig>
  );
}

function PushGatherFig() {
  const data = useMemo(() => {
    const push = emptyBoard();
    put(push, 'A4', 'explorer');
    put(push, 'A7', 'town');
    put(push, 'A5', 'explorer');
    const gather = emptyBoard();
    put(gather, 'A5', 'dahan', 'dahan', 'dahan');
    return { push, gather };
  }, []);
  return (
    <Fig wide caption="Push moves pieces out of the target land into adjacent lands (left: Wash Away pushed an Explorer and a Town out of land 5). Gather pulls pieces in from adjacent lands (right: 2 Dahan Gathered into land 5 from lands 1 and 6). Each piece moves exactly one land.">
      <div className="fig-pair">
        <div>
          <div className="fig-tag">Push</div>
          <MiniMap gs={data.push} focus={['A5']} arrows={[{ from: 'A5', to: 'A4' }, { from: 'A5', to: 'A7' }]} zoom={{ space: 'A5', k: 1.6 }} />
        </div>
        <div>
          <div className="fig-tag">Gather</div>
          <MiniMap gs={data.gather} focus={['A5']} arrows={[{ from: 'A1', to: 'A5' }, { from: 'A6', to: 'A5' }]} zoom={{ space: 'A5', k: 1.6 }} />
        </div>
      </div>
    </Fig>
  );
}

function PiecesLegend() {
  const row = (label: string, a: React.ReactNode, b: React.ReactNode, info: string) => (
    <div className="piece-row">
      <span className="pr-icons">
        {a}
        {b}
      </span>
      <span>
        <strong>{label}</strong> — {info}
      </span>
    </div>
  );
  return (
    <Fig caption="The pieces as drawn on the map. A damaged Town or City lies on its side and a damaged Dahan is shown upside down — the same convention as the physical game. Numbers on a badge mean several identical pieces.">
      <div className="pieces">
        {row('Explorer', <Explorer size={44} />, null, '1 Health, 1 Damage — any Damage destroys it')}
        {row('Town', <Town size={44} />, <Town size={44} damaged={1} />, '2 Health, 2 Damage, 1 Fear when destroyed (right: damaged)')}
        {row('City', <City size={44} />, <City size={44} damaged={1} />, '3 Health, 3 Damage, 2 Fear when destroyed (right: damaged)')}
        {row('Dahan', <Dahan size={44} />, <Dahan size={44} damaged={1} />, '2 Health, fights back with 2 Damage (right: damaged)')}
        {row('Blight', <Blight size={44} />, null, 'environmental harm; comes from the Blight Card')}
        {row('Presence', <Presence size={40} color="#46a9f5" />, <Presence size={40} color="#46a9f5" sacred />, 'where a Spirit lives (right: Sacred Site)')}
      </div>
    </Fig>
  );
}

function FearFig() {
  return (
    <Fig
      wide
      caption="The Fear track fills one marker per Fear. When it is full, the top Fear Card is earned face-down (it resolves next Invader Phase, at the current Terror Level), and the track empties. Reaching a divider raises the Terror Level at once and makes victory easier."
    >
      <div className="fig-fear">
        <div className="fear-track big">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className={`fear-pip${i < 3 ? ' on' : ''}`} />
          ))}
          <span className="small"> 3 / 4 Fear</span>
        </div>
        <div className="fig-cards">
          <FearCardBack width={90} />
          <img className="fig-scan" src={cardImage('fears', 'scapegoats')} alt="Scapegoats fear card" />
        </div>
        <div className="fig-terror">
          {([1, 2, 3] as const).map((l) => (
            <div key={l}>
              <TerrorLevelIcon level={l} size={52} />
              <span>{['', 'No Invaders', 'No Towns or Cities', 'No Cities'][l]}</span>
            </div>
          ))}
        </div>
      </div>
    </Fig>
  );
}

function BlightCardsFig() {
  return (
    <Fig wide caption="The Blight Card starts on Healthy Island (2 Blight per player, +1). When its last Blight is taken it flips to a random Blighted Island card, which adds more Blight and an ongoing penalty. If that runs out too, the island is lost.">
      <div className="fig-cards">
        <BlightCardArt width={90} flipped={false} />
        <BlightCardArt width={90} flipped />
        <img className="fig-scan" src={cardImage('blights', 'downward-spiral')} alt="Downward Spiral" />
        <img className="fig-scan" src={cardImage('blights', 'memory-fades-to-dust')} alt="Memory Fades to Dust" />
      </div>
    </Fig>
  );
}

function BoardFig() {
  const gs = useMemo(() => emptyBoard(), []);
  const coastal = gs.spaces.filter((s) => s.coastal).map((s) => s.id);
  return (
    <Fig caption="Board A. The glowing lands (1, 2 and 3) touch the Ocean and are Coastal; lands 4–8 are Inland. Every board has 2 of each terrain.">
      <MiniMap gs={gs} highlight={coastal} height={300} />
      <div className="fig-legend">
        {(['JUNGLE', 'MOUNTAIN', 'SANDS', 'WETLAND', 'OCEAN'] as const).map((t) => (
          <span key={t}>
            <TerrainIcon terrain={t} size={28} />
            {t[0] + t.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
    </Fig>
  );
}

function LayoutsFig() {
  const two = useMemo(() => emptyBoard({ spirits: ['river', 'earth'], boards: ['A', 'B'] }), []);
  const four = useMemo(() => emptyBoard({ spirits: ['river', 'earth', 'shadows', 'lightning'], boards: ['A', 'B', 'C', 'D'] }), []);
  return (
    <Fig wide caption="Each player adds a board. Lands on different boards that touch are adjacent, so Powers, Pushes and Cascades cross board edges. Left: 2 players; right: 4 players.">
      <div className="fig-pair">
        <MiniMap gs={two} height={260} />
        <MiniMap gs={four} height={260} />
      </div>
    </Fig>
  );
}

function TerrorFig() {
  return (
    <Fig caption="Victory condition by Terror Level, as shown on the Invader board panel during play.">
      <div className="fig-terror">
        {([1, 2, 3] as const).map((l) => (
          <div key={l}>
            <TerrorLevelIcon level={l} size={56} />
            <span>{['', 'Clear every Invader', 'No Towns or Cities left', 'No Cities left'][l]}</span>
          </div>
        ))}
      </div>
    </Fig>
  );
}

function SpiritPhaseCosts() {
  return (
    <Fig caption="Income and limits: Energy (left) pays for cards and carries over between turns; Card Plays (right) cap how many cards you may play this turn and do not carry over.">
      <div className="fig-legend">
        <span><EnergyIcon size={40} value={2} /> Energy</span>
        <span><CardPlayIcon size={40} value={1} /> Card Plays</span>
      </div>
    </Fig>
  );
}

/** Figures shown under each rules section (by section title). */
export const RULE_FIGURES: Record<string, () => JSX.Element> = {
  Setup: () => <><StartingBoard /><InvaderTrack /></>,
  'Sequence of Play': () => <TurnFlow />,
  'Spirit Phase': () => <><SpiritPanelFig /><SpiritPhaseCosts /><CardAnatomy /></>,
  'Presence & Tracks': () => <><SacredSiteFig /><SpiritPanelFig /></>,
  Powers: () => <><CardAnatomy /><ElementsLegend /><RangeFig /></>,
  'Effects Glossary': () => <><PushGatherFig /><PiecesLegend /></>,
  'Invader Phase': () => <><InvaderTrack /><RavageFig /><BuildFig /><ExploreFig /></>,
  'Fear & Terror': () => <FearFig />,
  Blight: () => <><CascadeFig /><BlightCardsFig /></>,
  'Invaders & Dahan': () => <PiecesLegend />,
  'Boards & Lands': () => <><BoardFig /><LayoutsFig /></>,
  'Victory & Defeat': () => <TerrorFig />,
};
