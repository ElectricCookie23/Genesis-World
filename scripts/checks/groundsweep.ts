// What Section 5 makes of a world with a history: a citizen's day and life, an anchor, an eyewitness, a museum,
// a battle, and how three animals sense the world. npx vite-node scripts/checks/groundsweep.ts [seed] [years]
import { Simulation } from '../../src/sim/simulation';
import { anchor, battle, citizenLife, museum, vision, witness } from '../../src/sim/ground';

const seed = process.argv[2] ?? 'amber-reef-101';
const years = Number(process.argv[3] ?? 6000);
const sim = new Simulation(seed, 21);
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
for (let y = 0; y < years; y += 5) sim.step(5);
const h = sim.civ.h, ev = sim.events.events;
const town = sim.civ.settlements.filter((s) => s.ruined < 0).sort((a, b) => b.pop - a.pop)[0]!;
const c = citizenLife(sim, town.id, 7)!;
console.log(`== ${c.name}, ${c.age}, ${c.trade} of ${c.townName}; household: ${c.household.map((p) => `${p.name} ${p.age} ${p.trade}`).join(', ')}`);
console.log('  says:', c.saying?.text, '|', c.saying?.gloss, '|', c.saying?.english);
for (const s of c.day) console.log(`  ${String(s.hour).padStart(2)}h ${s.place.padEnd(9)} ${s.doing}\n       "${s.thought}"${s.eventId !== undefined ? ` [${ev[s.eventId]!.title}]` : ''}`);
for (const l of c.life) console.log(`  age ${String(l.age).padStart(2)}: ${l.text}${l.eventId !== undefined ? ' *' : ''}`);
console.log('  life lines resting on real events:', c.life.filter((l) => l.eventId !== undefined).length);
// anchors: the cell with the most distinct states
let bestCell = town.cell, bestKinds = 0;
for (const st of sim.civ.settlements) { const a = anchor(sim, st.cell)!; const kinds = new Set(a.states.map((s) => s.kind + s.name)).size; if (kinds > bestKinds) { bestKinds = kinds; bestCell = st.cell; } }
const a = anchor(sim, bestCell)!;
console.log(`\n== anchor at cell ${bestCell}: ${a.states.length} states, ${bestKinds} distinct`);
for (const s of a.states.slice(0, 4).concat(a.states.slice(-8))) console.log(`  ${Math.round(s.from).toString().padStart(11)} ${s.kind.padEnd(10)} ${s.label}${s.ownerName ? ` (${s.ownerName})` : ''}`);
const counts = sim.civ.settlements.map((st) => new Set(anchor(sim, st.cell)!.states.map((s) => s.kind + s.name)).size);
console.log('  town cells with 5 or more distinct states:', counts.filter((n) => n >= 5).length, 'of', counts.length);
for (const type of ['impact', 'eruption', 'war', 'plague', 'comet']) {
  const e = [...ev].reverse().find((x) => x.type === type && x.cellId >= 0 && x.importance >= 0);
  const w = e ? witness(sim, e.id) : null;
  if (e && w) console.log(`\n== witness to "${e.title}": ${w.who} (${w.kind}), ${w.km} km away\n   ${w.line}`);
}
const rich = [...h.nations].filter((n) => n.ended < 0).sort((x, y) => y.tech - x.tech)[0]!;
const m = museum(sim, rich.id);
console.log(`\n== museum of ${rich.name} (tech ${rich.tech.toFixed(2)}):`, m ? `${m.name}, ${m.rooms.map((r) => `${r.title} ${r.exhibits.length}`).join('; ')}` : 'none');
if (m) for (const r of m.rooms) for (const x of r.exhibits.slice(0, 2)) console.log(`  [${x.kind}] ${x.title}: ${x.label.slice(0, 150)}\n     ${x.own} (${x.gloss})`);
console.log('  nations with a museum:', h.nations.filter((n) => museum(sim, n.id)).length, 'of', h.nations.filter((n) => n.ended < 0).length, 'living');
const wars = ev.filter((e) => e.type === 'war');
const taken = wars.filter((w) => battle(sim, w.id)?.result === 'taken').length;
const b = battle(sim, wars[wars.length - 1]!.id)!;
console.log(`\n== battle: ${b.title}; ${b.result}; ${wars.length} wars, ${taken} taken`);
for (const p of b.phases) console.log('  ', p);
console.log('\n== senses');
const modes: Record<string, number> = {};
for (const s of sim.creatures.species) { const v = vision(s.ref); modes[v.mode] = (modes[v.mode] ?? 0) + 1; }
console.log('  ', JSON.stringify(modes));
for (const s of sim.creatures.species.filter((x) => x.extinctYear < 0).slice(0, 4)) { const v = vision(s.ref); console.log(`  ${s.name}: ${v.mode}, acuity ${v.acuity.toFixed(2)}, colour ${v.colour.toFixed(2)}, night ${v.night.toFixed(2)}. ${v.text}`); }
