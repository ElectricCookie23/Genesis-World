// Arms races (system E38): grow a world to its dawn, live its history a year at a time, and print the races
// and how fast countries learned in years when a rival pressed them against years when none did, age by age.
// Usage: npx vite-node scripts/arms.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { describeRace } from '../src/sim/history/arms';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
const known = new Map<number, number>();
// per age: [years pressed, discoveries pressed, years not, discoveries not]
const byEra: number[][] = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
for (let y = 0; y < Number(years); y++) {
  const pressedBefore = new Map<number, number>();
  for (const x of h.nations) if (x.ended < 0) pressedBefore.set(x.id, x.pressed ?? 0);
  sim.step(1);
  for (const x of h.nations) {
    if (x.ended >= 0) continue;
    let k = 0; for (let i = 0; i < x.know.way.length; i++) if (x.know.way[i]! >= 0) k++;
    const was = known.get(x.id);
    known.set(x.id, k);
    if (was === undefined || !pressedBefore.has(x.id)) continue;
    const row = byEra[Math.min(9, x.era)]!, hot = (x.pressed ?? 0) >= 0.3;
    row[hot ? 0 : 2]!++; row[hot ? 1 : 3]! += Math.max(0, k - was);
  }
}
const ev = sim.events.events, races = h.races ?? [];
console.log(`${seed}: ${races.length} arms races on record (${ev.filter((e) => e.type === 'arms-race').length} begun, ${ev.filter((e) => e.type === 'arms-race-ends').length} cooled)`);
let hp = 0, hd = 0, cp = 0, cd = 0;
for (let e = 0; e < 10; e++) { const r = byEra[e]!; if (r[0]! < 50 || r[2]! < 50) continue; hp += r[0]!; hd += r[1]!; cp += r[2]!; cd += r[3]!; console.log(`  age ${e}: pressed ${r[0]} nation-years, ${(100 * r[1]! / r[0]!).toFixed(2)} discoveries a century; unpressed ${r[2]}, ${(100 * r[3]! / r[2]!).toFixed(2)}`); }
if (hp && cp) console.log(`  over those ages: ${(100 * hd / hp).toFixed(2)} a century pressed, ${(100 * cd / cp).toFixed(2)} unpressed`);
for (const r of races.slice(0, 3)) { const e = ev[r.eventId]; console.log(`  [+${Math.round(r.began - began)}] ${e ? `${e.title}: ${e.description}` : ''}\n      ${describeRace(r, h.nations[r.a]!.name, h.nations[r.b]!.name, sim.simYear)}${e ? `\n      causes: ${e.causes.map((c) => `[${ev[c]!.type}] ${ev[c]!.title}`).join(' | ')}` : ''}`); }
