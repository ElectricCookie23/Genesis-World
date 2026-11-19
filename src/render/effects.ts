// Special effects. For now: the protoplanetary dust disc of the opening sequence.
import { AdditiveBlending, DoubleSide, Mesh, MeshBasicNodeMaterial, RingGeometry } from 'three/webgpu';
import { atan, exp, float, length, mix, mx_fractal_noise_float, positionLocal, pow, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { uSunDir, uTime } from './common';

export const uDiscOpacity = uniform(0);
export const uDiscCollapse = uniform(0);

export function createDustDisc(): Mesh {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
  const p = positionLocal;
  const r = length(p.xy);
  const a = atan(p.y, p.x);
  // spiral arms that wind inward; noise makes clumps of rock and dust
  const swirl = a.add(r.mul(2.2)).add(uTime.mul(0.35)).add(uDiscCollapse.mul(6));
  const q = vec3(swirl.cos().mul(r), swirl.sin().mul(r), uTime.mul(0.05));
  const n = mx_fractal_noise_float(q.mul(1.8), 5, 2.2, 0.55).mul(0.5).add(0.5);
  const clumps = pow(mx_fractal_noise_float(q.mul(9), 3, 2.0, 0.5).mul(0.5).add(0.5), 5).mul(6);
  const outer = float(4.6).sub(uDiscCollapse.mul(3.9));
  const falloff = smoothstep(outer, outer.mul(0.35), r).mul(smoothstep(0.0, 0.5, r));
  const core = exp(r.mul(-2.6)).mul(3.5);
  const heat = smoothstep(2.4, 0.2, r);
  const color = vec3(1.0, 0.42, 0.14).mul(heat).add(vec3(0.5, 0.3, 0.42).mul(float(1).sub(heat)));
  material.colorNode = color.mul(n.mul(n).mul(1.6).add(clumps.mul(0.5))).mul(falloff).add(vec3(1.0, 0.75, 0.45).mul(core)).mul(uDiscOpacity);
  const mesh = new Mesh(new RingGeometry(0.02, 5, 128, 24), material);
  mesh.rotation.x = -Math.PI / 2 + 0.38;
  mesh.rotation.y = 0.2;
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}

// ---------------------------------------------------------------- particles
import { DynamicDrawUsage, InstancedBufferAttribute, Sprite, SpriteNodeMaterial, Vector3 as V3 } from 'three/webgpu';
import { instancedBufferAttribute, normalize } from 'three/tsl';
import type { Grid } from '../sim/world';
import type { CellSnapshot } from '../shared/protocol';
import { Biome } from '../sim/world';
import { EXAG } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX_PARTICLES = 3000;

/** Smoke, ash, embers, steam, rain, snow, dust and debris, as camera-facing sprites. */
export class ParticleSystem {
  readonly sprite: Sprite;
  private start = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
  private vel = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
  /** birth time, lifetime, size, lift (how fast it accelerates upward; negative falls) */
  private data = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4);
  /** rgb colour and opacity */
  private tint = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4);
  private next = 0;
  private near: number[] = [];
  private nearFocus = new V3(9, 9, 9);
  private time = 0;
  private dirty = false;

  constructor(private grid: Grid) {
    for (const a of [this.start, this.vel, this.data, this.tint]) a.setUsage(DynamicDrawUsage);
    for (let i = 0; i < MAX_PARTICLES; i++) this.data.setXYZW(i, -1e6, 1, 0, 0);
    const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
    const s: any = instancedBufferAttribute(this.start);
    const v: any = instancedBufferAttribute(this.vel);
    const d: any = instancedBufferAttribute(this.data);
    const c: any = instancedBufferAttribute(this.tint);
    const age = uTime.sub(d.x);
    const k = age.div(d.y).clamp(0, 1);
    // drift with its velocity, and rise (or fall) along the local vertical
    // a lift above 50 marks a sound ripple: it stays put and is drawn as a thin expanding ring
    const ripple = d.w.greaterThan(50).select(1, 0);
    material.positionNode = s.add(v.mul(age)).add(normalize(s).mul(d.w.mul(float(1).sub(ripple))).mul(age).mul(age));
    const alive = smoothstep(0.0, 0.08, k).mul(smoothstep(1.0, 0.55, k)).mul(age.greaterThan(0).and(age.lessThan(d.y)).select(1, 0));
    material.scaleNode = d.z.mul(k.mul(1.6).add(0.5)).mul(alive.greaterThan(0).select(1, 0));
    // smoke, steam and dust are only seen by the light that falls on them; fire and embers shine by themselves
    const dayLit = smoothstep(-0.12, 0.22, (normalize(s) as any).dot(uSunDir)).mul(0.93).add(0.05);
    const selfLit = smoothstep(1.1, 1.4, c.x.max(c.y).max(c.z));
    material.colorNode = vec3(c.x, c.y, c.z).mul(mix(dayLit, float(1), selfLit));
    // soft round puffs rather than squares
    const rd = length(uv().sub(0.5));
    const round = mix(smoothstep(0.5, 0.15, rd), smoothstep(0.36, 0.44, rd).mul(smoothstep(0.5, 0.45, rd)), ripple);
    material.opacityNode = c.w.mul(alive).mul(round);
    this.sprite = new Sprite(material);
    (this.sprite as any).count = MAX_PARTICLES;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 7;
  }

  private emit(p: V3, vx: number, vy: number, vz: number, life: number, size: number, lift: number, r: number, g: number, b: number, a: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
    this.start.setXYZ(i, p.x, p.y, p.z);
    this.vel.setXYZ(i, vx, vy, vz);
    this.data.setXYZW(i, this.time, life, size, lift);
    this.tint.setXYZW(i, r, g, b, a);
    this.dirty = true;
  }

  /** Dust kicked up by feet, a splash, or a wake ring on the water. kind 0 wake, 1 dust, 2 splash. */
  puff(p: V3, kind: number, size: number): void {
    if (kind === 0) this.emit(p, 0, 0, 0, 1.6, size * 1.6, 99, 0.85, 0.92, 0.95, 0.4);
    else if (kind === 1) this.emit(p, (Math.random() - 0.5) * size * 0.4, 0, (Math.random() - 0.5) * size * 0.4, 1.2 + Math.random(), size * 0.45, size * 0.08, 0.62, 0.52, 0.4, 0.3);
    else for (let i = 0; i < 3; i++) this.emit(p, (Math.random() - 0.5) * size, 0, (Math.random() - 0.5) * size, 0.5 + Math.random() * 0.4, size * 0.2, size * 0.9 - 0.004, 0.9, 0.95, 1.0, 0.6);
  }

  /** A ripple of sound spreading from a calling animal. */
  ripple(p: V3, size: number): void {
    this.emit(p, 0, 0, 0, 1.3, size, 99, 0.75, 0.95, 1.0, 0.55);
  }

  /** Debris, fireball and dust from a meteor strike at a unit direction. */
  impact(dir: V3): void {
    const p = new V3();
    for (let i = 0; i < 260; i++) {
      p.copy(dir).multiplyScalar(1.004 + Math.random() * 0.004);
      const sp = 0.02 + Math.random() * 0.06;
      const vx = (Math.random() - 0.5) * sp + dir.x * sp * 0.6, vy = (Math.random() - 0.5) * sp + dir.y * sp * 0.6, vz = (Math.random() - 0.5) * sp + dir.z * sp * 0.6;
      const hot = Math.random() < 0.4;
      this.emit(p, vx, vy, vz, 2.5 + Math.random() * 5, 0.008 + Math.random() * 0.018, -0.004, hot ? 3.2 : 0.25, hot ? 1.3 : 0.22, hot ? 0.3 : 0.2, hot ? 0.9 : 0.7);
    }
    // the entry streak, coming down from space
    for (let i = 0; i < 60; i++) {
      p.copy(dir).multiplyScalar(1.006 + i * 0.006).add(new V3(0.04, 0.02, 0.03).multiplyScalar(i * 0.12));
      this.emit(p, 0, 0, 0, 0.5 + i * 0.01, 0.0045 - i * 0.00004, 0, 4, 2.6, 1.2, 0.9);
    }
  }

  update(dt: number, time: number, cells: CellSnapshot | undefined, focus: V3, dist: number, storms: number[]): void {
    this.time = time;
    if (cells && dist < 1.6) {
      const { pos, count } = this.grid;
      if (focus.distanceToSquared(this.nearFocus) > 0.01 || !this.near.length) {
        this.nearFocus.copy(focus);
        this.near.length = 0;
        const cosR = Math.cos(Math.min(0.5, 0.12 + dist * 0.45));
        for (let i = 0; i < count; i++) if (pos[i * 3]! * focus.x + pos[i * 3 + 1]! * focus.y + pos[i * 3 + 2]! * focus.z > cosR) this.near.push(i);
      }
      const p = new V3();
      const scale = Math.max(0.25, Math.min(3, dist * 6));
      const tries = Math.min(this.near.length, Math.ceil(240 * dt * 60 / 60));
      for (let k = 0; k < tries; k++) {
        const c = this.near[Math.floor(Math.random() * this.near.length)]!;
        const land = cells.elevation[c]! > cells.seaLevel;
        const r = 1 + Math.max(cells.elevation[c]!, cells.seaLevel) * EXAG;
        p.set(pos[c * 3]!, pos[c * 3 + 1]!, pos[c * 3 + 2]!).multiplyScalar(r + 0.0005);
        p.x += (Math.random() - 0.5) * 0.012; p.y += (Math.random() - 0.5) * 0.012; p.z += (Math.random() - 0.5) * 0.012;
        const wx = -pos[c * 3 + 2]! * cells.windE[c]! * 0.004, wz = pos[c * 3]! * cells.windE[c]! * 0.004;
        const heat = cells.lava[c]!;
        if (heat > 0.25) {
          // fire and eruptions: dark smoke climbing and leaning with the wind, plus bright embers
          this.emit(p, wx, 0, wz, 4 + Math.random() * 5, 0.004 * scale * (0.6 + heat), 0.0009 * (0.5 + heat), 0.12, 0.11, 0.11, 0.55);
          if (Math.random() < 0.5) this.emit(p, wx * 2, 0, wz * 2, 0.8 + Math.random(), 0.0011 * scale, 0.004, 3.6, 1.4, 0.2, 0.9);
        } else if (land && ((c * 2654435761) >>> 0) % 2600 === 0 && Math.random() < 0.35) {
          // geysers and hot springs: white steam, in bursts
          if (Math.sin(time * 0.7 + c) > 0.2) this.emit(p, wx, 0, wz, 2.5 + Math.random() * 2, 0.0028 * scale, 0.0016, 0.95, 0.97, 1.0, 0.5);
        } else if (land && (cells.biome[c] === Biome.Desert || cells.biome[c] === Biome.SaltFlat) && Math.abs(cells.windE[c]!) > 0.75 && Math.random() < 0.25) {
          // dust lifted from dry ground by strong wind
          this.emit(p, wx * 6, 0, wz * 6, 4 + Math.random() * 4, 0.006 * scale, 0.0001, 0.78, 0.62, 0.42, 0.28);
        }
      }
      // weather at the camera: rain or snow under heavy cloud, a funnel under storm cells over land
      const here = this.near.length ? this.near[0]! : 0;
      void here;
      if (dist < 0.35) {
        for (const s of storms) {
          const d = pos[s * 3]! * focus.x + pos[s * 3 + 1]! * focus.y + pos[s * 3 + 2]! * focus.z;
          if (d < 0.9985) continue;
          const cold = cells.temperature[s]! < 0;
          for (let k = 0; k < 14; k++) {
            p.copy(focus).multiplyScalar(1 + Math.max(cells.elevation[s]!, cells.seaLevel) * EXAG + 0.006 + Math.random() * 0.01);
            p.x += (Math.random() - 0.5) * 0.03; p.y += (Math.random() - 0.5) * 0.03; p.z += (Math.random() - 0.5) * 0.03;
            this.emit(p, 0, 0, 0, cold ? 3 : 0.9, cold ? 0.0006 : 0.00045, cold ? -0.0012 : -0.02, 0.85, 0.9, 1, cold ? 0.8 : 0.45);
          }
          // tornado: a dark rope of debris under the storm, when it is over flat land
          if (cells.elevation[s]! > cells.seaLevel && Math.random() < 0.6) {
            const base = 1 + cells.elevation[s]! * EXAG;
            const a = time * 6 + Math.random() * 6.28, h = Math.random();
            p.set(pos[s * 3]!, pos[s * 3 + 1]!, pos[s * 3 + 2]!).multiplyScalar(base + h * 0.012);
            p.x += Math.cos(a) * 0.0012 * (0.4 + h); p.z += Math.sin(a) * 0.0012 * (0.4 + h);
            const fiery = cells.lava[s]! > 0.3;
            this.emit(p, Math.cos(a + 1.6) * 0.004, 0, Math.sin(a + 1.6) * 0.004, 1.2, 0.0022, 0.003, fiery ? 3 : 0.3, fiery ? 1.1 : 0.28, fiery ? 0.2 : 0.26, 0.7);
          }
        }
      }
    }
    void dt;
    if (this.dirty) {
      this.dirty = false;
      this.start.needsUpdate = true; this.vel.needsUpdate = true; this.data.needsUpdate = true; this.tint.needsUpdate = true;
    }
  }
}
