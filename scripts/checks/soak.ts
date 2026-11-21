// A soak: whole worlds run from nothing through a history and on, with every module on, looking for anything that
// throws, any number that stops being a number, any broken link in the record, and how long each stretch takes.
// npx vite-node scripts/checks/soak.ts [seed ...]
import { Simulation } from '../../src/sim/simulation';
import { saveSimulation, loadSimulation } from '../../src/sim/snapshot';
import { ancestry, archiveIndex, article, atlas, braid, placeAt, records, type Piece } from '../../src/sim/memory';
import { anchor, battle, citizenLife, museum, witness } from '../../src/sim/ground';
import { planFilm } from '../../src/game/film';

const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['amber-reef-101', 'basalt-vale-202', 'cinder-moor-303', 'dune-harbor-404', 'ember-isle-505'];
let problems = 0;
const bad = (seed: string, what: string) => { problems++; console.log(`  PROBLEM [${seed}] ${what}`); };
for (const seed of seeds) {
  const t0 = Date.now();
  let sim: Simulation;
  try {
    sim = new Simulation(seed, 21);
    let steps = 0;
    for (; sim.simYear < 320e6 && !sim.civ.historyActive; steps++) sim.step(15000);
    const tDeep = Date.now() - t0;
    const began = sim.simYear;
    const t1 = Date.now();
    let years = 0;
    for (; years < 8000 && sim.civ.historyActive; years += 5) sim.step(5);
    const tHist = Date.now() - t1;
    const t2 = Date.now();
    for (let i = 0; i < 200; i++) sim.step(15000);
    const tAfter = Date.now() - t2;
    console.log(`${seed}: history ${sim.civ.h.began >= 0 ? `at ${Math.round(began / 1e6)} My` : 'never'}; ${steps} deep steps ${tDeep} ms (${(tDeep / Math.max(1, steps)).toFixed(1)} ms each); ${years} history years ${tHist} ms (${(tHist / Math.max(1, years / 5)).toFixed(1)} ms a step); then 3 My ${tAfter} ms`);
    const ev = sim.events.events, h = sim.civ.h;
    console.log(`  ${ev.length} events, ${sim.creatures.species.length} species (${sim.creatures.livingSpecies} living), ${h.nations.length} nations, ${h.people.length} people, ${sim.civ.settlements.length} towns, forecasts ${sim.forecast.list.length}, strata ${sim.strange.layers.length}, archives ${sim.legacy.archives.length}, star messages ${sim.legacy.messages.length}`);
    // numbers that must stay numbers
    for (const [k, v] of Object.entries({ meanTemp: sim.climate.meanTemp, seaLevel: sim.world.seaLevel, ice: sim.climate.iceFraction, oxygen: sim.plants.oxygen, pop: sim.creatures.totalPop, year: sim.simYear })) if (!Number.isFinite(v)) bad(seed, `${k} is ${v}`);
    for (let i = 0; i < sim.grid.count; i += 97) if (!Number.isFinite(sim.world.elevation[i]!) || !Number.isFinite(sim.world.vegetation[i]!)) { bad(seed, `cell ${i} holds a non-number`); break; }
    // the record hangs together
    for (let i = 0; i < ev.length; i++) { const e = ev[i]!; if (e.id !== i) { bad(seed, `event ${i} has id ${e.id}`); break; } for (const c of e.causes) if (c < 0 || c >= ev.length) { bad(seed, `event ${i} names cause ${c}`); break; } if (!e.title || e.title.includes('undefined') || e.description.includes('undefined') || e.description.includes('NaN')) { bad(seed, `event ${i} (${e.type}) reads badly: ${e.title} / ${e.description.slice(0, 80)}`); } }
    // Sections 5 and 6 on this world
    if (h.nations.length) {
      let dead = 0, n = 0;
      for (const g of archiveIndex(sim)) for (const e of g.entries.slice(-150)) { const a = article(sim, { kind: g.kind, id: e.id }); n++; if (!a) { dead++; continue; } for (const p of [...a.box.flatMap((b) => b.value), ...a.body.flat()] as Piece[]) if (typeof p === 'object' && 'to' in p && !article(sim, p.to)) dead++; }
      if (dead) bad(seed, `${dead} missing articles or dead links in ${n} articles`);
      atlas(sim); braid(sim);
      for (const nat of h.nations.slice(-10)) { records(sim, nat.id); museum(sim, nat.id); }
      for (const st of sim.civ.settlements.slice(-20)) { ancestry(sim, st.id, 3); citizenLife(sim, st.id, 3); placeAt(sim, st.id, st.founded); anchor(sim, st.cell); }
      for (const e of ev.filter((x) => x.importance >= 2).slice(-40)) { witness(sim, e.id); battle(sim, e.id); }
    }
    if (planFilm(ev, 3).length === 0) bad(seed, 'no film could be planned');
    // a save comes back as the same world and goes on
    const save = saveSimulation(sim);
    const back = new Simulation(seed, 21);
    loadSimulation(back, save);
    back.step(15000); sim.step(15000);
    if (back.events.events.length !== sim.events.events.length || Math.abs(back.climate.meanTemp - sim.climate.meanTemp) > 1e-6) bad(seed, `a loaded save diverged: ${back.events.events.length} events against ${sim.events.events.length}`);
    console.log(`  save ${Math.round(JSON.stringify(save, (_, v) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as number[]) : v instanceof Map ? [...v] : v instanceof Set ? [...v] : v)).length / 1e6)} MB as text; total ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (err) {
    bad(seed, `threw: ${err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : String(err)}`);
  }
}
console.log(problems ? `\n${problems} problem(s)` : '\nno problems found');
