import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import type { RNG } from './rng';

export type Noise3 = NoiseFunction3D;

export function makeNoise(rng: RNG): Noise3 {
  return createNoise3D(() => rng.next());
}

export function fbm(noise: Noise3, x: number, y: number, z: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function ridged(noise: Noise3, x: number, y: number, z: number, octaves: number): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const v = 1 - Math.abs(noise(x * freq, y * freq, z * freq));
    sum += amp * v * v;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}
