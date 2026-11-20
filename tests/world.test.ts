// Headless checks for the slow shaping of the world: drifting plates, rivers and reefs, dust on the wind.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { computeDrainage, countContinents } from '../src/sim/geology';
import { driftPlatesMoving } from '../src/sim/tectonics';
import { dustFall, shapeLandforms } from '../src/sim/landforms';
import { computeCurrents } from '../src/sim/climate';
import { loadSimulation, saveSimulation } from '../src/sim/snapshot';

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

describe('ocean currents', () => {
  it('every sea cell is fed from a sea cell, land from itself, and the sea stays at sane temperatures', () => {
    const sim = new Simulation('amber-reef-101', 21);
    for (let i = 0; i < 40; i++) sim.step(15000);
    const w = sim.world, c = sim.climate;
    computeCurrents(w, c);
    let sea = 0, moved = 0;
    for (let i = 0; i < sim.grid.count; i++) {
      const up = c.upcurrent[i]!;
      expect(up).toBeGreaterThanOrEqual(0);
      expect(up).toBeLessThan(sim.grid.count);
      if (w.elevation[i]! > w.seaLevel) expect(up).toBe(i);
      else {
        sea++;
        expect(w.elevation[up]!).toBeLessThanOrEqual(w.seaLevel);
        if (up !== i) moved++;
        expect(Number.isFinite(c.sst[i]!)).toBe(true);
        expect(c.sst[i]!).toBeGreaterThan(-40);
        expect(c.sst[i]!).toBeLessThan(70);
      }
      expect(Number.isFinite(w.temperature[i]!)).toBe(true);
    }
    // most of the sea is in motion
    expect(moved).toBeGreaterThan(sea * 0.5);
    expect(c.currentAnomaly).toBeGreaterThanOrEqual(0);
  }, 120000);

  it('herds that move with the seasons wear trails on land only', () => {
    const sim = new Simulation('amber-reef-101', 21) as unknown as { world: Simulation['world']; grid: Simulation['grid']; regions: { centre: Int32Array; count: number; land: Float32Array; grid: { neighbors: Int32Array; ncount: Uint8Array } }; wearTrail(a: number, b: number, m: number): void };
    const reg = sim.regions;
    let walked = 0;
    for (let r = 0; r < reg.count && walked < 12; r++) {
      if (reg.land[r]! <= 0.5) continue;
      for (let k = 0; k < reg.grid.ncount[r]!; k++) {
        const nb = reg.grid.neighbors[r * 6 + k]!;
        if (reg.land[nb]! > 0.5) { for (let n = 0; n < 6; n++) sim.wearTrail(r, nb, 1e5); walked++; break; }
      }
    }
    expect(walked).toBeGreaterThan(0);
    let worn = 0;
    for (let i = 0; i < sim.grid.count; i++) {
      const t = sim.world.trail[i]!;
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      if (t > 0) { worn++; expect(sim.world.elevation[i]!).toBeGreaterThan(sim.world.seaLevel); }
    }
    expect(worn).toBeGreaterThan(0);
  }, 60000);
});

describe('saving and loading', () => {
  it('a reloaded world carries on exactly as the original would have', () => {
    const a = new Simulation('amber-reef-101', 21);
    for (let i = 0; i < 600; i++) a.step(15000);
    const b = new Simulation('amber-reef-101', 21);
    loadSimulation(b, saveSimulation(a, 'test'));
    expect(b.digest()).toBe(a.digest());
    for (let i = 0; i < 120; i++) { a.step(15000); b.step(15000); }
    expect(b.simYear).toBe(a.simYear);
    expect(b.digest()).toBe(a.digest());
    expect(b.events.events.length).toBe(a.events.events.length);
    expect(b.creatures.livingSpecies).toBe(a.creatures.livingSpecies);
  }, 120000);
});

import { saveSimulation as saveWorld, loadSimulation as loadWorld } from '../src/sim/snapshot';
import { Simulation as World } from '../src/sim/simulation';

describe('saves keep records made after the world began', () => {
  it('a nested record that a fresh world does not have is rebuilt on load', () => {
    const a = new World('amber-reef-101', 9);
    a.step(15000);
    // the history keeps optional records (the small comet's schedule, the latest sign in the sky) that only exist once made
    a.civ.h.visitor = { period: 77, next: 1234, last: 5 };
    a.civ.h.sign = { eventId: 5, year: 1200, kind: 'comet' };
    a.civ.h.peace = 4321;
    const b = new World('amber-reef-101', 9);
    loadWorld(b, saveWorld(a, 't'));
    expect(b.civ.h.visitor).toEqual({ period: 77, next: 1234, last: 5 });
    expect(b.civ.h.sign).toEqual({ eventId: 5, year: 1200, kind: 'comet' });
    expect(b.civ.h.peace).toBe(4321);
    // and the copy is its own: changing it does not change the original
    b.civ.h.visitor!.next = 1;
    expect(a.civ.h.visitor!.next).toBe(1234);
  });
});
