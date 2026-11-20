// Neighbor Link (E98): two worlds from two seeds, run together, record contact with each other.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { saveSimulation, loadSimulation } from '../src/sim/snapshot';

const N = 15;
const grid = buildGrid(N);
const ofType = (sim: Simulation, type: string) => sim.events.events.filter((e) => e.type === type);
// stand-in peoples on two young worlds (their civilization code is not running yet, so the numbers hold)
const people = (sim: Simulation, towns: number, tech: number) => { sim.civ.living = towns; sim.civ.maxTech = tech; };

describe('E98 the neighbour link', () => {
  it('runs a second world from another seed year for year beside the first', () => {
    const a = new Simulation('amber-reef-101', N, grid);
    a.step(40000);
    a.link('basalt-vale-202');
    const b = a.neighbor!;
    expect(b.seed).toBe('basalt-vale-202');
    expect(b.simYear).toBe(a.simYear);
    for (let i = 0; i < 20; i++) a.step(15000);
    expect(b.simYear).toBe(a.simYear);
    // it is the same world that seed makes alone
    const alone = new Simulation('basalt-vale-202', 15);
    alone.step(40000);
    for (let i = 0; i < 20; i++) alone.step(15000);
    expect(b.digest()).toBe(alone.digest());
    // and the first world is not changed by having company
    const single = new Simulation('amber-reef-101', N, grid);
    single.step(40000);
    for (let i = 0; i < 20; i++) single.step(15000);
    expect(a.digest()).toBe(single.digest());
    // a world is not linked to itself
    single.link('amber-reef-101');
    expect(single.neighbor).toBeUndefined();
  });

  it('records contact in both worlds: lights seen, then voices, then a machine sent across', () => {
    const a = new Simulation('amber-reef-101', N, grid);
    a.link('basalt-vale-202');
    const b = a.neighbor!;
    a.step(1000);
    expect(Object.keys(a.linkNoted).length).toBe(0);
    // one side has lenses, the other has cities
    people(a, 6, 0.55); people(b, 9, 0.7);
    a.step(10);
    expect(ofType(a, 'neighbour-lights').length).toBe(1);
    expect(ofType(a, 'neighbour-lights')[0]!.data?.seed).toBe('basalt-vale-202');
    expect(ofType(b, 'neighbour-lights').length).toBe(0); // b's lenses are good enough, but a has no cities to see yet
    expect(ofType(a, 'first-contact').length).toBe(0);
    // both come to radio
    people(a, 6, 1.02); people(b, 9, 1.05);
    a.step(10);
    const heardA = ofType(a, 'first-contact'), heardB = ofType(b, 'first-contact');
    expect(heardA.length).toBe(1);
    expect(heardB.length).toBe(1);
    expect(heardA[0]!.data?.seed).toBe(b.seed);
    expect(heardB[0]!.data?.seed).toBe(a.seed);
    expect(heardA[0]!.simYear).toBe(heardB[0]!.simYear);
    expect(heardA[0]!.causes).toContain(ofType(a, 'neighbour-lights')[0]!.id);
    expect(ofType(b, 'neighbour-lights').length).toBe(1);
    // one of them reaches orbit and sends a machine
    a.milestone('space-age', 'The space age', 'Machines in orbit.', -1, []);
    a.step(10);
    expect(ofType(a, 'neighbour-probe').length).toBe(1);
    expect(ofType(b, 'neighbour-visitor').length).toBe(1);
    expect(ofType(b, 'neighbour-visitor')[0]!.data?.seed).toBe(a.seed);
    // nothing is said twice
    a.step(1000);
    expect(ofType(a, 'first-contact').length).toBe(1);
    expect(ofType(b, 'first-contact').length).toBe(1);
  });

  it('keeps the linked world in a save', () => {
    const a = new Simulation('amber-reef-101', N, grid);
    a.link('basalt-vale-202');
    people(a, 6, 0.55); people(a.neighbor!, 9, 0.7);
    for (let i = 0; i < 10; i++) a.step(15000);
    const save = saveSimulation(a);
    expect(save.neighbor?.seed).toBe('basalt-vale-202');
    const back = new Simulation('amber-reef-101', N, grid);
    loadSimulation(back, save);
    expect(back.neighbor?.seed).toBe('basalt-vale-202');
    expect(back.neighbor!.simYear).toBe(a.neighbor!.simYear);
    expect(back.linkNoted).toEqual(a.linkNoted);
    for (let i = 0; i < 10; i++) { a.step(15000); back.step(15000); }
    expect(back.digest()).toBe(a.digest());
    expect(back.neighbor!.digest()).toBe(a.neighbor!.digest());
    // loading a save with no linked world unlinks
    const plain = saveSimulation(new Simulation('amber-reef-101', N, grid));
    loadSimulation(back, plain);
    expect(back.neighbor).toBeUndefined();
  });
});
