// Shared sun, sky and night lighting for small objects (plants, creatures).
import { Fn, dot, float, max, mix, normalize, smoothstep, vec3 } from 'three/tsl';
import { uSun2, uSun2Dir, uSunDir } from './common';
import { uLook } from './gfx/look';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Light from the companion sun, where the world has one, on a surface with normal n where the ground's up is `up`: its own colour. Add to the light that multiplies the albedo. */
export const secondSun = (n: N, up: N): N => vec3(uLook.star2).mul(max(dot(n, uSun2Dir), 0).mul(0.8).add(0.2)).mul(smoothstep(-0.1, 0.25, dot(up, uSun2Dir))).mul(uSun2).mul(0.45);

/** Light arriving at a surface point with normal n at world position p. Multiply by albedo. */
export const surfaceLight = Fn(([n, p]: [N, N]) => {
  const up = normalize(p);
  const sunHeight = dot(up, uSunDir);
  const day = smoothstep(-0.12, 0.22, sunHeight);
  const sunColor = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.05, 0.4, sunHeight));
  // soft wrap lighting so the shaded side of small objects stays readable
  const diffuse = max(dot(n, uSunDir).mul(0.5).add(0.5), 0).mul(day);
  const sky = mix(vec3(uLook.sky), vec3(0.6, 0.6, 0.6), 0.45).mul(0.42).mul(day).mul(dot(n, up).mul(0.35).add(0.65));
  return sunColor.mul(diffuse).mul(1.2).add(sky).add(vec3(0.026, 0.038, 0.07).mul(dot(n, up).mul(0.4).add(0.6)));
});

/** 0 at night, 1 by day, at world position p. */
export const dayAmount = Fn(([p]: [N]) => smoothstep(-0.12, 0.22, dot(normalize(p), uSunDir)));
export const one = float(1);
