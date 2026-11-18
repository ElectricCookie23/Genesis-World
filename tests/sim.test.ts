import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';

const SEEDS = ['amber-reef-101', 'basalt-vale-202', 'coral-dune-303', 'ember-moss-404', 'jade-fjord-505'];
const grid = buildGrid();

function run(seed: string, years: number, dt: number): Simulation {
  const sim = new Simulation(seed, grid.n, grid);
  for (let t = 0; t < years; t += dt) sim.step(dt);
  return sim;
}

describe('grid', () => {
  it('has about 40,000 well-formed cells', () => {
    expect(grid.count).toBe(10 * 63 * 63 + 2);
    let five = 0;
    for (let i = 0; i < grid.count; i++) {
      const n = grid.ncount[i]!;
      expect(n === 5 || n === 6).toBe(true);
      if (n === 5) five++;
    }
    expect(five).toBe(12);
    expect(grid.tris.length / 3).toBe(20 * 63 * 63);
  });
});

describe('simulation', () => {
  it('is deterministic for the same seed', () => {
    const a = run(SEEDS[0]!, 100_000, 500);
    const b = run(SEEDS[0]!, 100_000, 500);
    expect(a.digest()).toBe(b.digest());
    expect(a.events.events.length).toBe(b.events.events.length);
  });

  it('gives different worlds for different seeds', () => {
    const digests = new Set(SEEDS.map((s) => new Simulation(s, grid.n, grid).digest()));
    expect(digests.size).toBe(SEEDS.length);
  });

  for (const seed of SEEDS) {
    it(`stays within sane bounds over 100,000 years (${seed})`, () => {
      const sim = new Simulation(seed, grid.n, grid);
      let land = 0;
      for (let i = 0; i < grid.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel) land++;
      const landFrac = land / grid.count;
      expect(landFrac).toBeGreaterThan(0.2);
      expect(landFrac).toBeLessThan(0.5);
      for (let t = 0; t < 100_000; t += 500) {
        sim.step(500);
        // survivable unless an event says otherwise
        const forced = sim.events.events.some((e) => e.type === 'impact' || e.type === 'snowball');
        if (!forced) {
          expect(sim.climate.meanTemp).toBeGreaterThan(-5);
          expect(sim.climate.meanTemp).toBeLessThan(35);
        }
      }
      for (let i = 0; i < grid.count; i++) {
        expect(Number.isFinite(sim.world.temperature[i]!)).toBe(true);
        expect(Number.isFinite(sim.world.moisture[i]!)).toBe(true);
      }
      const biomes = new Set(sim.world.biome);
      expect(biomes.size).toBeGreaterThanOrEqual(8);
    });
  }
});
