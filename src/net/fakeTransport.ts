// Test-only: an in-memory stand-in for firebaseRoom.ts. Inject it with
// networkStore's `setTransport(createFakeTransport())`, or swap the module
// (vi.mock('<path>/net/firebaseRoom', () => import('<path>/net/fakeTransport'))).
//
// Each "device" in a test is its own module graph (vi.resetModules) with its
// own stores; they all share one server on globalThis, which behaves like the
// Realtime Database as the app uses it: write-once start records and log
// slots, atomic lobby edits, presence that disappears when a device leaves,
// payloads through JSON (with the rules' size limits), and every event
// delivered asynchronously (the author's own writes too).
//
// Knobs for tests:
//   fakeServer().up = false          a device can't reach the server
//   fakeServer().holdWrites = true   queue log writes until releaseWrites(), so devices race for a slot
//   fakeServer().beforeWrite = f     called just before each log write lands (e.g. to plant a rival move)
//   injectAction(code, match, seq, entry)   a log entry from "another device", in any order
// Not imported by production code.

import {
  DAY_MS,
  MAX_ACTION_CHARS,
  MAX_CHAT_CHARS,
  MAX_LOBBY_CHARS,
  MAX_START_CHARS,
  ROOM_LIFETIME_MS,
  SWEEP_DAYS,
  ServerUnreachableError,
  decodeAction,
  encodeAction,
  type MatchEvents,
  type RoomConnection,
  type RoomEvents,
  type RoomTransport,
} from './transport';
import type { LobbyState, LoggedAction, Presence, RoomMeta, StartRecord } from './types';

interface Listener {
  id: number;
  me: Presence;
  events: RoomEvents;
}

interface MatchWatcher {
  id: number;
  listener: number;
  events: MatchEvents;
}

export interface FakeMatch {
  start: string | null;
  actions: Map<number, string>;
}

export interface FakeRoom {
  meta: RoomMeta;
  lobby: string;
  matches: Map<number, FakeMatch>;
  chat: string[];
  listeners: Map<number, Listener>;
  watchers: Map<number, Map<number, MatchWatcher>>;
}

export interface FakeServer {
  rooms: Map<string, FakeRoom>;
  up: boolean;
  holdWrites: boolean;
  held: (() => void)[];
  nextId: number;
  /** Runs just before a log write lands (after any hold), with the slot it's aimed at. */
  beforeWrite: ((code: string, match: number, seq: number) => void) | null;
  /** Lobby transactions committed so far (to check a no-op edit wrote nothing). */
  lobbyWrites: number;
}

const KEY = '__spiritIslandFakeServer';

export function fakeServer(): FakeServer {
  const g = globalThis as unknown as Record<string, FakeServer | undefined>;
  return (g[KEY] ??= {
    rooms: new Map(),
    up: true,
    holdWrites: false,
    held: [],
    nextId: 0,
    beforeWrite: null,
    lobbyWrites: 0,
  });
}

export function resetFakeServer(): void {
  delete (globalThis as unknown as Record<string, FakeServer | undefined>)[KEY];
}

/** Let held log writes reach the server, in the order they were made. */
export function releaseWrites(): void {
  const s = fakeServer();
  s.holdWrites = false;
  const held = s.held.splice(0);
  held.forEach((f) => f());
}

const later = (f: () => void) => {
  void Promise.resolve().then(f);
};

const denied = (why: string) => new Error(`PERMISSION_DENIED: ${why}`);

function presenceOf(room: FakeRoom): Presence[] {
  return [...room.listeners.values()].map((l) => ({ ...l.me }));
}

function broadcast(room: FakeRoom, f: (l: Listener) => void): void {
  for (const l of [...room.listeners.values()]) later(() => room.listeners.has(l.id) && f(l));
}

function matchOf(room: FakeRoom, match: number): FakeMatch {
  let m = room.matches.get(match);
  if (!m) {
    m = { start: null, actions: new Map() };
    room.matches.set(match, m);
  }
  return m;
}

function watchersOf(room: FakeRoom, match: number): Map<number, MatchWatcher> {
  let w = room.watchers.get(match);
  if (!w) {
    w = new Map();
    room.watchers.set(match, w);
  }
  return w;
}

function toWatchers(room: FakeRoom, match: number, f: (w: MatchWatcher) => void): void {
  const ws = watchersOf(room, match);
  for (const w of [...ws.values()]) later(() => ws.has(w.id) && room.listeners.has(w.listener) && f(w));
}

function requireServer(): FakeServer {
  const s = fakeServer();
  if (!s.up) throw new ServerUnreachableError('Fake server is down.');
  return s;
}

/** Store `value` in slot `seq` and tell the watchers (the slot must be free). */
function landAction(room: FakeRoom, match: number, seq: number, value: string): void {
  matchOf(room, match).actions.set(seq, value);
  toWatchers(room, match, (w) => w.events.action(seq, decodeAction(value)!));
}

/**
 * A log entry written by some other device, straight into slot `seq` (any
 * slot, any order: tests use it for out-of-order delivery and rival moves).
 * Returns false when the slot is already taken.
 */
export function injectAction(code: string, match: number, seq: number, entry: LoggedAction): boolean {
  const room = fakeServer().rooms.get(code);
  if (!room) throw new Error(`No fake room ${code}`);
  if (matchOf(room, match).actions.has(seq)) return false;
  landAction(room, match, seq, encodeAction(entry));
  return true;
}

