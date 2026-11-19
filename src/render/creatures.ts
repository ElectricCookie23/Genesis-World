// Creatures: low-poly bodies generated from genomes, animated in the vertex shader,
// and placed near the camera from the real populations around it.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute,
  InstancedMesh, Matrix4, MeshBasicNodeMaterial, OctahedronGeometry, Quaternion, Vector3, type PerspectiveCamera,
} from 'three/webgpu';
import {
  abs, attribute, cameraPosition, cos, cross, dot, float, instancedBufferAttribute, max, normalLocal, normalize, positionGeometry, positionWorld, pow,
  sin, step, varying, vec3,
} from 'three/tsl';
import { G, Limb, limbKind, sizeMetres } from '../sim/genetics';
import { RNG } from '../sim/rng';
import { placeName } from '../sim/names';
import type { Grid } from '../sim/world';
import { buildRegions, type Regions } from '../sim/regions';
import type { CellSnapshot, HerdSnapshot, SpeciesInfo } from '../shared/protocol';
import { EXAG, uSeaKm, uTime } from './common';
import { dayAmount, surfaceLight } from './lighting';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Part { geo: BufferGeometry; kind: number; weight: (x: number, y: number, z: number) => number; phase: number; tint: number; glow?: boolean; }

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const noWeight = () => 0;

