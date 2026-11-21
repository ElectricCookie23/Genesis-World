// The page's fast-forward, headless and full size: 15,000-year steps on through the start of history, as a skip does.
import { Simulation } from '../../src/sim/simulation';
import { saveSimulation, packSave } from '../../src/sim/snapshot';
const sim = new Simulation(process.argv[2] ?? 'amber-reef-101', process.argv[3] ? Number(process.argv[3]) : undefined);
const t0 = Date.now();
let dawn = -1, era = -1;
try {
  while (sim.simYear < 200e6) {
    sim.step(Math.min(15000, 15000 - (sim.simYear % 15000) || 15000));
    if (sim.civ.historyLive && dawn < 0) { dawn = sim.simYear; console.log('history live at', (dawn / 1e6).toFixed(2), 'My after', Math.round((Date.now() - t0) / 1000), 's'); }
    if (sim.civ.h.topEra > era) { era = sim.civ.h.topEra; packSave(saveSimulation(sim, 'era')); console.log('  era', era, 'at', (sim.simYear / 1e6).toFixed(3), 'My'); }
    if (dawn >= 0 && sim.simYear > dawn + 40e6) break;
  }
  console.log('no crash: reached', (sim.simYear / 1e6).toFixed(2), 'My; historyLive', sim.civ.historyLive, 'towns', sim.civ.settlements.filter((s) => s.ruined < 0).length, 'events', sim.events.events.length);
} catch (e) {
  console.log('CRASH at', (sim.simYear / 1e6).toFixed(3), 'My:', (e as Error).stack?.split('\n').slice(0, 9).join('\n'));
}
