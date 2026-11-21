// Markets and crashes (system E32): grow a world to its dawn, live its history a year at a time, and print the
// bubbles and panics, what each did to the country it began in, and the range each good's price has moved in.
// Usage: npx vite-node scripts/market.ts <seed> <years> [gridN] [json]
import * as fs from 'fs';
import { Simulation } from '../src/sim/simulation';
import { GOODS } from '../src/sim/history/trade';
const [seed = 'amber-reef-101', years = '6000', n = '17', json = ''] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events, m = h.market!;
const panics = ev.filter((e) => e.type === 'panic');
console.log(`${seed}: ${ev.filter((e) => e.type === 'bubble').length} bubbles, ${panics.length} panics; ${m.years.length} price samples. Ranges: ${GOODS.map((g, i) => `${g} ${Math.min(...m.prices[i]!).toFixed(2)}-${Math.max(...m.prices[i]!).toFixed(2)}`).join(', ')}`);
for (const e of panics.slice(0, 5)) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: steadiness of the country ${e.data!.before} -> ${e.data!.after}, ${e.data!.caught} caught, bid to ${e.data!.froth} times its worth\n      ${e.description}\n      because: ${e.causes.map((c) => `[${ev[c]!.type}] ${ev[c]!.title}`).join(' | ')}`);
if (json) fs.writeFileSync(json, JSON.stringify({ year: sim.simYear, market: { goods: [...GOODS], years: m.years, prices: m.prices, panics: panics.slice(-30).reverse().map((e) => ({ year: e.simYear, title: e.title, eventId: e.id, good: String(e.data!.good) })) } }));
