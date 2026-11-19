// The look of a world, derived from its seed: what kind of star it circles, what its air is made of,
// what minerals colour its seas and rocks, and what pigments its plants use. Nothing here is Earth's.
import { Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { RNG, hashSeed } from '../../sim/rng';

export type StarType = 'yellow' | 'orange' | 'blue-white';

export interface WorldLook {
  star: StarType;
  starName: string;
  /** Colour of direct starlight (linear RGB, about unit brightness). */
  starColor: [number, number, number];
  /** Angular size of the star's disc relative to the default. */
  starSize: number;
  skyName: string;
  /** Rayleigh scattering colour: which wavelengths the air scatters most. This is the colour of the day sky. */
  skyColor: [number, number, number];
  /** Colour of sunsets and haze (what is left after the scattering). */
  duskColor: [number, number, number];
  airDensity: number;
  oceanName: string;
  oceanShallow: [number, number, number];
  oceanDeep: [number, number, number];
  rockA: [number, number, number];
  rockB: [number, number, number];
  rockC: [number, number, number];
  sand: [number, number, number];
  soil: [number, number, number];
  /** Plant pigments: the leaf-hue gene runs from pigmentA to pigmentB. */
  pigmentName: string;
  pigmentA: [number, number, number];
  pigmentB: [number, number, number];
  moonName: string;
  moonTint: [number, number, number];
  auroraLow: [number, number, number];
  auroraHigh: [number, number, number];
}

type RGB = [number, number, number];
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const jitter = (c: RGB, r: RNG, amount: number): RGB => [Math.max(0, c[0] * (1 + (r.next() - 0.5) * amount)), Math.max(0, c[1] * (1 + (r.next() - 0.5) * amount)), Math.max(0, c[2] * (1 + (r.next() - 0.5) * amount))];

/** Everything about a world's look follows from its seed, so a seed code reproduces it exactly. */
export function worldLook(seed: string): WorldLook {
  const r = new RNG(hashSeed(`look:${seed}`));
  const roll = r.next();
  const star: StarType = roll < 0.42 ? 'orange' : roll < 0.78 ? 'yellow' : 'blue-white';
  const starColor: RGB = star === 'orange' ? [1.0, 0.62, 0.36] : star === 'yellow' ? [1.0, 0.93, 0.78] : [0.78, 0.88, 1.0];
  // air: the gas mix decides which colours scatter
  const skies: { name: string; sky: RGB; dusk: RGB; density: [number, number] }[] = [
    { name: 'teal (methane-tinted air)', sky: [0.18, 0.72, 0.78], dusk: [1.0, 0.45, 0.6], density: [0.8, 1.3] },
    { name: 'amber (dust and sulphur haze)', sky: [0.95, 0.62, 0.28], dusk: [0.45, 0.6, 1.0], density: [1.0, 1.6] },
    { name: 'lavender (thin nitrogen-argon air)', sky: [0.55, 0.45, 0.95], dusk: [1.0, 0.5, 0.3], density: [0.6, 1.0] },
    { name: 'pale green (chlorine traces)', sky: [0.5, 0.85, 0.5], dusk: [1.0, 0.6, 0.75], density: [0.8, 1.2] },
    { name: 'deep cobalt (dense oxygen-nitrogen air)', sky: [0.2, 0.42, 1.0], dusk: [1.0, 0.42, 0.18], density: [1.0, 1.5] },
    { name: 'rose (iron-oxide dust)', sky: [0.95, 0.5, 0.55], dusk: [0.5, 0.7, 1.0], density: [0.7, 1.2] },
  ];
  // warm stars favour warm skies only weakly: any air can go with any star
  const sky = skies[r.int(skies.length)]!;
  const seas: { name: string; shallow: RGB; deep: RGB }[] = [
    { name: 'glassy jade', shallow: [0.1, 0.62, 0.4], deep: [0.0, 0.1, 0.07] },
    { name: 'ink violet', shallow: [0.42, 0.3, 0.72], deep: [0.04, 0.01, 0.1] },
    { name: 'deep cobalt', shallow: [0.1, 0.45, 0.85], deep: [0.0, 0.02, 0.12] },
    { name: 'copper green', shallow: [0.25, 0.7, 0.55], deep: [0.01, 0.07, 0.09] },
    { name: 'wine dark', shallow: [0.6, 0.25, 0.35], deep: [0.08, 0.01, 0.04] },
    { name: 'milk turquoise', shallow: [0.45, 0.8, 0.78], deep: [0.02, 0.09, 0.14] },
  ];
  const sea = seas[r.int(seas.length)]!;
  const rocks: RGB[] = [[0.42, 0.2, 0.14], [0.2, 0.22, 0.27], [0.55, 0.42, 0.22], [0.12, 0.11, 0.12], [0.6, 0.56, 0.5], [0.3, 0.16, 0.3], [0.2, 0.3, 0.26], [0.62, 0.3, 0.12]];
  const pick = () => rocks[r.int(rocks.length)]!;
  const rockA = jitter(pick(), r, 0.25), rockB = jitter(pick(), r, 0.25), rockC = jitter(pick(), r, 0.25);
  const sand = jitter(mixRGB(rockA, [0.8, 0.7, 0.5], 0.55), r, 0.2);
  const soil = jitter(mixRGB(rockB, [0.22, 0.14, 0.1], 0.5), r, 0.2);
  // pigments follow the star: plants evolve to use the light there is
  const pigments: Record<StarType, { name: string; a: RGB; b: RGB }[]> = {
    orange: [
      { name: 'deep crimson to near-black', a: [0.32, 0.03, 0.05], b: [0.06, 0.02, 0.05] },
      { name: 'purple to wine red', a: [0.22, 0.04, 0.26], b: [0.36, 0.05, 0.1] },
      { name: 'rust to violet-black', a: [0.4, 0.14, 0.04], b: [0.08, 0.03, 0.1] },
    ],
    yellow: [
      { name: 'indigo to magenta', a: [0.1, 0.08, 0.38], b: [0.42, 0.06, 0.3] },
      { name: 'blue-teal to ochre', a: [0.03, 0.26, 0.3], b: [0.45, 0.32, 0.06] },
      { name: 'copper to plum', a: [0.4, 0.22, 0.08], b: [0.24, 0.07, 0.2] },
    ],
    'blue-white': [
      { name: 'teal to silver', a: [0.03, 0.34, 0.32], b: [0.5, 0.56, 0.56] },
      { name: 'gold to pale teal', a: [0.5, 0.38, 0.06], b: [0.2, 0.5, 0.45] },
      { name: 'silver-blue to amber', a: [0.34, 0.42, 0.5], b: [0.5, 0.3, 0.05] },
    ],
  };
  const pg = pigments[star][r.int(3)]!;
  const moons: { name: string; tint: RGB }[] = [
    { name: 'pale ochre', tint: [1.0, 0.88, 0.62] }, { name: 'rust', tint: [1.0, 0.62, 0.45] }, { name: 'bone white', tint: [0.96, 0.95, 0.9] },
    { name: 'blue-grey', tint: [0.72, 0.8, 0.95] },
  ];
  const moon = moons[r.int(moons.length)]!;
  // aurora colours come from the gases that glow: oxygen green and violet, or reds and pinks without it
  const oxygenRich = sky.name.includes('oxygen') || sky.name.includes('teal') || sky.name.includes('green');
  return {
    star, starName: star === 'orange' ? 'an orange dwarf' : star === 'yellow' ? 'a yellow star' : 'a blue-white star',
    starColor: jitter(starColor, r, 0.06), starSize: star === 'orange' ? 1.5 : star === 'yellow' ? 1 : 0.7,
    skyName: sky.name, skyColor: jitter(sky.sky, r, 0.12), duskColor: sky.dusk, airDensity: r.range(sky.density[0], sky.density[1]),
    oceanName: sea.name, oceanShallow: jitter(sea.shallow, r, 0.12), oceanDeep: sea.deep,
    rockA, rockB, rockC, sand, soil,
    pigmentName: pg.name, pigmentA: jitter(pg.a, r, 0.15), pigmentB: jitter(pg.b, r, 0.15),
    moonName: moon.name, moonTint: moon.tint,
    auroraLow: oxygenRich ? [0.15, 1.0, 0.5] : [1.0, 0.25, 0.35],
    auroraHigh: oxygenRich ? [0.55, 0.25, 1.0] : [1.0, 0.45, 0.8],
  };
}

const v = (c: RGB) => uniform(new Vector3(c[0], c[1], c[2]));
/** Uniforms every material reads the world's look from. */
export const uLook = {
  star: v([1, 0.95, 0.85]), sky: v([0.2, 0.42, 1]), dusk: v([1, 0.42, 0.18]), air: uniform(1),
  oceanShallow: v([0.1, 0.5, 0.5]), oceanDeep: v([0, 0.03, 0.1]),
  rockA: v([0.4, 0.3, 0.25]), rockB: v([0.25, 0.25, 0.28]), rockC: v([0.5, 0.4, 0.3]), sand: v([0.7, 0.6, 0.4]), soil: v([0.25, 0.18, 0.12]),
  pigmentA: v([0.1, 0.3, 0.1]), pigmentB: v([0.3, 0.3, 0.05]), moon: v([1, 1, 1]), auroraLow: v([0.15, 1, 0.5]), auroraHigh: v([0.55, 0.25, 1]),
  starSize: uniform(1),
};

export function applyLook(look: WorldLook): void {
  const set = (u: { value: unknown }, c: RGB) => (u.value as Vector3).set(c[0], c[1], c[2]);
  set(uLook.star, look.starColor); set(uLook.sky, look.skyColor); set(uLook.dusk, look.duskColor);
  uLook.air.value = look.airDensity;
  set(uLook.oceanShallow, look.oceanShallow); set(uLook.oceanDeep, look.oceanDeep);
  set(uLook.rockA, look.rockA); set(uLook.rockB, look.rockB); set(uLook.rockC, look.rockC); set(uLook.sand, look.sand); set(uLook.soil, look.soil);
  set(uLook.pigmentA, look.pigmentA); set(uLook.pigmentB, look.pigmentB); set(uLook.moon, look.moonTint);
  set(uLook.auroraLow, look.auroraLow); set(uLook.auroraHigh, look.auroraHigh);
  uLook.starSize.value = look.starSize;
}
