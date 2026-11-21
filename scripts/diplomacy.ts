// Diplomacy (system E34): grow a world to its dawn, live its history a year at a time, and print the treaties,
// the betrayals, and every war that was fought over an old betrayal.
// Usage: npx vite-node scripts/diplomacy.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { web } from '../src/sim/history/diplomacy';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events;
const treaties = ev.filter((e) => e.type === 'treaty'), betrayals = ev.filter((e) => e.type === 'betrayal'), avenged = ev.filter((e) => e.type === 'war' && e.data && e.data.avenges !== undefined);
const kinds = new Map<string, number>();
for (const e of treaties) kinds.set(String(e.data!.kind), (kinds.get(String(e.data!.kind)) ?? 0) + 1);
const ties = new Map<string, number>();
for (const t of web(h, sim.simYear)) ties.set(t.kind, (ties.get(t.kind) ?? 0) + 1);
console.log(`${seed}: ${treaties.length} treaties (${[...kinds.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}), ${betrayals.length} betrayals, ${avenged.length} wars fought over one; wars in all ${ev.filter((e) => e.type === 'war').length}. The web now: ${[...ties.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const e of avenged.slice(0, 3)) { const wrong = ev[Number(e.data!.avenges)]!; console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: ${e.description}\n      because, ${Math.round(e.simYear - wrong.simYear)} years before: [${wrong.type}] ${wrong.title}: ${wrong.description}`); }
for (const e of betrayals.slice(0, 2)) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}`);
