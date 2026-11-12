// Seeded PRNG (mulberry32). Its whole state is one 32-bit number kept in GameState,
// so a game is reproducible from its seed and action log on every device.

export interface Rng {
  s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 || 0x9e3779b9 };
}

/** Uniform float in [0, 1). */
export function nextFloat(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(r: Rng, n: number): number {
  return Math.floor(nextFloat(r) * n);
}

/** Fisher–Yates; returns a new array. */
export function shuffled<T>(r: Rng, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = nextInt(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
