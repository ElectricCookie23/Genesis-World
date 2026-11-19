// Deterministic hashing for things made on demand.
// A citizen, a street or a word is never stored: it is rebuilt from the world's seed and a few
// numbers that identify it, and always comes back the same.
import { RNG, hashSeed } from '../rng';

/** Mix any number of integers into one 32-bit hash. */
export function hash32(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    let k = Math.imul(p | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash of a string (the same function the seed code uses). */
export function hashText(s: string): number {
  return hashSeed(s);
}

/** A hash as a number in [0, 1). */
export function unit(h: number): number {
  return (h >>> 0) / 4294967296;
}

/** A private random stream for one generated thing. */
export function streamFor(...parts: number[]): RNG {
  return new RNG(hash32(...parts));
}
