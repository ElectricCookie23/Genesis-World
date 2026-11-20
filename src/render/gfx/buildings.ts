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
  abs, attribute, cameraPosition, cos, cross, dot, float, floor, fract, max, min, mix, normalGeometry, normalize, positionGeometry, positionWorld, sin, smoothstep, step,
  varying, vec2, vec3,
} from 'three/tsl';
import type { Grid } from '../../sim/world';
import type { CellSnapshot, SettlementInfo } from '../../shared/protocol';
import { EXAG, uHazeTint, uMoonDir, uSeaKm, uSunDir, uTime } from '../common';
import { uLook } from './look';
import { settlementSize, type Nation } from './nations';
import { MAX_PLOTS, buildingSites, planCity, stageOf, watchable, type CityPlan, type CitySite, type District, type Site } from './cityplan';
import type { PlanetData } from './planetdata';
import type { GroundSampler } from './ground';
import { standing } from '../../sim/history/decay';
import { architectureOf, borrowFashion, builtTech, builtYear, fashionOf, materialOf, type Architecture, type Fashion } from './architecture';
import type { SpeciesInfo } from '../../shared/protocol';
import { groundRadiusNode } from './terrain';
import { eclipseLight } from './eclipse';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const PART = { wall: 0, roof: 1, windows: 2, flame: 3, sail: 4, hull: 5, road: 6, water: 7 } as const;
export const BUILDINGS = ['hut', 'house', 'hall', 'tower', 'dome', 'spire', 'temple', 'boat', 'road', 'wall', 'gate', 'scaffold', 'hoist', 'crane', 'worker', 'rail', 'canal', 'arch', 'pole', 'pipe', 'pylon'] as const;
/** The models that lie along the ground corner by corner (streets, walls and everything built between towns). */
const DRAPED = new Set<string>(['road', 'wall', 'rail', 'canal', 'arch', 'pole', 'pipe', 'pylon']);
/** What is drawn for each kind of network between towns (system E15), and how far to the side of the road it runs, in plan units. */
const NETWORK_MODEL: { model: (typeof BUILDINGS)[number]; aside: number; every: number }[] = [
  { model: 'road', aside: 0, every: 1 }, { model: 'arch', aside: -0.5, every: 1 }, { model: 'canal', aside: -1.1, every: 1 }, { model: 'rail', aside: 0.75, every: 1 },
  { model: 'pole', aside: 1.35, every: 1 }, { model: 'pipe', aside: -1.75, every: 1 }, { model: 'pylon', aside: 2.1, every: 2 },
];
/** Where the roof of each kind begins, in the units its model is drawn in. */
const EAVES: Partial<Record<(typeof BUILDINGS)[number], number>> = { hut: 0.42, house: 0.5, hall: 0.75, tower: 2.3, dome: 0.5, spire: 1.6 };
/** How tall each kind of building stands, in the units its model is drawn in: what scaffolding has to reach. */
export const HEIGHT: Partial<Record<(typeof BUILDINGS)[number], number>> = { hut: 1.0, house: 0.92, hall: 1.25, tower: 2.55, dome: 1.2, spire: 4.3, temple: 1.72 };
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
  // Under every building is the post it would stand on if its builders lifted their floors (system E13): below the
  // ground, and so unseen, for everyone else. And in its front wall a doorway, which is as tall as its builders make it.
  if (HEIGHT[kind] !== undefined && kind !== 'temple') {
    for (const [x, z] of [[-0.24, -0.18], [0.24, -0.18], [-0.24, 0.18], [0.24, 0.18]] as [number, number][]) s.box(x, -2.2, z, 0.07, 2.2, 0.07, PART.hull, PART.hull);
    const front = kind === 'hut' ? 0.47 : kind === 'house' ? 0.36 : kind === 'hall' ? 0.46 : kind === 'tower' ? 0.32 : kind === 'dome' ? 0.71 : 0.5;
    s.box(0, 0, front, 0.16, 0.3, 0.03, PART.hull, PART.hull);
  }
  switch (kind) {
    case 'hut':
      s.ring(0, 0, 0, 0.45, 0.42, 0.45, 9, PART.wall);
      s.ring(0, 0, 0.42, 0.6, 1.0, 0, 9, PART.roof);
      // a cooking fire by the door: at night a village is points of firelight, not dark boxes
      s.ring(0.72, 0.18, 0, 0.09, 0.24, 0, 5, PART.flame);
      break;
    case 'house':
      // windowed walls, so that houses show lamplight at night like the larger buildings
      s.box(0, 0, 0, 1.0, 0.5, 0.7, PART.windows);
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
    case 'road':
      // one stretch of street, a plan unit long (+x): a low slab that lies on the ground
      s.box(0, 0, 0, 1.1, 0.03, 0.36, PART.road, PART.road);
      break;
    case 'wall':
      // one stretch of town wall with a walk along the top and three merlons
      s.box(0, 0, 0, 1.06, 0.5, 0.2, PART.wall, PART.wall);
      for (const x of [-0.36, 0, 0.36]) s.box(x, 0.5, 0.06, 0.16, 0.12, 0.08, PART.wall, PART.wall);
      break;
    case 'scaffold': {
      // poles and ledgers round a building one unit high: the shader stretches it to the height of what it stands round
      const w = 0.72, d = 0.6, t = 0.03;
      for (const [x, z] of [[-w, -d], [w, -d], [-w, d], [w, d], [0, -d], [0, d]] as [number, number][]) s.box(x, 0, z, t, 1.04, t, PART.hull, PART.hull);
      for (const y of [0.24, 0.5, 0.76, 1.0]) {
        for (const z of [-d, d]) s.box(0, y, z, w * 2 + t, t, t, PART.hull, PART.hull);
        for (const x of [-w, w]) s.box(x, y, 0, t, t, d * 2 + t, PART.hull, PART.hull);
      }
      // a ramp of planks up one side
      s.box(0, 0.24, -d - 0.06, w * 2, 0.012, 0.1, PART.sail, PART.sail);
      s.box(0, 0.5, d + 0.06, w * 2, 0.012, 0.1, PART.sail, PART.sail);
      break;
    }
    case 'hoist':
      // a timber crane: a post, a jib braced back to it and a treadwheel at its foot
      s.box(0, 0, 0, 0.07, 1.9, 0.07, PART.hull, PART.hull);
      s.box(0.42, 1.82, 0, 0.9, 0.06, 0.06, PART.hull, PART.hull);
      s.box(-0.2, 1.5, 0, 0.36, 0.05, 0.05, PART.hull, PART.hull);
      s.ring(-0.16, 0, 0.02, 0.3, 0.12, 0.3, 10, PART.hull);
      s.box(0.84, 1.2, 0, 0.02, 0.62, 0.02, PART.sail, PART.sail);
      break;
    case 'crane':
      // a tower crane: a mast, a long jib with its load line, a short counter-jib with its weight, a cab
      s.box(0, 0, 0, 0.11, 3.5, 0.11, PART.wall, PART.wall);
      s.box(0.95, 3.46, 0, 2.1, 0.07, 0.08, PART.wall, PART.wall);
      s.box(-0.45, 3.46, 0, 0.7, 0.07, 0.08, PART.wall, PART.wall);
      s.box(-0.72, 3.26, 0, 0.2, 0.2, 0.16, PART.hull, PART.hull);
      s.box(0.06, 3.2, 0.1, 0.16, 0.2, 0.14, PART.windows, PART.wall);
      s.box(1.6, 2.5, 0, 0.02, 0.96, 0.02, PART.hull, PART.hull);
      break;
    case 'rail':
      // a stretch of railway: sleepers and two rails
      for (const x of [-0.42, -0.14, 0.14, 0.42]) s.box(x, 0, 0, 0.07, 0.02, 0.32, PART.wall, PART.wall);
      for (const z of [-0.1, 0.1]) s.box(0, 0.02, z, 1.1, 0.025, 0.03, PART.hull, PART.hull);
      break;
    case 'canal':
      // a stretch of canal: water between two banks, and a towpath
      s.box(0, 0, 0, 1.1, 0.015, 0.42, PART.water, PART.water);
      for (const z of [-0.26, 0.26]) s.box(0, 0, z, 1.1, 0.04, 0.1, PART.road, PART.road);
      break;
    case 'arch':
      // one span of an aqueduct: two piers, the arch between them, the channel on top
      for (const x of [-0.5, 0.5]) s.box(x, 0, 0, 0.14, 0.72, 0.2, PART.wall, PART.wall);
      s.box(0, 0.62, 0, 1.1, 0.12, 0.2, PART.wall, PART.wall);
      s.box(0, 0.74, 0, 1.1, 0.02, 0.1, PART.water, PART.water);
      break;
    case 'pole':
      // a telegraph pole with its crossbar and the wire to the next
      s.box(0, 0, 0, 0.035, 0.7, 0.035, PART.hull, PART.hull);
      s.box(0, 0.62, 0, 0.03, 0.03, 0.2, PART.hull, PART.hull);
      for (const z of [-0.08, 0.08]) s.box(0, 0.65, z, 1.1, 0.008, 0.008, PART.hull, PART.hull);
      break;
    case 'pipe':
      // a stretch of pipeline on its cradles
      s.box(0, 0.07, 0, 1.1, 0.1, 0.1, PART.wall, PART.wall);
      for (const x of [-0.35, 0.35]) s.box(x, 0, 0, 0.06, 0.07, 0.16, PART.hull, PART.hull);
      break;
    case 'pylon':
      // a power pylon: a tapering tower, two cross-arms, and the lines to the next (two plan units on)
      s.box(0, 0, 0, 0.16, 0.7, 0.16, PART.wall, PART.wall);
      s.box(0, 0.7, 0, 0.1, 0.9, 0.1, PART.wall, PART.wall);
      for (const y of [1.2, 1.5]) s.box(0, y, 0, 0.04, 0.04, y > 1.3 ? 0.5 : 0.7, PART.wall, PART.wall);
      for (const z of [-0.33, 0.33]) s.box(0, 1.2, z, 2.2, 0.01, 0.01, PART.hull, PART.hull);
      for (const z of [-0.23, 0.23]) s.box(0, 1.5, z, 2.2, 0.01, 0.01, PART.hull, PART.hull);
      break;
    case 'worker':
      // one of the builders, seen from far above: a body and a head
      s.box(0, 0, 0, 0.3, 0.62, 0.22, PART.roof, PART.roof);
      s.box(0, 0.62, 0, 0.2, 0.2, 0.2, PART.sail, PART.sail);
      break;
    case 'gate':
      // two towers either side of the road and a lintel over it
      for (const z of [-0.42, 0.42]) { s.box(0, 0, z, 0.4, 0.95, 0.34, PART.wall, PART.wall); s.box(0, 0.95, z, 0.48, 0.12, 0.42, PART.wall, PART.roof); }
      s.box(0, 0.55, 0, 0.3, 0.22, 0.5, PART.wall, PART.wall);
      break;
  }
  return s.build();
}

