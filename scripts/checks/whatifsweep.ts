// The counterfactual engine on a small world: a meteor that did or did not fall, and one small herd spared.
// npx vite-node scripts/checks/whatifsweep.ts [seed] [start My] [horizon My]
import { Simulation } from '../../src/sim/simulation';
import { saveSimulation } from '../../src/sim/snapshot';
import { Counterfactual, changeFor } from '../../src/sim/whatif';

const seed = process.argv[2] ?? 'amber-reef-101';
const startMy = Number(process.argv[3] ?? 60), horizon = Number(process.argv[4] ?? 15) * 1e6;
const sim = new Simulation(seed, Number(process.argv[5] ?? 21));
while (sim.simYear < startMy * 1e6) sim.step(15000);
console.log(seed, 'at', Math.round(sim.simYear / 1e6), 'My:', sim.creatures.livingSpecies, 'species');
const save = saveSimulation(sim);
let land = 0;
for (let i = 0; i < sim.grid.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel + 0.2) { land = i; break; }
// the meteor: let it fall in the world itself two million years on, then ask what if it had not
while (sim.simYear < startMy * 1e6 + 2e6) sim.step(15000);
const strike = sim.meteor(land, 0.8, false);
for (const [name, change] of [['meteor', changeFor(strike)], ['herd', { kind: 'herd', title: 'One small herd is spared', year: save.simYear + 15000, cell: land, count: 40 }]] as const) {
  const t0 = Date.now();
  const cf = new Counterfactual(save, change, save.simYear + horizon);
  let slices = 0;
  while (!cf.done) { cf.advance(200); slices++; }
  const st = cf.state();
  console.log(`\n== ${name}: ${st.change.title}; from ${Math.round(st.from / 1e6)} My to ${Math.round(st.to / 1e6)} My in ${Date.now() - t0} ms (${slices} slices)`);
  for (const d of st.differences) console.log('  ', d);
  console.log('  spread:', st.spread.map((s) => `${Math.round(s.share * 100)}`).join(' '), '% of cells differ at each checkpoint');
  const m = cf.maps();
  let seaDiff = 0; for (let i = 0; i < m.withMap.length; i++) if ((m.withMap[i] === 255) !== (m.withoutMap[i] === 255)) seaDiff++;
  console.log('  cells that are sea in one and land in the other:', seaDiff, 'of', m.withMap.length, '| heat frames', m.heat.length);
}
