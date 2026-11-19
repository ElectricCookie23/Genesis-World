// Small things that mark a place: the bones of a creature that died out there, and the dark mouths
// of caves on steep mountainsides.
import {
  BufferAttribute, BufferGeometry, CylinderGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute, MeshBasicNodeMaterial, Quaternion,
  TorusGeometry, Vector3, type Texture,
} from 'three/webgpu';
import { Copies } from './packed';
import { attribute, cross, dot, float, max, mix, normalGeometry, normalize, positionGeometry, smoothstep, varying, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Grid } from '../../sim/world';
import type { CellSnapshot } from '../../shared/protocol';
import { uSunDir } from '../common';
import { uLook } from './look';
import type { PlanetData } from './planetdata';
import { groundRadiusNode } from './terrain';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** A ribcage lying on the ground: a spine, arched ribs on both sides, and a skull. About one unit long. */
export function buildRibcage(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(new CylinderGeometry(0.03, 0.02, 1.1, 5).rotateZ(Math.PI / 2).translate(0, 0.22, 0));
  for (let i = 0; i < 6; i++) {
    const x = -0.36 + i * 0.13, r = 0.2 * (0.7 + 0.3 * Math.sin((i / 5) * Math.PI));
    // half a ring standing across the spine: the two ribs of one pair
    parts.push(new TorusGeometry(r, 0.016, 4, 9, Math.PI).rotateY(Math.PI / 2).rotateZ(0).translate(x, 0.22 - r * 0.02, 0).rotateX(0));
  }
  parts.push(new IcosahedronGeometry(0.11, 1).scale(1.4, 0.9, 0.9).translate(0.62, 0.2, 0));
  parts.push(new CylinderGeometry(0.02, 0.012, 0.3, 4).rotateZ(1.2).translate(0.5, 0.06, 0.12));
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; }))!;
  g.computeVertexNormals();
  return g;
}

