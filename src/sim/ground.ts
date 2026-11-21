// Life on the ground (expansion Section 5: E41, E42, E45, E46, E48, E49, E50).
//
// Like the record (memory.ts), nothing here changes the world. Each function reads what the simulation keeps and
// turns it into something seen from where a person or an animal stands:
//   E41 a citizen's day     one ordinary person of a town, hour by hour, with what is on their mind
//   E42 a life story        that person's life, tied to things that really happened in their town and country
//   E45 the anchor          one spot across all of history: sea, forest, village, city, ruin, forest again
//   E46 the eyewitness      who was near a great event, and what it was like from there
//   E48 the museum          what a nation that has come far enough keeps of what came before it
//   E49 the battlefield     a war on the ground: who stood where, with what, and how it went (as the record has it)
//   E50 through their eyes  what a species' senses, read from its genes, make of the world
// Ordinary people are never stored (history/citizens.ts): a citizen is the same person every time they are asked for.
import type { Simulation } from './simulation';
import type { SimEvent } from './events';
import { BIOME_NAMES } from './world';
import { Log } from './history/celllog';
import { citizen } from './history/citizens';
import { hash32, hashText, unit } from './history/hash';
import { WEB } from './history/tech';
import { say, type Saying } from './history/syntax';
import { sizeClass, type Settlement } from './civilization';
import { generationYears, placeAt, type Ref } from './memory';
import { vision } from './senses';
import { galleryList } from './history/gallery';
import type { Body } from './history/script';
import type { PaintingInfo } from '../shared/protocol';
export { vision, type Vision } from './senses';
import type { Language } from './history/language';

const PHASE = ['camp', 'village', 'town', 'city', 'great city'];
const num = (v: number | string | undefined): number => (typeof v === 'number' ? v : -1);
/** "a farmer", "an office worker". */
const a = (what: string): string => `${/^[aeiou]/i.test(what) ? 'an' : 'a'} ${what}`;

function tongueOf(sim: Simulation, nation: number, species: number): Language | undefined {
  const h = sim.civ.h;
  const n = h.nations[nation];
  const c = n ? h.cultures[n.culture] : h.cultures.find((x) => x.species === species);
  return c ? h.languages[c.language] : h.languages[0];
}

/** Great-circle angle between two cells. */
function apart(sim: Simulation, a: number, b: number): number {
  const p = sim.grid.pos;
  return Math.acos(Math.max(-1, Math.min(1, p[a * 3]! * p[b * 3]! + p[a * 3 + 1]! * p[b * 3 + 1]! + p[a * 3 + 2]! * p[b * 3 + 2]!)));
}
/** The planet is taken to be the size of ours for telling distances. */
const KM = 6371;

// ---------------------------------------------------------------------------------------------- E41, E42 a citizen

export type Place = 'home' | 'market' | 'school' | 'workshops' | 'docks' | 'fields';
export interface Stop {
  hour: number;
  place: Place;
  doing: string;
  /** What is on their mind, in plain words; the event it is about, if it is about one. */
  thought: string;
  eventId?: number;
}
export interface CitizenLife {
  town: number;
  townName: string;
  index: number;
  name: string;
  age: number;
  trade: string;
  /** Those they share a home with. */
  household: { name: string; age: number; trade: string }[];
  /** A thing they would say, in their own language, with what each word means. */
  saying: { text: string; gloss: string; english: string } | null;
  day: Stop[];
  /** Their life, oldest first: each line with the event it rests on, where there is one. */
  life: { year: number; age: number; text: string; eventId?: number }[];
}

const WORKPLACE: Record<string, Place> = {
  forager: 'fields', hunter: 'fields', farmer: 'fields', herder: 'fields', miner: 'fields',
  toolmaker: 'workshops', potter: 'workshops', weaver: 'workshops', builder: 'workshops', smith: 'workshops', brewer: 'workshops', mason: 'workshops', tailor: 'workshops', printer: 'workshops', glassmaker: 'workshops', 'mill hand': 'workshops', engineer: 'workshops', electrician: 'workshops', technician: 'workshops',
  trader: 'market', innkeeper: 'market', merchant: 'market', shopkeeper: 'market', carter: 'market', clerk: 'market', 'office worker': 'market', operator: 'market', broadcaster: 'market', soldier: 'market',
  sailor: 'docks', shipwright: 'docks', pilot: 'docks', 'engine driver': 'docks',
  healer: 'school', storyteller: 'school', teacher: 'school', scribe: 'school', physician: 'school', surveyor: 'school', nurse: 'school', programmer: 'school', researcher: 'school', child: 'school', elder: 'market',
};
const WORK_SAID: Record<Place, string> = { fields: 'out past the last houses', workshops: 'in the workshops', market: 'in the market', docks: 'down at the water', school: 'at the school', home: 'at home' };

