// Creatures: low-poly bodies generated from genomes, animated in the vertex shader,
// and placed near the camera from the real populations around it.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute,
  type InterleavedBufferAttribute,
  InstancedMesh, Matrix4, MeshBasicNodeMaterial, OctahedronGeometry, Quaternion, Vector3, type PerspectiveCamera, type Texture,
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
import type { GroundSampler } from './gfx/ground';
import { addCreatureInstanceData, buildCreatureModel } from './gfx/creaturemesh';
import { Copies } from './gfx/packed';
import { makeCreatureMaterial } from './gfx/creatureskin';
import type { PlanetData } from './gfx/planetdata';
import { eclipseAt } from './gfx/eclipse';

/* eslint-disable @typescript-eslint/no-explicit-any */

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const CAP = 384;
// Body length on screen, in planet radii, from the size gene. Living things are drawn far larger than life against
// the terrain so they can be seen at all; these keep animals in proportion to the trees (a big animal's body is about
// a third of a tall tree, where it used to equal one, which made herds look like giants among saplings).
const ANIMAL_BASE = 0.00045, ANIMAL_SPAN = 0.0023;

interface Slot { mesh: Copies; iPos: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; iTint: InterleavedBufferAttribute; used: number; }

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
  /** Direction of the herd this one chases (hunters) or flees (prey), or null. */
  rival: Vector3 | null;
  hunter: boolean;
  migrate: number;
  echo: boolean;
  /** Sleeps underground through the cold season. */
  hibernates: boolean;
  /** A young one keeps close behind this parent. */
  parent?: Individual;
}

export class CreatureLayer {
  private slots = new Map<number, Slot>();
  private species = new Map<number, SpeciesInfo>();
  private regions: Regions;
  individuals: Individual[] = [];
  private cells?: CellSnapshot;
  budget: number;
  onMesh?: (mesh: Copies) => void;
  /** Where the moon is and how big (w = radius), for eclipses. */
  moonBody = { x: 9, y: 0, z: 0, w: 0 };
  onArc?: (pos: Vector3, size: number) => void;
  private isElectric(id: number): boolean { const g = this.species.get(id)?.genes; return !!g && g[G.Electric]! > 0.6 && g[G.Water]! > 0.6; }
  /** A moving animal disturbs the ground or water: kind 0 wake, 1 dust, 2 splash. */
  onStep?: (pos: Vector3, kind: number, size: number) => void;
  private herdSig = '';
  /** -1..1 season signal for migration (0 at high time speeds). */
  season = 0;
  private chase = 0;
  mounds?: InstancedMesh;
  private moundData: { ind: Individual; size: number; hive: boolean }[] = [];


  private material: MeshBasicNodeMaterial;

