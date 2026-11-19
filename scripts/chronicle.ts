// Grow a world until history begins, then print what history does year by year.
// Usage: npx vite-node scripts/chronicle.ts <seed> <years of history> [gridN] [step years]
import { Simulation } from '../src/sim/simulation';
import { ERAS } from '../src/sim/history/eras';
const [seed = 'amber-reef-101', years = '12000', n = '27', stepArg = '1'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
let t0 = Date.now();
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log('no history in 400 My'); process.exit(0); }
const h = sim.civ.h;
console.log(`history begins at ${(h.began / 1e6).toFixed(2)} My (${((Date.now() - t0) / 1000).toFixed(0)} s to grow); first camp ${(sim.civ.settlements[0]!.founded / 1e6).toFixed(2)} My`);
const first = sim.events.events.length;
const step = Number(stepArg);
t0 = Date.now();
let shownEra = h.topEra;
for (let y = 0; y < Number(years); y += step) {
  sim.step(step);
  if (h.topEra > shownEra) { shownEra = h.topEra; console.log(`  +${Math.round(sim.simYear - h.began)} y: ${ERAS[shownEra]!.name} | nations ${h.nations.filter((x) => x.ended < 0).length}/${h.nations.length} towns ${sim.civ.living} people ${h.people.length} pop ${Math.round(h.nations.reduce((a, x) => a + (x.ended < 0 ? x.pop : 0), 0))}k`); }
}
console.log(`${years} years in ${((Date.now() - t0) / 1000).toFixed(1)} s; events ${sim.events.events.length - first}; cell log ${sim.cellLog.count}`);
const kinds = new Map<string, number>();
for (const e of sim.events.events.slice(first)) kinds.set(e.type, (kinds.get(e.type) ?? 0) + 1);
console.log('events by kind:', [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
for (const nat of h.nations.slice(0, 6)) {
  const house = h.dynasties.filter((d) => d.nation === nat.id);
  console.log(`${nat.name}: ${nat.ended < 0 ? 'alive' : 'ended +' + Math.round(nat.ended - h.began)}, tech ${nat.tech.toFixed(2)} (${ERAS[nat.era]!.name}), ${nat.towns} towns, ${Math.round(nat.pop)}k, houses ${house.length} (longest ${Math.max(...house.map((d) => d.reigns))} reigns), ruler ${h.people[nat.ruler]?.name}`);
}
console.log('towns:', sim.civ.settlements.filter((s) => s.ruined < 0).slice(0, 14).map((s) => s.name).join(', '));
for (const e of sim.events.events.slice(first).filter((x) => x.importance >= 1).slice(0, 14)) console.log(`  [+${Math.round(e.simYear - h.began)}] ${e.title}: ${e.description.slice(0, 150)}`);
