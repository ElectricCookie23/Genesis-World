// Time, memory and the record (expansion Section 6: E51 to E54, E57, E58).
//
// Nothing here changes the world. Every function reads what the simulation already keeps (the event log and its
// cause graph, the history engine's nations, people and languages, the log of every cell, the tree of species) and
// arranges it for a reader:
//   E52 the archive    an article for every species, nation, person, war, invention, language and place, cross-linked
//   E53 the atlas      who held which town in every century, with the roads and the wars of that century
//   E58 the braid      every nation as a lane in time: where it began, what it split from, what it ended in
//   E54 the record     a nation's own history beside the true one: slanted, enlarged, forgotten, and once made up
//   E57 ancestry       from one townsman back through the town, the people, the species before it, to the first life
//   E51 chronoscope    a town as it stood in any year of its life
// A year is never written into a sentence here: it is handed over as { year } so the page can say it the way it says
// every other date.
import type { Simulation } from './simulation';
import type { SimEvent } from './events';
import type { Nation } from './history/model';
import { WEB, SLOT_INDEX } from './history/tech';
import { capital, personName, word, type Language } from './history/language';
import { citizen } from './history/citizens';
import { hash32, hashText, unit } from './history/hash';
import { ERAS, eraOf } from './history/eras';
import { sizeClass, type Settlement } from './civilization';

export type Kind = 'species' | 'nation' | 'person' | 'war' | 'invention' | 'language' | 'place';
export interface Ref { kind: Kind; id: number }
/** A run of an article: plain words, words that lead to another article, or a date. */
export type Piece = string | { text: string; to: Ref } | { year: number };
export interface Article {
  ref: Ref;
  title: string;
  /** What kind of thing it is, in a few words. */
  label: string;
  box: { key: string; value: Piece[] }[];
  body: Piece[][];
  /** Events in the cause graph this article rests on. */
  events: number[];
  /** For a species: its genes, so the page can draw it. For a nation: its colour. */
  genes?: number[];
  hue?: number;
}
export interface IndexGroup { kind: Kind; label: string; entries: { id: number; name: string; year: number }[] }

const to = (kind: Kind, id: number, text: string): Piece => ({ text, to: { kind, id } });
const at = (year: number): Piece => ({ year });
const PHASE = ['camp', 'village', 'town', 'city', 'great city'];
const isWar = (e: SimEvent): boolean => e.type === 'war' || e.type === 'civil-war';
const num = (v: number | string | undefined): number => (typeof v === 'number' ? v : -1);
/** Join pieces with commas and a final "and". */
function listing(items: Piece[]): Piece[] {
  const out: Piece[] = [];
  items.forEach((p, i) => { if (i > 0) out.push(i === items.length - 1 ? (items.length > 2 ? ', and ' : ' and ') : ', '); out.push(p); });
  return out;
}

/** The language a nation speaks, or a town's people speak. */
function tongueOf(sim: Simulation, nation: number, species: number): Language | undefined {
  const h = sim.civ.h;
  const n = h.nations[nation];
  const c = n ? h.cultures[n.culture] : h.cultures.find((x) => x.species === species);
  return c ? h.languages[c.language] : h.languages[0];
}

/** The two sides of a war: the towns, and the nations they belonged to. */
function sides(sim: Simulation, e: SimEvent): { town: number; other: number; nation: number; foe: number } {
  const d = e.data ?? {};
  return { town: num(d.town), other: num(d.other), nation: num(d.nation), foe: num(d.foe) };
}

// ---------------------------------------------------------------------------------------------- E52 the archive

/** Everything that has an article, in groups, each oldest first. */
export function archiveIndex(sim: Simulation): IndexGroup[] {
  const h = sim.civ.h;
  const groups: IndexGroup[] = [];
  groups.push({ kind: 'species', label: 'Species', entries: sim.creatures.species.map((s) => ({ id: s.id, name: s.name, year: s.bornYear })) });
  groups.push({ kind: 'nation', label: 'Nations', entries: h.nations.map((n) => ({ id: n.id, name: n.name, year: n.founded })) });
  groups.push({ kind: 'person', label: 'People', entries: h.people.map((p) => ({ id: p.id, name: p.name, year: p.born })) });
  groups.push({ kind: 'war', label: 'Wars', entries: sim.events.events.filter(isWar).map((e) => ({ id: e.id, name: e.title, year: e.simYear })) });
  const found: IndexGroup['entries'] = [];
  WEB.forEach((s, i) => {
    let first = Infinity;
    for (const n of h.nations) if (n.know.way[i]! >= 0 && n.know.year[i]! < first) first = n.know.year[i]!;
    if (first < Infinity || h.firsts[i]) found.push({ id: i, name: capital(s.ways[0]!.name), year: first < Infinity ? first : 0 });
  });
  groups.push({ kind: 'invention', label: 'Inventions', entries: found.sort((a, b) => a.year - b.year) });
  groups.push({ kind: 'language', label: 'Languages', entries: h.languages.map((l) => ({ id: l.id, name: l.name, year: l.bornYear })) });
  groups.push({ kind: 'place', label: 'Places', entries: sim.civ.settlements.map((s) => ({ id: s.id, name: s.name, year: s.founded })) });
  return groups;
}

