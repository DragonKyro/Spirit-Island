import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, injectAction, releaseWrites, resetFakeServer } from '../../src/net/fakeTransport';
import type { LobbyState } from '../../src/net/types';
import { device, flush, hostRoom, joinAs, memoryStorage, seatNames, spirits, startedRoom, type Device } from './harness';

// Online play end to end over an in-memory server: rooms, the lobby, starting
// a match, and the action log. Firebase is never loaded.
vi.mock('../../src/net/firebaseRoom', () => ({
  getTransport: () => {
    throw new Error('tests must not load Firebase');
  },
}));

beforeEach(() => {
  resetFakeServer();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const room = (code: string) => fakeServer().rooms.get(code)!;
const userLines = (d: Device) => d.net().chat.filter((m) => m.kind === 'user').map((m) => `${m.name}: ${m.text}`);

describe('rooms', () => {
  it('the host makes a room and is its first seat', async () => {
    const { host, code } = await hostRoom();
    const s = host.net();
    expect(s.status).toBe('lobby');
    expect(s.isHost).toBe(true);
    expect(s.connected).toBe(true);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(s.lobby).toEqual({
      hostUuid: 'host-uuid',
      seats: [{ uuid: 'host-uuid', name: 'Hana', spirit: null }],
      settings: { adversary: 'england', adversaryLevel: 2, boards: [] },
      match: null,
      matchCount: 0,
    });
    expect(room(code).meta.hostUuid).toBe('host-uuid');
  });

  it('a guest finds the room by a typed code and takes a seat', async () => {
    const { host, code } = await hostRoom();
    const guest = await device('guest-uuid', 'Gus');
    const joining = guest.net().joinRoom(` ${code.toLowerCase()} `);
    expect(guest.net().status).toBe('connecting');
    await joining;
    await flush();
    expect(guest.net().status).toBe('lobby');
    expect(guest.net().isHost).toBe(false);
    expect(guest.net().roomCode).toBe(code);
    expect(seatNames(host)).toEqual(['Hana', 'Gus']);
    expect(guest.net().lobby).toEqual(host.net().lobby);
    expect(host.net().presence.map((p) => p.name).sort()).toEqual(['Gus', 'Hana']);
    expect(host.net().chat.map((m) => m.text)).toContain('Gus joined');
  });

  it('a code with no room is reported, never shown as an empty lobby', async () => {
    const guest = await device('guest-uuid', 'Gus');
    await guest.net().joinRoom('ZZZZ');
    expect(guest.net().status).toBe('error');
    expect(guest.net().joinFailure).toEqual({ code: 'ZZZZ', reason: 'notFound' });
    expect(guest.net().error).toMatch(/no room with code ZZZZ/);
    expect(guest.net().lobby).toBeNull();
  });

  it('a malformed code is refused before going online', async () => {
    const guest = await device('guest-uuid', 'Gus');
    await guest.net().joinRoom('ab');
    expect(guest.net().status).toBe('offline');
    expect(guest.net().error).toMatch(/4 to 6 letters/);
  });

  it('an unreachable server is a network error; retrying once it is back finds the room', async () => {
    const { host, code } = await hostRoom();
    const guest = await device('guest-uuid', 'Gus');
    fakeServer().up = false;
    await guest.net().joinRoom(code);
    expect(guest.net().status).toBe('error');
    expect(guest.net().joinFailure).toEqual({ code, reason: 'unreachable' });
    expect(guest.net().error).toMatch(/Couldn't reach the game server/);

    fakeServer().up = true;
    await guest.net().retryJoin();
    await flush();
    expect(guest.net().status).toBe('lobby');
    expect(guest.net().error).toBeNull();
    expect(seatNames(host)).toEqual(['Hana', 'Gus']);
  });

  it('creating a room while the server is down is an error, not a half-open room', async () => {
    const host = await device('host-uuid', 'Hana');
    fakeServer().up = false;
    await host.net().createRoom();
    expect(host.net().status).toBe('error');
    expect(host.net().error).toMatch(/Couldn't reach the game server/);
    expect(host.net().roomCode).toBeNull();
    host.net().clearError();
    expect(host.net().status).toBe('offline');
  });

  it('cancelling a join stops it', async () => {
    const { code } = await hostRoom();
    const guest = await device('guest-uuid', 'Gus');
    const joining = guest.net().joinRoom(code);
    guest.net().leaveRoom();
    await joining;
    await flush();
    expect(guest.net().status).toBe('offline');
    expect(room(code).listeners.size).toBe(1); // just the host
  });

  it('leaving takes a guest out of the room and its presence; offline again', async () => {
    const { host, code } = await hostRoom();
    const guest = await joinAs('guest-uuid', 'Gus', code);
    guest.net().leaveRoom();
    await flush();
    expect(guest.net()).toMatchObject({ status: 'offline', roomCode: null, lobby: null, connected: false, isHost: false });
    expect(seatNames(host)).toEqual(['Hana']);
    expect(host.net().presence.map((p) => p.uuid)).toEqual(['host-uuid']);
    expect(host.net().chat.map((m) => m.text)).toContain('Gus left');
  });

  it('making a room clears rooms over a week old that nobody is in', async () => {
    const day = 24 * 60 * 60 * 1000;
    const { host: a, code: stale } = await hostRoom('Ann', 'a-uuid');
    a.net().leaveRoom();
    const { code: busy } = await hostRoom('Bea', 'b-uuid'); // still connected
    const { host: c, code: fresh } = await hostRoom('Cy', 'c-uuid');
    c.net().leaveRoom();
    await flush();
    room(stale).meta.createdAt -= 8 * day;
    room(busy).meta.createdAt -= 8 * day;
    await hostRoom('Dee', 'd-uuid');
    expect(fakeServer().rooms.has(stale)).toBe(false);
    expect(fakeServer().rooms.has(busy)).toBe(true);
    expect(fakeServer().rooms.has(fresh)).toBe(true);
    const late = await device('late-uuid', 'Lu');
    await late.net().joinRoom(stale);
    expect(late.net().error).toMatch(/cleared a week after/);
  });

  it('chat reaches everyone once, and a newcomer sees the history', async () => {
    const { host, code } = await hostRoom();
    const guest = await joinAs('guest-uuid', 'Gus', code);
    await guest.net().sendChat('  hello  ');
    await guest.net().sendChat('   ');
    await flush();
    expect(userLines(host)).toEqual(['Gus: hello']);
    expect(userLines(guest)).toEqual(['Gus: hello']);
    const later = await joinAs('late-uuid', 'Lu', code);
    expect(userLines(later)).toEqual(['Gus: hello']);
  });
});

describe('the lobby', () => {
  it('a fifth player watches; a seat that frees up can be taken', async () => {
    const { host, code } = await hostRoom();
    await joinAs('b-uuid', 'Bo', code);
    const cy = await joinAs('c-uuid', 'Cy', code);
    await joinAs('d-uuid', 'Di', code);
    const late = await joinAs('e-uuid', 'Ed', code);
    expect(seatNames(host)).toEqual(['Hana', 'Bo', 'Cy', 'Di']);
    expect(late.net().status).toBe('lobby');
    await late.net().takeSeat();
    expect(late.net().error).toMatch(/table is full/);
    await cy.net().leaveSeat();
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Bo', 'Di']);
    await late.net().takeSeat();
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Bo', 'Di', 'Ed']);
    // Cy is still in the room, watching.
    expect(host.net().presence.map((p) => p.uuid)).toContain('c-uuid');
  });

  it('a spirit belongs to one seat at a time', async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    // Both pick River at the same moment: one gets it.
    await Promise.all([host.net().chooseSpirit('river'), gus.net().chooseSpirit('river')]);
    await flush();
    expect(spirits(host)).toEqual(['river', null]);
    expect(gus.net().error).toMatch(/already taken by Hana/);
    await gus.net().chooseSpirit('earth');
    await flush();
    expect(spirits(gus)).toEqual(['river', 'earth']);
    // Dropping a spirit frees it.
    await host.net().chooseSpirit(null);
    await gus.net().chooseSpirit('river');
    await flush();
    expect(spirits(host)).toEqual([null, 'river']);
  });

  it('only seated players pick spirits; a watcher picking is ignored', async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    await gus.net().leaveSeat();
    await gus.net().chooseSpirit('river');
    await flush();
    expect(host.net().lobby!.seats).toEqual([{ uuid: 'host-uuid', name: 'Hana', spirit: null }]);
  });

  it('only the host edits the settings; they reach everyone, cleaned up', async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    await gus.net().setSettings({ adversary: 'sweden' });
    await flush();
    expect(host.net().lobby!.settings.adversary).toBe('england');

    await host.net().setSettings({ adversary: 'sweden', adversaryLevel: 3.7, boards: ['A', '', ''] });
    await flush();
    expect(gus.net().lobby!.settings).toEqual({ adversary: 'sweden', adversaryLevel: 3, boards: ['A'] });
    await host.net().setSettings({ adversaryLevel: -2 });
    await flush();
    expect(gus.net().lobby!.settings.adversaryLevel).toBe(0);
  });

  it("a seat leaving takes its board choice along, so the others keep theirs", async () => {
    const { host, code } = await hostRoom();
    const bo = await joinAs('b-uuid', 'Bo', code);
    await joinAs('c-uuid', 'Cy', code);
    await host.net().setSettings({ boards: ['A', 'B', 'C'] });
    await flush();
    bo.net().leaveRoom();
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Cy']);
    expect(host.net().lobby!.settings.boards).toEqual(['A', 'C']);
  });

  it('renaming yourself renames your seat', async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    gus.net().setName('  Gussie   G ');
    await flush();
    expect(gus.net().me).toEqual({ uuid: 'guest-uuid', name: 'Gussie G' });
    expect(seatNames(host)).toEqual(['Hana', 'Gussie G']);
    expect(localStorage.getItem('spirit-island.displayName')).toBe('Gussie G');
  });

  it('updateLobby is a transaction; an edit that declines writes nothing', async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    const writes = fakeServer().lobbyWrites;
    await gus.net().updateLobby(() => null);
    expect(fakeServer().lobbyWrites).toBe(writes);
    await gus.net().updateLobby((l) => ({ ...l, seats: [...l.seats].reverse() }));
    await flush();
    expect(seatNames(host)).toEqual(['Gus', 'Hana']);
  });

  it('says why a lobby cannot start yet', async () => {
    const { lobbyStartProblem } = await import('../../src/store/networkStore');
    const lobby = (seats: [string, string | null][], boards: string[] = []): LobbyState => ({
      hostUuid: 'h',
      seats: seats.map(([name, spirit], i) => ({ uuid: `u${i}`, name, spirit })),
      settings: { adversary: '', adversaryLevel: 0, boards },
      match: null,
    });
    expect(lobbyStartProblem(lobby([]))).toMatch(/Nobody is seated/);
    expect(lobbyStartProblem(lobby([['Hana', 'river'], ['Gus', null]]))).toBe("Gus hasn't chosen a spirit yet.");
    expect(lobbyStartProblem(lobby([['Hana', null], ['Gus', null]]))).toBe("Hana, Gus haven't chosen spirits yet.");
    expect(lobbyStartProblem(lobby([['Hana', 'river'], ['Gus', 'earth']], ['A', 'A']))).toMatch(/same board/);
    expect(lobbyStartProblem(lobby([['Hana', 'river'], ['Gus', 'earth']], ['A', '']))).toBeNull();
    expect(lobbyStartProblem(lobby([['Hana', 'river']]))).toBeNull();
  });
});