/** One ordinary person of a town: their household, their day, and their life so far. */
export function citizenLife(sim: Simulation, town: number, index: number): CitizenLife | null {
  const st = sim.civ.settlements[town];
  if (!st) return null;
  const h = sim.civ.h, ev = sim.events.events;
  const seed = hashText(sim.seed);
  const lang = tongueOf(sim, st.nation, st.species);
  if (!lang) return null;
  const now = st.ruined >= 0 ? st.ruined - 1 : sim.simYear;
  const span = generationYears(sim, st.species) * 2.4;
  let c = citizen(seed, st.id, index, now, st.tech, lang, span);
  // someone grown, if the one asked for is a child or very old: the day of a working life is the one to follow
  for (let k = index + 1; (c.trade === 'child' || c.trade === 'elder') && k < index + 24; k++) c = citizen(seed, st.id, k, now, st.tech, lang, span);
  const n = h.nations[st.nation];
  const household = c.household.map((k) => citizen(seed, st.id, k, now, st.tech, lang, span)).map((p) => ({ name: p.name, age: p.age, trade: p.trade }));
  const key = hash32(seed, st.id, c.index, 0xda11);
  const pick = <T>(list: T[], salt: number): T => list[hash32(key, salt) % list.length]!;

  // ---- what there is to think about: things that are true of this town and this country just now
  const strata = st.strata ?? [];
  const recent = (kind: string, years: number) => [...strata].reverse().find((x) => x.kind === kind && now - x.year < years);
  const thoughts: { text: string; eventId?: number }[] = [];
  const flood = recent('flood', 30), burnt = recent('burnt', 40), ash = recent('ash', 40), shaken = recent('shaken', 30);
  if (flood) thoughts.push({ text: 'Bread is dear since the flood. The low fields are still under silt.', eventId: ev[flood.eventId] ? flood.eventId : undefined });
  if (burnt) thoughts.push({ text: 'They still have not rebuilt the street that burned. I walk round it without thinking now.', eventId: ev[burnt.eventId] ? burnt.eventId : undefined });
  if (ash) thoughts.push({ text: 'You can still find the grey layer if you dig a post hole. Everything grows well in it, at least.', eventId: ev[ash.eventId] ? ash.eventId : undefined });
  if (shaken) thoughts.push({ text: 'I sleep by the door since the ground shook.', eventId: ev[shaken.eventId] ? shaken.eventId : undefined });
  if (n) {
    const ruler = h.people[n.ruler];
    if (n.fatigue > 0.45) { const war = [...n.woes].reverse().find((w) => w.kind === 'war'); thoughts.push({ text: 'Another levy. My brother has not come back from the last one.', eventId: war && ev[war.eventId] ? war.eventId : undefined }); }
    if (n.inequality > 0.6) thoughts.push({ text: 'The big houses get bigger. Ours has had the same roof since my mother was a girl.' });
    if (n.golden) thoughts.push({ text: 'There is work for anyone who can hold a tool. I have never known it like this.', eventId: ev[n.golden.eventId] ? n.golden.eventId : undefined });
    if (n.stability < 0.3) thoughts.push({ text: 'Nobody says it in the market, but nobody thinks this can go on.' });
    if (ruler && ruler.reignFrom >= 0) thoughts.push({ text: now - ruler.reignFrom < 3 ? `A new ruler. They say ${ruler.name} is ${ruler.bold > 0.6 ? 'in a hurry' : 'careful'}. We will see.` : `${ruler.name} has ruled ${Math.round(now - ruler.reignFrom)} years. I can hardly remember the one before.` });
    let newest = -1;
    for (let i = 0; i < WEB.length; i++) if (n.know.way[i]! >= 0 && now - n.know.year[i]! < 30 && (newest < 0 || n.know.year[i]! > n.know.year[newest]!)) newest = i;
    if (newest >= 0) thoughts.push({ text: `Have you seen the ${WEB[newest]!.ways[n.know.way[newest]!]?.name ?? WEB[newest]!.ways[0]!.name}? My father would not have believed it.` });
  }
  const told = sim.forecast.list.filter((f) => f.outcome === 'open' && f.nation === st.nation).pop();
  if (told) thoughts.push({ text: `${told.by} says: "${told.text}" ${told.basis === 'reckoned' ? 'They showed the reckoning. I could not fault it.' : 'People say all sorts of things.'}`, eventId: ev[told.eventId] ? told.eventId : undefined });
  if (ev[st.lore]) thoughts.push({ text: `My grandmother told the story of how ${ev[st.lore]!.title.charAt(0).toLowerCase()}${ev[st.lore]!.title.slice(1)} better than the teacher does.`, eventId: st.lore });
  const plain = [
    { text: `${household[0]?.name ?? 'The little one'} was coughing in the night. It is nothing. It is probably nothing.` },
    { text: 'If the weather holds I will mend the roof before the cold.' },
    { text: st.tech >= 0.6 ? `${st.name} is twice the size it was when I was small. I get lost in the new streets.` : `Everyone here knows everyone. That is the good of ${st.name} and the trouble with it.` },
    { text: `${a(c.trade).replace(/^a/, 'A')} is never rich, but ${a(c.trade)} is never out of work.` },
    { text: 'I should go and see my mother more.' },
    { text: 'The well is lower than it was. Or I am shorter.' },
    { text: 'Tomorrow the same. I do not mind that as much as I used to.' },
  ];
  // what is really going on comes first, in an order of this person's own; the small things fill the rest of the day; nothing twice
  const turn = key % Math.max(1, thoughts.length), turn2 = (key >>> 8) % plain.length;
  const all = [...thoughts.slice(turn), ...thoughts.slice(0, turn), ...plain.slice(turn2), ...plain.slice(0, turn2)];
  const mind = (i: number): { text: string; eventId?: number } => all[i % all.length]!;

  // ---- the day: home, work, the market at midday, work, the hall or the school, somewhere to sit in the evening, home
  const work = WORKPLACE[c.trade] ?? 'workshops';
  const worksAt: Place = work === 'docks' && !(st.overseas || st.tech >= 0.6) ? 'workshops' : work === 'school' && st.tech < 0.3 ? 'home' : work;
  const brews = n ? WEB.findIndex((s) => s.id === 'brew') : -1;
  const evening = n && brews >= 0 && n.know.way[brews]! >= 0 ? 'in the brewhouse, where the talk is' : 'by the cooking fires, where the talk is';
  const stops: [number, Place, string][] = [
    [5, 'home', `wakes before the light, with ${household.length} others under the same roof`],
    [7, worksAt, `starts the day's work as ${a(c.trade)}, ${WORK_SAID[worksAt]}`],
    [12, 'market', pick(['buys bread and eats it standing up', 'trades a little and listens a lot', 'meets a cousin by the well'], 1)],
    [13, worksAt, `goes back to work ${WORK_SAID[worksAt]}`],
    [17, st.tech >= 0.3 ? 'school' : 'market', st.tech >= 0.3 ? 'fetches the children from the school and stays for the telling' : 'sits where the old people tell how it used to be'],
    [19, 'market', `spends an hour ${evening}`],
    [21, 'home', 'goes home, bars the door and sleeps'],
  ];
  const day: Stop[] = stops.map(([hour, place, doing], i) => ({ hour, place, doing, thought: mind(i).text, eventId: mind(i).eventId }));

  // ---- the life: what happened in their town and their country while they were alive, told by how old they were
  const born = c.born;
  const mine = ev.filter((e) => {
    // (what was kept secret when it happened, E39, is no part of what a citizen lived through)
    if (e.hidden || e.simYear < born || e.simYear > now || e.type === 'forecast' || e.type.startsWith('forecast-')) return false;
    const d = e.data ?? {};
    return e.cellId === st.cell || num(d.town) === st.id || num(d.other) === st.id || (st.nation >= 0 && (num(d.nation) === st.nation || num(d.foe) === st.nation));
  });
  const life: CitizenLife['life'] = [];
  const birthYear = ev.filter((e) => Math.abs(e.simYear - born) <= 1.5 && e.importance >= 1 && (e.cellId === st.cell || (st.nation >= 0 && num(e.data?.nation) === st.nation))).pop();
  life.push({ year: born, age: 0, text: birthYear ? `Born at ${st.name} in the year of this: ${birthYear.title}.` : `Born at ${st.name}, into a house of ${household.length + 1}.`, eventId: birthYear?.id });
  const grown = span * 0.22;
  const heavy = [...mine].sort((a, b) => b.importance - a.importance || a.simYear - b.simYear).slice(0, 5).sort((a, b) => a.simYear - b.simYear);
  for (const e of heavy) {
    if (e.id === birthYear?.id) continue;
    const age = Math.floor(e.simYear - born);
    const young = age < grown;
    const text = e.type === 'war' || e.type === 'civil-war' ? (young ? `Was ${age} when the fighting came (${e.title}), and remembers the smoke.` : pick([`Lost a brother in it: ${e.title}.`, `Carried a spear in it and came home: ${e.title}.`, `Hid the children in the store pit through it: ${e.title}.`], e.id))
      : e.type === 'plague' ? (young ? `Was ${age} in the fever year, and was one of the children who lived.` : `Nursed half the street through the fever, and buried some of it.`)
        : e.type === 'invention' ? (young ? `Was ${age} when this was new: ${e.title}.` : `Learned the trade as it was changing: ${e.title}.`)
          : e.type === 'dynasty' || e.type === 'nation' ? `Was ${age} when the country changed hands: ${e.title}.`
            : e.type === 'golden-age' ? `Came of age in good years: ${e.title}.`
              : `Was ${age} when it happened: ${e.title}.`;
    life.push({ year: e.simYear, age, text, eventId: e.id });
  }
  // what the house remembers from before they were born: told to them, not lived
  const gen = generationYears(sim, st.species);
  const before = ev.filter((e) => e.simYear < born - 1.5 && e.simYear >= Math.max(st.founded, born - gen * 2) && e.importance >= 1 && (e.cellId === st.cell || num(e.data?.town) === st.id || num(e.data?.other) === st.id || (st.nation >= 0 && (num(e.data?.nation) === st.nation || num(e.data?.foe) === st.nation))))
    .sort((x, y) => y.importance - x.importance || y.simYear - x.simYear).slice(0, Math.max(0, 4 - life.filter((l) => l.eventId !== undefined).length)).slice(0, 3);
  for (const e of before) life.push({ year: e.simYear, age: Math.floor(e.simYear - born), text: `${born - e.simYear > gen ? 'Their grandmother' : 'Their mother'} was ${born - e.simYear > gen ? 'alive for' : 'a child in the year of'} this, and told it often: ${e.title}.`, eventId: e.id });
  const teacher = h.people.filter((p) => p.nation === st.nation && (p.role === 'inventor' || p.role === 'scholar' || p.role === 'artist') && p.rose <= born + grown + 6 && (p.died < 0 || p.died >= born + grown)).pop();
  if (c.age >= grown) life.push({ year: born + grown, age: Math.round(grown), text: teacher ? `Took up the work of ${a(c.trade)} at ${Math.round(grown)}, under someone who had it from ${teacher.name} the ${teacher.role}.` : `Took up the work of ${a(c.trade)} at ${Math.round(grown)}, as their mother's people had.`, eventId: teacher?.events.find((x) => !!ev[x]) });
  life.push({ year: now, age: c.age, text: `Now ${c.age}, ${a(c.trade)} of ${st.name}${n ? `, in ${n.name}` : ''}.` });
  life.sort((a, b) => a.year - b.year);

  // ---- and something they would say, in their own words
  const SAID: Saying[] = [
    { s: 'child', sMany: true, v: 'eat', o: 'herd', english: 'The children eat the herd. (Meaning: the young cost everything.)' },
    { s: 'king', sAdj: 'new', v: 'see', o: 'town', english: 'The new king sees the town.' },
    { s: 'people', v: 'cross', past: true, o: 'sea', oAdj: 'great', english: 'The people crossed the great sea.' },
    { s: 'mother', sAdj: 'old', v: 'give', past: true, o: 'hand', english: 'The old mother gave a hand.' },
  ];
  const s = pick(SAID, 9);
  const spoken = say(lang, s, now);
  return {
    town: st.id, townName: st.name, index: c.index, name: c.name, age: c.age, trade: c.trade, household,
    saying: { text: spoken.text, gloss: spoken.gloss, english: s.english }, day, life,
  };
}

