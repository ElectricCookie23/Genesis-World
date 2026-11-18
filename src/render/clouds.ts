// Cloud shell: noise-driven density that drifts with the wind bands and casts shadows.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn, attribute, cos, dot, exp, float, fract, max, mix, mx_fractal_noise_float, normalize, positionWorld, sin, smoothstep, vec3, abs,
} from 'three/tsl';
import type { Grid } from '../sim/world';
import type { CellSnapshot } from '../shared/protocol';
import { CLOUD_RADIUS, uBolts, uCloudAmount, uSteam, uSunDir, uTime } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Rotate a direction about the Y axis by an angle that depends on latitude band (zonal wind). */
const advect = Fn(([dir, phase]: [N, N]) => {
  const lat = dir.y;
  // trades blow west, westerlies blow east: matches the sim's wind bands
  const band = cos(lat.mul(4.7)).mul(-1).mul(float(1).sub(abs(lat).mul(0.6)));
  const a = band.mul(phase).mul(0.5);
  const c = cos(a), s = sin(a);
  return vec3(dir.x.mul(c).sub(dir.z.mul(s)), dir.y, dir.x.mul(s).add(dir.z.mul(c)));
});

const baseNoise = Fn(([p]: [N]) => {
  const warp = mx_fractal_noise_float(p.mul(2.1).add(vec3(13.1, 7.7, 3.3)), 2, 2.0, 0.5);
  const q = p.add(vec3(warp, warp.mul(-0.7), warp.mul(0.5)).mul(0.22));
  const big = mx_fractal_noise_float(q.mul(3.4), 4, 2.1, 0.5);
  const fine = mx_fractal_noise_float(q.mul(17).add(vec3(3.1, 8.2, 1.4)), 4, 2.2, 0.55);
  return big.add(fine.mul(0.42));
});

/** Cloud density 0..1 at a unit direction, given local cloud cover from the sim. */
export const cloudDensity = Fn(([dir, cover]: [N, N]) => {
  const t = uTime.mul(0.012);
  const p1 = fract(t);
  const p2 = fract(t.add(0.5));
  const w1 = float(1).sub(abs(p1.mul(2).sub(1)));
  const n1 = baseNoise(advect(dir, p1.sub(0.5)));
  const n2 = baseNoise(advect(dir, p2.sub(0.5)).add(vec3(5.3, 1.7, 9.2)));
  const n = mix(n2, n1, w1);
  const amount = cover.mul(0.95).add(0.05).mul(uCloudAmount).add(uSteam);
  const threshold = float(0.5).sub(amount.mul(0.7));
  return smoothstep(threshold, threshold.add(0.34), n);
});

/** Light reaching the ground at world position p (1 = full sun). */
export const cloudShadowAt = Fn(([p, cover]: [N, N]) => {
  const dir = normalize(normalize(p).add(uSunDir.mul(0.02)));
  return float(1).sub(cloudDensity(dir, cover).mul(0.62));
});

export class CloudLayer {
  readonly mesh: Mesh;
  private readonly cover: Float32Array;
  private readonly geometry: BufferGeometry;

  constructor(private readonly grid: Grid) {
    const g = new BufferGeometry();
    const positions = new Float32Array(grid.pos.length);
    for (let i = 0; i < positions.length; i++) positions[i] = grid.pos[i]! * CLOUD_RADIUS;
    g.setAttribute('position', new BufferAttribute(positions, 3));
    this.cover = new Float32Array(grid.count);
    g.setAttribute('cloudCover', new BufferAttribute(this.cover, 1));
    g.setIndex(new BufferAttribute(grid.tris, 1));
    this.geometry = g;

    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const dir = normalize(positionWorld);
    const cover = attribute('cloudCover', 'float');
    const d = cloudDensity(dir, cover);
    const L = uSunDir;
    const sunHeight = dot(dir, L);
    const day = smoothstep(-0.2, 0.25, sunHeight);
    // cheap self-shadowing: denser toward the sun means darker here
    const toward = cloudDensity(normalize(dir.add(L.mul(0.035))), cover);
    const shade = float(1).sub(toward.mul(0.55)).mul(mix(0.55, 1.0, max(sunHeight, 0)));
    const sunColor = mix(vec3(1.0, 0.42, 0.2), vec3(1.0, 0.98, 0.96), smoothstep(-0.05, 0.35, sunHeight));
    // storm cells: very dense cloud turns grey underneath
    const storm = smoothstep(0.75, 1.0, cover).mul(d);
    const base = mix(vec3(1.0, 1.0, 1.0), vec3(0.42, 0.45, 0.52), storm.mul(0.7));
    const lit = base.mul(sunColor).mul(shade).mul(day).mul(1.0).add(vec3(0.015, 0.02, 0.035).mul(d));
    // lightning lights storm clouds from inside, by day or night
    let flash: N = float(0);
    for (const bolt of uBolts) {
      const b: N = bolt;
      flash = flash.add(exp(float(1).sub(dot(dir, b.xyz)).mul(-2600)).mul(b.w));
    }
    material.colorNode = lit.add(vec3(0.72, 0.8, 1.0).mul(flash).mul(d.mul(0.7).add(0.3)));
    material.opacityNode = smoothstep(0.0, 0.6, d).mul(0.95);
    this.mesh = new Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  update(cells: CellSnapshot): void {
    this.cover.set(cells.cloud);
    this.geometry.attributes.cloudCover!.needsUpdate = true;
  }
}
