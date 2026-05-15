/**
 * Mulberry32 seeded PRNG.
 * Deterministic: same seed always produces the same sequence.
 */
export function createPRNG(seed: number): () => number {
  let state = seed | 0;
  return function next(): number {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Utility: random float in [min, max)
 */
export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Utility: random integer in [min, max]
 */
export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}
