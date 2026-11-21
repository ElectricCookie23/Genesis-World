// Ideologies (system E35): grow a world to its dawn, live its history a year at a time, and print the ideas that
// arose, where they spread, and every revolution with the government and flag before and after.
// Usage: npx vite-node scripts/ideologies.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events;
const ideas = h.ideologies ?? [], spreads = ev.filter((e) => e.type === 'idea-spreads'), revs = ev.filter((e) => e.type === 'revolution');
const govs = new Map<string, number>();
for (const x of h.nations) if (x.ended < 0) govs.set(x.government, (govs.get(x.government) ?? 0) + 1);
console.log(`${seed}: ${ideas.length} ideas (${[...new Set(ideas.map((i) => i.kind))].map((k) => `${k} ${ideas.filter((i) => i.kind === k).length}`).join(', ')}), spread ${spreads.length} times, ${revs.length} revolutions (${[...new Set(revs.map((e) => String(e.data!.to)))].map((k) => `${k} ${revs.filter((e) => e.data!.to === k).length}`).join(', ')}). Governments now: ${[...govs.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}. Holding an idea now: ${h.nations.filter((x) => x.ended < 0 && x.idea).length} of ${h.nations.filter((x) => x.ended < 0).length}`);
for (const i of ideas.slice(0, 4)) console.log(`  [+${Math.round(i.born - began)}] ${i.name} (${i.own}), ${i.kind}, in ${h.nations[i.nation]!.name}`);
for (const e of revs.slice(0, 4)) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: ${e.description}\n      causes: ${e.causes.map((c) => `[${ev[c]!.type}] ${ev[c]!.title}`).join(' | ')}`);
