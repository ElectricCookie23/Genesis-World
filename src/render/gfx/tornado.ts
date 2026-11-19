// Tornadoes: a twisting funnel of dust from the ground to the cloud base under a storm cell over
// land, swaying like a rope. Over a big fire the same funnel burns orange.
import { DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshBasicNodeMaterial, CylinderGeometry, type Texture } from 'three/webgpu';
import { attribute, cameraPosition, cos, cross, dot, float, mix, normalGeometry, normalize, positionGeometry, positionWorld, pow, sin, smoothstep, uv, varying, vec3 } from 'three/tsl';
import { EXAG, uSunDir, uTime } from '../common';
import { uLook } from './look';
import type { PlanetData } from './planetdata';
import { groundRadiusNode } from './terrain';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export interface Twister { dir: [number, number, number]; fire: boolean; seed: number; }

export class Tornadoes {
  readonly mesh: InstancedMesh;
  private iDir: InstancedBufferAttribute;
  private iData: InstancedBufferAttribute;

  constructor(data: PlanetData, erosionTex: Texture, cap = 6) {
    // a unit column: y from 0 (ground) to 1 (cloud base), radius 1; the shader shapes it
    const g = new CylinderGeometry(1, 1, 1, 14, 28, true).translate(0, 0.5, 0);
    this.iDir = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.iData = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); // seed, fire, strength, unused
    this.iDir.setUsage(DynamicDrawUsage); this.iData.setUsage(DynamicDrawUsage);
    g.setAttribute('iDir', this.iDir); g.setAttribute('iData', this.iData);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const aDir: N = attribute('iDir', 'vec3'), aData: N = attribute('iData', 'vec4');
    const p: N = positionGeometry;
    const h: N = p.y;
    const t = uTime, seed: N = aData.x;
    const HEIGHT = 1.4 * EXAG;
    // narrow at the ground, flaring into the cloud
    const radius = float(0.00012).add(pow(h, 2.2).mul(0.0011)).mul(aData.z);
    // the rope wanders: slow bends that travel up it
    const swayX = sin(h.mul(5).sub(t.mul(1.1)).add(seed.mul(20))).mul(0.00035).mul(h.mul(0.8).add(0.2)).add(sin(t.mul(0.4).add(seed.mul(9))).mul(0.0004).mul(h));
    const swayZ = cos(h.mul(4).sub(t.mul(0.9)).add(seed.mul(13))).mul(0.00035).mul(h.mul(0.8).add(0.2));
    const east: N = normalize(cross(vec3(0, 1, 0), aDir).add(vec3(1e-4, 0, 0)));
    const north: N = cross(aDir, east);
    // spin the wall
    const spin = t.mul(5).add(h.mul(6));
    const cs = cos(spin), sn = sin(spin);
    const rx = p.x.mul(cs).sub(p.z.mul(sn)), rz = p.x.mul(sn).add(p.z.mul(cs));
    const base: N = aDir.mul(groundRadiusNode(data, erosionTex, aDir));
    material.positionNode = base.add(aDir.mul(h.mul(HEIGHT))).add(east.mul(rx.mul(radius).add(swayX))).add(north.mul(rz.mul(radius).add(swayZ)));
    const nx = normalGeometry.x.mul(cs).sub(normalGeometry.z.mul(sn)), nz = normalGeometry.x.mul(sn).add(normalGeometry.z.mul(cs));
    const nW: N = varying(normalize(east.mul(nx).add(north.mul(nz))));
    const vH: N = varying(h);
    const vFire: N = varying(aData.y);
    const vUp: N = varying(aDir);
    const q: N = uv();
    // streaks of debris winding round the funnel
    const streak = sin(q.x.mul(37.7).add(q.y.mul(21)).sub(t.mul(7))).mul(sin(q.x.mul(12.6).sub(q.y.mul(9)).add(t.mul(3)))).mul(0.5).add(0.5);
    const V: N = normalize(cameraPosition.sub(positionWorld));
    // a column of dust is thickest through its middle and thin at its edges
    const facing = pow(dot(nW, V).abs(), 1.3);
    const day = smoothstep(-0.12, 0.22, dot(vUp, uSunDir));
    const dust: N = mix(vec3(0.42, 0.36, 0.3), vec3(0.2, 0.19, 0.19), vH).mul(mix(float(0.75), float(1.15), streak)).mul(vec3(uLook.star).mul(day.mul(0.9)).add(0.03));
    const flame: N = mix(vec3(4.0, 1.5, 0.2), vec3(1.6, 0.25, 0.04), vH).mul(streak.mul(0.8).add(0.5));
    material.colorNode = mix(dust, flame, vFire);
    material.opacityNode = facing.mul(streak.mul(0.4).add(0.55)).mul(smoothstep(0.0, 0.04, vH)).mul(float(1).sub(smoothstep(0.85, 1.0, vH))).mul(0.9);
    this.mesh = new InstancedMesh(g, material, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  set(list: Twister[]): void {
    const n = Math.min(list.length, this.iDir.count);
    for (let i = 0; i < n; i++) {
      const tw = list[i]!;
      this.iDir.setXYZ(i, tw.dir[0], tw.dir[1], tw.dir[2]);
      this.iData.setXYZW(i, tw.seed, tw.fire ? 1 : 0, 1, 0);
    }
    this.mesh.count = n;
    this.iDir.needsUpdate = this.iData.needsUpdate = true;
  }
}
