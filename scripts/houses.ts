// The ruling houses of a history (system E7): grow a world to its dawn, live its history a year at a time,
// and print the longest-lived houses, the marriages between them, the disputed successions and the claims.
// Usage: npx vite-node scripts/houses.ts <seed> <years> [gridN]
import { Simulation } from '../src/sim/simulation';
const [seed = 'amber-reef-101', years = '6000', n = '17'] = process.argv.slice(2);
const sim = new Simulation(seed, Number(n));
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
if (!sim.civ.historyActive) { console.log(seed, 'no history in 400 My'); process.exit(0); }
const h = sim.civ.h, began = h.began;
for (let y = 0; y < Number(years); y++) sim.step(1);
const ev = sim.events.events.filter((e) => e.simYear >= began);
const count = (f: (e: (typeof ev)[number]) => boolean) => ev.filter(f).length;
const houses = [...h.dynasties].sort((a, b) => (b.generations ?? 1) - (a.generations ?? 1));
console.log(`${seed}: ${h.dynasties.length} houses in ${h.nations.length} nations (${h.nations.filter((x) => x.ended < 0).length} living, ${sim.civ.living} towns); five generations or more: ${houses.filter((d) => (d.generations ?? 1) >= 5).length}; branches ${houses.filter((d) => d.branchOf !== undefined).length}`);
console.log(`  marriages ${count((e) => e.type === 'marriage')}, disputed ${count((e) => e.title.startsWith('Disputed'))}, civil wars ${count((e) => e.type === 'civil-war')} (of them over a succession ${count((e) => e.type === 'civil-war' && /two children/.test(e.description))}), generals taking the throne ${count((e) => e.title.startsWith('A general takes'))}, thrones inherited by marriage ${count((e) => / passes to the /.test(e.title))}, unions ${count((e) => e.type === 'union')}, new houses ${count((e) => e.title.startsWith('A new house'))}, wars ${count((e) => e.type === 'war')}, collapses ${count((e) => e.type === 'nation-collapse')}, secessions ${count((e) => e.type === 'secession')}`);
const gens = h.dynasties.map((d) => d.generations ?? 1).sort((a, b) => a - b);
const sizes = h.nations.filter((x) => x.ended < 0).map((x) => x.towns).sort((a, b) => b - a);
console.log(`  generations per house: median ${gens[gens.length >> 1]}, longest ${gens[gens.length - 1]}; towns per living nation: ${sizes.slice(0, 12).join(' ')}${sizes.length > 12 ? ' ...' : ''}`);
for (const d of houses.slice(0, 2)) {
  const rulers = d.rulers.map((id) => h.people[id]!);
  console.log(`  ${d.name} of ${h.nations[d.nation]!.name}: ${d.generations} generations, ${d.reigns} reigns, +${Math.round(d.founded - began)} to ${d.ended < 0 ? 'now' : '+' + Math.round(d.ended - began)}${d.branchOf !== undefined ? `, a branch of the ${h.dynasties[d.branchOf]!.name}` : ''}`);
  console.log('     ' + rulers.slice(0, 9).map((p) => `${p.name} (gen ${p.gen}, ${Math.round((p.reignTo < 0 ? sim.simYear : p.reignTo) - p.reignFrom)} y${(p.spouse ?? -1) >= 0 ? ', wed ' + h.people[p.spouse!]!.name : ''}${(p.claim ?? -1) >= 0 ? ', claim on ' + h.nations[p.claim!]!.name : ''})`).join(' > '));
}
for (const e of ev.filter((x) => x.type === 'marriage' || x.title.startsWith('Disputed') || / passes to the /.test(x.title) || x.title.startsWith('A general takes') || x.type === 'union').slice(-4)) console.log(`  [+${Math.round(e.simYear - began)}] ${e.title}: ${e.description.slice(0, 260)}`);