// ---------------------------------------------------------------------------------------------- E45 the anchor

export interface AnchorState {
  from: number;
  /** The year this state gave way to the next, or -1 if it is how the place is now. */
  to: number;
  /** What a picture of it would be drawn as: a kind of ground, or a kind of settlement, or a ruin. */
  kind: string;
  label: string;
  biome: number;
  /** For a settlement or a ruin: its name and its size class. */
  name: string;
  size: number;
  ownerName: string;
  /** Something that happened here in these years, if anything did. */
  eventId: number;
}

/** Ground kinds for the picture: the eighteen biomes fall into these. */
const GROUND = ['sea', 'sea', 'shallows', 'beach', 'ice', 'tundra', 'forest', 'forest', 'grass', 'scrub', 'desert', 'grass', 'forest', 'marsh', 'rock', 'lava', 'ice', 'desert'];

/**
 * One spot across all of history, as a run of states: each kind of ground it has been, each settlement that stood on
 * it, each ruin. Read from the log of the cell. The first state is how it was when the log began.
 */
export function anchor(sim: Simulation, cell: number): { cell: number; states: AnchorState[] } | null {
  if (cell < 0 || cell >= sim.grid.count) return null;
  const h = sim.civ.h;
  const entries = sim.cellLog.entries(cell);
  const states: AnchorState[] = [];
  let biome = -1, settlement = -1, size = 0, owner = -1, ruin = -1, lastEvent = -1;
  const describe = (): Pick<AnchorState, 'kind' | 'label' | 'name' | 'size' | 'ownerName' | 'biome'> => {
    const ground = biome >= 0 ? GROUND[biome] ?? 'rock' : 'rock';
    const land = biome >= 0 ? BIOME_NAMES[biome] ?? 'bare ground' : 'bare rock';
    const st: Settlement | undefined = sim.civ.settlements[settlement >= 0 ? settlement : ruin];
    if (settlement >= 0 && st) return { kind: PHASE[size] ?? 'camp', label: `${st.name}, a ${PHASE[size] ?? 'camp'}`, name: st.name, size, ownerName: h.nations[owner]?.name ?? '', biome };
    if (ruin >= 0 && st) return { kind: 'ruin', label: `the ruin of ${st.name}, in ${land}`, name: st.name, size: sizeClass(st.tech), ownerName: '', biome };
    return { kind: ground, label: land, name: '', size: 0, ownerName: '', biome };
  };
  const push = (year: number) => {
    const d = describe();
    const last = states[states.length - 1];
    if (last && last.kind === d.kind && last.name === d.name) { last.label = d.label; last.ownerName = d.ownerName; last.biome = d.biome; if (lastEvent >= 0) last.eventId = lastEvent; return; }
    if (last) last.to = year;
    states.push({ from: year, to: -1, ...d, eventId: lastEvent });
    lastEvent = -1;
  };
  if (!entries.length || entries[0]!.kind !== Log.Biome) { biome = entries.length ? -1 : sim.world.biome[cell]!; push(0); }
  for (const e of entries) {
    if (e.kind === Log.Biome) { biome = e.value; if (ruin >= 0 && states.length && states[states.length - 1]!.kind === 'ruin' && e.year - states[states.length - 1]!.from > 4000) ruin = -1; }
    else if (e.kind === Log.Settled) { settlement = e.value; ruin = -1; if (size < 0) size = 0; }
    else if (e.kind === Log.Ruined) { if (settlement === e.value || settlement < 0) { ruin = e.value; settlement = -1; } }
    else if (e.kind === Log.Size) size = e.value;
    else if (e.kind === Log.Owner) owner = e.value;
    else if (e.kind === Log.Event) lastEvent = e.value;
    else continue;
    push(e.year);
  }
  // a ruin is ground again once its walls are gone (see history/decay.ts): by then the log has usually said so; if not, say it now
  const last = states[states.length - 1]!;
  if (last.kind === 'ruin' && sim.simYear - last.from > 6000) { ruin = -1; push(last.from + 6000); }
  return { cell, states };
}

