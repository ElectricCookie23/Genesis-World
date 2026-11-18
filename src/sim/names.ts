// Generated names: places and Latin-style species names built from trait roots.
import type { RNG } from './rng';

const ONSET = ['k', 't', 'v', 'm', 'n', 's', 'r', 'l', 'th', 'sh', 'd', 'b', 'g', 'z', 'h', 'kr', 'br', 'tr', 'dr', 'f', 'y', ''];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'ou', 'ia', 'ea'];
const CODA = ['', '', '', 'n', 'r', 'l', 's', 'th', 'm', 'k', 'sh'];

export function placeName(rng: RNG): string {
  const syl = 2 + rng.int(2);
  let s = '';
  for (let i = 0; i < syl; i++) s += rng.pick(ONSET) + rng.pick(VOWEL) + (i === syl - 1 ? rng.pick(CODA) : '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const BIOME_ROOTS = [
  'abyssi', 'pelagi', 'litor', 'aren', 'glaci', 'tundr', 'boreal', 'silv', 'prat', 'dumet', 'desert', 'savann', 'pluvi', 'palustr', 'alpin', 'cinere', 'glaci',
];

const GENUS_END = ['us', 'a', 'ops', 'ium', 'odon', 'ia', 'ax', 'ornis', 'ichthys', 'saurus', 'therium', 'pus', 'cera', 'ella'];
const GENUS_START = [
  'Aer', 'Bar', 'Cal', 'Dor', 'Ely', 'Fer', 'Gal', 'Hel', 'Ith', 'Kor', 'Lun', 'Mer', 'Nyx', 'Ory', 'Pel', 'Quer', 'Rhy', 'Sol', 'Tal', 'Ur', 'Vel', 'Xan', 'Zeph',
  'Arc', 'Bry', 'Cyn', 'Dra', 'Eri', 'Gry', 'Hyl', 'Lep', 'Myr', 'Neo', 'Pan', 'Sar', 'Tyr',
];
const GENUS_MID = ['', '', 'a', 'o', 'i', 'an', 'or', 'el', 'ar', 'ol', 'in'];

export function genusName(rng: RNG): string {
  return rng.pick(GENUS_START) + rng.pick(GENUS_MID) + rng.pick(GENUS_END);
}

/** Trait root for the species epithet, e.g. velox, magnus, umbra, lux. */
export function epithet(roots: string[], rng: RNG): string {
  const r = roots.length ? rng.pick(roots) : rng.pick(['communis', 'vulgaris', 'novus', 'modestus']);
  return r;
}
