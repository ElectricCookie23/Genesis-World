// Planet grid (geodesic icosphere) and per-cell data.
import type { RNG } from './rng';

export interface Grid {
  /** Subdivision frequency. Cell count = 10 n^2 + 2. */
  n: number;
  count: number;
  /** Unit sphere positions, xyz per cell. +Y is the rotation axis. */
  pos: Float32Array;
  lat: Float32Array; // radians, -pi/2..pi/2
  lon: Float32Array; // radians, -pi..pi
  /** Up to 6 neighbours per cell, -1 padded. */
  neighbors: Int32Array;
  ncount: Uint8Array;
  /** Triangles (cell indices), outward winding. */
  tris: Uint32Array;
}

export const GRID_N = 63; // 39,692 cells

export function buildGrid(n: number = GRID_N): Grid {
  const t = (1 + Math.sqrt(5)) / 2;
  const base: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!);
    return [v[0]! / l, v[1]! / l, v[2]! / l];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const count = 10 * n * n + 2;
  const pos = new Float32Array(count * 3);
  let next = 0;
  const put = (x: number, y: number, z: number): number => {
    const l = Math.hypot(x, y, z);
    pos[next * 3] = x / l;
    pos[next * 3 + 1] = y / l;
    pos[next * 3 + 2] = z / l;
    return next++;
  };
  for (const b of base) put(b[0]!, b[1]!, b[2]!);
  const edgeVerts = new Map<number, Int32Array>();
  const edge = (a: number, b: number, stepFromA: number): number => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = lo * 12 + hi;
    let arr = edgeVerts.get(key);
    if (!arr) {
      arr = new Int32Array(n - 1);
      const A = base[lo]!;
      const B = base[hi]!;
      for (let s = 1; s < n; s++) {
        arr[s - 1] = put(
          (A[0]! * (n - s) + B[0]! * s) / n,
          (A[1]! * (n - s) + B[1]! * s) / n,
          (A[2]! * (n - s) + B[2]! * s) / n,
        );
      }
      edgeVerts.set(key, arr);
    }
    const s = a === lo ? stepFromA : n - stepFromA;
    return arr[s - 1]!;
  };
  const tris: number[] = [];
  const idx = new Int32Array((n + 1) * (n + 1));
  for (const f of faces) {
    const a = f[0]!, b = f[1]!, c = f[2]!;
    const A = base[a]!, B = base[b]!, C = base[c]!;
    // (i, j): weight i on B, j on C, n-i-j on A
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const k = n - i - j;
        let v: number;
        if (i === 0 && j === 0) v = a;
        else if (i === n) v = b;
        else if (j === n) v = c;
        else if (j === 0) v = edge(a, b, i);
        else if (i === 0) v = edge(a, c, j);
        else if (k === 0) v = edge(b, c, j);
        else {
          v = put(
            (A[0]! * k + B[0]! * i + C[0]! * j) / n,
            (A[1]! * k + B[1]! * i + C[1]! * j) / n,
            (A[2]! * k + B[2]! * i + C[2]! * j) / n,
          );
        }
        idx[i * (n + 1) + j] = v;
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        tris.push(idx[i * (n + 1) + j]!, idx[(i + 1) * (n + 1) + j]!, idx[i * (n + 1) + j + 1]!);
        if (j < n - i - 1) {
          tris.push(idx[(i + 1) * (n + 1) + j]!, idx[(i + 1) * (n + 1) + j + 1]!, idx[i * (n + 1) + j + 1]!);
        }
      }
    }
  }
  if (next !== count) throw new Error(`grid vertex count mismatch ${next} vs ${count}`);
  const triArr = new Uint32Array(tris);
  // Fix winding so every triangle faces outward.
  for (let i = 0; i < triArr.length; i += 3) {
    const a = triArr[i]! * 3, b = triArr[i + 1]! * 3, c = triArr[i + 2]! * 3;
    const ux = pos[b]! - pos[a]!, uy = pos[b + 1]! - pos[a + 1]!, uz = pos[b + 2]! - pos[a + 2]!;
    const vx = pos[c]! - pos[a]!, vy = pos[c + 1]! - pos[a + 1]!, vz = pos[c + 2]! - pos[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * pos[a]! + ny * pos[a + 1]! + nz * pos[a + 2]! < 0) {
      const tmp = triArr[i + 1]!;
      triArr[i + 1] = triArr[i + 2]!;
      triArr[i + 2] = tmp;
    }
  }
  const neighbors = new Int32Array(count * 6).fill(-1);
  const ncount = new Uint8Array(count);
  const link = (a: number, b: number) => {
    const base6 = a * 6;
    const c = ncount[a]!;
    for (let k = 0; k < c; k++) if (neighbors[base6 + k] === b) return;
    neighbors[base6 + c] = b;
    ncount[a] = c + 1;
  };
  for (let i = 0; i < triArr.length; i += 3) {
    const a = triArr[i]!, b = triArr[i + 1]!, c = triArr[i + 2]!;
    link(a, b); link(b, a); link(b, c); link(c, b); link(a, c); link(c, a);
  }
  const lat = new Float32Array(count);
  const lon = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    lat[i] = Math.asin(Math.max(-1, Math.min(1, pos[i * 3 + 1]!)));
    lon[i] = Math.atan2(pos[i * 3 + 2]!, pos[i * 3]!);
  }
  return { n, count, pos, lat, lon, neighbors, ncount, tris: triArr };
}

