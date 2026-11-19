// Genomes, mutation, phenotype (what a genome means for a body) and genetic distance.
import type { RNG } from './rng';

/** Creature genes. Each is a float 0..1 mapped to a range by the phenotype functions. */
export const enum G {
  // body
  Size, BodyRatio, Segments, LimbType, LimbPairs, LimbLength, Neck, Tail, Head, Horn, Armor, Insulation,
  // senses
  EyeCount, EyeSize, Sight, Hearing, Smell, Echo, Electric,
  // looks
  Hue, Hue2, PatternType, PatternScale, Glow, GlowHue, Ornament, ColorChange,
  // metabolism
  Diet, WarmBlood, Metabolism, Toxicity, ToxinResist, Venom, HeatTol, ColdTol,
  // life history
  Lifespan, Maturity, Offspring, Care, Metamorphosis,
  // behaviour
  Sociality, Aggression, Boldness, Curiosity, Nocturnal, Water, Burrow, Migration, Territorial, Intelligence,
  COUNT,
}
export const GENE_COUNT = G.COUNT as number;

export const GENE_NAMES = [
  'size', 'body ratio', 'segments', 'limb type', 'limb pairs', 'limb length', 'neck', 'tail', 'head', 'horns', 'armor', 'insulation',
  'eye count', 'eye size', 'sight', 'hearing', 'smell', 'echolocation', 'electric sense',
  'hue', 'second hue', 'pattern', 'pattern scale', 'glow', 'glow hue', 'ornament', 'colour change',
  'diet', 'warm blood', 'metabolism', 'toxicity', 'toxin resistance', 'venom', 'heat tolerance', 'cold tolerance',
  'lifespan', 'maturity', 'offspring', 'parental care', 'metamorphosis',
  'sociality', 'aggression', 'boldness', 'curiosity', 'nocturnality', 'water affinity', 'burrowing', 'migration', 'territoriality', 'intelligence',
];

/** Genes that barely affect survival: they drift freely and are ignored (mostly) by speciation distance. */
const NEUTRAL_WEIGHT: Partial<Record<number, number>> = {
  [G.Hue]: 0.35, [G.Hue2]: 0.2, [G.PatternScale]: 0.2, [G.GlowHue]: 0.2, [G.PatternType]: 0.3, [G.BodyRatio]: 0.5, [G.Segments]: 0.5,
};
export const GENE_WEIGHT = new Float32Array(GENE_COUNT).fill(1);
for (const k in NEUTRAL_WEIGHT) GENE_WEIGHT[Number(k)] = NEUTRAL_WEIGHT[Number(k)]!;
/** Slow-changing body-plan genes. */
const SLOW = new Set<number>([G.LimbType, G.PatternType, G.WarmBlood, G.LimbPairs, G.Segments, G.Metamorphosis]);

export function geneDistance(a: Float32Array, ao: number, b: Float32Array, bo: number): number {
  let s = 0;
  for (let i = 0; i < GENE_COUNT; i++) {
    const d = (a[ao + i]! - b[bo + i]!) * GENE_WEIGHT[i]!;
    s += d * d;
  }
  return Math.sqrt(s);
}

/** Copy a genome with mutations. `scale` multiplies the usual step size. Returns true if a large jump happened. */
export function mutateInto(src: Float32Array, so: number, dst: Float32Array, d: number, rng: RNG, scale: number): boolean {
  for (let i = 0; i < GENE_COUNT; i++) dst[d + i] = src[so + i]!;
  // a handful of genes change a little
  const n = 3 + rng.int(5);
  for (let k = 0; k < n; k++) {
    const g = rng.int(GENE_COUNT);
    const sigma = (SLOW.has(g) ? 0.022 : 0.045) * scale;
    dst[d + g] = Math.max(0, Math.min(1, dst[d + g]! + rng.gauss() * sigma));
  }
  // 1% of births carry one large jump in a single gene: sudden novelty
  if (rng.chance(0.01 * Math.min(4, scale))) {
    const g = rng.int(GENE_COUNT);
    dst[d + g] = Math.max(0, Math.min(1, dst[d + g]! + rng.gauss() * (SLOW.has(g) ? 0.14 : 0.3)));
    return true;
  }
  return false;
}

export const enum Limb { None, Fins, Legs, Wings }

export function limbKind(v: number): Limb {
  return v < 0.25 ? Limb.None : v < 0.5 ? Limb.Fins : v < 0.75 ? Limb.Legs : Limb.Wings;
}

/** Body length in metres: 5 cm to 8 m. */
export function sizeMetres(g: number): number {
  return 0.05 * Math.pow(160, g);
}

