// Beyond the space age (expansion section 8, E71 to E80).
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { saveSimulation, loadSimulation, type SaveState } from '../src/sim/snapshot';
import { G } from '../src/sim/genetics';
import type { Settlement } from '../src/sim/civilization';
import type { Ending } from '../src/sim/future';

const N = 15, SEED = 'amber-reef-101';
const grid = buildGrid(N);
const ofType = (sim: Simulation, type: string) => sim.events.events.filter((e) => e.type === type);
const land = (sim: Simulation, skip = 0) => { let k = 0; for (let i = 0; i < sim.grid.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel + 0.1 && k++ === skip) return i; return 0; };
const town = (sim: Simulation, species: number, cell: number, tech: number, name: string): Settlement => {
  const ev = sim.emit({ type: 'settlement', cellId: cell, title: `${name} is founded`, description: '', importance: 0, speciesIds: [species] });
  const st = { id: sim.civ.settlements.length, name, cell, region: sim.regions.regionOf[cell]!, species, pop: 800, tech, founded: sim.simYear, lore: -1, eventId: ev.id, ruined: -1, painted: false, farms: true, stars: true, nation: -1, head: '', modifier: '', relic: -1 } as Settlement;
  sim.civ.settlements.push(st);
  return st;
};
type Inner = { at: Record<string, number>; will: Record<string, boolean>; clock: number; nextProject: number };
const inner = (sim: Simulation) => sim.future as unknown as Inner;
/** A young world with a people of the space age set down on it by hand (nothing lives yet, so the civilization code is idle). */
function spacefarers(seed = SEED, will: Partial<Record<string, boolean>> = {}): { sim: Simulation; st: Settlement } {
  const sim = new Simulation(seed, N, grid);
  sim.step(1000);
  const st = town(sim, 1, land(sim, 20), 1.2, 'Zohan');
  sim.civ.living = 45; sim.civ.maxTech = 1.2;
  sim.milestone('space-age', 'The space age', 'Machines in orbit.', -1, []);
  Object.assign(inner(sim).will, will);
  return { sim, st };
}
const run = (sim: Simulation, years: number, dt = 10) => { for (let y = 0; y < years; y += dt) sim.step(dt); };

describe('E71 a tether and a ring', () => {
  it('a tether rises from an equatorial city, then a ring is closed and casts a thin cold shadow', () => {
    const { sim } = spacefarers();
    const f = sim.future, at = inner(sim).at;
    expect(f.ring).toBe(0);
    run(sim, at.tether! + 20);
    expect(f.ring).toBe(1);
    expect(ofType(sim, 'space-elevator').length).toBe(1);
    expect(sim.climate.ringShadow).toBe(0);
    run(sim, at.ring! - at.tether!);
    expect(f.ring).toBe(2);
    const ring = ofType(sim, 'orbital-ring');
    expect(ring.length).toBe(1);
    expect(ring[0]!.causes).toEqual([ofType(sim, 'space-elevator')[0]!.id]);
    expect(sim.climate.ringShadow).toBeGreaterThan(0.2);
  });

  it('nothing of the kind happens to a people that never reached orbit', () => {
    const sim = new Simulation(SEED, N, grid);
    sim.step(1000);
    town(sim, 1, land(sim, 20), 0.9, 'Oske');
    sim.civ.living = 45; sim.civ.maxTech = 0.9;
    run(sim, 3000);
    expect(sim.future.clock).toBe(0);
    expect(sim.future.ring).toBe(0);
  });
});

describe('E72 arcologies', () => {
  it('a crowded high-tech world builds one', () => {
    const { sim } = spacefarers();
    run(sim, inner(sim).at.arcology! + 1500);
    expect(sim.future.arcologies).toBeGreaterThanOrEqual(1);
    const a = ofType(sim, 'arcology');
    expect(a.length).toBe(sim.future.arcologies);
    expect(a[0]!.data?.kind).toBe('land');
  });
});

