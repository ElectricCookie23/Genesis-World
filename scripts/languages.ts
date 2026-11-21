// Languages (system E21): grow a world to its dawn, live its history a year at a time, and print the family
// tree of its languages with a few words and a sentence in each.
// Usage: npx vite-node scripts/languages.ts <seed> <years> [gridN] [file to write the panel's data to]
import { Simulation } from '../src/sim/simulation';
import { word, wordDistance } from '../src/sim/history/language';
import { LEXICON, SAYINGS, describeGrammar, say } from '../src/sim/history/syntax';
import { languageList } from '../src/sim/history/tongues';
import { bodyFrom } from '../src/sim/history/script';
import { G } from '../src/sim/genetics';
import * as fs from 'fs';
const [seed = 'amber-reef-101', years = '4000', n = '17', json = ''] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const living = new Set(h.nations.filter((x) => x.ended < 0).map((x) => h.cultures[x.culture]!.language));
const show = ['water', 'sun', 'people', 'king', 'three', 'see'];
console.log(`${seed}: ${h.languages.length} languages ever, ${living.size} spoken now, in ${new Set(h.languages.map((l) => l.family)).size} families. Words: ${show.join(', ')}`);
const kids = (id: number) => h.languages.filter((l) => l.parent === id);
const line = (id: number, depth: number): void => {
  const l = h.languages[id]!;
  console.log(`${'  '.repeat(depth)}${l.name}${living.has(id) ? '' : ' (dead)'} [+${Math.round(l.bornYear - began)}, ${l.changes.length} changes] ${show.map((m) => word(l, m)).join(' ')} | ${say(l, SAYINGS[1]!).text}`);
  for (const k of kids(id)) line(k.id, depth + 1);
};
for (const l of h.languages) if (l.parent < 0) { console.log(`  grammar: ${describeGrammar(l)}`); line(l.id, 1); }
const alive = [...living].map((id) => h.languages[id]!);
let sum = 0, pairs = 0;
for (const a of alive) for (const b of alive) if (a.id < b.id) { let d = 0; for (const m of LEXICON) d += wordDistance(word(a, m), word(b, m)); sum += d / LEXICON.length; pairs++; }
console.log(`  mean distance between spoken languages: ${pairs ? (sum / pairs).toFixed(3) : 'n/a'} over ${pairs} pairs`);

if (json) fs.writeFileSync(json, JSON.stringify({ year: sim.simYear, lexicon: [...LEXICON], sayings: SAYINGS.map((x) => x.english), list: languageList(h, sim.simYear, (sp) => { const g = sim.creatures.species[sp]!.ref; return bodyFrom(g[G.LimbPairs]!, g[G.LimbType]!, g[G.Neck]!, g[G.Horn]!, g[G.Tail]!); }) }));
console.log(`  scripts: ${(h.scripts ?? []).map((x) => `${x.name} [+${Math.round(x.born - began)}${x.parent >= 0 ? `, from ${h.scripts![x.parent]!.name}` : ''}]`).join('; ')}`);