  constructor(private grid: Grid, budget: number, private ground: GroundSampler, data: PlanetData, erosionTex: Texture, cloudShadow: (p: any) => any) {
    this.material = makeCreatureMaterial(data, erosionTex, cloudShadow);
    this.budget = budget;
    this.regions = buildRegions(grid);
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
    let genes = info.genes;
    if (larval) {
      // the young of a metamorphosing species look nothing like the adults: a soft, limbless grub
      genes = info.genes.slice();
      genes[G.LimbPairs] = 0; genes[G.Neck] = 0; genes[G.Horn] = 0; genes[G.Armor] = 0; genes[G.Ornament] = 0; genes[G.Tail] = 0.15;
      genes[G.Segments] = 1; genes[G.BodyRatio] = 0.8; genes[G.EyeCount] = 0.2; genes[G.Hue] = (genes[G.Hue]! + 0.12) % 1; genes[G.PatternType] = 0.3;
    }
    const model = buildCreatureModel(genes);
    const geo = model.geometry;
    // all per-animal data shares one buffer (WebGPU allows 8 vertex buffers per draw)
    const { iPos, iQuat, iData, iTint } = addCreatureInstanceData(model, CAP);
    const mesh = new Copies(geo, this.material, CAP);
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
          size: ANIMAL_BASE + ANIMAL_SPAN * Math.pow(info.genes[G.Size]!, 1.3), social: info.genes[G.Sociality]!, fed: h.fed[i]!,
          pos: home.clone(), fwd: e1.clone(), moving: 0, cell, night: info.genes[G.Nocturnal]!,
          larva: info.genes[G.Metamorphosis]! > 0.6 && hash(key * 53 + 7) < 0.35,
          rival: null, hunter: info.genes[G.Diet]! > 0.6, migrate: info.genes[G.Migration]!, echo: info.genes[G.Echo]! > 0.6,
          hibernates: info.genes[G.Burrow]! > 0.5 && info.genes[G.Metabolism]! < 0.55 && medium === 1,
        });
        // species that care for their young are seen with them: one or two small ones close behind a parent
        if (info.genes[G.Care]! > 0.6 && medium !== 2 && k % 3 === 0 && !list[list.length - 1]!.larva) {
          const parent = list[list.length - 1]!;
          const broods = 1 + (hash(key * 91 + 3) < 0.5 ? 1 : 0);
          for (let y = 0; y < broods; y++) list.push({ ...parent, key: (key + 0x20000000 + y * 0x1000000) | 0, size: parent.size * 0.45, pos: home.clone(), fwd: e1.clone(), parent, h: parent.h + 0.013 * (y + 1) });
        }
      }
    }
    // hunters and prey that share a region are paired: the chase is on now and then
    const byRegion = new Map<number, Individual[]>();
    for (const ind of list) { const l = byRegion.get(ind.region) ?? []; l.push(ind); byRegion.set(ind.region, l); }
    for (const group of byRegion.values()) {
      const hunter = group.find((x) => x.hunter && x.medium !== 2);
      if (!hunter) continue;
      const prey = group.find((x) => !x.hunter && x.medium === hunter.medium && x.size < hunter.size * 2.5);
      if (!prey) continue;
      for (const ind of group) {
        if (ind.species === hunter.species) ind.rival = prey.home;
        else if (ind.species === prey.species) ind.rival = hunter.home;
      }
    }
    this.layoutMounds(list);
    this.individuals = list;
    this.herdSig = sig;
  }

  /** Development aid: drop a varied set of made-up species around a point. */
  debugSpawn(dir: Vector3): void {
    const rng = new RNG(12345);
    const species = new Map<number, SpeciesInfo>();
    const archetypes: Partial<Record<number, number>>[] = [
      { [G.Size]: 0.5, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.6, [G.Neck]: 0.2, [G.Tail]: 0.4, [G.Water]: 0.05, [G.Diet]: 0.1, [G.Sociality]: 0.9, [G.EyeCount]: 0.34, [G.Insulation]: 0.9, [G.PatternType]: 0.6, [G.Care]: 0.9 },
      { [G.Size]: 0.75, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.8, [G.Neck]: 0.95, [G.Tail]: 0.5, [G.Water]: 0.05, [G.Diet]: 0.05, [G.Sociality]: 0.5, [G.EyeCount]: 0.34 },
      { [G.Size]: 0.45, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.5, [G.Tail]: 0.7, [G.Water]: 0.05, [G.Diet]: 0.95, [G.Sociality]: 0.7, [G.Horn]: 0.1, [G.EyeCount]: 0.34, [G.PatternType]: 0.4 },
      { [G.Size]: 0.3, [G.LimbType]: 0.9, [G.LimbPairs]: 0.3, [G.LimbLength]: 0.7, [G.Tail]: 0.4, [G.Water]: 0.05, [G.Diet]: 0.4, [G.Sociality]: 0.8, [G.EyeCount]: 0.34, [G.Insulation]: 0.8 },
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

  /** Nests of caring parents and the mounds of hive species, one per group. */
  private layoutMounds(list: Individual[]): void {
    if (!this.mounds) {
      const material = new MeshBasicNodeMaterial();
      material.colorNode = (attribute('color', 'vec3') as any).mul(surfaceLight(normalize(normalLocal), positionWorld) as any);
      // a rounded heap rather than a faceted cone: more sides, and the smooth normals of the indexed shape
      const geo = new ConeGeometry(0.5, 1, 14, 3).translate(0, 0.5, 0);
      const col = new Float32Array(geo.attributes.position!.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = 0.36; col[i + 1] = 0.26; col[i + 2] = 0.17; }
      geo.setAttribute('color', new BufferAttribute(col, 3));
      this.mounds = new InstancedMesh(geo, material, 256);
      this.mounds.frustumCulled = false;
      this.mounds.count = 0;
      this.onMesh?.(this.mounds);
    }
    const seen = new Set<number>();
    this.moundData = [];
    for (const ind of list) {
      const key = ind.region * 1000 + ind.species;
      if (seen.has(key) || ind.medium !== 1 || this.moundData.length >= 256) continue;
      const info = this.species.get(ind.species);
      if (!info) continue;
      const hive = info.genes[G.Sociality]! > 0.8 && info.genes[G.Size]! < 0.3;
      const nest = info.genes[G.Care]! > 0.55;
      if (!hive && !nest) continue;
      seen.add(key);
      // Sized from the animals that build them: a hive stands about twice as tall as its builders are long, and a
      // nest is a low ring about one body wide. (Fixed sizes made hives taller than the trees around them.)
      this.moundData.push({ ind, size: hive ? ind.size * 1.5 : ind.size * 0.9, hive });
    }
  }

  clear(): void {
    this.individuals = [];
    for (const s of this.slots.values()) s.mesh.count = 0;
  }

  /** Remove meshes of species that have died out. */
  prune(): Copies[] {
    const gone: Copies[] = [];
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

  /** Height of the ground under a direction, from the shared ground sampler. */
  private groundRadius(ind: Individual, dir: Vector3): number {
    ind.cell = this.ground.cellAt(dir.x, dir.y, dir.z, ind.cell);
    return this.ground.radiusAt(dir.x, dir.y, dir.z, ind.cell);
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
    // seasonal migration: wandering species follow the summer toward the pole and back
    out.copy(ind.home).addScaledVector(ind.e1, x).addScaledVector(ind.e2, y + (ind.migrate > 0.5 ? this.season * 0.012 * ind.migrate : 0));
    if (ind.rival) {
      // every so often the hunters close in and the prey herd bolts the other way
      const pulse = Math.pow(Math.max(0, Math.sin(0.045 * t + herd * 9)), 4);
      this.chase = pulse;
      const k = ind.hunter ? 0.75 * pulse : -0.5 * pulse;
      out.addScaledVector(ind.rival, k).addScaledVector(ind.home, -k);
    }
    out.normalize();
  }

  /** Move everyone and fill the instance buffers. */
  update(time: number, dist: number, sunDir: Vector3): void {
    if (!this.cells) return;
    for (const s of this.slots.values()) s.used = 0;
    if (dist > 0.16 || !this.individuals.length) {
      for (const s of this.slots.values()) s.mesh.count = 0;
      return;
    }
    const a = new Vector3(), b = new Vector3(), fwd = new Vector3(), up = new Vector3(), right = new Vector3();
    const m = new Matrix4(), q = new Quaternion();
    const sea = 1 + uSeaKm.value * EXAG;
    // a little larger with distance so a herd still reads from above, then gone: from far off animals were only
    // specks scattered over land, ice and sea
    const boost = 1 + Math.min(1.2, dist * 9);
    const farFade = Math.max(0, Math.min(1, (0.16 - dist) / 0.05));
    for (const ind of this.individuals) {
      const slot = this.slot(ind.larva ? -ind.species - 1 : ind.species);
      if (!slot || slot.used >= CAP) continue;
      // hibernators are underground while it is winter where they live
      if (ind.hibernates && Math.abs(ind.home.y) > 0.4 && this.season * Math.sign(ind.home.y) < -0.45) continue;
      // the young walk where the parent walked a moment ago
      const src = ind.parent ?? ind;
      const lag = ind.parent ? 0.7 + (ind.h - ind.parent.h) * 40 : 0;
      this.place(src, time - lag, a);
      this.place(src, time - lag + 0.4, b);
      fwd.copy(b).sub(a);
      const speed = fwd.length() / 0.4;
      up.copy(a);
      fwd.addScaledVector(up, -fwd.dot(up));
      if (fwd.lengthSq() < 1e-14) fwd.copy(ind.e1);
      fwd.normalize();
      right.crossVectors(fwd, up).normalize();
      // nocturnal animals lie low by day, and day animals by night
      const sun = a.x * sunDir.x + a.y * sunDir.y + a.z * sunDir.z;
      // in the moon's shadow, day animals stop and settle as if night had come
      const dark = this.moonBody.w > 0 && sun > 0 && eclipseAt(a, sunDir, this.moonBody, this.moonBody.w) < 0.35;
      const asleep = ind.night > 0.6 ? sun > 0.1 && !dark : ind.night < 0.3 ? sun < -0.15 || dark : dark;
      const size = ind.size * boost * (ind.larva ? 0.5 : 1) * farFade;
      if (size <= 0) continue;
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
      // animals that hunt with electricity crackle now and then
      if (this.onArc && dist < 0.06 && Math.random() < 0.012 && this.isElectric(ind.species)) this.onArc(ind.pos, size);
      // dust at the feet of walkers, wakes and splashes where swimmers break the surface
      if (this.onStep && dist < 0.07 && ind.moving > 0.5 && Math.random() < 0.02 + size * 6) {
        if (ind.medium === 1) this.onStep(ind.pos, r <= sea + 1e-7 ? 2 : 1, size);
        else if (ind.medium === 0 && sea - r < size * 0.9) this.onStep(a.clone().multiplyScalar(sea), 0, size);
      }
    }
    if (this.mounds) {
      const mm = new Matrix4(), mq = new Quaternion(), mp = new Vector3(), ms = new Vector3(), Y = new Vector3(0, 1, 0);
      this.moundData.forEach((d, i) => {
        mp.copy(d.ind.home);
        const r = this.groundRadius(d.ind, mp);
        mq.setFromUnitVectors(Y, mp);
        // nothing is built on water: a home on the shore can lie below the tide line
        const sc = r <= sea + 1e-7 ? 0 : d.size * boost;
        ms.set(sc, sc * (d.hive ? 1.4 : 0.35), sc);
        mm.compose(mp.clone().multiplyScalar(r), mq, ms);
        this.mounds!.setMatrixAt(i, mm);
      });
      this.mounds.count = this.moundData.length;
      this.mounds.instanceMatrix.needsUpdate = true;
    }
    for (const s of this.slots.values()) {
      s.mesh.count = s.used;
      if (s.used) {
        s.iPos.needsUpdate = true; // one shared buffer: this uploads all of the instance data
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

  /** A few echolocating animals near the camera, for drawing their sound as ripples. */
  echoers(max: number): Individual[] {
    const out: Individual[] = [];
    for (const ind of this.individuals) { if (ind.echo && out.length < max && hash(ind.key + ((performance.now() / 900) | 0)) < 0.08) out.push(ind); }
    return out;
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
  else if (ind.rival && ind.moving > 0.8) action = hunter ? 'chasing prey' : 'fleeing a hunter';
  else if (ind.moving > 0.65) action = hunter ? 'stalking' : ind.fed < 0.8 ? 'searching for food' : 'walking with the herd';
  else action = hunter ? 'resting' : 'grazing';
  void sizeMetres;
  if (isGolden(ind.key)) action += ' (a rare golden one)';
  return { name, age, action };
}
