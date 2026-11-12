// Dev-only showcase of every piece, icon, card and emblem at several sizes.
import type { CSSProperties, ReactNode } from 'react';
import Explorer from '../board/sprites/Explorer';
import Town from '../board/sprites/Town';
import City from '../board/sprites/City';
import Dahan from '../board/sprites/Dahan';
import Blight from '../board/sprites/Blight';
import Presence from '../board/sprites/Presence';
import FearIcon from './FearIcon';
import EnergyIcon from './EnergyIcon';
import CardPlayIcon from './CardPlayIcon';
import ReclaimIcon from './ReclaimIcon';
import FastIcon from './FastIcon';
import SlowIcon from './SlowIcon';
import DefendIcon from './DefendIcon';
import RangeIcon from './RangeIcon';
import SacredSiteIcon from './SacredSiteIcon';
import TerrorLevelIcon from './TerrorLevelIcon';
import ElementIcon, { type ElementKind } from './ElementIcon';
import TerrainIcon from './TerrainIcon';
import TerrainDefs from './TerrainDefs';
import InvaderCardArt from './InvaderCardArt';
import FearCardBack from './FearCardBack';
import BlightCardArt from './BlightCardArt';
import SpiritEmblem from './SpiritEmblem';
import Logo from './Logo';
import { FAVICON_DATA_URI } from './favicon';
import { SPIRIT_COLORS, type SpiritKey } from './spiritColors';
import { TERRAIN_BASE_COLORS, type TerrainKind } from './terrainColors';

type Entry = [label: string, draw: (size: number) => ReactNode];

const PIECES: Entry[] = [
  ['Explorer', (s) => <Explorer size={s} />],
  ['Explorer (dmg)', (s) => <Explorer size={s} damaged={1} />],
  ['Town', (s) => <Town size={s} />],
  ['Town (dmg)', (s) => <Town size={s} damaged={1} />],
  ['City', (s) => <City size={s} />],
  ['City (dmg)', (s) => <City size={s} damaged={2} />],
  ['Dahan', (s) => <Dahan size={s} />],
  ['Dahan (dmg)', (s) => <Dahan size={s} damaged={1} />],
  ['Blight', (s) => <Blight size={s} />],
  ['Presence', (s) => <Presence size={s} color={SPIRIT_COLORS.river} />],
  ['Sacred site', (s) => <Presence size={s} color={SPIRIT_COLORS.lightning} sacred />],
];

const ICONS: Entry[] = [
  ['Fear', (s) => <FearIcon size={s} />],
  ['Energy', (s) => <EnergyIcon size={s} />],
  ['Energy 3', (s) => <EnergyIcon size={s} value={3} />],
  ['Card plays 2', (s) => <CardPlayIcon size={s} value={2} />],
  ['Reclaim', (s) => <ReclaimIcon size={s} />],
  ['Fast', (s) => <FastIcon size={s} />],
  ['Slow', (s) => <SlowIcon size={s} />],
  ['Defend 4', (s) => <DefendIcon size={s} value={4} />],
  ['Range 1', (s) => <RangeIcon size={s} value={1} />],
  ['Range', (s) => <RangeIcon size={s} />],
  ['Sacred site', (s) => <SacredSiteIcon size={s} />],
  ...([1, 2, 3] as const).map((l): Entry => [`Terror ${l}`, (s) => <TerrorLevelIcon size={s} level={l} />]),
];

const ELEMENTS: ElementKind[] = ['SUN', 'MOON', 'FIRE', 'AIR', 'WATER', 'EARTH', 'PLANT', 'ANIMAL'];
const TERRAINS: TerrainKind[] = ['JUNGLE', 'MOUNTAIN', 'SANDS', 'WETLAND', 'OCEAN'];
const SPIRITS = Object.keys(SPIRIT_COLORS) as SpiritKey[];

const page: CSSProperties = { padding: 24, background: '#d9c9a0', color: '#1c130e', minHeight: '100%', fontFamily: 'Georgia, serif' };
const grid: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' };
const cell: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 11 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 18, borderBottom: '1px solid #8a7450' }}>{title}</h2>
      <div style={grid}>{children}</div>
    </section>
  );
}

function Sized({ entries, sizes }: { entries: Entry[]; sizes: number[] }) {
  return (
    <>
      {entries.map(([label, draw]) => (
        <div key={label} style={cell}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            {sizes.map((s) => (
              <span key={s}>{draw(s)}</span>
            ))}
          </div>
          {label}
        </div>
      ))}
    </>
  );
}

