// Latin-style species names built from roots tied to traits and places.
import { G, P } from './genetics';
import type { Creatures, Species } from './creatures';
import { BIOME_ROOTS, genusName } from './names';
import type { RNG } from './rng';

interface Trait { root: string[]; value: number; }

/** Describe how a new species differs: returns trait roots, strongest first. */
function traitRoots(cr: Creatures, s: Species, parent: Species | undefined): string[] {
  const g = s.ref;
  const pg = parent?.ref;
  const d = (i: number) => (pg ? g[i]! - pg[i]! : g[i]! - 0.3);
  const traits: Trait[] = [
    { root: ['magnus', 'grandis', 'ingens'], value: d(G.Size) * 3 + (g[G.Size]! > 0.8 ? 0.5 : 0) },
    { root: ['parvus', 'minimus', 'pusillus'], value: -d(G.Size) * 3 },
    { root: ['velox', 'celer', 'cursor'], value: d(G.LimbLength) * 2 + d(G.Metabolism) },
    { root: ['umbra', 'noctis', 'obscurus'], value: d(G.Nocturnal) * 2.5 + (g[G.Nocturnal]! > 0.75 ? 0.3 : 0) },
    { root: ['lux', 'lucens', 'fulgens'], value: d(G.Glow) * 3 + (g[G.Glow]! > 0.6 ? 0.6 : 0) },
    { root: ['armatus', 'loricatus', 'scutatus'], value: d(G.Armor) * 3 },
    { root: ['cornutus', 'ceratus'], value: d(G.Horn) * 3 },
    { root: ['longicollis', 'altus'], value: d(G.Neck) * 2.5 },
    { root: ['caudatus', 'longicaudus'], value: d(G.Tail) * 1.8 },
    { root: ['venenatus', 'toxicus', 'virosus'], value: Math.max(d(G.Venom), d(G.Toxicity)) * 3 },
    { root: ['ferox', 'rapax', 'saevus'], value: d(G.Aggression) * 2 + d(G.Diet) * 2 },
    { root: ['mitis', 'placidus', 'herbarius'], value: -d(G.Diet) * 2.5 },
    { root: ['gregarius', 'socialis'], value: d(G.Sociality) * 2.5 },
    { root: ['solitarius', 'eremita'], value: -d(G.Sociality) * 2 },
    { root: ['sapiens', 'sagax', 'prudens'], value: d(G.Intelligence) * 4 + (g[G.Intelligence]! > 0.6 ? 0.8 : 0) },
    { root: ['lanatus', 'hirsutus', 'plumosus'], value: d(G.Insulation) * 2.5 },
    { root: ['fossor', 'subterraneus'], value: d(G.Burrow) * 2.5 },
    { root: ['vagans', 'peregrinus', 'migrans'], value: d(G.Migration) * 2 },
    { root: ['oculatus', 'vigilans'], value: (d(G.EyeSize) + d(G.Sight)) * 1.5 },
    { root: ['ornatus', 'pictus', 'splendens'], value: d(G.Ornament) * 2.5 },
    { root: ['longaevus', 'perennis'], value: d(G.Lifespan) * 2 },
    { root: ['calidus', 'fervens'], value: d(G.WarmBlood) * 2 },
  ];
  traits.sort((a, b) => b.value - a.value);
  return traits.filter((t) => t.value > 0.12).slice(0, 3).map((t) => t.root).flat();
}

export function wayOfLife(cr: Creatures, s: Species): { land: number; fly: number; diet: number } {
  return { land: cr.speciesMean(s.id, P.LandUse, true), fly: cr.speciesMean(s.id, P.Fly, true), diet: s.ref[G.Diet]! };
}

