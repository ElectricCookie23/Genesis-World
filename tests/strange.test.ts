// Strange world systems (expansion section 9, E81 to E90).
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
import { saveSimulation, loadSimulation, type SaveState } from '../src/sim/snapshot';
import { G, GENE_COUNT, PG } from '../src/sim/genetics';
import type { Settlement } from '../src/sim/civilization';
import type { Strange } from '../src/sim/strange';

const N = 15, SEED = 'amber-reef-101';
const grid = buildGrid(N);
const young = () => { const sim = new Simulation(SEED, N, grid); sim.step(1000); return sim; };
// one world grown until animals are well established, shared by copies
let grown: SaveState | null = null;
const living = () => {
  if (!grown) { const s = new Simulation(SEED, N, grid); for (let y = 0; y < 90e6; y += 15000) s.step(15000); grown = saveSimulation(s); }
  const sim = new Simulation(SEED, N, grid); loadSimulation(sim, grown); return sim;
};
const ofType = (sim: Simulation, type: string) => sim.events.events.filter((e) => e.type === type);
const inner = (sim: Simulation): Strange => sim.strange;
const land = (sim: Simulation, skip = 0) => { let k = 0; for (let i = 0; i < sim.grid.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel + 0.1 && k++ === skip) return i; return 0; };
const town = (sim: Simulation, species: number, cell: number, tech: number, name: string, over: Partial<Settlement> = {}): Settlement => {
  const ev = sim.emit({ type: 'settlement', cellId: cell, title: `${name} is founded`, description: '', importance: 0, speciesIds: [species] });
  const st = { id: sim.civ.settlements.length, name, cell, region: sim.regions.regionOf[cell]!, species, pop: 50, tech, founded: sim.simYear, belief: -1, eventId: ev.id, ruined: -1, painted: false, temple: false, farms: false, stars: false, nation: -1, head: '', modifier: '', relic: -1, ...over } as Settlement;
  sim.civ.settlements.push(st);
  return st;
};

describe('E81 deep-time strata', () => {
  it('a big impact leaves a layer worldwide, a small one only nearby, and geologists later read it', () => {
    const sim = young();
    const big = sim.meteor(land(sim, 30), 0.9, false);
    const small = sim.meteor(land(sim, 200), 0.2, false);
    sim.step(100);
    const layers = sim.strange.layers;
    const a = layers.find((l) => l.eventId === big.id)!, b = layers.find((l) => l.eventId === small.id)!;
    expect(a.kind).toBe('metal'); expect(a.world).toBe(true); expect(a.year).toBe(big.simYear);
    expect(b.world).toBe(false);
    expect(ofType(sim, 'strata-read').length).toBe(0);
    // a people with the means to date rock
    sim.civ.living = 4; sim.civ.maxTech = 0.8;
    sim.step(1);
    const read = ofType(sim, 'strata-read');
    expect(read.length).toBe(1);
    expect(read[0]!.causes).toEqual([big.id]);
    expect(read[0]!.description).toContain(big.title);
    expect(a.read).toBe(read[0]!.id);
  });
});