describe('starting a match', () => {
  it('the host starts the match for everyone with the engine setup', async () => {
    const setup = { seed: 7, spirits: ['river', 'earth'], boards: ['A', 'B'] };
    const { code, devices } = await startedRoom([['guest-uuid', 'Gus']], setup);
    for (const d of devices) {
      expect(d.net().status).toBe('playing');
      expect(d.net().start).toMatchObject({ setup, hostUuid: 'host-uuid' });
      expect(d.net().actions).toEqual([]);
      expect(d.net().match).toBe(0);
      expect(d.net().lobby).toMatchObject({ match: 0, matchCount: 1 });
      expect(d.net().chat.map((m) => m.text)).toContain('The game started');
    }
    expect(JSON.parse(room(code).matches.get(0)!.start!).setup).toEqual(setup);
  });

  it("guests can't start; nor can the host before every seat has a spirit", async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    await host.net().chooseSpirit('river');
    await flush();
    await expect(host.net().startMatch({})).rejects.toThrow(/Gus hasn't chosen a spirit/);
    await gus.net().chooseSpirit('earth');
    await flush();
    await expect(gus.net().startMatch({})).rejects.toThrow(/Only the host/);
    expect(room(code).matches.size).toBe(0);
    expect(host.net().lobby!.match).toBeNull();
  });

  it('refuses when the table changed after the host last looked', async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    await host.net().chooseSpirit('river');
    await gus.net().chooseSpirit('earth');
    await flush();
    // Gus switches spirit; the host presses Start before hearing about it.
    const switching = gus.net().chooseSpirit('lightning');
    await expect(host.net().startMatch({ spirits: ['river', 'earth'] })).rejects.toThrow(/lobby changed/);
    await switching;
    await flush();
    expect(host.net().lobby!.match).toBeNull();
    expect(host.net().status).toBe('lobby');
    // With the new table in view it starts.
    await host.net().startMatch({ spirits: ['river', 'lightning'] });
    await flush();
    expect(gus.net().status).toBe('playing');
  });

  it('a setup over the size limit is refused before writing anything', async () => {
    const { host, code } = await hostRoom();
    await host.net().chooseSpirit('river');
    await flush();
    await expect(host.net().startMatch({ blob: 'x'.repeat(20000) })).rejects.toThrow(/too big/);
    expect(room(code).matches.size).toBe(0);
    expect(host.net().error).toMatch(/too big/);
  });

  it('back to the lobby and a new match: a fresh slot and an empty log', async () => {
    const { host, code, devices } = await startedRoom([['guest-uuid', 'Gus']]);
    const gus = devices[1]!;
    await gus.net().sendAction({ d: 0, k: 'x', s: 0 });
    await flush();
    await gus.net().returnToLobby(); // guests can't
    await flush();
    expect(host.net().status).toBe('playing');

    await host.net().returnToLobby();
    await flush();
    for (const d of devices) {
      expect(d.net()).toMatchObject({ status: 'lobby', start: null, actions: [], match: null });
      expect(d.net().lobby!.match).toBeNull();
    }
    // The lobby is open again: spirits can change.
    await gus.net().chooseSpirit('shadows');
    await flush();
    await host.net().startMatch({ round: 2 });
    await flush();
    for (const d of devices) {
      expect(d.net()).toMatchObject({ status: 'playing', match: 1, actions: [] });
      expect(d.net().start!.setup).toEqual({ round: 2 });
    }
    expect([...room(code).matches.keys()]).toEqual([0, 1]);
  });

  it('play again straight from a running match', async () => {
    const { host, devices } = await startedRoom([['guest-uuid', 'Gus']], { round: 1 });
    await host.net().sendAction({ d: 0, k: 'a', s: 0 });
    await flush();
    await host.net().startMatch({ round: 2 });
    await flush();
    for (const d of devices) {
      expect(d.net()).toMatchObject({ status: 'playing', match: 1, actions: [] });
      expect(d.net().start!.setup).toEqual({ round: 2 });
    }
  });

  it('seats and spirits are frozen while a match runs', async () => {
    const { host, devices } = await startedRoom([['guest-uuid', 'Gus']]);
    const before = host.net().lobby;
    await devices[1]!.net().chooseSpirit('shadows');
    await devices[1]!.net().leaveSeat();
    await host.net().setSettings({ adversary: 'sweden' });
    await flush();
    expect(host.net().lobby).toEqual(before);
  });
});