/** Each terrain pattern (plain + blighted) with pieces on top, to check contrast. */
function TerrainSwatch({ terrain }: { terrain: TerrainKind }) {
  const t = terrain.toLowerCase();
  const pieces = [
    <Explorer size={28} />, <Town size={28} />, <City size={32} />, <Dahan size={28} />, <Blight size={28} />,
    ...SPIRITS.slice(0, 4).map((k) => <Presence size={24} color={SPIRIT_COLORS[k]} />),
  ];
  return (
    <div style={cell}>
      <svg width={300} height={110} viewBox="0 0 300 110" style={{ background: TERRAIN_BASE_COLORS[terrain] }}>
        <rect width="300" height="110" fill={`url(#terrain-${t})`} />
        <rect y="55" width="300" height="55" fill="url(#terrain-blighted-overlay)" />
        {pieces.map((p, i) => (
          <g key={i} transform={`translate(${8 + (i % 9) * 32} 12)`}>{p}</g>
        ))}
        {pieces.map((p, i) => (
          <g key={`b${i}`} transform={`translate(${8 + (i % 9) * 32} 68)`}>{p}</g>
        ))}
      </svg>
      {terrain} / blighted
    </div>
  );
}

export default function ArtGallery() {
  return (
    <div style={page}>
      <TerrainDefs />
      <Section title="Logo & favicon">
        <Logo width={420} />
        <Logo width={220} />
        {[16, 32, 64].map((s) => (
          <img key={s} src={FAVICON_DATA_URI} width={s} height={s} alt="favicon" />
        ))}
      </Section>
      <Section title="Pieces (16 / 24 / 40 / 96)">
        <Sized entries={PIECES} sizes={[16, 24, 40, 96]} />
      </Section>
      <Section title="Presence colours">
        {SPIRITS.map((k) => (
          <div key={k} style={cell}>
            <div>
              <Presence size={40} color={SPIRIT_COLORS[k]} />
              <Presence size={40} color={SPIRIT_COLORS[k]} sacred />
            </div>
            {k} {SPIRIT_COLORS[k]}
          </div>
        ))}
      </Section>
      <Section title="Terrain patterns">
        {TERRAINS.map((t) => (
          <TerrainSwatch key={t} terrain={t} />
        ))}
      </Section>
      <Section title="Icons (16 / 24 / 40 / 96)">
        <Sized entries={ICONS} sizes={[16, 24, 40, 96]} />
      </Section>
      <Section title="Elements & terrains (16 / 24 / 40 / 72)">
        <Sized entries={ELEMENTS.map((e): Entry => [e, (s) => <ElementIcon size={s} element={e} />])} sizes={[16, 24, 40, 72]} />
        <Sized entries={TERRAINS.map((t): Entry => [t, (s) => <TerrainIcon size={s} terrain={t} />])} sizes={[16, 24, 40, 72]} />
      </Section>
      <Section title="Cards (60 / 120)">
        {(
          [
            ['Jungle I', (w) => <InvaderCardArt width={w} terrains={['JUNGLE']} stage={1} />],
            ['Coastal II (esc)', (w) => <InvaderCardArt width={w} terrains={['COASTAL']} stage={2} escalation />],
            ['Mountain+Wetland III', (w) => <InvaderCardArt width={w} terrains={['MOUNTAIN', 'WETLAND']} stage={3} />],
            ['Back II', (w) => <InvaderCardArt width={w} terrains={[]} stage={2} revealed={false} />],
            ['Fear back', (w) => <FearCardBack width={w} />],
            ['Blight healthy', (w) => <BlightCardArt width={w} flipped={false} />],
            ['Blight flipped', (w) => <BlightCardArt width={w} flipped />],
          ] as Entry[]
        ).map(([label, draw]) => (
          <div key={label} style={cell}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              {draw(60)}
              {draw(120)}
            </div>
            {label}
          </div>
        ))}
      </Section>
      <Section title="Spirit emblems (40 / 64 / 128)">
        <Sized entries={SPIRITS.map((k): Entry => [k, (s) => <SpiritEmblem spirit={k} size={s} />])} sizes={[40, 64, 128]} />
      </Section>
    </div>
  );
}
