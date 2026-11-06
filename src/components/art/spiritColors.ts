export type SpiritKey = 'lightning' | 'river' | 'earth' | 'shadows' | 'thunderspeaker' | 'green' | 'ocean' | 'bringer';

/** Presence colours: mutually distinct and bright enough to read on every terrain (pieces get a dark outline). */
export const SPIRIT_COLORS: Record<SpiritKey, string> = {
  lightning: '#f5d327',
  river: '#46a9f5',
  earth: '#c0814a',
  shadows: '#9d5cf0',
  thunderspeaker: '#ff7f2a',
  green: '#62d64e',
  ocean: '#22d3c0',
  bringer: '#f07ad4',
};