export function nameSpecies(cr: Creatures, s: Species, reason: string, biome: number, rng: RNG, taken: Set<string>): void {
  const parent = s.parent >= 0 ? cr.species[s.parent] : undefined;
  if (!s.genus) {
    let genus = genusName(rng);
    for (let k = 0; k < 8 && taken.has(genus); k++) genus = genusName(rng);
    taken.add(genus);
    s.genus = genus;
  }
  const roots = traitRoots(cr, s, parent);
  const reasonRoots: Record<string, string[]> = {
    land: ['terrestris', 'ambulans', 'litoralis'], sea: ['marinus', 'natans', 'pelagicus'], air: ['volans', 'aerius', 'alatus'],
    meat: ['carnifex', 'rapax', 'venator'], plants: ['herbarius', 'frondator'], night: ['noctis', 'umbra', 'lunaris'],
    size: [], isolation: [],
  };
  const pool = [...(reasonRoots[reason] ?? []), ...roots];
  const place = BIOME_ROOTS[biome] ?? 'ignot';
  const placeForms = [`${place}ensis`, `${place}icola`, `${place}orum`];
  const candidates = [...pool, ...placeForms, 'novus', 'affinis', 'similis', 'incertus', 'mirabilis', 'secundus', 'tertius', 'ultimus'];
  // prefer a trait name, fall back to place names, then generic ones
  let start = pool.length ? rng.int(Math.min(3, pool.length)) : 0;
  for (let k = 0; k < candidates.length; k++) {
    const ep = candidates[(start + k) % candidates.length]!;
    const full = `${s.genus} ${ep}`;
    if (!taken.has(full)) {
      taken.add(full);
      s.name = full;
      return;
    }
    start = 0;
  }
  s.name = `${s.genus} ${placeName3(rng)}`;
  taken.add(s.name);
}

function placeName3(rng: RNG): string {
  const a = ['al', 'be', 'cor', 'du', 'el', 'fa', 'gor', 'hi', 'ix', 'ka', 'lo', 'mur', 'ne', 'os', 'pa', 'qui', 'ro', 'su', 'ta', 'ul', 'ven'];
  return `${rng.pick(a)}${rng.pick(a)}${rng.pick(['us', 'a', 'is', 'um'])}`;
}

const PLANT_GENUS = ['Viri', 'Fron', 'Arbo', 'Alg', 'Musc', 'Fil', 'Gram', 'Flor', 'Sil', 'Herb', 'Pin', 'Quer', 'Sal', 'Cact', 'Lich', 'Palm', 'Jun', 'Bet'];
const PLANT_END = ['ella', 'aria', 'ium', 'ops', 'ago', 'anthus', 'phyta', 'ica', 'ula', 'osa'];

export function plantName(genes: Float32Array, aquatic: boolean, rng: RNG, taken: Set<string>): string {
  const height = genes[0]!, leaf = genes[1]!, fruit = genes[4]!, thorns = genes[5]!, tox = genes[6]!, glow = genes[10]!, fire = genes[11]!;
  const ep: string[] = [];
  if (aquatic) ep.push('marina', 'natans', 'fluitans');
  if (height > 0.65) ep.push('alta', 'gigantea', 'excelsa');
  else if (height < 0.2) ep.push('humilis', 'repens', 'pumila');
  if (leaf < 0.25) ep.push('acicularis', 'borealis');
  if (leaf > 0.75) ep.push('succulenta', 'deserti');
  if (fruit > 0.6) ep.push('fructifera', 'dulcis');
  if (thorns > 0.6) ep.push('spinosa', 'horrida');
  if (tox > 0.6) ep.push('venenata', 'amara');
  if (glow > 0.55) ep.push('lucens', 'noctiluca');
  if (fire > 0.65) ep.push('ignifera', 'pyrophila');
  ep.push('communis', 'vulgaris', 'viridis', 'nova', 'mirabilis', 'modesta', 'tenuis', 'robusta');
  for (let k = 0; k < 30; k++) {
    const name = `${rng.pick(PLANT_GENUS)}${rng.pick(PLANT_END)} ${ep[Math.min(ep.length - 1, k < 3 ? rng.int(Math.min(3, ep.length)) : rng.int(ep.length))]}`;
    if (!taken.has(name)) { taken.add(name); return name; }
  }
  return `Viriella nova-${taken.size}`;
}