describe('E82 magnetic pole flips', () => {
  it('a flip sends migrants astray, raises mutation, and ends with the field reversed', () => {
    const sim = living();
    const cr = sim.creatures;
    const sp = cr.species.filter((s) => s.extinctYear < 0 && s.name && s.pop > 500).sort((x, y) => y.pop - x.pop)[0]!;
    sp.ref[G.Migration] = 0.9;
    let before = 0; for (let c = 0; c < cr.high; c++) if (cr.alive[c] && cr.sp[c] === sp.id) before += cr.count[c]!;
    const sign = sim.strange.poleSign, settledBefore = ofType(sim, 'pole-settled').length;
    const ev = sim.strange.flip(sim);
    let after = 0; for (let c = 0; c < cr.high; c++) if (cr.alive[c] && cr.sp[c] === sp.id) after += cr.count[c]!;
    expect(after).toBeLessThan(before * 0.85);
    const lost = ofType(sim, 'migration-lost');
    expect(lost.length).toBeGreaterThanOrEqual(1);
    expect(lost.some((e) => e.speciesIds?.includes(sp.id) && e.causes.includes(ev.id))).toBe(true);
    expect(cr.mutationBoost).toBeGreaterThanOrEqual(2.5);
    sim.step(15000);
    expect(sim.strange.flipProgress(sim.simYear)).toBeGreaterThan(0.3);
    expect(sim.strange.poleSign).toBe(sign);
    sim.step(15000); sim.step(15000);
    expect(sim.strange.poleSign).toBe(-sign);
    expect(sim.strange.flipProgress(sim.simYear)).toBe(0);
    expect(ofType(sim, 'pole-settled').length).toBe(settledBefore + 1);
  });

  it('comes round on its own long cycle', () => {
    const sim = new Simulation(SEED, N, grid);
    expect(sim.strange.flipAt).toBeGreaterThan(5e6);
    const due = sim.strange.flipAt;
    for (let y = 0; y < due + 20000; y += 20000) sim.step(20000);
    expect(sim.strange.flips).toBe(1);
    expect(ofType(sim, 'pole-flip').length).toBe(1);
    expect(sim.strange.flipAt).toBeGreaterThan(due);
  });
});

describe('E83 the microbe layer', () => {
  it('breeds sickness where animals crowd, and every plague traces back to a strain', () => {
    const sim = living();
    let top = 0; for (const v of sim.strange.germ) top = Math.max(top, v);
    expect(top).toBeGreaterThan(0.05);
    const cr = sim.creatures;
    let region = -1; for (let c = 0; c < cr.high && region < 0; c++) if (cr.alive[c] && cr.count[c]! > 100 && cr.species[cr.sp[c]!]!.name) region = cr.region[c]!;
    const plague = sim.plague(region, false)!;
    expect(plague).not.toBeNull();
    const strain = plague.causes.map((c) => sim.events.events[c]!).find((e) => e.type === 'strain')!;
    expect(strain).toBeDefined();
    expect(strain.data?.region).toBe(region);
    // the same strain is behind the next outbreak there; one sent from the sky has no such origin
    expect(sim.strange.strainFor(sim, region)).toBe(strain.id);
    const sent = sim.plague(region, true)!;
    expect(sent.causes.map((c) => sim.events.events[c]!.type)).not.toContain('strain');
  });
});

describe('E84 the continental hive mind', () => {
  it('a small sociable animal spread over a wide country joins up, and given long enough becomes a mind', () => {
    const sim = living();
    const s = sim.creatures.species.filter((x) => x.extinctYear < 0 && x.name).sort((a, b) => b.regions - a.regions)[0]!;
    const shape = () => { s.ref[G.Sociality] = 0.95; s.ref[G.Size] = 0.2; s.ref[G.Water] = 0.1; s.regions = Math.max(s.regions, 12); };
    shape();
    inner(sim).hiveMind(sim, 15000);
    expect(sim.strange.hive?.species).toBe(s.id);
    expect(ofType(sim, 'hive').length).toBe(1);
    expect(sim.strange.hive!.awake).toBe(false);
    // it grows slowly
    inner(sim).hiveMind(sim, 1e6);
    const m = sim.strange.hive!.mind;
    expect(m).toBeGreaterThan(0); expect(m).toBeLessThan(0.2);
    sim.strange.hive!.mind = 0.9999;
    inner(sim).hiveMind(sim, 1e6);
    expect(sim.strange.hive!.awake).toBe(true);
    const awake = ofType(sim, 'hive-mind');
    expect(awake.length).toBe(1);
    expect(awake[0]!.importance).toBe(3);
    expect(awake[0]!.speciesIds).toEqual([s.id]);
    // and it ends with its animal
    s.extinctYear = sim.simYear;
    inner(sim).hiveMind(sim, 15000);
    expect(sim.strange.hive).toBeNull();
    expect(ofType(sim, 'hive-end').length).toBe(1);
  });
});