/** Build a creature mesh from a genome. Local frame: +X forward, +Y up, body length about 1. */
export function buildCreatureGeometry(g: Float32Array): BufferGeometry {
  const parts: Part[] = [];
  const kind = limbKind(g[G.LimbType]!);
  const hasLimbs = g[G.LimbPairs]! > 0.12;
  const ratio = 1.6 + 2.8 * g[G.BodyRatio]!;
  const L = 1;
  const H = (L / ratio) * (1 + 0.25 * g[G.Insulation]!);
  const W = H * (0.85 + 0.3 * g[G.Armor]!);
  const walker = hasLimbs && (kind === Limb.Legs || kind === Limb.Wings);
  const legLen = walker ? H * (0.45 + 1.5 * g[G.LimbLength]!) : 0;
  const bodyY = legLen + H * 0.5;
  const segs = Math.max(1, Math.min(6, 1 + Math.round(g[G.Segments]! * 5)));
  // torso: a chain of faceted blobs, fattest in the middle
  for (let s = 0; s < segs; s++) {
    const u = segs === 1 ? 0.5 : s / (segs - 1);
    const taper = 0.72 + 0.28 * Math.sin(u * Math.PI);
    const geo = new IcosahedronGeometry(0.5, 0).scale((L / segs) * 1.25, H * taper, W * taper).translate(-L / 2 + (u * 0.84 + 0.08) * L, bodyY, 0);
    parts.push({ geo, kind: 0, weight: noWeight, phase: 0, tint: 0 });
  }
  if (g[G.Armor]! > 0.45) {
    const shell = new IcosahedronGeometry(0.5, 1).scale(L * 0.82, H * 1.25, W * 1.2).translate(-0.04, bodyY + H * 0.12, 0);
    parts.push({ geo: shell, kind: 0, weight: noWeight, phase: 0, tint: 3 });
  }
  // neck and head
  const neck = H * 2.4 * g[G.Neck]!;
  const hs = H * (0.5 + 0.6 * g[G.Head]!);
  const nx = L / 2 + neck * 0.55, ny = bodyY + H * 0.15 + neck * 0.8;
  if (neck > H * 0.3) {
    const nGeo = new BoxGeometry(neck * 1.05, H * 0.34, W * 0.34).rotateZ(0.97).translate(L / 2 - 0.04 + neck * 0.27, bodyY + H * 0.12 + neck * 0.4, 0);
    parts.push({ geo: nGeo, kind: 0, weight: noWeight, phase: 0, tint: 0 });
  }
  const snout = 1 + 0.5 * g[G.Diet]!;
  parts.push({ geo: new IcosahedronGeometry(0.5, 0).scale(hs * 1.25 * snout, hs, hs * 0.95).translate(nx + hs * 0.35, ny, 0), kind: 4, weight: () => 1, phase: 0, tint: 0 });
  // eyes
  const eyes = Math.round(g[G.EyeCount]! * 6);
  const es = hs * (0.14 + 0.2 * g[G.EyeSize]!);
  for (let e = 0; e < eyes; e++) {
    const side = e % 2 === 0 ? 1 : -1;
    const row = Math.floor(e / 2);
    const ex = nx + hs * (0.62 - row * 0.3) * snout, ey = ny + hs * (0.16 + row * 0.12), ez = side * hs * (0.36 + row * 0.06);
    parts.push({ geo: new OctahedronGeometry(es, 0).translate(ex, ey, ez), kind: 4, weight: () => 1, phase: 0, tint: 4, glow: g[G.Nocturnal]! > 0.6 });
  }
  // horns
  if (g[G.Horn]! > 0.22) {
    const hl = hs * 2.2 * g[G.Horn]!;
    for (const side of [1, -1]) {
      parts.push({ geo: new ConeGeometry(hs * 0.14, hl, 4).rotateZ(-0.5).translate(nx + hs * 0.2 + hl * 0.2, ny + hs * 0.45 + hl * 0.4, side * hs * 0.26), kind: 4, weight: () => 1, phase: 0, tint: 5 });
    }
  }
  // tail
  const tail = L * 1.15 * g[G.Tail]!;
  if (tail > 0.08) {
    const tGeo = new ConeGeometry(H * 0.3, tail, 5).rotateZ(Math.PI / 2).translate(-L / 2 - tail / 2 + 0.06, bodyY, 0);
    parts.push({ geo: tGeo, kind: 2, weight: (x) => Math.min(1, Math.max(0, (-L / 2 - x) / tail)), phase: 0, tint: 1 });
    if (kind === Limb.Fins || !hasLimbs) {
      const fluke = new ConeGeometry(H * 0.55, H * 0.7, 3).rotateZ(Math.PI / 2).scale(1, 1.4, 0.15).translate(-L / 2 - tail, bodyY, 0);
      parts.push({ geo: fluke, kind: 2, weight: () => 1, phase: 0, tint: 1 });
    }
  }
  const pairs = hasLimbs ? Math.max(1, Math.round(g[G.LimbPairs]! * 4)) : 0;
  if (walker) {
    const legPairs = kind === Limb.Wings ? 1 : pairs;
    for (let p = 0; p < legPairs; p++) {
      const lx = legPairs === 1 ? 0.05 : -L * 0.34 + (p / (legPairs - 1)) * L * 0.68;
      for (const side of [1, -1]) {
        const thick = H * 0.2;
        const geo = new BoxGeometry(thick, legLen, thick).translate(lx, legLen / 2, side * W * 0.42);
        parts.push({ geo, kind: 1, weight: (_x, y) => Math.max(0, 1 - y / Math.max(1e-3, legLen)), phase: (p + (side > 0 ? 0 : 1)) % 2, tint: 1 });
      }
    }
  }
  if (hasLimbs && kind === Limb.Fins) {
    for (let p = 0; p < Math.min(3, pairs); p++) {
      const fx = L * 0.25 - p * L * 0.3;
      for (const side of [1, -1]) {
        const len = H * (0.6 + 1.2 * g[G.LimbLength]!);
        const geo = new ConeGeometry(H * 0.32, len, 3).scale(1, 1, 0.2).rotateX((side * Math.PI) / 2).rotateY(-side * 0.5).translate(fx, bodyY - H * 0.2, side * (W * 0.45 + len * 0.45));
        parts.push({ geo, kind: 2, weight: (_x, _y, z) => Math.min(1, Math.abs(z) / (W * 0.5 + len)), phase: p, tint: 1 });
      }
    }
  }
  if (hasLimbs && kind === Limb.Wings) {
    const span = L * (0.8 + 1.3 * g[G.LimbLength]!);
    for (const side of [1, -1]) {
      const geo = new ConeGeometry(L * 0.38, span, 3).scale(1, 1, 0.06).rotateX((side * Math.PI) / 2).translate(0.05, bodyY + H * 0.3, side * (W * 0.4 + span * 0.5));
      parts.push({ geo, kind: 3, weight: (_x, _y, z) => Math.min(1, Math.max(0, (Math.abs(z) - W * 0.4) / span)), phase: 0, tint: 1 });
    }
  }
  // gliding membrane between the limbs of would-be fliers
  if (hasLimbs && kind === Limb.Legs && g[G.LimbType]! > 0.66) {
    const geo = new BoxGeometry(L * 0.6, H * 0.04, W * 2.2).translate(0, bodyY - H * 0.1, 0);
    parts.push({ geo, kind: 0, weight: noWeight, phase: 0, tint: 1 });
  }
  // gas-bladder drifters: slow winged bodies carry a great pale float above them
  if (hasLimbs && kind === Limb.Wings && g[G.Metabolism]! < 0.3 && g[G.Size]! > 0.45) {
    parts.push({ geo: new IcosahedronGeometry(0.5, 1).scale(L * 1.1, H * 2.2, W * 2.2).translate(0, bodyY + H * 1.7, 0), kind: 0, weight: noWeight, phase: 0, tint: 2 });
  }
  // living islands and walking forests: giants that carry a grove on their backs
  if (g[G.Size]! > 0.85 && (g[G.Water]! > 0.7 ? g[G.Armor]! > 0.25 : g[G.ColorChange]! > 0.6)) {
    for (let t = 0; t < 5; t++) {
      const tx = -L * 0.3 + t * L * 0.15, tz = (t % 2 ? 1 : -1) * W * 0.18;
      parts.push({ geo: new ConeGeometry(H * 0.22, H * 0.9, 5).translate(tx, bodyY + H * 0.85, tz), kind: 0, weight: noWeight, phase: 0, tint: 6 });
    }
  }
  if (g[G.Ornament]! > 0.4) {
    const ch = H * 1.6 * g[G.Ornament]!;
    const crest = new ConeGeometry(L * 0.3, ch, 3).scale(1, 1, 0.08).translate(-0.05, bodyY + H * 0.45 + ch * 0.45, 0);
    parts.push({ geo: crest, kind: 0, weight: noWeight, phase: 0, tint: 2 });
  }
  // bake colours and animation data
  let count = 0;
  const flat = parts.map((p) => ({ ...p, geo: p.geo.index ? p.geo.toNonIndexed() : p.geo }));
  for (const p of flat) count += p.geo.attributes.position!.count;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), anim = new Float32Array(count * 4), glow = new Float32Array(count * 3);
  const insulated = g[G.Insulation]! > 0.5;
  const base = new Color().setHSL(g[G.Hue]!, insulated ? 0.4 : 0.68, insulated ? 0.46 : 0.38);
  const second = new Color().setHSL(g[G.Hue2]!, 0.7, 0.3);
  const belly = base.clone().lerp(new Color(0.9, 0.86, 0.75), 0.4);
  const shellC = base.clone().multiplyScalar(0.55);
  const eyeC = new Color(0.03, 0.03, 0.04);
  const hornC = new Color(0.85, 0.8, 0.68);
  const glowC = new Color().setHSL(g[G.GlowHue]!, 0.9, 0.55);
  const glows = g[G.Glow]! > 0.5 || (g[G.Electric]! > 0.6 && g[G.Water]! > 0.6);
  const pattern = Math.min(3, Math.floor(g[G.PatternType]! * 4));
  const pScale = 4 + 18 * g[G.PatternScale]!;
  const c = new Color();
  let o = 0;
  for (const p of flat) {
    const a = p.geo.attributes.position!;
    for (let i = 0; i < a.count; i += 3) {
      // one colour per face keeps the faceted look
      const cx = (a.getX(i) + a.getX(i + 1) + a.getX(i + 2)) / 3, cy = (a.getY(i) + a.getY(i + 1) + a.getY(i + 2)) / 3, cz = (a.getZ(i) + a.getZ(i + 1) + a.getZ(i + 2)) / 3;
      let marked = false;
      if (p.tint === 0 || p.tint === 1) {
        if (pattern === 1) marked = Math.sin(cx * pScale) > 0.25;
        else if (pattern === 2) marked = hash(Math.round(cx * pScale) * 73 + Math.round(cy * pScale) * 19 + Math.round(cz * pScale) * 7) > 0.7;
        c.copy(marked ? second : base);
        if (pattern === 3) c.lerp(second, Math.min(1, Math.max(0, (cy - legLen) / Math.max(1e-3, H))));
        else if (cy < bodyY - H * 0.15 && !marked) c.lerp(belly, 0.6);
        if (p.tint === 1) c.multiplyScalar(0.82);
      } else if (p.tint === 2) c.copy(second).multiplyScalar(1.3);
      else if (p.tint === 3) c.copy(shellC);
      else if (p.tint === 4) c.copy(eyeC);
      else if (p.tint === 6) c.setRGB(0.12, 0.42, 0.16);
      else c.copy(hornC);
      const lit = (glows && (marked || p.tint === 2)) || p.glow;
      for (let k = 0; k < 3; k++, o++) {
        const x = a.getX(i + k), y = a.getY(i + k), z = a.getZ(i + k);
        pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
        anim[o * 4] = p.kind; anim[o * 4 + 1] = p.weight(x, y, z); anim[o * 4 + 2] = p.phase; anim[o * 4 + 3] = z >= 0 ? 1 : -1;
        if (lit) { glow[o * 3] = glowC.r; glow[o * 3 + 1] = glowC.g; glow[o * 3 + 2] = glowC.b; }
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('anim', new BufferAttribute(anim, 4));
  geo.setAttribute('emissive', new BufferAttribute(glow, 3));
  geo.computeVertexNormals();
  return geo;
}

const CAP = 384;

interface Slot { mesh: InstancedMesh; iPos: InstancedBufferAttribute; iQuat: InstancedBufferAttribute; iData: InstancedBufferAttribute; iTint: InstancedBufferAttribute; used: number; }

/** True for the rare golden individuals. */
export function isGolden(key: number): boolean {
  return hash(key * 977 + 13) < 0.0015;
}

export interface Individual {
  key: number;
  species: number;
  region: number;
  /** 0 sea, 1 land, 2 air */
  medium: number;
  home: Vector3;
  e1: Vector3;
  e2: Vector3;
  h: number;
  size: number;
  social: number;
  fed: number;
  /** Current world position and whether it is moving, updated every frame. */
  pos: Vector3;
  fwd: Vector3;
  moving: number;
  cell: number;
  /** 0..1 how much it sleeps by day (nocturnal) */
  night: number;
  larva: boolean;
}

let sharedMaterial: MeshBasicNodeMaterial | null = null;

/** One material for every species: instance data comes from named instanced attributes on each geometry. */
function makeMaterial(): MeshBasicNodeMaterial {
  if (sharedMaterial) return sharedMaterial;
  const material = new MeshBasicNodeMaterial();
  const ip: any = attribute('iPos', 'vec3');
  const iq: any = attribute('iQuat', 'vec4');
  const id: any = attribute('iData', 'vec4'); // scale, phase, moving, gait rate
  const anim: any = attribute('anim', 'vec4');
  const p: any = positionGeometry;
  const t = uTime.mul(id.w).add(id.y);
  const isLeg = step(0.5, anim.x).mul(step(anim.x, 1.5));
  const isTail = step(1.5, anim.x).mul(step(anim.x, 2.5));
  const isWing = step(2.5, anim.x).mul(step(anim.x, 3.5));
  const isHead = step(3.5, anim.x);
  const legT = t.add(anim.z.mul(Math.PI));
  // legs swing and lift; tails and fins undulate; wings flap; heads bob
  const dx = sin(legT).mul(anim.y).mul(0.2).mul(id.z).mul(isLeg);
  const dy = max(cos(legT), 0).mul(anim.y).mul(0.09).mul(id.z).mul(isLeg)
    .add(sin(t.mul(1.6)).mul(anim.y).mul(0.42).mul(isWing))
    .add(sin(t.mul(0.5)).mul(0.02).mul(isHead));
  const dz = sin(t.mul(0.9).sub(p.x.mul(4)).add(anim.z)).mul(anim.y).mul(0.14).mul(id.z.mul(0.7).add(0.3)).mul(isTail).mul(anim.w.mul(isWing.oneMinus()).mul(0).add(1));
  const local = vec3(p.x.add(dx), p.y.add(dy).mul(sin(uTime.mul(2).add(id.y)).mul(0.015).add(1)), p.z.add(dz)).mul(id.x);
  const rotate = (v: any) => v.add(cross(iq.xyz, cross(iq.xyz, v).add(v.mul(iq.w))).mul(2));
  material.positionNode = rotate(local).add(ip);
  const nW = varying(normalize(rotate(normalLocal)));
  // one in a great many is born golden
  const gold: any = attribute('iTint', 'float');
  const albedo: any = (attribute('color', 'vec3') as any).mul(gold.oneMinus()).add((vec3 as any)(1.0, 0.72, 0.18).mul(gold));
  const light: any = surfaceLight(nW, positionWorld);
  const V = normalize(cameraPosition.sub(positionWorld));
  const day: any = dayAmount(positionWorld);
  const rim: any = pow(float(1).sub(max(dot(nW, V), 0)), 3).mul(0.22).mul(day);
  const emissive: any = attribute('emissive', 'vec3');
  material.colorNode = albedo.mul(light).mul(0.82).add((vec3 as any)(rim, rim, rim)).add(emissive.mul(float(1.15).sub(day)).mul(2.4));
  void abs;
  void instancedBufferAttribute;
  sharedMaterial = material;
  return material;
}

export class CreatureLayer {
  private slots = new Map<number, Slot>();
  private species = new Map<number, SpeciesInfo>();
  private regions: Regions;
  individuals: Individual[] = [];
  private cells?: CellSnapshot;
  budget: number;
  onMesh?: (mesh: InstancedMesh) => void;
  private herdSig = '';
  private cellTriStart: Int32Array;
  private cellTriList: Int32Array;

  constructor(private grid: Grid, budget: number) {
    this.budget = budget;
    this.regions = buildRegions(grid);
    // triangles around each cell, for exact ground height
    const tris = grid.tris;
    const start = new Int32Array(grid.count + 1);
    for (let t = 0; t < tris.length; t++) start[tris[t]! + 1] = start[tris[t]! + 1]! + 1;
    for (let i = 0; i < grid.count; i++) start[i + 1] = start[i + 1]! + start[i]!;
    const fill = start.slice(0, grid.count);
    const list = new Int32Array(tris.length);
    for (let t = 0; t < tris.length; t++) {
      const c = tris[t]!;
      list[fill[c]!] = t - (t % 3);
      fill[c] = fill[c]! + 1;
    }
    this.cellTriStart = start;
    this.cellTriList = list;
  }

  setSpecies(species: Map<number, SpeciesInfo>): void {
    this.species = species;
  }

  setCells(cells: CellSnapshot): void {
    this.cells = cells;
  }

  private slot(id: number): Slot | undefined {
    let s = this.slots.get(id);
    if (s) return s;
    const larval = id < 0;
    const info = this.species.get(larval ? -id - 1 : id);
    if (!info) return undefined;
    const iPos = new InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    const iQuat = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    const iData = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    const iTint = new InstancedBufferAttribute(new Float32Array(CAP), 1);
    for (const a of [iPos, iQuat, iData, iTint]) a.setUsage(DynamicDrawUsage);
    let genes = info.genes;
    if (larval) {
      // the young of a metamorphosing species look nothing like the adults: a soft, limbless grub
      genes = info.genes.slice();
      genes[G.LimbPairs] = 0; genes[G.Neck] = 0; genes[G.Horn] = 0; genes[G.Armor] = 0; genes[G.Ornament] = 0; genes[G.Tail] = 0.15;
      genes[G.Segments] = 1; genes[G.BodyRatio] = 0.8; genes[G.EyeCount] = 0.2; genes[G.Hue] = (genes[G.Hue]! + 0.12) % 1; genes[G.PatternType] = 0.3;
    }
    const geo = buildCreatureGeometry(genes);
    geo.setAttribute('iPos', iPos);
    geo.setAttribute('iQuat', iQuat);
    geo.setAttribute('iData', iData);
    geo.setAttribute('iTint', iTint);
    const mesh = new InstancedMesh(geo, makeMaterial(), CAP);
    const m = new Matrix4();
    for (let i = 0; i < CAP; i++) mesh.setMatrixAt(i, m);
    mesh.count = 0;
    mesh.frustumCulled = false;
    s = { mesh, iPos, iQuat, iData, iTint, used: 0 };
    this.slots.set(id, s);
    this.onMesh?.(mesh);
    return s;
  }

  /** Rebuild the list of individuals from the populations around the camera. */
  setHerds(h: HerdSnapshot): void {
    const cells = this.cells;
    if (!cells) return;
    const sig = `${h.region.length}:${h.region[0] ?? -1}:${h.species.join(',')}`;
    const n = h.region.length;
    const want = new Float32Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const info = this.species.get(h.species[i]!);
      if (!info) continue;
      // small animals come in bigger groups
      const w = Math.max(1, Math.min(14, (1 + Math.log10(h.count[i]! + 1) * 1.1) * (1.4 - info.genes[G.Size]!)));
      want[i] = w;
      total += w;
    }
    const scale = total > this.budget ? this.budget / total : 1;
    const list: Individual[] = [];
    const reg = this.regions;
    const { elevation, seaLevel } = cells;
    for (let i = 0; i < n; i++) {
      const info = this.species.get(h.species[i]!);
      if (!info || want[i]! <= 0) continue;
      const count = Math.max(1, Math.round(want[i]! * scale));
      const r = h.region[i]!;
      const a = reg.cellStart[r]!, b = reg.cellStart[r + 1]!;
      const medium = h.fly[i]! > 0.45 ? 2 : h.land[i]! > 0.5 ? 1 : 0;
      for (let k = 0; k < count; k++) {
        const key = (r * 4099 + h.species[i]! * 131 + k) | 0;
        // a home cell of the right kind (land or water) inside the region
        let cell = -1;
        for (let tries = 0; tries < 8 && cell < 0; tries++) {
          const cnd = reg.cellList[a + Math.floor(hash(key * 7 + tries * 13) * (b - a))]!;
          const land = elevation[cnd]! > seaLevel + 0.01;
          if (medium === 2 || (medium === 1) === land) cell = cnd;
        }
        if (cell < 0) continue;
        const home = new Vector3(this.grid.pos[cell * 3]!, this.grid.pos[cell * 3 + 1]!, this.grid.pos[cell * 3 + 2]!);
        const e1 = new Vector3(0, 1, 0).cross(home).normalize();
        if (e1.lengthSq() < 0.5) e1.set(1, 0, 0);
        const e2 = new Vector3().crossVectors(home, e1).normalize();
        list.push({
          key, species: h.species[i]!, region: r, medium, home, e1, e2, h: hash(key * 31 + 5),
          size: 0.0006 + 0.0038 * Math.pow(info.genes[G.Size]!, 1.3), social: info.genes[G.Sociality]!, fed: h.fed[i]!,
          pos: home.clone(), fwd: e1.clone(), moving: 0, cell, night: info.genes[G.Nocturnal]!,
          larva: info.genes[G.Metamorphosis]! > 0.6 && hash(key * 53 + 7) < 0.35,
        });
      }
    }
    this.individuals = list;
    this.herdSig = sig;
  }

  /** Development aid: drop a varied set of made-up species around a point. */
  debugSpawn(dir: Vector3): void {
    const rng = new RNG(12345);
    const species = new Map<number, SpeciesInfo>();
    const archetypes: Partial<Record<number, number>>[] = [
      { [G.Size]: 0.5, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.6, [G.Neck]: 0.2, [G.Tail]: 0.4, [G.Water]: 0.05, [G.Diet]: 0.1, [G.Sociality]: 0.9, [G.EyeCount]: 0.34 },
      { [G.Size]: 0.75, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.8, [G.Neck]: 0.95, [G.Tail]: 0.5, [G.Water]: 0.05, [G.Diet]: 0.05, [G.Sociality]: 0.5, [G.EyeCount]: 0.34 },
      { [G.Size]: 0.45, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.5, [G.Tail]: 0.7, [G.Water]: 0.05, [G.Diet]: 0.95, [G.Sociality]: 0.7, [G.Horn]: 0.1, [G.EyeCount]: 0.34, [G.PatternType]: 0.4 },
      { [G.Size]: 0.3, [G.LimbType]: 0.9, [G.LimbPairs]: 0.3, [G.LimbLength]: 0.7, [G.Tail]: 0.4, [G.Water]: 0.05, [G.Diet]: 0.4, [G.Sociality]: 0.8, [G.EyeCount]: 0.34 },
      { [G.Size]: 0.6, [G.LimbType]: 0.4, [G.LimbPairs]: 0.4, [G.LimbLength]: 0.5, [G.Tail]: 0.8, [G.Water]: 1, [G.Diet]: 0.3, [G.Sociality]: 0.9, [G.EyeCount]: 0.34 },
      { [G.Size]: 0.55, [G.LimbType]: 0.6, [G.LimbPairs]: 0.9, [G.LimbLength]: 0.2, [G.Armor]: 0.9, [G.Horn]: 0.7, [G.Tail]: 0.3, [G.Water]: 0.05, [G.Diet]: 0.1, [G.Segments]: 0.6, [G.EyeCount]: 0.7 },
      { [G.Size]: 0.2, [G.LimbType]: 0.6, [G.LimbPairs]: 0.9, [G.LimbLength]: 0.4, [G.Segments]: 1, [G.Glow]: 0.9, [G.PatternType]: 0.6, [G.Water]: 0.05, [G.Nocturnal]: 0.9, [G.EyeCount]: 1, [G.Ornament]: 0.8 },
    ];
    archetypes.forEach((arch, id) => {
      const genes = new Float32Array(G.COUNT as number);
      for (let i = 0; i < genes.length; i++) genes[i] = 0.15 + rng.next() * 0.3;
      genes[G.Hue] = rng.next(); genes[G.Hue2] = rng.next(); genes[G.Armor] = 0.1; genes[G.Horn] = 0.05; genes[G.Ornament] = 0.1; genes[G.Glow] = 0.1;
      for (const k in arch) genes[Number(k)] = arch[Number(k)]!;
      species.set(id, { id, name: `Debug ${id}`, parent: -1, bornYear: 0, extinctYear: -1, pop: 1e5, peakPop: 1e5, regions: 3, homeCell: 0, eventId: -1, genes, metres: sizeMetres(genes[G.Size]!), land: 1 - genes[G.Water]!, fly: genes[G.LimbType]! > 0.75 ? 0.8 : 0 });
    });
    this.setSpecies(species);
    let cell = 0, bd = -2;
    for (let i = 0; i < this.grid.count; i++) {
      const d = this.grid.pos[i * 3]! * dir.x + this.grid.pos[i * 3 + 1]! * dir.y + this.grid.pos[i * 3 + 2]! * dir.z;
      if (d > bd) { bd = d; cell = i; }
    }
    const r0 = this.regions.regionOf[cell]!;
    const rs = [r0];
    for (let j = 0; j < this.regions.grid.ncount[r0]!; j++) rs.push(this.regions.grid.neighbors[r0 * 6 + j]!);
    const region: number[] = [], sp: number[] = [], count: number[] = [], land: number[] = [], fly: number[] = [], fed: number[] = [];
    for (const r of rs) for (const [id, info] of species) { region.push(r); sp.push(id); count.push(3e4); land.push(info.land); fly.push(info.fly); fed.push(1); }
    this.setHerds({ region: Int32Array.from(region), species: Int32Array.from(sp), count: Float32Array.from(count), land: Float32Array.from(land), fly: Float32Array.from(fly), fed: Float32Array.from(fed) });
  }

  clear(): void {
    this.individuals = [];
    for (const s of this.slots.values()) s.mesh.count = 0;
  }

  /** Remove meshes of species that have died out. */
  prune(): InstancedMesh[] {
    const gone: InstancedMesh[] = [];
    for (const [id, s] of this.slots) {
      const info = this.species.get(id < 0 ? -id - 1 : id);
      if (!info || info.extinctYear >= 0) {
        gone.push(s.mesh);
        s.mesh.geometry.dispose();
        this.slots.delete(id);
      }
    }
    return gone;
  }

  /** Exact height of the faceted terrain along a direction: find the triangle under it and hit its plane. */
  private groundRadius(ind: Individual, dir: Vector3): number {
    const cells = this.cells!;
    const { pos, neighbors, ncount, tris } = this.grid;
    let cur = ind.cell;
    let best = pos[cur * 3]! * dir.x + pos[cur * 3 + 1]! * dir.y + pos[cur * 3 + 2]! * dir.z;
    for (let guard = 0; guard < 6; guard++) {
      let moved = false;
      for (let k = 0; k < ncount[cur]!; k++) {
        const nb = neighbors[cur * 6 + k]!;
        const d = pos[nb * 3]! * dir.x + pos[nb * 3 + 1]! * dir.y + pos[nb * 3 + 2]! * dir.z;
        if (d > best) { best = d; cur = nb; moved = true; }
      }
      if (!moved) break;
    }
    ind.cell = cur;
    const el = cells.elevation;
    let bestR = 1 + el[cur]! * EXAG, bestIn = -Infinity;
    for (let k = this.cellTriStart[cur]!; k < this.cellTriStart[cur + 1]!; k++) {
      const t = this.cellTriList[k]!;
      const ia = tris[t]!, ib = tris[t + 1]!, ic = tris[t + 2]!;
      const ra = 1 + el[ia]! * EXAG, rb = 1 + el[ib]! * EXAG, rc = 1 + el[ic]! * EXAG;
      const ax = pos[ia * 3]! * ra, ay = pos[ia * 3 + 1]! * ra, az = pos[ia * 3 + 2]! * ra;
      const bx = pos[ib * 3]! * rb - ax, by = pos[ib * 3 + 1]! * rb - ay, bz = pos[ib * 3 + 2]! * rb - az;
      const cx = pos[ic * 3]! * rc - ax, cy = pos[ic * 3 + 1]! * rc - ay, cz = pos[ic * 3 + 2]! * rc - az;
      const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
      const denom = nx * dir.x + ny * dir.y + nz * dir.z;
      if (Math.abs(denom) < 1e-12) continue;
      const r = (nx * ax + ny * ay + nz * az) / denom;
      // barycentric test of the hit point
      const px = dir.x * r - ax, py = dir.y * r - ay, pz = dir.z * r - az;
      const d00 = bx * bx + by * by + bz * bz, d01 = bx * cx + by * cy + bz * cz, d11 = cx * cx + cy * cy + cz * cz;
      const d20 = px * bx + py * by + pz * bz, d21 = px * cx + py * cy + pz * cz;
      const inv = 1 / (d00 * d11 - d01 * d01);
      const v = (d11 * d20 - d01 * d21) * inv, w = (d00 * d21 - d01 * d20) * inv;
      const inside = Math.min(v, w, 1 - v - w);
      if (inside > bestIn) { bestIn = inside; bestR = r; }
      if (inside >= 0) break;
    }
    return bestR;
  }

  private place(ind: Individual, t: number, out: Vector3): void {
    const air = ind.medium === 2, sea = ind.medium === 0;
    const A = air ? 0.011 : sea ? 0.006 : 0.0035;
    const herd = hash(((ind.key / 16) | 0) * 977 + ind.species);
    const w1 = (0.05 + 0.05 * herd) * (air ? 2.4 : 1), w2 = w1 * 0.37;
    // the herd drifts; each member keeps its own place in it and stops now and then
    const hx = A * (Math.sin(w1 * t + herd * 40) + 0.5 * Math.sin(w2 * t + herd * 17));
    const hy = A * (Math.cos(w1 * 0.8 * t + herd * 23) + 0.5 * Math.sin(w2 * 1.3 * t + herd * 5));
    const spread = 0.0009 + 0.0042 * (1 - ind.social);
    const tw = t + 9 * Math.sin(0.11 * t + ind.h * 50);
    const ang = ind.h * 6.283 + 0.07 * tw * (ind.h > 0.5 ? 1 : -1);
    const rad = spread * (0.35 + 0.65 * hash(ind.key * 3 + 1));
    const x = hx + Math.cos(ang) * rad, y = hy + Math.sin(ang) * rad;
    out.copy(ind.home).addScaledVector(ind.e1, x).addScaledVector(ind.e2, y).normalize();
  }

  /** Move everyone and fill the instance buffers. */
  update(time: number, dist: number, sunDir: Vector3): void {
    if (!this.cells) return;
    for (const s of this.slots.values()) s.used = 0;
    if (dist > 1.25 || !this.individuals.length) {
      for (const s of this.slots.values()) s.mesh.count = 0;
      return;
    }
    const a = new Vector3(), b = new Vector3(), fwd = new Vector3(), up = new Vector3(), right = new Vector3();
    const m = new Matrix4(), q = new Quaternion();
    const sea = 1 + uSeaKm.value * EXAG;
    const boost = 1 + Math.min(2.6, dist * 5);
    for (const ind of this.individuals) {
      const slot = this.slot(ind.larva ? -ind.species - 1 : ind.species);
      if (!slot || slot.used >= CAP) continue;
      this.place(ind, time, a);
      this.place(ind, time + 0.4, b);
      fwd.copy(b).sub(a);
      const speed = fwd.length() / 0.4;
      up.copy(a);
      fwd.addScaledVector(up, -fwd.dot(up));
      if (fwd.lengthSq() < 1e-14) fwd.copy(ind.e1);
      fwd.normalize();
      right.crossVectors(fwd, up).normalize();
      // nocturnal animals lie low by day, and day animals by night
      const sun = a.x * sunDir.x + a.y * sunDir.y + a.z * sunDir.z;
      const asleep = ind.night > 0.6 ? sun > 0.1 : ind.night < 0.3 ? sun < -0.15 : false;
      const size = ind.size * boost * (ind.larva ? 0.5 : 1);
      ind.fwd.copy(fwd);
      let r: number;
      if (ind.medium === 1) r = Math.max(this.groundRadius(ind, a), sea);
      else if (ind.medium === 0) r = sea - size * (0.5 + 0.8 * ind.h);
      else r = Math.max(this.groundRadius(ind, a), sea) + (asleep ? size * 0.2 : 0.0035 + size * 1.5 + 0.0012 * Math.sin(time * 0.6 + ind.h * 30));
      ind.pos.copy(a).multiplyScalar(r);
      ind.moving = asleep && ind.medium !== 0 ? 0 : Math.min(1, speed / (ind.medium === 2 ? 0.0009 : 0.00035));
      m.makeBasis(fwd, up, right);
      q.setFromRotationMatrix(m);
      const i = slot.used++;
      slot.iPos.setXYZ(i, ind.pos.x, ind.pos.y, ind.pos.z);
      slot.iQuat.setXYZW(i, q.x, q.y, q.z, q.w);
      slot.iTint.setX(i, isGolden(ind.key) ? 1 : 0);
      const gait = (ind.medium === 2 ? 7 : 5.5) * (1.6 - ind.size * 120) * (0.6 + 0.4 * ind.moving);
      slot.iData.setXYZW(i, size, ind.h * 60, ind.medium === 1 ? ind.moving : 0.4 + 0.6 * ind.moving, Math.max(1.5, gait));
    }
    for (const s of this.slots.values()) {
      s.mesh.count = s.used;
      if (s.used) {
        s.iPos.needsUpdate = true;
        s.iQuat.needsUpdate = true;
        s.iData.needsUpdate = true;
        s.iTint.needsUpdate = true;
      }
    }
  }

  /** The individual nearest a screen point, within a few pixels. */
  pick(camera: PerspectiveCamera, x: number, y: number, width: number, height: number): Individual | null {
    const v = new Vector3();
    let best: Individual | null = null, bd = 34 * 34;
    for (const ind of this.individuals) {
      v.copy(ind.pos).project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * width, sy = (-v.y * 0.5 + 0.5) * height;
      const d = (sx - x) * (sx - x) + (sy - y) * (sy - y);
      if (d < bd) { bd = d; best = ind; }
    }
    return best;
  }

  byKey(key: number): Individual | undefined {
    return this.individuals.find((i) => i.key === key);
  }
}

/** A stable personal name and age for an individual, for its info card. */
export function describeIndividual(ind: Individual, info: SpeciesInfo): { name: string; age: string; action: string } {
  const rng = new RNG((ind.key * 2654435761) >>> 0);
  const name = placeName(rng);
  const span = 1 + 70 * info.genes[G.Lifespan]! * (0.3 + info.genes[G.Size]!);
  const years = span * (0.08 + 0.85 * ind.h);
  const age = years < 1 ? `${Math.max(1, Math.round(years * 12))} months` : `${Math.round(years)} years`;
  const hunter = info.genes[G.Diet]! > 0.6;
  let action: string;
  if (ind.medium === 2) action = ind.moving > 0.5 ? 'soaring' : 'circling';
  else if (ind.medium === 0) action = ind.moving > 0.6 ? (hunter ? 'chasing prey' : 'swimming') : hunter ? 'lying in wait' : 'grazing the shallows';
  else if (ind.moving > 0.65) action = hunter ? 'stalking' : ind.fed < 0.8 ? 'searching for food' : 'walking with the herd';
  else action = hunter ? 'resting' : 'grazing';
  void sizeMetres;
  if (isGolden(ind.key)) action += ' (a rare golden one)';
  return { name, age, action };
}
