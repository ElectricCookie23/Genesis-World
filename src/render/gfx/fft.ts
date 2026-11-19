// FFT ocean (Tessendorf). A wind-driven wave spectrum is animated in time and inverse-transformed
// on the GPU with butterfly passes between two float targets, giving displacement, normals and foam.
// Everything here is render-to-texture with node materials, so it runs the same on WebGL2 and WebGPU.
import { DataTexture, FloatType, NearestFilter, RGBAFormat, RepeatWrapping, type RenderTarget, type Texture, type WebGPURenderer } from 'three/webgpu';
import { cos, float, floor, max, mix, mod, sin, sqrt, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import { Pass, PingPong, makeTarget } from './gpu';
import { RNG } from '../../sim/rng';

/* eslint-disable @typescript-eslint/no-explicit-any */
const G = 9.81;

function bitReverse(x: number, bits: number): number {
  let r = 0;
  for (let i = 0; i < bits; i++) { r = (r << 1) | (x & 1); x >>= 1; }
  return r;
}

/** Butterfly lookup: for each stage and output index, the twiddle factor and the two input indices. */
function butterflyTexture(n: number): DataTexture {
  const stages = Math.log2(n);
  const data = new Float32Array(n * stages * 4);
  for (let s = 0; s < stages; s++) {
    const span = 1 << s;
    for (let x = 0; x < n; x++) {
      const k = (x * (n >> (s + 1))) % n;
      const a = (2 * Math.PI * k) / n;
      const top = x % (span * 2) < span;
      let ia: number, ib: number;
      if (s === 0) {
        ia = bitReverse(top ? x : x - 1, stages);
        ib = bitReverse(top ? x + 1 : x, stages);
      } else {
        ia = top ? x : x - span;
        ib = top ? x + span : x;
      }
      const o = (s * n + x) * 4;
      data[o] = Math.cos(a); data[o + 1] = Math.sin(a); data[o + 2] = ia; data[o + 3] = ib;
    }
  }
  const t = new DataTexture(data, n, stages, RGBAFormat, FloatType);
  t.magFilter = t.minFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

export interface CascadeOutput {
  /** rgb = displacement (x, height, z) in metres, tiling. */
  displacement: Texture;
  /** rg = slope (d height/dx, d height/dz), b = foam 0..1, a = Jacobian. */
  detail: Texture;
  /** Tile length in metres. */
  length: number;
}

/** One FFT cascade: a square tile of ocean of a given size. */
class Cascade {
  readonly n: number;
  readonly length: number;
  private readonly h0: DataTexture;
  private readonly h0Data: Float32Array;
  private readonly spectrum: RenderTarget;
  private readonly pp: PingPong;
  private readonly disp: RenderTarget;
  private readonly foam: PingPong;
  private readonly evolve: Pass;
  private readonly horizontal: Pass;
  private readonly vertical: Pass;
  private readonly assemble: Pass;
  private readonly derive: Pass;
  private readonly uTime = uniform(0);
  private readonly uStage = uniform(0);
  private readonly uChop = uniform(1.1);
  /** Overall amplitude, set so the whole wave field has the height the wind should raise. */
  readonly uAmp = uniform(1);
  /** Variance of the height field at unit amplitude. */
  rawVariance = 0;
  private readonly srcH: any;
  private readonly srcV: any;
  private readonly srcAssemble: any;
  private readonly prevFoam: any;
  private readonly stages: number;
  private readonly seed: number;
  private wind = { speed: -1, dir: 0 };

  constructor(n: number, length: number, seed: number, private readonly cutLow: number, private readonly cutHigh: number) {
    this.n = n;
    this.length = length;
    this.seed = seed;
    this.stages = Math.log2(n);
    this.h0Data = new Float32Array(n * n * 4);
    this.h0 = new DataTexture(this.h0Data, n, n, RGBAFormat, FloatType);
    this.h0.magFilter = this.h0.minFilter = NearestFilter;
    this.spectrum = makeTarget(n, n);
    this.pp = new PingPong(n, n);
    this.disp = makeTarget(n, n, { linear: true, repeat: true, mipmaps: true });
    this.foam = new PingPong(n, n, { linear: true, repeat: true, mipmaps: true });
    const butterfly = butterflyTexture(n);
    const N = float(n);
    const st: any = uv();

    // 1. time evolution: h(k, t) = h0(k) e^{i w t} + conj(h0(-k)) e^{-i w t}, plus horizontal displacement spectra
    const idx: any = floor(st.mul(N));
    const k: any = idx.sub(n / 2).mul((2 * Math.PI) / length);
    const kLen = max(k.length(), 1e-5);
    const w = sqrt(kLen.mul(G));
    const ph = w.mul(this.uTime);
    const c = cos(ph), s = sin(ph);
    const h0: any = (texture(this.h0, st) as any).mul(this.uAmp);
    const hr = h0.r.mul(c).sub(h0.g.mul(s)).add(h0.b.mul(c)).add(h0.a.mul(s));
    const hi = h0.r.mul(s).add(h0.g.mul(c)).add(h0.a.mul(c)).sub(h0.b.mul(s));
    // Dx = -i (kx/|k|) h and Dz = -i (kz/|k|) h, packed as one complex signal Dx + i Dz
    const dxr = k.x.div(kLen).mul(hi), dxi = k.x.div(kLen).mul(hr).negate();
    const dzr = k.y.div(kLen).mul(hi), dzi = k.y.div(kLen).mul(hr).negate();
    this.evolve = new Pass(vec4(hr, hi, dxr.sub(dzi), dxi.add(dzr)));

    // 2. inverse FFT: log2(n) horizontal butterfly passes, then log2(n) vertical ones
    const stageV = this.uStage.add(0.5).div(this.stages);
    const makeButterfly = (horizontal: boolean) => {
      const along = horizontal ? st.x : st.y;
      const bf: any = texture(butterfly, vec2(along, stageV));
      const src: any = texture(this.pp.read.texture, st);
      const ca = bf.z.add(0.5).div(N), cb = bf.w.add(0.5).div(N);
      const a: any = src.sample(horizontal ? vec2(ca, st.y) : vec2(st.x, ca));
      const b: any = src.sample(horizontal ? vec2(cb, st.y) : vec2(st.x, cb));
      const out = vec4(
        a.r.add(bf.r.mul(b.r).sub(bf.g.mul(b.g))), a.g.add(bf.r.mul(b.g).add(bf.g.mul(b.r))),
        a.b.add(bf.r.mul(b.b).sub(bf.g.mul(b.a))), a.a.add(bf.r.mul(b.a).add(bf.g.mul(b.b))),
      );
      return { pass: new Pass(out), src };
    };
    const hPass = makeButterfly(true), vPass = makeButterfly(false);
    this.horizontal = hPass.pass; this.srcH = hPass.src;
    this.vertical = vPass.pass; this.srcV = vPass.src;

    // 3. assemble: undo the centred-spectrum sign flip and scale the horizontal displacement by the choppiness
    this.srcAssemble = texture(this.pp.read.texture, st);
    const sign: any = mix(float(1), float(-1), mod(idx.x.add(idx.y), 2));
    const f: any = this.srcAssemble;
    this.assemble = new Pass(vec4(f.b.mul(sign).mul(this.uChop), f.r.mul(sign), f.a.mul(sign).mul(this.uChop), 1));

    // 4. slopes, the Jacobian of the horizontal displacement, and foam that lingers where waves fold over
    const d: any = texture(this.disp.texture, st);
    const texel = 1 / n, metres = length / n;
    const right: any = d.sample(st.add(vec2(texel, 0))), left: any = d.sample(st.sub(vec2(texel, 0)));
    const up: any = d.sample(st.add(vec2(0, texel))), down: any = d.sample(st.sub(vec2(0, texel)));
    const sx = right.g.sub(left.g).div(2 * metres), sz = up.g.sub(down.g).div(2 * metres);
    const dDxdx = right.r.sub(left.r).div(2 * metres), dDzdz = up.b.sub(down.b).div(2 * metres);
    const dDxdz = up.r.sub(down.r).div(2 * metres), dDzdx = right.b.sub(left.b).div(2 * metres);
    const jac = float(1).add(dDxdx).mul(float(1).add(dDzdz)).sub(dDxdz.mul(dDzdx));
    this.prevFoam = texture(this.foam.read.texture, st);
    const fresh = float(0.72).sub(jac).mul(2.4).clamp(0, 1);
    const lingering = max((this.prevFoam as any).b.sub(0.012), fresh);
    this.derive = new Pass(vec4(sx, sz, lingering, jac));
  }

  /** Rebuild the base spectrum for a wind speed (m/s) and direction (radians). */
  setWind(speed: number, dir: number): void {
    if (Math.abs(speed - this.wind.speed) < 0.4 && Math.abs(dir - this.wind.dir) < 0.08) return;
    this.wind = { speed, dir };
    const n = this.n, L = this.length;
    const rng = new RNG(this.seed);
    const wx = Math.cos(dir), wz = Math.sin(dir);
    const largest = (speed * speed) / G;
    const damp = L / n / 2;
    const phillips = (kx: number, kz: number): number => {
      const k2 = kx * kx + kz * kz;
      if (k2 < 1e-10) return 0;
      const k = Math.sqrt(k2);
      if (k < this.cutLow || k > this.cutHigh) return 0;
      const kw = (kx * wx + kz * wz) / k;
      // waves running against the wind are strongly damped
      const align = kw * kw * (kw < 0 ? 0.07 : 1);
      return (Math.exp(-1 / (k2 * largest * largest)) / (k2 * k2)) * align * Math.exp(-k2 * damp * damp);
    };
    const data = this.h0Data;
    let variance = 0;
    const gauss = new Float32Array(n * n * 4);
    for (let i = 0; i < gauss.length; i++) gauss[i] = rng.gauss();
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const kx = ((x - n / 2) * 2 * Math.PI) / L, kz = ((z - n / 2) * 2 * Math.PI) / L;
        const o = (z * n + x) * 4;
        const a = Math.sqrt(phillips(kx, kz) / 2) * ((2 * Math.PI) / L);
        const b = Math.sqrt(phillips(-kx, -kz) / 2) * ((2 * Math.PI) / L);
        variance += 2 * a * a + 2 * b * b;
        data[o] = gauss[o]! * a; data[o + 1] = gauss[o + 1]! * a;
        // conj(h0(-k))
        data[o + 2] = gauss[o + 2]! * b; data[o + 3] = -gauss[o + 3]! * b;
      }
    }
    this.h0.needsUpdate = true;
    this.rawVariance = variance;
  }

  update(renderer: WebGPURenderer, time: number, choppiness: number): CascadeOutput {
    this.uTime.value = time;
    this.uChop.value = choppiness;
    this.evolve.render(renderer, this.pp.read);
    for (let s = 0; s < this.stages; s++) {
      this.uStage.value = s;
      this.srcH.value = this.pp.read.texture;
      this.horizontal.render(renderer, this.pp.write);
      this.pp.swap();
    }
    for (let s = 0; s < this.stages; s++) {
      this.uStage.value = s;
      this.srcV.value = this.pp.read.texture;
      this.vertical.render(renderer, this.pp.write);
      this.pp.swap();
    }
    this.srcAssemble.value = this.pp.read.texture;
    this.assemble.render(renderer, this.disp);
    this.prevFoam.value = this.foam.read.texture;
    this.derive.render(renderer, this.foam.write);
    this.foam.swap();
    return { displacement: this.disp.texture, detail: this.foam.read.texture, length: this.length };
  }

  get outputs(): CascadeOutput {
    return { displacement: this.disp.texture, detail: this.foam.read.texture, length: this.length };
  }
}

