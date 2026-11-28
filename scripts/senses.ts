// Which senses do the animals of a world left alone come to have? For each seed: at 60 My, at 100 My and at the
// dawn of history, how many living species find their way by sight, echoes, warmth or the electric sense, how
// sharp the sharpest eyes are, how many have no eyes at all, how many are warm-blooded, and what the thinking
// species sees. (The GPU review found that three of the four sense views could not be reached in a normal world.)
// Usage: npx vite-node scripts/senses.ts <gridN> <seed> [seed ...]
import { Simulation } from '../src/sim/simulation';
import { G } from '../src/sim/genetics';
import { vision } from '../src/sim/senses';
const [n = '21', ...seeds] = process.argv.slice(2);
for (const seed of seeds.length ? seeds : ['amber-reef-101']) {
  const sim = new Simulation(seed, Number(n));
  const report = (label: string): void => {
    const live = sim.creatures.species.filter((s) => s.extinctYear < 0 && s.name);
    if (!live.length) { console.log(`${seed} ${label}: no animals`); return; }
    const q = (k: number): string => { const v = live.map((s) => s.ref[k]!).sort((a, b) => a - b); return `${v[0]!.toFixed(2)}/${v[Math.floor(v.length / 2)]!.toFixed(2)}/${v[v.length - 1]!.toFixed(2)}`; };
    const modes: Record<string, number> = { sight: 0, echo: 0, heat: 0, electric: 0 };
    let eyeless = 0, fair = 0, sharp = 0, warm = 0, best = 0, colour = 0;
    for (const s of live) {
      const v = vision(s.ref);
      modes[v.mode]!++;
      if (s.ref[G.EyeCount]! <= 0.1) eyeless++;
      if (v.mode === 'sight' && v.acuity > 0.4) fair++;
      if (v.mode === 'sight' && v.acuity > 0.7) sharp++;
      if (s.ref[G.WarmBlood]! > 0.5) warm++;
      best = Math.max(best, v.acuity); colour = Math.max(colour, v.colour);
    }
    const mind = sim.civ.historyActive ? sim.creatures.species[sim.civ.settlements.find((t) => t.ruined < 0)?.species ?? -1] : undefined;
    console.log(`${seed} ${label}: ${live.length} species; sight ${modes.sight} (no eyes ${eyeless}, fair or better ${fair}, sharp ${sharp}; sharpest ${best.toFixed(2)}, most colour ${colour.toFixed(2)}), echo ${modes.echo}, warmth ${modes.heat}, electric ${modes.electric}; warm-blooded ${warm}${mind ? `; the builders (${mind.name}): ${vision(mind.ref).text}` : ''}`);
    console.log(`     min/median/max  EyeCount ${q(G.EyeCount)}  EyeSize ${q(G.EyeSize)}  Sight ${q(G.Sight)}  Echo ${q(G.Echo)}  Electric ${q(G.Electric)}  Nocturnal ${q(G.Nocturnal)}  WarmBlood ${q(G.WarmBlood)}  Hearing ${q(G.Hearing)}  Smell ${q(G.Smell)}  Mind ${q(G.Intelligence)}`);
  };
  const t0 = Date.now();
  while (sim.simYear < 60e6 && !sim.civ.historyActive) sim.step(15000);
  report(`at ${(sim.simYear / 1e6).toFixed(0)} My`);
  while (sim.simYear < 100e6 && !sim.civ.historyActive) sim.step(15000);
  if (sim.simYear > 61e6) report(`at ${(sim.simYear / 1e6).toFixed(0)} My`);
  while (sim.simYear < 400e6 && !sim.civ.historyActive) sim.step(15000);
  report(sim.civ.historyActive ? `at the dawn of history, ${(sim.simYear / 1e6).toFixed(1)} My` : 'at 400 My, no history');
  console.log(`     (${Math.round((Date.now() - t0) / 1000)} s)`);
}
