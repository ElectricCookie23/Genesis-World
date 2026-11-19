// Headless checks for the slow shaping of the world: drifting plates, rivers and reefs, dust on the wind.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { computeDrainage, countContinents } from '../src/sim/geology';
import { driftPlatesMoving } from '../src/sim/tectonics';
import { dustFall, shapeLandforms } from '../src/sim/landforms';

const landShare = (sim: Simulation) => { let n = 0; const w = sim.world; for (let i = 0; i < w.elevation.length; i++) if (w.elevation[i]! > w.seaLevel) n++; return n / w.elevation.length; };

describe('drifting plates', () => {
  it('moves plate outlines, keeps heights sane and keeps land', () => {
    const sim = new Simulation('amber-reef-101', 21);
    const w = sim.world;
    const before = Uint16Array.from(w.plate);
    const land0 = landShare(sim);
    let collisions = 0, spread = 0;
    for (let step = 0; step < 100; step++) { const r = driftPlatesMoving(w, 2e6); collisions += r.collisions; spread += r.spread; }
    let changed = 0, max = -Infinity, bad = 0;
    for (let i = 0; i < w.elevation.length; i++) { if (w.plate[i] !== before[i]) changed++; if (!Number.isFinite(w.elevation[i]!)) bad++; max = Math.max(max, w.elevation[i]!); }
    expect(bad).toBe(0);
    expect(changed / w.elevation.length).toBeGreaterThan(0.1);
    expect(collisions).toBeGreaterThan(0);
    expect(spread).toBeGreaterThan(0);
    expect(max).toBeLessThan(12);
    const land1 = landShare(sim);
    expect(land1).toBeGreaterThan(land0 * 0.45);
    expect(land1).toBeLessThan(0.8);
    expect(countContinents(w).count).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const run = () => { const sim = new Simulation('basalt-vale-202', 15); for (let s = 0; s < 40; s++) driftPlatesMoving(sim.world, 2e6); return Array.from(sim.world.elevation.slice(0, 200)); };
    expect(run()).toEqual(run());
  });
});

describe('landforms', () => {
  it('rivers cut down where they run steep, never below the bed downstream; nothing goes non-finite', () => {
    const sim = new Simulation('amber-reef-101', 21);
    const w = sim.world;
    computeDrainage(w);
    let cut = 0;
    for (let s = 0; s < 30; s++) {
      const before = Float32Array.from(w.elevation);
      const down = Int32Array.from(w.downhill);
      cut += shapeLandforms(w, 1).canyon;
      for (let i = 0; i < before.length; i++) {
        expect(Number.isFinite(w.elevation[i]!)).toBe(true);
        const d = down[i]!;
        // a river cell that was above the land cell below it is still above it after cutting
        if (d >= 0 && before[i]! > w.seaLevel + 0.3 && before[d]! > w.seaLevel + 0.3 && before[i]! - before[d]! >= 0.08 && w.elevation[i]! < before[i]!) expect(w.elevation[i]!).toBeGreaterThan(before[d]!);
      }
      computeDrainage(w);
    }
    expect(cut).toBeGreaterThan(0);
  });

  it('a river mouth builds a delta toward the surface but not above it', () => {
    const sim = new Simulation('amber-reef-101', 21);
    const w = sim.world;
    computeDrainage(w);
    // find the biggest river mouth and note the sea cell it empties into
    let mouth = -1, best = 0;
    for (let i = 0; i < w.elevation.length; i++) { const d = w.downhill[i]!; if (d >= 0 && w.elevation[i]! > w.seaLevel && w.elevation[d]! <= w.seaLevel && w.flow[i]! > best) { best = w.flow[i]!; mouth = d; } }
    expect(mouth).toBeGreaterThanOrEqual(0);
    const start = w.elevation[mouth]!;
    for (let s = 0; s < 60; s++) shapeLandforms(w, 1);
    expect(w.elevation[mouth]!).toBeGreaterThan(start);
    expect(w.elevation[mouth]!).toBeLessThanOrEqual(w.seaLevel + 0.016);
  });

  it('dust from dry windy land lands only on sea, in 0..1', () => {
    const sim = new Simulation('amber-reef-101', 21);
    const w = sim.world;
    // make a dry, bare, windy world so the test does not depend on the climate of the moment
    for (let i = 0; i < w.elevation.length; i++) { w.moisture[i] = 0.05; w.vegetation[i] = 0; w.windE[i] = 1; w.windN[i] = 0.2; }
    const out = new Float32Array(w.elevation.length);
    const fed = dustFall(w, out);
    expect(fed).toBeGreaterThan(0);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]!).toBeGreaterThanOrEqual(0);
      expect(out[i]!).toBeLessThanOrEqual(1);
      if (out[i]! > 0) expect(w.elevation[i]!).toBeLessThanOrEqual(w.seaLevel);
    }
  });
});
