// Art movements (system E26): grow a world to its dawn, live its history a year at a time, and print its
// schools of painters and what was painted in each age. With a file name, also writes the gallery's data.
// Usage: npx vite-node scripts/gallery.ts <seed> <years> [gridN] [json]
import * as fs from 'fs';
import { Simulation } from '../src/sim/simulation';
import { ART_STYLES } from '../src/sim/history/art';
import { galleryList } from '../src/sim/history/gallery';
import { bodyFrom } from '../src/sim/history/script';
import { G } from '../src/sim/genetics';
const [seed = 'amber-reef-101', years = '6000', n = '17', json = ''] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ps = h.paintings ?? [], ms = h.movements ?? [];
const eras = new Map<number, number>(), subjects = new Map<string, number>();
for (const p of ps) { eras.set(p.era, (eras.get(p.era) ?? 0) + 1); subjects.set(p.subject, (subjects.get(p.subject) ?? 0) + 1); }
console.log(`${seed}: ${ps.length} paintings, ${ms.length} movements; highest age reached ${h.peakEra ?? h.topEra}; paintings by age ${[...eras.entries()].sort((a, b) => a[0] - b[0]).map(([e, c]) => `${e}:${c}`).join(' ')}; by subject ${[...subjects.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const m of ms.slice(0, 8)) console.log(`  [+${Math.round(m.born - began)}] ${m.name} (${m.own}), ${ART_STYLES[m.style]}, begun in ${h.nations[m.nation]!.name}${m.against >= 0 ? `, against ${ms[m.against]!.name}` : ''}`);
for (const p of ps.filter((x) => x.first).slice(0, 12)) console.log(`  [+${Math.round(p.year - began)}] age ${p.era}, ${ART_STYLES[p.style]}: "${p.title}" (${p.subject}${p.detail ? ', ' + p.detail : ''})${p.painter ? ' by ' + p.painter : ''}, ${h.nations[p.nation]?.name ?? "a camp"}`);
if (json) fs.writeFileSync(json, JSON.stringify({ year: sim.simYear, ...galleryList(h, sim.events.events, sim.civ.settlements, (sp) => { const g = sim.creatures.species[sp]!.ref; return bodyFrom(g[G.LimbPairs]!, g[G.LimbType]!, g[G.Neck]!, g[G.Horn]!, g[G.Tail]!); }) }));