/** Phenotype values derived from a genome, cached per cohort. */
export const enum P {
  Mass, Need, Swim, Walk, Fly, LandUse, Speed, HerbEff, MeatEff, ScavEff, Sense, Conceal, Defense, TMin, TMax, RMax, Death,
  GenYears, Attack, Pack, Reach, Brain, NightUse, Forage, Feed0, Feed1, Feed2, LogPackMass, LogMass, Mass75, COUNT,
}
export const PHEN_COUNT = P.COUNT as number;

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function computePhenotype(g: Float32Array, o: number, out: Float32Array, p: number): void {
  const size = g[o + G.Size]!;
  const metres = sizeMetres(size);
  const mass = 80 * metres * metres * metres;
  const lt = g[o + G.LimbType]!;
  const pairs = g[o + G.LimbPairs]!;
  const limbLen = g[o + G.LimbLength]!;
  const water = g[o + G.Water]!;
  const hasLimbs = pairs > 0.12;
  // movement abilities: fins swim, lobe fins crawl, legs walk, gliding grows into flight
  let swim = 0.25, walk = 0.06, fly = 0;
  if (hasLimbs) {
    if (lt < 0.25) { swim = 0.3; walk = 0.08; }
    else if (lt < 0.5) { swim = 0.75 + 0.25 * limbLen; walk = sat((lt - 0.38) / 0.12) * 0.4; }
    else if (lt < 0.75) { swim = 0.35; walk = 0.6 + 0.4 * limbLen; fly = sat((lt - 0.64) / 0.11) * 0.3 * (1 - size * 0.8); }
    else { swim = 0.2; walk = 0.45; fly = (0.45 + 0.55 * sat((lt - 0.75) / 0.2)) * sat(1.25 - size * 1.3); }
  }
  swim *= 0.6 + 0.4 * g[o + G.Tail]!;
  const landUse = sat((1 - water) * 1.15 - 0.05);
  const warm = g[o + G.WarmBlood]! > 0.5 ? 1 : 0;
  const metab = 0.5 + g[o + G.Metabolism]!;
  const brain = g[o + G.Intelligence]!;
  const eyes = g[o + G.EyeCount]! > 0.1 ? g[o + G.EyeSize]! * 0.5 + g[o + G.Sight]! * 0.5 : 0;
  const echo = g[o + G.Echo]! > 0.6 ? g[o + G.Echo]! : 0;
  const elec = g[o + G.Electric]! > 0.6 ? g[o + G.Electric]! * water : 0;
  const night = g[o + G.Nocturnal]!;
  // eyes work by day; smell, hearing, echolocation and electric sense work any time
  const sense = sat(0.08 + eyes * 0.55 * (1 - night * 0.6) + g[o + G.Smell]! * 0.25 + g[o + G.Hearing]! * 0.22 + echo * 0.35 + elec * 0.3 + brain * 0.15);
  const baseSpeed = Math.pow(metres, 0.3) * (0.45 + 0.55 * limbLen) * metab;
  const speed = baseSpeed * Math.max(swim * water, walk * (1 - water), fly * 1.6) * (1 - g[o + G.Armor]! * 0.45);
  // every trait costs energy, so nothing can be maxed for free
  const upkeep = 1
    + brain * 1.1 + brain * brain * 1.6 + g[o + G.Armor]! * 0.5 + g[o + G.Horn]! * 0.25 + g[o + G.Ornament]! * 0.3 + g[o + G.Glow]! * 0.2
    + g[o + G.Venom]! * 0.3 + g[o + G.Toxicity]! * 0.3 + g[o + G.ToxinResist]! * 0.2 + g[o + G.Insulation]! * 0.15
    + eyes * 0.3 + echo * 0.3 + elec * 0.2 + g[o + G.Smell]! * 0.1 + g[o + G.Hearing]! * 0.1 + fly * 0.3 + g[o + G.ColorChange]! * 0.2
    + g[o + G.Care]! * 0.25;
  // how much it can eat depends on body and metabolism; how much it must eat also depends on upkeep
  const forage = Math.pow(mass, 0.75) * metab * (warm ? 1.9 : 1);
  const need = Math.pow(mass, 0.75) * metab * (warm ? 2.5 : 1) * upkeep;
  const diet = g[o + G.Diet]!;
  const reach = sat(0.15 + g[o + G.Neck]! * 0.5 + size * 0.5 + fly * 0.4);
  out[p + P.Mass] = mass;
  out[p + P.Need] = need;
  out[p + P.Swim] = swim;
  out[p + P.Walk] = walk;
  out[p + P.Fly] = fly;
  out[p + P.LandUse] = landUse;
  out[p + P.Speed] = speed;
  out[p + P.HerbEff] = Math.pow(1 - diet, 1.4) * (0.75 + 0.25 * g[o + G.Head]!) * (1 + brain * 0.9);
  out[p + P.MeatEff] = Math.pow(diet, 0.8) * 1.6 * (1 + brain * 0.9);
  out[p + P.ScavEff] = (1 - Math.abs(diet - 0.55) * 1.6) * (0.3 + 0.7 * g[o + G.Smell]!) * (1 - g[o + G.Aggression]! * 0.4);
  out[p + P.Sense] = sense;
  out[p + P.Conceal] = sat((1 - size) * 0.35 + g[o + G.Burrow]! * 0.3 + g[o + G.ColorChange]! * 0.3 + night * 0.15 - g[o + G.Glow]! * 0.2 - g[o + G.Ornament]! * 0.2);
  out[p + P.Defense] = sat(g[o + G.Armor]! * 0.5 + g[o + G.Horn]! * 0.3 + g[o + G.Sociality]! * 0.15 + g[o + G.Aggression]! * 0.1 + brain * 0.25);
  // thermal comfort window in deg C
  const heat = g[o + G.HeatTol]!, cold = g[o + G.ColdTol]!, ins = g[o + G.Insulation]!;
  const centre = 17 + 16 * (heat - cold);
  const half = 9 + 5 * (heat + cold) + warm * 7;
  out[p + P.TMin] = centre - half - ins * 16 - size * 6 - warm * 6;
  out[p + P.TMax] = centre + half - ins * 7 - size * 5 + 4;
  // life history: many small offspring versus few cared-for ones
  const off = g[o + G.Offspring]!, care = g[o + G.Care]!;
  out[p + P.RMax] = (0.35 + 1.1 * off) * (0.45 + 0.55 * care + 0.35 * (1 - off)) * (1.25 - 0.5 * g[o + G.Maturity]!) * (1.2 - 0.4 * size);
  out[p + P.Death] = 0.34 - 0.2 * g[o + G.Lifespan]! + 0.1 * metab * 0.5;
  out[p + P.GenYears] = 0.3 + 28 * g[o + G.Maturity]! * (0.2 + size) + 3 * size;
  out[p + P.Attack] = sat(0.2 + g[o + G.Aggression]! * 0.3 + g[o + G.Venom]! * 0.35 + g[o + G.Horn]! * 0.1 + g[o + G.Head]! * 0.15 + brain * 0.3);
  out[p + P.Pack] = 1 + 5 * g[o + G.Sociality]! * (0.3 + 0.7 * g[o + G.Aggression]!) * (0.5 + brain);
  out[p + P.Reach] = reach;
  out[p + P.Brain] = brain;
  out[p + P.NightUse] = night;
  out[p + P.Forage] = forage;
  out[p + P.LogMass] = Math.log(mass);
  out[p + P.Mass75] = Math.pow(mass, 0.75);
  out[p + P.LogPackMass] = Math.log(mass * out[p + P.Pack]!);
  // feeding layer: small bodies crop the ground layer, tall or flying ones reach the canopy
  const x = Math.min(2, (size * 0.95 + g[o + G.Neck]! * 0.55) * 2);
  let f0 = Math.exp(-(x * x) / 0.55), f1 = Math.exp(-((x - 1) * (x - 1)) / 0.55), f2 = Math.exp(-((x - 2) * (x - 2)) / 0.55);
  const fsum = f0 + f1 + f2;
  f0 /= fsum; f1 /= fsum; f2 /= fsum;
  // a flier can feed at any height: wings widen the reach rather than move it
  const wide = Math.min(1, fly * 1.3);
  f0 += (1 / 3 - f0) * wide; f1 += (1 / 3 - f1) * wide; f2 += (1 / 3 - f2) * wide;
  out[p + P.Feed0] = f0;
  out[p + P.Feed1] = f1;
  out[p + P.Feed2] = f2;
}