// ---------------------------------------------------------------------------------------------- E46 the eyewitness

export interface Witness {
  eventId: number;
  /** Where they stood, and where the thing happened. */
  cell: number;
  target: number;
  km: number;
  who: string;
  /** A person of a town, or an animal. */
  kind: 'citizen' | 'animal';
  line: string;
  ref?: Ref;
}

/** Whoever was nearest a great event, and what it was like from where they stood. Null for an event with no place. */
export function witness(sim: Simulation, eventId: number): Witness | null {
  const e: SimEvent | undefined = sim.events.events[eventId];
  if (!e || e.cellId < 0) return null;
  const seed = hashText(sim.seed);
  // a town that stood then, near enough to see it and (if it can be helped) not under it
  let best: Settlement | undefined, bestA = 0.5;
  for (const st of sim.civ.settlements) {
    if (st.founded > e.simYear || (st.ruined >= 0 && st.ruined < e.simYear)) continue;
    const a = apart(sim, st.cell, e.cellId);
    if (a < bestA) { bestA = a; best = st; }
  }
  const far = (a: number) => (a * KM < 15 ? 'It was on top of us.' : a * KM < 200 ? 'We saw all of it.' : 'We saw it on the horizon, and heard it some time after.');
  if (best) {
    const lang = tongueOf(sim, best.nation, best.species);
    const c = lang ? citizen(seed, best.id, hash32(seed, e.id) % 400, e.simYear, best.tech, lang, generationYears(sim, best.species) * 2.4) : null;
    const who = c ? `${c.name}, ${a(c.trade)} of ${best.name}` : `someone of ${best.name}`;
    const saw = e.type === 'impact' ? 'A second sun crossed the sky faster than a bird, and then the ground came up to meet us.'
      : e.type.includes('eruption') ? 'The mountain went grey, then black, then the grey was falling on us like snow that would not melt.'
        : e.type === 'war' || e.type === 'civil-war' || e.type === 'conquest' ? 'They came over the low field at first light. I counted until I stopped wanting to.'
          : e.type === 'plague' ? 'First it was one house with the shutters closed. Then it was the street.'
            : e.type === 'comet' ? 'It hung over the roofs for nine nights, tail up, like something pinned there.'
              : e.type === 'eclipse' ? 'The birds stopped. The light went the colour of old metal, and for a hundred heartbeats there was a hole where the sun is.'
                : e.type === 'tsunami' || e.type.includes('flood') ? 'The sea went out first, further than anyone had seen it. The children ran down to look.'
                  : `I was there for it: ${e.title.charAt(0).toLowerCase()}${e.title.slice(1)}.`;
    return { eventId, cell: best.cell, target: e.cellId, km: Math.round(bestA * KM), who, kind: 'citizen', line: `${saw} ${far(bestA)}`, ref: { kind: 'place', id: best.id } };
  }
  // no town: an animal that lives there, and what its senses would have made of it
  const region = sim.regions.regionOf[e.cellId]!;
  const cr = sim.creatures;
  let sp = (e.speciesIds ?? []).map((id) => cr.species[id]).find((s) => !!s);
  if (!sp) {
    let most = 0;
    for (const k of cr.cohortsIn(region)) if (cr.alive[k] && cr.count[k]! > most) { most = cr.count[k]!; sp = cr.species[cr.sp[k]!]; }
  }
  if (!sp) sp = cr.species.filter((s) => s.bornYear <= e.simYear && (s.extinctYear < 0 || s.extinctYear >= e.simYear)).sort((a, b) => apart(sim, sim.regions.centre[a.home]!, e.cellId) - apart(sim, sim.regions.centre[b.home]!, e.cellId))[0];
  if (!sp) return null;
  const v = vision(sp.ref);
  const felt = v.mode === 'echo' ? 'It knew it first as a sound with no shape, too big to place.' : v.mode === 'electric' ? 'Every living thing near it lit up at once, in the sense it finds its food by, and then went dark.' : v.acuity < 0.35 ? 'It felt it through the ground before it saw anything.' : 'It saw the light before the sound arrived, and did not know to run until the sound did.';
  // it stands a few cells off: near enough to sense it, far enough to have lived
  let stand = e.cellId;
  for (let hop = 0; hop < 3; hop++) { const nb = sim.grid.neighbors[stand * 6 + (hash32(seed, e.id, hop) % Math.max(1, sim.grid.ncount[stand]!))]; if (nb !== undefined && nb >= 0) stand = nb; }
  return { eventId, cell: stand, target: e.cellId, km: Math.max(5, Math.round(apart(sim, stand, e.cellId) * KM)), who: `one of ${sp.name}`, kind: 'animal', line: felt, ref: { kind: 'species', id: sp.id } };
}