interface Slot { mesh: Copies; iDir: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; iTint: InterleavedBufferAttribute; iLight: InterleavedBufferAttribute; iForm: InterleavedBufferAttribute; iWall: InterleavedBufferAttribute; iStyle: InterleavedBufferAttribute; cap: number; n: number; }

/** A colour turned round the colour wheel by a share of a full turn, and made lighter or darker. */
export function turnHue(c: readonly number[], turn: number, tone: number): number[] {
  // rotate about the grey axis
  const a = turn * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a), k = (1 - cs) / 3, q = Math.sqrt(1 / 3) * sn;
  const r = c[0]!, g = c[1]!, b = c[2]!;
  const out = [r * (cs + k) + g * (k - q) + b * (k + q), r * (k + q) + g * (cs + k) + b * (k - q), r * (k - q) + g * (k + q) + b * (cs + k)];
  return out.map((v) => Math.max(0, Math.min(1, v * tone)));
}

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export interface TownInfo extends SettlementInfo { temple?: boolean }

/** How many plots a town of this many people (thousands) and this knowledge fills. */
export function townPlots(pop: number, tech: number): number {
  const size = settlementSize(pop);
  return Math.min(MAX_PLOTS, Math.round(5 + 300 * size * size * (0.3 + 0.7 * tech)));
}

/** What stands on a plot: by its quarter, how near the middle it is, and how far the town has come. `r` is the plot's own luck. */
export function buildingFor(district: District, central: number, era: number, r: number, arch?: Architecture): Building {
  const kind = plainBuilding(district, central, era, r);
  if (!arch) return kind;
  // Builders who dig, or who are at home in water, build round and low: no towers until their engineers insist,
  // and domes where others raise halls. Fliers want height from the start: their homes are towers to perch on.
  const lowly = arch.round > 0.6 || arch.lift < -0.2;
  if (lowly && (kind === 'tower' || kind === 'spire') && era < 0.9) return 'dome';
  if (lowly && kind === 'house' && r > 0.55) return 'hut';
  if (lowly && kind === 'hall' && r > 0.5) return 'dome';
  if (arch.flier > 0.5 && kind === 'house' && era >= 0.3 && r < 0.35 + 0.25 * arch.flier) return 'tower';
  return kind;
}

