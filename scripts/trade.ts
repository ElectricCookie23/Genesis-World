// Resources and trade goods (system E31): grow a world to its dawn, live its history a year at a time, and
// print each country's chief trade and every time a find turned one.
// Usage: npx vite-node scripts/trade.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { GOODS } from '../src/sim/history/trade';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events;
const routes = ev.filter((e) => e.type === 'trade-route'), shifts = ev.filter((e) => e.type === 'trade-shift');
const goods = new Map<string, number>();
for (const x of h.nations) if (x.ended < 0 && x.trade) goods.set(GOODS[x.trade.good]!, (goods.get(GOODS[x.trade.good]!) ?? 0) + 1);
console.log(`${seed}: ${routes.length} trade routes begun, ${shifts.length} turned by a find; living countries trading now: ${[...goods.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const e of [...routes.slice(0, 3), ...shifts.slice(0, 5)]) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: ${e.description}\n      because: ${e.causes.map((c) => `[${ev[c]!.type}] ${ev[c]!.title}`).join(' | ')}`);
