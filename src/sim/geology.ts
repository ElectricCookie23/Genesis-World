// Terrain generation, tectonics, volcanoes, erosion, drainage, sea level.
import { RNG } from './rng';
import { fbm, makeNoise, ridged } from './noise';
import type { Plate, World } from './world';

export interface Hotspot {
  x: number; y: number; z: number;
  strength: number;
  cell: number;
}

export interface GeologyState {
  hotspots: Hotspot[];
  /** Boundary convergence per cell (positive = colliding), refreshed with tectonics. */
  convergence: Float32Array;
  /** Target ocean fraction for this seed. */
  oceanFraction: number;
}

function assignPlates(world: World, rng: RNG): void {
  const { grid } = world;
  const count = grid.count;
  const plateCount = 10 + rng.int(8);
  const plate = new Int32Array(count).fill(-1);
  const frontier: number[] = [];
  const plates: Plate[] = [];
  for (let p = 0; p < plateCount; p++) {
    let c = rng.int(count);
    while (plate[c] !== -1) c = rng.int(count);
    plate[c] = p;
    frontier.push(c);
    const [ax, ay, az] = rng.unitVector();
    plates.push({ continental: false, ax, ay, az, speed: rng.range(0.004, 0.016) });
  }
  // Randomised flood fill gives irregular, organic plate shapes.
  while (frontier.length) {
    const k = rng.int(frontier.length);
    const c = frontier[k]!;
    frontier[k] = frontier[frontier.length - 1]!;
    frontier.pop();
    const p = plate[c]!;
    const nc = grid.ncount[c]!;
    for (let j = 0; j < nc; j++) {
      const nb = grid.neighbors[c * 6 + j]!;
      if (plate[nb] === -1) {
        plate[nb] = p;
        frontier.push(nb);
      }
    }
  }
  const order = plates.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  const continentalCount = Math.max(3, Math.round(plateCount * rng.range(0.34, 0.48)));
  for (let i = 0; i < continentalCount; i++) plates[order[i]!]!.continental = true;
  for (let i = 0; i < count; i++) world.plate[i] = plate[i]!;
  world.plates = plates;
}

/** Signed plate convergence at each boundary cell. */
export function computeConvergence(world: World, out: Float32Array): void {
  const { grid, plates, plate } = world;
  const { pos, neighbors, ncount } = grid;
  out.fill(0);
  for (let i = 0; i < grid.count; i++) {
    const pi = plate[i]!;
    const A = plates[pi]!;
    const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
    let best = 0;
    for (let j = 0; j < ncount[i]!; j++) {
      const nb = neighbors[i * 6 + j]!;
      const pn = plate[nb]!;
      if (pn === pi) continue;
      const B = plates[pn]!;
      // velocity = axis x position * speed
      const vax = (A.ay * z - A.az * y) * A.speed, vay = (A.az * x - A.ax * z) * A.speed, vaz = (A.ax * y - A.ay * x) * A.speed;
      const vbx = (B.ay * z - B.az * y) * B.speed, vby = (B.az * x - B.ax * z) * B.speed, vbz = (B.ax * y - B.ay * x) * B.speed;
      let dx = pos[nb * 3]! - x, dy = pos[nb * 3 + 1]! - y, dz = pos[nb * 3 + 2]! - z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      const conv = ((vax - vbx) * dx + (vay - vby) * dy + (vaz - vbz) * dz) / 0.02;
      if (Math.abs(conv) > Math.abs(best)) best = conv;
    }
    out[i] = Math.max(-1, Math.min(1, best));
  }
}

function spread(grid: World['grid'], field: Float32Array, passes: number, decay: number): void {
  const { neighbors, ncount, count } = grid;
  const tmp = new Float32Array(count);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < count; i++) {
      let m = field[i]!;
      for (let j = 0; j < ncount[i]!; j++) {
        const v = field[neighbors[i * 6 + j]!]! * decay;
        if (v > m) m = v;
      }
      tmp[i] = m;
    }
    field.set(tmp);
  }
}

export function smoothField(grid: World['grid'], field: Float32Array, passes: number, amount: number): void {
  const { neighbors, ncount, count } = grid;
  const tmp = new Float32Array(count);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < count; i++) {
      let s = 0;
      const nc = ncount[i]!;
      for (let j = 0; j < nc; j++) s += field[neighbors[i * 6 + j]!]!;
      tmp[i] = field[i]! * (1 - amount) + (s / nc) * amount;
    }
    field.set(tmp);
  }
}

