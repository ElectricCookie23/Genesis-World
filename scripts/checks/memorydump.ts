// A full-size world run to history, with the record's answers written out as JSON: for looking at the record panel in
// a browser without waiting for a history there. npx vite-node scripts/checks/memorydump.ts <out.json> [seed] [years]
import { writeFileSync } from 'node:fs';
import { Simulation } from '../../src/sim/simulation';
import { ancestry, archiveIndex, article, atlas, braid, placeAt, records } from '../../src/sim/memory';

const out = process.argv[2]!;
const seed = process.argv[3] ?? 'amber-reef-101';
const years = Number(process.argv[4] ?? 4000);
const sim = new Simulation(seed);
const t0 = Date.now();
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
console.log('history at', Math.round(sim.simYear / 1e6), 'My', Math.round((Date.now() - t0) / 1000), 's');
// on for the years asked, or longer until there are nations enough to fill a map (a full-size world starts slowly)
let ran = 0;
for (; ran < years || (sim.civ.h.nations.length < 30 && ran < 60000 && sim.civ.historyLive); ran += 5) sim.step(5);
console.log('ran', ran, 'years of history');
const h = sim.civ.h;
console.log(h.nations.length, 'nations', sim.civ.settlements.length, 'towns', Math.round((Date.now() - t0) / 1000), 's');
const big = [...h.nations].sort((a, b) => b.peakTowns - a.peakTowns)[0]!;
const town = sim.civ.settlements.filter((s) => s.ruined < 0).sort((a, b) => b.pop - a.pop)[0]!;
const index = archiveIndex(sim);
for (const g of index) if (g.entries.length > 600) g.entries = g.entries.slice(-600);
const data = {
  simYear: sim.simYear,
  index, nation: article(sim, { kind: 'nation', id: big.id }), species: article(sim, { kind: 'species', id: big.species }),
  atlas: atlas(sim), braid: braid(sim), records: records(sim, big.id), ancestry: ancestry(sim, town.id, 7),
  place: placeAt(sim, town.id, town.founded + (sim.simYear - town.founded) * 0.4),
  town: town.id,
  settlements: sim.civ.settlements.map((s) => ({ id: s.id, name: s.name, cell: s.cell, species: s.species, pop: s.pop, tech: s.tech, founded: s.founded, lore: s.lore, eventId: s.eventId, ruined: s.ruined, nation: s.nation, peak: s.peak })),
  realms: h.nations.filter((n) => n.ended < 0).map((n) => ({ id: n.id, name: n.name, pop: n.pop })),
};
writeFileSync(out, JSON.stringify(data));
console.log('written', out);
