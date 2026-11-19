// How often does a mind arise? Runs several seeds headless and reports when each first has a sapient lineage and a settlement.
// Usage: npx vite-node civsweep.ts <millionYears> <gridN> <seed...>
import { Simulation } from '../../src/sim/simulation';
import { G } from '../../src/sim/genetics';

const my = Number(process.argv[2] ?? 600), n = Number(process.argv[3] ?? 21);
const seeds = process.argv.slice(4);
for (const seed of seeds) {
  const t0 = Date.now();
  const sim = new Simulation(seed, n);
  let mind = -1, town = -1, peakIq = 0, iqAt: number[] = [];
  for (let y = 0; y < my * 1e6; y += 15000) {
    sim.step(15000);
    if (mind < 0 && sim.civ.sapient.length) mind = sim.simYear;
    if (town < 0 && sim.civ.settlements.length) town = sim.simYear;
    if (Math.round(sim.simYear / 15000) % 4000 === 0) {
      let iq = 0, clever = 0;
      for (const s of sim.creatures.species) if (s.extinctYear < 0) { iq = Math.max(iq, s.ref[G.Intelligence]!); if (s.ref[G.Intelligence]! > 0.5) clever++; }
      peakIq = Math.max(peakIq, iq); iqAt.push(+iq.toFixed(2));
    }
    if (town >= 0 && sim.simYear > town + 30e6) break;
  }
  console.log(`${seed.padEnd(18)} mind ${mind < 0 ? 'never' : (mind / 1e6).toFixed(0) + ' My'} | first settlement ${town < 0 ? 'never' : (town / 1e6).toFixed(0) + ' My'} | peak iq ${peakIq.toFixed(2)} | iq every 60 My: ${iqAt.join(' ')} | tech ${sim.civ.maxTech.toFixed(2)} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
