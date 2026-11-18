// Shared uniforms and constants for every render module.
import { Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';

/** Scene units per km of elevation. Planet radius is 1. */
export const EXAG = 0.0056;
export const CLOUD_RADIUS = 1.03;
export const ATMO_RADIUS = 1.09;
export const MOON_DISTANCE = 5.5;
export const MOON_RADIUS = 0.2;

export const uSunDir = uniform(new Vector3(1, 0, 0));
export const uMoonDir = uniform(new Vector3(0, 0, 1));
/** Animation clock in seconds (always runs, even when the sim is paused). */
export const uTime = uniform(0);
/** Current sea level in km relative to datum. */
export const uSeaKm = uniform(0);
/** Tide strength in km of water. */
export const uTideKm = uniform(0.035);
/** Opening sequence controls. */
export const uMolten = uniform(0);
export const uAtmo = uniform(1);
export const uOceanFill = uniform(1);
export const uCloudAmount = uniform(1);
export const uSteam = uniform(0);
/** Daily rotation angle of the sky relative to the ground. */
export const uSkyAngle = uniform(0);
/** Era colour grade: multiply tint and haze tint. */
export const uGradeTint = uniform(new Vector3(1, 1, 1));
export const uHazeTint = uniform(new Vector3(0.42, 0.62, 1.0));
export const uHazeAmount = uniform(0);
export const uFlash = uniform(0);

export function radiusForElevation(km: number): number {
  return 1 + km * EXAG;
}