/** Plant genes. */
export const enum PG { Height, Leaf, LeafHue, FlowerHue, Fruit, Thorns, Toxicity, Growth, Dispersal, WaterNeed, Glow, FireResist, COUNT }
export const PLANT_GENES = PG.COUNT as number;
export const PLANT_GENE_NAMES = [
  'height', 'leaf type', 'leaf hue', 'flower hue', 'fruit size', 'thorns', 'toxicity', 'growth rate', 'seed dispersal', 'water need', 'glow', 'fire resistance',
];

export function mutatePlant(src: Float32Array, dst: Float32Array, rng: RNG, scale: number): void {
  dst.set(src);
  const n = 2 + rng.int(3);
  for (let k = 0; k < n; k++) {
    const g = rng.int(PLANT_GENES);
    dst[g] = Math.max(0, Math.min(1, dst[g]! + rng.gauss() * 0.06 * scale));
  }
  if (rng.chance(0.02)) {
    const g = rng.int(PLANT_GENES);
    dst[g] = Math.max(0, Math.min(1, dst[g]! + rng.gauss() * 0.3));
  }
}

export function plantDistance(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < PLANT_GENES; i++) {
    const w = i === PG.LeafHue || i === PG.FlowerHue ? 0.4 : 1;
    const d = (a[i]! - b[i]!) * w;
    s += d * d;
  }
  return Math.sqrt(s);
}
