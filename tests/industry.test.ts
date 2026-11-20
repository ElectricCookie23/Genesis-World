// Industry to the near future (expansion section 7, E61 to E70).
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { saveSimulation, loadSimulation, type SaveState } from '../src/sim/snapshot';
import type { Settlement } from '../src/sim/civilization';

const N = 15, SEED = 'amber-reef-101';
const grid = buildGrid(N);
const ofType = (sim: Simulation, type: string) => sim.events.events.filter((e) => e.type === type);
const land = (sim: Simulation, skip = 0) => { let k = 0; for (let i = 0; i < sim.grid.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel + 0.1 && k++ === skip) return i; return 0; };
const town = (sim: Simulation, cell: number, tech: number, name: string): Settlement => {
  const ev = sim.emit({ type: 'settlement', cellId: cell, title: `${name} is founded`, description: '', importance: 0, speciesIds: [1] });
  const st = { id: sim.civ.settlements.length, name, cell, region: sim.regions.regionOf[cell]!, species: 1, pop: 800, tech, founded: sim.simYear, lore: -1, eventId: ev.id, ruined: -1, painted: false, farms: true, stars: true, nation: -1, head: '', modifier: '', relic: -1 } as Settlement;
  sim.civ.settlements.push(st);
  return st;
};
const run = (sim: Simulation, years: number, dt = 10) => { for (let y = 0; y < years; y += dt) sim.step(dt); };
/** A people set down by hand on a young world, with the knowledge given (nothing lives yet, so the civilization code is idle). */
function people(tech: number, seed = SEED): { sim: Simulation; st: Settlement } {
  const sim = new Simulation(seed, N, grid);
  sim.step(1000);
  const st = town(sim, land(sim, 20), tech, 'Zohan');
  sim.civ.living = 30; sim.civ.maxTech = tech;
  sim.emit({ type: 'industry', title: 'The age of smoke', description: '', importance: 2 });
  return { sim, st };
}
const spacefaring = () => { const p = people(1.2); p.sim.milestone('space-age', 'The space age', '', -1, []); return p; };

// a world old enough to have forests and living seas, grown once
let grown: SaveState | null = null;
function old(): Simulation {
  if (!grown) { const s = new Simulation(SEED, N, grid); for (let y = 0; y < 120e6; y += 15000) s.step(15000); grown = saveSimulation(s); }
  const sim = new Simulation(SEED, N, grid); loadSimulation(sim, grown); return sim;
}

describe('E61, E62 fuel from the world\'s own past', () => {
  it('every field names what it was made of and when, and links to it in the cause graph', () => {
    const sim = old();
    // (set aside whatever the world has grown by itself, and stand a hand-made industrial people on it)
    for (const st of sim.civ.settlements) st.ruined = sim.simYear;
    const st = town(sim, land(sim, 20), 0.9, 'Zohan');
    sim.civ.living = 5; sim.civ.maxTech = 0.9;
    sim.emit({ type: 'industry', title: 'The age of smoke', description: '', importance: 2 });
    sim.industry.step(sim, 10);
    // (the fields are opened by the first industrial age this world had, which may be its own and not the hand-made one)
    const industry = sim.events.events[sim.events.events[sim.industry.deposits[0]?.eventId ?? 0]!.causes[0]!]!;
    expect(industry.type).toBe('industry');
    const d = sim.industry.deposits;
    expect(d.length).toBeGreaterThan(0);
    for (const f of d) {
      expect(f.amount).toBeGreaterThan(0.5);
      expect(f.from).toBeGreaterThan(0); expect(f.to).toBeGreaterThanOrEqual(f.from); expect(f.to).toBeLessThanOrEqual(sim.simYear);
      const ev = sim.events.events[f.eventId]!;
      expect(ev.type).toBe(f.kind === 'coal' ? 'coal-field' : 'oil-field');
      expect(ev.causes).toContain(industry.id);
      expect(ev.description).toContain(f.source);
      expect(ev.description).toMatch(/years ago/);
      // its origin is on record too
      if (f.sourceEvent >= 0) expect(ev.causes).toContain(f.sourceEvent);
    }
    const oil = d.find((f) => f.kind === 'oil');
    if (oil) expect(oil.source).toMatch(/^the plankton seas of .* years ago$/);
    const coal = d.find((f) => f.kind === 'coal');
    if (coal) expect(coal.source).toMatch(/forests/);
    // opened once
    sim.industry.step(sim, 10);
    expect(sim.industry.deposits.length).toBe(d.length);
    void st;
  }, 300000);
});

describe('E63 electrification', () => {
  it('spreads town by town until none is lit by fire', () => {
    const { sim } = people(0.95);
    run(sim, 30);
    expect(sim.industry.electric).toBeGreaterThan(0.1); expect(sim.industry.electric).toBeLessThan(0.6);
    expect(ofType(sim, 'electrification').length).toBe(1);
    run(sim, 120);
    expect(sim.industry.electric).toBe(1);
    expect(ofType(sim, 'grid-complete')[0]!.causes).toEqual([ofType(sim, 'electrification')[0]!.id]);
  });
});

