// The models must be drawable on WebGPU, which binds at most 8 vertex buffers for one draw.
// Before this check existed, plants needed 10 and animals 14, so neither was drawn there at all.
import { describe, expect, it } from 'vitest';
import { GENE_COUNT } from '../src/sim/genetics';
import { addCreatureInstanceData, buildCreatureModel } from '../src/render/gfx/creaturemesh';
import { MAX_VERTEX_BUFFERS, vertexBufferCount } from '../src/render/gfx/packed';
import { FORMS, addPlantInstanceData, buildPlant } from '../src/render/gfx/plantmesh';

/** WebGPU's default limit on vertex attributes for one draw (WebGL2 guarantees the same number). */
const MAX_VERTEX_ATTRIBUTES = 16;

describe('model vertex buffers', () => {
  it('every plant form fits with its per-plant data', () => {
    for (const form of FORMS) {
      const g = buildPlant(form);
      const inst = addPlantInstanceData(g, 4);
      expect(vertexBufferCount(g), form).toBeLessThanOrEqual(MAX_VERTEX_BUFFERS);
      expect(Object.keys(g.attributes).length, form).toBeLessThanOrEqual(MAX_VERTEX_ATTRIBUTES);
      // the packed attributes still read and write like separate ones
      inst.iQuat.setXYZW(3, 1, 2, 3, 4); inst.iTint2.setXYZ(3, 5, 6, 7);
      expect([inst.iQuat.getX(3), inst.iQuat.getW(3), inst.iTint2.getZ(3), inst.iDir.getX(3)]).toEqual([1, 4, 7, 0]);
      expect(g.attributes.card!.count).toBe(g.attributes.position!.count);
    }
  });

  it('animals of every shape fit with their per-animal data', () => {
    for (let k = 0; k < 24; k++) {
      const genes = new Float32Array(GENE_COUNT);
      for (let i = 0; i < GENE_COUNT; i++) genes[i] = (Math.sin(k * 12.9898 + i * 78.233) * 43758.5453) % 1 * 0.5 + 0.5;
      const model = buildCreatureModel(genes);
      const inst = addCreatureInstanceData(model, 4);
      const g = model.geometry;
      expect(vertexBufferCount(g)).toBeLessThanOrEqual(MAX_VERTEX_BUFFERS);
      expect(Object.keys(g.attributes).length).toBeLessThanOrEqual(MAX_VERTEX_ATTRIBUTES);
      // the species' skin settings are repeated for every animal
      const a = g.attributes.iSkinA!;
      expect([a.getX(0), a.getY(0), a.getZ(0), a.getW(0)]).toEqual(Array.from(new Float32Array(model.skinA)));
      expect([a.getX(3), a.getW(3)]).toEqual([a.getX(0), a.getW(0)]);
      inst.iPos.setXYZ(2, 1, 2, 3);
      expect([inst.iPos.getY(2), a.getX(2)]).toEqual([2, a.getX(0)]);
      expect(g.attributes.rig!.count).toBe(g.attributes.position!.count);
    }
  });
});