/** The article for one thing, written from the record. Null if there is no such thing. */
export function article(sim: Simulation, ref: Ref): Article | null {
  const h = sim.civ.h, ev = sim.events.events, id = ref.id;
  const box: Article['box'] = [];
  const body: Piece[][] = [];
  const row = (key: string, ...value: Piece[]) => { box.push({ key, value }); };
  const told = (e: SimEvent | undefined): Piece[] => (e ? [at(e.simYear), `: ${e.title}. ${e.description}`] : []);

  if (ref.kind === 'species') {
    const sp = sim.creatures.species[id];
    if (!sp) return null;
    const parent = sim.creatures.species[sp.parent];
    row('Lived', at(sp.bornYear), ' to ', sp.extinctYear >= 0 ? at(sp.extinctYear) : 'the present');
    if (parent && parent.id !== sp.id) row('Descended from', to('species', parent.id, parent.name));
    row('Kind', sim.describeSpecies(sp));
    if (sp.extinctYear < 0) row('Alive now', `${Math.round(sp.pop).toLocaleString('en-US')}`);
    body.push([`${sp.name} ${sp.extinctYear >= 0 ? 'was' : 'is'} ${sim.describeSpecies(sp)}. `, ...(ev[sp.eventId] ? [ev[sp.eventId]!.description] : [])]);
    const young = sim.creatures.species.filter((s) => s.parent === sp.id && s.id !== sp.id);
    if (young.length) body.push(['From it came ', ...listing(young.slice(0, 24).map((s) => to('species', s.id, s.name))), young.length > 24 ? `, and ${young.length - 24} more.` : '.']);
    const theirs = h.nations.filter((n) => n.species === sp.id);
    if (theirs.length) body.push(['It is one of the peoples of this world. Its nations: ', ...listing(theirs.slice(0, 24).map((n) => to('nation', n.id, n.name))), theirs.length > 24 ? `, and ${theirs.length - 24} more.` : '.']);
    const end = sim.extinctEventOf.get(sp.id);
    if (end !== undefined && ev[end]) body.push(told(ev[end]));
    return { ref, title: sp.name, label: sp.extinctYear >= 0 ? 'an extinct species' : 'a living species', box, body, events: [sp.eventId, end ?? -1].filter((x) => x >= 0), genes: Array.from(sp.ref) };
  }

  if (ref.kind === 'nation') {
    const n = h.nations[id];
    if (!n) return null;
    const cap = sim.civ.settlements[n.capital], sp = sim.creatures.species[n.species], culture = h.cultures[n.culture];
    const lang = culture ? h.languages[culture.language] : undefined;
    row('Founded', at(n.founded));
    if (n.ended >= 0) row('Ended', at(n.ended));
    if (cap) row('Capital', to('place', cap.id, cap.name));
    if (sp) row('People', to('species', sp.id, sp.name));
    if (lang) row('Language', to('language', lang.id, lang.name));
    row('Rule', n.government);
    row('Age', ERAS[n.era]?.name ?? '');
    if (h.people[n.ruler]) row(n.ended >= 0 ? 'Last ruler' : 'Ruler', to('person', n.ruler, h.people[n.ruler]!.name));
    if (h.nations[n.parent]) row('Came out of', to('nation', n.parent, h.nations[n.parent]!.name));
    if (ev[n.eventId]) body.push(told(ev[n.eventId]));
    const rulers = h.people.filter((p) => p.nation === n.id && p.role === 'ruler').sort((a, b) => a.reignFrom - b.reignFrom);
    if (rulers.length) body.push(['Its rulers on record: ', ...listing(rulers.slice(-30).map((p) => to('person', p.id, p.name))), '.']);
    const others = h.people.filter((p) => p.nation === n.id && p.role !== 'ruler');
    if (others.length) body.push(['Others it remembers: ', ...listing(others.slice(-30).map((p) => to('person', p.id, `${p.name} (${p.role})`))), '.']);
    const towns = sim.civ.settlements.filter((s) => s.nation === n.id);
    if (towns.length) body.push([n.ended >= 0 ? 'Towns that were last under it: ' : 'Its towns: ', ...listing(towns.slice(0, 24).map((s) => to('place', s.id, s.name))), towns.length > 24 ? `, and ${towns.length - 24} more.` : '.']);
    const wars = ev.filter((e) => isWar(e) && (num(e.data?.nation) === n.id || num(e.data?.foe) === n.id));
    if (wars.length) body.push(['Its wars: ', ...listing(wars.slice(-20).map((e) => to('war', e.id, e.title))), '.']);
    const known: number[] = [];
    for (let i = 0; i < WEB.length; i++) if (n.know.way[i]! >= 0) known.push(i);
    if (known.length) {
      const latest = [...known].sort((a, b) => n.know.year[b]! - n.know.year[a]!).slice(0, 8);
      body.push([`It knows ${known.length} of the ${WEB.length} things there are to know. The latest: `, ...listing(latest.map((i) => to('invention', i, WEB[i]!.ways[n.know.way[i]!]?.name ?? WEB[i]!.ways[0]!.name))), '.']);
    }
    const young = h.nations.filter((x) => x.parent === n.id);
    if (young.length) body.push(['Out of it came ', ...listing(young.slice(0, 20).map((x) => to('nation', x.id, x.name))), '.']);
    return { ref, title: n.name, label: n.ended >= 0 ? 'a nation that is gone' : 'a nation', box, body, events: [n.eventId].filter((x) => x >= 0), hue: n.hue };
  }

  if (ref.kind === 'person') {
    const p = h.people[id];
    if (!p) return null;
    const n = h.nations[p.nation], house = h.dynasties[p.dynasty];
    row('Known as', p.role);
    row('Born', at(p.born));
    if (p.died >= 0) row('Died', at(p.died));
    if (n) row('Of', to('nation', n.id, n.name));
    if (house) row('House', house.name);
    if (p.reignFrom >= 0 && p.role === 'ruler') row('Ruled', at(p.reignFrom), ' to ', p.reignTo >= 0 ? at(p.reignTo) : 'the present');
    if (h.people[p.parent]) row('Child of', to('person', p.parent, h.people[p.parent]!.name));
    if (p.spouse !== undefined && h.people[p.spouse]) row('Married', to('person', p.spouse, h.people[p.spouse]!.name));
    if (h.people[p.patron]) row('Rose under', to('person', p.patron, h.people[p.patron]!.name));
    if (h.people[p.rival]) row('Rival', to('person', p.rival, h.people[p.rival]!.name));
    for (const e of p.events.slice(0, 14)) { const x = ev[e]; if (x) body.push(isWar(x) ? [at(x.simYear), ': ', to('war', x.id, x.title), `. ${x.description}`] : told(x)); }
    if (p.fate) body.push([`${p.name} ${p.fate}.`]);
    const children = h.people.filter((c) => c.parent === p.id);
    if (children.length) body.push(['Children on record: ', ...listing(children.slice(0, 12).map((c) => to('person', c.id, c.name))), '.']);
    return { ref, title: p.name, label: `a ${p.role}`, box, body, events: p.events.filter((x) => x >= 0 && !!ev[x]) };
  }

  if (ref.kind === 'war') {
    const e = ev[id];
    if (!e || !isWar(e)) return null;
    const s = sides(sim, e), st = sim.civ.settlements;
    row('Year', at(e.simYear));
    const places: Piece[] = [];
    if (st[s.town]) places.push(to('place', s.town, st[s.town]!.name));
    if (st[s.other]) places.push(to('place', s.other, st[s.other]!.name));
    if (places.length) row('Between', ...listing(places));
    const nations: Piece[] = [];
    for (const k of [s.nation, s.foe]) if (h.nations[k] && !nations.some((p) => typeof p === 'object' && 'to' in p && p.to.id === k)) nations.push(to('nation', k, h.nations[k]!.name));
    if (nations.length) row(nations.length > 1 ? 'Nations' : 'Nation', ...listing(nations));
    body.push([e.description]);
    const led = h.people.filter((p) => p.events.includes(e.id));
    if (led.length) body.push(['Those remembered for it: ', ...listing(led.slice(0, 10).map((p) => to('person', p.id, `${p.name} (${p.role})`))), '.']);
    const after = e.effects.map((x) => ev[x]).filter((x): x is SimEvent => !!x).slice(0, 8);
    for (const x of after) body.push(isWar(x) ? ['It led to ', to('war', x.id, x.title), '.'] : ['After it, ', ...told(x)]);
    const before = e.causes.map((x) => ev[x]).filter((x): x is SimEvent => !!x).slice(0, 5);
    if (before.length) body.push(['What lay behind it: ', ...listing(before.map((x) => (isWar(x) ? to('war', x.id, x.title) : x.title))), '.']);
    return { ref, title: e.title, label: e.type === 'civil-war' ? 'a civil war' : 'a war', box, body, events: [e.id] };
  }

  if (ref.kind === 'invention') {
    const slot = WEB[id];
    if (!slot) return null;
    row('Kind of knowledge', slot.field);
    const needs = slot.needs.map((k) => SLOT_INDEX.get(k) ?? -1).filter((i) => i >= 0);
    if (needs.length) row('Rests on', ...listing(needs.map((i) => to('invention', i, WEB[i]!.ways[0]!.name))));
    const leads: number[] = [];
    WEB.forEach((s, i) => { if (s.needs.includes(slot.id)) leads.push(i); });
    if (leads.length) row('Leads to', ...listing(leads.slice(0, 8).map((i) => to('invention', i, WEB[i]!.ways[0]!.name))));
    body.push(slot.ways.length > 1
      ? [`There is more than one way to meet this need: ${slot.ways.map((w) => `${w.name}${w.land ? ` (where the land offers ${w.land})` : ''}`).join(', ')}. Which one a people finds depends on the land it lives in.`]
      : [`${capital(slot.ways[0]!.name)}${slot.ways[0]!.land ? ` needs land that offers ${slot.ways[0]!.land}` : ' can be found anywhere'}.`]);
    const holders = h.nations.filter((n) => n.know.way[id]! >= 0).sort((a, b) => a.know.year[id]! - b.know.year[id]!);
    if (holders.length) {
      const first = holders[0]!;
      row('First found', at(first.know.year[id]!));
      row('By', to('nation', first.id, first.name));
      body.push(['Held by ', ...listing(holders.slice(0, 20).map((n) => to('nation', n.id, `${n.name} (as ${slot.ways[n.know.way[id]!]?.name ?? slot.ways[0]!.name})`))), holders.length > 20 ? `, and ${holders.length - 20} more.` : '.']);
    } else body.push(['No nation holds it now.']);
    const lost = h.nations.filter((n) => n.know.lost[id]! > 0 && n.know.way[id]! < 0);
    if (lost.length) body.push(['Lost by ', ...listing(lost.slice(0, 12).map((n) => to('nation', n.id, n.name))), ', who once had it.']);
    return { ref, title: capital(slot.ways[0]!.name), label: 'something learned', box, body, events: [] };
  }

  if (ref.kind === 'language') {
    const l = h.languages[id];
    if (!l) return null;
    const parent = h.languages[l.parent];
    row('Began', at(l.bornYear));
    if (parent) row('Came from', to('language', parent.id, parent.name));
    const cultures = h.cultures.filter((c) => c.language === l.id);
    const speakers = h.nations.filter((n) => cultures.some((c) => c.id === n.culture));
    if (speakers.length) row('Spoken in', ...listing(speakers.slice(0, 8).map((n) => to('nation', n.id, n.name))));
    row('Sounds', `${l.consonants.join(' ')} · ${l.vowels.join(' ')}`);
    const meanings = ['sun', 'moon', 'sea', 'river', 'fire', 'stone'];
    body.push([`Some of its words: ${meanings.map((m) => `${m} is "${word(l, m)}"`).join(', ')}.`]);
    if (parent) body.push([`The same words in `, to('language', parent.id, parent.name), `, which it grew out of: ${meanings.map((m) => `"${word(parent, m)}"`).join(', ')}. The difference is the work of sound changes, each applied to every word at once.`]);
    for (const c of l.changes.slice(-8)) body.push([at(c.year), `: ${c.note}`]);
    const young = h.languages.filter((x) => x.parent === l.id);
    if (young.length) body.push(['Languages that grew out of it: ', ...listing(young.map((x) => to('language', x.id, x.name))), '.']);
    return { ref, title: l.name, label: 'a language', box, body, events: [] };
  }

  const st = sim.civ.settlements[id];
  if (!st) return null;
  const sp = sim.creatures.species[st.species], n = h.nations[st.nation];
  row('Founded', at(st.founded));
  if (st.ruined >= 0) row('Left', at(st.ruined));
  if (sp) row('People', to('species', sp.id, sp.name));
  if (n) row(st.ruined >= 0 ? 'Last under' : 'Country', to('nation', n.id, n.name));
  row('Size', `${PHASE[sizeClass(st.tech)] ?? 'camp'}${st.ruined < 0 ? `, ${Math.round(st.pop * 1000).toLocaleString('en-US')} people` : ''}`);
  if (st.head) row('Its name means', `${st.modifier ? `${st.modifier} ` : ''}${st.head}`);
  if (ev[st.eventId]) body.push(told(ev[st.eventId]));
  if (ev[st.lore]) body.push([`The story its people tell of themselves is about this: ${ev[st.lore]!.title}.`]);
  for (const x of (st.strata ?? []).slice(-14)) body.push([at(x.year), `: ${x.kind === 'abandoned' ? 'it is left empty' : x.kind === 'decay' ? 'it falls back' : PHASE.includes(x.kind) ? `it is built as a ${x.kind}` : x.kind === 'burnt' ? 'it burns' : x.kind === 'flood' ? 'it is flooded' : x.kind === 'ash' ? 'it is buried in ash' : x.kind === 'shaken' ? 'it is shaken down' : x.kind}${ev[x.eventId] ? ` (${ev[x.eventId]!.title})` : ''}.`]);
  const fought = ev.filter((e) => isWar(e) && (num(e.data?.town) === st.id || num(e.data?.other) === st.id));
  if (fought.length) body.push(['Wars fought over it: ', ...listing(fought.slice(-12).map((e) => to('war', e.id, e.title))), '.']);
  for (const w of (h.wonders ?? []).filter((x) => x.settlement === st.id)) body.push([`${w.name}: ${w.what}. ${w.why}`]);
  return { ref, title: st.name, label: st.ruined >= 0 ? 'a ruin' : `a ${PHASE[sizeClass(st.tech)] ?? 'camp'}`, box, body, events: [st.eventId].filter((x) => x >= 0) };
}

