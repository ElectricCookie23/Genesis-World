// A full-size world the way the page runs it (section 4 at scale): fast to the dawn of history, in 25-year
// steps to an age (as "skip to" does), then a year at a time (as History speed does). Prints how many countries
// and towns there are, how often each kind of event happens per country, and stops at the first number in the
// history that is not a number, saying where.
// Usage: npx vite-node scripts/scale.ts <seed> <gridN> <era to skip to> <years to watch>
import { Simulation } from '../src/sim/simulation';
import { saveSimulation } from '../src/sim/snapshot';
import { serialize } from 'node:v8';
const [seed = 'amber-reef-101', n = '63', era = '4', years = '2000'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
const t0 = Date.now();
for (let t = 0; t < 600e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history'); process.exit(0); }
const h = sim.civ.h;
for (let k = 0; k < 4000 && h.topEra < Number(era); k++) sim.step(25);
const living = (): number => h.nations.filter((x) => x.ended < 0).length;
const towns = (): number => sim.civ.settlements.filter((s) => s.ruined < 0).length;
console.log(`${seed} n=${n}: at the ${era}th age after ${Math.round((Date.now() - t0) / 1000)} s; +${Math.round(sim.simYear - h.began)} years of history, ${living()} countries, ${towns()} towns`);
const bad = (): string | null => {
  // (towns that stand, and countries that live: what a ruin's numbers have decayed to is no one's business)
  for (const s of sim.civ.settlements) if (s.ruined < 0 && (!Number.isFinite(s.pop) || !Number.isFinite(s.tech) || s.pop < 0)) return `town ${s.name} (${s.id}) pop ${s.pop} tech ${s.tech}, nation ${s.nation}, founded +${Math.round(s.founded - h.began)}`;
  for (const x of h.nations) if (x.ended < 0) for (const k of ['pop', 'tech', 'stability', 'inequality', 'fatigue'] as const) if (!Number.isFinite(x[k])) return `country ${x.name} (${x.id}) ${k} ${x[k]}`;
  for (const x of h.nations) if (x.ended < 0 && !Number.isFinite(x.know.saved)) return `country ${x.name} saved ${x.know.saved}`;
  const m = h.market; if (m) for (const list of m.prices) if (list.length && !Number.isFinite(list[list.length - 1]!)) return `market price ${list[list.length - 1]}`;
  for (const w of h.wars ?? []) for (const a of w.army) if (!Number.isFinite(a.size) || !Number.isFinite(a.morale) || !Number.isFinite(a.supply)) return `army in war ${w.id} size ${a.size} morale ${a.morale} supply ${a.supply}`;
  return null;
};
const from = sim.events.events.length, t1 = Date.now();
let nationYears = 0, found: string | null = bad();
if (found) console.log('  already not a number before watching:', found);
for (let y = 0; y < Number(years) && !found; y++) {
  sim.step(1);
  if (y % 500 === 499) { (globalThis as { gc?: () => void }).gc?.(); console.log(`    +${y + 1} watched: ${living()} countries, ${towns()} towns, ${sim.events.events.length} events, heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB, a save ${Math.round(JSON.stringify(h, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as number[]) : v)).length / 1e6)} MB of history`); }
  nationYears += living();
  found = bad();
  if (found) { console.log(`  NOT A NUMBER after ${y + 1} watched years: ${found}`); for (const e of sim.events.events.slice(-8)) console.log(`      [${e.type}] ${e.title}`); }
}
{
  // how big one saved copy of this world is (the page keeps a dozen or two, for going back), and what it is made of
  const save = saveSimulation(sim, 'measure');
  const size = (v: unknown): number => { try { return serialize(v).length; } catch { return -1; } };
  const d = save.data as Record<string, { __nested?: Record<string, unknown> } | unknown>;
  const parts: [string, number][] = [];
  for (const k of Object.keys(d)) parts.push([k, size(d[k])]);
  const civ = (d.civ as { __nested: Record<string, unknown> }).__nested;
  const hh = (civ.h as { __nested?: Record<string, unknown> }).__nested ?? (civ.h as Record<string, unknown>);
  const settle = (civ.settlements as Record<string, unknown>[]) ?? [];
  const fields = new Map<string, number>();
  for (const st of settle) for (const k of Object.keys(st)) fields.set(k, (fields.get(k) ?? 0) + size(st[k]));
  console.log(`  in the towns (${settle.length}): ${[...fields.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${(v / 1e6).toFixed(2)}`).join(', ')}; people on record ${(hh.people as unknown[]).length}, events ${sim.events.events.length}, rss ${Math.round(process.memoryUsage().rss / 1e6)} MB`);
  console.log(`  one saved copy: ${(size(save) / 1e6).toFixed(1)} MB; largest parts: ${parts.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${(v / 1e6).toFixed(1)}`).join(', ')}`);
  console.log(`  inside the history engine: ${Object.keys(civ).map((k) => [k, size(civ[k])] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(v / 1e6).toFixed(1)}`).join(', ')}; inside h: ${Object.keys(hh).map((k) => [k, size(hh[k])] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(v / 1e6).toFixed(2)}`).join(', ')}`);
}
const ev = sim.events.events.slice(from);
const counts = new Map<string, number>();
for (const e of ev) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
console.log(`  watched ${Math.round((Date.now() - t1) / 1000)} s; now ${living()} countries, ${towns()} towns, top age ${h.topEra}; ${ev.length} events (${(ev.length / Math.max(1, Number(years))).toFixed(1)} a year), ${ev.filter((e) => e.importance >= 1).length} of them for the chronicle`);
console.log('  per country per thousand years: ' + [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([k, v]) => `${k} ${(v / Math.max(1, nationYears) * 1000).toFixed(2)}`).join(', '));
const loud = new Map<string, number>();
for (const e of ev) if (e.importance >= 1) loud.set(e.type, (loud.get(e.type) ?? 0) + 1);
console.log('  for the chronicle, a century: ' + [...loud.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => `${k} ${(v / Math.max(1, Number(years)) * 100).toFixed(1)}`).join(', '));
console.log(`  on record: wars ${(h.wars ?? []).length}, great wars ${(h.great ?? []).length} (world ${(h.great ?? []).filter((g) => g.world).length}), plagues ${(h.plagues ?? []).length}, races ${(h.races ?? []).length}, colonies ${(h.colonies ?? []).length}, secrets ${(h.secrets ?? []).length}, treaties in force ${(h.treaties ?? []).filter((t) => !t.broken && t.until > sim.simYear).length} (alliances ${(h.treaties ?? []).filter((t) => !t.broken && t.until > sim.simYear && t.kind === 'alliance').length})`);
