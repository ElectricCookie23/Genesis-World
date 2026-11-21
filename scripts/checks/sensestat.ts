// Which senses do the animals of a normal world have at 100 My? Gene values of the living species, and the view each gets.
import { Simulation } from '../../src/sim/simulation';
import { G } from '../../src/sim/genetics';
import { vision } from '../../src/sim/senses';
for (const seed of process.argv.slice(2)) {
  const sim = new Simulation(seed, 21);
  while (sim.simYear < 100e6 && !sim.civ.historyActive) sim.step(15000);
  const live = sim.creatures.species.filter((s) => s.extinctYear < 0);
  const q = (k: number) => { const v = live.map((s) => s.genes[k]!).sort((a, b) => a - b); return `${v[0]!.toFixed(2)}/${v[Math.floor(v.length / 2)]!.toFixed(2)}/${v[Math.floor(v.length * 0.9)]!.toFixed(2)}/${v[v.length - 1]!.toFixed(2)}`; };
  const modes: Record<string, number> = {};
  let eyeless = 0;
  for (const s of live) { const v = vision(s.genes); modes[v.mode] = (modes[v.mode] ?? 0) + 1; if (s.genes[G.EyeCount]! <= 0.1) eyeless++; }
  console.log(`${seed} at ${(sim.simYear / 1e6).toFixed(0)} My: ${live.length} living, eyeless ${eyeless}; modes ${JSON.stringify(modes)}`);
  console.log(`  min/median/p90/max  Echo ${q(G.Echo)}  Electric ${q(G.Electric)}  EyeCount ${q(G.EyeCount)}  EyeSize ${q(G.EyeSize)}  Sight ${q(G.Sight)}  Nocturnal ${q(G.Nocturnal)}  WarmBlood ${q(G.WarmBlood)}  Hearing ${q(G.Hearing)}  Smell ${q(G.Smell)}`);
}