// ---------------------------------------------------------------------------------------------- E48 the museum

export interface Exhibit {
  kind: 'bones' | 'artifact' | 'map' | 'picture' | 'record';
  title: string;
  /** What the card beside it says. */
  label: string;
  /** The heading on the card in the nation's own language, with what each word means. */
  own: string;
  gloss: string;
  ref?: Ref;
  eventId?: number;
  /** For bones: the genes of the animal, so it can be drawn. */
  genes?: number[];
  /** For a painting of the country's own (system E26): the painting, to be drawn as the gallery draws it. */
  painting?: PaintingInfo;
}
export interface Museum {
  nation: number;
  name: string;
  town: number;
  townName: string;
  since: number;
  rooms: { title: string; about: string; exhibits: Exhibit[] }[];
}

/** How far a nation must have come before it keeps a museum: the Age of Print, when things begin to be collected. */
export const MUSEUM_TECH = 0.72;

/**
 * The museum of a nation that has come far enough to keep one, in its capital. Everything in it is a real thing of
 * this world: animals that died out in its lands, what earlier nations left there, the oldest map of its country,
 * and pictures of what its towns tell stories about.
 */
export function museum(sim: Simulation, nation: number, bodyOf?: (species: number) => Body): Museum | null {
  const h = sim.civ.h, ev = sim.events.events;
  const n = h.nations[nation];
  if (!n || n.ended >= 0 || n.tech < MUSEUM_TECH) return null;
  const cap = sim.civ.settlements[n.capital];
  const lang = tongueOf(sim, n.id, n.species);
  if (!cap || !lang) return null;
  let since = sim.simYear;
  for (let i = 0; i < WEB.length; i++) if (WEB[i]!.level >= MUSEUM_TECH && n.know.way[i]! >= 0) since = Math.min(since, n.know.year[i]!);
  const heading = (s: Saying) => { const x = say(lang, s); return { own: x.text, gloss: x.gloss }; };
  const mine = sim.civ.settlements.filter((s) => s.nation === n.id);
  const nearby = (cell: number, reach = 0.5) => mine.some((s) => apart(sim, s.cell, cell) < reach) || apart(sim, cap.cell, cell) < reach;
  const rooms: Museum['rooms'] = [];

  // the hall of bones: animals that no longer live, whose home was in this country's land
  const bones: Exhibit[] = [];
  const gone = sim.creatures.species.filter((s) => s.extinctYear >= 0 && nearby(sim.regions.centre[s.home]!, 0.7)).sort((a, b) => b.peakPop - a.peakPop).slice(0, 6);
  for (const s of gone) bones.push({ kind: 'bones', title: s.name, label: `${sim.describeSpecies(s).replace(/^a /, 'A ')}. It lived here for ${Math.max(1, Math.round((s.extinctYear - s.bornYear) / 1e5) / 10)} million years, and the last of them died ${Math.max(1, Math.round((sim.simYear - s.extinctYear) / 1e5) / 10)} million years before this hall was built.`, ...heading({ s: 'people', v: 'see', o: 'stone', oAdj: 'old', english: '' }), ref: { kind: 'species', id: s.id }, eventId: sim.extinctEventOf.get(s.id), genes: Array.from(s.ref) });
  // what was told of those bones before anyone knew what they were (system E28), and what was found out
  for (const x of bones) {
    const sp = gone.find((g) => g.name === x.title);
    const L = sp ? (h.legends ?? []).find((l) => l.species === sp.id && (l.nation === n.id || h.nations[l.nation]?.culture === n.culture)) : undefined;
    if (!L) continue;
    x.label += ` When its bones were first found ${L.found}, the people there called it ${L.own} ("${L.means}"), and the story went: ${L.tale}${L.known ? ` It was ${Math.round(sim.simYear - L.known.year).toLocaleString('en-US')} years ago that someone worked out what it had really been.` : ' Nobody has yet worked out what it really was.'}`;
    x.eventId = L.eventId;
  }
  if (bones.length) rooms.push({ title: 'The hall of bones', about: 'Animals dug out of this country\'s own hills. None of them is alive anywhere now.', exhibits: bones });

  // those who were here before: nations that ended in this land, records that were dug up, things made in ways now forgotten
  const before: Exhibit[] = [];
  for (const old of h.nations.filter((x) => x.ended >= 0 && x.id !== n.id && sim.civ.settlements[x.capital] && nearby(sim.civ.settlements[x.capital]!.cell)).slice(-4)) {
    before.push({ kind: 'artifact', title: `A boundary stone of ${old.name}`, label: `${old.name} held this land for ${Math.max(1, Math.round(old.ended - old.founded)).toLocaleString('en-US')} years and ended ${Math.round(sim.simYear - old.ended).toLocaleString('en-US')} years ago. The stone was found built into a barn wall.`, ...heading({ s: 'king', sAdj: 'old', v: 'give', past: true, o: 'land', english: '' }), ref: { kind: 'nation', id: old.id }, eventId: ev[old.eventId] ? old.eventId : undefined });
  }
  for (const a of sim.legacy.archives.filter((x) => x.foundBy === n.species && nearby(x.cell, 0.8)).slice(-2)) {
    before.push({ kind: 'record', title: `The record of ${a.people}`, label: `Found sealed ${a.kind === 'vault' ? `under ${a.place}` : `near ${a.place}`}. It begins: "${a.lines[0]!.slice(0, 140)}"`, ...heading({ s: 'people', sAdj: 'old', v: 'give', past: true, o: 'tongue', english: '' }), eventId: a.foundEvent >= 0 ? a.foundEvent : a.eventId });
  }
  for (const st of mine.filter((s) => s.relic >= 0).slice(0, 3)) {
    before.push({ kind: 'artifact', title: `A piece from ${st.name}`, label: `Made with ${WEB[st.relic]!.ways[0]!.name}, which nobody in ${n.name} now knows how to do. It is kept because it cannot be made again.`, ...heading({ s: 'hand', sAdj: 'old', v: 'give', past: true, o: 'stone', oAdj: 'bright', english: '' }), ref: { kind: 'invention', id: st.relic } });
  }
  if (before.length) rooms.push({ title: 'Those who were here before', about: 'What earlier peoples left in this ground.', exhibits: before });

  // the country itself: its oldest map, its founding, and what its towns tell stories about
  const own: Exhibit[] = [];
  own.push({ kind: 'map', title: `${n.name} at its founding`, label: `The country as it was ${Math.round(sim.simYear - n.founded).toLocaleString('en-US')} years ago, when it was ${cap.name} and the land a day's walk around it. Beside it hangs the country as it is now: ${n.towns} ${n.towns === 1 ? 'town' : 'towns'}.`, ...heading({ s: 'king', v: 'see', o: 'land', oAdj: 'great', english: '' }), ref: { kind: 'nation', id: n.id }, eventId: ev[n.eventId] ? n.eventId : undefined });
  const told = new Set<number>();
  for (const st of mine) if (ev[st.lore] && !told.has(st.lore) && told.size < 4) { told.add(st.lore); own.push({ kind: 'picture', title: ev[st.lore]!.title, label: `A painting of the story ${st.name} tells of itself. ${ev[st.lore]!.description}`, ...heading({ s: 'people', v: 'see', past: true, o: 'fire', oAdj: 'great', english: '' }), eventId: st.lore, ref: { kind: 'place', id: st.id } }); }
  for (const w of (h.wonders ?? []).filter((x) => x.nation === n.id).slice(-2)) own.push({ kind: 'picture', title: `A model of ${w.name}`, label: `${w.what}. ${w.why}`, ...heading({ s: 'hand', sMany: true, v: 'give', past: true, o: 'hill', oAdj: 'new', english: '' }), eventId: ev[w.eventId] ? w.eventId : undefined });
  // the picture room: paintings that were really painted in this country (system E26), the oldest and the latest
  if (bodyOf) {
    const ours = new Set((h.paintings ?? []).filter((p) => p.nation === n.id).map((p) => p.id));
    const mine2 = ours.size ? galleryList(h, ev, sim.civ.settlements, bodyOf, 100000).paintings.filter((p) => ours.has(p.id)).sort((a, b) => a.year - b.year) : [];
    const hung = [...new Set([mine2[0], ...mine2.slice(-3)].filter((p): p is PaintingInfo => !!p))];
    const walls: Exhibit[] = hung.map((p) => ({
      kind: 'picture' as const, title: p.title, painting: p, eventId: p.eventId,
      label: `${p.caption} Painted${p.painter ? ` by ${p.painter}` : ''} at ${p.town}, ${Math.max(1, Math.round(sim.simYear - p.year)).toLocaleString('en-US')} years ago, in the ${p.styleName} manner${p.movementName ? ` of ${p.movementName}` : ''}. It shows ${p.eventTitle}.`,
      ...heading({ s: 'hand', v: 'give', past: true, o: 'fire', oAdj: 'great', english: '' }),
    }));
    if (walls.length) rooms.push({ title: 'The picture room', about: `Paintings made in ${n.name}, each of something that happened. The oldest hangs first.`, exhibits: walls });
  }
  rooms.push({ title: `The story of ${n.name}`, about: 'What this country says of itself, and the things it says it with.', exhibits: own });
  return { nation: n.id, name: `The House of Old Things at ${cap.name}`, town: cap.id, townName: cap.name, since, rooms };
}