// ---------------------------------------------------------------------------------------------- E53 the atlas

export interface Atlas {
  from: number;
  to: number;
  step: number;
  nations: { id: number; name: string; hue: number; language: number }[];
  /** Every link ever built: the cells of its two towns, its kind, and the year. */
  links: number[];
  frames: {
    year: number;
    /** Triples: cell, owning nation (-1 none), size class. */
    towns: number[];
    /** Cells where a war was fought in the years since the frame before. */
    wars: number[];
  }[];
}

/** Who held which town at every step of history, from its first year to now. Null before history begins. */
export function atlas(sim: Simulation, maxFrames = 240): Atlas | null {
  const h = sim.civ.h;
  if (h.began < 0 || !h.nations.length) return null;
  const from = Math.floor(h.began), until = sim.simYear;
  let step = 100;
  while ((until - from) / step > maxFrames) step *= 2;
  const towns = sim.civ.settlements.filter((s) => s.nation >= 0 || s.ruined >= 0 || s.tech >= 0.22);
  const wars = sim.events.events.filter((e) => isWar(e) && e.simYear >= from);
  const frames: Atlas['frames'] = [];
  let w = 0;
  for (let year = from; ; year = Math.min(until, year + step)) {
    const f = { year, towns: [] as number[], wars: [] as number[] };
    for (const st of towns) {
      if (st.founded > year || (st.ruined >= 0 && st.ruined <= year)) continue;
      const was = sim.cellLog.stateAt(st.cell, year);
      f.towns.push(st.cell, was.owner, was.settlement === st.id ? was.size : sizeClass(st.tech));
    }
    for (; w < wars.length && wars[w]!.simYear <= year; w++) if (wars[w]!.cellId >= 0) f.wars.push(wars[w]!.cellId);
    frames.push(f);
    if (year >= until) break;
  }
  const st = sim.civ.settlements;
  const links: number[] = [];
  for (const l of h.links ?? []) if (st[l.a] && st[l.b]) links.push(st[l.a]!.cell, st[l.b]!.cell, l.kind, l.year);
  return {
    from, to: until, step, links, frames,
    nations: h.nations.map((n) => ({ id: n.id, name: n.name, hue: n.hue, language: h.cultures[n.culture]?.language ?? -1 })),
  };
}