describe('E64 the climate they cause, and E69 a council that changes it', () => {
  it('their emissions measurably warm the world, and a council\'s decision slows it', () => {
    // the simulation's own rule adds to the greenhouse for every living town of an industrial people: stand in for it here
    const emit = (sim: Simulation, years: number) => { for (let y = 0; y < years; y += 10) { sim.climate.greenhouse += 1.2e-5 * 10 * sim.civ.living * 40; sim.step(10); } };
    const { sim } = people(0.9);
    const t0 = sim.climate.meanTemp;
    emit(sim, 400);
    expect(sim.industry.warming).toBeGreaterThan(1.5);
    expect(sim.climate.meanTemp).toBeGreaterThan(t0 + 1);
    const told = ofType(sim, 'warming');
    expect(told.length).toBe(1);
    expect(sim.industry.council).toBeNull(); // not yet the knowledge for it
    // the same world twice from here: one forms a council, one cannot
    const save = saveSimulation(sim);
    const without = new Simulation(SEED, N, grid); loadSimulation(without, save);
    sim.civ.maxTech = 1.0; sim.civ.settlements[0]!.tech = 1.0;
    sim.industry.warming = 2.5; // (frightening enough)
    emit(sim, 20);
    expect(sim.industry.council).not.toBeNull();
    expect(ofType(sim, 'world-council').length).toBe(1);
    expect(ofType(sim, 'council-decision').length).toBe(1);
    expect(sim.industry.cut).toBeCloseTo(0.6, 6);
    emit(without, 20);
    const a = sim.climate.greenhouse, b = without.climate.greenhouse;
    emit(sim, 600); emit(without, 600);
    // an institution changed a real outcome: the world with a council warmed less over the same years
    expect(sim.climate.greenhouse - a).toBeLessThan((without.climate.greenhouse - b) * 0.999);
    expect(without.industry.council).toBeNull();
  });
});

describe('E65 the radio bubble', () => {
  it('grows one light year a year from the first broadcast', () => {
    const { sim } = people(1.0);
    run(sim, 10);
    const began = sim.industry.firstBroadcast;
    expect(began).toBeGreaterThan(0);
    expect(sim.industry.firstMessage.length).toBeGreaterThan(5);
    expect(ofType(sim, 'radio')[0]!.description).toContain(sim.industry.firstMessage);
    run(sim, 500);
    expect(sim.industry.firstBroadcast).toBe(began);
    expect(sim.simYear - sim.industry.info().firstBroadcast).toBeCloseTo(sim.simYear - began, 6);
  });
});

describe('E66 the information age', () => {
  it('a network comes to join every great town', () => {
    const { sim } = people(1.06);
    run(sim, 40);
    expect(sim.industry.network).toBeGreaterThan(0.2); expect(sim.industry.network).toBeLessThan(1);
    run(sim, 80);
    expect(sim.industry.network).toBe(1);
    expect(ofType(sim, 'network-complete').length).toBe(1);
  });
});

describe('E67 debris and a closed sky', () => {
  it('a cascade stops everything that depends on launches until the sky clears', () => {
    const { sim } = spacefaring();
    run(sim, 50);
    const clock = sim.future.clock;
    expect(clock).toBeGreaterThan(0);
    const ev = sim.industry.cascade(sim);
    expect(ev.type).toBe('debris-cascade');
    expect(sim.industry.skyClosed(sim.simYear)).toBe(true);
    const until = sim.industry.skyClosedUntil;
    run(sim, 100);
    expect(sim.future.clock).toBe(clock);      // nothing went up
    expect(sim.industry.moonBase).toBe(false);
    run(sim, until - sim.simYear + 20);
    expect(sim.industry.skyClosed(sim.simYear)).toBe(false);
    expect(ofType(sim, 'sky-reopens').length).toBe(1);
    run(sim, 50);
    expect(sim.future.clock).toBeGreaterThan(clock);
  });

  it('debris builds up with use and, left long enough, cascades without help', () => {
    const { sim } = spacefaring();
    run(sim, 3000, 25);
    expect(ofType(sim, 'debris-cascade').length).toBeGreaterThanOrEqual(1);
  });
});

describe('E68 moon bases', () => {
  it('a spacefaring people settles the moon, and it is on record', () => {
    const { sim } = spacefaring();
    run(sim, 2500, 25);
    expect(ofType(sim, 'moon-base').length).toBe(1);
  });
});

describe('E70 asteroid defence', () => {
  it('a people that watches the sky turns aside at least one falling rock; one that does not is struck', () => {
    const { sim } = spacefaring();
    run(sim, 20);
    expect(sim.industry.defence).toBe(true);
    let turned = 0, struck = 0;
    for (let k = 0; k < 12; k++) { const ev = sim.meteor(land(sim, 30 + k * 7), 0.4, true); if (ev.type === 'meteor-deflected') turned++; else struck++; }
    expect(turned).toBeGreaterThanOrEqual(1);
    expect(sim.industry.deflected).toBe(turned);
    expect(ofType(sim, 'impact').length).toBe(struck);
    // without the watch every rock comes down
    const plain = people(0.9).sim;
    for (let k = 0; k < 6; k++) expect(plain.meteor(land(plain, 30 + k * 7), 0.4, true).type).toBe('impact');
    // and a closed sky cannot launch interceptors
    sim.industry.cascade(sim);
    for (let k = 0; k < 6; k++) expect(sim.meteor(land(sim, 200 + k * 7), 0.4, true).type).toBe('impact');
  });
});

describe('section 7 in a save', () => {
  it('comes back as it was and runs on the same', () => {
    const { sim } = spacefaring();
    run(sim, 800, 20);
    const back = new Simulation(SEED, N, grid);
    loadSimulation(back, saveSimulation(sim));
    expect(back.industry.info()).toEqual(sim.industry.info());
    run(sim, 800, 20); run(back, 800, 20);
    expect(back.industry.info()).toEqual(sim.industry.info());
    expect(back.events.events.length).toBe(sim.events.events.length);
  });
});
