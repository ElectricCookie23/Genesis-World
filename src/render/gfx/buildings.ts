// What a people builds, seen up close: huts, houses, halls, towers, domes and spires scattered
// around each settlement by its size and technology, a stepped temple where one was raised, and
// boats working the sea lanes. All of it is instanced models that find the ground in the vertex
// shader, lit like everything else, with windows that light up at night in the nation's own colour.
import {
  BufferAttribute, BufferGeometry, DoubleSide, type InterleavedBufferAttribute, MeshBasicNodeMaterial, Quaternion, Vector3,
  type Texture,
} from 'three/webgpu';
import { Copies, packAttributes } from './packed';
import {
  abs, attribute, cameraPosition, cross, dot, float, floor, fract, max, mix, normalGeometry, normalize, positionGeometry, positionWorld, sin, smoothstep, step,
  varying, vec2, vec3,
} from 'three/tsl';
import type { Grid } from '../../sim/world';
import type { CellSnapshot, SettlementInfo } from '../../shared/protocol';
import { EXAG, uHazeTint, uMoonDir, uSeaKm, uSunDir, uTime } from '../common';
import { uLook } from './look';
import { settlementSize, type Nation } from './nations';
import type { PlanetData } from './planetdata';
import { groundRadiusNode } from './terrain';
import { eclipseLight } from './eclipse';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const PART = { wall: 0, roof: 1, windows: 2, flame: 3, sail: 4, hull: 5 } as const;
export const BUILDINGS = ['hut', 'house', 'hall', 'tower', 'dome', 'spire', 'temple', 'boat'] as const;
export type Building = (typeof BUILDINGS)[number];

type V3 = [number, number, number];

/** A small mesh builder for boxes, roofs and rings. Every vertex carries a part id and a uv for windows. */
class Shape {
  pos: number[] = []; nrm: number[] = []; part: number[] = []; uv: number[] = []; idx: number[] = [];
  private quad(a: V3, b: V3, c: V3, d: V3, part: number, uw = 1, vh = 1): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i = this.pos.length / 3;
    for (const [p, u, v] of [[a, 0, 0], [b, uw, 0], [c, uw, vh], [d, 0, vh]] as [V3, number, number][]) { this.pos.push(...p); this.nrm.push(nx, ny, nz); this.part.push(part); this.uv.push(u, v); }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  private tri(a: V3, b: V3, c: V3, part: number): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i = this.pos.length / 3;
    for (const p of [a, b, c]) { this.pos.push(...p); this.nrm.push(nx, ny, nz); this.part.push(part); this.uv.push(0.5, 0.5); }
    this.idx.push(i, i + 1, i + 2);
  }
  /** Four walls and a flat top. Sides carry `part`; uv counts windows across and floors up. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, part: number, topPart: number = PART.roof): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const cols = (len: number) => Math.max(1, Math.round(len / 0.22)), rows = Math.max(1, Math.round(h / 0.3));
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], part, cols(w), rows);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], part, cols(w), rows);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], part, cols(d), rows);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], part, cols(d), rows);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], topPart);
  }
  /** A ridged roof over a rectangle. */
  gable(cx: number, y0: number, cz: number, w: number, h: number, d: number): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0 + h, cz], [x0, y0 + h, cz], PART.roof);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y0 + h, cz], [x1, y0 + h, cz], PART.roof);
    this.tri([x1, y0, z1], [x1, y0, z0], [x1, y0 + h, cz], PART.wall);
    this.tri([x0, y0, z0], [x0, y0, z1], [x0, y0 + h, cz], PART.wall);
  }
  /** A round wall or a cone: rings of points around the y axis. */
  ring(cx: number, cz: number, y0: number, r0: number, y1: number, r1: number, sides: number, part: number): void {
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
      const p = (a: number, r: number, y: number): V3 => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      if (r1 < 1e-4) this.tri(p(a1, r0, y0), p(a0, r0, y0), [cx, y1, cz], part);
      else this.quad(p(a1, r0, y0), p(a0, r0, y0), p(a0, r1, y1), p(a1, r1, y1), part, 1, Math.max(1, Math.round((y1 - y0) / 0.3)));
    }
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('bpart', new BufferAttribute(new Float32Array(this.part), 1));
    g.setAttribute('buv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.idx);
    return g;
  }
}

