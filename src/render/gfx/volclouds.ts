// Volumetric clouds: a ray march through a layer of air above the ground. Where clouds are and how
// tall they grow comes from the simulation (cloud cover, storms, cyclones); their shape comes from
// tileable 3D noise. They shade themselves, take the colour of the star at dusk and of the moon at
// night, glow from inside with lightning, and cast shadows on the ground and sea.
import {
  BackSide, Data3DTexture, LinearFilter, Mesh, MeshBasicNodeMaterial, RGBAFormat, RepeatWrapping, SphereGeometry, UnsignedByteType, Vector4,
  type CubeTexture,
} from 'three/webgpu';
import {
  Break, Fn, If, Loop, abs, cameraFar, cameraNear, cameraPosition, cos, dot, exp, float, int, length, max, min, mix, normalize, perspectiveDepthToViewZ,
  positionView, positionWorld, pow, screenCoordinate, select, sin, smoothstep, sqrt, texture3D, uniform, vec3, vec4, viewportDepthTexture, atan, log,
} from 'three/tsl';
import { EXAG, uBolts, uCloudAmount, uHazeTint, uMoonDir, uPlumeWind, uPlumes, uSteam, uSunDir, uTime } from '../common';
import { uLook } from './look';
import { samplePlanet } from './planetdata';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Cloud base and top, as planet radii (the same vertical exaggeration as the terrain). */
export const CLOUD_BASE = 1 + 1.3 * EXAG;
export const CLOUD_TOP = 1 + 9.6 * EXAG;
const THICK = CLOUD_TOP - CLOUD_BASE;
/** Extinction per planet radius at full density. */
const SIGMA = 520;

/** Tileable 3D noise: r = Perlin-Worley shape, g = Worley fbm, b = finer Worley, a = Perlin fbm. */
export function buildCloudNoise(n: number, seed: number): Data3DTexture {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const worleyPoints = (f: number) => { const p = new Float32Array(f * f * f * 3); for (let i = 0; i < p.length; i++) p[i] = rnd(); return p; };
  const gradients = (f: number) => {
    const g = new Float32Array(f * f * f * 3);
    for (let i = 0; i < f * f * f; i++) {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      g[i * 3] = r * Math.cos(a); g[i * 3 + 1] = r * Math.sin(a); g[i * 3 + 2] = z;
    }
    return g;
  };
  const worley = (pts: Float32Array, f: number, x: number, y: number, z: number): number => {
    const px = x * f, py = y * f, pz = z * f;
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iy = cy + dy, iz = cz + dz;
      const o = ((((iz % f) + f) % f) * f + (((iy % f) + f) % f)) * f * 3 + (((ix % f) + f) % f) * 3;
      const ex = ix + pts[o]! - px, ey = iy + pts[o + 1]! - py, ez = iz + pts[o + 2]! - pz;
      const d = ex * ex + ey * ey + ez * ez;
      if (d < best) best = d;
    }
    return 1 - Math.min(1, Math.sqrt(best));
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const perlin = (g: Float32Array, f: number, x: number, y: number, z: number): number => {
    const px = x * f, py = y * f, pz = z * f;
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    const fx = px - cx, fy = py - cy, fz = pz - cz;
    const u = fade(fx), v = fade(fy), w = fade(fz);
    let sum = 0;
    for (let k = 0; k < 8; k++) {
      const ox = k & 1, oy = (k >> 1) & 1, oz = (k >> 2) & 1;
      const o = ((((cz + oz) % f) * f + ((cy + oy) % f)) * f + ((cx + ox) % f)) * 3;
      const d = g[o]! * (fx - ox) + g[o + 1]! * (fy - oy) + g[o + 2]! * (fz - oz);
      sum += d * (ox ? u : 1 - u) * (oy ? v : 1 - v) * (oz ? w : 1 - w);
    }
    return sum;
  };
  const w4 = worleyPoints(4), w8 = worleyPoints(8), w16 = worleyPoints(16);
  const g4 = gradients(4), g8 = gradients(8), g16 = gradients(16), g3 = gradients(3), g6 = gradients(6), g12 = gradients(12);
  const data = new Uint8Array(n * n * n * 4);
  const clamp = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = (x + 0.5) / n, py = (y + 0.5) / n, pz = (z + 0.5) / n;
    const a = worley(w4, 4, px, py, pz), b = worley(w8, 8, px, py, pz), c = worley(w16, 16, px, py, pz);
    const wf = a * 0.625 + b * 0.25 + c * 0.125;
    const p = (perlin(g4, 4, px, py, pz) + perlin(g8, 8, px, py, pz) * 0.5 + perlin(g16, 16, px, py, pz) * 0.25) * 0.75 + 0.5;
    // Perlin-Worley: billowy Perlin shapes with the cauliflower edges of Worley noise
    const pw = (p - (wf - 1) * 0.6) / (1 + 0.6) + (wf - 0.5) * 0.35;
    const wisps = (perlin(g3, 3, px, py, pz) + perlin(g6, 6, px, py, pz) * 0.5 + perlin(g12, 12, px, py, pz) * 0.25) * 0.8 + 0.5;
    const o = ((z * n + y) * n + x) * 4;
    data[o] = clamp(pw); data[o + 1] = clamp(wf); data[o + 2] = clamp(b * 0.6 + c * 0.4); data[o + 3] = clamp(wisps);
  }
  const tex = new Data3DTexture(data, n, n, n);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Up to four cyclones: xyz = centre direction, w = strength (0 = none). */
