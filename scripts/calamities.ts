// Disasters in cities (system E20): grow a world to its dawn, live its history a year at a time, and print
// what burned, fell, flooded or was buried, how much of each town was lost, and how it built again.
// Usage: npx vite-node scripts/calamities.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { describeScar } from '../src/sim/history/calamity';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events;
const count = (t: string) => ev.filter((e) => e.type === t).length;
const laws = ev.filter((e) => e.type === 'building-law');
const scars = sim.civ.settlements.flatMap((st) => (st.scars ?? []).map((s) => ({ st, s })));
const by = new Map<string, number>();
for (const { s } of scars) by.set(`${s.kind}:${s.rebuilt || 'as before'}`, (by.get(`${s.kind}:${s.rebuilt || 'as before'}`) ?? 0) + 1);
console.log(`${seed}: fires ${count('city-fire')}, earthquakes ${count('city-quake')}, floods ${count('city-flood')}, building laws ${laws.length}; towns ${sim.civ.settlements.filter((s) => s.ruined < 0).length} living; scars kept ${scars.length}`);
console.log('  scars: ' + [...by.entries()].sort().map(([k, v]) => `${k} ${v}`).join('; '));
for (const e of laws.slice(0, 6)) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: ${e.description}\n      because: ${e.causes.map((c) => ev[c]!.title).join(' | ')}`);
const town = sim.civ.settlements.filter((s) => s.ruined < 0 && (s.scars?.length ?? 0) >= 2).sort((a, b) => b.pop - a.pop)[0];
if (town) { console.log(`  ${town.name} (${Math.round(town.pop)} thousand, tech ${town.tech.toFixed(2)}):`); for (const s of town.scars!) console.log(`    ${describeScar(s, sim.simYear - s.year)}`); }
