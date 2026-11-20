// Cities (expansion section 2): the plan of a town, and what is built on it.
import { describe, expect, it } from 'vitest';
import { MAX_PLOTS, planCity, planShape, type CitySite } from '../src/render/gfx/cityplan';
import { buildingFor, townPlots } from '../src/render/gfx/buildings';

const crossroads: CitySite = { seed: 11, roads: [0.3, 2.2, 3.9, 5.2], coast: 0, shore: Infinity, uphill: 1.2, slope: 0.05, temple: false, port: false, capital: true, walls: [] };
const harbour: CitySite = { seed: 23, roads: [2.6, 4.4], coast: 0.4, shore: 5, uphill: 3.3, slope: 0.5, temple: true, port: true, capital: false, walls: [30, 140] };
const valley: CitySite = { seed: 37, roads: [1.0, 4.1], coast: 0, shore: Infinity, uphill: 2.6, slope: 0.9, temple: true, port: false, capital: false, walls: [60] };

describe('living city growth (E11)', () => {
  it('a town is laid out the same way every time, and grows by adding to what is there', () => {
    const a = planCity(harbour), b = planCity(harbour);
    expect(JSON.stringify(a.plots)).toBe(JSON.stringify(b.plots));
    expect(a.streets.length).toBe(b.streets.length);
    expect(a.plots.length).toBeGreaterThan(80);
    expect(a.plots.length).toBeLessThanOrEqual(MAX_PLOTS);
    // growth is the same plan cut at more plots: nothing that stands is ever moved
    const small = planShape(a, 20), large = planShape(a, 120);
    expect(large.plots).toBeGreaterThan(small.plots);
    // it begins at the middle and along its roads
    const first = a.plots.slice(0, 15), last = a.plots.slice(-15);
    const mean = (list: typeof first) => list.reduce((s, p) => s + Math.hypot(p.x, p.y), 0) / list.length;
    expect(mean(first)).toBeLessThan(mean(last) * 0.6);
    expect(first.filter((p) => a.streets[p.street]!.rank === 0).length).toBeGreaterThan(8);
    // a street exists by the time its first building does, and the roads out of town from the start
    a.plots.forEach((p, i) => expect(a.streets[p.street]!.order).toBeLessThanOrEqual(i));
    for (const s of a.streets) if (s.rank === 0) expect(s.order).toBe(0);
    // no two buildings on one spot, none on the market square, none on a roadway
    for (let i = 0; i < a.plots.length; i++) {
      const p = a.plots[i]!;
      expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(1.25);
      for (let j = 0; j < i; j++) { const q = a.plots[j]!; expect((p.x - q.x) ** 2 + (p.y - q.y) ** 2).toBeGreaterThan(0.9); }
    }
  });

  it('two towns of one world look clearly different because of their land and their history', () => {
    const A = planCity(crossroads), B = planCity(harbour), C = planCity(valley);
    const a = planShape(A), b = planShape(B), c = planShape(C);
    // the harbour town has docks and stands back from the water; the others have neither
    expect(b.share.docks).toBeGreaterThan(0.01);
    expect(a.share.docks).toBe(0);
    expect(c.share.docks).toBe(0);
    const seaward = (p: { x: number; y: number }) => p.x * Math.cos(harbour.coast) + p.y * Math.sin(harbour.coast);
    for (const p of B.plots) expect(seaward(p)).toBeLessThan(harbour.shore + 1.5);
    expect(b.lean[0] * Math.cos(harbour.coast) + b.lean[1] * Math.sin(harbour.coast)).toBeLessThan(-3);
    expect(Math.hypot(a.lean[0], a.lean[1])).toBeLessThan(3);
    // the town that was never attacked has no wall; the one attacked twice has two, the second well outside the first
    expect(a.walls).toBe(0);
    expect(b.walls).toBe(2);
    expect(c.walls).toBe(1);
    const size = (w: { points: [number, number][] }) => Math.max(...w.points.filter((p) => !Number.isNaN(p[0])).map((p) => Math.hypot(p[0], p[1])));
    expect(size(B.walls[1]!)).toBeGreaterThan(size(B.walls[0]!) + 2);
    // a wall stops at the water, and has a gate on each road that reaches it
    expect(B.walls[0]!.points.some((p) => Number.isNaN(p[0]))).toBe(true);
    expect(A.walls.length).toBe(0);
    expect(B.walls[0]!.gates.length).toBeGreaterThan(0);
    // a wall goes up when the town reaches the size it had when it was built, and the town then sprawls past it
    expect(planShape(B, 20).walls).toBe(0);
    expect(planShape(B, 60).walls).toBe(1);
    const outside = B.plots.slice(140).filter((p) => Math.hypot(p.x, p.y) > size(B.walls[0]!)).length;
    expect(outside).toBeGreaterThan(5);
    // temples: where the site has one there is a place for it and a quarter round it
    expect(A.temple).toBeNull();
    expect(B.temple).not.toBeNull();
    expect(b.share.temple + c.share.temple).toBeGreaterThan(0);
    // the capital at a crossroads has more roads out than the valley town with one road through
    expect(a.roads).toBeGreaterThanOrEqual(4);
    expect(c.roads).toBeLessThan(a.roads);
    // the steep valley strings its town out; the plain lets it spread round
    expect(c.stretch).toBeGreaterThan(a.stretch + 0.15);
    // every town has its market at the middle, homes as its bulk and a quarter for its workshops
    for (const s of [a, b, c]) { expect(s.share.market).toBeGreaterThan(0.01); expect(s.share.homes).toBeGreaterThan(0.4); expect(s.share.workshops).toBeGreaterThan(0.05); }
  });

  it('what stands on a plot follows its quarter, its place in the town and the age', () => {
    // a young town is huts whatever the quarter
    for (const d of ['market', 'temple', 'homes', 'workshops', 'docks'] as const) for (const r of [0.1, 0.5, 0.9]) expect(['hut', 'house']).toContain(buildingFor(d, 0.5, 0.2, r));
    // halls gather at the market and the docks; homes are houses
    expect(buildingFor('market', 0.9, 0.5, 0.2)).toBe('hall');
    expect(buildingFor('docks', 0.3, 0.5, 0.2)).toBe('hall');
    expect(buildingFor('homes', 0.5, 0.5, 0.5)).toBe('house');
    // towers and spires belong to a late age and the middle of town
    expect(buildingFor('market', 0.9, 0.95, 0.1)).toBe('spire');
    expect(buildingFor('homes', 0.1, 0.95, 0.1)).toBe('house');
    expect(buildingFor('homes', 0.8, 0.95, 0.1)).toBe('tower');
    // a town grows with its people and its knowledge, up to the size of the plan
    expect(townPlots(1, 0.25)).toBeLessThan(townPlots(40, 0.5));
    expect(townPlots(40, 0.5)).toBeLessThan(townPlots(4000, 1.1));
    expect(townPlots(1e7, 1.2)).toBeLessThanOrEqual(MAX_PLOTS);
  });
});