describe('E76, E77, E80 machines, upload, and the swarm round the star', () => {
  it('machine minds appear and keep their own history', () => {
    const { sim } = spacefarers(SEED, { machines: true, upload: false, swarm: false });
    run(sim, inner(sim).at.machines! + 450);
    expect(sim.future.machines).toBe(true);
    const born = ofType(sim, 'machine-minds'), built = ofType(sim, 'machine-cities');
    expect(born.length).toBe(1); expect(built.length).toBe(1);
    expect(built[0]!.causes).toEqual([born[0]!.id]);
  });

  it('a people moves into its machines: the towns empty and it is on record', () => {
    const { sim, st } = spacefarers(SEED, { machines: true, upload: true, swarm: false });
    run(sim, inner(sim).at.upload! - 5);
    const before = st.pop;
    expect(sim.future.uploaded).toBe(0);
    run(sim, 600);
    expect(sim.future.uploaded).toBeGreaterThanOrEqual(0.9);
    expect(st.pop).toBeLessThan(before * 0.5);
    expect(ofType(sim, 'upload').length).toBe(1);
    const quiet = ofType(sim, 'quiet-planet');
    expect(quiet.length).toBe(1);
    expect(quiet[0]!.causes).toEqual([ofType(sim, 'upload')[0]!.id]);
  });

  it('collectors round the star grow until the planet gets measurably less light', () => {
    const { sim } = spacefarers(SEED, { machines: false, upload: false, swarm: true });
    run(sim, inner(sim).at.swarm! - 5);
    const solar = sim.climate.solar;
    expect(sim.future.shade).toBe(0);
    run(sim, 400);
    expect(sim.future.shade).toBeGreaterThan(0.01); expect(sim.future.shade).toBeLessThan(0.04);
    run(sim, 600);
    expect(sim.future.shade).toBeCloseTo(0.04, 6);
    expect(sim.climate.solar).toBeCloseTo(solar * 0.96, 4);
    expect(ofType(sim, 'star-swarm').length).toBe(1);
    expect(ofType(sim, 'star-dim')[0]!.causes).toEqual([ofType(sim, 'star-swarm')[0]!.id]);
  });
});

describe('E78 geoengineering', () => {
  it('changes the climate, and sometimes badly', () => {
    const { sim } = spacefarers();
    inner(sim).nextProject = 1e9; // (they would otherwise act on it themselves, as the next test shows)
    sim.climate.forced += 9;
    run(sim, 100);
    const hot = sim.climate.meanTemp - sim.baseTemp;
    expect(hot).toBeGreaterThan(5);
    const ev = sim.future.geoengineer(sim, false);
    run(sim, 100);
    const mended = sim.climate.meanTemp - sim.baseTemp;
    expect(Math.abs(mended)).toBeLessThan(hot * 0.5);
    expect(ev.type).toBe('geoengineering');
    // the same thing done too well
    const b = spacefarers().sim;
    inner(b).nextProject = 1e9;
    b.climate.forced += 9;
    run(b, 100);
    b.future.geoengineer(b, true);
    run(b, 100);
    expect(b.climate.meanTemp - b.baseTemp).toBeLessThan(-3);
    const bad = ofType(b, 'geoengineering-backfire');
    expect(bad.length).toBe(1);
    expect(bad[0]!.causes).toEqual([ofType(b, 'geoengineering')[0]!.id]);
  });

  it('is undertaken by a people whose climate has gone wrong, without being told to', () => {
    const { sim } = spacefarers();
    sim.climate.forced += 9;
    run(sim, 800);
    expect(sim.future.projects).toBeGreaterThanOrEqual(1);
  });
});