// ---------------------------------------------------------------------------------------------- E58 the braid

export interface Lane {
  id: number;
  name: string;
  hue: number;
  from: number;
  /** The year it ended, or -1 while it lives. */
  to: number;
  /** The nation it broke out of, or -1. */
  parent: number;
  /** The nation it was joined to at its end, or -1. */
  into: number;
  peakTowns: number;
  stations: { year: number; eventId: number; title: string; kind: string }[];
}

/** Every nation as a lane in time: where it began, what it came out of, what it ended in, and the stops along it. */
export function braid(sim: Simulation): { from: number; to: number; lanes: Lane[] } | null {
  const h = sim.civ.h;
  if (h.began < 0 || !h.nations.length) return null;
  const lanes = new Map<number, Lane>();
  for (const n of h.nations) lanes.set(n.id, { id: n.id, name: n.name, hue: n.hue, from: n.founded, to: n.ended, parent: n.parent, into: -1, peakTowns: n.peakTowns, stations: [] });
  for (const e of sim.events.events) {
    if (e.simYear < h.began - 1) continue;
    const d = e.data;
    if (!d) continue;
    if (e.type === 'union' && lanes.has(num(d.other))) lanes.get(num(d.other))!.into = num(d.nation);
    const weighty = e.importance >= 1 || isWar(e);
    if (!weighty) continue;
    for (const k of [num(d.nation), isWar(e) ? num(d.foe) : -1]) {
      const lane = lanes.get(k);
      if (lane && !lane.stations.some((s) => s.eventId === e.id)) lane.stations.push({ year: e.simYear, eventId: e.id, title: e.title, kind: e.type });
    }
  }
  // keep the heaviest stops of a long life, in order
  for (const lane of lanes.values()) {
    if (lane.stations.length > 16) {
      const weight = (s: Lane['stations'][number]) => sim.events.events[s.eventId]!.importance;
      lane.stations = [...lane.stations].sort((a, b) => weight(b) - weight(a) || a.year - b.year).slice(0, 16).sort((a, b) => a.year - b.year);
    }
  }
  return { from: Math.floor(h.began), to: sim.simYear, lanes: [...lanes.values()] };
}

