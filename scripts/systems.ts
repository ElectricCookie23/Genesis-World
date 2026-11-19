import { Simulation } from '../src/sim/simulation';
import { G } from '../src/sim/genetics';
const seed = process.argv[2] ?? 'amber-reef-101';
const span = Number(process.argv[3] ?? 160) * 1e6;
const sim: any = new Simulation(seed, 27);
const want = new Set(['canyon', 'delta', 'atoll', 'dust', 'trail', 'pollination', 'hibernation', 'symbiosis', 'current', 'supercontinent']);
const seen = new Map<string, number>();
let treks = 0, trekMass = 0;
const orig = sim.wearTrail.bind(sim);
sim.wearTrail = (a: number, b: number, m: number) => { treks++; trekMass += m; orig(a, b, m); };
let k = 0;
for (let t = 0; t < span; t += 15000, k++) {
  const n0 = sim.events.events.length;
  sim.step(15000);
  for (let j = n0; j < sim.events.events.length; j++) { const e = sim.events.events[j]!; if (want.has(e.type) && !seen.has(e.type)) { seen.set(e.type, e.simYear); console.log(`[${(e.simYear / 1e6).toFixed(1)} My] ${e.type}: ${e.title}`); } }
  if (k % 2000 === 0 && k > 0) {
    const w = sim.world; let tr = 0, trMax = 0; for (let i = 0; i < w.trail.length; i++) { if (w.trail[i]! > 0.3) tr++; trMax = Math.max(trMax, w.trail[i]!); }
    let pol = 0; for (let r = 0; r < sim.plants.pollinators.length; r++) pol = Math.max(pol, sim.plants.pollinators[r]!);
    const cr = sim.creatures; let mig = 0, landSp = 0, hib = 0, hibCold = 0, small = 0, big = 0, flyers = 0;
    for (const sp of cr.species) { if (sp.extinctYear >= 0) continue; const g = sp.ref; if (g[G.Water] < 0.5) { landSp++; if (g[G.Migration] > 0.45) mig++; } if (g[G.Burrow] > 0.5 && g[G.Metabolism] < 0.55 && g[G.Water] < 0.5) { hib++; if (sim.regions.landTemp[sp.home] < 6) hibCold++; } if (g[G.Size] < 0.3 && g[G.Diet] > 0.2 && g[G.Diet] < 0.8) small++; if (g[G.Size] > 0.55 && sp.pop > 2000) big++; if (g[G.Size] < 0.3 && g[G.Diet] < 0.45 && g[G.LimbType] > 0.75) flyers++; }
    console.log(`${(sim.simYear / 1e6).toFixed(0)} My stage ${sim.stage} | sp ${cr.livingSpecies} land ${landSp} mig ${mig} | treks ${treks} mass ${trekMass.toExponential(1)} | trail>0.3 ${tr} max ${trMax.toFixed(2)} | pol ${pol.toFixed(2)} flyers ${flyers} | hib ${hib}/${hibCold} | big ${big} small ${small} pairs ${cr.symbiont.size / 2}`);
    treks = 0; trekMass = 0;
  }
}
console.log('missing:', [...want].filter((x) => !seen.has(x)).join(', '));
