import { Simulation } from '../src/sim/simulation';
import { G, GENE_COUNT, P, PHEN_COUNT } from '../src/sim/genetics';
const sim = new Simulation(process.argv[2] ?? 'amber-reef-101', 30);
while (sim.simYear < 200e6) sim.step(15000);
const cr = sim.creatures, reg = sim.regions;
const variants: Record<string, (g: Float32Array) => void> = {
  same: () => {},
  'glider .70': (g) => { g[G.LimbType] = 0.70; },
  'wings .80': (g) => { g[G.LimbType] = 0.80; },
  'wings .9 small': (g) => { g[G.LimbType] = 0.9; g[G.Size] = Math.min(g[G.Size]!, 0.3); },
};
const picks: number[] = [];
for (let c = 0; c < cr.high && picks.length < 4; c++) {
  if (cr.alive[c] && cr.count[c]! > 500 && cr.phen[c * PHEN_COUNT + P.LandUse]! > 0.5) picks.push(c);
}
console.log('land cohorts found', picks.length);
const tmp = new Float32Array(GENE_COUNT);
const made: { name: string; c: number; parent: number; n0: number }[] = [];
for (const c of picks) for (const [name, fn] of Object.entries(variants)) {
  tmp.set(cr.genome.subarray(c * GENE_COUNT, (c + 1) * GENE_COUNT)); fn(tmp);
  const n0 = cr.count[c]! * 0.05;
  made.push({ name, c: cr.spawn(cr.sp[c]!, cr.region[c]!, n0, tmp, 0), parent: c, n0 });
}
(cr as any).consolidate = () => {};
cr.step(sim['lifeRng'], sim.simYear, 1, sim.plants.oxygen);
for (const c of picks) {
  const r = cr.region[c]!, g = c * GENE_COUNT;
  console.log(`parent size ${cr.genome[g + G.Size]!.toFixed(2)} limb ${cr.genome[g + G.LimbType]!.toFixed(2)} len ${cr.genome[g + G.LimbLength]!.toFixed(2)} | landBins ${[0, 1, 2].map((b) => sim.plants.landBins[r * 3 + b]!.toFixed(2))} Tl ${reg.landTemp[r]!.toFixed(0)} cohorts ${cr.cohortsIn(r).length}`);
  for (const m of made.filter((x) => x.parent === c)) {
    const p = m.c * PHEN_COUNT;
    console.log(`   ${m.name.padEnd(15)} fed ${cr.fed[m.c]!.toFixed(2)} growth x${(cr.alive[m.c] ? cr.count[m.c]! / m.n0 : 0).toFixed(2)} fly ${cr.phen[p + P.Fly]!.toFixed(2)} walk ${cr.phen[p + P.Walk]!.toFixed(2)} need ${cr.phen[p + P.Need]!.toFixed(2)} forage ${cr.phen[p + P.Forage]!.toFixed(2)} feed ${[0, 1, 2].map((k) => cr.phen[p + P.Feed0 + k]!.toFixed(2))}`);
  }
}
