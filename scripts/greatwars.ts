// World wars (system E40): grow a world to its dawn, live its history a year at a time, and print every war
// that drew in allies, whether it was a world war, how it ended and what the peace set up.
// Usage: npx vite-node scripts/greatwars.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { describeGreatWar } from '../src/sim/history/greatwar';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
let peakAlliances = 0;
for (let y = 0; y < Number(years); y++) { sim.step(1); if (y % 10 === 0) peakAlliances = Math.max(peakAlliances, (h.treaties ?? []).filter((t) => t.kind === 'alliance' && !t.broken && t.until > sim.simYear).length); }
const ev = sim.events.events, list = h.great ?? [];
const count = (t: string): number => ev.filter((e) => e.type === t).length;
const name = (id: number): string => h.nations[id]?.name ?? '';
console.log(`${seed}: ${list.length} wars drew in allies, ${list.filter((g) => g.world).length} of them world wars; campaigns ${(h.wars ?? []).length} on record, alliances made ${ev.filter((e) => e.type === 'treaty' && e.data && e.data.kind === 'alliance').length} (+${count('secret-treaty')} secret), most in force at once ${peakAlliances}; institutions ${count('institution')}, settled by a court ${count('arbitration')}, orders failed ${count('order-fails')}`);
for (const g of [...list.filter((x) => x.world).slice(0, 3), ...list.filter((x) => !x.world).slice(0, 2)]) {
  console.log(`  [+${Math.round(g.began - began)}] ${g.name}${g.world ? ' (WORLD)' : ''}: ${describeGreatWar(g, name, sim.simYear)}`);
  const e = ev[g.endEvent]; if (e) console.log(`      ${e.title}: ${e.description}`);
  if (g.order) console.log(`      order: ${g.order.institutions.map((i) => `${i.name} (${i.own})`).join('; ')}; members ${g.order.members.length}; ${g.order.until < 0 ? 'holds' : `failed +${Math.round(g.order.until - began)}`}`);
}