describe('E85 trance blooms', () => {
  it('a glowing, drugging plant flowers, and a town among it learns to use it', () => {
    const sim = living();
    const pl = sim.plants;
    // the plant that covers the most land, made to glow
    let region = -1, plant = -1;
    for (let r = 0; r < sim.regions.count && plant < 0; r++) { const d = pl.dominant[r]!; if (d >= 0 && sim.regions.land[r]! > 0.5 && !pl.species[d]!.aquatic && pl.species[d]!.cover > 1.5) { plant = d; region = r; } }
    expect(plant).toBeGreaterThanOrEqual(0);
    const p = pl.species[plant]!;
    p.genes[PG.Glow] = 0.7; p.genes[PG.Toxicity] = 0.5; p.established = true;
    inner(sim).blooms(sim);
    const bloom = ofType(sim, 'trance-bloom');
    expect(bloom.length).toBeGreaterThanOrEqual(1);
    const mine = bloom.find((e) => e.data?.plant === plant)!;
    expect(mine).toBeDefined();
    const cell = sim.regions.centre[region]!;
    const st = town(sim, 1, cell, 0.3, 'Aluma');
    inner(sim).blooms(sim);
    const use = ofType(sim, 'bloom-use');
    expect(use.length).toBe(1);
    expect(use[0]!.causes).toEqual(expect.arrayContaining([mine.id, st.eventId]));
    // (no faith is founded on it: the game has no religion, by the owner's decision)
    expect(st.belief).toBe(-1);
    expect(st.temple).toBe(false);
    inner(sim).blooms(sim);
    expect(ofType(sim, 'bloom-use').length).toBe(1);
    sim.civ.settlements.pop();
  });
});

describe('E86 light and noise', () => {
  it('a city\'s light thins the animals of the night around it and leaves the day\'s alone', () => {
    const sim = living();
    const cr = sim.creatures;
    // a region with at least two cohorts; make one a night animal and one a day animal
    const byRegion = new Map<number, number[]>();
    for (let c = 0; c < cr.high; c++) if (cr.alive[c] && cr.count[c]! > 50 && cr.species[cr.sp[c]!]!.name) byRegion.set(cr.region[c]!, [...(byRegion.get(cr.region[c]!) ?? []), c]);
    const [region, list] = [...byRegion.entries()].find(([, l]) => new Set(l.map((c) => cr.sp[c])).size >= 2)!;
    const night = list[0]!, day = list.find((c) => cr.sp[c] !== cr.sp[night])!;
    for (let c = 0; c < cr.high; c++) if (cr.alive[c]) { cr.genome[c * GENE_COUNT + G.Glow] = 0; cr.genome[c * GENE_COUNT + G.Echo] = 0; cr.genome[c * GENE_COUNT + G.Hearing] = 0; cr.genome[c * GENE_COUNT + G.Nocturnal] = cr.sp[c] === cr.sp[night] ? 0.9 : 0.1; }
    const n0 = cr.count[night]!, d0 = cr.count[day]!;
    // the glow of cities over every country that animal lives in (it is told once the loss is a real share of the species)
    const lit = new Set<number>([region]); for (let c = 0; c < cr.high; c++) if (cr.alive[c] && cr.sp[c] === cr.sp[night]) lit.add(cr.region[c]!);
    const cities = [...lit].map((r) => ({ region: r, light: 1, noise: 0, eventId: -1 }));
    for (let k = 0; k < 12; k++) sim.strange.pollute(sim, 300, cities);
    expect(cr.count[night]!).toBeLessThan(n0 * 0.5);
    expect(cr.count[day]!).toBe(d0);
    const told = ofType(sim, 'light-pollution');
    expect(told.length).toBe(1);
    expect(told[0]!.speciesIds).toEqual([cr.sp[night]]);
    // one city alone only reaches its own country and the ones beside it
    const other = living(), oc = other.creatures;
    let r0 = -1; for (let c = 0; c < oc.high && r0 < 0; c++) if (oc.alive[c] && oc.count[c]! > 50) r0 = oc.region[c]!;
    for (let c = 0; c < oc.high; c++) if (oc.alive[c]) oc.genome[c * GENE_COUNT + G.Nocturnal] = 0.9;
    const near = new Set<number>([r0]); for (let j = 0; j < other.regions.grid.ncount[r0]!; j++) near.add(other.regions.grid.neighbors[r0 * 6 + j]!);
    const was = Array.from(oc.count);
    other.strange.pollute(other, 300, [{ region: r0, light: 1, noise: 0, eventId: -1 }]);
    for (let c = 0; c < oc.high; c++) if (oc.alive[c]) { if (near.has(oc.region[c]!)) expect(oc.count[c]!).toBeLessThan(was[c]!); else expect(oc.count[c]!).toBe(was[c]!); }
  });
});

