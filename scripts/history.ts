// Headless run of a whole history, for tuning. Usage: npx vite-node scripts/history.ts [seed] [millionYears] [gridN]
import { Simulation } from '../src/sim/simulation';
import { G, P, sizeMetres } from '../src/sim/genetics';

const seed = process.argv[2] ?? 'amber-reef-101';
const my = Number(process.argv[3] ?? 150);
const n = Number(process.argv[4] ?? 63);
const t0 = Date.now();
const sim = new Simulation(seed, n);
const dt = 15000;
let nextReport = 0;
let shown = 0;
for (let y = 0; y < my * 1e6; y += dt) {
  sim.step(dt);
  for (const e of sim.events.events.slice(shown)) {
    if (e.importance >= 2) console.log(`  [${(e.simYear / 1e6).toFixed(2)} My] (${e.importance}) ${e.title}: ${e.description.slice(0, 150)}`);
  }
  shown = sim.events.events.length;
  if (sim.simYear >= nextReport) {
    nextReport += my * 1e6 / 15;
    const cr = sim.creatures, pl = sim.plants;
    let land = 0, fly = 0, hunters = 0, maxSize = 0, maxIq = 0, maxDiet = 0;
    for (const s of cr.species) {
      if (s.extinctYear >= 0) continue;
      if (cr.speciesMean(s.id, P.LandUse, true) > 0.5) land++;
      if (cr.speciesMean(s.id, P.Fly, true) > 0.3) fly++;
      if (s.ref[G.Diet]! > 0.6) hunters++;
      maxSize = Math.max(maxSize, sizeMetres(s.ref[G.Size]!));
      maxIq = Math.max(maxIq, s.ref[G.Intelligence]!);
      maxDiet = Math.max(maxDiet, s.ref[G.Diet]!);
    }
    console.log(`${(sim.simYear / 1e6).toFixed(1)} My | T ${sim.climate.meanTemp.toFixed(1)} sea ${sim.world.seaLevel.toFixed(2)} O2 ${pl.oxygen.toFixed(3)} | plants ${pl.living} (land ${pl.totalLandCover.toFixed(0)} sea ${pl.totalSeaCover.toFixed(0)}) | species ${cr.livingSpecies}/${cr.species.length} cohorts ${cr.living} pop ${cr.totalPop.toExponential(1)} | land ${land} fly ${fly} hunt ${hunters} max ${maxSize.toFixed(1)}m iq ${maxIq.toFixed(2)} diet ${maxDiet.toFixed(2)} | civ ${sim.civ.living} tech ${sim.civ.maxTech.toFixed(2)} | events ${sim.events.events.length} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
const ext = sim.events.events.filter((e) => e.type === 'extinction').length;
console.log('ms per part:', JSON.stringify(Object.fromEntries(Object.entries(sim.prof).map(([k, v]) => [k, Math.round(v)]))));
console.log(`done: ${sim.events.events.length} events, ${ext} extinctions, milestones: ${[...sim.milestones.keys()].join(', ')}`);
