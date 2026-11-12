// URLs of the official card scans in public/cards/ (base game only), named by engine id.
// Scans come from the community Spirit Island Card Katalog; card art © Greater Than Games.

export type CardImageKind = 'powers' | 'fears' | 'blights';

export function cardImage(kind: CardImageKind, id: string): string {
  return `${import.meta.env.BASE_URL}cards/${kind}/${id}.jpg`;
}