export const uCyclones = [0, 1, 2, 3].map(() => uniform(new Vector4(0, 1, 0, 0)));

export class VolumetricClouds {
  readonly mesh: Mesh;
  readonly noise: Data3DTexture;
  /** Ray-march steps through the layer; fewer on weak devices. */
  readonly steps = uniform(22, 'int');
  /** 0 or 1: skip the finest erosion noise on weak devices. */
  readonly detail = uniform(1);
  /** Light reaching a point on the ground or sea (1 = full sun). */
  readonly shadow: (p: N) => N;

  constructor(cover: CubeTexture, seed: number, noiseSize = 64, lightSteps = 4, cityLight?: CubeTexture) {
    this.noise = buildCloudNoise(noiseSize, seed);
    const noise = this.noise;
    const L: N = uSunDir, M: N = uMoonDir;
    const noiseAt = (p: N): N => (texture3D(noise, p) as any).level(0);

    /** The whole sky turns slowly, so clouds drift without shearing. */
    const drift = Fn(([p]: [N]) => {
      const a = uTime.mul(0.0035);
      const c = cos(a), s = sin(a);
      return vec3(p.x.mul(c).sub(p.z.mul(s)), p.y, p.x.mul(s).add(p.z.mul(c)));
    });

    /** Cloud cover from the simulation, plus the spiral bands and clear eye of cyclones. Returns (amount, storminess). */
    const weather = Fn(([dir]: [N]) => {
      const c: N = (samplePlanet(cover, dir) as any).level(0).a;
      const amount = c.mul(0.95).add(0.05).mul(uCloudAmount).add(uSteam).toVar();
      const storm = smoothstep(0.62, 0.9, c).toVar();
      for (const cy of uCyclones) {
        const u: N = cy;
        const centre: N = u.xyz;
        const rho = sqrt(max(float(2).sub(dot(dir, centre).mul(2)), 1e-8));
        // a frame around the centre to measure the angle of the spiral arms
        const east = normalize(vec3(centre.z, 0, centre.x.negate()).add(vec3(1e-4, 0, 0)));
        const north = centre.cross(east);
        const theta = atan(dot(dir, north), dot(dir, east));
        const reach = float(0.26);
        const arms = smoothstep(0.25, 0.75, sin(theta.mul(2).add(log(rho.add(0.004)).mul(5.5)).add(uTime.mul(0.05))).mul(0.5).add(0.5));
        const body = float(1).sub(smoothstep(0.09, reach, rho));
        const eye = smoothstep(0.007, 0.016, rho);
        const wall = float(1).sub(smoothstep(0.016, 0.05, rho));
        const add = max(body.mul(arms.mul(0.85).add(0.15)), wall).mul(eye).mul(u.w);
        amount.assign(mix(amount, max(amount, add.mul(1.05)), u.w.mul(float(1).sub(smoothstep(reach.mul(0.8), reach, rho)))).mul(mix(float(1), eye, u.w)));
        storm.assign(max(storm, wall.mul(eye).mul(u.w)));
      }
      return vec4(amount, storm, c, 0);
    });

    /** Density 0..~1.6 at a point in the layer. fine = also carve the edges with the finest noise. */
    const densityAt = (p: N, fine: boolean): N => {
      const r = length(p);
      const dir = p.div(r);
      const hN = r.sub(CLOUD_BASE).div(THICK);
      const wx: N = weather(dir);
      const amount: N = wx.x, storm: N = wx.y;
      const out = float(0).toVar();
      If(amount.greaterThan(0.03), () => {
      const q: N = drift(p);
      const n1: N = noiseAt(q.mul(3.1));
      const n2: N = noiseAt(q.mul(13).add(vec3(0.31, 0.17, 0.73)));
      const base = n1.r.mul(0.55).add(n2.r.mul(0.45));
      // how tall clouds grow here: fair-weather heaps stay low, storm cells tower to the top and spread into an anvil
      const top = mix(float(0.36), float(0.97), storm).mul(n1.a.mul(0.5).add(0.72));
      const polar = smoothstep(0.78, 0.95, abs(dir.y));
      const lowTop = mix(top, float(0.2), polar.mul(float(1).sub(storm)));
      const bottom = smoothstep(0.0, 0.07, hN);
      const upper = float(1).sub(smoothstep(lowTop.mul(0.5), lowTop, hN));
      const anvil = storm.mul(smoothstep(0.68, 0.84, hN)).mul(float(1).sub(smoothstep(0.92, 1.0, hN))).mul(0.45);
      const covP = amount.mul(1.08).clamp(0, 1).mul(bottom.mul(upper)).add(anvil.mul(amount)).clamp(0, 1);
      let d: N = base.sub(float(1).sub(covP)).div(max(covP, 0.001)).clamp(0, 1);
      // thin, high streaks of ice cloud
      const streak = smoothstep(0.52, 0.78, n2.a.mul(0.55).add(n1.a.mul(0.45)));
      const cirrus = streak.mul(smoothstep(0.78, 0.84, hN)).mul(float(1).sub(smoothstep(0.88, 0.94, hN))).mul(smoothstep(0.12, 0.45, amount)).mul(0.07);
      if (fine) {
        const n3: N = noiseAt(q.mul(57).add(vec3(0, uTime.mul(0.004), 0)));
        const erode = n3.g.mul(0.6).add(n3.b.mul(0.4)).mul(0.42).mul(this.detail);
        d = d.sub(erode.mul(float(1).sub(d))).div(float(1).sub(erode.mul(float(1).sub(d))).max(0.001)).clamp(0, 1);
      }
      out.assign(d.mul(mix(float(1), float(1.6), storm)).add(cirrus));
      });
      return out;
    };
    const densityFine = Fn(([p]: [N]) => densityAt(p, true));
    const densityCoarse = Fn(([p]: [N]) => densityAt(p, false));

    this.shadow = Fn(([p]: [N]) => {
      const dir = normalize(p);
      const cosz = max(dot(dir, L), 0.14);
      const q = p.add(L.mul(float(CLOUD_BASE + THICK * 0.22).sub(length(p)).div(cosz)));
      const d = densityCoarse(q.mul(float(CLOUD_BASE + THICK * 0.22).div(length(q))));
      return mix(float(1), exp(d.mul(-5)), 0.86);
    }) as unknown as (p: N) => N;

    const plumeAt = Fn(([p]: [N]) => {
      const r = length(p);
      const dir = p.div(r);
      const hN = r.sub(CLOUD_BASE).div(THICK).clamp(0, 1);
      const out = vec3(0, 0, 0).toVar();
      for (let k = 0; k < uPlumes.length; k++) {
        const src: N = uPlumes[k], wnd: N = uPlumeWind[k];
        If(src.w.greaterThan(0.01), () => {
          // the column leans downwind as it climbs, and spreads; ash tops flatten into an anvil
          const centre: N = (normalize as any)(src.xyz.add(wnd.xyz.mul(hN.mul(hN.add(0.4)))));
          const ang = sqrt(max(float(2).sub(dot(dir, centre).mul(2)), 0));
          const width = float(0.012).add(pow(hN, 1.5).mul(0.05)).add(smoothstep(0.7, 1.0, hN).mul(0.045).mul(wnd.w));
          const billow = sin(p.x.mul(310).add(uTime.mul(0.4))).mul(sin(p.y.mul(270).sub(uTime.mul(0.3)))).mul(sin(p.z.mul(330))).mul(0.3).add(0.8);
          const top = float(1).sub(smoothstep(mix(float(0.5), float(0.92), wnd.w), mix(float(0.7), float(1.0), wnd.w), hN));
          const dens = exp(ang.div(width).pow(2).negate()).mul(src.w).mul(billow).mul(top).mul(1.15);
          out.addAssign((vec3 as any)(dens, dens.mul(wnd.w), dens.mul(pow(float(1).sub(hN), 5)).mul(wnd.w).mul(0.5)));
        });
      }
      return vec3(out.x, out.y.div(max(out.x, 1e-4)), out.z);
    });

    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: BackSide });
    const march = Fn(() => {
      const ro: N = cameraPosition;
      const rd: N = normalize(positionWorld.sub(cameraPosition));
      const b = dot(ro, rd), c = dot(ro, ro);
      const discT = b.mul(b).sub(c.sub(CLOUD_TOP * CLOUD_TOP));
      const discB = b.mul(b).sub(c.sub(CLOUD_BASE * CLOUD_BASE));
      const sT = sqrt(max(discT, 0)), sB = sqrt(max(discB, 0));
      const tT0 = b.negate().sub(sT), tT1 = b.negate().add(sT);
      const tB0 = b.negate().sub(sB), tB1 = b.negate().add(sB);
      const above = c.greaterThan(CLOUD_TOP * CLOUD_TOP), below = c.lessThan(CLOUD_BASE * CLOUD_BASE);
      const hitsBase = discB.greaterThan(0).and(tB0.greaterThan(0));
      const start = select(above, max(tT0, 0), select(below, tB1, float(0)));
      const endRaw = select(below, tT1, select(hitsBase, tB0, tT1));
      // nothing behind solid ground, trees or animals
      const depth: N = viewportDepthTexture();
      const viewZ: N = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
      const tSolid = viewZ.div(normalize(positionView).z);
      const end = min(min(endRaw, tSolid), start.add(0.7));
      const span = max(end.sub(start), 0).mul(select(discT.greaterThan(0).and(tT1.greaterThan(0)), 1, 0));
      const ds = span.div(float(this.steps));
      // a per-pixel offset hides the banding of the steps
      const sc: N = screenCoordinate;
      const jitter = sc.x.mul(0.06711056).add(sc.y.mul(0.00583715)).fract().mul(52.9829189).fract();
      const T = float(1).toVar();
      const C = vec3(0).toVar();
      const mu = dot(rd, L);
      const hg = (g: number): N => float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(mu.mul(2 * g)), 1.5));
      const phase = mix(float(1), hg(0.8).mul(0.65).add(hg(-0.25).mul(0.35)).mul(4 * Math.PI), 0.5).min(3.5);
      If(span.greaterThan(1e-5), () => {
        (Loop as any)({ start: int(0), end: this.steps, type: 'int', condition: '<' }, ({ i }: { i: N }) => {
          const t = start.add(ds.mul(float(i).add(jitter)));
          const p: N = ro.add(rd.mul(t));
          const dCloud: N = densityFine(p);
          // columns of volcanic ash and wood smoke: x = density, y = how much of it is dark ash, z = glow from the fire below
          const pl: N = plumeAt(p);
          const d: N = dCloud.add(pl.x);
          If(d.greaterThan(0.002), () => {
            const r = length(p);
            const dir = p.div(r);
            const hN = r.sub(CLOUD_BASE).div(THICK).clamp(0, 1);
            // how much cloud lies between here and the star
            const tau = float(0).toVar();
            for (let k = 0; k < lightSteps; k++) {
              const sl = THICK * 0.07 * Math.pow(2.1, k);
              tau.addAssign(densityCoarse(p.add(L.mul(sl))).mul(sl * (k === 0 ? 1.5 : 1.1) * SIGMA));
            }
            const tl = max(exp(tau.negate()), exp(tau.mul(-0.22)).mul(0.62));
            const sunH = dot(dir, L).add(hN.mul(0.05));
            const sunVis = smoothstep(-0.11, 0.07, sunH);
            const day = smoothstep(-0.2, 0.25, sunH);
            const sunColor = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.03, 0.32, sunH));
            const powder = float(1).sub(exp(d.mul(-2.6))).mul(0.5).add(0.5);
            const sunLit = sunColor.mul(sunVis).mul(tl).mul(phase).mul(powder).mul(1.55);
            const skyLit = mix(vec3(uHazeTint), vec3(1, 1, 1), 0.55).mul(day).mul(hN.mul(0.7).add(0.3)).mul(0.42);
            const moonUp = smoothstep(-0.1, 0.25, dot(dir, M));
            const moonLit = vec3(uLook.moon).mul(0.05).mul(hN.mul(0.75).add(0.25)).mul(moonUp).mul(float(1).sub(day)).mul(dot(rd, M).mul(0.3).add(1));
            const glow = vec3(0.006, 0.009, 0.012);
            let flash: N = float(0);
            for (const bolt of uBolts) {
              const bb: N = bolt;
              const dv = p.sub(bb.xyz.mul(CLOUD_BASE + THICK * 0.3));
              flash = flash.add(exp(dot(dv, dv).mul(-2200)).mul(bb.w));
            }
            // cities under cloud light it softly from below, in their own colour
            let city: N = vec3(0, 0, 0);
            if (cityLight) {
              const CA: N = (samplePlanet(cityLight, dir) as any).level(0);
              const top = max(max(CA.r, CA.g), CA.b);
              city = CA.rgb.div(max(top, 0.04)).mul(pow(CA.a, 1.4)).mul(float(1).sub(hN).pow(2)).mul(float(1).sub(day)).mul(0.5);
            }
            const sootShare = pl.x.div(max(d, 1e-4));
            const tone: N = mix(vec3(1, 1, 1), mix(vec3(0.4, 0.38, 0.36), vec3(0.11, 0.1, 0.1), pl.y), sootShare);
            const light = sunLit.add(skyLit).add(moonLit).mul(tone).add(glow).add(city).add(vec3(0.75, 0.83, 1.0).mul(flash).mul(5)).add(vec3(3.2, 0.8, 0.12).mul(pl.z));
            const a = float(1).sub(exp(d.mul(ds).mul(-SIGMA)));
            C.addAssign(light.mul(a).mul(T));
            T.mulAssign(float(1).sub(a));
          });
          If(T.lessThan(0.015), () => { Break(); });
        });
      });
      const alpha = float(1).sub(T);
      // far clouds sink into the colour of the air
      const haze = vec3(uHazeTint).mul(smoothstep(-0.2, 0.3, dot(normalize(ro.add(rd.mul(start))), L)).mul(0.85).add(0.02));
      const farFade = select(above, float(0), smoothstep(0.08, 0.6, start).mul(0.75));
      return vec4(mix(C.div(max(alpha, 1e-4)), haze, farFade), alpha);
    });
    const out: N = march();
    material.colorNode = out.rgb;
    material.opacityNode = out.a;
    this.mesh = new Mesh(new SphereGeometry(CLOUD_TOP * 1.012, 72, 48), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /** Place cyclones (cells of hurricanes and of the eternal storm). */
  setCyclones(dirs: [number, number, number][]): void {
    for (let i = 0; i < uCyclones.length; i++) {
      const u = uCyclones[i]!.value as Vector4;
      const d = dirs[i];
      if (d) u.set(d[0], d[1], d[2], 1); else u.w = 0;
    }
  }
}
