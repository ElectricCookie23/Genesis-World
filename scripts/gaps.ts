// How uneven a history is: grow a world to its dawn, live its history a year at a time, and print the
// widest gap in ages between two living nations, when it stood, and what the firsts of each age were called.
// Usage: npx vite-node scripts/gaps.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
let gap = 0, gapAt = 0, gapYears = 0, most = 0;
for (let y = 0; y < Number(years); y++) {
  sim.step(1);
  if (y % 20) continue;
  const live = h.nations.filter((x) => x.ended < 0);
  most = Math.max(most, live.length);
  if (live.length < 2) continue;
  const g = Math.max(...live.map((x) => x.era)) - Math.min(...live.map((x) => x.era));
  if (g >= 2) gapYears += 20;
  if (g > gap) { gap = g; gapAt = y; }
}
const ev = sim.events.events.filter((e) => e.simYear >= began);
const kinds = (t: string) => ev.filter((e) => e.type === t).length;
console.log(`${seed}: widest gap ${gap} ages (first at +${gapAt}), ${gapYears} years with a gap of two or more; nations ${h.nations.length} ever, ${most} at once; contacts ${kinds('contact')}, last wars ${kinds('nuclear-war')}, collapses ${kinds('nation-collapse')}, secessions ${kinds('secession')}`);
console.log('  firsts:', ev.filter((e) => e.type === 'era' && e.importance >= 2).map((e) => `+${Math.round(e.simYear - began)} ${e.title}`).join(' | '));
