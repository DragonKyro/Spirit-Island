import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeServer } from '../../src/net/fakeTransport';
import type { StoreApi } from 'zustand';
import type { AdversaryOption, SpiritOption } from '../../src/components/online/OnlineLobby';
import { device, flush, hostRoom, joinAs, memoryStorage, type Device } from './harness';

// A smoke test of the lobby screen: rendered to markup on the server (the
// test environment has no DOM), from a store driven through the fake server.
// Server rendering reads a store's server snapshot (its initial state); here it
// is the live state, so the markup shows what the store holds.
vi.mock('zustand', async (importOriginal) => {
  const z = await importOriginal<typeof import('zustand')>();
  const createStore = z.createStore as unknown as (init: unknown) => StoreApi<unknown> & { getServerState?: () => unknown };
  const create = (init: unknown) => {
    const api = createStore(init);
    api.getServerState = api.getState;
    return Object.assign((selector: (s: unknown) => unknown) => z.useStore(api, selector), api);
  };
  return { ...z, create };
});
vi.mock('../../src/net/firebaseRoom', () => ({
  getTransport: () => {
    throw new Error('tests must not load Firebase');
  },
}));

beforeEach(() => {
  resetFakeServer();
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

const SPIRITS: SpiritOption[] = [
  { id: 'river', name: 'River Surges in Sunlight', color: '#5aa8d4', complexity: 'Low' },
  { id: 'earth', name: 'Vital Strength of the Earth', color: '#a5733a', complexity: 'Low' },
  { id: 'lightning', name: "Lightning's Swift Strike", color: '#f0c84a', complexity: 'Low' },
];
const ADVERSARIES: AdversaryOption[] = [
  { id: 'none', name: 'No Adversary', maxLevel: 0 },
  { id: 'england', name: 'England', maxLevel: 6 },
];

/** Render the lobby as `d` sees it (`d` must be the last device made: the component binds to its store). */
async function render(d: Device): Promise<string> {
  const { useNetworkStore } = await import('../../src/store/networkStore');
  expect(useNetworkStore).toBe(d.mod.useNetworkStore);
  const { default: OnlineLobby } = await import('../../src/components/online/OnlineLobby');
  const { renderToStaticMarkup } = await import('react-dom/server');
  return renderToStaticMarkup(
    <OnlineLobby spirits={SPIRITS} adversaries={ADVERSARIES} boards={['A', 'B', 'C', 'D']} onStart={() => {}} onBack={() => {}} />,
  );
}

const startButton = (html: string) => /<button class="primary"( disabled="")?>Start game<\/button>/.exec(html);

describe('OnlineLobby', () => {
  it('offline: name, create and join', async () => {
    const d = await device('me-uuid', 'Hana');
    const html = await render(d);
    expect(html).toContain('Play online');
    expect(html).toContain('value="Hana"');
    expect(html).toContain('Create room');
    expect(html).toContain('aria-label="Room code"');
  });

  it("the host's view: code, seats, settings, and Start once every seat has a spirit", async () => {
    const { host, code } = await hostRoom();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    await host.net().chooseSpirit('river');
    await flush();

    // The guest's device was made last, so render the guest first.
    let html = await render(gus);
    expect(html).toContain(code);
    expect(html).toContain('Waiting for Hana to start the game.');
    expect(startButton(html)).toBeNull();
    expect(html).toContain('Taken by Hana');
    expect(html).toMatch(/<select class="ol-select" disabled="">/);

    await gus.net().chooseSpirit('earth');
    await flush();
    html = await render(gus);
    expect(html).toContain('Vital Strength of the Earth');
    expect(html).toContain('Players · 2 of 4');
    expect(html).toContain('Open seat');
  });

  it('the host sees Start disabled until ready', async () => {
    const { host } = await hostRoom();
    let html = await render(host);
    expect(html).toContain('Copy invite link');
    expect(html).toContain('>host<');
    expect(startButton(html)?.[1]).toBe(' disabled=""');
    expect(html).toContain("Hana hasn&#x27;t chosen a spirit yet.");
    expect(html).toContain('aria-label="Board for Hana"');

    await host.net().chooseSpirit('lightning');
    await flush();
    html = await render(host);
    expect(startButton(html)).not.toBeNull();
    expect(startButton(html)?.[1]).toBeUndefined();
    expect(html).toContain('1 player ready.');
  });

  it('the host adds an AI player and picks its spirit; guests only see it', async () => {
    const { host, code } = await hostRoom();
    await host.net().chooseSpirit('river');
    await host.net().addAISeat('earth');
    await flush();
    const gus = await joinAs('guest-uuid', 'Gus', code);
    // the guest's device was made last
    let html = await render(gus);
    expect(html).not.toContain('+ Add AI player');
    expect(html).toContain('AI 1');
    expect(html).toContain('>AI<');
    expect(html).toContain('Vital Strength of the Earth');
    expect(html).not.toContain('aria-label="Spirit for AI 1"');
    expect(html).toContain('played on the host&#x27;s device');

    const again = await joinAs('host-uuid', 'Hana', code);
    html = await render(again);
    expect(html).toContain('+ Add AI player');
    expect(html).toContain('aria-label="Spirit for AI 1"');
    expect(html).toContain('aria-label="Remove AI 1"');
    expect(html).toContain('played on your device');
  });
});