describe('the action log', () => {
  const act = (d: number, k: string, s: number) => ({ d, k, s });

  it('moves from every device reach every device, in one order', async () => {
    const { devices } = await startedRoom([['b-uuid', 'Bo'], ['c-uuid', 'Cy']]);
    for (let i = 0; i < 9; i++) {
      await devices[i % 3]!.net().sendAction(act(i % 3, 'grow', i));
      await flush();
    }
    const log = devices[0]!.net().actions;
    expect(log).toHaveLength(9);
    expect(log[4]).toEqual(act(1, 'grow', 4));
    for (const d of devices) expect(d.net().actions).toEqual(log);
  });

  it("one device's moves go in the order they were made, even unawaited", async () => {
    const { host, devices } = await startedRoom([['guest-uuid', 'Gus']]);
    const sends = [1, 2, 3, 4].map((n) => host.net().sendAction(act(0, 'k', n)));
    await Promise.all(sends);
    await flush();
    expect(devices[1]!.net().actions).toEqual([1, 2, 3, 4].map((n) => act(0, 'k', n)));
  });

  it('entries arriving out of order are held until the gap fills', async () => {
    const { code, devices } = await startedRoom([['guest-uuid', 'Gus']]);
    const gus = devices[1]!;
    injectAction(code, 0, 2, { action: 'c', nonce: 'n2' });
    injectAction(code, 0, 1, { action: 'b', nonce: 'n1' });
    await flush();
    expect(gus.net().actions).toEqual([]);
    injectAction(code, 0, 0, { action: 'a', nonce: 'n0' });
    await flush();
    expect(gus.net().actions).toEqual(['a', 'b', 'c']);
    // A late joiner gets the whole log at once.
    const late = await joinAs('late-uuid', 'Lu', code);
    expect(late.net().status).toBe('playing');
    expect(late.net().actions).toEqual(['a', 'b', 'c']);
    expect(late.net().chat.map((m) => m.text)).toContain('Joined the game in progress');
  });

  it('a new move goes after entries seen ahead of a gap', async () => {
    const { host, code } = await startedRoom([['guest-uuid', 'Gus']]);
    injectAction(code, 0, 0, { action: 'a', nonce: 'n0' });
    injectAction(code, 0, 2, { action: 'c', nonce: 'n2' });
    await flush();
    expect(host.net().actions).toEqual(['a']);
    // Slot 1 is free; 2 is known taken.
    await host.net().sendAction('b');
    await flush();
    expect(host.net().actions).toEqual(['a', 'b', 'c']);
  });

  it('two devices sending at once: one takes the slot, the other retries at the next', async () => {
    const { host, code, devices } = await startedRoom([['guest-uuid', 'Gus']]);
    const gus = devices[1]!;
    const tried: number[] = [];
    fakeServer().beforeWrite = (_code, _match, seq) => void tried.push(seq);
    fakeServer().holdWrites = true;
    const g = gus.net().sendAction(act(1, 'gus', 0));
    const h = host.net().sendAction(act(0, 'hana', 0));
    await flush();
    releaseWrites();
    await Promise.all([g, h]);
    await flush();
    // Both aimed at slot 0; the loser waited for Gus's move, then took slot 1.
    expect(tried).toEqual([0, 0, 1]);
    expect(host.net().actions).toEqual([act(1, 'gus', 0), act(0, 'hana', 0)]);
    expect(gus.net().actions).toEqual(host.net().actions);
    expect(room(code).matches.get(0)!.actions.size).toBe(2);
    expect(host.net().error).toBeNull();
  });

  it('gives up after ten slots taken by others', async () => {
    const { host, code } = await startedRoom([['guest-uuid', 'Gus']]);
    let rivals = 0;
    fakeServer().beforeWrite = (c, match, seq) => {
      injectAction(c, match, seq, { action: `rival-${rivals++}`, nonce: `r${seq}` });
    };
    await expect(host.net().sendAction('mine')).rejects.toThrow(/10 tries/);
    fakeServer().beforeWrite = null;
    await flush();
    expect(rivals).toBe(10);
    expect(host.net().actions).toHaveLength(10);
    expect(host.net().actions).not.toContain('mine');
    expect(host.net().error).toMatch(/10 tries/);
    // The next move goes through.
    await host.net().sendAction('next');
    await flush();
    expect(host.net().actions[10]).toBe('next');
    expect(room(code).matches.get(0)!.actions.size).toBe(11);
  });

  it('refuses moves outside a match, and moves over the size limit', async () => {
    const { host, code } = await hostRoom();
    await expect(host.net().sendAction('early')).rejects.toThrow(/no game running/);
    await host.net().chooseSpirit('river');
    await flush();
    await host.net().startMatch({});
    await flush();
    await expect(host.net().sendAction('x'.repeat(2000))).rejects.toThrow(/too big/);
    expect(room(code).matches.get(0)!.actions.size).toBe(0);
  });

  it('a move in flight when the match ends is dropped, not written to the next match', async () => {
    const { host, code } = await startedRoom([['guest-uuid', 'Gus']]);
    fakeServer().holdWrites = true;
    const sending = host.net().sendAction('late');
    await host.net().returnToLobby();
    await flush();
    // The held write targeted match 0; it lands there (as the real server would) but the device has moved on.
    releaseWrites();
    await sending.catch(() => {});
    await flush();
    expect(host.net().actions).toEqual([]);
    expect(room(code).matches.get(1)).toBeUndefined();
  });
});

