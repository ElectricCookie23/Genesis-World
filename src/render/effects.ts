// Special effects. For now: the protoplanetary dust disc of the opening sequence.
import { AdditiveBlending, DoubleSide, Mesh, MeshBasicNodeMaterial, RingGeometry } from 'three/webgpu';
import { atan, exp, float, length, mx_fractal_noise_float, positionLocal, pow, smoothstep, uniform, vec3 } from 'three/tsl';
import { uTime } from './common';

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
