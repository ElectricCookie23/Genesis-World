// Things that stand about the world and are drawn from made models just as their makers painted them: the fire and
// tents of a camp, rows of crops and a mill by a farming town, boats lying off a town on the coast, the wreck in the
// shallows of a ruined port, rocks on bare ground and the bones of something large in a desert.
//
// Nothing here belongs to the simulation: where each thing stands is worked out from the towns and the ground, the
// same way every time. A kind whose model has not been added is simply not drawn.
import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicNodeMaterial, Quaternion, Vector3, type InterleavedBufferAttribute, type Texture } from 'three/webgpu';
import { attribute, cameraPosition, cross, dot, float, length, normalGeometry, normalize, positionGeometry, positionWorld, sin, smoothstep, step, uniform, varying, vec3 } from 'three/tsl';
import type { Grid } from '../../sim/world';
import type { CellSnapshot, SettlementInfo } from '../../shared/protocol';
import { EXAG, uSeaKm, uSunDir, uTime } from '../common';
import { plantLight } from './flora';
import type { Model } from './models';
import { settlementSize } from './nations';
import { Copies, packAttributes } from './packed';
import type { PlanetData } from './planetdata';
import { groundRadiusNode } from './terrain';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** How a kind of thing meets the world: standing on dry ground, riding the sea, or lying where the two meet. */
type Rest = 'ground' | 'float' | 'shore';

export const PROPS = {
  fire: { rest: 'ground', cap: 96 }, tent: { rest: 'ground', cap: 320 }, tentSmall: { rest: 'ground', cap: 320 },
  cropLeaf: { rest: 'ground', cap: 4000 }, cropGrain: { rest: 'ground', cap: 2500 }, mill: { rest: 'ground', cap: 48 },
  rowboat: { rest: 'float', cap: 160 }, sailboat: { rest: 'float', cap: 160 }, ship: { rest: 'float', cap: 96 }, steamer: { rest: 'float', cap: 64 },
  wreck: { rest: 'shore', cap: 24 },
  rockA: { rest: 'ground', cap: 500 }, rockB: { rest: 'ground', cap: 500 }, rockC: { rest: 'ground', cap: 500 }, rockD: { rest: 'ground', cap: 500 },
  spire: { rest: 'ground', cap: 96 }, bones: { rest: 'ground', cap: 48 },
} as const satisfies Record<string, { rest: Rest; cap: number }>;
export type Prop = keyof typeof PROPS;

interface Slot { mesh: Copies; iDir: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; cap: number; n: number }

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// biomes, as the simulation numbers them (see `Biome` in sim/world.ts)
const BEACH = 3, TUNDRA = 5, SHRUBLAND = 9, DESERT = 10, SAVANNA = 11, ALPINE = 14, VOLCANIC = 15, SALT = 17;

/** A made model as one of these things: its longest side one unit, standing on its base, colours as painted. */
export function propGeometry(m: Model, kind: Prop): BufferGeometry {
  const ex = m.max[0] - m.min[0], ey = m.max[1] - m.min[1], ez = m.max[2] - m.min[2];
  const k = 1 / Math.max(1e-6, ex, ey, ez);
  const cx = (m.min[0] + m.max[0]) / 2, cz = (m.min[2] + m.max[2]) / 2;
  // a boat sits a little into the water, a wreck deeper
  const sink = PROPS[kind].rest === 'float' ? ey * 0.22 : PROPS[kind].rest === 'shore' ? ey * 0.3 : 0;
  const n = m.pos.length / 3;
  const pos = new Float32Array(n * 3), glow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (m.pos[i * 3]! - cx) * k;
    pos[i * 3 + 1] = (m.pos[i * 3 + 1]! - m.min[1] - sink) * k;
    pos[i * 3 + 2] = (m.pos[i * 3 + 2]! - cz) * k;
    if (kind === 'fire') {
      // the wood of a fire glows at night; the ring of stones does not
      const r = m.col[i * 3]!, g = m.col[i * 3 + 1]!, b = m.col[i * 3 + 2]!;
      glow[i] = Math.max(r, g, b) - Math.min(r, g, b) > 0.08 * (Math.max(r, g, b) + 0.05) ? 1 : 0;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(m.nrm.slice(), 3));
  g.setAttribute('color', new BufferAttribute(m.col.slice(), 3));
  g.setAttribute('glow', new BufferAttribute(glow, 1));
  g.setIndex(new BufferAttribute(m.idx.slice(), 1));
  return g;
}

