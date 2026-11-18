import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { loadSimulation, saveSimulation } from '../src/sim/snapshot';

describe('saving', () => {
  it('a loaded save continues exactly like the original', () => {
    const grid = buildGrid(21);
    const a = new Simulation('opal-kelp-333', 21, grid);
    for (let t = 0; t < 30e6; t += 15000) a.step(15000);
    const save = saveSimulation(a, 'test');
    const b = new Simulation('opal-kelp-333', 21, grid);
    loadSimulation(b, save);
    expect(b.simYear).toBe(a.simYear);
    expect(b.digest()).toBe(a.digest());
    for (let t = 0; t < 8e6; t += 15000) { a.step(15000); b.step(15000); }
    expect(b.digest()).toBe(a.digest());
    expect(b.events.events.length).toBe(a.events.events.length);
    expect(b.creatures.species.map((s) => s.name)).toEqual(a.creatures.species.map((s) => s.name));
  });
});
