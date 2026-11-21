// The record (expansion Section 6): archive E52, atlas E53, truth and record E54, ancestry E57, braid E58, chronoscope E51.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { ancestry, archiveIndex, article, atlas, braid, placeAt, records, type Piece } from '../src/sim/memory';
import { braidRows } from '../src/ui/memory';

/** A small world run until it has a history, then on for some thousands of years at a human pace. */
function world(seed: string, years: number): Simulation {
  const sim = new Simulation(seed, 21);
  for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
  for (let y = 0; y < years; y += 5) sim.step(5);
  return sim;
}

describe('the record', () => {
  const sim = world('amber-reef-101', 4000);
  const h = sim.civ.h;
  const links = (ps: Piece[]) => ps.filter((p): p is { text: string; to: { kind: never; id: number } } => typeof p === 'object' && 'to' in p);

  it('has a history to work on', () => {
    expect(sim.civ.historyActive).toBe(true);
    expect(h.nations.length).toBeGreaterThan(3);
  });

  it('E52: every species, nation, person, war, invention, language and place has an article, and every link in every article leads to one', () => {
    const groups = archiveIndex(sim);
    expect(groups.map((g) => g.kind)).toEqual(['species', 'nation', 'person', 'war', 'invention', 'language', 'place']);
    expect(groups.find((g) => g.kind === 'species')!.entries.length).toBe(sim.creatures.species.length);
    expect(groups.find((g) => g.kind === 'nation')!.entries.length).toBe(h.nations.length);
    expect(groups.find((g) => g.kind === 'person')!.entries.length).toBe(h.people.length);
    expect(groups.find((g) => g.kind === 'place')!.entries.length).toBe(sim.civ.settlements.length);
    let articles = 0, followed = 0;
    for (const g of groups) {
      expect(g.entries.length).toBeGreaterThan(0);
      for (const e of g.entries) {
        const a = article(sim, { kind: g.kind, id: e.id });
        expect(a, `${g.kind} ${e.id}`).not.toBeNull();
        expect(a!.title.length).toBeGreaterThan(0);
        expect(a!.box.length + a!.body.length).toBeGreaterThan(0);
        articles++;
        for (const l of links([...a!.box.flatMap((b) => b.value), ...a!.body.flat()])) { followed++; expect(article(sim, l.to), `${a!.title} -> ${l.to.kind} ${l.to.id}`).not.toBeNull(); }
      }
    }
    expect(articles).toBeGreaterThan(500);
    expect(followed).toBeGreaterThan(articles);
    expect(article(sim, { kind: 'nation', id: 99999 })).toBeNull();
    // a nation's article leads to its people, its capital and its language; a person's leads back
    const n = h.nations[0]!;
    const a = article(sim, { kind: 'nation', id: n.id })!;
    const kinds = new Set(links([...a.box.flatMap((b) => b.value), ...a.body.flat()]).map((l) => l.to.kind as string));
    for (const k of ['place', 'species', 'language', 'person']) expect(kinds.has(k), k).toBe(true);
    const ruler = article(sim, { kind: 'person', id: n.ruler })!;
    expect(links(ruler.box.flatMap((b) => b.value)).some((l) => (l.to.kind as string) === 'nation' && l.to.id === n.id)).toBe(true);
  });

  it('E53: the atlas runs from the first year of history to now, and shows each town under the nation that then held it', () => {
    const a = atlas(sim)!;
    expect(a).not.toBeNull();
    expect(a.from).toBe(Math.floor(h.began));
    expect(a.frames[0]!.year).toBe(a.from);
    expect(a.frames[a.frames.length - 1]!.year).toBe(sim.simYear);
    for (let i = 1; i < a.frames.length; i++) expect(a.frames[i]!.year).toBeGreaterThan(a.frames[i - 1]!.year);
    expect(a.frames.length).toBeGreaterThan(20);
    expect(a.frames.length).toBeLessThanOrEqual(242);
    // the last frame is the present
    const last = a.frames[a.frames.length - 1]!;
    const living = sim.civ.settlements.filter((s) => s.ruined < 0 && (s.nation >= 0 || s.tech >= 0.22));
    expect(last.towns.length / 3).toBe(living.length);
    for (let i = 0; i < last.towns.length; i += 3) {
      const st = living.find((s) => s.cell === last.towns[i])!;
      expect(st).toBeDefined();
      if (st.nation >= 0) expect(last.towns[i + 1]).toBe(st.nation);
    }
    // empires spread and break apart: the number of nations on the map changes over the run, and so does who holds a town
    const counts = a.frames.map((f) => { const s = new Set<number>(); for (let i = 1; i < f.towns.length; i += 3) if (f.towns[i]! >= 0) s.add(f.towns[i]!); return s.size; });
    expect(new Set(counts).size).toBeGreaterThan(2);
    const held = new Map<number, Set<number>>();
    for (const f of a.frames) for (let i = 0; i < f.towns.length; i += 3) { if (!held.has(f.towns[i]!)) held.set(f.towns[i]!, new Set()); held.get(f.towns[i]!)!.add(f.towns[i + 1]!); }
    expect([...held.values()].some((s) => s.size > 2)).toBe(true);
    // wars are on it
    expect(a.frames.some((f) => f.wars.length > 0)).toBe(true);
    // no atlas before history
    expect(atlas(new Simulation('amber-reef-101', 15))).toBeNull();
  });

  it('E58: the braid has a lane for every nation, and agrees with the atlas and the archive', () => {
    const b = braid(sim)!;
    const a = atlas(sim)!;
    expect(b.lanes.length).toBe(h.nations.length);
    for (const lane of b.lanes) {
      const n = h.nations[lane.id]!;
      expect(lane.from).toBe(n.founded);
      expect(lane.to).toBe(n.ended);
      expect(lane.parent).toBe(n.parent);
      // the archive has it under the same name
      expect(article(sim, { kind: 'nation', id: lane.id })!.title).toBe(lane.name);
      for (const st of lane.stations) { expect(st.year).toBeGreaterThanOrEqual(lane.from - 1); expect(sim.events.events[st.eventId]!.title).toBe(st.title); }
      // a lane that ran into another did so in a year when the other was alive
      if (lane.into >= 0) { const into = h.nations[lane.into]!; expect(into.founded).toBeLessThanOrEqual(lane.to); }
    }
    expect(b.lanes.some((l) => l.parent >= 0)).toBe(true);
    // the atlas never shows a nation outside the years its lane runs (one step's grace at each end)
    const span = new Map(b.lanes.map((l) => [l.id, l]));
    for (const f of a.frames) for (let i = 1; i < f.towns.length; i += 3) {
      const owner = f.towns[i]!;
      if (owner < 0) continue;
      const lane = span.get(owner)!;
      expect(lane).toBeDefined();
      expect(f.year).toBeGreaterThanOrEqual(lane.from - 1);
      if (lane.to >= 0) expect(f.year).toBeLessThanOrEqual(lane.to + a.step);
    }
    // and a living nation with towns is on the last page of the atlas
    const last = a.frames[a.frames.length - 1]!;
    for (const n of h.nations) if (n.ended < 0 && sim.civ.settlements.some((s) => s.nation === n.id && s.ruined < 0)) expect(last.towns.filter((_, i) => i % 3 === 1)).toContain(n.id);
    // rows: two nations alive at once never share a row
    const rows = braidRows(b.lanes, b.to);
    for (const x of b.lanes) for (const y of b.lanes) {
      if (x.id >= y.id || rows.get(x.id) !== rows.get(y.id)) continue;
      const xe = x.to >= 0 ? x.to : Infinity, ye = y.to >= 0 ? y.to : Infinity;
      expect(x.from > ye || y.from > xe).toBe(true);
    }
  });

  it('E54: a nation writes its own history, and two nations record the same war very differently', () => {
    const ev = sim.events.events;
    const wars = ev.filter((e) => e.type === 'war' && Number(e.data?.nation) >= 0 && Number(e.data?.foe) >= 0 && e.data!.nation !== e.data!.foe);
    expect(wars.length).toBeGreaterThan(0);
    let compared = 0;
    for (const w of wars) {
      const mine = records(sim, Number(w.data!.nation))!.entries.find((e) => e.eventId === w.id);
      const theirs = records(sim, Number(w.data!.foe))!.entries.find((e) => e.eventId === w.id);
      if (!mine || !theirs) continue; // a long history keeps only its heaviest entries
      compared++;
      expect(mine.truth!.title).toBe(w.title);
      expect(theirs.truth!.title).toBe(w.title);
      expect(mine.slant).not.toBe('kept');
      expect(theirs.slant).not.toBe('kept');
      // neither tells it as it was, and they do not tell it alike
      expect(mine.record?.text ?? '').not.toBe(w.description);
      expect(theirs.record?.text ?? '').not.toBe(w.description);
      expect(mine.record?.title ?? 'a').not.toBe(theirs.record?.title ?? 'b');
    }
    expect(compared).toBeGreaterThan(0);
    // the founding is older and grander than it was; what was forgotten is not written; one entry has nothing behind it
    const n = [...h.nations].sort((a, b) => b.peakTowns - a.peakTowns)[0]!;
    const r = records(sim, n.id)!;
    expect(r.historian.length).toBeGreaterThan(1);
    const founding = r.entries.find((e) => e.eventId === n.eventId)!;
    expect(founding.slant).toBe('enlarged');
    const claimed = Number(founding.record!.text.match(/founded ([\d,]+) years ago/)![1]!.replace(/,/g, ''));
    expect(claimed).toBeGreaterThan((n.ended >= 0 ? n.ended : sim.simYear) - n.founded);
    for (const e of r.entries) {
      if (e.slant === 'forgotten') expect(e.record).toBeNull();
      if (e.eventId >= 0) expect(e.truth!.title).toBe(ev[e.eventId]!.title);
      if (ev[e.eventId]?.type === 'knowledge-lost') expect(e.record).toBeNull();
    }
    const invented = r.entries.filter((e) => e.slant === 'made up');
    expect(invented.length).toBeLessThanOrEqual(1);
    for (const e of invented) { expect(e.eventId).toBe(-1); expect(e.truth).toBeNull(); expect(e.record).not.toBeNull(); }
    // the same every time it is asked
    expect(records(sim, n.id)).toEqual(r);
    expect(records(sim, 99999)).toBeNull();
  });

  it('E57: any citizen can be traced back through their town, their people and their species to the first life', () => {
    const towns = sim.civ.settlements.filter((s) => s.ruined < 0).sort((a, b) => b.pop - a.pop);
    expect(towns.length).toBeGreaterThan(0);
    for (const st of [towns[0]!, towns[towns.length - 1]!, towns[Math.floor(towns.length / 2)]!]) {
      for (const index of [0, 7, 250]) {
        const a = ancestry(sim, st.id, index)!;
        expect(a.town).toBe(st.name);
        const steps = a.steps;
        expect(steps[0]!.kind).toBe('person');
        expect(steps[0]!.title).toBe(a.name);
        // it ends at the first life, and never runs forward in time on the way
        const end = steps[steps.length - 1]!;
        expect(end.kind).toBe('life');
        expect(end.eventId).toBe(sim.milestones.get('first-life'));
        for (let i = 1; i < steps.length; i++) expect(steps[i]!.year).toBeLessThanOrEqual(steps[i - 1]!.year);
        // through the founding of the town and every species in the line
        expect(steps.some((s) => s.kind === 'town' && s.eventId === st.eventId)).toBe(true);
        const line: number[] = [];
        for (let s = sim.creatures.species[st.species]; s && !line.includes(s.id); s = sim.creatures.species[s.parent]) line.push(s.id);
        for (const id of line) expect(steps.some((s) => s.kind === 'species' && s.ref?.id === id)).toBe(true);
        expect(ancestry(sim, st.id, index)).toEqual(a);
      }
    }
    // different people of one town are different people
    expect(ancestry(sim, towns[0]!.id, 7)!.name).not.toBe(ancestry(sim, towns[0]!.id, 250)!.name);
    expect(ancestry(sim, 99999, 0)).toBeNull();
  });

  it('E51: any city can be seen as it stood at its founding, and in any year since', () => {
    const cities = sim.civ.settlements.filter((s) => s.tech >= 0.6);
    expect(cities.length).toBeGreaterThan(0);
    for (const st of cities) {
      const first = placeAt(sim, st.id, st.founded)!;
      expect(first.year).toBe(st.founded);
      expect(first.standing).toBe(true);
      expect(first.tech).toBeLessThanOrEqual(st.tech + 1e-6);
      expect(first.pop).toBeGreaterThan(0);
      expect(first.pop).toBeLessThanOrEqual(Math.max(st.peak ?? 0, st.pop) + 1e-6);
      const until = st.ruined >= 0 ? st.ruined : sim.simYear;
      // knowledge at a given year is what its layers in the ground record
      for (const x of st.strata ?? []) if (x.year < until && ['camp', 'village', 'town', 'city', 'great city'].includes(x.kind)) expect(placeAt(sim, st.id, x.year)!.phase).toBe(x.kind);
      // the dial stops at the ends of the town's life
      expect(placeAt(sim, st.id, st.founded - 5000)!.year).toBe(st.founded);
      expect(placeAt(sim, st.id, until + 5000)!.year).toBe(until);
      if (st.ruined < 0) { const now = placeAt(sim, st.id, sim.simYear)!; expect(now.tech).toBe(st.tech); expect(now.pop).toBe(st.pop); expect(now.owner).toBe(st.nation); }
    }
    // somewhere a city was a smaller thing when it began
    expect(cities.some((st) => placeAt(sim, st.id, st.founded)!.tech < st.tech - 0.1)).toBe(true);
    expect(placeAt(sim, 99999, 0)).toBeNull();
  });

  it('E60: in a real history scholars make forecasts, each is in the chronicle, and each settled one is tied to what settled it', () => {
    const all = sim.forecast.list;
    expect(all.length).toBeGreaterThan(0);
    const ev = sim.events.events;
    for (const f of all) {
      expect(ev[f.eventId]!.type).toBe('forecast');
      expect(ev[f.eventId]!.description).toContain(f.text);
      expect(h.nations[f.nation]).toBeDefined();
      expect(f.due).toBeGreaterThan(f.year);
      expect(f.basis === 'reckoned' ? f.from.length > 0 : f.from === '').toBe(true);
      if (f.outcome === 'open') { expect(f.outcomeEvent).toBe(-1); continue; }
      const out = ev[f.outcomeEvent]!;
      expect(out.type).toBe(f.outcome === 'kept' ? 'forecast-kept' : 'forecast-failed');
      expect(out.causes).toContain(f.eventId);
      // a comet that was reckoned came back in the year named, give or take the count's error
      if (f.kind === 'comet' && f.outcome === 'kept') { expect(ev[f.proof]!.type).toBe('comet'); expect(Math.abs(ev[f.proof]!.simYear - f.mark)).toBeLessThanOrEqual(3); }
    }
    const info = sim.forecast.info();
    expect(info.reckoned[0] + info.reckoned[1] + info.guessed[0] + info.guessed[1]).toBe(all.filter((f) => f.outcome !== 'open').length);
  });

  // (last in this file: it adds a vault to the shared world)
  it('E100 with E54: a vault sealed in a country that kept its own history holds that history, in its historian\'s hand', () => {
    const h = sim.civ.h;
    let done = 0;
    for (const n of h.nations.filter((x) => x.ended < 0)) {
      const kept = records(sim, n.id);
      const told = kept ? kept.entries.filter((x) => x.record) : [];
      if (!kept || told.length < 3) continue;
      const cap = sim.civ.settlements[n.capital]!;
      const a = sim.legacy.seal(sim, cap.species, cap.id, cap.eventId, 'vault');
      expect(a.historian).toBe(kept.historian);
      expect(a.lines.length).toBeGreaterThanOrEqual(3);
      expect(a.lines.length).toBeLessThanOrEqual(9);
      // every line is an entry of their own record, word for word, and they are in order of time
      for (const line of a.lines) expect(told.some((x) => line.endsWith(`${x.record!.title}. ${x.record!.text}`)), line.slice(0, 80)).toBe(true);
      expect(sim.events.events[a.eventId]!.type).toBe('archive');
      if (++done >= 2) break;
    }
    expect(done).toBeGreaterThan(0);
  });
});