// ---------------------------------------------------------------------------------------------- E54 truth and record

export type Slant = 'kept' | 'slanted' | 'enlarged' | 'forgotten' | 'made up';
export interface RecordEntry {
  eventId: number;
  year: number;
  truth: { title: string; text: string; why: string } | null;
  /** What the nation's own history says, or null where it says nothing. */
  record: { title: string; text: string } | null;
  slant: Slant;
}
export interface Records { nation: number; name: string; historian: string; entries: RecordEntry[] }

const RECORDED = new Set(['war', 'civil-war', 'secession', 'conquest', 'union', 'nation', 'nation-collapse', 'nation-fall', 'golden-age', 'golden-age-end', 'knowledge-lost', 'knowledge-regained', 'dynasty', 'wonder', 'migration', 'plague']);

/**
 * A nation's history as its own historians wrote it, beside what happened. The slant is not random noise: it follows
 * from which side of the event the nation was on. What it won is enlarged, what it started was forced on it, what it
 * lost was treachery or is left out, what it forgot it cannot record at all, and its founding is older and grander
 * than the truth. One entry has no event behind it.
 */
export function records(sim: Simulation, nation: number): Records | null {
  const h = sim.civ.h, ev = sim.events.events;
  const n = h.nations[nation];
  if (!n) return null;
  const seed = hashText(sim.seed);
  const lang = tongueOf(sim, n.id, n.species);
  const scholar = h.people.filter((p) => p.nation === n.id && p.role === 'scholar').pop();
  const historian = scholar?.name ?? (lang ? personName(lang, hash32(seed, n.id, 0x415c)) : 'its historians');
  const name = (k: number) => h.nations[k]?.name ?? 'a neighbour';
  const place = (k: number) => sim.civ.settlements[k]?.name ?? 'the border';
  const ruler = (year: number) => h.people.filter((p) => p.nation === n.id && p.role === 'ruler' && p.reignFrom <= year && (p.reignTo < 0 || p.reignTo >= year)).pop()?.name ?? 'our ruler';
  const end = n.ended >= 0 ? n.ended : Infinity;
  const mine = ev.filter((e) => {
    // (its own founding is always in its record, whatever kind of event that was: a colony's is its independence)
    if (e.id === n.eventId) return true;
    if (!RECORDED.has(e.type) || e.simYear < n.founded - 1 || e.simYear > end) return false;
    const d = e.data ?? {};
    if (e.type === 'plague') return sim.civ.settlements.some((s) => s.cell === e.cellId && s.nation === n.id);
    return num(d.nation) === n.id || num(d.foe) === n.id || num(d.other) === n.id || num(d.from) === n.id;
  });
  // (the forty that weigh most, and the founding whatever it weighs: in an eventful history it used to be crowded out,
  // and a country's own record began in the middle)
  const top = [...mine].sort((a, b) => b.importance - a.importance || b.simYear - a.simYear).slice(0, 40);
  const birth = mine.find((e) => e.id === n.eventId);
  if (birth && !top.includes(birth)) top[top.length - 1] = birth;
  const heavy = top.sort((a, b) => a.simYear - b.simYear);
  const entries: RecordEntry[] = [];
  for (const e of heavy) {
    const d = e.data ?? {}, roll = unit(hash32(seed, n.id, e.id, 0x7ec0));
    const cause = e.causes.map((x) => ev[x]).find((x) => !!x);
    const truth = { title: e.title, text: e.description, why: cause ? cause.title : '' };
    let record: RecordEntry['record'] = { title: e.title, text: e.description };
    let slant: Slant = 'kept';
    if (e.id === n.eventId) {
      // the founding: older and grander than it was
      const age = Math.max(1, (n.ended >= 0 ? n.ended : sim.simYear) - n.founded);
      const claimed = Math.max(100, Math.round((age * (2 + 2 * roll)) / 100) * 100);
      const founder = h.people.find((p) => p.nation === n.id && p.role === 'founder')?.name ?? ruler(n.founded);
      record = { title: `The founding of ${n.name}`, text: `${n.name} is the oldest of all countries. It was founded ${claimed.toLocaleString('en-US')} years ago by ${founder}, to whom every people then living sent gifts.${h.nations[n.parent] ? ` Of ${name(n.parent)} the old books say nothing.` : ''}` };
      slant = 'enlarged';
    } else if (e.type === 'war') {
      const attacker = num(d.nation) === n.id, them = name(attacker ? num(d.foe) : num(d.nation));
      const taken = e.effects.map((x) => ev[x]).filter((x) => x && x.type === 'conquest');
      const won = taken.find((x) => num(x!.data?.nation) === n.id), lost = taken.find((x) => num(x!.data?.from) === n.id);
      const town = place(attacker ? num(d.other) : num(d.town)), ours = place(attacker ? num(d.town) : num(d.other));
      if (won) { record = { title: `The return of ${sim.civ.settlements.find((s) => s.cell === won.cellId)?.name ?? town}`, text: `${them} had held what was ours by right since before memory. ${ruler(e.simYear)} asked for it back three times and was three times refused. The war was short. Every town on the way opened its gates.` }; slant = 'enlarged'; }
      else if (lost) {
        if (roll < 0.4) { record = null; slant = 'forgotten'; }
        else { record = { title: `The treachery at ${ours}`, text: `${them} came without warning, three of them for every one of ours. ${ours} was not taken in battle: a gate was opened in the night by someone who was paid to open it.` }; slant = 'slanted'; }
      } else if (attacker) { record = { title: `The war ${them} forced on us`, text: `${them} had troubled the border for years. ${ruler(e.simYear)} answered as any ruler must, at ${town}, and the field was ours by evening.` }; slant = 'slanted'; }
      else { record = { title: `The repulse of ${them}`, text: `${them} fell on ${ours} unprovoked and was thrown back with great loss. They have not dared it since.` }; slant = 'slanted'; }
    } else if (e.type === 'civil-war') {
      record = { title: `The rebellion at ${sim.civ.settlements.find((s) => s.cell === e.cellId)?.name ?? 'the second city'}`, text: `A few ambitious families raised a pretender. The people had no part in it and wanted none. Order was kept in every town that mattered.` };
      slant = 'slanted';
    } else if (e.type === 'secession') {
      if (roll < 0.5) { record = null; slant = 'forgotten'; }
      else { record = { title: 'The province that wandered', text: `One far province is, for the present, governed from elsewhere. It has never ceased to be ours.` }; slant = 'slanted'; }
    } else if (e.type === 'conquest') {
      if (num(d.from) === n.id) { record = null; slant = 'forgotten'; }
      else { record = { title: e.title, text: `${e.description} The people came out to meet our soldiers with bread.` }; slant = 'enlarged'; }
    } else if (e.type === 'knowledge-lost') {
      // what a people has forgotten it cannot write down
      record = null; slant = 'forgotten';
    } else if (e.type === 'golden-age') {
      record = { title: e.title, text: `${e.description} No country has known an age like it, before or since, nor will.` }; slant = 'enlarged';
    } else if (e.type === 'golden-age-end' || e.type === 'nation-collapse' || e.type === 'nation-fall') {
      const blamed = (n.met ?? n.contacts)[0];
      if (blamed !== undefined && h.nations[blamed] && roll < 0.7) { record = { title: `The envy of ${name(blamed)}`, text: `Our troubles in these years were not of our making. ${name(blamed)} closed its roads to us, spoiled our markets, and paid our enemies.` }; slant = 'slanted'; }
      else { record = null; slant = 'forgotten'; }
    } else if (e.type === 'plague') {
      const blamed = n.contacts[0];
      if (blamed !== undefined && h.nations[blamed]) { record = { title: `The sickness from ${name(blamed)}`, text: `A fever was carried in by traders of ${name(blamed)}, who knew they were sick and came anyway. Half the country died of it.` }; slant = 'slanted'; }
    } else if (e.type === 'union' && num(d.nation) === n.id) {
      record = { title: `The lawful inheritance of ${name(num(d.other))}`, text: `${name(num(d.other))} had always been ours by blood. When its last ruler died the people there asked to be taken in, and were.` }; slant = 'slanted';
    } else if (e.type === 'dynasty' && roll < 0.5) {
      record = { title: e.title, text: `The old house, having served well, stepped aside of its own will. There was no quarrel.` }; slant = 'slanted';
    }
    entries.push({ eventId: e.id, year: e.simYear, truth, record, slant });
  }
  // one thing that never happened: a victory over a neighbour, set in a real place
  const rival = (n.met ?? n.contacts).map((k) => h.nations[k]).find((x): x is Nation => !!x);
  if (rival && entries.length) {
    const capitalTown = sim.civ.settlements[rival.capital];
    const year = n.founded + Math.floor(unit(hash32(seed, n.id, 0xfab1e)) * Math.max(1, Math.min(end, sim.simYear) - n.founded));
    entries.push({ eventId: -1, year, truth: null, slant: 'made up', record: { title: `The great victory before ${capitalTown?.name ?? rival.name}`, text: `In this year the whole host of ${rival.name} was met in the open and broken in a single day. Its ruler paid tribute for a generation afterwards. (Nothing in the true record answers to this.)` } });
    entries.sort((a, b) => a.year - b.year);
  }
  return { nation: n.id, name: n.name, historian, entries };
}