/** Models are about one unit wide and stand on the origin. */
export function buildBuilding(kind: Building): BufferGeometry {
  const s = new Shape();
  switch (kind) {
    case 'hut':
      s.ring(0, 0, 0, 0.45, 0.42, 0.45, 9, PART.wall);
      s.ring(0, 0, 0.42, 0.6, 1.0, 0, 9, PART.roof);
      break;
    case 'house':
      s.box(0, 0, 0, 1.0, 0.5, 0.7, PART.wall);
      s.gable(0, 0.5, 0, 1.1, 0.42, 0.8);
      break;
    case 'hall':
      s.box(0, 0, 0, 1.6, 0.75, 0.9, PART.windows);
      s.gable(0, 0.75, 0, 1.7, 0.5, 1.0);
      s.box(0.5, 0, 0.6, 0.5, 0.5, 0.4, PART.wall);
      break;
    case 'tower':
      s.box(0, 0, 0, 0.62, 2.3, 0.62, PART.windows);
      s.box(0, 2.3, 0, 0.42, 0.25, 0.42, PART.wall);
      break;
    case 'dome': {
      s.ring(0, 0, 0, 0.7, 0.5, 0.7, 12, PART.windows);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI / 2, b = ((i + 1) / 4) * Math.PI / 2; s.ring(0, 0, 0.5 + Math.sin(a) * 0.7, Math.cos(a) * 0.7, 0.5 + Math.sin(b) * 0.7, Math.cos(b) * 0.7, 12, PART.roof); }
      break;
    }
    case 'spire':
      s.ring(0, 0, 0, 0.5, 1.6, 0.4, 8, PART.windows);
      s.ring(0, 0, 1.6, 0.4, 3.2, 0.24, 8, PART.windows);
      s.ring(0, 0, 3.2, 0.24, 4.3, 0, 8, PART.roof);
      break;
    case 'temple':
      for (let t = 0; t < 4; t++) s.box(0, t * 0.28, 0, 1.6 - t * 0.36, 0.28, 1.6 - t * 0.36, PART.wall, PART.wall);
      s.box(0, 1.12, 0, 0.34, 0.3, 0.34, PART.wall);
      s.ring(0, 0, 1.42, 0.12, 1.7, 0, 6, PART.flame);
      break;
    case 'boat':
      // a hull that narrows to the bow (+x), a mast with a sail, and a lamp at the stern
      s.ring(0, 0, -0.02, 0.0, 0.0, 0.0, 3, PART.hull);
      for (const [x0, x1, w0, w1] of [[-0.5, 0.1, 0.2, 0.22], [0.1, 0.55, 0.22, 0.02]] as [number, number, number, number][]) {
        for (const side of [1, -1]) {
          const a: V3 = [x0, -0.06, 0], b: V3 = [x1, -0.06, 0], c: V3 = [x1, 0.12, side * w1], d: V3 = [x0, 0.12, side * w0];
          if (side > 0) (s as any).quad(a, b, c, d, PART.hull); else (s as any).quad(b, a, d, c, PART.hull);
        }
        (s as any).quad([x0, 0.1, w0], [x1, 0.1, w1], [x1, 0.1, -w1], [x0, 0.1, -w0], PART.hull);
      }
      s.box(0, 0.1, 0, 0.03, 0.75, 0.03, PART.hull, PART.hull);
      (s as any).quad([0.02, 0.22, 0.0], [0.02, 0.8, 0.0], [0.36, 0.72, 0.1], [0.4, 0.26, 0.12], PART.sail);
      s.ring(-0.45, 0, 0.14, 0.035, 0.24, 0, 5, PART.flame);
      break;
  }
  return s.build();
}

interface Slot { mesh: Copies; iDir: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; iTint: InterleavedBufferAttribute; iLight: InterleavedBufferAttribute; cap: number; n: number; }

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export interface TownInfo extends SettlementInfo { temple?: boolean }

