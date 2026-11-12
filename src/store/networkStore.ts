// Online play: the room lifecycle, lobby, presence and chat, and the match's
// action log. Game-agnostic: the engine's setup and actions pass through as
// opaque JSON. The engine is deterministic, so a match is its start record
// plus the ordered log of actions, and every device replays the same log.
//
// A room holds a lobby (seats, spirits, settings) and a list of matches. The
// lobby's `match` says which one is being played (null = everyone is in the
// lobby). Every device watches that match: `start` is its start record and
// `actions` its log, contiguous from slot 0 (entries that arrive out of order
// are held back until the gap fills), so a device that joins or reloads
// mid-match rebuilds it exactly by replaying from the start. "Play again" is a
// new match; returning to the lobby sets `match` back to null.
//
// Moves are not applied optimistically: `sendAction` claims the first free
// log slot (write-once, by transaction) and the move takes effect on every
// device, the author's included, when it shows up in `actions`.
//
// Ported from the card-collecting project's networkStore (same room layout).
// The transport (Firebase) is loaded lazily on first use so solo play never
// downloads the SDK; tests inject an in-memory one with `setTransport`.

import { create } from 'zustand';
import {
  MAX_ACTION_CHARS,
  MAX_START_CHARS,
  ServerUnreachableError,
  encodeAction,
  generateRoomCode,
  getOrCreateUuid,
  getSavedDisplayName,
  isPermissionDenied,
  isRoomCode,
  isServerUnreachable,
  normalizeRoomCode,
  saveDisplayName,
  setRoomCodeInUrl,
  type ChatMessage,
  type LobbySettings,
  type LobbyState,
  type LoggedAction,
  type NetStatus,
  type Presence,
  type RoomConnection,
  type RoomEvents,
  type RoomTransport,
  type Seat,
  type StartRecord,
} from '../net';

// Set by a Vite `define` if the app adds one (e.g. the commit SHA); 'dev' otherwise.
declare const __APP_BUILD__: string | undefined;
/** The build this page runs (rooms record the build that made them). */
export const APP_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

/** Players at one table. */
export const MAX_SEATS = 4;
export const MAX_NAME_LENGTH = 24;
const MAX_CHAT_TEXT = 500;
const SYSTEM_NAME = 'System';
/** sendAction gives up after this many slots taken by others (or failed writes). */
const SEND_TRIES = 10;
/** How long sendAction waits to see the move that beat it before trying the next slot anyway. */
const CATCH_UP_MS = 5000;
/** Pause before retrying a write that failed on the network (not refused). */
const RETRY_MS = 1000;

const UNREACHABLE_TEXT = "Couldn't reach the game server. Check this device's internet connection, then try again.";
const TABLE_CHANGED = 'The lobby changed while starting. Check the seats and settings, then start again.';

export const DEFAULT_SETTINGS: LobbySettings = { adversary: '', adversaryLevel: 0, boards: [] };

/** Why a join gave up (for a "Try again" button). */
export interface JoinFailure {
  code: string;
  /** notFound: the server has no room with this code. unreachable: this device couldn't reach the server. */
  reason: 'notFound' | 'unreachable';
}

export interface NetworkState {
  status: NetStatus;
  /** The last thing that went wrong (cleared by the next create / join / leave, or clearError). */
  error: string | null;
  me: { uuid: string; name: string };
  roomCode: string | null;
  isHost: boolean;
  lobby: LobbyState | null;
  /** Everyone connected to the room right now (one entry per person). */
  presence: Presence[];
  /** This device's link to the server (false while offline or reconnecting). */
  connected: boolean;
  chat: ChatMessage[];
  /** Start record of the current match (lobby.match), once it has arrived. */
  start: StartRecord | null;
  /** The current match's action log, contiguous from 0 (index = seq). Replaced (not mutated) on change. */
  actions: unknown[];
  /** The match `start` / `actions` belong to (they lag lobby.match until its start record arrives). */
  match: number | null;
  joinFailure: JoinFailure | null;

