// Cities (expansion section 2): the plan of a town, and what is built on it.
import { describe, expect, it } from 'vitest';
import { MAX_PLOTS, planCity, planShape, type CitySite } from '../src/render/gfx/cityplan';
import { buildingFor, townPlots } from '../src/render/gfx/buildings';

const crossroads: CitySite = { seed: 11, roads: [0.3, 2.2, 3.9, 5.2], coast: 0, shore: Infinity, uphill: 1.2, slope: 0.05, school: false, port: false, capital: true, walls: [] };
const harbour: CitySite = { seed: 23, roads: [2.6, 4.4], coast: 0.4, shore: 5, uphill: 3.3, slope: 0.5, school: true, port: true, capital: false, walls: [30, 140] };
const valley: CitySite = { seed: 37, roads: [1.0, 4.1], coast: 0, shore: Infinity, uphill: 2.6, slope: 0.9, school: true, port: false, capital: false, walls: [60] };

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
    // schools: where the site has one there is a place for it and a quarter round it
    expect(A.school).toBeNull();
    expect(B.school).not.toBeNull();
    expect(b.share.school + c.share.school).toBeGreaterThan(0);
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
    for (const d of ['market', 'school', 'homes', 'workshops', 'docks'] as const) for (const r of [0.1, 0.5, 0.9]) expect(['hut', 'house']).toContain(buildingFor(d, 0.5, 0.2, r));
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

import { CREW_YEARS, STAGES, buildingSites, stageOf, watchable } from '../src/render/gfx/cityplan';
import { BUILDINGS, HEIGHT, buildBuilding } from '../src/render/gfx/buildings';

describe('watch it being built (E12)', () => {
  it('a building goes up from foundation to details, and the same date always shows the same work', () => {
    const central = (i: number) => 1 - i / 200;
    // one job of the house-building crew, watched a few days at a time (at 1x a day is a second)
    const seed = 4242, plots = 60;
    let year = 1000;
    const start = buildingSites(seed, plots, year, central)[0]!;
    // go to the beginning of its next job
    while (buildingSites(seed, plots, year, central)[0]!.plot === start.plot) year += 0.001;
    const job = buildingSites(seed, plots, year, central)[0]!;
    expect(job.progress).toBeLessThan(0.02);
    const seen: string[] = [];
    let last = -1, steps = 0;
    const step = CREW_YEARS[0]! / 40;
    for (;; year += step, steps++) {
      const now = buildingSites(seed, plots, year, central)[0]!;
      if (now.plot !== job.plot) break;
      expect(now.progress).toBeGreaterThan(last);
      last = now.progress;
      const stage = stageOf(now.progress);
      if (seen[seen.length - 1] !== stage) seen.push(stage);
      expect(steps).toBeLessThan(200);
    }
    // every stage in order, over the crew's span of years, and then the crew moves on
    expect(seen).toEqual([...STAGES]);
    expect(last).toBeGreaterThan(0.95);
    expect(steps * step).toBeGreaterThan(CREW_YEARS[0]! * 0.9);
    expect(steps * step).toBeLessThan(CREW_YEARS[0]! * 1.1);
    expect(JSON.stringify(buildingSites(seed, plots, 1234.5, central))).toBe(JSON.stringify(buildingSites(seed, plots, 1234.5, central)));
    // at a day a second every job can be watched; at a year a second only the long ones
    const all = buildingSites(99, 300, 50, central);
    expect(all.filter((j) => watchable(j, 1 / 365)).length).toBe(3);
    expect(all.filter((j) => watchable(j, 1)).map((j) => j.crew)).toEqual([2]);
    expect(all.filter((j) => watchable(j, 25)).length).toBe(0);
    expect(JSON.stringify(buildingSites(seed + 1, plots, 1234.5, central))).not.toBe(JSON.stringify(buildingSites(seed, plots, 1234.5, central)));
  });

  it('a larger town has more crews, on different plots, and great works go up near the middle', () => {
    const central = (i: number) => 1 - i / 300;
    expect(buildingSites(7, 1, 500).length).toBe(0);
    expect(buildingSites(7, 10, 500).length).toBe(1);
    expect(buildingSites(7, 40, 500).length).toBe(2);
    const plotsSeen = new Set<number>();
    let middle = 0, jobs = 0;
    for (let y = 0; y < 120; y += 0.37) {
      const sites = buildingSites(99, 300, y, central);
      expect(sites.length).toBe(3);
      expect(new Set(sites.map((s) => s.plot)).size).toBe(3);
      for (const s of sites) { expect(s.plot).toBeGreaterThanOrEqual(0); expect(s.plot).toBeLessThan(300); expect(s.progress).toBeGreaterThanOrEqual(0); expect(s.progress).toBeLessThan(1); expect(s.years).toBe(CREW_YEARS[s.crew]); plotsSeen.add(s.plot); }
      const great = sites.find((s) => s.crew === 2)!;
      jobs++; if (central(great.plot) >= 0.5) middle++;
    }
    // the work moves about the town, and much of it is at the growing edge
    expect(plotsSeen.size).toBeGreaterThan(60);
    expect([...plotsSeen].filter((p) => p >= 270).length).toBeGreaterThanOrEqual(25);
    expect(middle / jobs).toBeGreaterThan(0.9);
  });

  it('there is scaffolding, a crane for each age and builders to draw, and a height for everything that rises', () => {
    for (const kind of ['scaffold', 'hoist', 'crane', 'cart'] as const) {
      expect(BUILDINGS).toContain(kind);
      const g = buildBuilding(kind);
      expect(g.getAttribute('position').count).toBeGreaterThan(20);
    }
    // the tower crane stands taller than the timber one, and both taller than a house
    const top = (kind: (typeof BUILDINGS)[number]) => { const g = buildBuilding(kind); g.computeBoundingBox(); return g.boundingBox!.max.y; };
    expect(top('crane')).toBeGreaterThan(top('hoist'));
    expect(top('hoist')).toBeGreaterThan(top('house'));
    // the heights the scaffolding reaches are the heights of the models
    for (const kind of ['hut', 'house', 'hall', 'tower', 'dome', 'spire'] as const) expect(Math.abs(top(kind) - HEIGHT[kind]!)).toBeLessThan(0.12);
  });
});

