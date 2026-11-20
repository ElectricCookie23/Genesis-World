// What a fast-forward does to a civilization: grow a world in big steps until history begins, keep
// stepping the same way, and print how its towns and nations fare and why towns are abandoned.
// Usage: npx vite-node scripts/ffciv.ts <seed> <steps after dawn> [gridN] [step years]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', steps = '40', n = '', stepArg = '15000'] = process.argv.slice(2);
const sim = n ? new Simulation(seed, Number(n)) : new Simulation(seed);
const step = Number(stepArg);
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log('no history in 400 My'); process.exit(0); }
const civ = sim.civ as unknown as Record<string, (...a: unknown[]) => unknown> & typeof sim.civ;
const why = new Map<string, number>();
const abandon = civ.abandon!.bind(civ);
civ.abandon = (s: unknown, st: unknown, year: unknown) => {
  const t = st as { species: number; pop: number; cell: number; tech: number };
  const gone = sim.creatures.species[t.species]!.extinctYear >= 0;
  const k = gone ? 'species gone' : sim.world.elevation[t.cell]! <= sim.world.seaLevel ? 'under the sea' : t.pop < 0.05 ? `no people (departed ${String((civ as unknown as { departed: boolean }).departed)})` : 'other';
  why.set(k, (why.get(k) ?? 0) + 1);
  return abandon(s, st, year);
};
const h = sim.civ.h;
console.log(`dawn at ${(h.began / 1e6).toFixed(2)} My; step ${step} y`);
let seen = sim.events.events.length;
let clock = Date.now();
for (let k = 0; k < Number(steps); k++) {
  sim.step(step);
  const live = sim.civ.settlements.filter((s) => s.ruined < 0);
  const nations = h.nations.filter((x) => x.ended < 0);
  const kinds = new Map<string, number>();
  for (const e of sim.events.events.slice(seen)) kinds.set(e.type, (kinds.get(e.type) ?? 0) + 1);
  seen = sim.events.events.length;
  const c = civ as unknown as { departed: boolean; spaceAgeYear: number };
  console.log(`+${((sim.simYear - h.began) / 1000).toFixed(0)} ky: towns ${live.length} (${sim.civ.settlements.length} ever), pop ${live.reduce((a, s) => a + s.pop, 0).toFixed(0)}, top tech ${Math.max(0, ...live.map((s) => s.tech)).toFixed(2)}, nations ${nations.length}/${h.nations.length} top ${Math.max(0, ...nations.map((x) => x.tech)).toFixed(2)}, live ${sim.civ.historyLive}, peace ${(h.peace ?? -1) >= 0}, overseas ${live.filter((s) => s.overseas).length}, departed ${c.departed}, space ${c.spaceAgeYear > 0}, abandoned: ${[...why.entries()].map(([a, b]) => `${a} ${b}`).join(', ') || 'none'} | ${[...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([a, b]) => `${a} ${b}`).join(', ')}`);
  why.clear();
  if (k % 10 === 9) { console.log(`   (${((Date.now() - clock) / 10000).toFixed(2)} s a step, heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB, regions ${sim.regions.count}, people ${h.people.length})`); clock = Date.now(); }
}