export class Props {
  readonly meshes: Copies[] = [];
  /** Called with each mesh as its model arrives, so the scene can add it. */
  onMesh?: (mesh: Copies) => void;
  /** The camera distance beyond which none of this is drawn. */
  readonly uShow = uniform(0.3);
  private slots = new Map<Prop, Slot>();
  private cells?: CellSnapshot;
  private towns: SettlementInfo[] = [];
  private dirty = true;
  private lastFocus = new Vector3(9, 9, 9);
  private lastDist = 0;
  private lastBuild = 0;
  private static q = new Quaternion();
  private static yaw = new Quaternion();
  private static Y = new Vector3(0, 1, 0);
  private static up = new Vector3();

  constructor(private grid: Grid, private data: PlanetData, private erosionTex: Texture, private cloudShadow: (p: N) => N) {}

  /** How many of each kind stand now (for checks). */
  counts(): Record<string, number> { const o: Record<string, number> = {}; for (const [k, s] of this.slots) o[k] = s.n; return o; }

  /** Start drawing a kind of thing from this model. */
  add(kind: Prop, model: Model): void {
    if (this.slots.has(kind)) return;
    const { rest, cap } = PROPS[kind];
    const g = propGeometry(model, kind);
    const { iDir, iQuat, iData } = packAttributes(g, [{ name: 'iDir', size: 3 }, { name: 'iQuat', size: 4 }, { name: 'iData', size: 4 }], cap, { instanced: true, dynamic: true }) as { iDir: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute };
    const material = new MeshBasicNodeMaterial({ side: DoubleSide });
    const rotate = (v: N, q: N): N => v.add(cross(q.xyz, cross(q.xyz, v).add(v.mul(q.w))).mul(2));
    const aDir: N = attribute('iDir', 'vec3'), aQuat: N = attribute('iQuat', 'vec4'), aData: N = attribute('iData', 'vec4'); // size, seed
    const ground: N = groundRadiusNode(this.data, this.erosionTex, aDir);
    const seaR: N = float(1).add(uSeaKm.mul(EXAG));
    const bob = sin(uTime.mul(1.3).add(aData.y.mul(40))).mul(0.000006);
    const radius: N = rest === 'float' ? seaR.add(bob) : rest === 'shore' ? ground.max(seaR.sub(0.00003)) : ground;
    // nothing stands in the water and no boat lies on the land: where the drawn ground says otherwise it is not drawn
    const fits: N = rest === 'float' ? step(ground, seaR.sub(0.000015)) : rest === 'shore' ? float(1) : step(seaR.add(0.00002), ground);
    const base: N = aDir.mul(radius);
    const near = float(1).sub(smoothstep(this.uShow.mul(0.8), this.uShow, length(cameraPosition.sub(base))));
    const roll: N = rest === 'float' ? (vec3 as any)(0, sin(uTime.mul(1.1).add(aData.y.mul(30))).mul(0.05).mul((positionGeometry as any).z), 0) : vec3(0, 0, 0);
    material.positionNode = base.add(rotate((positionGeometry as any).add(roll).mul(aData.x).mul(fits).mul(near), aQuat));
    const nW: N = varying(normalize(rotate(normalGeometry, aQuat)));
    const vBase: N = varying(base);
    const vColor: N = varying(attribute('color', 'vec3'));
    const vGlow: N = varying(attribute('glow', 'float'));
    const vSeed: N = varying(aData.y);
    let color: N = plantLight(vColor, nW, positionWorld, float(0), float(1), this.cloudShadow(vBase));
    if (kind === 'fire') {
      const night = float(1).sub(smoothstep(-0.12, 0.22, dot(normalize(vBase), uSunDir)));
      const flicker = sin(uTime.mul(9).add(vSeed.mul(50))).mul(0.18).add(sin(uTime.mul(23).add(vSeed.mul(17))).mul(0.1)).add(0.75);
      color = color.add(vec3(1.0, 0.42, 0.1).mul(vGlow).mul(night.mul(2.2).add(0.25)).mul(flicker));
    }
    material.colorNode = color;
    const mesh = new Copies(g, material, cap);
    mesh.count = 0;
    this.slots.set(kind, { mesh, iDir, iQuat, iData, cap, n: 0 });
    this.meshes.push(mesh);
    this.onMesh?.(mesh);
    this.dirty = true;
  }

