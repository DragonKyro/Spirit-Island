import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeAction,
  encodeAction,
  isPermissionDenied,
  matchKey,
  parseSeqKey,
  seqKey,
} from '../../src/net/transport';
import { isRoomCode, normalizeRoomCode, roomCodeFromUrl, roomLink, setRoomCodeInUrl } from '../../src/net/roomLink';
import { ROOM_CODE_ALPHABET, freshTabMode, generateRoomCode, getOrCreateUuid } from '../../src/net/identity';
import { memoryStorage } from './harness';

afterEach(() => vi.unstubAllGlobals());

/** A browser-ish window at `href` (node environment has none). */
function stubWindow(href: string) {
  const location = new URL(href);
  const win = {
    location,
    history: {
      state: null,
      replaceState: (_s: unknown, _t: string, next: string) => {
        win.location = new URL(next, win.location.href);
      },
    },
  };
  vi.stubGlobal('window', win);
  return win;
}

describe('log encoding', () => {
  it('slot keys sort in log order and round-trip', () => {
    expect(seqKey(42)).toBe('a000042');
    expect(parseSeqKey(seqKey(3999))).toBe(3999);
    expect(parseSeqKey('a42')).toBeNull();
    expect(matchKey(3)).toBe('m3');
    const keys = [10, 9, 100, 2].map(seqKey).sort();
    expect(keys.map(parseSeqKey)).toEqual([2, 9, 10, 100]);
  });

  it('a logged action is a short JSON string and decodes back', () => {
    const entry = { action: { d: 1, k: 'play', s: 17 }, nonce: 'abcd1234' };
    const value = encodeAction(entry);
    expect(value).toBe('{"a":{"d":1,"k":"play","s":17},"n":"abcd1234"}');
    expect(decodeAction(value)).toEqual(entry);
    expect(decodeAction('not json')).toBeNull();
    expect(decodeAction(JSON.stringify({ n: 'x' }))).toBeNull();
    expect(decodeAction(12)).toBeNull();
  });

  it('tells a refusal from a network failure', () => {
    expect(isPermissionDenied(new Error('PERMISSION_DENIED: Permission denied'))).toBe(true);
    expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true);
    expect(isPermissionDenied(new Error('Disconnected'))).toBe(false);
  });
});

describe('room codes and links', () => {
  it('codes are 4–6 unambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(4);
      expect([...code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[IO01]/);
    expect(generateRoomCode(6)).toHaveLength(6);
    expect(normalizeRoomCode(' ab-cd ')).toBe('ABCD');
    expect(isRoomCode('ABCD')).toBe(true);
    expect(isRoomCode('ABC')).toBe(false);
    expect(isRoomCode('ABCDEFG')).toBe(false);
  });

  it('an invite link stays under the app base path', () => {
    stubWindow('https://klui.github.io/Spirit-Island/?fresh&room=OLD#x');
    expect(roomLink('WXYZ')).toBe('https://klui.github.io/Spirit-Island/?room=WXYZ');
  });

  it('the room code rides in the URL, keeping a bare ?fresh', () => {
    const win = stubWindow('https://klui.github.io/Spirit-Island/?fresh');
    expect(roomCodeFromUrl()).toBeNull();
    setRoomCodeInUrl('ABCD');
    expect(win.location.href).toBe('https://klui.github.io/Spirit-Island/?fresh&room=ABCD');
    expect(roomCodeFromUrl()).toBe('ABCD');
    setRoomCodeInUrl(null);
    expect(win.location.href).toBe('https://klui.github.io/Spirit-Island/?fresh');
  });
});

describe('identity', () => {
  it('one UUID per browser, or per tab with ?fresh', () => {
    const local = memoryStorage();
    const session = memoryStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    stubWindow('https://klui.github.io/Spirit-Island/');
    expect(freshTabMode()).toBe(false);
    const a = getOrCreateUuid();
    expect(getOrCreateUuid()).toBe(a);
    expect(local.getItem('spirit-island.uuid')).toBe(a);

    stubWindow('https://klui.github.io/Spirit-Island/?fresh');
    expect(freshTabMode()).toBe(true);
    const b = getOrCreateUuid();
    expect(b).not.toBe(a);
    expect(session.getItem('spirit-island.uuid')).toBe(b);
    expect(local.getItem('spirit-island.uuid')).toBe(a);
  });
});
