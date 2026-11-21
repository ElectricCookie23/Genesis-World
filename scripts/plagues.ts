// Plague years (system E37): grow a world to its dawn, live its history a year at a time, and print each
// pandemic: where it began, every town it reached and how, and how far its path kept to the ways of trade.
// Usage: npx vite-node scripts/plagues.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { alongTrade, describePandemic } from '../src/sim/history/plague';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began, towns = sim.civ.settlements;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events;
const list = h.plagues ?? [];
const live = towns.filter((t) => t.ruined < 0).length, edges = sim.civ.tradeEdges(sim);
const onNet = new Set<number>(); for (const e of edges) { onNet.add(e.a); onNet.add(e.b); }
console.log(`${seed}: ${ev.filter((e) => e.type === 'plague').length} plague events, ${list.length} pandemics; living towns ${live}, on a way of trade ${[...onNet].filter((id) => towns[id]!.ruined < 0).length} (${edges.length} ways: ${edges.filter((e) => e.via === 'road').length} made, ${edges.filter((e) => e.via !== 'road').length} routes)`);
for (const p of list) {
  console.log(`  [+${Math.round(p.began - began)}] ${p.name} (${p.own}), catching ${p.catching.toFixed(2)} deadly ${p.deadly.toFixed(2)}: ${describePandemic(p, live, sim.simYear)} shut ${p.reached.filter((r) => r.shut).length}; via ${['road', 'sea', 'trade', 'foot'].map((v) => `${v} ${p.reached.filter((r) => r.via === v).length}`).join(', ')}; along trade ${(alongTrade(p) * 100).toFixed(0)}%`);
}
const p = list.find((x) => x.reached.length > 4) ?? list[0];
if (p) { for (const r of p.reached.slice(0, 8)) console.log(`      +${Math.round(r.year - p.began)} ${towns[r.town]!.name} ${r.via}${r.from >= 0 ? ` from ${towns[r.from]!.name}` : ''} dead ${(r.dead * 100).toFixed(0)}%${r.shut ? ' (shut)' : ''}`); const e = ev[p.endEvent]; if (e) console.log(`      end: ${e.title}: ${e.description}`); const o = ev[p.eventId]; if (o) console.log(`      began: ${o.title}: ${o.description}\n      causes: ${o.causes.map((c) => `[${ev[c]!.type}] ${ev[c]!.title}`).join(' | ')}`); }
