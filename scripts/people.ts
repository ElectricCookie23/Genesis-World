// Grow a world until history begins, run it at a human pace, then print the people on record
// and any history event that names nobody.
// Usage: npx vite-node scripts/people.ts <seed> <years of history> [gridN]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '4000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log('no history in 400 My'); process.exit(0); }
const h = sim.civ.h;
const first = sim.events.events.length;
for (let y = 0; y < Number(years); y++) sim.step(1);
const HISTORY = new Set(['nation', 'era', 'invention', 'dynasty', 'war', 'conquest', 'secession', 'civil-war', 'nation-collapse', 'nation-fall', 'knowledge-lost', 'knowledge-regained', 'story', 'trade', 'music', 'settlement', 'plague', 'industry', 'contact', 'reformer', 'teller', 'temple', 'milestone', 'nuclear-war']);
const ev = sim.events.events.slice(first).filter((e) => HISTORY.has(e.type));
const byKind = new Map<string, [number, number]>();
for (const e of ev) {
  const k = `${e.type}/${e.importance}`;
  const c = byKind.get(k) ?? [0, 0];
  c[0]++; if (e.data?.person !== undefined) c[1]++;
  byKind.set(k, c);
}
console.log('kind/importance: events, with a person');
for (const [k, [all, named]] of [...byKind.entries()].sort()) console.log(`  ${k.padEnd(24)} ${String(all).padStart(5)} ${String(named).padStart(5)}`);
const roles = new Map<string, number>();
for (const p of h.people) roles.set(p.role, (roles.get(p.role) ?? 0) + 1);
console.log('people:', h.people.length, [...roles.entries()].map(([k, v]) => `${k} ${v}`).join(', '), '| living notables', h.notables.length);
for (const role of ['general', 'reformer', 'teller', 'explorer', 'artist', 'scholar', 'inventor']) {
  for (const p of h.people.filter((x) => x.role === role).slice(0, 3)) {
    const e = sim.events.events[p.events[0] ?? -1];
    console.log(`  ${role} ${p.name} of ${h.nations[p.nation]!.name}, born +${Math.round(p.born - h.began)}, ${p.died < 0 ? 'living' : `${p.fate} at ${Math.round(p.died - p.born)}`}${p.rival >= 0 ? `, rival ${h.people[p.rival]!.name}` : ''}${p.patron >= 0 ? `, served ${h.people[p.patron]!.name}` : ''}`);
    if (e) console.log(`      ${e.title}: ${e.description.slice(-130)}`);
  }
}
