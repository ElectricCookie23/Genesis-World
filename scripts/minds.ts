// How close does a world come to minds? Prints the cleverest land lineage over time and when settlements appear.
// Usage: npx vite-node scripts/minds.ts <seed> <My> [gridN]
import { Simulation } from '../src/sim/simulation';
import { G, P } from '../src/sim/genetics';
const [seed = 'amber-reef-101', my = '300', n = '27'] = process.argv.slice(2);
const sim: any = new Simulation(seed, Number(n));
const span = Number(my) * 1e6;
let first = -1;
for (let t = 0, k = 0; t < span; t += 15000, k++) {
  sim.step(15000);
  if (first < 0 && sim.civ.settlements.length) { first = sim.simYear; console.log(`first settlement at ${(first / 1e6).toFixed(1)} My`); }
  if (k % 1334 === 1333) {
    const cr = sim.creatures; let best = 0, bs = 0, soc = 0, name = '', land = 0, clever = 0;
    for (const sp of cr.species) { if (sp.extinctYear >= 0) continue; const lu = cr.speciesMean(sp.id, P.LandUse, true); if (lu < 0.4) continue; land++; const i = sp.ref[G.Intelligence]; if (i > 0.5 && sp.ref[G.Sociality] > 0.35) clever++; if (i > best) { best = i; soc = sp.ref[G.Sociality]; bs = sp.pop; name = sp.name; } }
    console.log(`${(sim.simYear / 1e6).toFixed(0)} My | land species ${land} | cleverest ${name} I=${best.toFixed(2)} S=${soc.toFixed(2)} pop ${bs.toExponential(1)} | above threshold ${clever} | sapient ${sim.civ.sapient.length} | settlements ${sim.civ.living} tech ${sim.civ.maxTech.toFixed(2)}`);
  }
}
