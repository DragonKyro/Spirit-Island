// Hidden information. A GameState holds things no player knows (deck orders, the
// cards removed at setup, which Fear Cards were earned, the unflipped Blight Card,
// the RNG). Search must not peek at them, so before simulating ahead the AI calls
// `determinize`: every hidden part is re-dealt from the cards a player hasn't seen,
// using only public information and the given seed.

import { FEAR_CARDS } from './fearCards';
import { BLIGHT_CARD_INFO } from './ops';
import { makeRng, nextInt, shuffled } from './rng';
import type { Rng } from './rng';
import { ALL_INVADER_CARDS } from './setup';
import type { GameState, InvaderCard } from './state';

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sorted = (ids: Iterable<string>) => [...ids].sort();
/** Replace an array's contents in place (running effects may hold the array). */
const refill = <T>(arr: T[], items: T[]) => void arr.splice(0, arr.length, ...items);

/** Invader Cards a player has seen: in the discard, on the Invader Board, or just explored. */
export function seenInvaderCards(gs: GameState): Set<string> {
  const inv = gs.invader;
  return new Set([...inv.discard, ...inv.ravage, ...inv.build, ...(inv.highImmigration ?? []), ...inv.lastExplored].map((c) => c.id));
}

/**
 * Cards that could be in the Invader Deck at each stage (unseen ones; card backs show
 * the stage, so each deck position's stage is public).
 */
export function unseenInvaderCards(gs: GameState): Record<1 | 2 | 3, InvaderCard[]> {
  const seen = seenInvaderCards(gs);
  const out: Record<1 | 2 | 3, InvaderCard[]> = { 1: [], 2: [], 3: [] };
  for (const c of [...ALL_INVADER_CARDS].sort(byId)) if (!seen.has(c.id)) out[c.stage].push(c);
  return out;
}

/** Fear Cards a player hasn't seen face-up (the face-down deck, the earned ones, and those never dealt). */
export function unseenFearCards(gs: GameState): string[] {
  const f = gs.fear;
  const seen = new Set([...f.discard, ...f.revealed]);
  return sorted(FEAR_CARDS.map((c) => c.id).filter((id) => !seen.has(id)));
}

/**
 * Re-deal everything hidden in `gs` (in place), as a player might imagine it, from
 * public information and `seed` only: two states that look the same to the players
 * come out identical. Public parts (stages of Invader Deck positions, Fear Cards
 * turned face-up, card counts, everything on the board) are unchanged.
 */
export function determinize(gs: GameState, seed: number): void {
  const rng: Rng = makeRng(seed);
  const inv = gs.invader;

  // Invader Deck: each position keeps its stage and gets an unseen card of that stage.
  const pools = unseenInvaderCards(gs);
  const deal: Record<1 | 2 | 3, InvaderCard[]> = { 1: shuffled(rng, pools[1]), 2: shuffled(rng, pools[2]), 3: shuffled(rng, pools[3]) };
  refill(inv.deck, inv.deck.map((c) => deal[c.stage].shift() ?? c));

  // Fear: the face-down cards (deck and earned) get unseen cards; face-up ones stay put.
  const f = gs.fear;
  const fear = shuffled(rng, unseenFearCards(gs));
  const redeal = (id: string) => (f.revealed.includes(id) ? id : fear.shift()!);
  refill(f.deck, f.deck.map(redeal));
  refill(f.earned, f.earned.map(redeal));

  // Power decks: what's in them is public (every other card is in a hand, play area or
  // discard), their order isn't.
  refill(gs.minorDeck, shuffled(rng, sorted(gs.minorDeck)));
  refill(gs.majorDeck, shuffled(rng, sorted(gs.majorDeck)));

  // Blight Card: unknown until it flips.
  if (!gs.blight.flipped) {
    const cards = sorted(Object.keys(BLIGHT_CARD_INFO));
    gs.blight.card = cards[nextInt(rng, cards.length)];
  }

  // Future randomness (reshuffles).
  gs.rng.s = makeRng(nextInt(rng, 2 ** 31) + 1).s;
}

/** A seed from public facts only (so the AI's sampled futures don't depend on the real deck order). */
export function publicSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
