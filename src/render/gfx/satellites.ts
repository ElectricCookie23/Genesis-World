// Satellites: once a civilization reaches orbit, a sparse ring of small machines circles the planet.
// They are single points of light, lit by the star, dark in the planet's shadow.
import { AdditiveBlending, InstancedBufferAttribute, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu';
import { Copies } from './packed';
import { attribute, cameraPosition, cos, cross, dot, float, length, max, normalize, positionGeometry, sin, smoothstep, sqrt, uniform, uv, vec3 } from 'three/tsl';
import { uSunDir, uTime } from '../common';
import { uLook } from './look';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export class Satellites {
  readonly mesh: Copies;
  /** 0 = none yet, 1 = a full constellation. */
  readonly amount = uniform(0);

  constructor(count = 40, seed = 1) {
    let s = seed >>> 0 || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const g = new PlaneGeometry(1, 1);
    const a = new Float32Array(count * 4), b = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // orbit plane: a random unit normal, mostly low inclinations with a few polar ones
      const inc = rnd() < 0.25 ? 1.2 + rnd() * 0.5 : rnd() * 0.9, node = rnd() * Math.PI * 2;
      a.set([Math.sin(inc) * Math.cos(node), Math.cos(inc), Math.sin(inc) * Math.sin(node), 1.1 + rnd() * 0.28], i * 4);
      b.set([rnd() * Math.PI * 2, 0.05 + rnd() * 0.05, rnd(), rnd()], i * 4);
    }
    g.setAttribute('iOrbit', new InstancedBufferAttribute(a, 4));
    g.setAttribute('iPhase', new InstancedBufferAttribute(b, 4));
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    const o: N = attribute('iOrbit', 'vec4'), ph: N = attribute('iPhase', 'vec4');
    const n: N = o.xyz;
    const u: N = normalize(cross(n, vec3(0.3, 0.1, 0.9)));
    const v: N = cross(n, u);
    const ang = ph.x.add(uTime.mul(ph.y));
    const centre: N = u.mul(cos(ang)).add(v.mul(sin(ang))).mul(o.w);
    const toCam: N = cameraPosition.sub(centre);
    const dist = length(toCam);
    const right: N = normalize(cross(vec3(0, 1, 0), toCam));
    const upB: N = normalize(cross(toCam, right));
    // a fixed small size on screen, whatever the distance
    const size = dist.mul(0.0035);
    const shown = smoothstep(ph.z.sub(0.02), ph.z.add(0.02), this.amount.mul(1.04));
    material.positionNode = centre.add(right.mul(positionGeometry.x).add(upB.mul(positionGeometry.y)).mul(size).mul(shown));
    // in the planet's shadow a satellite is dark
    const along = dot(centre, uSunDir);
    const off = sqrt(max(dot(centre, centre).sub(along.mul(along)), 0));
    const lit = max(smoothstep(0.98, 1.02, off), smoothstep(-0.05, 0.05, along));
    const glint = sin(uTime.mul(ph.w.mul(3).add(1)).add(ph.x.mul(9))).mul(0.5).add(0.5).pow(6).mul(2.5).add(0.5);
    const r = length(uv().sub(0.5));
    // by day, from inside the air, the sky outshines them as it does the stars (they showed as one or two "stars" in
    // the daytime sky over a town on a real GPU)
    const camR = length(cameraPosition);
    const veil = float(1).sub(float(1).sub(smoothstep(1.035, 1.06, camR)).mul(smoothstep(-0.12, 0.1, dot(cameraPosition.div(camR), uSunDir))));
    material.colorNode = vec3(uLook.star).mul(lit).mul(glint).mul(float(1).sub(smoothstep(0.1, 0.5, r))).mul(shown).mul(veil).mul(1.4);
    this.mesh = new Copies(g, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  set(amount: number): void {
    this.amount.value += (amount - this.amount.value) * 0.02;
    this.mesh.visible = this.amount.value > 0.01;
  }
}
