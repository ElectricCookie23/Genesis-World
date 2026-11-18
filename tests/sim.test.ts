import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';

const SEEDS = ['amber-reef-101', 'basalt-vale-202', 'coral-dune-303', 'ember-moss-404', 'jade-fjord-505'];
const full = buildGrid();
// life tests run on a coarser planet so five whole histories fit in a test run
const SMALL_N = 27;
const small = buildGrid(SMALL_N);

describe('grid', () => {
  it('has about 40,000 well-formed cells', () => {
    expect(full.count).toBe(10 * 63 * 63 + 2);
    let five = 0;
    for (let i = 0; i < full.count; i++) {
      const n = full.ncount[i]!;
      expect(n === 5 || n === 6).toBe(true);
      if (n === 5) five++;
    }
    expect(five).toBe(12);
    expect(full.tris.length / 3).toBe(20 * 63 * 63);
  });
});

describe('full-size planet', () => {
  it('gives different worlds for different seeds', () => {
    const digests = new Set(SEEDS.map((s) => new Simulation(s, full.n, full).digest()));
    expect(digests.size).toBe(SEEDS.length);
  });

  it('has sane land, climate and biomes over 100,000 years', () => {
    const sim = new Simulation(SEEDS[0]!, full.n, full);
    let land = 0;
    for (let i = 0; i < full.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel) land++;
    expect(land / full.count).toBeGreaterThan(0.2);
    expect(land / full.count).toBeLessThan(0.5);
    for (let t = 0; t < 100_000; t += 500) sim.step(500);
    expect(sim.climate.meanTemp).toBeGreaterThan(-5);
    expect(sim.climate.meanTemp).toBeLessThan(35);
    for (let i = 0; i < full.count; i++) {
      expect(Number.isFinite(sim.world.temperature[i]!)).toBe(true);
      expect(Number.isFinite(sim.world.moisture[i]!)).toBe(true);
    }
    expect(new Set(sim.world.biome).size).toBeGreaterThanOrEqual(8);
  });
});

describe('history', () => {
  it('is deterministic for the same seed', () => {
    const run = () => {
      const sim = new Simulation(SEEDS[0]!, SMALL_N, small);
      for (let t = 0; t < 40e6; t += 15000) sim.step(15000);
      return sim;
    };
    const a = run(), b = run();
    expect(a.digest()).toBe(b.digest());
    expect(a.events.events.length).toBe(b.events.events.length);
    expect(a.creatures.species.map((s) => s.name)).toEqual(b.creatures.species.map((s) => s.name));
  });

  const histories: string[] = [];
  for (const seed of SEEDS) {
    it(`grows a stable living world over 120 million years (${seed})`, () => {
      const sim = new Simulation(seed, SMALL_N, small);
      const dt = 15000;
      let animalsSince = -1;
      let lastPop = 0;
      let lowSpecies = 0, checks = 0;
      for (let t = 0; t < 120e6; t += dt) {
        const eventsBefore = sim.events.events.length;
        sim.step(dt);
        const cr = sim.creatures;
        if (sim.stage === 'animals' && animalsSince < 0) animalsSince = sim.simYear;
        // global temperature stays survivable unless an event says otherwise
        const forced = sim.era.kind === 'winter' || sim.events.events.length > eventsBefore;
        if (!forced) {
          expect(sim.climate.meanTemp).toBeGreaterThan(-8);
          expect(sim.climate.meanTemp).toBeLessThan(36);
        }
        if (animalsSince >= 0) {
          // life never dies out once it has begun
          expect(cr.livingSpecies).toBeGreaterThanOrEqual(1);
          expect(cr.totalPop).toBeGreaterThan(0);
          // no explosion: at most 10x per step (a step is far longer than a century)
          if (lastPop > 1e5) expect(cr.totalPop).toBeLessThan(lastPop * 10);
          lastPop = cr.totalPop;
          // after an initial radiation there are at least 5 living species
          if (sim.simYear - animalsSince > 30e6) {
            checks++;
            if (cr.livingSpecies < 5) lowSpecies++;
          }
        }
      }
      expect(animalsSince).toBeGreaterThan(0);
      expect(checks).toBeGreaterThan(0);
      // allow brief dips right after a mass extinction
      expect(lowSpecies / checks).toBeLessThan(0.1);
      expect(sim.events.events.filter((e) => e.type === 'extinction').length).toBeGreaterThanOrEqual(1);
      // every extinction and speciation records a cause
      for (const e of sim.events.events) {
        if (e.type === 'extinction' || e.type === 'speciation') expect(e.causes.length).toBeGreaterThan(0);
        for (const c of e.causes) expect(c).toBeLessThan(e.id);
      }
      histories.push(sim.creatures.species.map((s) => s.name).join(','));
    });
  }

  it('gives five clearly different histories for five seeds', () => {
    expect(new Set(histories).size).toBe(SEEDS.length);
  });
});
