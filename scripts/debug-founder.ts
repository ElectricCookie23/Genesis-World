import { Simulation } from '../src/sim/simulation';
import { P, PHEN_COUNT, G, GENE_COUNT } from '../src/sim/genetics';
const sim = new Simulation('amber-reef-101', Number(process.argv[2] ?? 63));
while (sim.stage !== 'animals') sim.step(15000);
const cr = sim.creatures;
for (let k = 0; k < 7; k++) {
  const rows: string[] = [];
  for (let c = 0; c < cr.high && rows.length < 2; c++) {
    if (!cr.alive[c]) continue;
    const p = c * PHEN_COUNT, r = cr.region[c]!;
    const g = c * GENE_COUNT; void G; rows.push(`sp${cr.sp[c]} diet=${cr.genome[g + G.Diet]!.toFixed(2)} meat=${cr.phen[p + P.MeatEff]!.toFixed(2)} c${c} r${r} n=${cr.count[c]!.toFixed(0)} fed=${cr.fed[c]!.toFixed(2)} need=${cr.phen[p + P.Need]!.toFixed(3)} forage=${cr.phen[p + P.Forage]!.toFixed(3)} herb=${cr.phen[p + P.HerbEff]!.toFixed(2)} swim=${cr.phen[p + P.Swim]!.toFixed(2)} landUse=${cr.phen[p + P.LandUse]!.toFixed(2)} feed=${cr.phen[p + P.Feed0]!.toFixed(2)},${cr.phen[p + P.Feed1]!.toFixed(2)} rmax=${cr.phen[p + P.RMax]!.toFixed(2)} death=${cr.phen[p + P.Death]!.toFixed(2)} tmin=${cr.phen[p + P.TMin]!.toFixed(0)} tmax=${cr.phen[p + P.TMax]!.toFixed(0)} T=${sim.regions.temp[r]!.toFixed(1)} land=${sim.regions.land[r]!.toFixed(2)} seaBins=${[0, 1, 2].map((b) => sim.plants.seaBins[r * 3 + b]!.toFixed(3))} seaFood=${sim.plants.seaFood[r]!.toFixed(3)}`);
  }
  console.log(`step ${k} year ${(sim.simYear / 1e6).toFixed(2)} cohorts ${cr.living} pop ${cr.totalPop.toFixed(0)} O2 ${sim.plants.oxygen.toFixed(3)}\n  ` + rows.join('\n  '));
  sim.step(15000);
}