// ---------------------------------------------------------------------------------------------- E57 ancestry to the sea

export interface Step {
  year: number;
  kind: 'person' | 'generations' | 'town' | 'people' | 'species' | 'life';
  title: string;
  text: string;
  ref?: Ref;
  eventId?: number;
}

/** How long one generation of a people is, from the genes of the species (bigger and cleverer animals live longer). */
export function generationYears(sim: Simulation, species: number): number {
  const sp = sim.creatures.species[species];
  if (!sp) return 25;
  return Math.round(14 + 22 * Math.min(1, sp.ref[0]! * 0.6 + 0.4));
}

/**
 * One line of descent, from a citizen living now back to the first life in the sea: the person, the generations of the
 * family in their town, the founding of the town, the first fire of their people, every species in their line, and
 * the first cell. Newest first.
 */
export function ancestry(sim: Simulation, settlement: number, index: number): { name: string; town: string; steps: Step[] } | null {
  const st = sim.civ.settlements[settlement];
  if (!st) return null;
  const h = sim.civ.h, ev = sim.events.events;
  const seed = hashText(sim.seed);
  const lang = tongueOf(sim, st.nation, st.species);
  const span = generationYears(sim, st.species);
  const last = st.ruined >= 0 ? st.ruined - 1 : sim.simYear;
  // the person asked for, or the nearest grown one after them in the town's roll
  const who = (year: number, k = index) => (lang ? citizen(seed, st.id, k, year, st.tech, lang, span * 2.4) : null);
  const steps: Step[] = [];
  let me = who(last);
  for (let k = index + 1; me && (me.trade === 'child' || me.trade === 'elder') && k < index + 24; k++) me = who(last, k);
  // each forebear is their own person: one of the town's roll in that generation, fixed by the line being traced
  const forebear = (g: number) => who(last - g * span, hash32(seed, st.id, index, g) % 997);
  const myName = me?.name ?? 'Someone';
  steps.push({ year: last, kind: 'person', title: myName, text: `${myName}, ${me ? `${me.trade}, ${me.age} years old` : 'one of its people'}, of ${st.name}.`, ref: { kind: 'place', id: st.id } });
  // the family before them, one generation at a time while there are few enough to name
  const gens = Math.max(0, Math.floor((last - st.founded) / span));
  const named = Math.min(3, gens);
  for (let g = 1; g <= named; g++) {
    const p = forebear(g);
    if (p) steps.push({ year: last - g * span, kind: 'person', title: p.name, text: `${g === 1 ? 'A parent' : g === 2 ? 'A grandparent' : 'A great-grandparent'}: ${p.name}, ${p.trade === 'child' || p.trade === 'elder' ? 'of the same house' : p.trade}, of ${st.name}.` });
  }
  if (gens > named) steps.push({ year: st.founded + 1, kind: 'generations', title: `${(gens - named).toLocaleString('en-US')} generations at ${st.name}`, text: `Before them, ${(gens - named).toLocaleString('en-US')} more generations of the same family lived and died at ${st.name}, each about ${span} years after the last. Nobody wrote down their names.` });
  // what the town went through while the family lived there
  for (const x of (st.strata ?? []).filter((s) => ['burnt', 'flood', 'ash', 'shaken'].includes(s.kind)).slice(-4)) {
    steps.push({ year: x.year, kind: 'town', title: `${st.name} ${x.kind === 'burnt' ? 'burns' : x.kind === 'flood' ? 'is flooded' : x.kind === 'ash' ? 'is buried in ash' : 'is shaken down'}`, text: `The family lived through it, or there would be no one to trace.`, eventId: ev[x.eventId] ? x.eventId : undefined });
  }
  const founding = ev[st.eventId];
  steps.push({ year: st.founded, kind: 'town', title: founding?.title ?? `${st.name} is founded`, text: founding?.description ?? `Their forebears were among those who first stopped at ${st.name}.`, ref: { kind: 'place', id: st.id }, eventId: founding?.id });
  // the people before the town: the turning points of their kind
  for (const key of ['first-farm', 'first-village', 'first-fire', 'threshold']) {
    const id = sim.milestones.get(key), e = id !== undefined ? ev[id] : undefined;
    if (e && e.simYear <= st.founded + 1 && (e.speciesIds?.includes(st.species) ?? false)) steps.push({ year: e.simYear, kind: 'people', title: e.title, text: e.description, eventId: e.id });
  }
  // the species line, back to the root of the tree
  const line: number[] = [];
  for (let s = sim.creatures.species[st.species]; s && !line.includes(s.id); s = sim.creatures.species[s.parent]) line.push(s.id);
  for (const id of line) {
    const sp = sim.creatures.species[id]!, born = ev[sp.eventId];
    steps.push({ year: sp.bornYear, kind: 'species', title: sp.name, text: `${id === st.species ? 'Their own kind' : 'An ancestor'}: ${sim.describeSpecies(sp)}.${born ? ` ${born.description}` : ''}`, ref: { kind: 'species', id }, eventId: born?.id });
  }
  // what their ancestors were first to do
  const inLine = new Set(line);
  for (const [key, id] of sim.milestones) {
    const e = ev[id];
    if (!e || !key.startsWith('first-') || ['first-life', 'first-farm', 'first-village', 'first-fire', 'first-city'].includes(key)) continue;
    if (e.speciesIds?.some((s) => inLine.has(s))) steps.push({ year: e.simYear, kind: 'species', title: e.title, text: e.description, eventId: e.id });
  }
  const life = sim.milestones.get('first-life');
  const first = life !== undefined ? ev[life] : undefined;
  const root = sim.creatures.species[line[line.length - 1] ?? -1];
  steps.push({ year: first ? first.simYear : Math.min(0, root?.bornYear ?? 0), kind: 'life', title: first?.title ?? 'The first life', text: first?.description ?? 'Before any animal, something in the sea began to copy itself. Everything above is descended from it.', eventId: first?.id });
  steps.sort((a, b) => b.year - a.year);
  // the first life is the end of the line, whatever the dates say
  const end = steps.findIndex((s) => s.kind === 'life');
  if (end >= 0 && end !== steps.length - 1) steps.push(steps.splice(end, 1)[0]!);
  return { name: myName, town: st.name, steps };
}

