// What a saved copy of a full-size world is made of, array by array, and how much of each is empty space at the
// end (rows reserved and not yet used). Usage: npx vite-node scripts/savesize.ts <seed> <gridN> [years after the dawn]
import { Simulation } from '../src/sim/simulation';
import { saveSimulation, packSave, type ChunkPool, type SaveState } from '../src/sim/snapshot';
import { serialize } from 'node:v8';
const [seed = 'amber-reef-101', n = '63', after = '0'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
type Plain = Record<string, unknown>;
const typed = (v: unknown): v is Float32Array => ArrayBuffer.isView(v) && !(v instanceof DataView);
const report = (label: string): void => {
  const save = saveSimulation(sim, 'measure');
  const rows: { path: string; bytes: number; used: number }[] = [];
  let other = 0;
  const walk = (data: Plain, path: string): void => {
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (typed(v)) { let end = v.length; while (end > 0 && v[end - 1] === 0) end--; rows.push({ path: `${path}.${k}`, bytes: v.byteLength, used: end * v.BYTES_PER_ELEMENT }); }
      else if (v && typeof v === 'object' && '__nested' in (v as Plain)) walk((v as { __nested: Plain }).__nested, `${path}.${k}`);
      else if (v && typeof v === 'object') other += serialize(v).byteLength;
    }
  };
  walk(save.data, 'sim');
  rows.sort((a, b) => b.bytes - a.bytes);
  const total = rows.reduce((a, r) => a + r.bytes, 0), used = rows.reduce((a, r) => a + r.used, 0);
  const mb = (x: number): string => (x / 1e6).toFixed(2);
  console.log(`${label}: whole save ${mb(serialize(save).byteLength)} MB; kept (packed) ${mb(serialize(packSave(save)).byteLength)} MB; typed arrays ${mb(total)} MB of which ${mb(used)} MB before the trailing zeros; lists and records ${mb(other)} MB`);
  for (const r of rows.slice(0, 22)) console.log(`    ${r.path.padEnd(38)} ${mb(r.bytes).padStart(7)} MB   in use ${mb(r.used).padStart(7)} MB`);
};
report('new world');
for (let t = 0; t < 600e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
report(`dawn of history (${Math.round(sim.simYear / 1e6)} My)`);
// The kept copies as the page's worker makes them: one at the dawn and one every tenth of the years watched, each
// sharing with the one before whatever has not changed. How much do they hold between them?
const pool: ChunkPool = new Map(), copies: SaveState[] = [];
let wholeBytes = 0, packMs = 0;
const keep = (): void => {
  const save = saveSimulation(sim, 'kept');
  for (const k of Object.keys(save.data)) void k;
  let bytes = 0;
  const count = (data: Plain): void => { for (const k of Object.keys(data)) { const v = data[k]; if (typed(v)) bytes += v.byteLength; else if (v && typeof v === 'object' && '__nested' in (v as Plain)) count((v as { __nested: Plain }).__nested); } };
  count(save.data);
  wholeBytes += bytes;
  const t = performance.now();
  copies.push(packSave(save, pool));
  packMs += performance.now() - t;
};
const held = (): number => {
  const seen = new Set<unknown>();
  let bytes = 0;
  const count = (data: Plain): void => {
    for (const k of Object.keys(data)) {
      const v = data[k] as { __chunks?: Float32Array[]; __nested?: Plain } | null;
      if (typed(v)) { if (!seen.has(v)) { seen.add(v); bytes += v.byteLength; } }
      else if (v && typeof v === 'object' && Array.isArray(v.__chunks)) { for (const c of v.__chunks) if (!seen.has(c)) { seen.add(c); bytes += c.byteLength; } }
      else if (v && typeof v === 'object' && v.__nested) count(v.__nested);
    }
  };
  for (const c of copies) count(c.data);
  return bytes;
};
keep();
if (Number(after) > 0) {
  const every = Math.max(5, Math.round(Number(after) / 10 / 5) * 5);
  for (let y = 5; y <= Number(after); y += 5) { sim.step(5); if (y % every === 0) keep(); }
  report(`${after} years on`);
}
console.log(`${copies.length} kept copies: their arrays were ${(wholeBytes / 1e6).toFixed(1)} MB as whole copies, and are ${(held() / 1e6).toFixed(1)} MB as kept (unused rows dropped, unchanged pieces shared); packing took ${(packMs / copies.length).toFixed(1)} ms a copy`);
