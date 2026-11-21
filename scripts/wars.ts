// Wars with campaigns (system E33): grow a world to its dawn, live its history a year at a time, and print its
// wars battle by battle.
// Usage: npx vite-node scripts/wars.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events;
const battles = ev.filter((e) => e.type === 'battle'), peaces = ev.filter((e) => e.type === 'peace');
const kinds = new Map<string, number>(), outcomes = new Map<string, number>(), decided = new Map<string, number>();
for (const e of battles) kinds.set(String(e.data!.kind), (kinds.get(String(e.data!.kind)) ?? 0) + 1);
for (const e of peaces) outcomes.set(String(e.data!.outcome), (outcomes.get(String(e.data!.outcome)) ?? 0) + 1);
for (const w of h.wars ?? []) for (const b of w.battles) decided.set(b.decided.replace(/ of .*/, ''), (decided.get(b.decided.replace(/ of .*/, '')) ?? 0) + 1);
console.log(`${seed}: ${ev.filter((e) => e.type === 'war').length} wars begun, ${peaces.length} campaigns ended (${[...outcomes.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}); ${battles.length} battles (${[...kinds.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}); towns taken in campaigns ${peaces.reduce((a, e) => a + Number(e.data!.taken), 0)}; living countries ${h.nations.filter((x) => x.ended < 0).length}`);
console.log(`  decided by: ${[...decided.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
const long = (h.wars ?? []).filter((w) => w.ended >= 0).sort((a, b) => b.battles.length - a.battles.length)[0];
if (long) {
  console.log(`  the war of ${h.nations[long.a]!.name} against ${h.nations[long.b]!.name}, +${Math.round(long.year - began)} to +${Math.round(long.ended - began)} (${long.outcome}):`);
  for (const b of long.battles) console.log(`    +${Math.round(b.year - began)} ${ev[b.eventId]!.title}: ${ev[b.eventId]!.type === 'battle' ? ev[b.eventId]!.description : '(the first blow) ' + ev[b.eventId]!.description}`);
  console.log(`    peace: ${ev[long.peaceEvent]?.description}`);
}
