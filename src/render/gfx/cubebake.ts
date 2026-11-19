// Bakes the simulation's per-cell data into cube-map textures.
// A one-time table maps every texel to the three cells of the icosphere triangle under it
// (with barycentric weights), so each re-bake is a weighted sum and takes a few milliseconds.
import { ClampToEdgeWrapping, CubeTexture, DataTexture, FloatType, LinearFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import type { Grid } from '../../sim/world';

/** Unit direction for a texel of a cube face, using the WebGL cube-map convention. */
export function faceDirection(face: number, u: number, v: number, out: [number, number, number]): void {
  // u, v in -1..1; v grows downward in texture space
  let x = 0, y = 0, z = 0;
  switch (face) {
    case 0: x = 1; y = -v; z = -u; break; // +X
    case 1: x = -1; y = -v; z = u; break; // -X
    case 2: x = u; y = 1; z = v; break; // +Y
    case 3: x = u; y = -1; z = -v; break; // -Y
    case 4: x = u; y = -v; z = 1; break; // +Z
    default: x = -u; y = -v; z = -1; break; // -Z
  }
  const l = Math.hypot(x, y, z);
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
}

export class CubeBake {
  readonly size: number;
  /** Three cell indices and three weights per texel, for all six faces. */
  private readonly cells: Int32Array;
  private readonly weights: Float32Array;
  private readonly textures: { tex: CubeTexture; faces: DataTexture[]; channels: number; float: boolean }[] = [];

  constructor(private grid: Grid, size: number) {
    this.size = size;
    const texels = 6 * size * size;
    this.cells = new Int32Array(texels * 3);
    this.weights = new Float32Array(texels * 3);
    const { pos, neighbors, ncount, tris, count } = grid;
    // triangles around every cell
    const start = new Int32Array(count + 1);
    for (let t = 0; t < tris.length; t++) start[tris[t]! + 1] = start[tris[t]! + 1]! + 1;
    for (let i = 0; i < count; i++) start[i + 1] = start[i + 1]! + start[i]!;
    const fill = start.slice(0, count);
    const list = new Int32Array(tris.length);
    for (let t = 0; t < tris.length; t++) { const c = tris[t]!; list[fill[c]!] = t - (t % 3); fill[c] = fill[c]! + 1; }
    const d: [number, number, number] = [0, 0, 0];
    let cur = 0;
    for (let face = 0; face < 6; face++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          faceDirection(face, ((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1, d);
          // walk to the nearest cell (warm-started from the previous texel)
          let best = pos[cur * 3]! * d[0] + pos[cur * 3 + 1]! * d[1] + pos[cur * 3 + 2]! * d[2];
          for (;;) {
            let moved = false;
            for (let k = 0; k < ncount[cur]!; k++) {
              const nb = neighbors[cur * 6 + k]!;
              const dd = pos[nb * 3]! * d[0] + pos[nb * 3 + 1]! * d[1] + pos[nb * 3 + 2]! * d[2];
              if (dd > best) { best = dd; cur = nb; moved = true; }
            }
            if (!moved) break;
          }
          // find the incident triangle that contains the direction
          let ia = cur, ib = cur, ic = cur, wa = 1, wb = 0, wc = 0, bestIn = -Infinity;
          for (let k = start[cur]!; k < start[cur + 1]!; k++) {
            const t = list[k]!;
            const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
            const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!;
            const e1x = pos[b * 3]! - ax, e1y = pos[b * 3 + 1]! - ay, e1z = pos[b * 3 + 2]! - az;
            const e2x = pos[c * 3]! - ax, e2y = pos[c * 3 + 1]! - ay, e2z = pos[c * 3 + 2]! - az;
            // intersect the ray from the centre with the triangle's plane
            const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            const den = nx * d[0] + ny * d[1] + nz * d[2];
            if (Math.abs(den) < 1e-12) continue;
            const r = (nx * ax + ny * ay + nz * az) / den;
            const px = d[0] * r - ax, py = d[1] * r - ay, pz = d[2] * r - az;
            const d00 = e1x * e1x + e1y * e1y + e1z * e1z, d01 = e1x * e2x + e1y * e2y + e1z * e2z, d11 = e2x * e2x + e2y * e2y + e2z * e2z;
            const d20 = px * e1x + py * e1y + pz * e1z, d21 = px * e2x + py * e2y + pz * e2z;
            const inv = 1 / (d00 * d11 - d01 * d01);
            const v = (d11 * d20 - d01 * d21) * inv, w = (d00 * d21 - d01 * d20) * inv, u = 1 - v - w;
            const inside = Math.min(u, v, w);
            if (inside > bestIn) {
              bestIn = inside;
              ia = a; ib = b; ic = c;
              wa = Math.max(0, u); wb = Math.max(0, v); wc = Math.max(0, w);
              const s = wa + wb + wc || 1;
              wa /= s; wb /= s; wc /= s;
            }
            if (inside >= 0) break;
          }
          const o = ((face * size + y) * size + x) * 3;
          this.cells[o] = ia; this.cells[o + 1] = ib; this.cells[o + 2] = ic;
          this.weights[o] = wa; this.weights[o + 1] = wb; this.weights[o + 2] = wc;
        }
      }
    }
  }

  /** Create a cube map with the given number of channels (always stored as RGBA). */
  create(float: boolean): CubeTexture {
    const n = this.size;
    const faces: DataTexture[] = [];
    for (let f = 0; f < 6; f++) {
      const data = float ? new Float32Array(n * n * 4) : new Uint8Array(n * n * 4);
      const t = new DataTexture(data, n, n, RGBAFormat, float ? FloatType : UnsignedByteType);
      t.needsUpdate = true;
      faces.push(t);
    }
    const tex = new CubeTexture(faces as unknown as HTMLImageElement[]);
    tex.format = RGBAFormat;
    tex.type = float ? FloatType : UnsignedByteType;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.textures.push({ tex, faces, channels: 4, float });
    return tex;
  }

  /**
   * Fill one channel of a cube map from per-cell values, smoothly interpolated.
   * For byte textures, values are expected in 0..1.
   */
  fill(tex: CubeTexture, channel: number, values: ArrayLike<number>, scale = 1, offset = 0): void {
    const entry = this.textures.find((t) => t.tex === tex)!;
    const n = this.size, per = n * n;
    const { cells, weights } = this;
    for (let f = 0; f < 6; f++) {
      const data = entry.faces[f]!.image.data as Float32Array | Uint8Array;
      const base = f * per * 3;
      if (entry.float) {
        for (let i = 0; i < per; i++) {
          const o = base + i * 3;
          data[i * 4 + channel] = (values[cells[o]!]! * weights[o]! + values[cells[o + 1]!]! * weights[o + 1]! + values[cells[o + 2]!]! * weights[o + 2]!) * scale + offset;
        }
      } else {
        for (let i = 0; i < per; i++) {
          const o = base + i * 3;
          const v = (values[cells[o]!]! * weights[o]! + values[cells[o + 1]!]! * weights[o + 1]! + values[cells[o + 2]!]! * weights[o + 2]!) * scale + offset;
          data[i * 4 + channel] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
        }
      }
    }
  }

  /** Fill a channel with the value of the nearest cell only (no blending), for ids and categories. */
  fillNearest(tex: CubeTexture, channel: number, values: ArrayLike<number>, scale = 1): void {
    const entry = this.textures.find((t) => t.tex === tex)!;
    const n = this.size, per = n * n;
    const { cells, weights } = this;
    for (let f = 0; f < 6; f++) {
      const data = entry.faces[f]!.image.data as Float32Array | Uint8Array;
      const base = f * per * 3;
      for (let i = 0; i < per; i++) {
        const o = base + i * 3;
        const k = weights[o]! >= weights[o + 1]! && weights[o]! >= weights[o + 2]! ? 0 : weights[o + 1]! >= weights[o + 2]! ? 1 : 2;
        const v = values[cells[o + k]!]! * scale;
        data[i * 4 + channel] = entry.float ? v : v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
      }
    }
  }

  /** Upload a cube map after its channels were filled. */
  commit(tex: CubeTexture): void {
    const entry = this.textures.find((t) => t.tex === tex)!;
    for (const f of entry.faces) f.needsUpdate = true;
    tex.needsUpdate = true;
  }
}