/** A cave mouth: a rough rock arch around a black opening. About one unit wide, opening toward +z. */
function buildCave(): BufferGeometry {
  const arch = new TorusGeometry(0.5, 0.2, 5, 9, Math.PI).translate(0, 0, 0);
  const dark = new CylinderGeometry(0.42, 0.42, 0.06, 9, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0, -0.08);
  const parts = [arch, dark].map((p, k) => {
    const q = p.index ? p.toNonIndexed() : p;
    q.deleteAttribute('uv');
    const n = q.attributes.position!.count;
    const flag = new Float32Array(n).fill(k);
    q.setAttribute('dark', new BufferAttribute(flag, 1));
    return q;
  });
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

/** Cave mouths on the steepest ground near the camera. */
export class Caves {
  readonly mesh: Copies;
  private iDir: InstancedBufferAttribute;
  private iQuat: InstancedBufferAttribute;
  private iData: InstancedBufferAttribute;
  private cells?: CellSnapshot;
  private lastFocus = new Vector3(9, 9, 9);
  private cap: number;

  constructor(private grid: Grid, data: PlanetData, erosionTex: Texture, cap = 48) {
    this.cap = cap;
    const g = buildCave();
    this.iDir = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.iQuat = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.iData = new InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    for (const a of [this.iDir, this.iQuat, this.iData]) a.setUsage(DynamicDrawUsage);
    g.setAttribute('iDir', this.iDir); g.setAttribute('iQuat', this.iQuat); g.setAttribute('iData', this.iData);
    const material = new MeshBasicNodeMaterial();
    const aDir: N = attribute('iDir', 'vec3'), aQuat: N = attribute('iQuat', 'vec4'), aData: N = attribute('iData', 'vec2');
    const rotate = (v: N): N => v.add(cross(aQuat.xyz, cross(aQuat.xyz, v).add(v.mul(aQuat.w))).mul(2));
    const base: N = aDir.mul(groundRadiusNode(data, erosionTex, aDir));
    material.positionNode = base.add(rotate((positionGeometry as any).mul(aData.x)));
    const nW: N = varying(normalize(rotate(normalGeometry)));
    const vDark: N = varying(attribute('dark', 'float'));
    const vUp: N = varying(aDir);
    const day = smoothstep(-0.12, 0.22, dot(vUp, uSunDir));
    const rock: N = mix(vec3(uLook.rockA), vec3(uLook.rockB), 0.5).mul(max(dot(nW, uSunDir), 0).mul(0.8).add(0.25)).mul(vec3(uLook.star)).mul(day.mul(0.95).add(0.04));
    material.colorNode = mix(rock, vec3(0.004, 0.004, 0.006), vDark);
    this.mesh = new Copies(g, material, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    void float;
  }

  setCells(cells: CellSnapshot): void { this.cells = cells; }

  update(focus: Vector3, dist: number): void {
    const cells = this.cells;
    if (!cells || dist > 0.3) { if (this.mesh.count) { this.mesh.count = 0; this.lastFocus.set(9, 9, 9); } return; }
    if (focus.distanceToSquared(this.lastFocus) < 0.0004) return;
    this.lastFocus.copy(focus);
    const { pos, neighbors, ncount, count } = this.grid;
    const { elevation, seaLevel, snow } = cells;
    const q = new Quaternion(), up = new Vector3(), out = new Vector3(), right = new Vector3(), m = new Vector3();
    let n = 0;
    for (let i = 0; i < count && n < this.cap; i++) {
      // one cell in a few, where the land is high and falls away steeply on one side
      if (((i * 2654435761) >>> 0) % 5 !== 0 || elevation[i]! < seaLevel + 0.6 || snow[i]! > 6) continue;
      if (pos[i * 3]! * focus.x + pos[i * 3 + 1]! * focus.y + pos[i * 3 + 2]! * focus.z < 0.985) continue;
      let low = i, drop = 0;
      for (let k = 0; k < ncount[i]!; k++) { const nb = neighbors[i * 6 + k]!; const d = elevation[i]! - elevation[nb]!; if (d > drop) { drop = d; low = nb; } }
      if (drop < 0.55) continue;
      up.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!);
      // the mouth sits part way down the slope and opens downhill
      m.set(pos[low * 3]!, pos[low * 3 + 1]!, pos[low * 3 + 2]!);
      out.copy(m).sub(up); out.addScaledVector(up, -out.dot(up)).normalize();
      m.copy(up).lerp(m, 0.3).normalize();
      right.crossVectors(m, out).normalize();
      // basis: x = right, y = up, z = out
      const b = [right.x, right.y, right.z, m.x, m.y, m.z, out.x, out.y, out.z];
      const tr = b[0]! + b[4]! + b[8]!;
      if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q.set((b[5]! - b[7]!) / s, (b[6]! - b[2]!) / s, (b[1]! - b[3]!) / s, s / 4); }
      else if (b[0]! > b[4]! && b[0]! > b[8]!) { const s = Math.sqrt(1 + b[0]! - b[4]! - b[8]!) * 2; q.set(s / 4, (b[3]! + b[1]!) / s, (b[6]! + b[2]!) / s, (b[5]! - b[7]!) / s); }
      else if (b[4]! > b[8]!) { const s = Math.sqrt(1 + b[4]! - b[0]! - b[8]!) * 2; q.set((b[3]! + b[1]!) / s, s / 4, (b[7]! + b[5]!) / s, (b[6]! - b[2]!) / s); }
      else { const s = Math.sqrt(1 + b[8]! - b[0]! - b[4]!) * 2; q.set((b[6]! + b[2]!) / s, (b[7]! + b[5]!) / s, s / 4, (b[1]! - b[3]!) / s); }
      this.iDir.setXYZ(n, m.x, m.y, m.z);
      this.iQuat.setXYZW(n, q.x, q.y, q.z, q.w);
      this.iData.setXY(n, 0.0011 * (0.7 + 0.6 * (((i * 40503) >>> 0) % 100) / 100), 0);
      n++;
    }
    this.mesh.count = n;
    this.iDir.needsUpdate = this.iQuat.needsUpdate = this.iData.needsUpdate = true;
  }
}
