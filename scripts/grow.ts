// Grow a world in Node and write it to a file as a save, so browser checks can start from an old world
// in seconds instead of warping for minutes. Usage: npx vite-node scripts/grow.ts <seed> <My | dawn+years> <out.json> [gridN]
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/simulation';
import { saveSimulation } from '../src/sim/snapshot';

const [seed = 'amber-reef-101', my = '150', out = 'world.json', gridN] = process.argv.slice(2);
const sim = gridN ? new Simulation(seed, Number(gridN)) : new Simulation(seed);
// "dawn+3000" grows until history begins and then lives 3000 years of it one year at a time, so people are on record
const afterDawn = my.startsWith('dawn') ? Number(my.slice(5) || 0) : -1;
const span = afterDawn >= 0 ? 400e6 : Number(my) * 1e6;
const t0 = Date.now();
for (let t = 0, k = 0; t < span && !(afterDawn >= 0 && sim.civ.historyActive); t += 15000, k++) {
  sim.step(15000);
  if (k % 1000 === 999) console.log(`${(sim.simYear / 1e6).toFixed(0)} My, ${sim.creatures.livingSpecies} species, ${sim.civ.living} settlements (${sim.civ.settlements.length} ever), nations ${sim.civ.h.nations.filter((n) => n.ended < 0).length}/${sim.civ.h.nations.length}, people ${sim.civ.h.people.length}, events ${sim.events.events.length}, log ${sim.cellLog.count}, heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

for (let y = 0; y < afterDawn && sim.civ.historyActive; y++) sim.step(1);

/** JSON cannot hold typed arrays, maps or sets: tag them so the page can rebuild them. */
function encode(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? { __n: String(v) } : v;
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const a = v as Float32Array;
    return { __t: a.constructor.name, b: Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64') };
  }
  if (v instanceof Map) return { __m: [...v.entries()].map(([k, x]) => [encode(k), encode(x)]) };
  if (v instanceof Set) return { __s: [...v.values()].map(encode) };
  if (Array.isArray(v)) return v.map(encode);
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(v)) o[k] = encode((v as Record<string, unknown>)[k]);
  return o;
}
const save = saveSimulation(sim, 'grown');
writeFileSync(out, JSON.stringify(encode(save)));
console.log(`wrote ${out}: year ${(sim.simYear / 1e6).toFixed(1)} My, moons ${sim.moons}, ${sim.creatures.livingSpecies} species, ${sim.civ.living} settlements`);
