// How a world's history gets going: for each seed, when history begins, how many people and towns there are at the
// dawn, what kind of animal the builders are, and where the world stands 2,000 and 5,000 years on (age reached,
// countries, towns, people). For judging a change to evolution by what it does to the histories that follow.
// Usage: npx vite-node scripts/dawn.ts <gridN> <seed> [seed ...]
import { Simulation } from '../src/sim/simulation';
import { G } from '../src/sim/genetics';
const [n = '17', ...seeds] = process.argv.slice(2);
for (const seed of seeds.length ? seeds : ['amber-reef-101']) {
  const sim = new Simulation(seed, Number(n));
  for (let t = 0; t < 600e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
  if (!sim.civ.historyActive) { console.log(`${seed}: no history by 600 My`); continue; }
  const h = sim.civ.h;
  const at = (): string => {
    const towns = sim.civ.settlements.filter((s) => s.ruined < 0), living = h.nations.filter((x) => x.ended < 0);
    return `age ${h.topEra}, ${living.length} countries, ${towns.length} towns, ${Math.round(towns.reduce((a, t) => a + t.pop, 0))} people, best craft ${Math.max(0, ...towns.map((t) => t.tech)).toFixed(2)}`;
  };
  const sp = sim.creatures.species[sim.civ.settlements.find((t) => t.ruined < 0)!.species]!, g = sp.ref;
  const dawn = sim.simYear;
  let out = `${seed}: dawn at ${(dawn / 1e6).toFixed(1)} My (${at()}); builders ${sp.name}: size ${g[G.Size]!.toFixed(2)}, warm ${g[G.WarmBlood]!.toFixed(2)}, water ${g[G.Water]!.toFixed(2)}, diet ${g[G.Diet]!.toFixed(2)}, herding ${g[G.Sociality]!.toFixed(2)}, mind ${g[G.Intelligence]!.toFixed(2)}`;
  for (const mark of [2000, 5000]) {
    while (sim.simYear - dawn < mark) sim.step(5);
    out += `\n      +${mark}: ${at()}, wars ${(h.wars ?? []).length}`;
  }
  console.log(out);
}
