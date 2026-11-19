// Inject variants next to existing cohorts and compare how well they feed and grow in one step.
import { Simulation } from '../src/sim/simulation';
import { G, GENE_COUNT, P, PHEN_COUNT } from '../src/sim/genetics';
const sim = new Simulation(process.argv[3] ?? 'amber-reef-101', Number(process.argv[4] ?? 36));
const until = Number(process.argv[2] ?? 150) * 1e6;
while (sim.simYear < until) sim.step(15000);
const cr = sim.creatures, reg = sim.regions;
const variants: Record<string, (g: Float32Array) => void> = {
  same: () => {},
  'diet+0.15': (g) => { g[G.Diet] += 0.15; },
  'diet+0.4': (g) => { g[G.Diet] += 0.4; },
  'water-0.15': (g) => { g[G.Water] -= 0.15; },
  'water-0.3,lobe': (g) => { g[G.Water] -= 0.3; g[G.LimbType] = 0.46; g[G.LimbPairs] = 0.4; },
  'water-0.6,legs': (g) => { g[G.Water] -= 0.6; g[G.LimbType] = 0.6; g[G.LimbPairs] = 0.5; },
  'limb->lobe only': (g) => { g[G.LimbType] = 0.46; g[G.LimbPairs] = Math.max(g[G.LimbPairs]!, 0.3); },
  'water-0.3 only': (g) => { g[G.Water] -= 0.3; },
};
// pick coastal cohorts with decent numbers
const picks: number[] = [];
for (let c = 0; c < cr.high && picks.length < 4; c++) {
  if (!cr.alive[c] || cr.count[c]! < 1000) continue;
  const r = cr.region[c]!;
  if (reg.land[r]! > 0.25 && reg.land[r]! < 0.75 && sim.plants.landFood[r]! > 0.1) picks.push(c);
}
const tmp = new Float32Array(GENE_COUNT);
const made: { name: string; c: number; parent: number; n0: number }[] = [];
for (const c of picks) {
  for (const [name, fn] of Object.entries(variants)) {
    tmp.set(cr.genome.subarray(c * GENE_COUNT, (c + 1) * GENE_COUNT));
    fn(tmp);
    for (let i = 0; i < GENE_COUNT; i++) tmp[i] = Math.max(0, Math.min(1, tmp[i]!));
    const n0 = cr.count[c]! * 0.05;
    const v = cr.spawn(cr.species.length - 1 - (made.length % 1), cr.region[c]!, n0, tmp, 0);
    made.push({ name, c: v, parent: c, n0 });
  }
}
(cr as any).consolidate = () => {};
const parentN = picks.map((c) => cr.count[c]!);
cr.step(sim['lifeRng'], sim.simYear, 1, sim.plants.oxygen);
picks.forEach((c, i) => {
  const r = cr.region[c]!;
  console.log(`parent c${c} region land ${reg.land[r]!.toFixed(2)} landFood ${sim.plants.landFood[r]!.toFixed(2)} seaFood ${sim.plants.seaFood[r]!.toFixed(2)} Tl ${reg.landTemp[r]!.toFixed(0)} fed ${cr.fed[c]!.toFixed(2)} growth x${(cr.count[c]! / parentN[i]!).toFixed(2)} size ${cr.genome[c * GENE_COUNT + G.Size]!.toFixed(2)} cohortsHere ${cr.cohortsIn(r).length}`);
  for (const m of made.filter((m) => m.parent === c)) {
    const p = m.c * PHEN_COUNT;
    console.log(`   ${m.name.padEnd(16)} fed ${cr.fed[m.c]!.toFixed(2)} growth x${(cr.alive[m.c] ? cr.count[m.c]! / m.n0 : 0).toFixed(2)} landUse ${cr.phen[p + P.LandUse]!.toFixed(2)} walk ${cr.phen[p + P.Walk]!.toFixed(2)} meat ${cr.phen[p + P.MeatEff]!.toFixed(2)} herb ${cr.phen[p + P.HerbEff]!.toFixed(2)} tmin ${cr.phen[p + P.TMin]!.toFixed(0)} tmax ${cr.phen[p + P.TMax]!.toFixed(0)} feed ${cr.phen[p + P.Feed0]!.toFixed(2)},${cr.phen[p + P.Feed1]!.toFixed(2)},${cr.phen[p + P.Feed2]!.toFixed(2)}`);
  }
});