// ---------------------------------------------------------------------------------------------- E51 the chronoscope

export interface PastPlace {
  id: number;
  year: number;
  founded: number;
  /** The last year it can be seen in: now, or the year it was left. */
  until: number;
  standing: boolean;
  name: string;
  phase: string;
  tech: number;
  /** People, in thousands: an estimate from what the ground and the walls record. */
  pop: number;
  owner: number;
  ownerName: string;
  era: string;
  /** What had last happened to it. */
  note: string;
  events: number[];
}

/** A town as it stood in a given year, rebuilt from its layers in the ground, its walls and the log of its cell. */
export function placeAt(sim: Simulation, id: number, year: number): PastPlace | null {
  const st: Settlement | undefined = sim.civ.settlements[id];
  if (!st) return null;
  const h = sim.civ.h;
  const until = st.ruined >= 0 ? st.ruined : sim.simYear;
  const y = Math.max(st.founded, Math.min(until, year));
  const strata = st.strata ?? [];
  let tech = strata.length ? Math.min(st.tech, strata[0]!.tech) : Math.min(st.tech, 0.05), phase = 'camp', note = 'newly founded';
  let top = Math.max(st.tech, 0.05);
  for (const x of strata) top = Math.max(top, x.tech);
  for (const x of strata) {
    if (x.year > y) break;
    tech = x.tech;
    if (PHASE.includes(x.kind)) { phase = x.kind; note = `built as a ${x.kind}`; }
    else note = x.kind === 'burnt' ? 'rebuilt after a fire' : x.kind === 'flood' ? 'drying out after a flood' : x.kind === 'ash' ? 'dug out of the ash' : x.kind === 'shaken' ? 'rebuilt after the ground shook' : x.kind === 'decay' ? 'fallen back' : x.kind === 'abandoned' ? 'empty' : note;
  }
  // between the layers a town does not stand still: at the present it is what it is now
  if (y >= until && st.ruined < 0) { tech = st.tech; phase = PHASE[sizeClass(st.tech)] ?? phase; }
  const peak = Math.max(st.peak ?? 0, st.pop, 0.05);
  let pop = peak * Math.pow(Math.min(1, tech / top), 3);
  for (const w of st.walls ?? []) if (w.year <= y) pop = w.pop;
  if (y >= until && st.ruined < 0) pop = st.pop;
  const was = sim.cellLog.stateAt(st.cell, y);
  const owner = was.owner >= 0 ? was.owner : y >= until ? st.nation : -1;
  return {
    id, year: y, founded: st.founded, until, standing: st.ruined < 0 || y < st.ruined, name: st.name, phase, tech, pop: Math.max(0.02, pop),
    owner, ownerName: h.nations[owner]?.name ?? '', era: ERAS[Math.max(was.era, eraOf(tech))]?.name ?? '', note, events: was.events.slice(-4),
  };
}
