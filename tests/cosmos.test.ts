// Out of this world (expansion section 10): the star system, panspermia, a rogue planet, a gamma-ray burst, the red
// giant, departure fleets and what they send back.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { saveSimulation, loadSimulation } from '../src/sim/snapshot';
import { MAP_H, MAP_W } from '../src/sim/cosmos';

const N = 21;
const grid = buildGrid(N);
const fresh = (seed: string) => new Simulation(seed, N, grid);
const run = (sim: Simulation, years: number, step = 15000) => { for (let y = 0; y < years; y += step) sim.step(step); };
const ofType = (sim: Simulation, type: string) => sim.events.events.filter((e) => e.type === type);

describe('E91 the star system', () => {
  it('gives every world a rocky neighbour, a gas giant and an ice world, the same each time from a seed', () => {
    const a = fresh('amber-reef-101').cosmos, b = fresh('amber-reef-101').cosmos, c = fresh('basalt-vale-202').cosmos;
    expect(a.bodies.map((x) => x.kind)).toEqual(['rock', 'giant', 'ice']);
    expect(a.bodies.map((x) => x.name)).toEqual(b.bodies.map((x) => x.name));
    expect(a.bodies.map((x) => x.au)).toEqual(b.bodies.map((x) => x.au));
    expect(a.bodies.map((x) => x.au)).not.toEqual(c.bodies.map((x) => x.au));
    // further out, a longer year (Kepler)
    for (const body of a.bodies) expect(body.period).toBeCloseTo(Math.pow(body.au, 1.5), 6);
    expect(a.giant.au).toBeGreaterThan(4);
    expect(a.stars.length).toBeGreaterThan(4);
    expect(new Set(a.stars.map((s) => s.seed)).size).toBe(a.stars.length);
  });

  it('ties the comet to the gas giant: it returns once per turn of the giant\'s slow cycle, and keeps the new time when that cycle changes', () => {
    const sim = fresh('amber-reef-101');
    const cycle = sim.cosmos.cycle;
    run(sim, cycle * 3.2, 20000);
    const comets = ofType(sim, 'comet');
    expect(comets.length).toBe(3);
    for (let i = 1; i < comets.length; i++) expect(Math.abs(comets[i]!.simYear - comets[i - 1]!.simYear - cycle)).toBeLessThan(40001);
    // the giant is at the same point of its cycle at every return
    expect(sim.cosmos.giantPhase(sim.cometNext, sim.cometNext)).toBe(0);
    // a passing planet changes the giant's cycle; the comet follows it
    const flyby = sim.cosmos.flyby(sim, false);
    const changed = sim.cosmos.cycle;
    expect(changed).not.toBe(cycle);
    run(sim, changed * 2.1, 20000);
    const later = ofType(sim, 'comet').filter((e) => e.simYear > flyby.simYear);
    expect(later.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(later[1]!.simYear - later[0]!.simYear - changed)).toBeLessThan(40001);
  });
});

describe('E92 panspermia', () => {
  it('carries life to the neighbour after a recorded impact, and that life then grows on its own', () => {
    const sim = fresh('amber-reef-101');
    run(sim, 4e6);
    expect(sim.stage).not.toBe('barren');
    expect(sim.cosmos.rock.life).toBe(0);
    let impact = -1;
    for (let i = 0; i < 12 && sim.cosmos.rock.life === 0; i++) { impact = sim.meteor(100 + i * 37, 0.9, false).id; sim.step(15000); }
    const body = sim.cosmos.rock;
    expect(body.life).toBeGreaterThan(0);
    const arrival = ofType(sim, 'panspermia');
    expect(arrival.length).toBe(1);
    expect(arrival[0]!.causes).toEqual([impact]);
    expect(arrival[0]!.title).toContain(body.name);
    const young = body.life;
    run(sim, 60e6, 50000);
    expect(body.life).toBeGreaterThan(young * 5);
    expect(body.life).toBeLessThanOrEqual(body.room);
    expect(body.lifeStage).toBeGreaterThanOrEqual(2);
    expect(ofType(sim, 'neighbour-life').length).toBeGreaterThan(0);
    // never twice
    for (let i = 0; i < 6; i++) { sim.meteor(200 + i * 53, 0.9, false); sim.step(15000); }
    expect(ofType(sim, 'panspermia').length).toBe(1);
  });

  it('does not happen on a world with nothing alive to send', () => {
    const sim = fresh('amber-reef-101');
    for (let i = 0; i < 12; i++) { sim.meteor(100 + i * 37, 0.9, false); sim.step(100); }
    expect(sim.stage).toBe('barren');
    expect(sim.cosmos.rock.life).toBe(0);
  });
});

