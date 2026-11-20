// A message to the stars (E99) and the last archive (E100).
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { saveSimulation, loadSimulation } from '../src/sim/snapshot';
import type { Settlement } from '../src/sim/civilization';

const N = 15;
const grid = buildGrid(N);
// A young world: nothing lives yet, so the civilization code is not running and towns can be set down by hand.
const fresh = () => { const sim = new Simulation('amber-reef-101', N, grid); sim.step(1000); return sim; };
const land = (sim: Simulation, skip = 0) => { let k = 0; for (let i = 0; i < sim.grid.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel + 0.1 && k++ === skip) return i; return 0; };
const town = (sim: Simulation, species: number, cell: number, tech: number, name: string): Settlement => {
  const ev = sim.emit({ type: 'settlement', cellId: cell, title: `${name} is founded`, description: `A people settles at ${name}.`, importance: 1, speciesIds: [species] });
  const st = { id: sim.civ.settlements.length, name, cell, region: sim.regions.regionOf[cell]!, species, pop: 50, tech, founded: sim.simYear, lore: -1, eventId: ev.id, ruined: -1, painted: false, farms: true, stars: false, nation: -1, head: '', modifier: '', relic: -1 } as Settlement;
  sim.civ.settlements.push(st);
  sim.civ.living = sim.civ.settlements.filter((s) => s.ruined < 0).length;
  return st;
};
const ofType = (sim: Simulation, type: string) => sim.events.events.filter((e) => e.type === type);

describe('E100 the last archive', () => {
  it('is left when a people ends, holds their history, and is found by a later people who build nearby', () => {
    const sim = fresh();
    const cell = land(sim, 40);
    const old = town(sim, 1, cell, 0.9, 'Aluma');
    sim.step(500);
    const war = sim.emit({ type: 'war', cellId: cell, title: 'The war of the two rivers', description: 'Aluma burned and was rebuilt.', importance: 2, speciesIds: [1] });
    sim.step(500);
    expect(sim.legacy.archives.length).toBe(0);
    // the last town empties
    old.ruined = sim.simYear;
    sim.step(1);
    expect(sim.legacy.archives.length).toBe(1);
    const a = sim.legacy.archives[0]!;
    expect(a.kind).toBe('buried record');
    expect(a.species).toBe(1);
    expect(a.place).toBe('Aluma');
    expect(a.lines.some((l) => l.includes('The war of the two rivers'))).toBe(true);
    expect(a.lines.some((l) => l.includes('years before the end'))).toBe(true);
    expect(sim.events.events[a.eventId]!.causes).toContain(old.eventId);
    expect(a.foundBy).toBe(-1);
    void war;
    // millions of years on, their own kind returning would not count, and a far-off town of another people does not find it
    sim.step(2e6);
    let other = -1;
    for (let i = 0; i < sim.grid.count && other < 0; i++) if (sim.world.elevation[i]! > sim.world.seaLevel && sim.grid.pos[i * 3]! * sim.grid.pos[cell * 3]! + sim.grid.pos[i * 3 + 1]! * sim.grid.pos[cell * 3 + 1]! + sim.grid.pos[i * 3 + 2]! * sim.grid.pos[cell * 3 + 2]! < -0.3) other = i;
    town(sim, 2, other, 0.6, 'Farside');
    sim.step(1);
    expect(a.foundBy).toBe(-1);
    // a later people builds beside it
    const near = sim.grid.neighbors[cell * 6]!;
    const finder = town(sim, 2, near, 0.6, 'Morrow');
    sim.step(1);
    expect(a.foundBy).toBe(2);
    expect(a.foundYear).toBe(sim.simYear);
    const found = ofType(sim, 'archive-found');
    expect(found.length).toBe(1);
    expect(found[0]!.causes).toEqual(expect.arrayContaining([a.eventId, finder.eventId]));
    expect(found[0]!.description).toContain('2 million years before them');
    // only once
    sim.step(10);
    expect(ofType(sim, 'archive-found').length).toBe(1);
  });

  it('seals a vault at the last war and leaves a monument in orbit at a departure, which only a people who can fly can reach', () => {
    const sim = fresh();
    const cell = land(sim, 10);
    town(sim, 1, cell, 1.15, 'Kreth');
    const war = sim.emit({ type: 'nuclear-war', cellId: cell, title: 'The last war', description: 'The cities burn.', importance: 3, speciesIds: [1] });
    sim.step(1);
    expect(sim.legacy.archives.map((a) => a.kind)).toEqual(['vault']);
    expect(sim.events.events[sim.legacy.archives[0]!.eventId]!.causes).toContain(war.id);
    sim.milestone('departure', 'Departure', 'They leave.', -1, []);
    sim.step(1);
    expect(sim.legacy.archives.map((a) => a.kind)).toEqual(['vault', 'orbital monument']);
    const monument = sim.legacy.archives[1]!;
    for (const st of sim.civ.settlements) st.ruined = sim.simYear;
    sim.step(10);
    const far = land(sim, 300);
    const young = town(sim, 3, far, 0.6, 'Tarn');
    sim.step(10);
    expect(monument.foundBy).toBe(-1);
    young.tech = 1.1;
    sim.step(10);
    expect(monument.foundBy).toBe(3);
  });
});

