import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { eventsIn, loadSimulation, packSave, saveSimulation, unpackSave, type ChunkPool, type SaveState } from '../src/sim/snapshot';

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

  it('a kept copy drops the unused rows of its arrays, shares what has not changed with the copy before, and comes back bit for bit', () => {
    const pieces = (v: unknown): Float64Array[] => (v as { __chunks: Float64Array[] }).__chunks;
    const make = (count: number): SaveState => {
      // a log that only grows (as the record of every place does), a table that is all reserved and empty, some
      // awkward numbers, and one array too small to be worth cutting up
      const log = new Float64Array(200000), table = new Int32Array(50000), odd = new Float32Array(20000), small = new Uint8Array(100), bytes = new Uint8Array(70001);
      for (let i = 0; i < count; i++) log[i] = Math.sin(i) * 1e6;
      odd[3] = NaN; odd[4] = -0; odd[19999] = -0;
      for (let i = 0; i < 70001; i += 7) bytes[i] = i % 251;
      small[5] = 9;
      return { version: 1, seed: 'x', gridN: 3, simYear: count, savedAt: 0, name: 't', data: { year: 5, places: { __nested: { log, table, count } }, odd, small, bytes, list: [1, 2, 3] } };
    };
    const first = make(60000), second = make(90000);
    const pool: ChunkPool = new Map();
    const a = packSave(first, pool), b = packSave(second, pool);
    // the saves handed in still hold their arrays
    expect(first.data.odd).toBeInstanceOf(Float32Array);
    expect((first.data.places as { __nested: { log: unknown } }).__nested.log).toBeInstanceOf(Float64Array);
    // the empty table costs nothing; the log is kept only as far as it has been written
    const inA = (a.data.places as { __nested: Record<string, unknown> }).__nested, inB = (b.data.places as { __nested: Record<string, unknown> }).__nested;
    expect(pieces(inA.table)).toHaveLength(0);
    expect(pieces(inA.log).reduce((n, c) => n + c.length, 0)).toBe(60000);
    expect(pieces(inB.log).reduce((n, c) => n + c.length, 0)).toBe(90000);
    // the second copy uses the first copy's pieces wherever the log had not changed (all but the piece that was still filling)
    const shared = pieces(inB.log).filter((c) => pieces(inA.log).includes(c)).length;
    expect(shared).toBe(pieces(inA.log).length - 1);
    expect(shared).toBeGreaterThan(5);
    // a small array is left as it is
    expect(a.data.small).toBe(first.data.small);
    // packing what is already packed changes nothing; both come back exactly, minus zero and not-a-number included
    expect(pieces((packSave(a).data.places as { __nested: Record<string, unknown> }).__nested.log)).toEqual(pieces(inA.log));
    for (const [packed, from] of [[a, first], [b, second]] as const) {
      const back = unpackSave(packed);
      expect(back.packed).toBeUndefined();
      const want = from.data as Record<string, unknown>, got = back.data as Record<string, unknown>;
      const bits = (v: unknown): string => { const t = v as Float32Array; return `${t.constructor.name}:${t.length}:${Buffer.from(t.buffer, t.byteOffset, t.byteLength).toString('base64')}`; };
      for (const k of ['odd', 'small', 'bytes']) expect(bits(got[k])).toBe(bits(want[k]));
      const wantIn = (want.places as { __nested: Record<string, unknown> }).__nested, gotIn = (got.places as { __nested: Record<string, unknown> }).__nested;
      for (const k of ['log', 'table']) expect(bits(gotIn[k])).toBe(bits(wantIn[k]));
      expect(gotIn.count).toBe(wantIn.count);
      expect(got.list).toEqual([1, 2, 3]);
    }
  });
});
