// Online play against the real Firebase project (github-games-e7c7d, shared
// with other apps; everything here lives under /spirit-island), each "device"
// with its own Firebase app and anonymous sign-in. Skipped unless
// FIREBASE_LIVE=1, and only meaningful once the rules are deployed
// (npm run deploy:rules):
//
//   FIREBASE_LIVE=1 npx vitest run tests/net/networkStore.live.test.ts
//
// The rules don't let clients delete fresh rooms, so it prints the room codes
// it used; remove them afterwards with
// `MSYS_NO_PATHCONV=1 npx firebase-tools database:remove /spirit-island/rooms/<CODE> --force`
// (or leave them: a later room's host sweeps them a week after their day).
// Each run also leaves a few anonymous users in Firebase Auth (harmless).

import { afterAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from './harness';

// (No @types/node here: read the environment through globalThis.)
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const LIVE = env.FIREBASE_LIVE === '1';
const run = Date.now().toString(36);
const rooms: string[] = [];

async function device(name: string) {
  vi.resetModules();
  const uuid = `live-${run}-${name}`;
  localStorage.setItem('spirit-island.uuid', uuid);
  localStorage.setItem('spirit-island.displayName', name);
  const mod = await import('../../src/store/networkStore');
  const firebase = await import('../../src/net/firebaseRoom');
  mod.setTransport(firebase.createFirebaseTransport({ appName: `device-${uuid}`, persistence: 'memory' }));
  return { uuid, name, net: () => mod.useNetworkStore.getState() };
}

const until = (f: () => void, timeout = 20000) => vi.waitFor(f, { timeout, interval: 50 });

afterAll(() => {
  if (rooms.length) console.log(`[live] rooms used: ${rooms.join(', ')}`);
});

describe.skipIf(!LIVE)('online play on the real server', () => {
  it('rooms, lobby, a match with racing moves, chat, a late joiner, back to the lobby', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const host = await device('Hana');
    await host.net().createRoom({ adversary: 'none' });
    await until(() => expect(host.net().status).toBe('lobby'));
    const code = host.net().roomCode!;
    rooms.push(code);

    const guest = await device('Gus');
    await guest.net().joinRoom(code);
    await until(() => expect(host.net().lobby!.seats.map((s) => s.name)).toEqual(['Hana', 'Gus']));
    await until(() => expect(guest.net().connected).toBe(true));
    expect(host.net().presence.map((p) => p.name).sort()).toEqual(['Gus', 'Hana']);

    await Promise.all([host.net().chooseSpirit('river'), guest.net().chooseSpirit('river')]);
    await until(() => expect(host.net().lobby!.seats.filter((s) => s.spirit === 'river')).toHaveLength(1));
    const spare = host.net().lobby!.seats.find((s) => s.spirit === null)!;
    await (spare.uuid === host.uuid ? host : guest).net().chooseSpirit('earth');
    await until(() => expect(host.net().lobby!.seats.every((s) => s.spirit)).toBe(true));

    await host.net().startMatch({ seed: 1, run });
    await until(() => expect(guest.net().status).toBe('playing'));
    expect(guest.net().start!.setup).toEqual({ seed: 1, run });

    // Both move at once: one takes slot 0, the other retries at slot 1.
    await Promise.all([
      host.net().sendAction({ d: 0, k: 'h', s: 0 }),
      guest.net().sendAction({ d: 1, k: 'g', s: 0 }),
    ]);
    for (let i = 1; i <= 10; i++) await (i % 2 ? host : guest).net().sendAction({ d: i % 2 ? 0 : 1, k: 'n', s: i });
    await until(() => expect(guest.net().actions).toHaveLength(12));
    await until(() => expect(host.net().actions).toEqual(guest.net().actions));

    await guest.net().sendChat('hello');
    await until(() => expect(host.net().chat.some((m) => m.kind === 'user' && m.text === 'hello')).toBe(true));

    const late = await device('Lu');
    await late.net().joinRoom(code);
    await until(() => expect(late.net().status).toBe('playing'));
    await until(() => expect(late.net().actions).toEqual(host.net().actions));

    await host.net().returnToLobby();
    await until(() => expect(guest.net().status).toBe('lobby'));
    await until(() => expect(late.net().status).toBe('lobby'));

    for (const d of [late, guest, host]) d.net().leaveRoom();
    expect(host.net().status).toBe('offline');
    vi.unstubAllGlobals();
  }, 120000);
});
