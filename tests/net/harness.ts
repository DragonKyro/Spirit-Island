// Shared set-up for the networkStore tests: every "device" is a fresh copy of
// the store (vi.resetModules), as if on its own phone, all talking to one
// in-memory server (src/net/fakeTransport.ts) instead of Firebase.

import { vi } from 'vitest';

export async function device(uuid: string, name: string) {
  vi.resetModules();
  localStorage.setItem('spirit-island.uuid', uuid);
  localStorage.setItem('spirit-island.displayName', name);
  const mod = await import('../../src/store/networkStore');
  // Same module graph as the store, so its classes match.
  const fake = await import('../../src/net/fakeTransport');
  mod.setTransport(fake.createFakeTransport());
  return {
    uuid,
    name,
    mod,
    net: () => mod.useNetworkStore.getState(),
  };
}
export type Device = Awaited<ReturnType<typeof device>>;

/** Let every write in flight (and the events it triggers) land. */
export async function flush() {
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

export async function hostRoom(name = 'Hana', uuid = 'host-uuid') {
  const host = await device(uuid, name);
  await host.net().createRoom({ adversary: 'england', adversaryLevel: 2 });
  await flush();
  return { host, code: host.net().roomCode! };
}

export async function joinAs(uuid: string, name: string, code: string) {
  const d = await device(uuid, name);
  await d.net().joinRoom(code);
  await flush();
  return d;
}

export const seatNames = (d: Device) => d.net().lobby!.seats.map((s) => s.name);
export const spirits = (d: Device) => d.net().lobby!.seats.map((s) => s.spirit);

/**
 * A room with the host and `guests` seated, every seat with a spirit, and the
 * match started with `setup`. Returns every device (host first).
 */
export async function startedRoom(guests: [string, string][], setup: unknown = { seed: 42 }) {
  const { host, code } = await hostRoom();
  const devices = [host];
  for (const [uuid, name] of guests) devices.push(await joinAs(uuid, name, code));
  const names = ['river', 'earth', 'lightning', 'shadows'];
  for (let i = 0; i < devices.length; i++) await devices[i]!.net().chooseSpirit(names[i]!);
  await flush();
  await host.net().startMatch(setup);
  await flush();
  return { host, code, devices };
}

// Identity lives in localStorage; give each test its own (newer Node ships a
// global localStorage that doesn't work without a file).
export function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (k) => items.get(k) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (k) => void items.delete(k),
    setItem: (k, v) => void items.set(k, String(v)),
  };
}
