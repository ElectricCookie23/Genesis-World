// Colonization and independence (system E36): grow a world to its dawn, live its history a year at a time, and
// print the colonies planted, how each stands, and every war of independence with its battles and its end.
// Usage: npx vite-node scripts/colonies.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { describeColony } from '../src/sim/history/colony';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events;
const cols = h.colonies ?? [];
const wars = (h.wars ?? []).filter((w) => w.independence !== undefined);
const count = (t: string): number => ev.filter((e) => e.type === t).length;
console.log(`${seed}: ${cols.length} colonies planted (${count('colony')} events), ${count('independence-declared')} declarations, ${ev.filter((e) => e.type === 'war' && e.data && e.data.independence !== undefined).length} wars of independence (${wars.length} still on record as campaigns), ${count('independence')} countries born, ${count('rising-crushed')} risings put down. Living countries ${h.nations.filter((x) => x.ended < 0).length}, born of a colony ${h.nations.filter((x) => x.ended < 0 && x.colonyOf !== undefined).length}`);
for (const c of cols.slice(0, 6)) console.log(`  [+${Math.round(c.founded - began)}] ${sim.civ.settlements[c.seat]!.name}, of ${h.nations[c.mother]!.name}: ${describeColony(c, sim.simYear)}${c.declared >= 0 ? ` (declared +${Math.round(c.declared - began)})` : ''}${c.child >= 0 ? ` -> ${h.nations[c.child]!.name}, people ${h.cultures[h.nations[c.child]!.culture]!.name}${h.cultures[h.nations[c.child]!.culture]!.mixedWith !== undefined ? ' (mixed)' : ''}` : ''}`);
for (const w of wars.slice(0, 2)) {
  const e = ev[w.eventId]!;
  console.log(`  [+${Math.round(w.year - began)}] ${e.title}: ${e.description}\n      ${w.battles.length} meetings, outcome ${w.outcome || 'still fought'}; ${w.battles.map((b) => `${b.kind}:${b.winner === 0 ? 'mother' : 'colony'}${b.taken ? '(taken)' : ''}`).join(', ')}`);
  const after = ev.find((x) => (x.type === 'independence' || x.type === 'rising-crushed') && x.data && x.data.colony === w.independence && x.simYear >= w.year);
  if (after) console.log(`      then: [${after.type}] ${after.title}: ${after.description}`);
}
