// Golden ages (system E10): grow a world to its dawn, live its history a year at a time, and print each
// golden age, how long it lasted, what it left and what ended it.
// Usage: npx vite-node scripts/golden.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events;
const starts = ev.filter((e) => e.type === 'golden-age'), ends = ev.filter((e) => e.type === 'golden-age-end');
const reasons = new Map<string, number>();
for (const e of ends) reasons.set(String(e.data!.reason), (reasons.get(String(e.data!.reason)) ?? 0) + 1);
const lasted = ends.map((e) => Number(e.data!.years)).sort((a, b) => a - b);
console.log(`${seed}: ${starts.length} golden ages (${h.nations.filter((x) => x.golden).length} still going), ${ends.length} ended; median ${lasted[lasted.length >> 1] ?? 0} years, longest ${lasted[lasted.length - 1] ?? 0}; monuments ${ev.filter((e) => e.type === 'monument').length}; nations ${h.nations.length}`);
console.log('  ended because: ' + [...reasons.entries()].map(([k, v]) => `${k} ${v}`).join('; '));
for (const e of [...starts.slice(0, 2), ...ends.slice(0, 3)]) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: ${e.description}\n      because: ${e.causes.map((c) => ev[c]!.title).join(' | ')}`);
