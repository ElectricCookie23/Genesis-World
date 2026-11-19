// How often a seed's world falls under five living species (the test's floor), and when.
import { Simulation } from '../src/sim/simulation';
import { buildGrid } from '../src/sim/world';
const seed = process.argv[2] ?? 'basalt-vale-202';
const span = Number(process.argv[3] ?? 120) * 1e6;
const sim = new Simulation(seed, 27, buildGrid(27));
let since = -1, low = 0, checks = 0, line = '';
for (let t = 0, k = 0; t < span; t += 15000, k++) {
  sim.step(15000);
  if (sim.stage === 'animals' && since < 0) since = sim.simYear;
  if (since >= 0 && sim.simYear - since > 30e6) { checks++; if (sim.creatures.livingSpecies < 5) low++; }
  if (k % 667 === 0) line += ` ${(sim.simYear / 1e6).toFixed(0)}:${sim.creatures.livingSpecies}/${sim.climate.meanTemp.toFixed(0)}`;
}
console.log(`${seed} animals since ${(since / 1e6).toFixed(1)} My, under floor ${(100 * low / Math.max(1, checks)).toFixed(1)}%\n  My:species/temp${line}`);
