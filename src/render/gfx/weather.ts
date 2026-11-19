// Rain and snow around the camera: thousands of streaks (or flakes) that live entirely on the GPU.
// Each one falls through a box that travels with the camera and wraps around, leaning with the wind.
import { DoubleSide, InstancedBufferAttribute, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import { Copies } from './packed';
import { attribute, cameraPosition, cross, dot, float, fract, length, mix, normalize, positionGeometry, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { uSunDir, uTime } from '../common';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export class Precipitation {
  readonly mesh: Copies;
  /** 0..1 how hard it rains or snows at the camera. */
  readonly amount = uniform(0);
  /** 0 rain, 1 snow. */
  readonly snow = uniform(0);
  /** Wind along the ground at the camera, as a world vector (planet radii per second). */
  readonly wind = uniform(new Vector3());

  constructor(count = 6000) {
    const g = new PlaneGeometry(1, 1);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('iSeed', new InstancedBufferAttribute(seed, 4));
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const s: N = attribute('iSeed', 'vec4');
    const B = 0.0055;
    const up: N = normalize(cameraPosition);
    const east: N = normalize(cross(vec3(0, 1, 0), up).add(vec3(1e-4, 0, 0)));
    const north: N = cross(up, east);
    const fall = mix(float(0.0042), float(0.0006), this.snow).mul(s.w.mul(0.4).add(0.8));
    const w: N = vec3(this.wind);
    // snow wanders as it falls
    const wander = vec3(s.w.mul(40).add(uTime.mul(1.3)).sin(), 0, s.w.mul(60).add(uTime.mul(1.1)).cos()).mul(this.snow).mul(0.0002);
    const vel: N = w.add(up.mul(fall.negate()));
    // position inside the travelling box, wrapped; the box is fixed to the ground frame so drops do not follow head turns
    const anchor: N = vec3(dot(cameraPosition, east), dot(cameraPosition, up), dot(cameraPosition, north));
    const drift: N = vec3(dot(vel, east), dot(vel, up), dot(vel, north)).mul(uTime);
    const q: N = fract(s.xyz.add(drift.sub(anchor).div(2 * B))).mul(2 * B).sub(B);
    const centre: N = cameraPosition.add(east.mul(q.x)).add(up.mul(q.y)).add(north.mul(q.z)).add(east.mul(wander.x)).add(north.mul(wander.z));
    const axis: N = normalize(vel);
    const toCam: N = normalize(cameraPosition.sub(centre));
    const side: N = normalize(cross(axis, toCam));
    const len = mix(float(0.00032), float(0.000018), this.snow);
    const wid = mix(float(0.0000045), float(0.000018), this.snow);
    // only as many drops as the weather calls for
    const shown = smoothstep(s.w.sub(0.02), s.w.add(0.02), this.amount.mul(1.05));
    material.positionNode = centre.add(axis.mul(positionGeometry.y.mul(len))).add(side.mul(positionGeometry.x.mul(wid))).mul(shown).add(cameraPosition.mul(float(1).sub(shown)));
    const day = smoothstep(-0.12, 0.22, dot(up, uSunDir));
    const lit = day.mul(0.85).add(0.06);
    material.colorNode = mix(vec3(0.62, 0.68, 0.76), vec3(0.95, 0.96, 1.0), this.snow).mul(lit);
    const c = uv().sub(0.5);
    const soft = mix(float(1).sub(smoothstep(0.2, 0.5, c.x.abs())).mul(float(1).sub(smoothstep(0.3, 0.5, c.y.abs()))), float(1).sub(smoothstep(0.25, 0.5, length(c))), this.snow);
    // drops right at the eye are faded so they do not flash across the lens
    const near = smoothstep(0.0002, 0.0012, length(q));
    material.opacityNode = soft.mul(mix(float(0.2), float(0.85), this.snow)).mul(near).mul(shown);
    this.mesh = new Copies(g, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
  }

  /** amount 0..1, snow or rain, and the wind as a world vector. */
  set(amount: number, snowing: boolean, wx: number, wy: number, wz: number): void {
    this.amount.value += (amount - this.amount.value) * 0.05;
    this.snow.value = snowing ? 1 : 0;
    (this.wind.value as Vector3).set(wx, wy, wz);
    this.mesh.visible = this.amount.value > 0.01;
  }
}
