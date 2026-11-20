// Do the rarer things life can do ever happen? Runs seeds headless and reports, per seed, the highest value any living
// species reached for the genes behind special looks, how many true hunters there were, how far the sea moved, and
// how often the events tied to them fired.
// Usage: npx vite-node scripts/checks/traitsweep.ts <millionYears> <gridN> <seed...>
import { Simulation } from '../../src/sim/simulation';
import { G, HUNTER_DIET } from '../../src/sim/genetics';

const my = Number(process.argv[2] ?? 200), n = Number(process.argv[3] ?? 27);
const GENES: [string, number][] = [['glow', G.Glow], ['echo', G.Echo], ['electric', G.Electric], ['ornament', G.Ornament], ['metamorph', G.Metamorphosis], ['colourchange', G.ColorChange], ['diet', G.Diet], ['burrow', G.Burrow]];
const EVENTS = ['settlement', 'first-hunter', 'first-pack', 'sea-fall', 'sea-rise', 'land-bridge', 'invasion', 'mass-hatching', 'cave-dwellers', 'vent-life', 'age-of-giants', 'carnivorous-plant', 'rediscovery'];
for (const seed of process.argv.slice(4)) {
  const t0 = Date.now();
  const sim = new Simulation(seed, n);
  const top = GENES.map(() => 0);
  let hunterSamples = 0, samples = 0, seaMin = 9, seaMax = -9, peakHunters = 0, next = 1.5e6;
  while (sim.simYear < my * 1e6) {
    sim.step(15000);
    seaMin = Math.min(seaMin, sim.world.seaLevel); seaMax = Math.max(seaMax, sim.world.seaLevel);
    if (sim.simYear < next) continue;
    next += 1.5e6; samples++;
    let hunters = 0;
    for (const sp of sim.creatures.species) {
      if (sp.extinctYear >= 0 || !sp.name) continue;
      GENES.forEach(([, g], i) => { top[i] = Math.max(top[i]!, sp.ref[g]!); });
      if (sp.ref[G.Diet]! > HUNTER_DIET) hunters++;
    }
    if (hunters) hunterSamples++;
    peakHunters = Math.max(peakHunters, hunters);
  }
  const count = (t: string) => sim.events.events.filter((e) => e.type === t || e.data?.key === t).length;
  const types = new Map<string, number>(); for (const e of sim.events.events) types.set(e.type, (types.get(e.type) ?? 0) + 1);
  console.log(`${seed}: ${GENES.map(([name], i) => `${name} ${top[i]!.toFixed(2)}`).join(', ')} | hunters at ${hunterSamples} of ${samples} samples (peak ${peakHunters}) | sea ${seaMin.toFixed(3)} to ${seaMax.toFixed(3)} | kinds ${sim.creatures.livingSpecies} | ${EVENTS.map((t) => `${t} ${count(t)}`).join(', ')} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (process.env.TYPES) console.log([...types.entries()].sort().map(([k, v]) => `${k} ${v}`).join(', '));
}
