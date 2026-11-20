// Infrastructure networks (system E15): grow a world to its dawn, live its history a year at a time, and print
// when each kind of network first appeared and how much of each there is.
// Usage: npx vite-node scripts/networks.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { NETWORKS } from '../src/sim/history/model';
const [seed = 'slate-iris-707', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
const t0 = Date.now();
for (let y = 0; y < Number(years); y++) sim.step(1);
const links = h.links ?? [];
console.log(`${seed}: ${links.length} stretches among ${sim.civ.living} towns in ${h.nations.filter((x) => x.ended < 0).length} nations, ${((Date.now() - t0) / 1000).toFixed(0)} s for ${years} years`);
NETWORKS.forEach((net, k) => {
  const mine = links.filter((l) => l.kind === k);
  const first = sim.events.events[h.firstLinks?.[k] ?? -1];
  console.log(`  ${net.plural.padEnd(16)} ${String(mine.length).padStart(4)}  ${first ? `first +${Math.round(first.simYear - began)}: ${first.description.slice(0, 150)}` : 'never'}`);
});
const cross = links.filter((l) => sim.civ.settlements[l.a]!.nation !== sim.civ.settlements[l.b]!.nation).length;
console.log(`  across borders: ${cross}; lit cells ${[...sim.world.lights].filter((v) => v > 0).length}`);
