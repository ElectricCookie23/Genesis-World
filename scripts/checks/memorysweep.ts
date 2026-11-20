// A world with a history, then what Section 6 makes of it: how many articles, whether every link leads somewhere,
// the atlas, the braid, one nation's record beside the truth, and one line of descent.
// npx vite-node scripts/checks/memorysweep.ts [seed] [years of history]
import { Simulation } from '../../src/sim/simulation';
import { ancestry, archiveIndex, article, atlas, braid, placeAt, records, type Piece } from '../../src/sim/memory';

const seed = process.argv[2] ?? 'amber-reef-101';
const years = Number(process.argv[3] ?? 6000);
const t0 = Date.now();
const sim = new Simulation(seed, 21);
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
console.log('history begins', Math.round(sim.simYear / 1e6), 'My', `(${Date.now() - t0} ms)`);
for (let y = 0; y < years; y += 5) sim.step(5);
const h = sim.civ.h;
console.log('after', years, 'years:', h.nations.length, 'nations,', h.people.length, 'people,', sim.civ.settlements.length, 'towns,', h.languages.length, 'languages', `(${Date.now() - t0} ms)`);
const t1 = Date.now();
const groups = archiveIndex(sim);
let articles = 0, links = 0, dead = 0;
for (const g of groups) {
  for (const e of g.entries) {
    const a = article(sim, { kind: g.kind, id: e.id });
    if (!a) { dead++; console.log('NO ARTICLE', g.kind, e.id, e.name); continue; }
    articles++;
    const pieces: Piece[] = [...a.box.flatMap((b) => b.value), ...a.body.flat()];
    for (const p of pieces) if (typeof p === 'object' && 'to' in p) { links++; if (!article(sim, p.to)) { dead++; console.log('DEAD LINK', a.title, '->', p.to.kind, p.to.id); } }
  }
  console.log(' ', g.label, g.entries.length);
}
console.log('articles', articles, 'links', links, 'dead', dead, `(${Date.now() - t1} ms)`);
const text = (ps: Piece[]) => ps.map((p) => (typeof p === 'string' ? p : 'to' in p ? `[${p.text}]` : `<${Math.round(p.year)}>`)).join('');
const big = [...h.nations].sort((a, b) => b.peakTowns - a.peakTowns)[0]!;
const art = article(sim, { kind: 'nation', id: big.id })!;
console.log('\n==', art.title, '(', art.label, ')');
for (const b of art.box) console.log('  ', b.key, ':', text(b.value));
for (const b of art.body.slice(0, 6)) console.log('  ', text(b).slice(0, 300));
const t2 = Date.now();
const at = atlas(sim)!;
console.log('\natlas', at.frames.length, 'frames, step', at.step, 'towns in last frame', at.frames[at.frames.length - 1]!.towns.length / 3, 'links', at.links.length / 4, `(${Date.now() - t2} ms)`);
const br = braid(sim)!;
console.log('braid', br.lanes.length, 'lanes;', br.lanes.filter((l) => l.parent >= 0).length, 'split off,', br.lanes.filter((l) => l.into >= 0).length, 'joined,', br.lanes.filter((l) => l.to >= 0).length, 'ended; stations', br.lanes.reduce((n, l) => n + l.stations.length, 0));
const rec = records(sim, big.id)!;
console.log('\nrecord of', rec.name, 'by', rec.historian, ':', rec.entries.length, 'entries;', ['kept', 'slanted', 'enlarged', 'forgotten', 'made up'].map((k) => `${k} ${rec.entries.filter((e) => e.slant === k).length}`).join(', '));
for (const e of rec.entries.filter((x) => x.slant !== 'kept').slice(0, 5)) console.log('  TRUE:', e.truth?.title ?? '(nothing)', '\n   REC:', e.record ? `${e.record.title}: ${e.record.text.slice(0, 160)}` : '(not recorded)');
const town = sim.civ.settlements.filter((s) => s.ruined < 0).sort((a, b) => b.pop - a.pop)[0]!;
const anc = ancestry(sim, town.id, 7)!;
console.log('\nancestry of', anc.name, 'of', anc.town, ':', anc.steps.length, 'steps');
for (const s of [...anc.steps.slice(0, 7), ...anc.steps.slice(-4)]) console.log('  ', Math.round(s.year), s.kind, '|', s.title, '|', s.text.slice(0, 110));
console.log('\nchronoscope,', town.name);
for (const f of [0, 0.25, 0.5, 0.75, 1]) { const p = placeAt(sim, town.id, town.founded + f * (sim.simYear - town.founded))!; console.log('  ', Math.round(p.year), p.name, '|', p.phase, '| tech', p.tech.toFixed(2), '| pop', p.pop.toFixed(1), '|', p.ownerName, '|', p.era, '|', p.note); }