describe('E93 a rogue planet', () => {
  it('measurably changes the orbit, the tilt and the climate, and sends comets inward', () => {
    const sim = fresh('amber-reef-101');
    run(sim, 2e6);
    const solar = sim.climate.solar, tilt = sim.climate.tilt, au = sim.cosmos.au;
    const twin = fresh('amber-reef-101');
    run(twin, 2e6);
    const ev = sim.cosmos.flyby(sim, false);
    expect(sim.cosmos.au).not.toBe(au);
    expect(Math.abs(sim.cosmos.au - au)).toBeGreaterThan(0.01);
    expect(sim.climate.tilt).not.toBe(tilt);
    run(sim, 3e6); run(twin, 3e6);
    // the star is felt differently for good: brighter if the world moved in, dimmer if it moved out
    expect(Math.sign(sim.climate.solar - solar)).toBe(Math.sign(au - sim.cosmos.au));
    expect(Math.abs(sim.climate.solar - twin.climate.solar)).toBeGreaterThan(0.02);
    const rocks = ofType(sim, 'impact').filter((e) => e.causes.includes(ev.id));
    expect(rocks.length).toBeGreaterThanOrEqual(3);
    expect(ofType(twin, 'rogue-planet').length).toBe(0);
  });
});

describe('E94 a gamma-ray burst', () => {
  it('kills on the side of the world that faced it and spares the other', () => {
    const sim = fresh('amber-reef-101');
    run(sim, 30e6);
    expect(sim.creatures.livingSpecies).toBeGreaterThan(0);
    const reg = sim.regions, pos = sim.grid.pos, cr = sim.creatures;
    const dir: [number, number, number] = [0, 0, 1];
    const count = () => {
      let near = 0, far = 0;
      for (let c = 0; c < cr.count.length; c++) {
        if (!(cr.count[c]! > 0)) continue;
        const cell = reg.centre[cr.region[c]!]!;
        if (pos[cell * 3 + 2]! > 0.05) near += cr.count[c]!; else if (pos[cell * 3 + 2]! < -0.05) far += cr.count[c]!;
      }
      return { near, far };
    };
    const before = count();
    expect(before.near).toBeGreaterThan(0);
    expect(before.far).toBeGreaterThan(0);
    const ev = sim.cosmos.burst(sim, dir, false);
    const after = count();
    expect(after.far).toBe(before.far);
    expect(after.near).toBeLessThan(before.near * 0.8);
    expect(ev.type).toBe('gamma-burst');
    expect(sim.plants.ozoneHole).toBeGreaterThan(0.5);
    // every region marked by the burst is on the facing side
    for (let k = 0; k < reg.count; k++) if (sim.regionEvent[k] === ev.id) expect(pos[reg.centre[k]! * 3 + 2]!).toBeGreaterThan(0);
  });
});

describe('E95 the red giant', () => {
  it('is reached by a long run: the star swells, the world heats, the seas boil away', () => {
    const sim = fresh('amber-reef-101');
    run(sim, 3e6);
    expect(sim.cosmos.giantAt).toBeGreaterThan(600e6);
    expect(sim.cosmos.starPhase).toBe(0);
    // bring the date forward rather than run 700 My in a test
    sim.cosmos.giantAt = sim.simYear + 1e6;
    const sea0 = sim.world.seaLevel, temp0 = sim.climate.meanTemp;
    run(sim, 30e6, 100000);
    expect(sim.cosmos.starPhase).toBe(1);
    expect(sim.cosmos.swell).toBeGreaterThan(1.3);
    run(sim, 70e6, 100000);
    expect(sim.cosmos.starPhase).toBe(2);
    expect(sim.cosmos.swell).toBeGreaterThan(8);
    expect(sim.climate.meanTemp).toBeGreaterThan(temp0 + 40);
    expect(sim.cosmos.seaLoss).toBeGreaterThan(1);
    expect(sim.world.seaLevel).toBeLessThan(sea0 - 1);
    const told = ofType(sim, 'red-giant');
    expect(told.length).toBe(2);
    expect(told[1]!.causes).toEqual([told[0]!.id]);
    expect(ofType(sim, 'seas-boil').length).toBeGreaterThan(0);
  });
});