  setCells(cells: CellSnapshot): void {
    this.cells = cells;
    if (performance.now() - this.lastBuild > 3000) this.dirty = true;
  }

  setTowns(list: SettlementInfo[]): void { this.towns = list; this.dirty = true; }

  private put(kind: Prop, x: number, y: number, z: number, size: number, turn: number, seed: number): void {
    const s = this.slots.get(kind);
    if (!s || s.n >= s.cap) return;
    const l = Math.hypot(x, y, z) || 1;
    const up = Props.up.set(x / l, y / l, z / l);
    const q = Props.q.setFromUnitVectors(Props.Y, up);
    q.multiply(Props.yaw.setFromAxisAngle(Props.Y, turn));
    const i = s.n++;
    s.iDir.setXYZ(i, up.x, up.y, up.z);
    s.iQuat.setXYZW(i, q.x, q.y, q.z, q.w);
    s.iData.setXYZW(i, size, seed, 0, 0);
  }

  /** Place everything again when the camera has moved far enough, the towns have changed, or the ground has. */
  update(focus: Vector3, dist: number): void {
    if (!this.slots.size) return;
    const moved = focus.distanceTo(this.lastFocus) > 0.01 + dist * 0.05 || Math.abs(dist - this.lastDist) > 0.12 * Math.max(dist, 0.01);
    if (!moved && !this.dirty) return;
    if (!moved && performance.now() - this.lastBuild < 400) return;
    this.dirty = false;
    this.lastFocus.copy(focus);
    this.lastDist = dist;
    this.lastBuild = performance.now();
    for (const s of this.slots.values()) s.n = 0;
    const cells = this.cells;
    if (cells && dist < this.uShow.value) {
      this.aroundTowns(cells, focus, dist);
      if (dist < 0.14) this.onBareGround(cells, focus, dist);
    }
    for (const s of this.slots.values()) {
      if (s.mesh.count === 0 && s.n === 0) continue;
      s.mesh.count = s.n;
      s.iDir.needsUpdate = true; // one shared buffer: this uploads all of the instance data
    }
  }