describe('E87 mimic architects', () => {
  it('after a people is gone, a nest-builder living among the ruins starts to copy them', () => {
    const sim = living();
    const cr = sim.creatures;
    let cohort = -1; for (let c = 0; c < cr.high && cohort < 0; c++) if (cr.alive[c] && cr.species[cr.sp[c]!]!.name) cohort = c;
    const s = cr.species[cr.sp[cohort]!]!;
    // (a land animal that tends its nests, for the purpose: this small test world has few)
    s.ref[G.Water] = 0.2; s.ref[G.Care] = 0.9; s.ref[G.Sociality] = 0.8; s.ref[G.Curiosity] = 0.7;
    const cell = sim.regions.centre[cr.region[cohort]!]!;
    // nothing while the town stands
    const st = town(sim, 9999, cell, 0.7, 'Kreth');
    st.region = cr.region[cohort]!;
    for (let k = 0; k < 40; k++) { inner(sim).mimicAt = 0; inner(sim).mimicry(sim); }
    expect(sim.strange.mimics.length).toBe(0);
    st.ruined = sim.simYear - 2000;
    for (let k = 0; k < 80 && !sim.strange.mimics.length; k++) { inner(sim).mimicAt = 0; inner(sim).mimicry(sim); }
    expect(sim.strange.mimics).toEqual([s.id]);
    const ev = ofType(sim, 'mimic');
    expect(ev.length).toBe(1);
    expect(ev[0]!.causes).toContain(st.eventId);
    expect(ev[0]!.title).toContain('towers');
    sim.civ.settlements.pop();
  });
});

describe('E88 the swarm', () => {
  it('is feared, then dated, then prepared for, and a people that predicted it survives it', () => {
    const sim = young();
    const P = sim.strange.swarmPeriod;
    expect(P).toBeGreaterThanOrEqual(1800);
    const st = town(sim, 1, land(sim, 20), 0.5, 'Zohan');
    sim.civ.living = 1; sim.civ.maxTech = 0.5;
    const through = (storms: number) => { const want = ofType(sim, 'swarm').length + storms; for (let k = 0; k < 4000 && ofType(sim, 'swarm').length < want; k++) sim.step(10); };
    st.pop = 100; through(1);
    expect(st.pop).toBeCloseTo(70, 5); // caught unready: three in ten lost
    expect(sim.strange.swarmStage).toBe(0);
    through(1);
    expect(sim.strange.swarmStage).toBe(1);
    expect(ofType(sim, 'swarm-myth').length).toBe(1);
    // the storms keep their time
    const storms = ofType(sim, 'swarm');
    expect(Math.abs(storms[1]!.simYear - storms[0]!.simYear - P)).toBeLessThanOrEqual(10);
    expect(storms[1]!.causes).toEqual([storms[0]!.id]);
    // with records and numbers, the next one is dated
    sim.civ.maxTech = 0.6; through(1);
    expect(sim.strange.swarmStage).toBe(2);
    const predicted = ofType(sim, 'swarm-predicted');
    expect(predicted.length).toBe(1);
    expect(ofType(sim, 'swarm-survived').length).toBe(0);
    // and with the means, prepared for
    sim.civ.maxTech = 0.85; st.pop = 100; through(1);
    expect(ofType(sim, 'swarm-prepared').length).toBe(1);
    const survived = ofType(sim, 'swarm-survived');
    expect(survived.length).toBe(1);
    expect(survived[0]!.causes).toEqual(expect.arrayContaining([predicted[0]!.id, ofType(sim, 'swarm')[3]!.id]));
    expect(st.pop).toBeCloseTo(95, 5); // one in twenty, where it was three in ten
    expect(sim.strange.lastStormLoss).toBeCloseTo(0.05, 6);
    expect(sim.strange.swarmSurvived).toBe(1);
  }, 120000);

  it('is not told storm by storm when ages pass in a step', () => {
    const sim = young();
    for (let k = 0; k < 40; k++) sim.step(15000);
    expect(ofType(sim, 'swarm').length).toBe(0);
  });
});

