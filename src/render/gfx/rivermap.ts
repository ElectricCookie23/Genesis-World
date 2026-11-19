// Rivers as part of the ground: the drainage network is drawn into a cube map as a vector
// distance field (each texel stores the offset to the nearest river centre line and that
// river's width), so the terrain shader can draw smooth, thin, curving rivers of any width
// with no extra geometry. Bilinear filtering of the offset vector keeps lines sharp below texel size.
import { ClampToEdgeWrapping, CubeTexture, DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import type { Grid } from '../../sim/world';
import type { CellSnapshot } from '../../shared/protocol';
import { faceDirection } from './cubebake';

/** Widest river half-width, in planet radii. */
export const RIVER_MAX_WIDTH = 0.0024;

export class RiverMap {
  readonly texture: CubeTexture;
  /** Offsets are stored as a fraction of this distance (planet radii). */
  readonly range: number;
  private faces: DataTexture[] = [];
  private best: Float32Array;
  private lastBuild = -1e9;
  count = 0;

  constructor(private grid: Grid, readonly size = 512) {
    this.range = 6 / size;
    for (let f = 0; f < 6; f++) {
      const t = new DataTexture(new Uint8Array(size * size * 4).fill(255), size, size, RGBAFormat, UnsignedByteType);
      t.needsUpdate = true;
      this.faces.push(t);
    }
    const tex = new CubeTexture(this.faces as unknown as HTMLImageElement[]);
    tex.format = RGBAFormat;
    tex.type = UnsignedByteType;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.texture = tex;
    this.best = new Float32Array(6 * size * size);
  }

  /** Redraw from the current drainage. Takes tens of milliseconds, so it is throttled. */
  update(cells: CellSnapshot, now: number, force = false): void {
    if (!force && now - this.lastBuild < 6000) return;
    this.lastBuild = now;
    const { pos, count } = this.grid;
    const { flow, downhill, elevation, seaLevel, temperature, snow } = cells;
    const n = this.size;
    this.best.fill(Infinity);
    for (const f of this.faces) {
      const d = f.image.data as Uint8Array;
      for (let i = 0; i < d.length; i += 4) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 0; }
    }
    const width = (fl: number) => Math.min(RIVER_MAX_WIDTH, 0.0003 + 0.0002 * Math.sqrt(fl));
    // gentle meanders so rivers do not follow the cell grid in straight hops
    const F = 230, AMP = 0.0019;
    const bend = (p: number[]) => {
      const x = p[0]!, y = p[1]!, z = p[2]!;
      p[0] = x + AMP * (Math.sin(y * F + 1.3) + Math.sin(z * F * 1.31 + 0.7));
      p[1] = y + AMP * (Math.sin(z * F + 2.1) + Math.sin(x * F * 1.27 + 5.1));
      p[2] = z + AMP * (Math.sin(x * F + 4.2) + Math.sin(y * F * 1.19 + 3.3));
      const l = Math.hypot(p[0]!, p[1]!, p[2]!);
      p[0]! /= l; p[1]! /= l; p[2]! /= l;
    };
    const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], p0 = [0, 0, 0], p1 = [0, 0, 0];
    const PIECES = 5;
    let segs = 0;
    for (let i = 0; i < count; i++) {
      const fl = flow[i]!;
      const d = downhill[i]!;
      if (fl < 1.6 || d < 0 || elevation[i]! <= seaLevel || temperature[i]! < -2 || snow[i]! > 1.5) continue;
      const dd = elevation[d]! > seaLevel ? downhill[d]! : -1;
      // a curve from the middle of this step, through the next cell, to the middle of the following step
      for (let k = 0; k < 3; k++) {
        a[k] = (pos[i * 3 + k]! + pos[d * 3 + k]!) / 2;
        b[k] = pos[d * 3 + k]!;
        c[k] = dd >= 0 ? (pos[d * 3 + k]! + pos[dd * 3 + k]!) / 2 : pos[d * 3 + k]!;
      }
      const fd = Math.max(flow[d]!, fl);
      const w0 = width(fl), w1 = width(fd);
      for (let s = 0; s <= PIECES; s++) {
        const t = s / PIECES, u = 1 - t;
        for (let k = 0; k < 3; k++) p1[k] = u * u * a[k]! + 2 * u * t * b[k]! + t * t * c[k]!;
        bend(p1);
        if (s > 0) this.piece(p0, p1, w0 + (w1 - w0) * (t - 0.5 / PIECES), n);
        p0[0] = p1[0]!; p0[1] = p1[1]!; p0[2] = p1[2]!;
      }
      segs++;
    }
    this.count = segs;
    for (const f of this.faces) f.needsUpdate = true;
    this.texture.needsUpdate = true;
  }

  /** Stamp one straight piece of river into every face it touches. */
  private piece(A: number[], B: number[], w: number, n: number): void {
    const range = this.range;
    const dir: [number, number, number] = [0, 0, 0];
    const ex = B[0]! - A[0]!, ey = B[1]! - A[1]!, ez = B[2]! - A[2]!;
    const len2 = ex * ex + ey * ey + ez * ez || 1e-12;
    const wCode = Math.max(1, Math.min(255, Math.round((w / RIVER_MAX_WIDTH) * 255)));
    for (let face = 0; face < 6; face++) {
      const axis = face >> 1, sign = face & 1 ? -1 : 1;
      const ca = A[axis]! * sign, cb = B[axis]! * sign;
      if (ca < 0.45 || cb < 0.45) continue;
      let ua: number, va: number, ub: number, vb: number;
      switch (face) {
        case 0: ua = -A[2]! / ca; va = -A[1]! / ca; ub = -B[2]! / cb; vb = -B[1]! / cb; break;
        case 1: ua = A[2]! / ca; va = -A[1]! / ca; ub = B[2]! / cb; vb = -B[1]! / cb; break;
        case 2: ua = A[0]! / ca; va = A[2]! / ca; ub = B[0]! / cb; vb = B[2]! / cb; break;
        case 3: ua = A[0]! / ca; va = -A[2]! / ca; ub = B[0]! / cb; vb = -B[2]! / cb; break;
        case 4: ua = A[0]! / ca; va = -A[1]! / ca; ub = B[0]! / cb; vb = -B[1]! / cb; break;
        default: ua = -A[0]! / ca; va = -A[1]! / ca; ub = -B[0]! / cb; vb = -B[1]! / cb; break;
      }
      // texels near the cube's corners cover less of the sphere, so the stamp reaches further there
      const reach = Math.ceil(3.2 * (1 + Math.max(ua * ua + va * va, ub * ub + vb * vb)));
      const x0 = Math.max(0, Math.floor((Math.min(ua, ub) * 0.5 + 0.5) * n) - reach), x1 = Math.min(n - 1, Math.ceil((Math.max(ua, ub) * 0.5 + 0.5) * n) + reach);
      const y0 = Math.max(0, Math.floor((Math.min(va, vb) * 0.5 + 0.5) * n) - reach), y1 = Math.min(n - 1, Math.ceil((Math.max(va, vb) * 0.5 + 0.5) * n) + reach);
      if (x0 > x1 || y0 > y1) continue;
      const data = this.faces[face]!.image.data as Uint8Array;
      const base = face * n * n;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          faceDirection(face, ((x + 0.5) / n) * 2 - 1, ((y + 0.5) / n) * 2 - 1, dir);
          const px = dir[0] - A[0]!, py = dir[1] - A[1]!, pz = dir[2] - A[2]!;
          let t = (px * ex + py * ey + pz * ez) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ox = A[0]! + ex * t - dir[0], oy = A[1]! + ey * t - dir[1], oz = A[2]! + ez * t - dir[2];
          const dist = Math.hypot(ox, oy, oz);
          const idx = y * n + x;
          if (dist >= range || dist >= this.best[base + idx]!) continue;
          this.best[base + idx] = dist;
          const o = idx * 4, k = 127.5 / range;
          data[o] = Math.round(127.5 + ox * k);
          data[o + 1] = Math.round(127.5 + oy * k);
          data[o + 2] = Math.round(127.5 + oz * k);
          data[o + 3] = wCode;
        }
      }
    }
  }
}