/** Nearest cell to a unit direction, by greedy descent from a start cell. */
export function nearestCell(grid: Grid, x: number, y: number, z: number, start = 0): number {
  const { pos, neighbors, ncount } = grid;
  let cur = start;
  let best = pos[cur * 3]! * x + pos[cur * 3 + 1]! * y + pos[cur * 3 + 2]! * z;
  for (;;) {
    let moved = false;
    const c = ncount[cur]!;
    for (let k = 0; k < c; k++) {
      const nb = neighbors[cur * 6 + k]!;
      const d = pos[nb * 3]! * x + pos[nb * 3 + 1]! * y + pos[nb * 3 + 2]! * z;
      if (d > best) {
        best = d;
        cur = nb;
        moved = true;
      }
    }
    if (!moved) return cur;
  }
}

export const enum Biome {
  DeepOcean = 0,
  Ocean = 1,
  Shallows = 2,
  Beach = 3,
  Ice = 4,
  Tundra = 5,
  Taiga = 6,
  TemperateForest = 7,
  Grassland = 8,
  Shrubland = 9,
  Desert = 10,
  Savanna = 11,
  Rainforest = 12,
  Wetland = 13,
  Alpine = 14,
  Volcanic = 15,
  SeaIce = 16,
}
export const BIOME_COUNT = 17;
export const BIOME_NAMES = [
  'deep ocean', 'ocean', 'shallows', 'beach', 'ice sheet', 'tundra', 'taiga', 'temperate forest',
  'grassland', 'shrubland', 'desert', 'savanna', 'rainforest', 'wetland', 'alpine', 'volcanic waste', 'sea ice',
];

export interface Plate {
  continental: boolean;
  /** Rotation axis (unit) and angular speed in radians per million years. */
  ax: number; ay: number; az: number;
  speed: number;
}

/** All per-cell world state. Elevation is in km relative to the reference datum (not sea level). */
export interface World {
  grid: Grid;
  elevation: Float32Array;
  plate: Uint16Array;
  temperature: Float32Array; // deg C, current
  moisture: Float32Array; // 0..1 annual precipitation proxy
  biome: Uint8Array;
  fertility: Float32Array; // 0..1
  vegetation: Float32Array; // 0..1 density
  snow: Float32Array; // metres of snow/ice
  water: Float32Array; // water depth in km (0 on dry land)
  flow: Float32Array; // river flux
  downhill: Int32Array; // cell each land cell drains into, -1 for none
  cloud: Float32Array; // 0..1 cloud cover
  ash: Float32Array; // 0..1 ash / scorch cover
  lava: Float32Array; // 0..1 glowing lava / fire heat
  lights: Float32Array; // 0..1 firelight and city light
  fields: Float32Array; // 0..1 farmland
  canopy: Float32Array; // 0..1 height of the plant canopy
  flora: Int32Array; // dominant plant species id, -1 for none
  windE: Float32Array; // eastward wind component
  windN: Float32Array; // northward wind component
  plates: Plate[];
  /** Sea level in km relative to datum. */
  seaLevel: number;
}

export function createWorld(grid: Grid): World {
  const c = grid.count;
  return {
    grid,
    elevation: new Float32Array(c),
    plate: new Uint16Array(c),
    temperature: new Float32Array(c),
    moisture: new Float32Array(c),
    biome: new Uint8Array(c),
    fertility: new Float32Array(c),
    vegetation: new Float32Array(c),
    snow: new Float32Array(c),
    water: new Float32Array(c),
    flow: new Float32Array(c),
    downhill: new Int32Array(c).fill(-1),
    cloud: new Float32Array(c),
    ash: new Float32Array(c),
    lava: new Float32Array(c),
    lights: new Float32Array(c),
    fields: new Float32Array(c),
    canopy: new Float32Array(c),
    flora: new Int32Array(c).fill(-1),
    windE: new Float32Array(c),
    windN: new Float32Array(c),
    plates: [],
    seaLevel: 0,
  };
}

export function isLand(w: World, i: number): boolean {
  return w.elevation[i]! > w.seaLevel;
}

export function randomCell(grid: Grid, rng: RNG): number {
  return rng.int(grid.count);
}
