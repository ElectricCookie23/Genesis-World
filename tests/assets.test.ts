// The asset pass: a made model becomes a plant of the game's own kind.
import { describe, expect, it } from 'vitest';
import { PART, buildPlant, plantFromModel } from '../src/render/gfx/plantmesh';
import type { Model } from '../src/render/gfx/models';
import { existsSync, readFileSync } from 'node:fs';
import { PLANT_MODELS, PROP_MODELS } from '../src/render/gfx/assetroles';
import { PROPS, propGeometry, type Prop } from '../src/render/gfx/props';

/** A stand-in tree: a brown post 1 wide and 4 tall under a green block from 3 to 9, twice as tall as the game wants. */
function tree(): Model {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: [number, number, number]) => {
    const b = pos.length / 3;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) { pos.push(x, y, z); nrm.push(0, 1, 0); col.push(...c); }
    for (const f of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) idx.push(b + f[0]!, b + f[1]!, b + f[2]!, b + f[0]!, b + f[2]!, b + f[3]!);
  };
  box(9.5, 0, -0.5, 10.5, 4, 0.5, [0.35, 0.2, 0.1]);
  box(7, 3, -3, 13, 9, 3, [0.15, 0.5, 0.12]);
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), idx: new Uint32Array(idx), min: [7, 0, -3], max: [13, 9, 3], triangles: idx.length / 3 };
}

describe('the asset pass', () => {
  it('stands a model on the ground at the height asked, centred, in the plant format', () => {
    const g = plantFromModel(tree(), 'broadleaf', 1.2);
    const p = g.getAttribute('position');
    let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i)); }
    expect(minY).toBeCloseTo(0, 5);
    expect(maxY).toBeCloseTo(1.2, 5);
    expect(minX).toBeCloseTo(-maxX, 5); // it was 10 off to one side
    // the same attributes the generated plants carry, so the same shader and the same far-plant pictures serve both
    const own = buildPlant('broadleaf');
    for (const name of ['position', 'normal', 'color', 'card', 'wind']) expect(g.getAttribute(name), name).toBeDefined();
    expect(g.getAttribute('card').itemSize).toBe(own.getAttribute('card').itemSize);
    expect(g.getIndex()!.count).toBe(tree().idx.length);
  });

  it('keeps the wood its own colour and gives the foliage up to the species', () => {
    const g = plantFromModel(tree(), 'broadleaf', 1.2);
    const card = g.getAttribute('card'), col = g.getAttribute('color'), wind = g.getAttribute('wind'), p = g.getAttribute('position');
    let wood = 0, mass = 0;
    for (let i = 0; i < card.count; i++) {
      const part = card.getZ(i);
      if (part === PART.bark) { wood++; expect(col.getX(i)).toBeCloseTo(0.35, 5); expect(col.getY(i)).toBeCloseTo(0.2, 5); }
      else { mass++; expect(part).toBe(PART.mass); expect(col.getX(i)).toBeCloseTo(col.getY(i), 5); expect(col.getX(i)).toBeGreaterThan(0.6); expect(col.getX(i)).toBeLessThan(1.4); }
      // open to the sky between 0 and 1, and the top sways more than the foot
      expect(card.getW(i)).toBeGreaterThan(0.2); expect(card.getW(i)).toBeLessThanOrEqual(1);
      expect(wind.getX(i)).toBeCloseTo(Math.pow(p.getY(i) / 1.2, 2) * 0.6, 4);
    }
    expect(wood).toBe(8);
    expect(mass).toBe(8);
  });

  it('makes a mushroom of a cap and a stem, with no wood', () => {
    const m = tree();
    // a pale stem and a red cap
    for (let i = 0; i < 8; i++) { m.col[i * 3] = 0.85; m.col[i * 3 + 1] = 0.82; m.col[i * 3 + 2] = 0.75; }
    for (let i = 8; i < 16; i++) { m.col[i * 3] = 0.7; m.col[i * 3 + 1] = 0.1; m.col[i * 3 + 2] = 0.08; }
    const card = plantFromModel(m, 'mushroom', 0.5).getAttribute('card');
    const parts = new Set<number>();
    for (let i = 0; i < card.count; i++) parts.add(card.getZ(i));
    expect(parts.has(PART.bark)).toBe(false);
    expect(parts.has(PART.cap)).toBe(true);
    expect(parts.has(PART.flesh)).toBe(true);
  });

  it('names only files that are there, and none of what the owner ruled out', () => {
    const listed = JSON.parse(readFileSync('public/assets/MANIFEST.json', 'utf8')) as { files?: { path: string }[] } | { path: string }[];
    const paths = new Set((Array.isArray(listed) ? listed : listed.files ?? []).map((f) => f.path));
    const named = [...Object.values(PLANT_MODELS).flat().map((m) => m.file), ...Object.values(PROP_MODELS).flat()];
    expect(named.length).toBeGreaterThan(30);
    for (const file of named) {
      expect(paths.has(file), file + ' is in the manifest').toBe(true);
      expect(existsSync('public/assets/' + file), file + ' is on disk').toBe(true);
      // nothing that looks like a person, nothing religious, no statue of an Earth animal
      expect(/skull|skeleton|ribcage|coffin|grave|statue|temple|shrine|church|archer|character/i.test(file), file).toBe(false);
    }
    // every kind of prop has a model named for it, and every listed file exists
    for (const kind of Object.keys(PROPS)) expect(PROP_MODELS[kind as Prop]?.length, kind).toBeGreaterThan(0);
    for (const file of paths) expect(existsSync('public/assets/' + file), file).toBe(true);
  });

  it('makes a prop of a model: longest side one unit, standing on its base, colours as painted', () => {
    const g = propGeometry(tree(), 'rockA');
    const p = g.getAttribute('position'), c = g.getAttribute('color');
    let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i)); }
    expect(minY).toBeCloseTo(0, 5);
    expect(maxY).toBeCloseTo(1, 5); // the stand-in is 9 tall and 6 wide
    expect(minX).toBeCloseTo(-maxX, 5);
    expect(c.getX(0)).toBeCloseTo(0.35, 5);
    // a boat sits into the water; only the wood of a fire glows
    const boat = propGeometry(tree(), 'rowboat').getAttribute('position');
    let low = 1e9;
    for (let i = 0; i < boat.count; i++) low = Math.min(low, boat.getY(i));
    expect(low).toBeLessThan(-0.1);
    const glow = propGeometry(tree(), 'fire').getAttribute('glow');
    expect(glow.getX(0)).toBe(1);
    expect(propGeometry(tree(), 'tent').getAttribute('glow').getX(0)).toBe(0);
  });
});
