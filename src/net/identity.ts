// Persistent player identity. The UUID lives in localStorage and is reused
// forever for this browser profile, so a player who reloads or loses signal
// rejoins a room in the same seat. The UUID, not the Firebase sign-in, is what
// owns a seat (Seat.uuid).
//
// For local testing with two windows that share localStorage (two tabs of one
// incognito session), add `?fresh` to the URL: the UUID (and the anonymous
// Firebase sign-in) then live in sessionStorage, one per tab.

const UUID_KEY = 'spirit-island.uuid';
const NAME_KEY = 'spirit-island.displayName';

export function freshTabMode(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('fresh');
  } catch {
    return false;
  }
}

export function getOrCreateUuid(): string {
  try {
    const storage = freshTabMode() ? sessionStorage : localStorage;
    const existing = storage.getItem(UUID_KEY);
    if (existing) return existing;
    const next = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
    storage.setItem(UUID_KEY, next);
    return next;
  } catch {
    return fallbackUuid();
  }
}

export function getSavedDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

function fallbackUuid(): string {
  const rand = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  return `${rand()}-${rand()}-${rand()}-${rand()}`;
}

/** Room-code characters: A–Z and 2–9 without the look-alikes (I, O, 0, 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short, friendly room code (4 characters by default; the rules accept 4–6). */
export function generateRoomCode(length = 4): string {
  let code = '';
  for (let i = 0; i < length; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  return code;
}