describe('leaving and rejoining', () => {
  it('a player who drops mid-match keeps their seat and gets the game back on rejoining', async () => {
    const { host, code, devices } = await startedRoom([['guest-uuid', 'Gus']]);
    await host.net().sendAction('a');
    await devices[1]!.net().sendAction('b');
    await flush();
    devices[1]!.net().leaveRoom();
    await flush();
    expect(host.net().presence.map((p) => p.uuid)).toEqual(['host-uuid']);
    expect(seatNames(host)).toEqual(['Hana', 'Gus']);

    await host.net().sendAction('c');
    await flush();
    const back = await joinAs('guest-uuid', 'Gus', code);
    expect(back.net().status).toBe('playing');
    expect(back.net().actions).toEqual(['a', 'b', 'c']);
    expect(back.net().lobby!.seats.map((s) => s.uuid)).toEqual(['host-uuid', 'guest-uuid']);
    await back.net().sendAction('d');
    await flush();
    expect(host.net().actions).toEqual(['a', 'b', 'c', 'd']);
  });

  it('the host reloading is the host again', async () => {
    const { host, code, devices } = await startedRoom([['guest-uuid', 'Gus']]);
    host.net().leaveRoom();
    await flush();
    const back = await joinAs('host-uuid', 'Hana', code);
    expect(back.net().isHost).toBe(true);
    expect(back.net().status).toBe('playing');
    await back.net().returnToLobby();
    await flush();
    expect(devices[1]!.net().status).toBe('lobby');
  });

  it('rejoining the lobby keeps your seat and spirit', async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    await gus.net().chooseSpirit('earth');
    await flush();
    // A dropped connection (not a "leave"): the seat stays.
    await gus.net().joinRoom(code);
    await flush();
    expect(host.net().lobby!.seats).toEqual([
      { uuid: 'host-uuid', name: 'Hana', spirit: null },
      { uuid: 'guest-uuid', name: 'Gus', spirit: 'earth' },
    ]);
  });
});
