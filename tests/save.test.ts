import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { eventsIn, loadSimulation, packSave, saveSimulation, unpackSave } from '../src/sim/snapshot';

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

  it('a save made small for keeping loads to exactly the same world, and leaves the save it was made from alone', () => {
    const a = new Simulation('amber-reef-101', 17);
    for (let t = 0; t < 400e6 && !a.civ.historyActive; t += 15000) a.step(15000);
    for (let y = 0; y < 400; y++) a.step(1);
    const save = saveSimulation(a, 'full');
    const events = a.events.events.length, people = a.civ.h.people.length;
    expect(events).toBeGreaterThan(50);
    const small = packSave(save);
    // the original still has its lists; the small one has text in their place, and knows how long they were
    expect(eventsIn(save)).toBe(events);
    expect(eventsIn(small)).toBe(events);
    expect(Array.isArray((save.data.events as { __nested: { events: unknown } }).__nested.events)).toBe(true);
    expect(Array.isArray((small.data.events as { __nested: { events: unknown } }).__nested.events)).toBe(false);
    // packing twice, or unpacking what was never packed, changes nothing
    expect(eventsIn(packSave(small))).toBe(events);
    expect(unpackSave(save)).toBe(save);
    // both load to the same world, and both go on the same way
    const b = new Simulation('amber-reef-101', 17), c = new Simulation('amber-reef-101', 17);
    loadSimulation(b, save);
    loadSimulation(c, small);
    expect(c.digest()).toBe(b.digest());
    expect(c.events.events.length).toBe(events);
    expect(c.civ.h.people.length).toBe(people);
    expect(JSON.stringify(c.events.events)).toBe(JSON.stringify(b.events.events));
    for (let y = 0; y < 150; y++) { b.step(1); c.step(1); }
    expect(c.digest()).toBe(b.digest());
    expect(c.events.events.map((e) => e.title)).toEqual(b.events.events.map((e) => e.title));
    expect(c.civ.h.nations.map((n) => `${n.name} ${n.pop.toFixed(3)} ${n.tech.toFixed(4)}`)).toEqual(b.civ.h.nations.map((n) => `${n.name} ${n.pop.toFixed(3)} ${n.tech.toFixed(4)}`));
    // the small one can be loaded more than once
    const d = new Simulation('amber-reef-101', 17);
    loadSimulation(d, small);
    expect(d.events.events.length).toBe(events);
  }, 600000);
});