/** The whole ocean wave field: three cascades from long swell down to small chop. */
export class OceanFFT {
  readonly cascades: Cascade[];
  /** Expected rms wave height in metres for the current wind. */
  rmsHeight = 0;

  constructor(resolution: number, seed: number) {
    // each cascade owns a band of wavelengths so they add up without double counting
    const lengths = [1400, 260, 46];
    const bounds = [0, (2 * Math.PI * 9) / 1400, (2 * Math.PI * 9) / 260, 1e9];
    this.cascades = lengths.map((len, i) => new Cascade(resolution, len, seed + i * 7919, bounds[i]!, bounds[i + 1]!));
    this.setWind(9, 0.6);
  }

  /** Wind speed in m/s and direction in radians: the sim's wind and storms drive this. */
  setWind(speed: number, dir: number): void {
    for (const c of this.cascades) c.setWind(speed, dir);
    // a fully developed sea has a significant wave height of about 0.21 V^2 / g; rms height is a quarter of that
    const rms = (0.21 * speed * speed) / 9.81 / 4;
    const total = this.cascades.reduce((sum, c) => sum + c.rawVariance, 0);
    const amp = total > 0 ? rms / Math.sqrt(total) : 0;
    for (const c of this.cascades) c.uAmp.value = amp;
    this.rmsHeight = rms;
  }

  update(renderer: WebGPURenderer, time: number, choppiness = 1.15): CascadeOutput[] {
    return this.cascades.map((c) => c.update(renderer, time, choppiness));
  }

  get outputs(): CascadeOutput[] {
    return this.cascades.map((c) => c.outputs);
  }
}
export { RepeatWrapping };
