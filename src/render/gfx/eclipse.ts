// Solar eclipses: when the moon passes between the star and the planet, its shadow falls on the
// ground, the sea and the clouds as a dark spot with a soft edge that sweeps across the world.
import { Vector4 } from 'three/webgpu';
import { Fn, dot, float, length, mix, smoothstep, step, uniform } from 'three/tsl';
import { uSunDir } from '../common';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** The moon as a body in space: xyz = position (planet radii), w = radius. */
export const uMoonBody = uniform(new Vector4(5.5, 0, 0, 0.2));
/** A second moon, if the planet has caught one (w = 0 when it has not). */
export const uMoonBody2 = uniform(new Vector4(3.4, 0, 0, 0));

const shadeOf = (p: N, body: N): N => {
  const toMoon = body.xyz.sub(p);
  const along = dot(toMoon, uSunDir);
  const off = length(toMoon.sub(uSunDir.mul(along)));
  // the star is not a point: the edge of the shadow is as soft as the star is wide, seen from the ground
  const soft = along.max(0).mul(0.02).add(0.004);
  const lit = smoothstep(body.w.sub(soft), body.w.add(soft), off);
  return mix(float(1), lit, step(0, along).mul(step(1e-5, body.w)));
};

/** Share of the star's light reaching world position p: 1 in the open, near 0 in the middle of the moon's shadow. */
export const eclipseLight = Fn(([p]: [N]) => shadeOf(p, uMoonBody).mul(shadeOf(p, uMoonBody2)).mul(0.97).add(0.03));

/** The same test on the CPU, for behaviour (animals fall quiet) and events. dir is a unit direction on the planet. */
export function eclipseAt(dir: { x: number; y: number; z: number }, sun: { x: number; y: number; z: number }, moon: { x: number; y: number; z: number }, radius: number): number {
  const mx = moon.x - dir.x, my = moon.y - dir.y, mz = moon.z - dir.z;
  const along = mx * sun.x + my * sun.y + mz * sun.z;
  if (along <= 0) return 1;
  const ox = mx - sun.x * along, oy = my - sun.y * along, oz = mz - sun.z * along;
  const off = Math.hypot(ox, oy, oz);
  const soft = along * 0.02 + 0.004;
  const t = Math.max(0, Math.min(1, (off - (radius - soft)) / (2 * soft)));
  return t * t * (3 - 2 * t);
}
