// How reachable are the goals? Runs seeds headless and prints the numbers each goal is judged on, every so often.
// Usage: npx vite-node scripts/checks/goalsweep.ts <millionYears> <gridN> <seed...>
import { Simulation } from '../../src/sim/simulation';
import { G, P, sizeMetres } from '../../src/sim/genetics';

const my = Number(process.argv[2] ?? 300), n = Number(process.argv[3] ?? 27);
const seeds = process.argv.slice(4);
for (const seed of seeds) {
  const t0 = Date.now();
  const sim = new Simulation(seed, n);
  let next = 25e6;
  for (let y = 0; y < my * 1e6; y += 15000) {
    sim.step(15000);
    if (sim.simYear < next) continue;
    next += 25e6;
    const cr = sim.creatures;
    let land = 0, fly = 0, giant = 0;
    for (const sp of cr.species) {
      if (sp.extinctYear >= 0) continue;
      const l = cr.speciesMean(sp.id, P.LandUse, true), f = cr.speciesMean(sp.id, P.Fly, true);
      land = Math.max(land, l); fly = Math.max(fly, f);
      if (l > 0.5) giant = Math.max(giant, sizeMetres(sp.ref[G.Size]!));
    }
    const ext = sim.events.events.filter((e) => e.type === 'mass-extinction').length;
    const live = sim.civ.settlements.filter((s) => s.ruined < 0);
    const tech = live.reduce((m, s) => Math.max(m, s.tech), 0);
    console.log(`${seed.padEnd(16)} ${(sim.simYear / 1e6).toFixed(0).padStart(4)} My | green ${(sim.plants.totalLandCover / Math.max(1, sim.regions.count)).toFixed(2)} | land ${land.toFixed(2)} fly ${fly.toFixed(2)} giant ${giant.toFixed(1)} m | kinds ${cr.livingSpecies} | extinctions ${ext} | ice ${sim.climate.iceFraction.toFixed(2)} | towns ${live.length} tech ${tech.toFixed(2)} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
