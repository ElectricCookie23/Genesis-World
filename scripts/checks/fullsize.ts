// The full-size world (the grid the page uses): how long a step takes and how big a save is, at each stage.
import { Simulation } from '../../src/sim/simulation';
import { saveSimulation, loadSimulation, packSave } from '../../src/sim/snapshot';
const seed = process.argv[2] ?? 'amber-reef-101';
const t0 = Date.now();
const sim = new Simulation(seed);
console.log('made in', Date.now() - t0, 'ms; cells', sim.world.grid.count);
const bytes = (v: unknown): number => {
  // what a structured copy of it would weigh: typed arrays by their bytes, the rest as text
  let n = 0; const seen = new Set<unknown>();
  const walk = (x: unknown): void => {
    if (x === null || x === undefined) return;
    if (typeof x === 'string') { n += x.length; return; }
    if (typeof x !== 'object') { n += 8; return; }
    if (seen.has(x)) return; seen.add(x);
    if (ArrayBuffer.isView(x)) { n += (x as ArrayBufferView).byteLength; return; }
    if (x instanceof ArrayBuffer) { n += x.byteLength; return; }
    if (Array.isArray(x)) { for (const y of x) walk(y); return; }
    if (x instanceof Map) { for (const [k, y] of x) { walk(k); walk(y); } return; }
    if (x instanceof Set) { for (const y of x) walk(y); return; }
    for (const k of Object.keys(x as object)) { n += k.length; walk((x as Record<string, unknown>)[k]); }
  };
  walk(v); return n;
};
const measure = (tag: string, load = false) => {
  const a = Date.now(); const save = saveSimulation(sim); const b = Date.now();
  const packed = packSave(save); const c = Date.now();
  let loadMs = -1;
  if (load) { const other = new Simulation(seed); const d = Date.now(); loadSimulation(other, save); loadMs = Date.now() - d; }
  console.log(`${tag}: year ${(sim.simYear / 1e6).toFixed(1)} My, stage ${sim.stage}, events ${sim.events.events.length}; save ${(bytes(save) / 1e6).toFixed(1)} MB in ${b - a} ms, packed ${(bytes(packed) / 1e6).toFixed(1)} MB in ${c - b} ms${load ? ', loads in ' + loadMs + ' ms' : ''}; heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
};
let steps = 0, t = Date.now(), last = '';
measure('start');
while (sim.simYear < 330e6 && !sim.civ.historyActive) {
  sim.step(15000); steps++;
  if (sim.stage !== last || steps % 2500 === 0) { console.log(`  ${steps} steps, ${((Date.now() - t) / steps).toFixed(1)} ms a step so far`); if (sim.stage !== last) { last = sim.stage; measure('at ' + last); } }
}
console.log(`deep time: ${steps} steps in ${((Date.now() - t) / 1000).toFixed(0)} s, ${((Date.now() - t) / steps).toFixed(1)} ms each; history ${sim.civ.historyActive ? 'began at ' + (sim.simYear / 1e6).toFixed(1) + ' My' : 'did not begin'}`);
measure('dawn of history', true);
if (sim.civ.historyActive) {
  const t1 = Date.now(); let years = 0;
  for (; years < 3000 && sim.civ.historyActive; years++) sim.step(1);
  console.log(`history: ${years} years one at a time in ${((Date.now() - t1) / 1000).toFixed(0)} s, ${((Date.now() - t1) / Math.max(1, years)).toFixed(1)} ms a year`);
  measure('after 3000 years of history', true);
}
