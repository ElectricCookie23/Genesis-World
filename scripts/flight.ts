// How often does flight evolve in a world left alone? For each seed, at 60 My, 100 My and the dawn of history:
// how many living kinds of animal glide, how many fly under their own power, and the limb and size genes behind it.
// Usage: npx vite-node scripts/flight.ts <gridN> <seed> [seed ...]
import { Simulation } from '../src/sim/simulation';
import { G, P, PHEN_COUNT, computePhenotype } from '../src/sim/genetics';
const [n = '21', ...seeds] = process.argv.slice(2);
for (const seed of seeds.length ? seeds : ['amber-reef-101']) {
  const sim = new Simulation(seed, Number(n));
  const out = new Float32Array(PHEN_COUNT);
  const report = (label: string): void => {
    const live = sim.creatures.species.filter((s) => s.extinctYear < 0 && s.name);
    let glide = 0, fly = 0, land = 0, best = 0;
    for (const s of live) {
      computePhenotype(s.ref, 0, out, 0);
      const f = out[P.Fly]!;
      best = Math.max(best, f);
      if (f >= 0.5) fly++; else if (f >= 0.12) glide++;
      if (s.ref[G.Water]! < 0.5) land++;
    }
    const q = (k: number): string => { const v = live.map((s) => s.ref[k]!).sort((a, b) => a - b); return v.length ? `${v[0]!.toFixed(2)}/${v[Math.floor(v.length / 2)]!.toFixed(2)}/${v[v.length - 1]!.toFixed(2)}` : '-'; };
    console.log(`${seed} ${label}: ${live.length} kinds (${land} of the land); gliders ${glide}, fliers ${fly}, best flight ${best.toFixed(2)}; limb type ${q(G.LimbType)}  size ${q(G.Size)}  first-flight ${sim.milestones.has('first-flight') ? 'yes' : 'no'}`);
  };
  while (sim.simYear < 60e6 && !sim.civ.historyActive) sim.step(15000);
  report(`at ${(sim.simYear / 1e6).toFixed(0)} My`);
  while (sim.simYear < 100e6 && !sim.civ.historyActive) sim.step(15000);
  if (sim.simYear > 61e6) report(`at ${(sim.simYear / 1e6).toFixed(0)} My`);
  while (sim.simYear < 400e6 && !sim.civ.historyActive) sim.step(15000);
  report(sim.civ.historyActive ? `at the dawn, ${(sim.simYear / 1e6).toFixed(1)} My` : 'at 400 My, no history');
}