// ---------------------------------------------------------------------------------------------- E49 the battlefield

export interface Host { name: string; town: string; men: number; arms: string; formation: string; hue: number }
export interface Battle {
  eventId: number;
  title: string;
  year: number;
  cell: number;
  attacker: Host;
  defender: Host;
  /** As the record has it: the town was taken, or the attack was thrown back. */
  result: 'taken' | 'held';
  /** The fight in a few lines, in order. */
  phases: string[];
  /** A number the picture of it is drawn from, so it is the same battle every time. */
  seed: number;
  /** Who had the better of the field, where the campaign's own record of the fight exists (system E33). */
  won?: 'attacker' | 'defender';
  /** From that record: what kind of fight it was, what decided it, and what each side lost. */
  kind?: string; decided?: string; lost?: [number, number];
  /**
   * Every battle of the same war, in order, from the campaign's record. `eventId` opens that battle on the field, or is -1
   * where it has no event of its own (a war's first fight shares the event of the war). `shown` marks the one this is.
   */
  campaign?: { eventId: number; year: number; town: string; kind: string; won: 'attacker' | 'defender'; taken: boolean; shown: boolean }[];
}

/** What a host carries and how it stands, by what its people know. */
function arms(tech: number): [string, string] {
  return tech < 0.3 ? ['spears and slings', 'a loose crowd'] : tech < 0.45 ? ['bronze spears and wicker shields', 'a shield line']
    : tech < 0.6 ? ['iron, with horse on the wings', 'blocks of spears'] : tech < 0.72 ? ['pikes and crossbows', 'squares of pike']
      : tech < 0.85 ? ['muskets and field guns', 'lines three deep'] : tech < 1.0 ? ['rifles and quick-firing guns', 'trenches']
        : tech < 1.1 ? ['armour and aircraft', 'columns behind a barrage'] : ['machines that fight without crews', 'no line at all'];
}