describe('E96 and E97 fleets and what they send back', () => {
  it('follows ships to other stars and brings back a report on a world from a different seed', () => {
    const sim = fresh('amber-reef-101');
    run(sim, 1e6);
    expect(sim.cosmos.fleets.length).toBe(0);
    sim.milestone('departure', 'Departure', 'They leave.', -1, []);
    sim.step(1);
    const fleets = sim.cosmos.fleets;
    expect(fleets.length).toBeGreaterThanOrEqual(2);
    expect(fleets[0]!.kind).toBe('probe');
    expect(new Set(fleets.map((f) => f.star)).size).toBe(fleets.length);
    const departure = sim.milestones.get('departure')!;
    for (const f of fleets) { expect(sim.events.events[f.eventId]!.causes).toEqual([departure]); expect(f.arrives).toBeGreaterThan(f.launched); expect(f.heard).toBeGreaterThan(f.arrives); }
    const probe = fleets[0]!;
    // a probe is decades to a few centuries on the way; nothing is heard before light can bring it home
    run(sim, probe.arrives - sim.simYear + 1, 5);
    expect(probe.arrived).toBe(true);
    expect(probe.reported).toBe(false);
    run(sim, probe.heard - sim.simYear + 1, 5);
    expect(probe.reported).toBe(true);
    const report = sim.cosmos.reports[0]!;
    expect(report.seed).not.toBe(sim.seed);
    expect(report.seed).toBe(sim.cosmos.stars[probe.star]!.seed);
    expect(report.map.length).toBe(MAP_W * MAP_H);
    expect(new Set(report.map).size).toBeGreaterThan(1);
    // the report is of a real world: building that seed gives the same numbers
    const there = sim.survey(report.seed);
    expect(there.land).toBe(report.land);
    expect(there.map).toEqual(report.map);
    expect(report.land).toBeGreaterThan(0.1);
    const word = sim.events.events[report.eventId]!;
    expect(word.type).toBe('transmission');
    expect(word.causes).toEqual([probe.eventId]);
    expect(word.data?.seed).toBe(report.seed);
    // the arks are still on their way
    expect(fleets.some((f) => f.kind === 'ark' && !f.arrived)).toBe(true);
  });
});

describe('the cosmos in a save', () => {
  it('comes back as it was, and the future runs the same from it', () => {
    const sim = fresh('amber-reef-101');
    run(sim, 2e6);
    sim.cosmos.flyby(sim, false);
    sim.milestone('departure', 'Departure', 'They leave.', -1, []);
    run(sim, 1e6);
    const save = saveSimulation(sim);
    const back = fresh('amber-reef-101');
    loadSimulation(back, save);
    expect(back.cosmos.au).toBe(sim.cosmos.au);
    expect(back.cosmos.fleets.length).toBe(sim.cosmos.fleets.length);
    expect(back.cosmos.bodies.map((b) => b.name)).toEqual(sim.cosmos.bodies.map((b) => b.name));
    run(sim, 2e6); run(back, 2e6);
    expect(back.events.events.length).toBe(sim.events.events.length);
    expect(back.digest()).toBe(sim.digest());
  });

  it('leaves a world that nothing from outside has touched exactly as it was before this existed', () => {
    const a = fresh('coral-dune-303'), b = fresh('coral-dune-303');
    run(a, 5e6); run(b, 5e6);
    expect(a.digest()).toBe(b.digest());
    expect(a.climate.solar).toBe(1);
  });
});
