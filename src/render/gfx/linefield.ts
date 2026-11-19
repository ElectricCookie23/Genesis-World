// Thin lines on the globe (rivers, roads, sea lanes) stored in a cube map as a vector distance
// field: each texel holds the offset to the nearest line and a one-byte code for that line.
// Bilinear filtering of the offset keeps lines sharp and smooth well below the size of a texel.
import { ClampToEdgeWrapping, CubeTexture, DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import { faceDirection } from './cubebake';

export class LineField {
  readonly texture: CubeTexture;
  /** Offsets are stored as a fraction of this distance (planet radii). */
  readonly range: number;
  private faces: DataTexture[] = [];
  private best: Float32Array;

  constructor(readonly size = 512) {
    this.range = 6 / size;
    for (let f = 0; f < 6; f++) {
      const data = new Uint8Array(size * size * 4);
      for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0; }
      const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
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

  clear(): void {
    this.best.fill(Infinity);
    for (const f of this.faces) {
      const d = f.image.data as Uint8Array;
      for (let i = 0; i < d.length; i += 4) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 0; }
    }
  }

  commit(): void {
    for (const f of this.faces) f.needsUpdate = true;
    this.texture.needsUpdate = true;
  }

  /** Stamp one straight piece between two unit directions into every face it touches. code = 1..255. */
  piece(A: ArrayLike<number>, B: ArrayLike<number>, code: number): void {
    const n = this.size;
    const range = this.range;
    const dir: [number, number, number] = [0, 0, 0];
    const ex = B[0]! - A[0]!, ey = B[1]! - A[1]!, ez = B[2]! - A[2]!;
    const len2 = ex * ex + ey * ey + ez * ez || 1e-12;
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
      const k = 127.5 / range;
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
          const o = idx * 4;
          data[o] = Math.round(127.5 + ox * k);
          data[o + 1] = Math.round(127.5 + oy * k);
          data[o + 2] = Math.round(127.5 + oz * k);
          data[o + 3] = code;
        }
      }
    }
  }

  /**
   * Stamp a smooth curve through a chain of unit directions (x, y, z triples). The line runs straight
   * from the first point to the middle of the first step, rounds every corner between, and ends
   * straight at the last point. bend adds gentle meanders.
   */
  chain(points: ArrayLike<number>, count: number, codeAt: (i: number) => number, bend = 0.0012, freq = 260): void {
    if (count < 2) return;
    const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], p0 = [0, 0, 0], p1 = [0, 0, 0];
    const wobble = (p: number[]) => {
      const x = p[0]!, y = p[1]!, z = p[2]!;
      p[0] = x + bend * (Math.sin(y * freq + 1.3) + Math.sin(z * freq * 1.31 + 0.7));
      p[1] = y + bend * (Math.sin(z * freq + 2.1) + Math.sin(x * freq * 1.27 + 5.1));
      p[2] = z + bend * (Math.sin(x * freq + 4.2) + Math.sin(y * freq * 1.19 + 3.3));
      const l = Math.hypot(p[0]!, p[1]!, p[2]!);
      p[0]! /= l; p[1]! /= l; p[2]! /= l;
    };
    const PIECES = 4;
    const curve = (code: number) => {
      for (let s = 0; s <= PIECES; s++) {
        const t = s / PIECES, u = 1 - t;
        for (let k = 0; k < 3; k++) p1[k] = u * u * a[k]! + 2 * u * t * b[k]! + t * t * c[k]!;
        wobble(p1);
        if (s > 0) this.piece(p0, p1, code);
        p0[0] = p1[0]!; p0[1] = p1[1]!; p0[2] = p1[2]!;
      }
    };
    const mid = (i: number, out: number[]) => { for (let k = 0; k < 3; k++) out[k] = (points[i * 3 + k]! + points[(i + 1) * 3 + k]!) / 2; };
    const at = (i: number, out: number[]) => { for (let k = 0; k < 3; k++) out[k] = points[i * 3 + k]!; };
    // first half step
    at(0, a); mid(0, c); for (let k = 0; k < 3; k++) b[k] = (a[k]! + c[k]!) / 2;
    curve(codeAt(0));
    for (let i = 1; i < count - 1; i++) { mid(i - 1, a); at(i, b); mid(i, c); curve(codeAt(i)); }
    // last half step
    mid(count - 2, a); at(count - 1, c); for (let k = 0; k < 3; k++) b[k] = (a[k]! + c[k]!) / 2;
    curve(codeAt(count - 1));
  }
}