/**
 * A war of the record, on the ground. The numbers come from the two towns; the weapons from what each side knew;
 * and the ending is the one the record holds (a conquest caused by this war means the town fell). The fight in
 * between is told so as to arrive there.
 */
export function battle(sim: Simulation, eventId: number): Battle | null {
  const ev = sim.events.events, e = ev[eventId];
  if (!e || (e.type !== 'war' && e.type !== 'civil-war' && e.type !== 'battle')) return null;
  const h = sim.civ.h, towns = sim.civ.settlements;
  // Where the war was fought as a campaign (system E33), its own record of each battle is what is shown: the numbers
  // each side brought, who won, what decided it and what it cost.
  const war = (h.wars ?? []).find((w) => (e.type === 'battle' ? w.battles.some((x) => x.eventId === eventId) : w.eventId === eventId));
  if (war && war.battles.length) {
    // (a war is shown by the fight that settled it: the one in which a town changed hands, or else the largest)
    const fought = e.type === 'battle' ? war.battles.find((x) => x.eventId === eventId)!
      : war.battles.find((x) => x.taken) ?? war.battles.reduce((m, x) => (x.sizes[0] + x.sizes[1] > m.sizes[0] + m.sizes[1] ? x : m), war.battles[0]!);
    const town = towns[fought.settlement];
    if (town) {
      const an = h.nations[war.a], bn = h.nations[war.b];
      const side = (nat: typeof an, men: number, mine: boolean): Host & { tech: number } => {
        const then = mine ? placeAt(sim, town.id, fought.year) : null;
        const tech = (mine ? then?.tech : undefined) ?? nat?.tech ?? town.tech;
        const [carries, stands] = arms(tech);
        return { name: nat?.name ?? (mine ? town.name : 'the attackers'), town: mine ? town.name : (towns[nat?.capital ?? -1]?.name ?? town.name), men: Math.max(40, Math.round(men * 1000)), arms: carries, formation: stands, hue: nat?.hue ?? unit(hash32(eventId, mine ? 3 : 7)), tech };
      };
      const attacker = side(an, fought.sizes[0], false), defender = side(bn, fought.sizes[1], true);
      defender.town = town.name;
      const won = fought.winner === 0 ? 'attacker' : 'defender';
      const what = fought.kind === 'siege' ? 'sits down before' : fought.kind === 'storm' ? 'goes straight at the walls of' : fought.kind === 'raid' ? 'comes to burn' : 'meets its enemy in the open near';
      const lostA = Math.round(fought.lost[0] * 1000), lostB = Math.round(fought.lost[1] * 1000);
      const phases = [
        `${attacker.name} ${what} ${town.name} with ${attacker.men.toLocaleString('en-US')}, in ${attacker.formation}, carrying ${attacker.arms}.`,
        `${defender.name} has ${defender.men.toLocaleString('en-US')} there, in ${defender.formation}, with ${defender.arms}.`,
        `What decided it: ${fought.decided}.`,
        `${attacker.name} loses ${lostA.toLocaleString('en-US')}; ${defender.name} loses ${lostB.toLocaleString('en-US')}.`,
        fought.taken ? `${town.name} has a new flag over it by evening.` : won === 'attacker' ? `The field is the attackers', but ${town.name} still stands.` : `${town.name} still stands.`,
      ];
      const campaign = war.battles.map((x) => ({ eventId: x.eventId === war.eventId && x !== fought ? -1 : x.eventId, shown: x === fought, year: x.year, town: towns[x.settlement]?.name ?? 'a town', kind: x.kind, won: (x.winner === 0 ? 'attacker' : 'defender') as 'attacker' | 'defender', taken: x.taken }));
      return { eventId, title: ev[fought.eventId]?.title ?? e.title, year: fought.year, cell: town.cell, attacker, defender, result: fought.taken ? 'taken' : 'held', phases, seed: hash32(hashText(sim.seed), fought.eventId >= 0 ? fought.eventId : eventId, 0xba77), won, kind: fought.kind, decided: fought.decided, lost: [lostA, lostB], campaign };
    }
  }
  if (e.type === 'battle') return null;
  const d = e.data ?? {};
  const a = towns[num(d.town)], b = towns[num(d.other)] ?? towns.find((s) => s.cell === e.cellId);
  if (!b) return null;
  const an = h.nations[num(d.nation)], bn = h.nations[num(d.foe)];
  const taken = e.effects.map((x) => ev[x]).some((x) => x && x.type === 'conquest');
  // one in forty bears arms, more where the country is used to war
  const host = (st: Settlement | undefined, nat: typeof an, other: Settlement): Host & { tech: number } => {
    // the town as it stood in the year of the war, not as it is now
    const then = st ? placeAt(sim, st.id, e.simYear) : null;
    const tech = then?.tech ?? nat?.tech ?? other.tech, pop = then?.pop ?? other.pop * 0.6;
    const [carries, stands] = arms(tech);
    return { name: nat?.name ?? st?.name ?? 'the rebels', town: st?.name ?? other.name, men: Math.max(40, Math.round((pop * 1000) / 40)), arms: carries, formation: stands, hue: nat?.hue ?? unit(hash32(eventId, st?.id ?? 7)), tech };
  };
  const attacker = host(a, an, b), defender = host(b, bn, b);
  if (e.type === 'civil-war') { attacker.name = `the rival court at ${b.name}`; defender.name = an?.name ?? 'the old court'; }
  const seed = hash32(hashText(sim.seed), eventId, 0xba77);
  const flank = unit(hash32(seed, 1)) < 0.5 ? 'left' : 'right';
  // how the two compare: numbers, and what they carry
  const odds = (attacker.men * (0.5 + attacker.tech)) / Math.max(1, defender.men * (0.5 + defender.tech));
  const phases = [
    `${attacker.name} comes on with ${attacker.men.toLocaleString('en-US')}, in ${attacker.formation}, carrying ${attacker.arms}.`,
    defender.name === defender.town ? `The people of ${defender.town} stand at their own walls with ${defender.men.toLocaleString('en-US')}, in ${defender.formation}, with ${defender.arms}.` : `${defender.name} stands before ${defender.town} with ${defender.men.toLocaleString('en-US')}, in ${defender.formation}, with ${defender.arms}.`,
    odds > 3 && !taken ? `The defenders do not come out to be counted. They hold the walls and the stores.` : odds < 0.34 && taken ? `The defenders are many more, and easy in their numbers. The attack comes at night, at the one gate nobody thought to watch.` : `The lines meet. For a long while nothing gives.`,
    taken ? (odds < 0.34 ? `By morning it is inside the walls, and numbers no longer count.` : `Then the defenders' ${flank} is turned. Those who can, run for the gate; it is shut too late.`)
      : odds > 3 ? `A town cannot be eaten in a day, and a host cannot be fed for a season. It goes home with what it could carry.` : `The attack breaks on the ${flank}, and what is left of it goes back the way it came.`,
    taken ? `${defender.town} has a new flag over it by evening.` : `${defender.town} still stands.`,
  ];
  return { eventId, title: e.title, year: e.simYear, cell: b.cell, attacker, defender, result: taken ? 'taken' : 'held', phases, seed };
}