  /** The camp's fire and tents, the fields and mill, the boats and the wreck of every town near the camera. */
  private aroundTowns(cells: CellSnapshot, focus: Vector3, dist: number): void {
    const pos = this.grid.pos, nb = this.grid.neighbors, sea = cells.seaLevel;
    // drawn larger from far off, as the buildings are, so a town still reads from above
    const boost = 1 + Math.min(1.6, dist * 3.2);
    const reach = Math.cos(Math.min(1.2, 0.08 + dist * 0.9));
    for (const st of this.towns) {
      const c = st.cell;
      const cx = pos[c * 3]!, cy = pos[c * 3 + 1]!, cz = pos[c * 3 + 2]!;
      if (cx * focus.x + cy * focus.y + cz * focus.z < reach) continue;
      // east and north at the town
      let ex = -cz, ez = cx; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
      const nx = cy * ez, ny = cz * ex - cx * ez, nz = -cy * ex;
      const at = (dx: number, dy: number): [number, number, number] => [cx + ex * dx + nx * dy, cy + ny * dy, cz + ez * dx + nz * dy];
      const size = settlementSize(st.pop);
      const R = (0.0025 + 0.02 * size * (0.25 + 0.75 * st.tech)) * boost;
      const ruined = st.ruined >= 0;
      // the sea beside it, if any
      const wet: number[] = [];
      // (and which way it lies: fields, the mill and the camp's fire are put on the landward side)
      let sx = 0, sy = 0;
      for (let k = 0; k < 6; k++) {
        const j = nb[c * 6 + k]!;
        if (j < 0 || cells.elevation[j]! >= sea) continue;
        wet.push(j);
        const jx = pos[j * 3]! - cx, jy = pos[j * 3 + 1]! - cy, jz = pos[j * 3 + 2]! - cz;
        sx += jx * ex + jz * ez; sy += jx * nx + jy * ny + jz * nz;
      }
      const seaward = Math.atan2(sy, sx);
      const inland = (a: number): number => (wet.length && Math.cos(a - seaward) > 0.2 ? 2 * seaward + Math.PI - a : a);

      if (!ruined) {
        // ---- a camp: a fire with tents round it, at the edge of the huts
        if ((st.nation ?? -1) < 0 || st.tech < 0.14) {
          const a = inland(hash(st.id * 31 + 7) * 6.283), d = R * 0.75 + 0.0007 * boost;
          const fx = Math.cos(a) * d, fy = Math.sin(a) * d;
          this.put('fire', ...at(fx, fy), 0.00018 * boost, a, hash(st.id));
          const tents = 2 + Math.floor(hash(st.id * 17 + 3) * 3);
          for (let t = 0; t < tents; t++) {
            const b = a + 1.2 + (t / tents) * 4.2, r = (0.00048 + 0.00014 * hash(st.id * 5 + t)) * boost;
            // the model's opening is turned to face the fire
            this.put(t % 2 ? 'tentSmall' : 'tent', ...at(fx + Math.cos(b) * r, fy + Math.sin(b) * r), (t % 2 ? 0.0003 : 0.0004) * boost, -b + Math.PI / 2, hash(st.id * 91 + t));
          }
        }
        // ---- fields: patches of crops in rows outside the houses, and a mill once they know how to build one
        if (st.farms) {
          const patches = 5 + Math.floor(size * 12);
          for (let p = 0; p < patches; p++) {
            const a = inland(p * 2.39996 + hash(st.id * 13) * 6.283), d = R * (1.1 + 0.5 * hash(st.id * 7 + p * 3));
            const kind: Prop = hash(st.id * 3 + p) < 0.5 ? 'cropLeaf' : 'cropGrain';
            const step = 0.00021 * boost, ca = Math.cos(a), sa = Math.sin(a);
            for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) {
              const u = (q - 2.5) * step, v = (r - 1.5) * step * 1.4;
              this.put(kind, ...at(Math.cos(a) * d + ca * v - sa * u, Math.sin(a) * d + sa * v + ca * u), 0.0003 * boost * (0.85 + 0.3 * hash(p * 97 + r * 13 + q)), a, hash(st.id + p * 31 + r * 7 + q));
            }
          }
          if (st.tech >= 0.3 && st.tech < 0.85) {
            const a = inland(hash(st.id * 43 + 1) * 6.283), d = R * 1.2;
            this.put('mill', ...at(Math.cos(a) * d, Math.sin(a) * d), 0.0015 * boost, a, hash(st.id * 3));
          }
        }
      }
      // ---- the coast: boats lying off a living town, larger as its people learn more; a wreck off a dead port
      if (wet.length) {
        const off = (k: number, t: number, side: number): [number, number, number] => {
          const j = wet[k % wet.length]!;
          const jx = pos[j * 3]!, jy = pos[j * 3 + 1]!, jz = pos[j * 3 + 2]!;
          const px = cx + (jx - cx) * t, py = cy + (jy - cy) * t, pz = cz + (jz - cz) * t;
          return [px + ex * side, py + ny * side, pz + ez * side];
        };
        if (ruined) {
          if (st.tech >= 0.35 && (st.peak ?? 0) > 3 && hash(st.id * 71) < 0.7) this.put('wreck', ...off(0, 0.5, 0), 0.0017 * boost, hash(st.id * 9) * 6.283, hash(st.id));
        } else if (st.tech >= 0.08) {
          const boats = 1 + Math.floor(size * 5);
          for (let b = 0; b < boats; b++) {
            const h = hash(st.id * 59 + b * 11);
            const kind: Prop = st.tech < 0.3 ? 'rowboat' : st.tech < 0.55 ? (h < 0.5 ? 'rowboat' : 'sailboat') : st.tech < 0.8 ? (h < 0.6 ? 'sailboat' : 'ship') : h < 0.45 ? 'steamer' : h < 0.8 ? 'sailboat' : 'ship';
            const len = kind === 'rowboat' ? 0.0007 : kind === 'sailboat' ? 0.0013 : kind === 'ship' ? 0.002 : 0.0026;
            this.put(kind, ...off(b, 0.5 + 0.28 * hash(st.id * 3 + b * 5), (hash(st.id * 7 + b * 13) - 0.5) * 0.008), len * boost, h * 6.283, h);
          }
        }
      }
    }
  }

  /** Rocks on bare ground near the camera, a stone pillar now and then in a desert, and very rarely old bones. */
  private onBareGround(cells: CellSnapshot, focus: Vector3, dist: number): void {
    const pos = this.grid.pos, nb = this.grid.neighbors, count = this.grid.count;
    // the cell under the camera's eye, then outward from it
    let best = -1, bd = -2;
    for (let i = 0; i < count; i++) { const d = pos[i * 3]! * focus.x + pos[i * 3 + 1]! * focus.y + pos[i * 3 + 2]! * focus.z; if (d > bd) { bd = d; best = i; } }
    if (best < 0) return;
    const reach = Math.cos(0.035 + dist * 0.6);
    const boost = 1 + Math.min(1.6, dist * 3.2);
    const seen = new Set<number>([best]), queue = [best];
    const rocks: Prop[] = ['rockA', 'rockB', 'rockC', 'rockD'];
    // living towns nearby keep their ground clear
    const clear: number[] = [];
    for (const st of this.towns) {
      if (st.ruined >= 0) continue;
      const x = pos[st.cell * 3]!, y = pos[st.cell * 3 + 1]!, z = pos[st.cell * 3 + 2]!;
      if (x * focus.x + y * focus.y + z * focus.z > reach - 0.01) clear.push(x, y, z, (0.0025 + 0.02 * settlementSize(st.pop) * (0.25 + 0.75 * st.tech)) * boost * 1.2);
    }
    for (let qi = 0; qi < queue.length && qi < 500; qi++) {
      const c = queue[qi]!;
      const cx = pos[c * 3]!, cy = pos[c * 3 + 1]!, cz = pos[c * 3 + 2]!;
      for (let k = 0; k < 6; k++) {
        const j = nb[c * 6 + k]!;
        if (j < 0 || seen.has(j)) continue;
        if (pos[j * 3]! * focus.x + pos[j * 3 + 1]! * focus.y + pos[j * 3 + 2]! * focus.z < reach) continue;
        seen.add(j); queue.push(j);
      }
      if (cells.elevation[c]! < cells.seaLevel) continue;
      const biome = cells.biome[c]!, bare = 1 - Math.min(1, cells.vegetation[c]!);
      const many = biome === ALPINE ? 6 : biome === VOLCANIC ? 4 : biome === DESERT || biome === SALT || biome === TUNDRA ? 3 : biome === BEACH || biome === SHRUBLAND || biome === SAVANNA ? 2 : hash(c * 11) < 0.35 ? 1 : 0;
      const n = Math.round(many * (0.4 + 0.6 * bare));
      for (let r = 0; r <= n; r++) {
        // somewhere inside the cell: part of the way toward two of its neighbours
        const a = nb[c * 6 + Math.floor(hash(c * 7 + r * 3) * 6)]!, b = nb[c * 6 + Math.floor(hash(c * 13 + r * 5) * 6)]!;
        if (a < 0 || b < 0) continue;
        const u = hash(c * 17 + r) * 0.48, v = hash(c * 29 + r * 7) * 0.48;
        const x = cx + (pos[a * 3]! - cx) * u + (pos[b * 3]! - cx) * v, y = cy + (pos[a * 3 + 1]! - cy) * u + (pos[b * 3 + 1]! - cy) * v, z = cz + (pos[a * 3 + 2]! - cz) * u + (pos[b * 3 + 2]! - cz) * v;
        let inTown = false;
        for (let t = 0; t < clear.length; t += 4) if (Math.hypot(x - clear[t]!, y - clear[t + 1]!, z - clear[t + 2]!) < clear[t + 3]!) { inTown = true; break; }
        if (inTown) continue;
        const h = hash(c * 101 + r * 37);
        if (r === n) {
          // the last place in a cell is for the rare things
          if ((biome === DESERT || biome === SALT) && h < 0.12) this.put('spire', x, y, z, (0.0016 + 0.0022 * hash(c * 3)) * boost, h * 60, h);
          else if ((biome === DESERT || biome === SALT || biome === TUNDRA) && h > 0.965) this.put('bones', x, y, z, 0.0011 * boost, h * 90, h);
          continue;
        }
        const big = biome === ALPINE && h < 0.18 ? 2.2 : 1;
        this.put(rocks[Math.floor(hash(c * 5 + r * 11) * 4)]!, x, y, z, (0.00022 + 0.00048 * h * h) * big * boost, h * 40, h);
      }
    }
  }
}