function open(code: string, room: FakeRoom, me: Presence, events: RoomEvents): RoomConnection {
  const server = fakeServer();
  const id = server.nextId++;
  const listener: Listener = { id, me: { ...me }, events };
  room.listeners.set(id, listener);
  const mine = new Set<() => void>();

  // Initial load, as the database's listeners deliver it.
  later(() => {
    if (!room.listeners.has(id)) return;
    events.connected(true);
    events.lobby(JSON.parse(room.lobby) as LobbyState);
    room.chat.forEach((json) => events.chat(JSON.parse(json)));
  });
  broadcast(room, (l) => l.events.presence(presenceOf(room)));

  return {
    code,
    meta: { ...room.meta },
    updateLobby: async (edit) => {
      requireServer();
      const next = edit(JSON.parse(room.lobby) as LobbyState);
      if (!next) return null;
      const json = JSON.stringify(next);
      if (json.length >= MAX_LOBBY_CHARS) throw denied('lobby too long');
      room.lobby = json;
      server.lobbyWrites++;
      broadcast(room, (l) => l.events.lobby(JSON.parse(json) as LobbyState));
      return JSON.parse(json) as LobbyState;
    },
    watchMatch: (match, matchEvents) => {
      const watcher: MatchWatcher = { id: server.nextId++, listener: id, events: matchEvents };
      const ws = watchersOf(room, match);
      ws.set(watcher.id, watcher);
      later(() => {
        if (!ws.has(watcher.id)) return;
        const m = room.matches.get(match);
        if (!m) return;
        if (m.start) matchEvents.start(JSON.parse(m.start) as StartRecord);
        [...m.actions.entries()]
          .sort((a, b) => a[0] - b[0])
          .forEach(([seq, value]) => matchEvents.action(seq, decodeAction(value)!));
      });
      const stop = () => {
        ws.delete(watcher.id);
        mine.delete(stop);
      };
      mine.add(stop);
      return stop;
    },
    startMatch: async (match, record) => {
      requireServer();
      const m = matchOf(room, match);
      if (m.start) throw denied('already started');
      if (me.uuid !== room.meta.hostUuid) throw denied('not the host');
      const json = JSON.stringify(record);
      if (json.length >= MAX_START_CHARS) throw denied('start record too long');
      m.start = json;
      toWatchers(room, match, (w) => w.events.start(JSON.parse(json) as StartRecord));
    },
    appendAction: (match, seq, entry) =>
      new Promise<boolean>((resolve, reject) => {
        const write = () => {
          if (!fakeServer().up) {
            reject(new ServerUnreachableError());
            return;
          }
          fakeServer().beforeWrite?.(code, match, seq);
          const m = room.matches.get(match);
          if (!m?.start) {
            reject(denied('not started'));
            return;
          }
          const value = encodeAction(entry);
          if (value.length >= MAX_ACTION_CHARS) {
            reject(denied('action too long'));
            return;
          }
          if (m.actions.has(seq)) {
            // Like the real transport: our own earlier write counts as ours.
            resolve(m.actions.get(seq) === value);
            return;
          }
          landAction(room, match, seq, value);
          resolve(true);
        };
        if (fakeServer().holdWrites) fakeServer().held.push(write);
        else later(write);
      }),
    sendChat: async (msg) => {
      requireServer();
      const json = JSON.stringify(msg);
      if (json.length >= MAX_CHAT_CHARS) throw denied('chat line too long');
      room.chat.push(json);
      broadcast(room, (l) => l.events.chat(JSON.parse(json)));
    },
    leave: () => {
      [...mine].forEach((stop) => stop());
      if (!room.listeners.delete(id)) return;
      broadcast(room, (l) => l.events.presence(presenceOf(room)));
    },
  };
}

export function createFakeTransport(): RoomTransport & { warmUp: () => void } {
  return {
    warmUp: () => {},
    createRoom: async (code, meta, lobby, me, events) => {
      const server = requireServer();
      if (server.rooms.has(code)) return null;
      const room: FakeRoom = {
        meta: { ...meta },
        lobby: JSON.stringify(lobby),
        matches: new Map(),
        chat: [],
        listeners: new Map(),
        watchers: new Map(),
      };
      server.rooms.set(code, room);
      // Like the real transport: the new room's host looks at the SWEEP_DAYS
      // oldest days of rooms and, in those that ended over a week ago, clears
      // the rooms nobody is in.
      const day = (t: number) => Math.floor(t / DAY_MS);
      const cutoff = Date.now() - ROOM_LIFETIME_MS;
      const stale = [...new Set([...server.rooms.values()].map((r) => day(r.meta.createdAt)))]
        .sort((a, b) => a - b)
        .slice(0, SWEEP_DAYS)
        .filter((d) => (d + 1) * DAY_MS <= cutoff);
      for (const [c, r] of [...server.rooms]) {
        if (stale.includes(day(r.meta.createdAt)) && r.listeners.size === 0) server.rooms.delete(c);
      }
      return open(code, room, me, events);
    },
    joinRoom: async (code, me, events) => {
      const server = requireServer();
      const room = server.rooms.get(code);
      return room ? open(code, room, me, events) : null;
    },
  };
}

let instance: ReturnType<typeof createFakeTransport> | null = null;

/** Same export as firebaseRoom.ts, so the module can be swapped in with vi.mock. */
export function getTransport() {
  return (instance ??= createFakeTransport());
}