// a world with animals, some of them of the land (the small test planet grows few by itself), built once
let grown: SaveState | null = null;
function living(): Simulation {
  if (!grown) {
    const s = new Simulation(SEED, N, grid);
    for (let y = 0; y < 40e6; y += 15000) s.step(15000);
    const base = s.creatures.species.filter((x) => x.extinctYear < 0 && x.name).sort((a, b) => b.pop - a.pop)[0]!;
    for (let k = 0; k < 3; k++) {
      const genes = Array.from(base.ref);
      genes[G.Water] = 0.1; genes[G.LimbType] = 0.6; genes[G.LimbPairs] = 0.5; genes[G.Sociality] = 0.6 + k * 0.15; genes[G.Diet] = 0.1; genes[G.Size] = 0.3 + k * 0.1;
      s.releaseSpecies(land(s, 40 + k * 60), genes);
    }
    // (a couple of steps for them to find their feet; left for ages on so small a planet they may not last)
    for (let k = 0; k < 2; k++) s.step(15000);
    grown = saveSimulation(s);
  }
  const sim = new Simulation(SEED, N, grid); loadSimulation(sim, grown); return sim;
}
/** The same people, set beside real animals; the future is stepped by itself so the hand-made town is never run as a real one. */
function among(): { sim: Simulation; st: Settlement } {
  const sim = living();
  const st = town(sim, 9000, land(sim, 20), 1.2, 'Zohan');
  sim.civ.living = 45; sim.civ.maxTech = 1.2;
  sim.milestone('space-age', 'The space age', 'Machines in orbit.', -1, []);
  return { sim, st };
}

describe('E73 engineered life', () => {
  it('a made species is marked as such, escapes, and has descendants no one designed', () => {
    const { sim } = among();
    const kinds = sim.creatures.species.length;
    sim.future.step(sim, inner(sim).at.engineer! + 1);
    expect(sim.creatures.species.length).toBe(kinds + 1);
    const made = sim.creatures.species[kinds]!;
    expect(sim.future.origins[made.id]).toBe('engineered');
    expect(made.parent).toBeGreaterThanOrEqual(0);
    const ev = ofType(sim, 'engineered');
    expect(ev.length).toBe(1); expect(made.eventId).toBe(ev[0]!.id);
    expect(ofType(sim, 'feral').length).toBe(0);
    // it gets out
    made.regions = 5;
    sim.future.step(sim, 1);
    expect(ofType(sim, 'feral').length).toBe(1);
    // and evolves: a daughter species splits from it
    const child = sim.releaseSpecies(sim.regions.centre[made.home]!, made.ref, made.id)!;
    made.children = 1;
    sim.future.step(sim, 1);
    const evolved = ofType(sim, 'engineered-evolves');
    expect(evolved.length).toBe(1);
    expect(evolved[0]!.speciesIds).toEqual([made.id, child.id]);
  });
});

describe('E74 de-extinction', () => {
  it('a species that died out is brought back, marked as revived, and lives in the wild', () => {
    const { sim } = among();
    // something that is gone: the commonest animal alive, struck from the world five thousand years ago, its place
    // left empty (a revived animal set down beside a thriving twin of itself is simply out-competed)
    const ghost = sim.creatures.species.filter((s) => s.extinctYear < 0 && s.name).sort((a, b) => b.pop - a.pop)[0]!;
    for (let c = 0; c < sim.creatures.high; c++) if (sim.creatures.alive[c] && sim.creatures.sp[c] === ghost.id) sim.creatures.count[c] = 0;
    ghost.extinctYear = sim.simYear - 5000; ghost.peakPop = 1e12; ghost.pop = 0;
    inner(sim).at.revive = 1; inner(sim).at.engineer = 1e9; inner(sim).at.uplift = 1e9;
    const kinds = sim.creatures.species.length;
    sim.future.step(sim, 10);
    const back = sim.creatures.species[kinds]!;
    expect(sim.future.origins[back.id]).toBe('revived');
    expect(back.parent).toBe(ghost.id);
    const ev = ofType(sim, 'de-extinction');
    expect(ev.length).toBe(1);
    expect(ev[0]!.title).toContain(ghost.name);
    expect(ev[0]!.speciesIds).toEqual([back.id, ghost.id]);
    // left to itself, with its makers gone
    sim.civ.settlements.pop(); sim.civ.living = 0; sim.civ.maxTech = 0;
    for (let k = 0; k < 12; k++) sim.step(15000);
    expect(back.extinctYear).toBeLessThan(0);
    expect(back.pop).toBeGreaterThan(100);
  });
});

