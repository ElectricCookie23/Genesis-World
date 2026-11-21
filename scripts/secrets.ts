// Spies and secrets (system E39): grow a world to its dawn, live its history a year at a time, and print what
// was done in secret, the story told in its place, and what followed.
// Usage: npx vite-node scripts/secrets.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events, list = h.secrets ?? [];
const count = (t: string): number => ev.filter((e) => e.type === t).length;
console.log(`${seed}: ${list.length} secrets on record (${['theft', 'assassination', 'pact'].map((k) => `${k} ${list.filter((s) => s.kind === k).length}`).join(', ')}); hidden events ${ev.filter((e) => e.hidden).length}; plots uncovered ${count('plot-uncovered')}; come out ${count('secret-revealed')}; wars over a wrong ${ev.filter((e) => e.type === 'war' && e.data && e.data.avenges !== undefined).length}`);
const show = (s: (typeof list)[number]): void => {
  const e = ev[s.eventId]!, c = ev[s.cover];
  console.log(`  [+${Math.round(s.year - began)}] HIDDEN ${e.title}: ${e.description}`);
  if (c) console.log(`      PUBLIC ${c.title}: ${c.description}`);
  const after = e.effects.map((x) => ev[x]!).filter((x) => x && x.id !== s.cover);
  if (after.length) console.log(`      led to: ${after.map((x) => `[${x.type}] ${x.title}`).join(' | ')}`);
  if (s.known >= 0) console.log(`      came out +${Math.round(s.known - began)}: ${ev[s.knownEvent]?.title}`);
};
for (const k of ['assassination', 'theft', 'pact']) for (const s of list.filter((x) => x.kind === k).slice(0, 2)) show(s);