describe('E99 a message to the stars', () => {
  it('is sent once by a people with radio, and says only what is true of their world', () => {
    const sim = fresh();
    const cell = land(sim, 20);
    const st = town(sim, 1, cell, 0.9, 'Zohan');
    town(sim, 1, land(sim, 60), 0.5, 'Oske');
    sim.step(200);
    expect(sim.legacy.messages.length).toBe(0); // no transmitter yet
    st.tech = 1.02;
    sim.step(1);
    expect(sim.legacy.messages.length).toBe(1);
    const m = sim.legacy.messages[0]!;
    expect(m.town).toBe('Zohan');
    expect(m.text).toContain('in two towns');
    expect(m.text).toContain(`around the star we call ${sim.cosmos.starName}`);
    const inner = sim.cosmos.bodies.filter((b) => b.au < sim.cosmos.au).length;
    expect(m.text).toContain(['first', 'second', 'third', 'fourth', 'fifth'][inner]!);
    expect(m.text).toContain('It has one moon.');
    expect(m.glyphs.length).toBe(m.text.split(' ').length);
    // it is aimed at no one: the nearest star is only where it passes first
    const near = sim.cosmos.stars.reduce((a, b) => (b.ly < a.ly ? b : a));
    expect(m.toward).toBe(near.name);
    expect(m.years).toBeCloseTo(near.ly, 1);
    const ev = sim.events.events[m.eventId]!;
    expect(ev.type).toBe('star-message');
    expect(ev.causes).toContain(st.eventId);
    expect(ev.description).toContain(m.text);
    expect(ev.description).toContain('addressed to no one');
    // a people sends once, whatever is done to its world afterwards; another people sends its own
    sim.intervene('mountain', cell);
    sim.step(5000);
    expect(sim.legacy.messages.length).toBe(1);
    town(sim, 2, land(sim, 200), 1.1, 'Morrow');
    sim.step(1);
    expect(sim.legacy.messages.length).toBe(2);
    expect(sim.legacy.messages[1]!.text).toContain('in one town');
  });

  it('tells of a ring once the moon is gone', () => {
    const sim = fresh();
    const cell = land(sim, 20);
    sim.intervene('shatter', cell);
    town(sim, 1, cell, 1.05, 'Zohan');
    sim.step(1);
    expect(sim.legacy.messages[0]!.text).toContain('a ring where its moon used to be');
  });

  it('is carried in a save, and a save from before reads without the old messages', () => {
    const sim = fresh();
    const cell = land(sim, 20);
    town(sim, 1, cell, 1.05, 'Zohan');
    sim.intervene('tilt', cell);
    sim.step(100);
    expect(sim.legacy.messages.length).toBe(1);
    const save = saveSimulation(sim);
    const back = new Simulation('amber-reef-101', N, grid);
    loadSimulation(back, save);
    expect(back.legacy.messages).toEqual(sim.legacy.messages);
    expect(back.interventions).toEqual(sim.interventions);
    back.step(5000); sim.step(5000);
    expect(back.legacy.messages.length).toBe(1);
    // an old save: the tools under their old names, and a message of the old kind
    const old = structuredClone(save) as unknown as { data: Record<string, unknown> };
    const data = old.data as { interventions?: number[]; godEvents?: number[]; events: { __nested: { events: { type: string; title: string; description: string }[] } }; legacy: { __nested: { messages: Record<string, unknown>[] } } };
    data.godEvents = data.interventions; delete data.interventions;
    for (const e of data.events.__nested.events) if (e.type.startsWith('tool-')) e.type = `god-${e.type.slice(5)}`;
    data.legacy.__nested.messages.push({ id: 1, year: 5, town: 'Zohan', cell, species: 1, glyphs: [1], text: 'old', about: 3, eventId: 0 });
    const again = new Simulation('amber-reef-101', N, grid);
    loadSimulation(again, old as never);
    expect(again.interventions).toEqual(sim.interventions.slice(0, again.interventions.length));
    expect(again.interventions.length).toBeGreaterThan(0);
    expect(again.events.events.some((e) => e.type.startsWith('god-'))).toBe(false);
    expect(again.events.events.some((e) => e.type === 'tool-tilt')).toBe(true);
    expect(again.legacy.messages.length).toBe(1);
  });
});