  /** Your display name (saved on this browser; also renames your seat while the lobby is open). */
  setName(name: string): void;
  /** Open a new room with you as host and first seat. `settings` seeds the lobby's settings. */
  createRoom(settings?: Partial<LobbySettings>): Promise<void>;
  /** Join room `code` (typed codes are normalised); takes a seat while the lobby is open and has room. */
  joinRoom(code: string): Promise<void>;
  /** Join the room of the last failed join again. */
  retryJoin(): Promise<void>;
  /** Leave the room (in the lobby a guest gives up their seat; mid-match seats are kept for a rejoin). */
  leaveRoom(): void;
  clearError(): void;
  /**
   * Edit the lobby atomically. `edit` must be pure: it may run more than once
   * (another device edited at the same moment); return null to change nothing.
   * Failures land in `error`; never rejects.
   */
  updateLobby(edit: (l: LobbyState) => LobbyState | null): Promise<void>;
  takeSeat(): Promise<void>;
  leaveSeat(): Promise<void>;
  /** Pick (or with null, drop) your seat's spirit. A spirit another seat holds is refused (see `error`). */
  chooseSpirit(spirit: string | null): Promise<void>;
  /** Host only: add an AI player (with `spirit`, if no seat holds it yet) while the lobby is open. */
  addAISeat(spirit?: string | null): Promise<void>;
  /** Host only: remove the AI player in seat `uuid`. */
  removeAISeat(uuid: string): Promise<void>;
  /** Host only: pick (or with null, drop) the spirit of the AI player in seat `uuid`. */
  chooseAISpirit(uuid: string, spirit: string | null): Promise<void>;
  /** Host only. */
  setSettings(patch: Partial<LobbySettings>): Promise<void>;
  /**
   * Host only: start the next match (also from a running one: "play again")
   * with the engine's `setup`. Writes the start record into a fresh match slot
   * (lobby.matchCount, i.e. (lobby.match ?? -1) + 1 unless matches were
   * started before), then points lobby.match at it, so every device that sees
   * the new match finds its start record. Refuses (rejects, and sets `error`)
   * if the seats or settings changed since this device last saw the lobby.
   */
  startMatch(setup: unknown): Promise<void>;
  /** Host only: end the match for everyone (lobby.match = null). */
  returnToLobby(): Promise<void>;
  /**
   * Append `action` to the current match's log, at the first free slot at or
   * after actions.length. When another device's move takes the slot first,
   * waits for the log to catch up and tries the next free slot (the engine
   * ignores stale actions deterministically). Resolves once the server holds
   * the move; rejects (and sets `error`) after SEND_TRIES tries, when the
   * server refuses, or when the match ends first. Calls from one device are
   * written one at a time, in call order.
   */
  sendAction(action: unknown): Promise<void>;
  sendChat(text: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// The transport, loaded on first use so the Firebase SDK isn't in the main
// bundle. Tests inject one instead.

let injectedTransport: RoomTransport | null = null;
let transportPromise: Promise<RoomTransport> | null = null;

/** Use `transport` instead of Firebase (tests); null goes back to Firebase. Call before going online. */
export function setTransport(transport: RoomTransport | null): void {
  injectedTransport = transport;
  transportPromise = null;
}

function loadTransport(): Promise<RoomTransport> {
  if (injectedTransport) return Promise.resolve(injectedTransport);
  transportPromise ??= import('../net/firebaseRoom')
    .then((m): RoomTransport => m.getTransport())
    .catch((e: unknown) => {
      transportPromise = null;
      throw new ServerUnreachableError(`Could not load the online code (${(e as Error).message}).`);
    });
  return transportPromise;
}

/** Load the online code and sign in ahead of time (call when the online screen opens). Never throws. */
export function warmUpNetwork(): void {
  loadTransport().then(
    (t) => t.warmUp?.(),
    () => {},
  );
}

// ---------------------------------------------------------------------------
// Pure lobby helpers (exported for the UI and tests).

export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

/** The slot the next match goes in. */
export function nextMatchSlot(lobby: LobbyState): number {
  return lobby.matchCount ?? (lobby.match ?? -1) + 1;
}

/** Why the host can't start this lobby yet, or null when it's ready. */
export function lobbyStartProblem(lobby: LobbyState): string | null {
  const seats = lobby.seats;
  if (seats.length === 0) return 'Nobody is seated yet.';
  if (seats.length > MAX_SEATS) return `At most ${MAX_SEATS} players can play (${seats.length} seated).`;
  if (seats.every((s) => s.ai)) return 'At least one person must take a seat (AI players need company).';
  const waiting = seats.filter((s) => !s.spirit).map((s) => s.name || 'A player');
  if (waiting.length === 1) return `${waiting[0]} hasn't chosen a spirit yet.`;
  if (waiting.length > 1) return `${waiting.join(', ')} haven't chosen spirits yet.`;
  if (new Set(seats.map((s) => s.spirit)).size !== seats.length) return 'Two seats chose the same spirit.';
  const boards = lobby.settings.boards.slice(0, seats.length).filter((b) => b);
  if (new Set(boards).size !== boards.length) return 'Two seats chose the same board.';
  return null;
}

/** Settings with every field well-formed. */
export function sanitizeSettings(s: LobbySettings): LobbySettings {
  const level = Number(s.adversaryLevel);
  const boards = (Array.isArray(s.boards) ? s.boards : [])
    .slice(0, MAX_SEATS)
    .map((b) => (typeof b === 'string' ? b.trim().slice(0, 8) : ''));
  while (boards.length && !boards[boards.length - 1]) boards.pop();
  return {
    adversary: typeof s.adversary === 'string' ? s.adversary.slice(0, 64) : '',
    adversaryLevel: Number.isFinite(level) ? Math.max(0, Math.min(99, Math.floor(level))) : 0,
    boards,
  };
}

/** Seats and settings unchanged (what a start record was built from still holds). */
function sameTable(a: LobbyState, b: LobbyState): boolean {
  return (
    a.hostUuid === b.hostUuid &&
    JSON.stringify(a.seats) === JSON.stringify(b.seats) &&
    JSON.stringify(sanitizeSettings(a.settings)) === JSON.stringify(sanitizeSettings(b.settings))
  );
}

/** `lobby` without seat `index` (its board choice goes with it, so the others keep theirs). */
function withoutSeat(lobby: LobbyState, index: number): LobbyState {
  const boards = lobby.settings.boards.slice();
  if (index < boards.length) boards.splice(index, 1);
  return {
    ...lobby,
    seats: lobby.seats.filter((_, i) => i !== index),
    settings: sanitizeSettings({ ...lobby.settings, boards }),
  };
}

/** Give seat `index` `spirit` (null drops it). `takenBy` names the seat already holding it (then nothing changes). */
function withSpirit(lobby: LobbyState, index: number, spirit: string | null): { lobby: LobbyState | null; takenBy: string | null } {
  if (lobby.match !== null || index < 0 || lobby.seats[index]!.spirit === spirit) return { lobby: null, takenBy: null };
  const holder = spirit === null ? undefined : lobby.seats.find((s, j) => j !== index && s.spirit === spirit);
  if (holder) return { lobby: null, takenBy: holder.name || 'another player' };
  return { lobby: { ...lobby, seats: lobby.seats.map((s, j) => (j === index ? { ...s, spirit } : s)) }, takenBy: null };
}

/** The first free "AI n" name. */
function aiSeatName(seats: Seat[]): string {
  let n = 1;
  while (seats.some((s) => s.name === `AI ${n}`)) n++;
  return `AI ${n}`;
}

function messageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 8 random base-36 characters: enough to tell this device's move from anyone else's. */
function newNonce(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------

export const useNetworkStore = create<NetworkState>((set, get) => {
  const myUuid = getOrCreateUuid();

  // Session state (not reactive). `session` is bumped on every create / join /
  // leave; callbacks from an older session compare against it and do nothing.
  let conn: RoomConnection | null = null;
  let session = 0;
  let lastPresence: Map<string, string> | null = null;

  // The watched match (lobby.match). `watch` is bumped whenever it changes.
  let watch = 0;
  let watchedMatch: number | null = null;
  let stopWatch: (() => void) | null = null;
  let matchStart: StartRecord | null = null;
  /** Contiguous log (actions and their nonces, index = seq). */
  let log: unknown[] = [];
  let nonces: string[] = [];
  /** Entries that arrived ahead of a gap. */
  const inbox = new Map<number, LoggedAction>();
  /** The last slot this device's move landed in (its log entry may not be back yet). */
  let lastMine = -1;
  let publishQueued = false;
  /** sendAction calls waiting to hear about a slot another move took. */
  let waiters: { seq: number; done: () => void }[] = [];
  let sendChain: Promise<unknown> = Promise.resolve();

  function fail(message: string): Error {
    set({ error: message });
    return new Error(message);
  }

  function sysMessage(text: string): ChatMessage {
    return { id: messageId(), byUuid: myUuid, name: SYSTEM_NAME, text, ts: Date.now(), kind: 'system' };
  }

  function addSystem(text: string): void {
    set({ chat: [...get().chat, sysMessage(text)] });
  }

  /** Stop watching the current match and forget its log (what's published stays until replaced). */
  function stopWatching(): void {
    watch++;
    stopWatch?.();
    stopWatch = null;
    watchedMatch = null;
    matchStart = null;
    log = [];
    nonces = [];
    inbox.clear();
    lastMine = -1;
    const w = waiters;
    waiters = [];
    w.forEach((x) => x.done());
  }

  /** End the current session (if any) and start a new one; returns its id. */
  function beginSession(): number {
    session++;
    stopWatching();
    conn?.leave();
    conn = null;
    lastPresence = null;
    return session;
  }

  /** Publish the watched match (start + log) once per tick: a log loads as one update, not thousands. */
  function queuePublish(): void {
    if (publishQueued) return;
    publishQueued = true;
    const w = watch;
    queueMicrotask(() => {
      publishQueued = false;
      if (w === watch) publish();
    });
  }

  function publish(): void {
    if (!matchStart || watchedMatch === null) return;
    const s = get();
    const fresh = s.match !== watchedMatch || s.start !== matchStart;
    if (!fresh && s.actions.length === log.length && s.status === 'playing') return;
    set({
      status: 'playing',
      start: matchStart,
      match: watchedMatch,
      actions: log.slice(),
      ...(fresh ? { error: null } : {}),
    });
    if (fresh) addSystem(s.status === 'lobby' || s.status === 'playing' ? 'The game started' : 'Joined the game in progress');
  }

  function onStart(rec: StartRecord): void {
    if (matchStart) return; // written once; ignore repeats
    matchStart = rec;
    queuePublish();
  }

  function onAction(seq: number, entry: LoggedAction): void {
    if (seq < log.length || inbox.has(seq)) return;
    inbox.set(seq, entry);
    while (inbox.has(log.length)) {
      const next = inbox.get(log.length)!;
      inbox.delete(log.length);
      log.push(next.action);
      nonces.push(next.nonce);
    }
    if (waiters.length) {
      const known = (n: number) => n < log.length || inbox.has(n);
      const ready = waiters.filter((x) => known(x.seq));
      waiters = waiters.filter((x) => !known(x.seq));
      ready.forEach((x) => x.done());
    }
    if (matchStart) queuePublish();
  }

  /** Watch the lobby's current match (or none), dropping the previous one. */
  function followMatch(my: number): void {
    const lobby = get().lobby;
    if (!conn || !lobby || my !== session) return;
    const match = lobby.match;
    if (match === watchedMatch) return;
    stopWatching();
    if (match === null) {
      const s = get();
      if (s.status === 'playing' || s.start) {
        set({ status: 'lobby', start: null, actions: [], match: null });
        if (s.status === 'playing') addSystem('Back in the lobby');
      }
      return;
    }
    // A new match: what's published (a finished match) stays up until its start record lands.
    watchedMatch = match;
    const w = watch;
    stopWatch = conn.watchMatch(match, {
      start: (rec) => my === session && w === watch && onStart(rec),
      action: (seq, entry) => my === session && w === watch && onAction(seq, entry),
    });
  }

  function onLobby(lobby: LobbyState, my: number): void {
    const s = get();
    set({
      lobby,
      isHost: lobby.hostUuid === myUuid,
      // Joining a room mid-match stays "connecting" until the match's start record arrives.
      status: s.status === 'connecting' && lobby.match === null ? 'lobby' : s.status,
    });
    followMatch(my);
  }

  function onChat(msg: ChatMessage): void {
    if (get().chat.some((c) => c.id === msg.id)) return;
    set({ chat: [...get().chat, { ...msg, kind: 'user' }] });
  }

  function onPresence(people: Presence[]): void {
    const now = new Map<string, string>(people.map((p) => [p.uuid, p.name]));
    const lines: string[] = [];
    if (lastPresence) {
      for (const [uuid, name] of now) {
        if (!lastPresence.has(uuid) && uuid !== myUuid) lines.push(`${name || 'A player'} joined`);
      }
      for (const [uuid, name] of lastPresence) {
        if (!now.has(uuid) && uuid !== myUuid) lines.push(`${name || 'A player'} left`);
      }
    }
    lastPresence = now;
    // One entry per person (a device can briefly hold two connections).
    const unique = [...new Map(people.map((p) => [p.uuid, p])).values()];
    set({
      presence: unique,
      chat: lines.length ? [...get().chat, ...lines.map(sysMessage)] : get().chat,
    });
  }

  function roomEvents(my: number): RoomEvents {
    const live = () => my === session;
    return {
      lobby: (lobby) => live() && onLobby(lobby, my),
      chat: (msg) => live() && onChat(msg),
      presence: (people) => live() && onPresence(people),
      connected: (up) => live() && set({ connected: up }),
    };
  }

  /** Run a lobby transaction; failures go to `error`. Resolves with the committed lobby, or null. */
  async function editLobby(edit: (l: LobbyState) => LobbyState | null): Promise<LobbyState | null> {
    const c = conn;
    if (!c) return null;
    try {
      return await c.updateLobby(edit);
    } catch (e) {
      if (c === conn) {
        console.warn('[net] lobby update failed:', errorMessage(e));
        set({ error: isPermissionDenied(e) ? 'The server refused that change.' : UNREACHABLE_TEXT });
      }
      return null;
    }
  }

  /** Take (or keep, renamed) a seat for this device while the lobby is open. */
  function seatEdit(lobby: LobbyState, name: string): LobbyState | null {
    if (lobby.match !== null) return null;
    const i = lobby.seats.findIndex((s) => s.uuid === myUuid);
    if (i >= 0) {
      if (lobby.seats[i]!.name === name) return null;
      return { ...lobby, seats: lobby.seats.map((s, j) => (j === i ? { ...s, name } : s)) };
    }
    if (lobby.seats.length >= MAX_SEATS) return null;
    return { ...lobby, seats: [...lobby.seats, { uuid: myUuid, name, spirit: null }] };
  }

  function failJoin(code: string, reason: JoinFailure['reason']): void {
    beginSession();
    if (reason === 'notFound') setRoomCodeInUrl(null);
    set({
      status: 'error',
      roomCode: null,
      isHost: false,
      connected: false,
      joinFailure: { code, reason },
      error:
        reason === 'notFound'
          ? `There's no room with code ${code}. Check the code with the host (rooms are cleared a week after they're made).`
          : UNREACHABLE_TEXT,
    });
  }

  /** Fresh per-room state. */
  function roomReset(): Partial<NetworkState> {
    return {
      error: null,
      joinFailure: null,
      lobby: null,
      presence: [],
      connected: false,
      chat: [],
      start: null,
      actions: [],
      match: null,
    };
  }

  /** Resolves once slot `seq` is known taken, the match changes, or CATCH_UP_MS pass. */
  function waitForSlot(seq: number): Promise<void> {
    if (seq < log.length || inbox.has(seq)) return Promise.resolve();
    return new Promise((resolve) => {
      const waiter = {
        seq,
        done: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        waiters = waiters.filter((x) => x !== waiter);
        resolve();
      }, CATCH_UP_MS);
      waiters.push(waiter);
    });
  }

  /** The first slot at or after `from` not known to be taken. */
  function firstFree(from: number): number {
    let seq = Math.max(from, log.length);
    while (inbox.has(seq)) seq++;
    return seq;
  }

  async function sendOne(action: unknown): Promise<void> {
    const c = conn;
    const w = watch;
    const match = watchedMatch;
    if (!c || match === null || !matchStart) throw fail("There's no game running to send that move to.");
    const entry: LoggedAction = { action, nonce: newNonce() };
    const size = action === undefined ? 0 : encodeAction(entry).length;
    if (size === 0) throw fail('That move is empty.');
    if (size >= MAX_ACTION_CHARS) throw fail(`That move is too big to send (${size} characters; the limit is ${MAX_ACTION_CHARS}).`);
    const gone = () => w !== watch || c !== conn;
    const left = () => new Error('The game ended before the move was sent.');
    let seq = firstFree(lastMine + 1);
    for (let attempt = 1; ; attempt++) {
      if (gone()) throw left();
      let landed: boolean;
      try {
        landed = await c.appendAction(match, seq, entry);
      } catch (e) {
        if (gone()) throw left();
        if (isPermissionDenied(e)) throw fail(`The server refused that move (${errorMessage(e)}).`);
        if (attempt >= SEND_TRIES) throw fail(UNREACHABLE_TEXT);
        await new Promise((r) => setTimeout(r, RETRY_MS));
        continue; // the same slot: it may well still be free
      }
      if (gone()) throw left();
      if (landed) {
        lastMine = Math.max(lastMine, seq);
        return;
      }
      if (attempt >= SEND_TRIES) {
        throw fail(`Couldn't get that move into the game: other moves kept taking its place (${SEND_TRIES} tries).`);
      }
      // Another device's move took the slot: let the log catch up, then try the next free one.
      await waitForSlot(seq);
      if (gone()) throw left();
      if (nonces[seq] === entry.nonce) {
        lastMine = Math.max(lastMine, seq);
        return;
      }
      seq = firstFree(seq + 1);
    }
  }

  return {
    status: 'offline',
    error: null,
    me: { uuid: myUuid, name: getSavedDisplayName() },
    roomCode: null,
    isHost: false,
    lobby: null,
    presence: [],
    connected: false,
    chat: [],
    start: null,
    actions: [],
    match: null,
    joinFailure: null,

    setName: (raw) => {
      const name = cleanName(raw);
      saveDisplayName(name);
      set({ me: { uuid: myUuid, name } });
      const lobby = get().lobby;
      if (name && conn && lobby?.match === null && lobby.seats.some((s) => s.uuid === myUuid)) {
        void editLobby((l) => (l.seats.some((s) => s.uuid === myUuid) ? seatEdit(l, name) : null));
      }
    },

    createRoom: async (settings) => {
      const name = cleanName(get().me.name) || 'Host';
      const my = beginSession();
      const lobby: LobbyState = {
        hostUuid: myUuid,
        seats: [{ uuid: myUuid, name, spirit: null }],
        settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...settings }),
        match: null,
        matchCount: 0,
      };
      set({ ...roomReset(), status: 'connecting', roomCode: null, isHost: true });
      try {
        const transport = await loadTransport();
        let c: RoomConnection | null = null;
        // A code still in use by a live room is refused; draw another.
        for (let attempt = 0; attempt < 6 && !c && my === session; attempt++) {
          c = await transport.createRoom(
            generateRoomCode(attempt < 3 ? 4 : 5),
            { hostUuid: myUuid, createdAt: Date.now(), build: APP_BUILD },
            lobby,
            { uuid: myUuid, name },
            roomEvents(my),
          );
        }
        if (my !== session) {
          c?.leave();
          return;
        }
        if (!c) throw new Error('Could not find a free room code. Try again.');
        conn = c;
        setRoomCodeInUrl(c.code);
        const s = get();
        set({ roomCode: c.code, lobby: s.lobby ?? lobby, status: s.status === 'connecting' ? 'lobby' : s.status });
        followMatch(my);
      } catch (e) {
        if (my !== session) return;
        console.error('[net] failed to create room', e);
        beginSession();
        set({
          ...roomReset(),
          status: 'error',
          isHost: false,
          error: isServerUnreachable(e) ? UNREACHABLE_TEXT : errorMessage(e),
        });
      }
    },

    joinRoom: async (rawCode) => {
      const code = normalizeRoomCode(rawCode);
      if (!isRoomCode(code)) {
        set({ error: 'A room code is 4 to 6 letters and digits.' });
        return;
      }
      const name = cleanName(get().me.name) || 'Player';
      const my = beginSession();
      set({ ...roomReset(), status: 'connecting', roomCode: code, isHost: false });
      let c: RoomConnection | null;
      try {
        const transport = await loadTransport();
        c = await transport.joinRoom(code, { uuid: myUuid, name }, roomEvents(my));
      } catch (e) {
        if (my !== session) return;
        console.error('[net] failed to join room', e);
        failJoin(code, 'unreachable');
        return;
      }
      if (my !== session) {
        c?.leave();
        return;
      }
      if (!c) {
        failJoin(code, 'notFound');
        return;
      }
      conn = c;
      setRoomCodeInUrl(code);
      if (c.meta.hostUuid === myUuid) set({ isHost: true });
      followMatch(my);
      if (c.meta.build !== APP_BUILD) {
        addSystem(
          `This room was made by another version of the app (${c.meta.build}; this device runs ${APP_BUILD}). ` +
            "If the game stops lining up, reload every device's page.",
        );
      }
      // Take a seat while the lobby is open (rejoining keeps yours).
      await editLobby((l) => seatEdit(l, name));
    },

    retryJoin: async () => {
      const code = get().joinFailure?.code ?? get().roomCode;
      if (code) await get().joinRoom(code);
    },

    leaveRoom: () => {
      const s = get();
      const c = conn;
      conn = null;
      // Leaving the lobby gives up a guest's seat (the host keeps theirs);
      // mid-match every seat is kept, for a rejoin.
      const seated = s.lobby?.seats.some((x) => x.uuid === myUuid);
      if (c && s.lobby?.match === null && !s.isHost && seated) {
        c.updateLobby((l) => {
          const i = l.seats.findIndex((x) => x.uuid === myUuid);
          return l.match !== null || i < 0 ? null : withoutSeat(l, i);
        })
          .catch(() => null)
          .finally(() => c.leave());
      } else {
        c?.leave();
      }
      beginSession();
      setRoomCodeInUrl(null);
      set({ ...roomReset(), status: 'offline', roomCode: null, isHost: false });
    },

    clearError: () => {
      if (get().status === 'error') {
        beginSession();
        setRoomCodeInUrl(null);
        set({ status: 'offline', error: null, joinFailure: null, roomCode: null });
      } else {
        set({ error: null });
      }
    },

    updateLobby: async (edit) => {
      await editLobby(edit);
    },

    takeSeat: async () => {
      const name = cleanName(get().me.name) || 'Player';
      let full = false as boolean;
      await editLobby((l) => {
        full = l.match === null && l.seats.length >= MAX_SEATS && !l.seats.some((s) => s.uuid === myUuid);
        return seatEdit(l, name);
      });
      if (full) set({ error: `The table is full (${MAX_SEATS} players).` });
    },

    leaveSeat: async () => {
      await editLobby((l) => {
        const i = l.seats.findIndex((s) => s.uuid === myUuid);
        return l.match !== null || i < 0 ? null : withoutSeat(l, i);
      });
    },

    chooseSpirit: async (spirit) => {
      let takenBy = null as string | null;
      await editLobby((l) => {
        const r = withSpirit(l, l.seats.findIndex((s) => s.uuid === myUuid), spirit);
        takenBy = r.takenBy;
        return r.lobby;
      });
      if (takenBy) set({ error: `That spirit is already taken by ${takenBy}.` });
    },

    addAISeat: async (spirit = null) => {
      if (!get().isHost) return;
      const uuid = `ai-${newNonce()}`;
      let full = false as boolean;
      await editLobby((l) => {
        full = false;
        if (l.match !== null || l.hostUuid !== myUuid) return null;
        if (l.seats.length >= MAX_SEATS) {
          full = true;
          return null;
        }
        const free = spirit !== null && !l.seats.some((s) => s.spirit === spirit);
        return { ...l, seats: [...l.seats, { uuid, name: aiSeatName(l.seats), spirit: free ? spirit : null, ai: true }] };
      });
      if (full) set({ error: `The table is full (${MAX_SEATS} players).` });
    },

    removeAISeat: async (uuid) => {
      if (!get().isHost) return;
      await editLobby((l) => {
        const i = l.seats.findIndex((s) => s.uuid === uuid && s.ai);
        return l.match !== null || l.hostUuid !== myUuid || i < 0 ? null : withoutSeat(l, i);
      });
    },

    chooseAISpirit: async (uuid, spirit) => {
      if (!get().isHost) return;
      let takenBy = null as string | null;
      await editLobby((l) => {
        takenBy = null;
        if (l.hostUuid !== myUuid) return null;
        const r = withSpirit(l, l.seats.findIndex((s) => s.uuid === uuid && s.ai), spirit);
        takenBy = r.takenBy;
        return r.lobby;
      });
      if (takenBy) set({ error: `That spirit is already taken by ${takenBy}.` });
    },

    setSettings: async (patch) => {
      if (!get().isHost) return;
      await editLobby((l) => {
        if (l.match !== null || l.hostUuid !== myUuid) return null;
        const settings = sanitizeSettings({ ...l.settings, ...patch });
        return JSON.stringify(settings) === JSON.stringify(l.settings) ? null : { ...l, settings };
      });
    },

    startMatch: async (setup) => {
      const c = conn;
      const my = session;
      const s = get();
      const seen = s.lobby;
      if (!c || !seen) throw fail("You're not in a room.");
      if (!s.isHost || seen.hostUuid !== myUuid) throw fail('Only the host can start the game.');
      const problem = lobbyStartProblem(seen);
      if (problem) throw fail(problem);
      if (setup === undefined) throw fail('There is no game setup to start.');
      const record: StartRecord = { setup, hostUuid: myUuid, startedAt: Date.now() };
      const size = JSON.stringify(record).length;
      if (size >= MAX_START_CHARS) {
        throw fail(`The game setup is too big to share (${size} characters; the limit is ${MAX_START_CHARS}).`);
      }
      const from = seen.match;
      const left = () => new Error('Left the room before the game started.');
      let refused = null as string | null;
      // 1. Reserve a fresh match slot (start records are write-once), checking
      //    the table is still the one the setup was built from.
      let slot = -1;
      const reserved = await editLobby((l) => {
        refused = l.match !== from ? 'The game already started.' : !sameTable(l, seen) ? TABLE_CHANGED : null;
        if (refused) return null;
        slot = nextMatchSlot(l);
        return { ...l, matchCount: slot + 1 };
      });
      if (my !== session) throw left();
      if (!reserved) throw fail(refused ?? get().error ?? UNREACHABLE_TEXT);
      // 2. The start record, before anyone is pointed at it.
      try {
        await c.startMatch(slot, record);
      } catch (e) {
        if (my !== session) throw left();
        throw fail(
          isServerUnreachable(e) || !isPermissionDenied(e)
            ? UNREACHABLE_TEXT
            : `The server refused to start the game (${errorMessage(e)}).`,
        );
      }
      if (my !== session) throw left();
      // 3. Point the lobby at the new match (an abandoned slot is harmless).
      const started = await editLobby((l) => {
        refused = l.match !== from ? 'The game already started.' : !sameTable(l, seen) ? TABLE_CHANGED : null;
        return refused ? null : { ...l, match: slot, matchCount: Math.max(nextMatchSlot(l), slot + 1) };
      });
      if (my !== session) throw left();
      if (!started) throw fail(refused ?? get().error ?? UNREACHABLE_TEXT);
    },

    returnToLobby: async () => {
      if (!get().isHost) return;
      await editLobby((l) => (l.match === null || l.hostUuid !== myUuid ? null : { ...l, match: null }));
    },

    sendAction: (action) => {
      const run = sendChain.then(() => sendOne(action));
      sendChain = run.catch(() => {});
      return run;
    },

    sendChat: async (text) => {
      const trimmed = text.trim().slice(0, MAX_CHAT_TEXT);
      const c = conn;
      const s = get();
      if (!trimmed || !c) return;
      const seatName = s.lobby?.seats.find((x) => x.uuid === myUuid)?.name;
      const msg: ChatMessage = {
        id: messageId(),
        byUuid: myUuid,
        name: seatName || s.me.name || 'Player',
        text: trimmed,
        ts: Date.now(),
        kind: 'user',
      };
      // Shown at once; the room's copy is de-duplicated by id.
      set({ chat: [...s.chat, msg] });
      try {
        await c.sendChat(msg);
      } catch (e) {
        console.warn('[net] chat send failed:', errorMessage(e));
        if (c === conn) set({ error: "That chat message didn't reach the room." });
      }
    },
  };
});

/** In a room (connecting, lobby or playing). */
export function isInRoom(status: NetStatus): boolean {
  return status === 'connecting' || status === 'lobby' || status === 'playing';
}

/** Seats whose owner isn't connected right now (AI seats never are). */
export function offlineSeats(seats: Seat[], presence: Presence[]): Seat[] {
  const online = new Set(presence.map((p) => p.uuid));
  return seats.filter((s) => !s.ai && !online.has(s.uuid));
}

/**
 * The device that plays the AI seats: the host while connected, else the first
 * connected person in seat order. Devices may briefly disagree (presence lags);
 * a duplicate AI move is harmless, since the engine drops stale answers.
 */
export function aiRunnerUuid(lobby: LobbyState, presence: Presence[]): string | null {
  if (!lobby.seats.some((s) => s.ai)) return null;
  const here = new Set(presence.map((p) => p.uuid));
  const order = [lobby.hostUuid, ...lobby.seats.filter((s) => !s.ai).map((s) => s.uuid)];
  return order.find((u) => here.has(u)) ?? null;
}
