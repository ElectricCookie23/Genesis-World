// The counterfactual engine and the butterfly tracker (expansion E55, E56).
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { saveSimulation, loadSimulation } from '../src/sim/snapshot';
import { Counterfactual, changeFor, differences, outcome, replayable, type Change } from '../src/sim/whatif';

const N = 15;
const sim = new Simulation('amber-reef-101', N);
while (sim.simYear < 30e6) sim.step(15000);
const save = saveSimulation(sim);
const land = (() => { for (let i = 0; i < sim.grid.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel + 0.2) return i; return 0; })();
const run = (change: Change, years: number) => { const cf = new Counterfactual(save, change, save.simYear + years); let guard = 0; while (!cf.done && guard++ < 5000) cf.advance(500); return cf; };

describe('E55 the counterfactual engine', () => {
  it('rests on this: two copies started from one save and stepped alike stay alike', () => {
    expect(sim.creatures.livingSpecies).toBeGreaterThan(3);
    const a = new Simulation(save.seed, save.gridN), b = new Simulation(save.seed, save.gridN);
    loadSimulation(a, save); loadSimulation(b, save);
    for (let i = 0; i < 120; i++) { a.step(15000); b.step(15000); }
    expect(outcome(a)).toEqual(outcome(b));
    expect(differences(outcome(a), outcome(b))).toEqual(['By every measure kept here the two worlds are the same.']);
    expect(Array.from(a.world.biome)).toEqual(Array.from(b.world.biome));
  });

  it('knows what can be taken away, and how to make it happen again', () => {
    const copy = new Simulation(save.seed, save.gridN);
    loadSimulation(copy, save);
    const strike = copy.meteor(land, 0.7, false);
    expect(replayable(strike)).toBe(true);
    const c = changeFor(strike);
    expect(c).toMatchObject({ kind: 'event', eventId: strike.id, type: 'impact', cell: land, year: copy.simYear });
    if (c.kind === 'event') expect(c.size).toBeCloseTo(0.7);
    copy.intervene('heat', land);
    const heat = copy.events.events[copy.interventions[copy.interventions.length - 1]!]!;
    expect(replayable(heat)).toBe(true);
    expect(changeFor(heat)).toMatchObject({ tool: 'heat', cell: land });
    // a speciation cannot be staged, and neither can a designed animal (its genes are not in the record)
    expect(replayable(copy.events.events.find((e) => e.type === 'speciation')!)).toBe(false);
    expect(replayable({ ...heat, type: 'tool-species' })).toBe(false);
  });

  it('undoing a meteor gives a visibly different world, and says how', () => {
    const copy = new Simulation(save.seed, save.gridN);
    loadSimulation(copy, save);
    copy.step(15000);
    const strike = copy.meteor(land, 0.9, false);
    const cf = run(changeFor(strike), 6e6);
    const st = cf.state();
    expect(st.done).toBe(true);
    expect(st.progress).toBe(1);
    expect(cf.applied).toBe(true);
    expect(st.from).toBe(save.simYear);
    expect(st.with.year).toBe(st.without.year);
    // the copy in which it fell has the crater's event; the other has not
    expect(cf.a.events.events.some((e) => e.type === 'impact' && e.cellId === land)).toBe(true);
    expect(cf.b.events.events.some((e) => e.type === 'impact' && e.cellId === land && e.simYear > save.simYear)).toBe(false);
    expect(st.differences.length).toBeGreaterThan(1);
    expect(st.differences[0]).not.toContain('the two worlds are the same');
    expect(st.with.living).not.toEqual(st.without.living);
    // the difference is on the map from the first checkpoint on
    expect(st.spread.length).toBeGreaterThan(10);
    expect(st.spread[0]!.share).toBeGreaterThan(0.02);
    for (let i = 1; i < st.spread.length; i++) expect(st.spread[i]!.year).toBeGreaterThanOrEqual(st.spread[i - 1]!.year);
    const maps = cf.maps();
    expect(maps.withMap.length).toBe(sim.grid.count);
    expect(maps.heat.length).toBe(st.spread.length);
    expect(maps.heat[maps.heat.length - 1]!.some((v) => v > 50)).toBe(true);
    let wet = 0; for (const v of maps.withMap) if (v === 255) wet++;
    expect(wet).toBeGreaterThan(sim.grid.count * 0.2);
    expect(wet).toBeLessThan(sim.grid.count);
  });
});

describe('E56 the butterfly tracker', () => {
  it('one small herd spared: the difference starts small and spreads', () => {
    const cf = run({ kind: 'herd', title: 'One small herd is spared', year: save.simYear, cell: land, count: 40 }, 6e6);
    const st = cf.state();
    expect(st.done).toBe(true);
    const first = st.spread[0]!.share, last = st.spread[st.spread.length - 1]!.share;
    // (forty animals more may show nowhere at all at the first look; then it does, and it spreads)
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(0.35);
    expect(st.spread.some((x) => x.share > 0)).toBe(true);
    expect(last).toBeGreaterThan(Math.max(first * 2, 0.05));
    expect(Math.max(...st.spread.map((s) => s.share))).toBeGreaterThan(0.3);
    // nothing but forty animals was changed: the land and sea of the two copies start alike
    const maps = cf.maps();
    let hot = 0; for (const v of maps.heat[0]!) if (v > 10) hot++;
    expect(hot).toBeLessThan(sim.grid.count * 0.35);
    // and the same experiment gives the same answer
    const again = run({ kind: 'herd', title: 'One small herd is spared', year: save.simYear, cell: land, count: 40 }, 6e6);
    expect(again.state().spread).toEqual(st.spread);
  });
});
