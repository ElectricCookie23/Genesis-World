// Instanced low-poly plants near the camera. Shape and colour come from plant genes.
import {
  BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute,
  InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3,
} from 'three/webgpu';
import { attribute, float, instanceIndex, instancedBufferAttribute, normalWorld, normalize, positionLocal, positionWorld, sin, vec3 } from 'three/tsl';
import type { Grid } from '../sim/world';
import type { CellSnapshot, PlantInfo } from '../shared/protocol';
import { PG } from '../sim/genetics';
import { EXAG, uTime } from './common';
import { dayAmount, surfaceLight } from './lighting';

/** Merge simple geometries into one non-indexed geometry with vertex colours. */
function merge(parts: { geo: BufferGeometry; color: [number, number, number]; sway: number }[]): BufferGeometry {
  let count = 0;
  const flat = parts.map((p) => ({ ...p, geo: p.geo.index ? p.geo.toNonIndexed() : p.geo }));
  for (const p of flat) count += p.geo.attributes.position!.count;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sway = new Float32Array(count);
  let o = 0;
  for (const p of flat) {
    const a = p.geo.attributes.position!;
    for (let i = 0; i < a.count; i++, o++) {
      pos[o * 3] = a.getX(i); pos[o * 3 + 1] = a.getY(i); pos[o * 3 + 2] = a.getZ(i);
      col[o * 3] = p.color[0]; col[o * 3 + 1] = p.color[1]; col[o * 3 + 2] = p.color[2];
      sway[o] = p.sway * Math.max(0, a.getY(i));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('sway', new BufferAttribute(sway, 1));
  g.computeVertexNormals();
  return g;
}

const TRUNK: [number, number, number] = [0.32, 0.22, 0.15];
const LEAF: [number, number, number] = [1, 1, 1];

function conifer(): BufferGeometry {
  return merge([
    { geo: new CylinderGeometry(0.06, 0.09, 0.4, 5).translate(0, 0.2, 0), color: TRUNK, sway: 0.2 },
    { geo: new ConeGeometry(0.42, 0.75, 6).translate(0, 0.62, 0), color: LEAF, sway: 1 },
    { geo: new ConeGeometry(0.3, 0.6, 6).translate(0, 1.05, 0), color: LEAF, sway: 1 },
  ]);
}
function broadleaf(): BufferGeometry {
  return merge([
    { geo: new CylinderGeometry(0.07, 0.11, 0.55, 5).translate(0, 0.27, 0), color: TRUNK, sway: 0.2 },
    { geo: new IcosahedronGeometry(0.46, 0).translate(0, 0.85, 0), color: LEAF, sway: 1 },
    { geo: new IcosahedronGeometry(0.3, 0).translate(0.26, 0.62, 0.1), color: LEAF, sway: 1 },
  ]);
}
function succulent(): BufferGeometry {
  return merge([
    { geo: new CylinderGeometry(0.13, 0.15, 0.9, 6).translate(0, 0.45, 0), color: LEAF, sway: 0.15 },
    { geo: new CylinderGeometry(0.08, 0.09, 0.4, 5).translate(0.26, 0.55, 0), color: LEAF, sway: 0.15 },
    { geo: new IcosahedronGeometry(0.13, 0).translate(0, 0.93, 0), color: LEAF, sway: 0.15 },
  ]);
}
function shrub(): BufferGeometry {
  return merge([
    { geo: new IcosahedronGeometry(0.34, 0).scale(1, 0.75, 1).translate(0, 0.24, 0), color: LEAF, sway: 0.8 },
    { geo: new IcosahedronGeometry(0.22, 0).translate(0.24, 0.18, 0.12), color: LEAF, sway: 0.8 },
  ]);
}
function tuft(): BufferGeometry {
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push({ geo: new ConeGeometry(0.05, 0.42, 3).rotateZ(0.35).rotateY(a).translate(Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1), color: LEAF, sway: 1.6 });
  }
  return merge(parts);
}

const KINDS = ['conifer', 'broadleaf', 'succulent', 'shrub', 'tuft'] as const;
type Kind = (typeof KINDS)[number];

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export class Vegetation {
  readonly meshes: InstancedMesh[] = [];
  private byKind = new Map<Kind, { mesh: InstancedMesh; glow: InstancedBufferAttribute; cap: number }>();
  private cells?: CellSnapshot;
  plants = new Map<number, PlantInfo>();
  private lastFocus = new Vector3(9, 9, 9);
  private lastDist = 0;
  private dirty = true;
  private triCentre: Float32Array;
  maxInstances: number;

  constructor(private grid: Grid, maxInstances: number) {
    this.maxInstances = maxInstances;
    const geos: Record<Kind, BufferGeometry> = { conifer: conifer(), broadleaf: broadleaf(), succulent: succulent(), shrub: shrub(), tuft: tuft() };
    const share: Record<Kind, number> = { conifer: 0.22, broadleaf: 0.22, succulent: 0.06, shrub: 0.2, tuft: 0.3 };
    for (const kind of KINDS) {
      const cap = Math.max(64, Math.floor(maxInstances * share[kind]));
      const material = new MeshBasicNodeMaterial();
      // per instance: x = night glow, y = size (sway must scale with the plant)
      const glow = new InstancedBufferAttribute(new Float32Array(cap * 2), 2);
      glow.setUsage(DynamicDrawUsage);
      const swayAmt = attribute('sway', 'float');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inst: any = instancedBufferAttribute(glow);
      // wind sway: tips move, roots stay put. positionLocal is already instanced here, so offsets are in world units.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const phase: any = float(instanceIndex).mul(1.37);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w: any = sin(uTime.mul(1.7).add(phase)).mul(0.06).add(sin(uTime.mul(0.6).add(phase.mul(0.3))).mul(0.05));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upDir: any = normalize(positionLocal);
      const east = normalize((vec3 as any)(upDir.z.negate(), 0, upDir.x));
      material.positionNode = positionLocal.add(east.mul(w).mul(swayAmt).mul(inst.y));
      const albedo = attribute('color', 'vec3');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const light: any = surfaceLight(normalize(normalWorld), positionWorld);
      const g = inst.x;
      // bioluminescent species glow softly at night
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const night: any = float(1).sub(dayAmount(positionWorld) as any);
      material.colorNode = albedo.mul(light).add(albedo.mul(g).mul(night).mul(1.6));
      const mesh = new InstancedMesh(geos[kind], material, cap);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.byKind.set(kind, { mesh, glow, cap });
    }
    const tris = grid.tris;
    this.triCentre = new Float32Array((tris.length / 3) * 3);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]! * 3, b = tris[t + 1]! * 3, c = tris[t + 2]! * 3;
      let x = grid.pos[a]! + grid.pos[b]! + grid.pos[c]!, y = grid.pos[a + 1]! + grid.pos[b + 1]! + grid.pos[c + 1]!, z = grid.pos[a + 2]! + grid.pos[b + 2]! + grid.pos[c + 2]!;
      const l = Math.hypot(x, y, z);
      x /= l; y /= l; z /= l;
      this.triCentre[t] = x; this.triCentre[t + 1] = y; this.triCentre[t + 2] = z;
    }
  }

  setCells(cells: CellSnapshot): void {
    this.cells = cells;
    this.dirty = true;
  }

  setPlants(plants: Map<number, PlantInfo>): void {
    this.plants = plants;
    this.dirty = true;
  }

  /** Rebuild instances around the camera focus when it has moved or the world has changed. */
  update(focus: Vector3, dist: number): void {
    const cells = this.cells;
    if (!cells) return;
    const show = dist < 1.1;
    if (!show) {
      if (this.lastDist < 1.1) for (const m of this.meshes) m.count = 0;
      this.lastDist = dist;
      return;
    }
    const moved = focus.distanceToSquared(this.lastFocus) > Math.pow(Math.min(0.03, dist * 0.12), 2) || Math.abs(Math.log(dist / Math.max(1e-6, this.lastDist))) > 0.2;
    if (!moved && !this.dirty) return;
    this.dirty = false;
    this.lastFocus.copy(focus);
    this.lastDist = dist;
    // radius of the planted patch grows with altitude; density per triangle falls
    const radius = Math.min(0.42, 0.045 + dist * 0.55);
    const cosR = Math.cos(radius);
    const { tris, pos } = this.grid;
    const tc = this.triCentre;
    const visible: number[] = [];
    for (let t = 0; t < tris.length; t += 3) {
      if (tc[t]! * focus.x + tc[t + 1]! * focus.y + tc[t + 2]! * focus.z > cosR) visible.push(t);
    }
    const perTri = Math.max(1, Math.min(42, Math.floor(this.maxInstances / Math.max(1, visible.length))));
    const counts = new Map<Kind, number>();
    for (const k of KINDS) counts.set(k, 0);
    const m = new Matrix4(), q = new Quaternion(), yaw = new Quaternion(), up = new Vector3(), p = new Vector3(), s = new Vector3();
    const Y = new Vector3(0, 1, 0);
    const color = new Color();
    const { elevation, vegetation, canopy, flora, seaLevel, snow } = cells;
    // scale plants so they stay readable from higher up
    const sizeBoost = 1 + Math.min(2.2, dist * 4);
    for (const t of visible) {
      const ia = tris[t]!, ib = tris[t + 1]!, ic = tris[t + 2]!;
      const va = vegetation[ia]!, vb = vegetation[ib]!, vc = vegetation[ic]!;
      if (va + vb + vc < 0.05) continue;
      const ra = 1 + elevation[ia]! * EXAG, rb = 1 + elevation[ib]! * EXAG, rc = 1 + elevation[ic]! * EXAG;
      for (let k = 0; k < perTri; k++) {
        const h0 = hash(t * 131 + k * 7919);
        let u = hash(t * 17 + k * 104729), v = hash(t * 29 + k * 1299709);
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;
        const density = va * w + vb * u + vc * v;
        if (h0 > density * 0.95) continue;
        const e = elevation[ia]! * w + elevation[ib]! * u + elevation[ic]! * v;
        if (e <= seaLevel + 0.01) continue;
        const near = w >= u && w >= v ? ia : u >= v ? ib : ic;
        if (snow[near]! > 4) continue;
        const sp = this.plants.get(flora[near]!);
        const genes = sp?.genes;
        const height = genes ? genes[PG.Height]! : canopy[near]!;
        const leaf = genes ? genes[PG.Leaf]! : 0.5;
        // individual variation around the species' height
        const hv = height * (0.6 + 0.8 * hash(t * 53 + k * 15485863));
        let kind: Kind;
        if (hv < 0.16) kind = 'tuft';
        else if (hv < 0.36) kind = 'shrub';
        else kind = leaf < 0.33 ? 'conifer' : leaf > 0.74 ? 'succulent' : 'broadleaf';
        const slot = this.byKind.get(kind)!;
        const n = counts.get(kind)!;
        if (n >= slot.cap) continue;
        p.set(
          pos[ia * 3]! * ra * w + pos[ib * 3]! * rb * u + pos[ic * 3]! * rc * v,
          pos[ia * 3 + 1]! * ra * w + pos[ib * 3 + 1]! * rb * u + pos[ic * 3 + 1]! * rc * v,
          pos[ia * 3 + 2]! * ra * w + pos[ib * 3 + 2]! * rb * u + pos[ic * 3 + 2]! * rc * v,
        );
        up.copy(p).normalize();
        q.setFromUnitVectors(Y, up);
        yaw.setFromAxisAngle(Y, h0 * 40);
        q.multiply(yaw);
        const size = (kind === 'tuft' ? 0.0009 : kind === 'shrub' ? 0.0013 : 0.0014 + 0.0026 * hv) * sizeBoost * (0.8 + 0.4 * hash(t * 7 + k * 31));
        s.set(size, size * (0.85 + 0.5 * hash(t * 3 + k * 11)), size);
        m.compose(p, q, s);
        slot.mesh.setMatrixAt(n, m);
        const hue = genes ? 0.2 + genes[PG.LeafHue]! * 0.22 : 0.3;
        const fruit = genes ? genes[PG.Fruit]! : 0;
        const flower = genes && fruit > 0.45 && hash(t * 97 + k * 13) < 0.25;
        if (flower) color.setHSL(genes![PG.FlowerHue]!, 0.75, 0.6);
        else color.setHSL(hue + (hash(t + k * 5) - 0.5) * 0.04, 0.5 + 0.2 * (1 - leaf), kind === 'tuft' ? 0.36 : 0.22 + 0.12 * hash(t * 11 + k));
        slot.mesh.setColorAt(n, color);
        slot.glow.setXY(n, genes && genes[PG.Glow]! > 0.5 ? genes[PG.Glow]! : 0, size);
        counts.set(kind, n + 1);
      }
    }
    for (const kind of KINDS) {
      const slot = this.byKind.get(kind)!;
      slot.mesh.count = counts.get(kind)!;
      slot.mesh.instanceMatrix.needsUpdate = true;
      slot.mesh.instanceColor!.needsUpdate = true;
      slot.glow.needsUpdate = true;
    }
  }
}
