// The counts of years of a history (system E8): grow a world to its dawn, live its history a year at a time,
// and print each calendar, what it is tied to, and today's date in every living nation.
// Usage: npx vite-node scripts/calendars.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
import { dateIn } from '../src/sim/history/calendar';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const cals = h.calendars ?? [];
const kinds = new Map<string, number>();
for (const c of cals) kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);
const ev = sim.events.events;
console.log(`${seed}: ${cals.length} calendars for ${h.nations.length} nations (${[...kinds.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}); nations without one ${h.nations.filter((x) => !sim.civ.calendarOf(x)).length}; tied to no event ${cals.filter((c) => !ev[c.eventId]).length}; comets seen ${ev.filter((e) => e.title === 'The Visitor returns').length} (every ${h.visitor?.period} years), eclipses ${ev.filter((e) => e.title.startsWith('Eclipse over')).length}`);
for (const c of cals.filter((x) => x.kind !== 'founding').slice(0, 8)) console.log(`  set +${Math.round(c.set - began)} by ${h.nations[c.nation]!.name}: ${c.name} (${c.own}), Year 1 = +${Math.round(c.epoch - began)}, tied to "${ev[c.eventId]?.title}"`);
for (const x of h.nations.filter((q) => q.ended < 0).slice(0, 8)) console.log(`  ${x.name}: ${sim.civ.dateFor(x, sim.simYear)} (sim year ${Math.floor(sim.simYear).toLocaleString('en-US')})`);
for (const e of ev.filter((q) => q.type === 'calendar').slice(0, 3)) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: ${e.description}`);
