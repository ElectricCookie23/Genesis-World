// Seeded PRNG (mulberry32). All simulation randomness goes through here.

export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export class RNG {
  state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Standard normal via Box-Muller. */
  gauss(): number {
    let u = this.next();
    if (u < 1e-12) u = 1e-12;
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]!;
  }
  /** Independent stream derived from this one and a label. */
  fork(label: string): RNG {
    return new RNG((hashSeed(label) ^ Math.imul(this.state, 2654435761)) >>> 0);
  }
  unitVector(): [number, number, number] {
    const z = this.range(-1, 1);
    const a = this.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), z, r * Math.sin(a)];
  }
}

const SEED_WORDS = [
  'amber', 'basalt', 'coral', 'delta', 'ember', 'fjord', 'glacier', 'harbor', 'iris', 'jade',
  'kelp', 'lichen', 'moss', 'nimbus', 'opal', 'pumice', 'quartz', 'reef', 'slate', 'tundra',
  'umber', 'vale', 'willow', 'xenon', 'yarrow', 'zephyr', 'aurora', 'brine', 'cinder', 'dune',
];

/** Human-friendly seed code such as "ember-reef-417". Not used inside the sim. */
export function randomSeedCode(entropy: number): string {
  const r = new RNG(entropy >>> 0);
  return `${r.pick(SEED_WORDS)}-${r.pick(SEED_WORDS)}-${100 + r.int(900)}`;
}
