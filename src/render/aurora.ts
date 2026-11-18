// Auroras: animated ribbon curtains over both poles, brightest on the night side.
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, dot, float, mix, mx_fractal_noise_float, normalize, positionWorld, pow, sin, smoothstep, uniform, vec3 } from 'three/tsl';
import { uSunDir, uTime } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** 0 = none, 1 = normal, higher during solar events. */
export const uAurora = uniform(1);

function ring(pole: 1 | -1, latDeg: number, segments: number): BufferGeometry {
  const pos = new Float32Array((segments + 1) * 2 * 3);
  const uv = new Float32Array((segments + 1) * 2 * 2);
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    // a wavy oval around the pole
    const lat = ((latDeg + 4 * Math.sin(a * 3 + pole) + 2.5 * Math.sin(a * 7)) * Math.PI) / 180;
    const cl = Math.cos(lat), sl = Math.sin(lat) * pole;
    for (let r = 0; r < 2; r++) {
      const rad = r === 0 ? 1.04 : 1.105;
      const o = (i * 2 + r) * 3;
      pos[o] = cl * Math.cos(a) * rad; pos[o + 1] = sl * rad; pos[o + 2] = cl * Math.sin(a) * rad;
      uv[(i * 2 + r) * 2] = i / segments; uv[(i * 2 + r) * 2 + 1] = r;
    }
    if (i < segments) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('auv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function createAuroras(): Mesh[] {
  const meshes: Mesh[] = [];
  for (const [pole, lat] of [[1, 69], [-1, 71], [1, 76]] as [1 | -1, number][]) {
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
    const uv: any = attribute('auv', 'vec2');
    const t = uTime.mul(0.12);
    // vertical curtains that ripple sideways
    const u = uv.x.mul(46).add(sin(uv.x.mul(9).add(t.mul(2))).mul(1.6));
    const rays = mx_fractal_noise_float(vec3(u, t, float(lat)), 3, 2.2, 0.55).mul(0.5).add(0.5);
    const folds = mx_fractal_noise_float(vec3(uv.x.mul(7), t.mul(0.6), float(lat * 2)), 2, 2.0, 0.5).mul(0.5).add(0.5);
    const curtain = pow(rays, 2.2).mul(smoothstep(0.25, 0.75, folds));
    const fade = smoothstep(0.0, 0.12, uv.y).mul(pow(float(1).sub(uv.y), 1.6));
    const color = mix(vec3(0.1, 1.0, 0.45), vec3(0.55, 0.2, 0.95), smoothstep(0.25, 0.95, uv.y));
    const night = float(1).sub(smoothstep(-0.25, 0.2, dot(normalize(positionWorld), uSunDir)));
    material.colorNode = color.mul(curtain).mul(fade).mul(night.mul(0.9).add(0.06)).mul(uAurora).mul(1.7);
    const mesh = new Mesh(ring(pole, lat, 220), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    meshes.push(mesh);
  }
  return meshes;
}
