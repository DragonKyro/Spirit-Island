// What a room stores and what devices exchange through it. Every payload is
// JSON-serializable. The game itself (setup, actions) is opaque to this layer:
// the engine is deterministic, so a match is fully described by its start
// record plus the ordered action log, and every device replays the same log.

/** networkStore's view of this device's place in the online world. */
export type NetStatus = 'offline' | 'connecting' | 'lobby' | 'playing' | 'error';

/** One player at the table. Seat order is player order. */
export interface Seat {
  /** The owner's per-browser UUID (see identity.ts). */
  uuid: string;
  name: string;
  /** Chosen spirit id; null until picked. A spirit belongs to at most one seat. */
  spirit: string | null;
}

export interface LobbySettings {
  adversary: string;
  adversaryLevel: number;
  /**
   * Board letter per seat (index = seat index). '' or a missing entry means
   * "random" for that seat; an empty array means all random.
   */
  boards: string[];
}

/**
 * The room's lobby. Edited by transaction, so guests seat themselves and pick
 * spirits while the host edits the settings; between matches it's also where
 * the next match is set up.
 */
export interface LobbyState {
  hostUuid: string;
  /** At most MAX_SEATS (4) players; seat order = player order. */
  seats: Seat[];
  settings: LobbySettings;
  /** The match being played (its slot under `matches/`), null while everyone is in the lobby. */
  match: number | null;
  /**
   * Matches started so far, i.e. the next match's slot. Optional so a
   * hand-built LobbyState still type-checks; treated as `(match ?? -1) + 1`
   * when missing. (Start records are write-once, so a match slot is never
   * reused after returning to the lobby.)
   */
  matchCount?: number;
}

export interface ChatMessage {
  id: string;
  byUuid: string;
  name: string;
  text: string;
  ts: number;
  /** System lines (joins, leaves, game start) are made on each device, never sent. */
  kind: 'user' | 'system';
}

/** Written once, by the host, when the room is made. */
export interface RoomMeta {
  hostUuid: string;
  createdAt: number;
  /** The app build that made the room (devices on another build may not stay in step). */
  build: string;
}

/**
 * How a match began: the engine's setup (opaque here), written once by the
 * host. Stored as a JSON string under 20000 characters.
 */
export interface StartRecord {
  setup: unknown;
  /** Filled in by networkStore.startMatch. */
  hostUuid?: string;
  /** When the host started the match (ms since epoch). Filled in by networkStore.startMatch. */
  startedAt?: number;
}

/** One move in a match's action log (stored as a JSON string under 2000 characters). */
export interface LoggedAction {
  action: unknown;
  /** Short random id, so the author recognises its own move in the log. */
  nonce: string;
}

/** A device connected to the room right now. */
export interface Presence {
  uuid: string;
  name: string;
}