export class Towns {
  readonly meshes: Copies[] = [];
  /** Most buildings drawn at once. */
  budget = 4000;
  private slots = new Map<Building, Slot>();
  private settlements: TownInfo[] = [];
  private nationOf = new Map<number, Nation>();
  private lanes: number[][] = [];
  private cells?: CellSnapshot;
  private lastFocus = new Vector3(9, 9, 9);
  private lastDist = -1;
  private dirty = true;

  constructor(private grid: Grid, data: PlanetData, erosionTex: Texture, cloudShadow: (p: N) => N, cap = 4000) {
    this.budget = cap;
    const rotate = (v: N, q: N): N => v.add(cross(q.xyz, cross(q.xyz, v).add(v.mul(q.w))).mul(2));
    for (const kind of BUILDINGS) {
      const boat = kind === 'boat';
      const slotCap = boat ? 96 : kind === 'house' ? cap : kind === 'hut' ? Math.ceil(cap / 2) : kind === 'temple' ? 64 : Math.ceil(cap / 4);
      const g = buildBuilding(kind);
      // per-building data in one shared buffer (WebGPU allows 8 vertex buffers per draw; separately these made 9)
      const { iDir, iQuat, iData, iTint, iLight } = packAttributes(g, [
        { name: 'iDir', size: 3 }, { name: 'iQuat', size: 4 }, { name: 'iData', size: 4 }, // iData: size, seed, share of windows lit at night, technology
        { name: 'iTint', size: 3 }, { name: 'iLight', size: 3 },
      ], slotCap, { instanced: true, dynamic: true }) as { iDir: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; iTint: InterleavedBufferAttribute; iLight: InterleavedBufferAttribute };
      const material = new MeshBasicNodeMaterial({ side: DoubleSide });
      const aDir: N = attribute('iDir', 'vec3'), aQuat: N = attribute('iQuat', 'vec4'), aData: N = attribute('iData', 'vec4');
      // boats ride the sea, rocking a little; everything else stands on the ground
      const bobbing = sin(uTime.mul(1.3).add(aData.y.mul(40))).mul(0.000006);
      const radius: N = boat ? float(1).add(uSeaKm.mul(EXAG)).add(bobbing) : groundRadiusNode(data, erosionTex, aDir);
      const base: N = aDir.mul(radius);
      const roll: N = boat ? (vec3 as any)(0, sin(uTime.mul(1.1).add(aData.y.mul(30))).mul(0.06).mul((positionGeometry as any).z), 0) : vec3(0, 0, 0);
      material.positionNode = base.add(rotate((positionGeometry as any).add(roll).mul(aData.x), aQuat));
      const nW: N = varying(normalize(rotate(normalGeometry, aQuat)));
      const vPart: N = varying(attribute('bpart', 'float'));
      const vUv: N = varying(attribute('buv', 'vec2'));
      const vData: N = varying(aData);
      const vTint: N = varying(attribute('iTint', 'vec3')), vLight: N = varying(attribute('iLight', 'vec3'));
      const vBase: N = varying(base);
      const is = (k: number): N => step(abs(vPart.sub(k)), 0.5);
      const tech: N = vData.w;
      // walls go from mud and timber to stone to pale composite as a people learns to build
      const wall: N = mix(mix(vec3(0.5, 0.38, 0.27), vec3(0.56, 0.54, 0.5), smoothstep(0.25, 0.6, tech)), vec3(0.78, 0.8, 0.82), smoothstep(0.75, 0.98, tech))
        .mul(fract(vData.y.mul(7.3)).mul(0.3).add(0.82));
      const roof: N = mix(vec3(0.42, 0.34, 0.18), vTint.mul(0.55).add(0.08), smoothstep(0.3, 0.55, tech));
      // windows: a grid on the wall; each pane is lit or dark for the whole night
      const cell: N = floor(vUv);
      const inPane = step(0.22, fract(vUv.x)).mul(step(fract(vUv.x), 0.78)).mul(step(0.3, fract(vUv.y))).mul(step(fract(vUv.y), 0.8));
      const paneRnd = fract(sin(dot(cell.add(vData.y.mul(91)), vec2(127.1, 311.7))).mul(43758.5453));
      const litPane = step(paneRnd, vData.z).mul(inPane);
      const glass = inPane.mul(is(PART.windows));
      const up: N = normalize(vBase);
      const L: N = uSunDir, M: N = uMoonDir;
      const sunH = dot(up, L);
      const day = smoothstep(-0.12, 0.22, sunH);
      const night = float(1).sub(day);
      let albedo: N = wall.mul(is(PART.wall).add(is(PART.windows))).add(roof.mul(is(PART.roof))).add(vec3(0.86, 0.82, 0.7).mul(is(PART.sail))).add(vec3(0.2, 0.14, 0.1).mul(is(PART.hull)));
      albedo = mix(albedo, vec3(0.06, 0.08, 0.1), glass.mul(0.85));
      const sunColor: N = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.05, 0.4, sunH));
      const sunVis = smoothstep(-0.08, 0.1, sunH).mul(cloudShadow(vBase)).mul(eclipseLight(vBase));
      const sky: N = mix(vec3(uHazeTint), vec3(0.6, 0.6, 0.6), 0.45).mul(0.4).mul(day).mul(dot(nW, up).mul(0.35).add(0.65));
      const moon: N = vec3(uLook.moon).mul(0.05).mul(max(dot(nW, M), 0).mul(0.7).add(0.3)).mul(smoothstep(-0.1, 0.25, dot(up, M))).mul(night);
      const V: N = normalize(cameraPosition.sub(positionWorld));
      const glint = (max as any)(dot(V.add(L).normalize(), nW), 0).pow(60).mul(glass).mul(sunVis).mul(1.2);
      let color: N = albedo.mul(sunColor.mul(max(dot(nW, L), 0).mul(0.85).add(0.15)).mul(sunVis).mul(1.1).add(sky).add(moon).add(vec3(0.012, 0.016, 0.022))).add(sunColor.mul(glint));
      // lamplight in the nation's colour; fires burn day and night
      const flicker = sin(uTime.mul(9).add(vData.y.mul(60))).mul(0.2).add(0.85);
      color = color.add(vLight.mul(litPane.mul(is(PART.windows))).mul(night).mul(2.4))
        .add(mix(vec3(3.4, 1.3, 0.25), vLight.mul(2.6), smoothstep(0.45, 0.75, tech)).mul(is(PART.flame)).mul(flicker).mul(night.mul(0.8).add(0.35)));
      material.colorNode = color;
      const mesh = new Copies(g, material, slotCap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.slots.set(kind, { mesh, iDir, iQuat, iData, iTint, iLight, cap: slotCap, n: 0 });
    }
  }

  setCells(cells: CellSnapshot): void {
    this.cells = cells;
  }

  /** Settlements, the nations they belong to, and the sea lanes (chains of cells) boats follow. */
  setTowns(settlements: TownInfo[], nations: Nation[], lanes: number[][]): void {
    this.settlements = settlements;
    this.nationOf.clear();
    for (const n of nations) for (const m of n.members) this.nationOf.set(m, n);
    this.lanes = lanes;
    this.dirty = true;
  }

  private put(kind: Building, up: Vector3, yaw: number, size: number, seed: number, lit: number, tech: number, tint: readonly number[], light: readonly number[], fwd?: Vector3): void {
    const s = this.slots.get(kind)!;
    if (s.n >= s.cap) return;
    const i = s.n++;
    const q = Towns.q, y = Towns.y;
    if (fwd) {
      // boats point along their course
      const right = Towns.tmp.crossVectors(fwd, up).normalize();
      const f = Towns.tmp2.crossVectors(up, right).normalize();
      const m = Towns.m;
      m[0] = f.x; m[1] = f.y; m[2] = f.z; m[3] = up.x; m[4] = up.y; m[5] = up.z; m[6] = right.x; m[7] = right.y; m[8] = right.z;
      // quaternion from the basis (columns: forward, up, right)
      const tr = m[0]! + m[4]! + m[8]!;
      if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; q.set((m[5]! - m[7]!) / k, (m[6]! - m[2]!) / k, (m[1]! - m[3]!) / k, k / 4); }
      else if (m[0]! > m[4]! && m[0]! > m[8]!) { const k = Math.sqrt(1 + m[0]! - m[4]! - m[8]!) * 2; q.set(k / 4, (m[3]! + m[1]!) / k, (m[6]! + m[2]!) / k, (m[5]! - m[7]!) / k); }
      else if (m[4]! > m[8]!) { const k = Math.sqrt(1 + m[4]! - m[0]! - m[8]!) * 2; q.set((m[3]! + m[1]!) / k, k / 4, (m[7]! + m[5]!) / k, (m[6]! - m[2]!) / k); }
      else { const k = Math.sqrt(1 + m[8]! - m[0]! - m[4]!) * 2; q.set((m[6]! + m[2]!) / k, (m[7]! + m[5]!) / k, k / 4, (m[1]! - m[3]!) / k); }
    } else {
      q.setFromUnitVectors(Towns.Y, up);
      y.setFromAxisAngle(Towns.Y, yaw);
      q.multiply(y);
    }
    s.iDir.setXYZ(i, up.x, up.y, up.z);
    s.iQuat.setXYZW(i, q.x, q.y, q.z, q.w);
    s.iData.setXYZW(i, size, seed, lit, tech);
    s.iTint.setXYZ(i, tint[0]!, tint[1]!, tint[2]!);
    s.iLight.setXYZ(i, light[0]!, light[1]!, light[2]!);
  }
  private static q = new Quaternion();
  private static y = new Quaternion();
  private static Y = new Vector3(0, 1, 0);
  private static tmp = new Vector3();
  private static tmp2 = new Vector3();
  private static m: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  /** Rebuild the towns near the camera when it moves; boats move every frame. */
  update(focus: Vector3, dist: number, time: number): void {
    const cells = this.cells;
    const show = dist < 0.55 && !!cells && this.settlements.length > 0;
    if (!show) {
      if (this.lastDist >= 0) { for (const s of this.slots.values()) s.mesh.count = 0; this.lastDist = -1; }
      return;
    }
    const moved = this.lastDist < 0 || focus.distanceToSquared(this.lastFocus) > Math.pow(Math.min(0.03, dist * 0.15), 2) || Math.abs(Math.log(dist / Math.max(1e-6, this.lastDist))) > 0.2;
    const { pos, neighbors, ncount } = this.grid;
    const { elevation, seaLevel } = cells!;
    const boost = 1 + Math.min(1.6, dist * 3.2);
    if (moved || this.dirty) {
      this.dirty = false;
      this.lastFocus.copy(focus);
      this.lastDist = dist;
      for (const [k, s] of this.slots) if (k !== 'boat') s.n = 0;
      const reachCos = Math.cos(Math.min(0.5, 0.08 + dist * 0.7));
      const up = new Vector3(), east = new Vector3(), north = new Vector3(), c = new Vector3();
      let total = 0;
      for (const st of this.settlements) {
        if (st.ruined >= 0 || total >= this.budget) continue;
        c.set(pos[st.cell * 3]!, pos[st.cell * 3 + 1]!, pos[st.cell * 3 + 2]!);
        if (c.dot(focus) < reachCos) continue;
        const nat = this.nationOf.get(st.id);
        const tint = nat ? nat.signature : [0.6, 0.4, 0.3];
        const light = nat ? nat.color : [1.0, 0.5, 0.14];
        const size = settlementSize(st.pop);
        const radius = (0.0025 + 0.02 * size * (0.25 + 0.75 * st.tech));
        const count = Math.min(260, Math.round(5 + 240 * size * size * (0.3 + 0.7 * st.tech)));
        east.set(-c.z, 0, c.x).normalize();
        north.crossVectors(c, east);
        const lit = st.tech < 0.3 ? 0.15 : 0.25 + 0.5 * st.tech;
        if (st.temple) { this.put('temple', c, hash(st.id * 31) * 6.28, 0.0009 * boost, hash(st.id), lit, st.tech, tint, light); total++; }
        for (let k = 0; k < count && total < this.budget; k++) {
          const h1 = hash(st.id * 7919 + k * 31), h2 = hash(st.id * 104729 + k * 17), h3 = hash(st.id * 1299709 + k * 7);
          // dense in the middle, thinning outward, on loose rings so there are streets between
          const ring = Math.pow(h1, 0.75);
          const r = radius * (0.12 + ring * 0.9), a = h2 * Math.PI * 2;
          up.copy(c).addScaledVector(east, Math.cos(a) * r).addScaledVector(north, Math.sin(a) * r).normalize();
          // not in the sea
          let cell = st.cell, best = up.x * pos[cell * 3]! + up.y * pos[cell * 3 + 1]! + up.z * pos[cell * 3 + 2]!;
          for (let j = 0; j < ncount[st.cell]!; j++) { const nb = neighbors[st.cell * 6 + j]!; const d = up.x * pos[nb * 3]! + up.y * pos[nb * 3 + 1]! + up.z * pos[nb * 3 + 2]!; if (d > best) { best = d; cell = nb; } }
          if (elevation[cell]! <= seaLevel + 0.01) continue;
          const central = ring < 0.3;
          let kind: Building;
          if (st.tech < 0.3) kind = 'hut';
          else if (st.tech < 0.6) kind = central && h3 < 0.25 ? 'hall' : h3 < 0.2 ? 'hut' : 'house';
          else if (st.tech < 0.85) kind = central ? (h3 < 0.45 ? 'tower' : 'hall') : h3 < 0.12 ? 'tower' : 'house';
          else kind = central ? (h3 < 0.3 ? 'spire' : h3 < 0.75 ? 'tower' : 'dome') : h3 < 0.25 ? 'tower' : h3 < 0.35 ? 'dome' : 'house';
          const sz = (kind === 'hut' ? 0.00026 : kind === 'house' ? 0.00034 : kind === 'hall' ? 0.00044 : kind === 'dome' ? 0.0006 : 0.00046) * boost * (0.8 + 0.5 * h3);
          // face along the ring, like buildings along a street
          this.put(kind, up, a + (h3 < 0.5 ? 0 : Math.PI / 2) + (h1 - 0.5) * 0.3, sz, h2, lit, st.tech, tint, light);
          total++;
        }
      }
      for (const [k, s] of this.slots) {
        if (k === 'boat') continue;
        s.mesh.count = s.n;
        s.iDir.needsUpdate = true; // one shared buffer: this uploads all of the instance data
      }
    }
    // ---- boats: a few on every sea lane, sailing back and forth
    const boats = this.slots.get('boat')!;
    boats.n = 0;
    const a = new Vector3(), b = new Vector3(), p = new Vector3(), f = new Vector3();
    const view = Math.cos(Math.min(0.6, 0.1 + dist));
    for (let li = 0; li < this.lanes.length && boats.n < boats.cap; li++) {
      const lane = this.lanes[li]!;
      if (lane.length < 3) continue;
      const fleet = 1 + (lane.length > 14 ? 1 : 0) + (lane.length > 30 ? 1 : 0);
      for (let k = 0; k < fleet; k++) {
        // there and back again
        const phase = (time * 0.012 * (0.7 + 0.6 * hash(li * 31 + k)) / Math.max(4, lane.length) * 10 + k / fleet + hash(li)) % 2;
        const back = phase > 1;
        const t = (back ? 2 - phase : phase) * (lane.length - 1);
        const i0 = Math.min(lane.length - 2, Math.floor(t)), ft = t - i0;
        a.set(pos[lane[i0]! * 3]!, pos[lane[i0]! * 3 + 1]!, pos[lane[i0]! * 3 + 2]!);
        b.set(pos[lane[i0 + 1]! * 3]!, pos[lane[i0 + 1]! * 3 + 1]!, pos[lane[i0 + 1]! * 3 + 2]!);
        p.copy(a).lerp(b, ft).normalize();
        if (p.dot(focus) < view) continue;
        f.copy(b).sub(a);
        if (back) f.negate();
        f.addScaledVector(p, -f.dot(p)).normalize();
        this.put('boat', p, 0, 0.0007 * boost, hash(li * 97 + k * 13), 1, 0.7, [0.6, 0.5, 0.4], [1.0, 0.8, 0.5], f);
      }
    }
    boats.mesh.count = boats.n;
    boats.iDir.needsUpdate = true;
  }
}
