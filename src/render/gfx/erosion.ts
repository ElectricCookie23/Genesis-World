// GPU hydraulic erosion (pipe-model shallow water) on a tileable height field.
// Water rains on the field, flows downhill through virtual pipes, picks up sediment where it runs fast
// and steep, and drops it where it slows. Run in ping-pong float targets; the result is the terrain's
// detail height, normal and flow map, applied with triplanar mapping so it never stretches or seams.
import { DataTexture, FloatType, LinearFilter, RGBAFormat, RepeatWrapping, type RenderTarget, type Texture, type WebGPURenderer } from 'three/webgpu';
import { float, max, min, sqrt, texture, uv, vec2, vec4 } from 'three/tsl';
import { Pass, PingPong, makeTarget } from './gpu';
import { RNG } from '../../sim/rng';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Tileable fractal noise in 0..1, built from periodic lattices so the edges wrap exactly. */
function tileableNoise(size: number, seed: number): Float32Array {
  const rng = new RNG(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let period = 4; period <= size / 2; period *= 2) {
    const lattice = new Float32Array(period * period);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
    const cell = size / period;
    for (let y = 0; y < size; y++) {
      const fy = y / cell, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / cell, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = lattice[(y0 % period) * period + (x0 % period)]!, b = lattice[(y0 % period) * period + ((x0 + 1) % period)]!;
        const c = lattice[((y0 + 1) % period) * period + (x0 % period)]!, d = lattice[((y0 + 1) % period) * period + ((x0 + 1) % period)]!;
        let v = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
        // ridged octaves give sharper crests for the water to cut
        if (period >= 16) v = 1 - Math.abs(v * 2 - 1);
        out[y * size + x] = out[y * size + x]! + v * amp;
      }
    }
    total += amp;
    amp *= 0.52;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}

export class ErosionBake {
  readonly size: number;
  /** Final map: r = height 0..1, g and b = surface slope (dh/dx, dh/dz), a = how much water ran here. */
  readonly result: RenderTarget;
  private readonly terrain: PingPong; // r = rock height, g = water depth, b = suspended sediment, a = accumulated flow
  private readonly flux: PingPong; // outflow left, right, up, down
  private readonly velocity: RenderTarget; // r = new water depth, g/b = velocity
  private readonly fluxPass: Pass;
  private readonly waterPass: Pass;
  private readonly erodePass: Pass;
  private readonly movePass: Pass;
  private readonly initPass: Pass;
  private readonly outPass: Pass;
  private readonly tT: any[];
  private readonly tF: any[];
  private readonly tV: any[];
  private readonly outSrc: any;
  private readonly seedTex: DataTexture;
  private done = 0;
  readonly iterations: number;
  private started = false;

