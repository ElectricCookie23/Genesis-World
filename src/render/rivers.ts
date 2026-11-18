// Rivers: ribbon meshes that follow the water flow from the mountains to the sea.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, cameraPosition, dot, float, max, mix, normalize, positionWorld, pow, reflect, sin, smoothstep, vec3 } from 'three/tsl';
import type { Grid } from '../sim/world';
import type { CellSnapshot } from '../shared/protocol';
import { EXAG, uSunDir, uTime } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX_SEGMENTS = 9000;

export class Rivers {
  readonly mesh: Mesh;
  private positions = new Float32Array(MAX_SEGMENTS * 4 * 3);
  private flowAttr = new Float32Array(MAX_SEGMENTS * 4 * 2);
  private geometry = new BufferGeometry();
  private lastBuild = -1e9;

  constructor(private grid: Grid) {
    const index = new Uint32Array(MAX_SEGMENTS * 6);
    for (let i = 0; i < MAX_SEGMENTS; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('flow', new BufferAttribute(this.flowAttr, 2));
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.geometry.setDrawRange(0, 0);
    const material = new MeshBasicNodeMaterial({ side: DoubleSide });
    const P = positionWorld;
    const up = normalize(P);
    const L = uSunDir;
    const sunHeight = dot(up, L);
    const day = smoothstep(-0.12, 0.22, sunHeight);
    const f: any = attribute('flow', 'vec2');
    // light ripples run downstream
    const ripple = sin(f.x.mul(40).sub(uTime.mul(2.2))).mul(0.5).add(0.5);
    const V = normalize(cameraPosition.sub(P));
    const glint = pow(max(dot(reflect(V.negate(), up), L), 0), 60).mul(1.6);
    const water = mix(vec3(0.025, 0.17, 0.33), vec3(0.06, 0.3, 0.45), ripple.mul(0.3));
    material.colorNode = water.mul(day.mul(1.1).add(0.04)).add(vec3(1.0, 0.95, 0.85).mul(glint).mul(day)).mul(float(0.85).add(f.y.mul(0.15)));
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Rebuild the ribbons from the current drainage. Cheap enough to run every few seconds. */
  update(cells: CellSnapshot, now: number, force = false): void {
    if (!force && now - this.lastBuild < 4000) return;
    this.lastBuild = now;
    const { pos } = this.grid;
    const { flow, downhill, elevation, seaLevel, temperature, snow } = cells;
    const P = this.positions, F = this.flowAttr;
    let n = 0;
    const threshold = 1.6;
    const lift = 0.0004;
    const rad = (c: number) => 1 + Math.max(elevation[c]!, seaLevel) * EXAG + lift;
    for (let i = 0; i < this.grid.count && n < MAX_SEGMENTS; i++) {
      const fl = flow[i]!;
      const d = downhill[i]!;
      if (fl < threshold || d < 0 || elevation[i]! <= seaLevel || temperature[i]! < -2 || snow[i]! > 1.5) continue;
      const dd = elevation[d]! > seaLevel ? downhill[d]! : -1;
      // run from the middle of this step to the middle of the next: cutting corners smooths the grid zigzag
      const ri = rad(i), rd = rad(d);
      const ax = (pos[i * 3]! * ri + pos[d * 3]! * rd) / 2, ay = (pos[i * 3 + 1]! * ri + pos[d * 3 + 1]! * rd) / 2, az = (pos[i * 3 + 2]! * ri + pos[d * 3 + 2]! * rd) / 2;
      let bx: number, by: number, bz: number;
      if (dd >= 0) {
        const r2 = rad(dd);
        bx = (pos[d * 3]! * rd + pos[dd * 3]! * r2) / 2; by = (pos[d * 3 + 1]! * rd + pos[dd * 3 + 1]! * r2) / 2; bz = (pos[d * 3 + 2]! * rd + pos[dd * 3 + 2]! * r2) / 2;
      } else { bx = pos[d * 3]! * rd; by = pos[d * 3 + 1]! * rd; bz = pos[d * 3 + 2]! * rd; }
      // side vector: across the flow, flat on the ground
      const sx = (by - ay) * az - (bz - az) * ay, sy = (bz - az) * ax - (bx - ax) * az, sz = (bx - ax) * ay - (by - ay) * ax;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const fd = flow[d]! > fl ? flow[d]! : fl;
      const wa = Math.min(0.0016, 0.00028 + 0.00017 * Math.sqrt((fl + fd) / 2)) / sl;
      const wb = Math.min(0.0016, 0.00028 + 0.00017 * Math.sqrt(fd)) / sl;
      const o = n * 12;
      P[o] = ax + sx * wa; P[o + 1] = ay + sy * wa; P[o + 2] = az + sz * wa;
      P[o + 3] = ax - sx * wa; P[o + 4] = ay - sy * wa; P[o + 5] = az - sz * wa;
      P[o + 6] = bx + sx * wb; P[o + 7] = by + sy * wb; P[o + 8] = bz + sz * wb;
      P[o + 9] = bx - sx * wb; P[o + 10] = by - sy * wb; P[o + 11] = bz - sz * wb;
      const u0 = (i % 97) / 97, len = 0.35;
      const q = n * 8;
      F[q] = u0; F[q + 1] = 1; F[q + 2] = u0; F[q + 3] = 0; F[q + 4] = u0 + len; F[q + 5] = 1; F[q + 6] = u0 + len; F[q + 7] = 0;
      n++;
    }
    this.geometry.setDrawRange(0, n * 6);
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.flow!.needsUpdate = true;
  }
}