export function generateTerrain(world: World, rng: RNG): GeologyState {
  const { grid } = world;
  const { pos, count } = grid;
  assignPlates(world, rng.fork('plates'));
  const nr = rng.fork('terrain-noise');
  const continentNoise = makeNoise(nr);
  const detailNoise = makeNoise(nr);
  const ridgeNoise = makeNoise(nr);
  const warpNoise = makeNoise(nr);

  const elev = world.elevation;
  for (let i = 0; i < count; i++) elev[i] = world.plates[world.plate[i]!]!.continental ? 0.7 : -3.4;
  smoothField(grid, elev, 10, 0.7);

  const convergence = new Float32Array(count);
  computeConvergence(world, convergence);
  const up = new Float32Array(count);
  const down = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const c = convergence[i]!;
    if (c === 0) continue;
    const cont = world.plates[world.plate[i]!]!.continental;
    if (c > 0) {
      if (cont) up[i] = 5.2 * c;
      else {
        // oceanic side: trench next to continents, island arcs between oceanic plates
        let nextToContinent = false;
        for (let j = 0; j < grid.ncount[i]!; j++) {
          if (world.plates[world.plate[grid.neighbors[i * 6 + j]!]!]!.continental) nextToContinent = true;
        }
        if (nextToContinent) down[i] = 2.6 * c;
        else up[i] = 3.6 * c;
      }
    } else if (cont) down[i] = 1.4 * -c;
    else up[i] = 1.3 * -c;
  }
  spread(grid, up, 7, 0.74);
  spread(grid, down, 3, 0.6);
  smoothField(grid, up, 2, 0.5);

  const hs = rng.fork('hotspots');
  const hotspots: Hotspot[] = [];
  const hotspotCount = 4 + hs.int(4);
  for (let h = 0; h < hotspotCount; h++) {
    const [x, y, z] = hs.unitVector();
    hotspots.push({ x, y, z, strength: hs.range(0.6, 1), cell: 0 });
  }

  for (let i = 0; i < count; i++) {
    const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
    const wx = x + 0.25 * warpNoise(x * 2, y * 2, z * 2);
    const wy = y + 0.25 * warpNoise(x * 2 + 9.1, y * 2, z * 2);
    const wz = z + 0.25 * warpNoise(x * 2, y * 2 + 4.7, z * 2);
    const cont = fbm(continentNoise, wx * 1.25, wy * 1.25, wz * 1.25, 5);
    const detail = fbm(detailNoise, x * 5, y * 5, z * 5, 4);
    const ridge = ridged(ridgeNoise, x * 7, y * 7, z * 7, 3);
    let e = elev[i]! + cont * 2.6 + detail * 0.55;
    e += up[i]! * (0.35 + 1.1 * ridge) - down[i]!;
    for (const h of hotspots) {
      const d = x * h.x + y * h.y + z * h.z;
      if (d > 0.995) e += h.strength * 4.2 * Math.pow((d - 0.995) / 0.005, 1.5);
    }
    // gentle plateau shaping: flatten lowlands, sharpen peaks
    if (e > 0) e = Math.pow(e, 1.18) * 0.82;
    elev[i] = e;
  }
  const oceanFraction = rng.range(0.56, 0.72);
  const sorted = Float32Array.from(elev).sort();
  const sea = sorted[Math.floor(count * oceanFraction)]!;
  for (let i = 0; i < count; i++) elev[i] = elev[i]! - sea;
  world.seaLevel = 0;
  for (const h of hotspots) {
    let best = 0, bd = -2;
    for (let i = 0; i < count; i++) {
      const d = pos[i * 3]! * h.x + pos[i * 3 + 1]! * h.y + pos[i * 3 + 2]! * h.z;
      if (d > bd) { bd = d; best = i; }
    }
    h.cell = best;
  }
  for (let i = 0; i < count; i++) {
    // base fertility: young volcanic and lowland soils are richer
    world.fertility[i] = Math.max(0.15, Math.min(1, 0.5 + 0.25 * fbm(detailNoise, pos[i * 3]! * 3 + 31, pos[i * 3 + 1]! * 3, pos[i * 3 + 2]! * 3, 2)));
  }
  return { hotspots, convergence, oceanFraction };
}

class MinHeap {
  private keys: Float32Array;
  private vals: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float32Array(cap);
    this.vals = new Int32Array(cap);
  }
  push(key: number, val: number): void {
    let i = this.size++;
    const { keys, vals } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): number {
    const { keys, vals } = this;
    const top = vals[0]!;
    const n = --this.size;
    const key = keys[n]!, val = vals[n]!;
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= n) break;
      if (c + 1 < n && keys[c + 1]! < keys[c]!) c++;
      if (keys[c]! >= key) break;
      keys[i] = keys[c]!;
      vals[i] = vals[c]!;
      i = c;
    }
    keys[i] = key;
    vals[i] = val;
    return top;
  }
}

/**
 * Drainage by priority flood from the ocean: every land cell gets a downhill
 * neighbour that always reaches the sea, then rainfall is accumulated into flow.
 */
export function computeDrainage(world: World): void {
  const { grid, elevation, seaLevel, downhill, flow, moisture, water } = world;
  const { count, neighbors, ncount } = grid;
  const visited = new Uint8Array(count);
  const heap = new MinHeap(count * 2);
  const order = new Int32Array(count);
  let landCount = 0;
  for (let i = 0; i < count; i++) {
    downhill[i] = -1;
    flow[i] = 0;
    if (elevation[i]! <= seaLevel) {
      visited[i] = 1;
      water[i] = seaLevel - elevation[i]!;
      // only shoreline ocean cells need to seed the flood
      for (let j = 0; j < ncount[i]!; j++) {
        if (elevation[neighbors[i * 6 + j]!]! > seaLevel) {
          heap.push(elevation[i]!, i);
          break;
        }
      }
    } else water[i] = 0;
  }
  while (heap.size) {
    const c = heap.pop();
    for (let j = 0; j < ncount[c]!; j++) {
      const nb = neighbors[c * 6 + j]!;
      if (visited[nb]) continue;
      visited[nb] = 1;
      downhill[nb] = c;
      order[landCount++] = nb;
      heap.push(Math.max(elevation[nb]!, elevation[c]!) + 1e-4, nb);
    }
  }
  // order is from the coast inland, so walk it backwards to accumulate downstream
  for (let k = 0; k < landCount; k++) flow[order[k]!] = moisture[order[k]!]!;
  for (let k = landCount - 1; k >= 0; k--) {
    const c = order[k]!;
    const d = downhill[c]!;
    if (d >= 0 && elevation[d]! > seaLevel) flow[d] = flow[d]! + flow[c]!;
  }
}