  constructor(size: number, iterations: number, seed: number) {
    this.size = size;
    this.iterations = iterations;
    const noise = tileableNoise(size, seed);
    const data = new Float32Array(size * size * 4);
    for (let i = 0; i < noise.length; i++) data[i * 4] = noise[i]!;
    this.seedTex = new DataTexture(data, size, size, RGBAFormat, FloatType);
    this.seedTex.wrapS = this.seedTex.wrapT = RepeatWrapping;
    this.seedTex.needsUpdate = true;
    this.terrain = new PingPong(size, size, { repeat: true });
    this.flux = new PingPong(size, size, { repeat: true });
    this.velocity = makeTarget(size, size, { repeat: true });
    this.result = makeTarget(size, size, { linear: true, repeat: true, mipmaps: true });
    this.result.texture.magFilter = LinearFilter;

    const st: any = uv();
    const px = 1 / size;
    const HEIGHT = size * 0.22; // height range in cell lengths, so slopes are real
    const DT = 0.02, GRAV = 9.8, RAIN = 0.012, EVAP = 0.015, CAPACITY = 0.9, DISSOLVE = 0.35, DEPOSIT = 0.5, MIN_TILT = 0.02;
    const off = [vec2(-px, 0), vec2(px, 0), vec2(0, px), vec2(0, -px)];

    this.initPass = new Pass(vec4((texture(this.seedTex, st) as any).r, 0, 0, 0));

    // --- pass 1: outflow flux from each cell to its four neighbours, driven by the difference in water surface
    const t1: any = texture(this.terrain.read.texture, st);
    const f1: any = texture(this.flux.read.texture, st);
    const surface = (t: any) => t.r.mul(HEIGHT).add(t.g);
    const here = surface(t1).add(RAIN * DT);
    const nb1 = off.map((o) => t1.sample(st.add(o)));
    const raw = nb1.map((n: any, i: number) => max(float(0), [f1.r, f1.g, f1.b, f1.a][i].mul(0.995).add(here.sub(surface(n)).mul(DT * GRAV))));
    const sum = raw[0].add(raw[1]).add(raw[2]).add(raw[3]);
    // a cell cannot send out more water than it holds
    const k = min(float(1), t1.g.add(RAIN * DT).div(max(sum.mul(DT), 1e-6)));
    this.fluxPass = new Pass(vec4(raw[0].mul(k), raw[1].mul(k), raw[2].mul(k), raw[3].mul(k)));

    // --- pass 2: new water depth from the net flux, and the velocity of the flow
    const t2: any = texture(this.terrain.read.texture, st);
    const f2: any = texture(this.flux.read.texture, st);
    const fl: any = f2.sample(st.add(off[0])), fr: any = f2.sample(st.add(off[1])), fu: any = f2.sample(st.add(off[2])), fd: any = f2.sample(st.add(off[3]));
    const inflow = fl.g.add(fr.r).add(fu.a).add(fd.b);
    const outflow = f2.r.add(f2.g).add(f2.b).add(f2.a);
    const d1 = t2.g.add(RAIN * DT);
    const d2 = max(float(0), d1.add(inflow.sub(outflow).mul(DT)));
    const mean = max(d1.add(d2).mul(0.5), 0.02);
    const vx = fl.g.sub(f2.r).add(f2.g).sub(fr.r).mul(0.5).div(mean);
    const vz = fd.b.sub(f2.a).add(f2.b).sub(fu.a).mul(0.5).div(mean);
    this.waterPass = new Pass(vec4(d2, vx, vz, 0));

    // --- pass 3: erosion and deposition. Fast water on steep ground carries more sediment.
    const t3: any = texture(this.terrain.read.texture, st);
    const v3: any = texture(this.velocity.texture, st);
    const hl = t3.sample(st.add(off[0])).r, hr = t3.sample(st.add(off[1])).r, hu = t3.sample(st.add(off[2])).r, hd = t3.sample(st.add(off[3])).r;
    const gx = hr.sub(hl).mul(HEIGHT * 0.5), gz = hu.sub(hd).mul(HEIGHT * 0.5);
    const tilt = max(float(MIN_TILT), sqrt(gx.mul(gx).add(gz.mul(gz))).div(sqrt(float(1).add(gx.mul(gx)).add(gz.mul(gz)))));
    const speed = sqrt(v3.g.mul(v3.g).add(v3.b.mul(v3.b)));
    const capacity = tilt.mul(speed).mul(CAPACITY).mul(min(v3.r.mul(8), 1));
    const diff = capacity.sub(t3.b);
    const change = max(diff, 0).mul(DISSOLVE).sub(max(diff.negate(), 0).mul(DEPOSIT)).mul(DT * 6);
    const rock = t3.r.sub(change.div(HEIGHT));
    this.erodePass = new Pass(vec4(rock, v3.r, max(t3.b.add(change), 0), t3.a.add(speed.mul(v3.r).mul(0.02))));

    // --- pass 4: the water carries its sediment along, and some of it evaporates
    const t4: any = texture(this.terrain.read.texture, st);
    const v4: any = texture(this.velocity.texture, st);
    const back = st.sub(vec2(v4.g, v4.b).mul(DT * px));
    const carried = t4.sample(back).b;
    this.movePass = new Pass(vec4(t4.r, t4.g.mul(1 - EVAP * DT * 50 * 0.02 - 0.0006), carried, t4.a));

    // --- output: height, slope and flow, filtered and mip-mapped for the terrain shader
    this.outSrc = texture(this.terrain.read.texture, st);
    const o: any = this.outSrc;
    const ol = o.sample(st.add(off[0])).r, or = o.sample(st.add(off[1])).r, ou = o.sample(st.add(off[2])).r, od = o.sample(st.add(off[3])).r;
    this.outPass = new Pass(vec4(o.r, or.sub(ol).mul(HEIGHT * 0.5), ou.sub(od).mul(HEIGHT * 0.5), min(o.a, 1)));

    this.tT = [t1, t2, t3, t4];
    this.tF = [f1, f2];
    this.tV = [v3, v4];
  }

  get texture(): Texture {
    return this.result.texture;
  }

  get finished(): boolean {
    return this.done >= this.iterations;
  }

  /** Run some iterations of the simulation. Call every frame until `finished`. */
  step(renderer: WebGPURenderer, count: number): void {
    if (!this.started) {
      this.started = true;
      this.initPass.render(renderer, this.terrain.read);
    }
    if (this.finished) return;
    const point = (nodes: any[], tex: Texture) => { for (const n of nodes) n.value = tex; };
    for (let i = 0; i < count && this.done < this.iterations; i++, this.done++) {
      point([this.tT[0]], this.terrain.read.texture); point([this.tF[0]], this.flux.read.texture);
      this.fluxPass.render(renderer, this.flux.write);
      this.flux.swap();
      point([this.tT[1]], this.terrain.read.texture); point([this.tF[1]], this.flux.read.texture);
      this.waterPass.render(renderer, this.velocity);
      point([this.tT[2]], this.terrain.read.texture); point([this.tV[0]], this.velocity.texture);
      this.erodePass.render(renderer, this.terrain.write);
      this.terrain.swap();
      point([this.tT[3]], this.terrain.read.texture); point([this.tV[1]], this.velocity.texture);
      this.movePass.render(renderer, this.terrain.write);
      this.terrain.swap();
    }
    this.outSrc.value = this.terrain.read.texture;
    this.outPass.render(renderer, this.result);
  }
}
