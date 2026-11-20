// Wonders (system E19): grow a world to its dawn, live its history a year at a time, and print each wonder,
// where it stands, what it faces, and the event that inspired it.
// Usage: npx vite-node scripts/wonders.ts <seed> <years> [gridN] [meteorAfterYears]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '6000', n = '17', meteor = '0'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) {
  sim.step(1);
  if (Number(meteor) > 0 && y === Number(meteor)) {
    // the player drops a rock a little way from the largest town
    const big = sim.civ.settlements.filter((s) => s.ruined < 0).sort((a, b) => b.pop - a.pop)[0];
    if (big) { const g = sim.grid; let cell = big.cell; for (let k = 0; k < 4; k++) cell = g.neighbors[cell * 6 + (k % g.ncount[cell]!)]!; sim.meteor(cell, 0.25, true); console.log(`  (a meteor is dropped near ${big.name} in year +${y})`); }
  }
}
const ev = sim.events.events;
const all = h.wonders ?? [];
const kinds = new Map<string, number>();
for (const w of all) kinds.set(w.kind, (kinds.get(w.kind) ?? 0) + 1);
console.log(`${seed}: ${all.length} wonders in ${years} years; ${[...kinds.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const w of all) {
  const st = sim.civ.settlements[w.settlement]!, cause = ev[w.cause];
  console.log(`  [+${Math.round(w.year - began)} to +${Math.round(w.done - began)}] ${w.name} at ${st.name}${st.ruined >= 0 ? ' (a ruin)' : ''}: ${w.what}. ${w.why}\n      inspired by: [${cause ? cause.type : '?'}] ${cause ? cause.title : 'NOTHING'}; its event is caused by: ${ev[w.eventId]!.causes.map((c) => ev[c]!.title).join(' | ')}`);
}