import { architectureDistance, architectureOf, describeArchitecture, materialOf } from '../src/render/gfx/architecture';
import { G, GENE_COUNT } from '../src/sim/genetics';

/** A genome with every gene at the middle, then some set by name. */
function genome(set: Partial<Record<keyof typeof GENES, number>>): Float32Array {
  const g = new Float32Array(GENE_COUNT).fill(0.5);
  for (const [k, v] of Object.entries(set)) g[GENES[k as keyof typeof GENES]] = v as number;
  return g;
}
const GENES = { Neck: G.Neck, LimbType: G.LimbType, LimbPairs: G.LimbPairs, LimbLength: G.LimbLength, BodyRatio: G.BodyRatio, Burrow: G.Burrow, Water: G.Water, Ornament: G.Ornament, Horn: G.Horn, EyeCount: G.EyeCount, Sociality: G.Sociality, Size: G.Size, Insulation: G.Insulation } as const;

describe('architecture from biology (E13)', () => {
  const walker = architectureOf(genome({ Neck: 0.9, LimbType: 0.6, LimbLength: 0.9, BodyRatio: 0.1, Burrow: 0.05, Water: 0.05 }));
  const digger = architectureOf(genome({ Neck: 0.1, LimbType: 0.6, LimbLength: 0.2, BodyRatio: 0.8, Burrow: 0.95, Water: 0.1 }));
  const flier = architectureOf(genome({ Neck: 0.4, LimbType: 0.95, LimbLength: 0.7, BodyRatio: 0.3, Burrow: 0.05, Water: 0.05 }));
  const swimmer = architectureOf(genome({ Neck: 0.2, LimbType: 0.35, LimbLength: 0.4, BodyRatio: 0.7, Burrow: 0.1, Water: 0.95 }));

  it('a people builds like the body that builds', () => {
    // tall builders build tall and narrow
    expect(walker.rise).toBeGreaterThan(1.4);
    expect(walker.girth).toBeLessThan(0.95);
    expect(walker.lift).toBe(0);
    // burrowers dig down: low, broad, round, the floor under the ground
    expect(digger.rise).toBeLessThan(0.8);
    expect(digger.girth).toBeGreaterThan(walker.girth + 0.25);
    expect(digger.lift).toBeLessThan(-0.3);
    expect(digger.round).toBeGreaterThan(0.6);
    // fliers build high perches on posts
    expect(flier.lift).toBeGreaterThan(0.9);
    expect(flier.rise).toBeGreaterThan(1);
    // a people of the water builds out into the shallows; nobody else does
    expect(swimmer.wade).toBeGreaterThan(0.6);
    expect(walker.wade + digger.wade + flier.wade).toBe(0);
    // each is unlike every other, and each is described differently
    const all = [walker, digger, flier, swimmer];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(architectureDistance(all[i]!, all[j]!)).toBeGreaterThan(0.45);
    expect(new Set(all.map((a) => describeArchitecture(a, 'timber'))).size).toBe(4);
    expect(describeArchitecture(flier, 'timber')).toMatch(/on high posts, with no stairs/);
    expect(describeArchitecture(digger, 'stone')).toMatch(/sunk into the ground/);
    expect(describeArchitecture(swimmer, 'coral and shell')).toMatch(/out into the shallows/);
    expect(describeArchitecture(walker, 'mud brick')).toMatch(/tall and narrow, in mud brick\. Their doorways are tall/);
    // the same body always builds the same way, and every number stays in its range
    expect(JSON.stringify(architectureOf(genome({ Neck: 0.9 })))).toBe(JSON.stringify(architectureOf(genome({ Neck: 0.9 }))));
    const rng = new Float32Array(GENE_COUNT);
    for (let k = 0; k < 200; k++) {
      for (let i = 0; i < GENE_COUNT; i++) rng[i] = ((k * 7919 + i * 104729) % 1000) / 1000;
      const a = architectureOf(rng);
      expect(a.rise).toBeGreaterThanOrEqual(0.55); expect(a.rise).toBeLessThanOrEqual(1.9);
      expect(a.girth).toBeGreaterThanOrEqual(0.7); expect(a.girth).toBeLessThanOrEqual(1.5);
      expect(a.pitch).toBeGreaterThanOrEqual(0.6); expect(a.pitch).toBeLessThanOrEqual(2.2);
      expect(a.lift).toBeGreaterThanOrEqual(-0.5); expect(a.lift).toBeLessThanOrEqual(1.4);
      for (const v of [a.wade, a.round, a.ornament]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });

  it('what they build with comes from the land', () => {
    const place = { temperature: 15, moisture: 0.5, canopy: 0.1, height: 0.4, coast: false, river: 0 };
    expect(materialOf({ ...place, canopy: 0.7 }).name).toBe('timber');
    expect(materialOf({ ...place, moisture: 0.1 }).name).toBe('mud brick');
    expect(materialOf({ ...place, height: 2.2, moisture: 0.4 }).name).toBe('stone');
    expect(materialOf({ ...place, moisture: 0.9, canopy: 0.2 }).name).toBe('reed');
    expect(materialOf({ ...place, temperature: -9 }).name).toBe('packed snow');
    expect(materialOf({ ...place, coast: true, temperature: 24 }, 0.9).name).toBe('coral and shell');
    expect(materialOf({ ...place, coast: true, temperature: 24 }, 0).name).not.toBe('coral and shell');
    // different materials are different colours
    const colours = [materialOf({ ...place, canopy: 0.7 }), materialOf({ ...place, moisture: 0.1 }), materialOf({ ...place, temperature: -9 })].map((m) => m.wall.join(','));
    expect(new Set(colours).size).toBe(3);
  });

  it('builders who dig build domes where others raise towers, and fliers build towers to live in', () => {
    let towers = 0, domes = 0, perches = 0, plainTowers = 0;
    for (let k = 0; k < 400; k++) {
      const r = (k * 37 % 400) / 400, central = (k * 91 % 400) / 400;
      const d = (['market', 'school', 'homes', 'workshops', 'docks'] as const)[k % 5]!;
      const mine = buildingFor(d, central, 0.7, r, digger), plain = buildingFor(d, central, 0.7, r), theirs = buildingFor(d, central, 0.7, r, flier);
      if (mine === 'tower' || mine === 'spire') towers++;
      if (mine === 'dome') domes++;
      if (plain === 'tower') plainTowers++;
      if (theirs === 'tower') perches++;
    }
    expect(towers).toBe(0);
    expect(domes).toBeGreaterThan(20);
    expect(perches).toBeGreaterThan(plainTowers + 20);
  });
});

import { FASHION_YEARS, OLDEST_STANDING, borrowFashion, builtTech, builtYear, fashionDistance, fashionOf } from '../src/render/gfx/architecture';
import { turnHue } from '../src/render/gfx/buildings';

describe('architectural styles over time (E14)', () => {
  it('a culture\'s fashion drifts with the centuries, and no two cultures keep step', () => {
    const a = 7919 * 3 + 17, b = 7919 * 4 + 17;
    // the same culture in the same year is always the same; a generation changes little, a few centuries a lot
    expect(JSON.stringify(fashionOf(a, 2500))).toBe(JSON.stringify(fashionOf(a, 2500)));
    let near = 0, far = 0, apart = 0;
    for (let y = 0; y < 20000; y += 173) {
      near += fashionDistance(fashionOf(a, y), fashionOf(a, y + 25));
      far += fashionDistance(fashionOf(a, y), fashionOf(a, y + FASHION_YEARS * 2));
      apart += fashionDistance(fashionOf(a, y), fashionOf(b, y));
      const f = fashionOf(a, y);
      expect(f.pitch).toBeGreaterThanOrEqual(0.65); expect(f.pitch).toBeLessThanOrEqual(1.55);
      expect(f.windows).toBeGreaterThanOrEqual(0.7); expect(f.windows).toBeLessThanOrEqual(1.5);
      expect(Math.abs(f.ornament)).toBeLessThanOrEqual(0.35);
      expect(Math.abs(f.hue)).toBeLessThanOrEqual(0.12);
    }
    const n = Math.ceil(20000 / 173);
    expect(near / n).toBeLessThan(0.08);
    expect(far / n).toBeGreaterThan(0.3);
    expect(far / n).toBeGreaterThan((near / n) * 5);
    expect(apart / n).toBeGreaterThan(0.3);
    // borrowing brings a culture's fashion toward that of the one it trades with
    const own = fashionOf(a, 900), other = fashionOf(b, 900);
    const mixed = borrowFashion(own, other, 0.5);
    expect(fashionDistance(mixed, other)).toBeLessThan(fashionDistance(own, other) * 0.6);
    expect(fashionDistance(borrowFashion(own, other, 0), own)).toBe(0);
  });

  it('a city\'s centre and edge are of different periods', () => {
    const founded = 1000, now = 4000, plots = 240, culture = 7919 * 2 + 17;
    // the first plots are old, the last are new, in order
    expect(builtYear(0, plots, founded, now)).toBe(now - OLDEST_STANDING);
    expect(builtYear(plots - 1, plots, founded, now)).toBe(now);
    for (let k = 1; k < plots; k++) expect(builtYear(k, plots, founded, now)).toBeGreaterThan(builtYear(k - 1, plots, founded, now));
    // a young town has no buildings older than itself
    expect(builtYear(0, plots, 3900, now)).toBe(3900);
    // and what a plot is made of follows what was known when it was built
    expect(builtTech(0, plots, 1.0)).toBeCloseTo(0.22);
    expect(builtTech(plots - 1, plots, 1.0)).toBeCloseTo(1.0);
    expect(builtTech(plots / 2, plots, 1.0)).toBeGreaterThan(0.5);
    // the look of the middle and of the edge differ as two periods do, in most towns
    let different = 0;
    for (let town = 0; town < 40; town++) {
      const c = culture + town * 7919, t0 = 500 + town * 613;
      const centre = fashionOf(c, builtYear(4, plots, t0, t0 + 2400)), edge = fashionOf(c, builtYear(plots - 4, plots, t0, t0 + 2400));
      if (fashionDistance(centre, edge) > 0.25) different++;
      // neighbours on one street were built in the same years and look alike
      expect(fashionDistance(fashionOf(c, builtYear(100, plots, t0, t0 + 2400)), fashionOf(c, builtYear(102, plots, t0, t0 + 2400)))).toBeLessThan(0.08);
    }
    expect(different).toBeGreaterThanOrEqual(28);
  });

  it('roof colours turn with the fashion without leaving the range of colour', () => {
    const base = [0.2, 0.7, 0.9];
    const same = turnHue(base, 0, 1);
    for (let k = 0; k < 3; k++) expect(same[k]).toBeCloseTo(base[k]!, 5);
    const turned = turnHue(base, 0.12, 1);
    expect(Math.abs(turned[0]! - base[0]!) + Math.abs(turned[1]! - base[1]!) + Math.abs(turned[2]! - base[2]!)).toBeGreaterThan(0.15);
    // a turn keeps the brightness, a tone changes it
    expect(turned[0]! + turned[1]! + turned[2]!).toBeCloseTo(base[0]! + base[1]! + base[2]!, 1);
    expect(turnHue(base, 0, 0.75)[2]).toBeCloseTo(0.675, 5);
    for (const v of turnHue([1, 1, 0.9], -0.12, 1.2)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});
