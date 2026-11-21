// Stories told about old bones (system E28): grow a world to its dawn, live its history a year at a time, and
// print each story, the real species it is about, and whether anyone has worked out what the animal was.
// Usage: npx vite-node scripts/legends.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { trueAnimal } from '../src/sim/history/legend';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const list = h.legends ?? [];
console.log(`${seed}: ${list.length} stories about ${new Set(list.map((L) => L.species)).size} species; ${list.filter((L) => L.known).length} worked out. Extinct species with names: ${sim.creatures.species.filter((s) => s.extinctYear >= 0 && s.name).length}`);
for (const L of list.slice(0, 6)) {
  const sp = sim.creatures.species[L.species]!;
  console.log(`  [+${Math.round(L.year - began)}] ${L.own}, ${L.means} (${L.kind}), ${h.nations[L.nation]!.name}: ${L.tale}\n      really: ${sp.name}, ${trueAnimal(sp.ref)}; died out ${((sim.simYear - sp.extinctYear) / 1e6).toFixed(1)} million years before${L.known ? `\n      worked out +${Math.round(L.known.year - began)} by ${h.nations[L.known.nation]!.name}: ${L.known.text}` : ''}`);
}
