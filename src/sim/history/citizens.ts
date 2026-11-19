// Ordinary people, made on demand.
// Nobody below the rank of "history remembers them" is simulated or stored. A citizen is rebuilt
// from the world's seed, the settlement and an index, so asking for citizen 317 of a town always
// returns the same person: same name, same trade, same year of birth, same household.
import { hash32, unit } from './hash';
import { personName, type Language } from './language';

export interface Citizen {
  index: number;
  name: string;
  /** Year of birth (simulation years). */
  born: number;
  /** Age at the year asked for. */
  age: number;
  trade: string;
  /** Other citizens of the same settlement who share this one's home. */
  household: number[];
  /** A number 0..1 that stays with the person: for a face, a voice, a gait. */
  look: number;
}

/** What people do for a living, by level of knowledge: [from, trade, share]. */
const TRADES: [number, string, number][] = [
  [0, 'forager', 5], [0, 'hunter', 3], [0, 'toolmaker', 1], [0, 'healer', 0.4], [0, 'storyteller', 0.3],
  [0.22, 'farmer', 14], [0.22, 'herder', 4], [0.22, 'potter', 1.2], [0.22, 'weaver', 1.5],
  [0.3, 'builder', 1.5], [0.3, 'priest', 0.6], [0.3, 'trader', 1], [0.3, 'smith', 0.8], [0.3, 'brewer', 0.5],
  [0.45, 'soldier', 1.5], [0.45, 'scribe', 0.4], [0.45, 'mason', 1], [0.45, 'carter', 0.8], [0.45, 'innkeeper', 0.4],
  [0.6, 'sailor', 1.5], [0.6, 'shipwright', 0.5], [0.6, 'merchant', 1], [0.6, 'tailor', 0.8], [0.6, 'physician', 0.3], [0.6, 'teacher', 0.3],
  [0.72, 'printer', 0.5], [0.72, 'clerk', 1], [0.72, 'glassmaker', 0.4], [0.72, 'surveyor', 0.2],
  [0.85, 'mill hand', 8], [0.85, 'miner', 3], [0.85, 'engine driver', 1], [0.85, 'engineer', 0.8], [0.85, 'shopkeeper', 2],
  [1.0, 'electrician', 1.5], [1.0, 'operator', 2], [1.0, 'office worker', 8], [1.0, 'nurse', 1.5], [1.0, 'broadcaster', 0.2],
  [1.1, 'technician', 3], [1.1, 'programmer', 2], [1.1, 'pilot', 0.4], [1.1, 'researcher', 1],
];

/** How many adults' trades there are to pick from at a level of knowledge. */
function tradeAt(tech: number, h: number): string {
  let total = 0;
  for (const [from, , share] of TRADES) if (tech >= from) total += share * (tech >= from + 0.45 ? 0.35 : 1);
  let r = unit(h) * total;
  for (const [from, trade, share] of TRADES) {
    if (tech < from) continue;
    r -= share * (tech >= from + 0.45 ? 0.35 : 1);
    if (r <= 0) return trade;
  }
  return 'farmer';
}

/**
 * Citizen `index` of a settlement in a given year. `lifespan` is how long the species usually lives.
 * The same arguments always give the same person; a different year gives the same person, older or
 * not yet born, until the index is reused by a later generation.
 */
export function citizen(seed: number, settlement: number, index: number, year: number, tech: number, lang: Language, lifespan = 60): Citizen {
  // an index belongs to one person per generation: generations of the same index follow one another
  const span = Math.max(8, lifespan);
  const offset = unit(hash32(seed, settlement, index, 0x0ff5e7)) * span;
  const generation = Math.floor((year - offset) / span);
  const id = hash32(seed, settlement, index, generation);
  const born = Math.floor(generation * span + offset);
  const age = Math.max(0, Math.floor(year - born));
  const child = age < span * 0.22;
  const trade = child ? 'child' : age > span * 0.85 ? 'elder' : tradeAt(tech, hash32(id, 0x7ade));
  // households: indices are grouped in fives; the others of the group share the home
  const home = Math.floor(index / 5) * 5;
  const household: number[] = [];
  for (let k = home; k < home + 5; k++) if (k !== index) household.push(k);
  return { index, name: personName(lang, id), born, age, trade, household, look: unit(hash32(id, 0x100c)) };
}
