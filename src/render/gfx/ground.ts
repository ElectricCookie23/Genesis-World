// The height of the visible ground at any direction, computed on the CPU exactly as the terrain
// shader computes it: elevation interpolated across the icosphere triangle, plus eroded detail
// (read back from the GPU bake) sampled on three planes. Plants, creatures, rivers and the camera
// stand on this.
import { DataUtils, type WebGPURenderer } from 'three/webgpu';
import type { Grid } from '../../sim/world';
import { EXAG } from '../common';
import type { ErosionBake } from './erosion';
import { uv, vec4 } from 'three/tsl';
import { Pass, makeTarget } from './gpu';

const TILE_COARSE = 9;
const TILE_FINE = 70;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class GroundSampler {
  private readonly triStart: Int32Array;
  private readonly triList: Int32Array;
  private elevation: Float32Array;
  private seaLevel = 0;
  private detail: Float32Array | null = null;
  private detailSize = 0;
  private requested = false;
  flipped = false;

  constructor(private grid: Grid) {
    const { tris, count } = grid;
    const start = new Int32Array(count + 1);
    for (let t = 0; t < tris.length; t++) start[tris[t]! + 1] = start[tris[t]! + 1]! + 1;
    for (let i = 0; i < count; i++) start[i + 1] = start[i + 1]! + start[i]!;
    const fill = start.slice(0, count);
    const list = new Int32Array(tris.length);
    for (let t = 0; t < tris.length; t++) { const c = tris[t]!; list[fill[c]!] = t - (t % 3); fill[c] = fill[c]! + 1; }
    this.triStart = start;
    this.triList = list;
    this.elevation = new Float32Array(count);
  }

  setCells(elevation: Float32Array, seaLevel: number): void {
    this.elevation = elevation;
    this.seaLevel = seaLevel;
  }

  /** Once the erosion bake is done, copy its height channel to the CPU (one time). */
  async readDetail(renderer: WebGPURenderer, erosion: ErosionBake): Promise<void> {
    if (this.requested || !erosion.finished) return;
    this.requested = true;
    try {
      const n = erosion.size;
      const raw = (await renderer.readRenderTargetPixelsAsync(erosion.result, 0, 0, n, n)) as unknown as ArrayLike<number>;
      const out = new Float32Array(n * n);
      const half = raw instanceof Uint16Array;
      // backends differ on whether the first row read back is the top or the bottom of the texture: measure it
      const probe = makeTarget(1, 4);
      new Pass(vec4(uv().y, 0, 0, 1)).render(renderer, probe);
      const pr = (await renderer.readRenderTargetPixelsAsync(probe, 0, 0, 1, 4)) as unknown as ArrayLike<number>;
      const flipped = pr[0]! > pr[12]!;
      probe.dispose();
      for (let y = 0; y < n; y++) {
        const row = flipped ? n - 1 - y : y;
        for (let x = 0; x < n; x++) { const v = raw[(row * n + x) * 4]!; out[y * n + x] = half ? DataUtils.fromHalfFloat(v) : v; }
      }
      this.flipped = flipped;
      this.detail = out;
      this.detailSize = n;
    } catch {
      this.requested = false;
    }
  }

  private tex(u: number, v: number): number {
    const n = this.detailSize, d = this.detail!;
    let x = (u - Math.floor(u)) * n - 0.5, y = (v - Math.floor(v)) * n - 0.5;
    if (x < 0) x += n;
    if (y < 0) y += n;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, xa = x0 % n, ya = y0 % n;
    const a = d[ya * n + xa]!, b = d[ya * n + x1]!, c = d[y1 * n + xa]!, e = d[y1 * n + x1]!;
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
  }

  private triplanar(x: number, y: number, z: number, scale: number): number {
    let wx = x * x * x * x, wy = y * y * y * y, wz = z * z * z * z;
    const s = wx + wy + wz;
    wx /= s; wy /= s; wz /= s;
    return this.tex(z * scale, y * scale) * wx + this.tex(x * scale, z * scale) * wy + this.tex(x * scale, y * scale) * wz;
  }

  /** Nearest cell to a direction, walking from a starting cell. */
  cellAt(x: number, y: number, z: number, start: number): number {
    const { pos, neighbors, ncount } = this.grid;
    let cur = start;
    let best = pos[cur * 3]! * x + pos[cur * 3 + 1]! * y + pos[cur * 3 + 2]! * z;
    for (;;) {
      let moved = false;
      for (let k = 0; k < ncount[cur]!; k++) {
        const nb = neighbors[cur * 6 + k]!;
        const d = pos[nb * 3]! * x + pos[nb * 3 + 1]! * y + pos[nb * 3 + 2]! * z;
        if (d > best) { best = d; cur = nb; moved = true; }
      }
      if (!moved) return cur;
    }
  }

  /** Elevation in km at a direction, interpolated across the triangle around the given nearest cell. */
  elevationAt(x: number, y: number, z: number, cell: number): number {
    const { pos, tris } = this.grid;
    const el = this.elevation;
    let best = el[cell]!, bestIn = -Infinity;
    for (let k = this.triStart[cell]!; k < this.triStart[cell + 1]!; k++) {
      const t = this.triList[k]!;
      const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
      const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!;
      const e1x = pos[b * 3]! - ax, e1y = pos[b * 3 + 1]! - ay, e1z = pos[b * 3 + 2]! - az;
      const e2x = pos[c * 3]! - ax, e2y = pos[c * 3 + 1]! - ay, e2z = pos[c * 3 + 2]! - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const den = nx * x + ny * y + nz * z;
      if (Math.abs(den) < 1e-12) continue;
      const r = (nx * ax + ny * ay + nz * az) / den;
      const px = x * r - ax, py = y * r - ay, pz = z * r - az;
      const d00 = e1x * e1x + e1y * e1y + e1z * e1z, d01 = e1x * e2x + e1y * e2y + e1z * e2z, d11 = e2x * e2x + e2y * e2y + e2z * e2z;
      const d20 = px * e1x + py * e1y + pz * e1z, d21 = px * e2x + py * e2y + pz * e2z;
      const inv = 1 / (d00 * d11 - d01 * d01);
      const v = (d11 * d20 - d01 * d21) * inv, w = (d00 * d21 - d01 * d20) * inv, u = 1 - v - w;
      const inside = Math.min(u, v, w);
      if (inside > bestIn) {
        bestIn = inside;
        const cu = Math.max(0, u), cv = Math.max(0, v), cw = Math.max(0, w), s = cu + cv + cw || 1;
        best = (el[a]! * cu + el[b]! * cv + el[c]! * cw) / s;
      }
      if (inside >= 0) break;
    }
    return best;
  }

  /** Full surface height in km (elevation plus eroded detail), matching the terrain shader. */
  heightAt(x: number, y: number, z: number, cell: number): number {
    const elev = this.elevationAt(x, y, z, cell);
    if (!this.detail) return elev;
    const above = elev - this.seaLevel;
    const land = smooth(-0.25, 0.1, above);
    const coarse = (0.1 + 0.45 * smooth(0.2, 3.5, above)) * (0.3 + 0.7 * land);
    const fine = 0.012 + 0.028 * land;
    return elev + (this.triplanar(x, y, z, TILE_COARSE) - 0.5) * 2 * coarse + (this.triplanar(x, y, z, TILE_FINE) - 0.5) * 2 * fine;
  }

  /** Radius of the ground (not the sea) at a direction. */
  radiusAt(x: number, y: number, z: number, cell: number): number {
    return 1 + this.heightAt(x, y, z, cell) * EXAG;
  }

  get sea(): number {
    return this.seaLevel;
  }
}