function plainBuilding(district: District, central: number, era: number, r: number): Building {
  if (era < 0.3) return district === 'market' && r < 0.2 && era > 0.22 ? 'house' : 'hut';
  if (district === 'market') return era < 0.6 ? (r < 0.5 ? 'hall' : 'house') : era < 0.85 ? (r < 0.4 ? 'tower' : 'hall') : r < 0.3 ? 'spire' : r < 0.8 ? 'tower' : 'dome';
  if (district === 'temple') return era < 0.6 ? (r < 0.6 ? 'hall' : 'house') : r < 0.5 ? 'dome' : 'hall';
  if (district === 'docks') return r < 0.55 ? 'hall' : 'house';
  if (district === 'workshops') return era < 0.6 ? (r < 0.3 ? 'hall' : r < 0.45 ? 'hut' : 'house') : era < 0.85 ? (r < 0.5 ? 'hall' : 'house') : r < 0.2 ? 'tower' : r < 0.7 ? 'hall' : 'house';
  // homes: houses, with the odd hut at the edge of an early town and towers toward the middle of a late one
  if (era < 0.6) return central < 0.25 && r < 0.3 ? 'hut' : 'house';
  if (era < 0.85) return central > 0.55 && r < 0.18 ? 'tower' : 'house';
  return central > 0.45 && r < 0.4 ? 'tower' : r > 0.95 ? 'dome' : 'house';
}

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
      const slotCap = boat ? 96 : kind === 'house' || kind === 'road' ? cap : kind === 'hut' || kind === 'wall' ? Math.ceil(cap / 2) : kind === 'rail' || kind === 'canal' || kind === 'arch' || kind === 'pole' || kind === 'pipe' || kind === 'pylon' ? Math.ceil(cap / 8) : kind === 'temple' || kind === 'gate' ? 64 : kind === 'scaffold' || kind === 'hoist' || kind === 'crane' ? 48 : kind === 'worker' ? 160 : Math.ceil(cap / 4);
      const g = buildBuilding(kind);
      // per-building data in one shared buffer (WebGPU allows 8 vertex buffers per draw; separately these made 9)
      const { iDir, iQuat, iData, iTint, iLight, iForm, iWall, iStyle } = packAttributes(g, [
        { name: 'iDir', size: 3 }, { name: 'iQuat', size: 4 }, { name: 'iData', size: 4 }, // iData: size, seed, share of windows lit at night, technology
        { name: 'iTint', size: 3 }, { name: 'iLight', size: 3 },
        // how its builders build (system E13): height and width as multiples of the plain model, floor lifted on posts
        // (positive) or sunk (negative), how far out into the water they will build; and what their walls are made of
        { name: 'iForm', size: 4 }, { name: 'iWall', size: 3 },
        // its style: how steep its roof, how many windows, how much ornament
        { name: 'iStyle', size: 3 },
      ], slotCap, { instanced: true, dynamic: true }) as { iDir: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; iTint: InterleavedBufferAttribute; iLight: InterleavedBufferAttribute; iForm: InterleavedBufferAttribute; iWall: InterleavedBufferAttribute; iStyle: InterleavedBufferAttribute };
      const material = new MeshBasicNodeMaterial({ side: DoubleSide });
      const aDir: N = attribute('iDir', 'vec3'), aQuat: N = attribute('iQuat', 'vec4'), aData: N = attribute('iData', 'vec4');
      // boats ride the sea, rocking a little; everything else stands on the ground
      const bobbing = sin(uTime.mul(1.3).add(aData.y.mul(40))).mul(0.000006);
      const radius: N = boat ? float(1).add(uSeaKm.mul(EXAG)).add(bobbing) : groundRadiusNode(data, erosionTex, aDir);
      const base: N = aDir.mul(radius);
      const roll: N = boat ? (vec3 as any)(0, sin(uTime.mul(1.1).add(aData.y.mul(30))).mul(0.06).mul((positionGeometry as any).z), 0) : vec3(0, 0, 0);
      // Nothing is built in the water. Sites are chosen by the nearest cell, but the drawn ground is blended between
      // cells and can dip under the tide inside a land cell: such a building shrinks to nothing (huts stood half
      // under water in the surf).
      const aForm: N = attribute('iForm', 'vec4');
      const shaped = HEIGHT[kind] !== undefined;
      // A people of the water builds out into the shallows (system E13): its buildings stand where the bottom is a
      // little under the surface, with their floors no deeper than a part of their own height.
      const seaR: N = float(1).add(uSeaKm.mul(EXAG));
      const depthOk: N = shaped ? aForm.w.mul(0.00011) : float(0);
      const dry: N = boat ? float(1) : step(seaR.add(0.00002).sub(depthOk), radius);
      if (DRAPED.has(kind)) {
        // Streets and walls lie along the ground: every corner finds the ground under itself, where a building
        // stands level on the ground under its middle. (As rigid slabs, stretches of road on a slope were half
        // buried and a street read as a row of dashes.)
        // A stretch whose middle is under water is not drawn at all, and a corner that would fall in the water is
        // pulled back to the middle of its stretch. (Seen on a real GPU: paving running off the shore into the sea.)
        const local: N = rotate((positionGeometry as any).mul(aData.x).mul(dry), aQuat);
        const lift: N = dot(local, aDir);
        const flat: N = local.sub(aDir.mul(lift));
        const shore: N = float(1).add(uSeaKm.mul(EXAG)).add(0.00002);
        const reach: N = groundRadiusNode(data, erosionTex, normalize(aDir.add(flat)));
        const above: N = step(shore, reach);
        const under: N = normalize(aDir.add(flat.mul(above)));
        material.positionNode = under.mul(mix(radius, reach, above).add(lift.mul(above)).add(0.000003));
      } else {
        let geo: N = (positionGeometry as any).add(roll);
        if (HEIGHT[kind] !== undefined) {
          // A building under construction (system E12) carries how far along it is as a negative number where a
          // finished one carries its share of lit windows. It is drawn up to that height and no further: the
          // foundation first, the walls rising, the roof closing over last.
          // the roof first, as steep as its builders like it: everything above the eaves is stretched
          const eave = EAVES[kind] ?? HEIGHT[kind]!;
          const aStyle: N = attribute('iStyle', 'vec3');
          geo = (vec3 as any)(geo.x, (min as any)(geo.y, eave).add((max as any)(geo.y.sub(eave), 0).mul(aStyle.x)), geo.z);
          // then its builders' proportions (system E13): as tall and as wide as they build
          geo = geo.mul((vec3 as any)(aForm.y, aForm.x, aForm.y));
          const built: N = aData.z.negate().mul(HEIGHT[kind]! * 1.02).mul(aForm.x);
          const rising: N = step(aData.z, -0.0005);
          geo = (vec3 as any)(geo.x, (min as any)(geo.y, mix(float(1e3), built, rising)), geo.z);
          // then its floor is lifted on its posts, or sunk into the ground so that only the top shows
          // (a lift is a height in model units; a sink is a share of the building's own height, so that a mound always shows)
          geo = geo.add((vec3 as any)(0, mix(aForm.z, aForm.z.mul(aForm.x).mul(HEIGHT[kind]!), step(aForm.z, 0)), 0));
        } else if (kind === 'scaffold') {
          // as tall as what it stands round
          geo = geo.mul((vec3 as any)(1, aData.w, 1));
        } else if (kind === 'hoist' || kind === 'crane') {
          // the jib swings slowly back and forth over the work
          const a: N = sin(uTime.mul(0.4).add(aData.y.mul(40))).mul(0.9);
          geo = (vec3 as any)(geo.x.mul(cos(a)).add(geo.z.mul(sin(a))), geo.y, geo.z.mul(cos(a)).sub(geo.x.mul(sin(a))));
        } else if (kind === 'worker') {
          // builders going to and fro along the front of the site
          geo = geo.add((vec3 as any)(sin(uTime.mul(1.1).add(aData.y.mul(50))).mul(2.6), 0, sin(uTime.mul(0.7).add(aData.y.mul(31))).mul(0.9)));
        }
        // (standing in the shallows, a building's floor is at the surface less a part of its height, not on the bottom)
        const stand: N = shaped ? (max as any)(radius, seaR.sub(aData.x.mul(HEIGHT[kind] ?? 1).mul(aForm.x).mul(0.45))) : radius;
        material.positionNode = aDir.mul(stand).add(rotate(geo.mul(aData.x).mul(dry), aQuat));
      }
      const nW: N = varying(normalize(rotate(normalGeometry, aQuat)));
      const vPart: N = varying(attribute('bpart', 'float'));
      const vUv: N = varying(attribute('buv', 'vec2'));
      const vData: N = varying(aData);
      const vTint: N = varying(attribute('iTint', 'vec3')), vLight: N = varying(attribute('iLight', 'vec3'));
      const vBase: N = varying(base);
      const is = (k: number): N => step(abs(vPart.sub(k)), 0.5);
      const tech: N = vData.w;
      // walls go from mud and timber to stone to pale composite as a people learns to build
      // (system E13) what the land gives: a town's walls are of its own material while it is young, dressed stone
      // of the same cast in its middle ages, and keep a memory of it under the pale composites of a late age
      const local: N = varying(attribute('iWall', 'vec3'));
      const wall: N = mix(mix(local, mix(vec3(0.56, 0.54, 0.5), local, 0.45), smoothstep(0.25, 0.6, tech)), mix(vec3(0.78, 0.8, 0.82), local, 0.22), smoothstep(0.75, 0.98, tech))
        .mul(fract(vData.y.mul(7.3)).mul(0.3).add(0.82));
      const roof: N = mix(vec3(0.42, 0.34, 0.18), vTint.mul(0.55).add(0.08), smoothstep(0.3, 0.55, tech));
      // windows: a grid on the wall; each pane is lit or dark for the whole night
      // (system E13) a people that wants many windows cuts them closer together
      const vStyle: N = varying(attribute('iStyle', 'vec3'));
      const wUv: N = (vec2 as any)(vUv.x.mul(vStyle.y), vUv.y);
      const cell: N = floor(wUv);
      const inPane = step(0.22, fract(wUv.x)).mul(step(fract(wUv.x), 0.78)).mul(step(0.3, fract(vUv.y))).mul(step(fract(vUv.y), 0.8));
      const paneRnd = fract(sin(dot(cell.add(vData.y.mul(91)), vec2(127.1, 311.7))).mul(43758.5453));
      const litPane = step(paneRnd, vData.z).mul(inPane);
      const glass = inPane.mul(is(PART.windows));
      const up: N = normalize(vBase);
      const L: N = uSunDir, M: N = uMoonDir;
      const sunH = dot(up, L);
      const day = smoothstep(-0.12, 0.22, sunH);
      const night = float(1).sub(day);
      let albedo: N = wall.mul(is(PART.wall).add(is(PART.windows))).add(roof.mul(is(PART.roof))).add(vec3(0.86, 0.82, 0.7).mul(is(PART.sail))).add(vec3(0.2, 0.14, 0.1).mul(is(PART.hull)))
        // streets go from trodden earth to paving as a people learns to build
        .add(mix(vec3(0.4, 0.32, 0.22), vec3(0.47, 0.46, 0.44), smoothstep(0.4, 0.75, tech)).mul(is(PART.road)))
        // water in a canal or an aqueduct's channel
        .add(vec3(0.16, 0.36, 0.52).mul(is(PART.water)));
      albedo = mix(albedo, vec3(0.06, 0.08, 0.1), glass.mul(0.85));
      // and one that decorates bands every floor of its walls in its own colour
      albedo = mix(albedo, vTint.mul(0.6).add(0.12), vStyle.z.mul(0.75).mul(step(0.86, fract(vUv.y))).mul(is(PART.wall).add(is(PART.windows))));
      const sunColor: N = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.05, 0.4, sunH));
      const sunVis = smoothstep(-0.08, 0.1, sunH).mul(cloudShadow(vBase)).mul(eclipseLight(vBase));
      const sky: N = mix(vec3(uHazeTint), vec3(0.6, 0.6, 0.6), 0.45).mul(0.4).mul(day).mul(dot(nW, up).mul(0.35).add(0.65));
      const moon: N = vec3(uLook.moon).mul(0.05).mul(max(dot(nW, M), 0).mul(0.7).add(0.3)).mul(smoothstep(-0.1, 0.25, dot(up, M))).mul(night);
      const V: N = normalize(cameraPosition.sub(positionWorld));
      const glint = (max as any)(dot(V.add(L).normalize(), nW), 0).pow(60).mul(glass).mul(sunVis).mul(1.2);
      let color: N = albedo.mul(sunColor.mul(max(dot(nW, L), 0).mul(0.85).add(0.15)).mul(sunVis).mul(1.1).add(sky).add(moon).add(vec3(0.012, 0.016, 0.022))).add(sunColor.mul(glint));
      // lamplight in the nation's colour; fires burn day and night
      const flicker = sin(uTime.mul(9).add(vData.y.mul(60))).mul(0.2).add(0.85);
      color = color.add(vLight.mul(litPane.mul(is(PART.windows))).mul(night).mul(1.8))
        .add(mix(vec3(3.4, 1.3, 0.25), vLight.mul(2.6), smoothstep(0.45, 0.75, tech)).mul(is(PART.flame)).mul(flicker).mul(night.mul(0.8).add(0.35)));
      material.colorNode = color;
      const mesh = new Copies(g, material, slotCap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.slots.set(kind, { mesh, iDir, iQuat, iData, iTint, iLight, iForm, iWall, iStyle, cap: slotCap, n: 0 });
    }
  }

  setCells(cells: CellSnapshot): void {
    this.cells = cells;
  }

  /** What is being built in each town drawn lately (system E12): for the info card. */
  readonly sites = new Map<number, { what: string; progress: number; years: number; stage: string }[]>();
  private lastYear = -1;
  private lastBuilt = 0;

  private byId = new Map<number, TownInfo>();

  /** The species on record: what a town's builders are like (system E13). */
  species: Map<number, SpeciesInfo> | null = null;
  private form: number[] = [1, 1, 0, 0];
  private wallColour: number[] = [0.5, 0.38, 0.27];
  private style: number[] = [1, 1, 0];
  private builders = new Map<number, Architecture>();

  /** How the builders of a town build, and of what: for the info card (system E13). */
  architecture(st: TownInfo): { arch: Architecture; material: string } | null {
    const arch = this.architectureFor(st.species);
    return arch && this.cells ? { arch, material: this.materialAt(st, arch).name } : null;
  }

  private architectureFor(species: number): Architecture | null {
    const known = this.builders.get(species);
    if (known) return known;
    const sp = this.species?.get(species);
    if (!sp) return null;
    const a = architectureOf(sp.genes);
    this.builders.set(species, a);
    return a;
  }

  private materialAt(st: TownInfo, arch: Architecture): ReturnType<typeof materialOf> {
    const c = this.cells!, i = st.cell;
    let coast = false;
    for (let j = 0; j < this.grid.ncount[i]!; j++) if (c.elevation[this.grid.neighbors[i * 6 + j]!]! <= c.seaLevel) coast = true;
    return materialOf({ temperature: c.temperature[i]!, moisture: c.moisture[i]!, canopy: c.canopy[i]!, height: c.elevation[i]! - c.seaLevel, coast, river: Math.min(1, c.flow[i]! * 4) }, arch.swimmer);
  }

  /** The drawn ground, sampled here on the page: where the shore really is and which way the land rises. */
  ground: GroundSampler | null = null;

  /** Plans of the towns drawn lately, by settlement id, each with the facts it was drawn from. */
  private plans = new Map<number, { key: string; plan: CityPlan; checked: number; wet: Map<number, boolean>; sea: number }>();
  /** A town being replayed from its first huts: which, since when (seconds) and over how long. */
  private lapse: { id: number; start: number; seconds: number } | null = null;

  /** Replay the growth of one town from nothing to what it is now (system E11). */
  timelapse(id: number, seconds = 16): void {
    // (by the clock on the wall: the scene's own clock runs slow when frames are slow, and a replay must still end)
    this.lapse = { id, start: performance.now() / 1000, seconds };
    this.dirty = true;
  }

  /** True while a time-lapse is running: the towns are then redrawn every frame. */
  get lapsing(): boolean { return !!this.lapse; }

  /**
   * The plan of a town, from where it stands and what has happened to it: the roads lead toward its
   * neighbours, the shore is where the sea is, the land rises where it rises. Kept until those facts change.
   */
  private planFor(st: TownInfo, c: Vector3, east: Vector3, north: Vector3, nat: Nation | undefined, cells: CellSnapshot, wade = 0): { plan: CityPlan; wet: Map<number, boolean> } {
    // (the ground is read again every few seconds at most: a town is redrawn many times a second while its building
    // sites are being watched, and the shore does not move that fast)
    const now = performance.now();
    const known = this.plans.get(st.id);
    if (known && now - known.checked < 4000 && Math.abs(known.sea - cells.seaLevel) < 1e-4) return known;
    const { pos, neighbors, ncount } = this.grid;
    const { elevation, seaLevel } = cells;
    const local = (i: number): [number, number, number] => {
      const dx = pos[i * 3]! - c.x, dy = pos[i * 3 + 1]! - c.y, dz = pos[i * 3 + 2]! - c.z;
      const e = dx * east.x + dy * east.y + dz * east.z, n = dx * north.x + dy * north.y + dz * north.z;
      return [e, n, Math.hypot(e, n)];
    };
    // the nearest other towns, its own nation's first: roads lead to them
    const near: { a: number; d: number }[] = [];
    for (const o of this.settlements) {
      if (o.id === st.id || o.ruined >= 0) continue;
      const dot = pos[o.cell * 3]! * c.x + pos[o.cell * 3 + 1]! * c.y + pos[o.cell * 3 + 2]! * c.z;
      if (dot < 0.955) continue;
      const [e, n, d] = local(o.cell);
      near.push({ a: Math.atan2(n, e), d: d * (o.nation === st.nation ? 0.7 : 1) });
    }
    near.sort((a, b) => a.d - b.d);
    // the sea, and the lie of the land, from the cells around
    let wx = 0, wy = 0, shore = Infinity, gx = 0, gy = 0, steep = 0;
    const here = elevation[st.cell]!;
    for (let j = 0; j < ncount[st.cell]!; j++) {
      const nb = neighbors[st.cell * 6 + j]!;
      const [e, n, d] = local(nb);
      if (elevation[nb]! <= seaLevel) { wx += e / d; wy += n / d; shore = Math.min(shore, (d * 0.5) / 0.00062); }
      else { const rise = elevation[nb]! - here; gx += (e / d) * rise; gy += (n / d) * rise; steep = Math.max(steep, Math.abs(rise)); }
    }
    const g = this.ground;
    if (g) {
      // look outward along sixteen bearings for the nearest water, and feel which way the ground rises
      wx = 0; wy = 0; shore = Infinity; gx = 0; gy = 0; steep = 0;
      const U0 = 0.00062, probe = new Vector3();
      const high = (x: number, y: number): number => { probe.copy(c).addScaledVector(east, x * U0).addScaledVector(north, y * U0).normalize(); return g.heightAt(probe.x, probe.y, probe.z, g.cellAt(probe.x, probe.y, probe.z, st.cell)) - g.sea; };
      const centre = high(0, 0);
      for (let b = 0; b < 16; b++) {
        const a = (b / 16) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        for (let r = 2; r <= 26; r += 2) if (high(ca * r, sa * r) <= 0.012) { if (r < shore - 0.5) { shore = r; wx = ca; wy = sa; } else if (r < shore + 2.5) { wx += ca * 0.5; wy += sa * 0.5; } break; }
        const rise = high(ca * 6, sa * 6) - centre;
        if (rise > -0.5) { gx += ca * rise; gy += sa * rise; steep = Math.max(steep, Math.abs(rise) * 0.25); }
      }
    }
    const coastal = Number.isFinite(shore);
    const walls: number[] = [];
    for (let i = 0; st.walls && i + 1 < st.walls.length; i += 2) walls.push(townPlots(st.walls[i]!, st.walls[i + 1]!));
    const site: CitySite = {
      seed: (st.id * 2654435761) >>> 0,
      roads: near.slice(0, 4).map((x) => Math.round(x.a * 8) / 8),
      coast: coastal ? Math.round(Math.atan2(wy, wx) * 8) / 8 : 0,
      // (a people of the water counts the shallows as ground to build on: its plan reaches out past the shore)
      shore: coastal ? Math.max(2, Math.round(shore) - 1) + Math.round(5 * wade) : Infinity,
      uphill: Math.round(Math.atan2(gy, gx) * 8) / 8,
      slope: Math.round(Math.min(1, steep * 2.5) * 10) / 10,
      temple: !!st.temple, port: coastal && (!!st.overseas || st.tech > 0.36 || wade > 0.3), capital: !!nat && nat.capital === st.id, walls,
    };
    const key = JSON.stringify(site);
    const have = this.plans.get(st.id);
    if (have && have.key === key && Math.abs(have.sea - cells.seaLevel) < 1e-4) { have.checked = now; return have; }
    const made = { key, plan: planCity(site), checked: now, wet: new Map<number, boolean>(), sea: cells.seaLevel };
    if (this.plans.size > 96) this.plans.delete(this.plans.keys().next().value as number);
    this.plans.set(st.id, made);
    return made;
  }

  /** Settlements, the nations they belong to, and the sea lanes (chains of cells) boats follow. */
  setTowns(settlements: TownInfo[], nations: Nation[], lanes: number[][]): void {
    this.settlements = settlements;
    this.byId.clear();
    for (const s of settlements) this.byId.set(s.id, s);
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
    const f = this.form, w = this.wallColour;
    s.iForm.setXYZW(i, f[0]!, f[1]!, f[2]!, f[3]!);
    s.iWall.setXYZ(i, w[0]!, w[1]!, w[2]!);
    const look = this.style;
    s.iStyle.setXYZ(i, look[0]!, look[1]!, look[2]!);
  }
  private static q = new Quaternion();
  private static y = new Quaternion();
  private static Y = new Vector3(0, 1, 0);
  private static tmp = new Vector3();
  private static tmp2 = new Vector3();
  private static m: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  /** Rebuild the towns near the camera when it moves; boats move every frame. */
  update(focus: Vector3, dist: number, time: number, simYear = 0, yearsPerSecond = 0): void {
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
    const wall = performance.now() / 1000;
    if (this.lapse && wall - this.lapse.start > this.lapse.seconds + 0.5) { this.lapse = null; this.dirty = true; }
    // building sites are worth drawing from close by, while time runs slowly enough to watch them: then the towns
    // are redrawn as the work advances, a dozen times a second at most
    const working = dist < 0.14 && yearsPerSecond <= 3.01;
    if (working && Math.abs(simYear - this.lastYear) > 0.0008 && wall - this.lastBuilt > 0.12) this.dirty = true;
    if (moved || this.dirty || this.lapse) {
      this.dirty = false;
      this.lastYear = simYear; this.lastBuilt = wall;
      this.sites.clear();
      this.lastFocus.copy(focus);
      this.lastDist = dist;
      for (const [k, s] of this.slots) if (k !== 'boat') s.n = 0;
      const reachCos = Math.cos(Math.min(0.5, 0.08 + dist * 0.7));
      const up = new Vector3(), east = new Vector3(), north = new Vector3(), c = new Vector3(), fwd = new Vector3();
      let total = 0;
      for (const st of this.settlements) {
        if (total >= this.budget) continue;
        // A town no one lives in still stands, for a while (system E18): fewer of its buildings each century, and
        // less of each. Plants do not keep clear of it, so the forest comes up through its streets.
        const left = st.ruined >= 0 ? standing(Math.max(0, simYear - st.ruined), st.tech) : null;
        if (left && (left.share <= 0.02 || st.tech < 0.3)) continue;
        c.set(pos[st.cell * 3]!, pos[st.cell * 3 + 1]!, pos[st.cell * 3 + 2]!);
        if (c.dot(focus) < reachCos) continue;
        const nat = this.nationOf.get(st.id);
        const tint = nat ? nat.signature : [0.6, 0.4, 0.3];
        const light = nat ? nat.color : [1.0, 0.5, 0.14];
        const size = settlementSize(left ? st.peak ?? st.pop : st.pop);
        east.set(-c.z, 0, c.x).normalize();
        north.crossVectors(c, east);
        // about half the windows at most: with four in five lit and bright, every tower wore a wide pink halo at night
        const lit = left ? 0 : st.tech < 0.3 ? 0.15 : Math.min(0.55, 0.22 + 0.3 * st.tech);
        // What gets built follows how many people there are as well as what they know: a few hundred farmers with
        // advanced neighbours do not raise tower blocks and domes. (Seen on a real GPU: a town of 503 drawn as a
        // modern skyline.) Small places stay huts, houses and a hall whatever the age.
        // A time-lapse (system E11) replays the same town from its first huts to what it is now.
        const lapse = this.lapse && this.lapse.id === st.id ? Math.min(1, Math.max(0, wall - this.lapse.start) / this.lapse.seconds) : 1;
        const eraNow = Math.min(st.tech, 0.15 + size * 0.95);
        const era = lapse < 1 ? Math.min(eraNow, 0.12 + (eraNow - 0.12) * Math.pow(lapse, 0.8)) : eraNow;
        // ---- the town is laid out on its plan: roads, streets, plots in the order they were built, walls
        // ---- how these builders build, and with what (system E13)
        const arch = this.architectureFor(st.species);
        const stuff = arch ? this.materialAt(st, arch) : null;
        const plain = [1, 1, 0, 0];
        const shapedForm = arch ? [arch.rise, arch.girth, arch.lift, arch.wade] : plain;
        this.wallColour = stuff ? stuff.wall : [0.5, 0.38, 0.27];
        const ownStyle = arch ? [arch.pitch, arch.windows, arch.ornament] : [1, 1, 0];
        this.style = ownStyle;
        // ---- the fashion of the day (system E14): each plot is built in the style of the years it was built in,
        // so the middle of an old town is old and its edge is new. Fashions are worked out a lifetime at a time.
        const culture = nat?.cultureId ?? st.species * 7919 + 5, lender = nat?.fashionFrom ?? -1, lent = nat?.fashionShare ?? 0;
        const fashions = new Map<number, { style: number[]; tint: number[] }>();
        const fashionAt = (year: number): { style: number[]; tint: number[] } => {
          const span = Math.floor(year / 40);
          let f = fashions.get(span);
          if (!f) {
            let fashion: Fashion = fashionOf(culture, span * 40);
            if (lender >= 0 && lent > 0) fashion = borrowFashion(fashion, fashionOf(lender, span * 40), lent);
            f = { style: [Math.max(0.5, Math.min(2.4, ownStyle[0]! * fashion.pitch)), Math.max(0.5, Math.min(2, ownStyle[1]! * fashion.windows)), Math.max(0, Math.min(1, ownStyle[2]! + fashion.ornament))], tint: turnHue(tint, fashion.hue, fashion.tone) };
            fashions.set(span, f);
          }
          return f;
        };
        const nowYear = Math.max(simYear, st.founded);
        // (a ruin's roofs and walls go the colour of moss and lichen as it stands)
        const mossy = left ? [tint[0]! * left.share * 0.5 + 0.2 * (1 - left.share), tint[1]! * left.share * 0.5 + 0.3 * (1 - left.share), tint[2]! * left.share * 0.5 + 0.17 * (1 - left.share)] : tint;
        if (left) this.wallColour = this.wallColour.map((v, i) => v * (0.5 + 0.4 * left.share) + [0.1, 0.14, 0.08][i]! * (1 - left.share));
        this.form = plain;
        const laid = this.planFor(st, c, east, north, nat, cells!, arch ? arch.wade : 0);
        const plan = laid.plan, wetAt = laid.wet;
        // (a people that lives packed together builds its streets closer)
        const U = 0.00062 * boost * (arch ? arch.spacing : 1);
        const full = Math.min(plan.plots.length, townPlots(left ? st.peak ?? st.pop : st.pop, st.tech));
        const count = Math.max(lapse < 1 ? 3 : 0, Math.round(full * lapse * lapse));
        let px = 0, py = 0;
        const at = (x: number, y: number): Vector3 => { px = x; py = y; return up.copy(c).addScaledVector(east, x * U).addScaledVector(north, y * U).normalize(); };
        const toward = (h: number): Vector3 => fwd.copy(east).multiplyScalar(Math.cos(h)).addScaledVector(north, Math.sin(h));
        // (streets and walls keep to dry land; buildings of a people that wades may stand in the shallows)
        let shallows = false;
        const wet = (): boolean => {
          // by the ground as it is drawn, where that can be sampled (and remembered for this place in this town); else by the nearest cell
          if (this.ground) {
            const k = Math.round(px * 4) * 8192 + Math.round(py * 4) + Math.round(boost * 8) * 67108864 + (shallows ? 1073741824 : 0);
            let w = wetAt.get(k);
            if (w === undefined) { w = this.ground.heightAt(up.x, up.y, up.z, this.ground.cellAt(up.x, up.y, up.z, st.cell)) <= this.ground.sea + 0.012 - (shallows ? 0.1 * (arch ? arch.wade : 0) : 0); wetAt.set(k, w); }
            return w;
          }
          let cell = st.cell, best = up.x * pos[cell * 3]! + up.y * pos[cell * 3 + 1]! + up.z * pos[cell * 3 + 2]!;
          for (let j = 0; j < ncount[st.cell]!; j++) { const nb = neighbors[st.cell * 6 + j]!; const d = up.x * pos[nb * 3]! + up.y * pos[nb * 3 + 1]! + up.z * pos[nb * 3 + 2]!; if (d > best) { best = d; cell = nb; } }
          return elevation[cell]! <= seaLevel + 0.01;
        };
        if (st.temple && plan.temple && lapse > 0.3 && (!left || left.share > 0.25)) { at(plan.temple[0], plan.temple[1]); this.put('temple', up, hash(st.id * 31) * 6.28, 0.0009 * boost, hash(st.id), lit, st.tech, tint, light); total++; }
        // streets: a stretch of road for every step of every street the town has reached (lanes stay footpaths)
        for (const street of plan.streets) {
          if (street.order > count || street.rank > 1 || (left && left.share < 0.75)) continue;
          const pts = street.points;
          // a road out of town is only made as far as the town has grown along it
          const made = street.rank === 0 ? Math.min(pts.length - 1, 2 + Math.ceil(Math.sqrt(count) * 1.25)) : pts.length - 1;
          for (let i = 1; i <= made; i++) {
            const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
            at((x0 + x1) / 2, (y0 + y1) / 2);
            if (wet()) continue;
            this.put('road', up, 0, U, 0.5, 0, era, tint, light, toward(Math.atan2(y1 - y0, x1 - x0)));
          }
        }
        // walls: each as it was built, round the town of its day, with gates where the roads go through
        for (const wall of plan.walls) {
          if (wall.order > count || (left && left.share < 0.35)) continue;
          const pts = wall.points;
          for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
            if (Number.isNaN(x0) || Number.isNaN(x1)) continue;
            // (not across a gateway)
            const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
            if (wall.gates.some((g) => (g[0] - mx) * (g[0] - mx) + (g[1] - my) * (g[1] - my) < 0.5)) continue;
            // in stretches about a plan unit long, however far apart the corners of the wall are
            const len = Math.hypot(x1 - x0, y1 - y0), parts = Math.max(1, Math.round(len)), heading = Math.atan2(y1 - y0, x1 - x0);
            for (let k = 0; k < parts; k++) {
              const t = (k + 0.5) / parts;
              at(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
              if (!wet()) this.put('wall', up, 0, U * (len / parts), 0.3, 0, era, tint, light, toward(heading));
            }
          }
          for (const g of wall.gates) { at(g[0], g[1]); if (!wet()) this.put('gate', up, 0, U * 1.25, 0.7, 0, era, tint, light, toward(Math.atan2(g[1], g[0]))); }
        }
        // ---- what joins this town to others (system E15): each kind runs out of town toward the town it leads to, beside the road
        if (st.links && lapse >= 1 && dist < 0.2 && !left) {
          let edge = 4;
          for (let k = 0; k < count; k += 7) edge = Math.max(edge, Math.hypot(plan.plots[k]!.x, plan.plots[k]!.y));
          const seen = new Set<number>();
          for (let i = 0; i + 1 < st.links.length; i += 2) {
            const other = this.byId.get(st.links[i]!), kindOf = st.links[i + 1]!;
            const how = NETWORK_MODEL[kindOf];
            if (!other || !how || seen.has(other.id * 8 + kindOf)) continue;
            seen.add(other.id * 8 + kindOf);
            // which way, and how far: half way to the other town at most (it draws its own half), a good stretch at least
            const dx = pos[other.cell * 3]! - c.x, dy = pos[other.cell * 3 + 1]! - c.y, dz = pos[other.cell * 3 + 2]! - c.z;
            const e = dx * east.x + dy * east.y + dz * east.z, nn = dx * north.x + dy * north.y + dz * north.z;
            const heading = Math.atan2(nn, e), reach = Math.min(edge + 30, Math.max(edge + 6, (Math.hypot(e, nn) / U) * 0.5));
            const sx = Math.cos(heading + Math.PI / 2) * how.aside, sy = Math.sin(heading + Math.PI / 2) * how.aside;
            // an aqueduct comes right into the middle of town; the rest begin at its edge (roads within it are streets already)
            for (let r = kindOf === 1 ? 1.6 : kindOf === 0 ? edge : Math.max(2, edge * 0.5); r < reach; r += how.every) {
              at(Math.cos(heading) * r + sx, Math.sin(heading) * r + sy);
              if (wet()) continue;
              this.put(how.model, up, 0, U, 0.5, 0, era, tint, light, toward(heading));
            }
          }
        }
        // ---- what is being built just now (system E12): each crew at one plot, at its stage
        const jobs: Site[] = working && lapse >= 1 && !left ? buildingSites(st.id * 7919 + 13, count, simYear, (i) => plan.plots[i]!.central).filter((j) => watchable(j, yearsPerSecond)) : [];
        const shown: { what: string; progress: number; years: number; stage: string }[] = [];
        const raise = (kind: Building, sz: number, seed: number, progress: number, heading: number, x: number, y: number): void => {
          // scaffolding to the height the work has reached, a crane of the age beside anything tall, builders in the street
          const tall = (HEIGHT[kind] ?? 1) * (arch ? arch.rise : 1);
          this.form = arch ? [1, arch.girth, Math.max(0, arch.lift), 0] : plain;
          this.put('scaffold', up, 0, sz * (kind === 'dome' || kind === 'hall' || kind === 'temple' ? 1.45 : 1), seed, 0, tall * Math.min(1, progress + 0.2), tint, light, toward(heading));
          if (kind !== 'hut' && kind !== 'house' && progress < 0.96) { at(x + Math.cos(heading + 2.2) * 0.62, y + Math.sin(heading + 2.2) * 0.62); this.put(era >= 0.85 ? 'crane' : 'hoist', up, 0, sz * (era >= 0.85 ? 1 : 0.8) * Math.max(0.8, tall / (era >= 0.85 ? 3 : 1.7)), seed, 0, era, tint, light, toward(heading)); }
          this.form = plain;
          for (let w = 0; w < (kind === 'hut' ? 2 : 4); w++) { at(x + Math.cos(heading) * 0.5 + Math.cos(heading + 1.57) * (w - 1.5) * 0.22, y + Math.sin(heading) * 0.5 + Math.sin(heading + 1.57) * (w - 1.5) * 0.22); this.put('worker', up, 0, 0.00006 * boost, hash(seed * 977 + w * 31 + st.id), 0, era, tint, light, toward(heading + 1.57)); }
        };
        // great works (system E10): each one built stands on its place near the square; in a golden age the next is going up
        const works = Math.min(plan.monuments.length, st.monuments ?? 0);
        for (let m = 0; m < plan.monuments.length && lapse >= 1; m++) {
          const [mx, my] = plan.monuments[m]!;
          const going = m === works && !!nat?.golden && working && !left;
          if (m >= works && !going) break;
          at(mx, my);
          if (wet()) continue;
          this.form = shapedForm;
          const kind: Building = m % 2 ? 'dome' : 'spire', sz = 0.00094 * boost, seed = hash(st.id * 53 + m * 7), heading = Math.atan2(-my, -mx);
          // a great work takes a generation: thirty years, which is how often the chronicle records one in a golden age
          const progress = going ? Math.max(0.04, (simYear / 30 + hash(st.id * 3 + m)) % 1) : 1;
          this.put(kind, up, 0, sz, seed, going ? -progress : left ? -Math.max(0.08, left.height) : lit, Math.max(era, 0.5), left ? mossy : tint, light, toward(heading));
          if (going) { raise(kind, sz, seed, progress, heading, mx, my); shown.push({ what: `a great ${kind}`, progress, years: 30, stage: stageOf(progress) }); }
          total++;
        }
        for (let k = 0; k < count && total < this.budget; k++) {
          const plot = plan.plots[k]!;
          const h3 = hash(st.id * 1299709 + k * 7), h2 = hash(st.id * 104729 + k * 17);
          at(plot.x, plot.y);
          // not in the sea (unless its builders wade)
          shallows = true;
          const drowned = wet();
          shallows = false;
          if (drowned) continue;
          const kind = buildingFor(plot.district, plot.central, era, h3, arch ?? undefined);
          this.form = shapedForm;
          const job = jobs.length ? jobs.find((j) => j.plot === k) : undefined;
          // built in the fashion of its day, of the stuff its builders could then work (what is going up now is of today)
          const look = fashionAt(job ? nowYear : builtYear(k, count, st.founded, nowYear));
          const age = job ? era : Math.min(era, builtTech(k, count, era));
          this.style = look.style;
          // towers and spires stand above the trees and the largest animals (on a real GPU, animals on the skyline were
          // as tall as tower blocks, and from low altitude the blocks read as pins)
          const sz = (kind === 'hut' ? 0.00028 : kind === 'house' ? 0.0004 : kind === 'hall' ? 0.00048 : 0.00064) * boost * (0.85 + 0.3 * h3) * (arch ? arch.scale : 1);
          // it faces its street
          if (job) {
            const progress = Math.max(0.04, job.progress);
            this.put(kind, up, 0, sz, h2, -progress, age, look.tint, light, toward(plot.yaw));
            at(plot.x, plot.y);
            this.style = ownStyle;
            raise(kind, sz, h2, progress, plot.yaw, plot.x, plot.y);
            shown.push({ what: `a ${kind} in the ${plot.district === 'homes' ? 'streets of houses' : plot.district === 'market' ? 'market' : plot.district === 'temple' ? 'temple quarter' : plot.district}`, progress, years: job.years, stage: stageOf(progress) });
          } else if (left) {
            // what still stands of it: some buildings are gone altogether, the rest are broken off at some height
            if (h3 * 0.999 < left.share) this.put(kind, up, 0, sz, h2, -Math.max(0.08, left.height * (0.55 + 0.9 * hash(st.id * 31 + k * 13))), Math.min(age, 0.55), mossy, light, toward(plot.yaw));
          } else this.put(kind, up, 0, sz, h2, lit, age, look.tint, light, toward(plot.yaw));
          this.style = ownStyle;
          total++;
        }
        this.form = plain;
        if (shown.length) this.sites.set(st.id, shown);
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
