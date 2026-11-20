// Migrations of peoples (system E9): grow a world to its dawn, let history run, then (optionally) call down an
// ice age or a flood by hand and watch who moves.
// Usage: npx vite-node scripts/migrations.ts <seed> <years of history> [gridN] [iceage|flood|none] [years after]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '3000', n = '17', tool = 'none', after = '6000'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const line = (tag: string) => console.log(`${tag}: +${Math.round(sim.simYear - began)} y, towns ${sim.civ.living}, nations ${h.nations.filter((x) => x.ended < 0).length}, cultures ${h.cultures.length} (mixed ${h.cultures.filter((c) => c.mixedWith !== undefined).length}), mean temp ${sim.climate.meanTemp.toFixed(1)}, sea ${sim.world.seaLevel.toFixed(3)}, ice ${(sim.climate.iceFraction * 100).toFixed(0)}%, migrations ${sim.events.events.filter((e) => e.type === 'migration').length}`);
line('before');
if (tool !== 'none') {
  const cap = sim.civ.settlements.find((s) => s.ruined < 0)!;
  sim.intervene(tool, cap.cell);
  console.log(`called down: ${sim.events.events[sim.events.events.length - 1]!.title}`);
}
for (let y = 0, k = 0; y < Number(after); y += 20, k++) { sim.step(20); if (k % 50 === 49) line('  then'); }
line('after');
for (const e of sim.events.events.filter((x) => x.type === 'migration' || x.type === 'culture').slice(0, 8)) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: ${e.description}\n      because: ${e.causes.map((c) => sim.events.events[c]!.title).join(' | ')}`);