describe('E89 ecological memory', () => {
  it('worn land takes centuries to recover, and fields wear it', () => {
    const sim = young();
    const scar = sim.plants.scar;
    scar[5] = 0.8;
    for (let y = 0; y < 100; y += 10) sim.step(10);
    expect(scar[5]!).toBeGreaterThan(0.6);      // a lifetime later it is still poor
    for (let y = 0; y < 300; y += 10) sim.step(10);
    expect(scar[5]!).toBeGreaterThan(0.35); expect(scar[5]!).toBeLessThan(0.45);   // half healed in four centuries
    for (let y = 0; y < 2000; y += 10) sim.step(10);
    expect(scar[5]!).toBeLessThan(0.03);
    // a farming town wears its own country
    const st = town(sim, 1, land(sim, 20), 0.4, 'Oske', { farms: true, pop: 400 });
    expect(scar[st.region]!).toBe(0);
    for (let y = 0; y < 600; y += 10) sim.step(10);
    expect(scar[st.region]!).toBeGreaterThan(0.1);
    const worn = scar[st.region]!;
    st.ruined = sim.simYear;
    for (let y = 0; y < 400; y += 10) sim.step(10);
    expect(scar[st.region]!).toBeLessThan(worn * 0.6);
    expect(scar[st.region]!).toBeGreaterThan(worn * 0.4);
  });
});

describe('E90 the planet\'s pulse', () => {
  it('beats slowly in a quiet world, races after a catastrophe, and settles again', () => {
    const sim = young();
    for (let y = 0; y < 3000; y += 10) sim.step(10);
    const calm = sim.strange.pulseRate;
    expect(calm).toBeLessThan(80);
    expect(sim.strange.health).toBeGreaterThan(0.7);
    sim.meteor(land(sim, 30), 0.8, false);
    sim.step(10);
    expect(sim.strange.pulseRate).toBeGreaterThan(calm + 20);
    const racing = sim.strange.pulseRate;
    for (let y = 0; y < 6000; y += 10) sim.step(10);
    // the jolt has passed, but the cold it left has not: calmer, not yet calm
    expect(sim.strange.pulseRate).toBeLessThan(racing - 15);
    for (let k = 0; k < 20; k++) sim.step(15000);
    expect(sim.strange.pulseRate).toBeLessThan(calm + 12);
  });

  it('reacts to every kind of major global event', () => {
    for (const type of ['impact', 'mass-extinction', 'nuclear-war', 'super-eruption', 'gamma-burst', 'snowball', 'rogue-planet']) {
      const sim = young();
      sim.step(10);
      const before = sim.strange.pulseRate;
      sim.emit({ type, title: type, description: '', importance: 3 });
      sim.step(10);
      expect(sim.strange.pulseRate, type).toBeGreaterThan(before + 15);
    }
  });
});

describe('section 9 in a save', () => {
  it('comes back as it was and runs on the same', () => {
    const sim = living();
    sim.strange.flip(sim);
    sim.meteor(land(sim, 30), 0.9, false);
    sim.step(15000);
    const back = new Simulation(SEED, N, grid);
    loadSimulation(back, saveSimulation(sim));
    expect(back.strange.layers).toEqual(sim.strange.layers);
    expect(back.strange.flipEnd).toBe(sim.strange.flipEnd);
    expect(Array.from(back.strange.germ)).toEqual(Array.from(sim.strange.germ));
    for (let k = 0; k < 20; k++) { sim.step(15000); back.step(15000); }
    expect(back.events.events.length).toBe(sim.events.events.length);
    expect(back.digest()).toBe(sim.digest());
    expect(back.strange.poleSign).toBe(sim.strange.poleSign);
  });
});