describe('E75 uplift', () => {
  it('another species is raised to a mind and founds a settlement of its own', () => {
    const { sim, st } = among();
    inner(sim).will.uplift = true; inner(sim).at.uplift = 1; inner(sim).at.engineer = 1e9; inner(sim).at.revive = 1e9;
    // (the land animals of this small test world are few: one is made numerous enough to be noticed)
    for (const s of sim.creatures.species) if (s.extinctYear < 0 && s.name && s.ref[G.Water]! < 0.4) s.pop = Math.max(s.pop, 5000);
    sim.future.step(sim, 10);
    const up = ofType(sim, 'uplift');
    expect(up.length).toBe(1);
    const kin = sim.creatures.species[up[0]!.speciesIds![0]!]!;
    expect(sim.future.origins[kin.id]).toBe('uplifted');
    expect(kin.ref[G.Intelligence]!).toBeGreaterThanOrEqual(0.85);
    expect(sim.civ.sapient).toContain(kin.id);
    // the real rules of settlement take it from here: with the hand-made town set aside, the raised species makes camp
    sim.civ.settlements.pop(); sim.civ.living = 0; sim.civ.maxTech = 0;
    for (let k = 0; k < 6 && !sim.civ.settlements.some((s) => s.species === kin.id); k++) sim.step(15000);
    const camp = sim.civ.settlements.find((s) => s.species === kin.id)!;
    expect(camp).toBeDefined();
    // its makers are still there to see it
    st.id = sim.civ.settlements.length; sim.civ.settlements.push(st); sim.civ.living = 2; sim.civ.maxTech = 1.2;
    sim.future.step(sim, 1);
    const own = ofType(sim, 'uplift-settles');
    expect(own.length).toBe(1);
    expect(own[0]!.causes).toContain(up[0]!.id);
    sim.civ.settlements.pop();
  });
});

describe('E79 far-future endings', () => {
  it('every history that goes far enough ends some way, once, and five seeds find at least three ways', () => {
    const seeds = ['amber-reef-101', 'coral-dune-303', 'ember-moss-404', 'slate-iris-707', 'jade-fjord-505'];
    const found = new Set<Ending>();
    for (const seed of seeds) {
      const { sim } = spacefarers(seed);
      run(sim, inner(sim).at.ending! + 50, 25);
      expect(sim.future.ending, seed).not.toBe('');
      const told = ofType(sim, 'ending');
      expect(told.length).toBe(1);
      expect(told[0]!.data?.ending).toBe(sim.future.ending);
      found.add(sim.future.ending);
      // an ended history does not go on ending
      const clock = sim.future.clock;
      run(sim, 500, 25);
      expect(sim.future.clock).toBe(clock);
      expect(ofType(sim, 'ending').length).toBe(1);
    }
    expect(found.size).toBeGreaterThanOrEqual(3);
  }, 120000);

  it('a last war after the space age is a dark age', () => {
    const { sim } = spacefarers();
    run(sim, 400);
    sim.emit({ type: 'nuclear-war', title: 'The last war', description: '', importance: 3 });
    sim.step(10);
    expect(sim.future.ending).toBe('dark-age');
    expect(sim.future.clock).toBe(0);
  });
});

describe('section 8 in a save', () => {
  it('comes back as it was and runs on the same', () => {
    const { sim } = spacefarers(SEED, { machines: true, upload: true, swarm: true });
    run(sim, 1500, 25);
    const back = new Simulation(SEED, N, grid);
    loadSimulation(back, saveSimulation(sim));
    expect(back.future.info()).toEqual(sim.future.info());
    run(sim, 1500, 25); run(back, 1500, 25);
    expect(back.future.info()).toEqual(sim.future.info());
    expect(back.events.events.length).toBe(sim.events.events.length);
  });
});
