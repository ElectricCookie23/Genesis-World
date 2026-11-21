// Place name drift (system E22): grow a world to its dawn, live its history a year at a time, and print the
// towns that have had the most names, each name with its year and its reason.
// Usage: npx vite-node scripts/names.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const began = sim.civ.h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const towns = sim.civ.settlements.filter((s) => s.names && s.names.length > 1);
const living = sim.civ.settlements.filter((s) => s.ruined < 0);
const why = new Map<string, number>();
for (const t of towns) for (const x of t.names!.slice(1)) { const k = x.why.startsWith('renamed') ? 'renamed by a conqueror' : x.why.startsWith('in ') ? 'worn by a sound change' : x.why.startsWith('said the way') ? 'said the way of new people' : 'its people became a people of their own'; why.set(k, (why.get(k) ?? 0) + 1); }
console.log(`${seed}: ${towns.length} of ${sim.civ.settlements.length} towns have had more than one name (${living.filter((s) => (s.names?.length ?? 1) >= 3).length} living towns have had three or more). ${[...why.entries()].map(([k, v]) => `${k} ${v}`).join('; ')}`);
for (const t of towns.sort((a, b) => b.names!.length - a.names!.length).slice(0, 5)) {
  console.log(`  ${t.name} ("${t.modifier ? t.modifier + ' ' : ''}${t.head}", founded +${Math.round(t.founded - began)}${t.ruined >= 0 ? ', a ruin' : ''}):`);
  for (const x of t.names!) console.log(`    +${Math.round(x.year - began)} ${x.name}: ${x.why}`);
}
