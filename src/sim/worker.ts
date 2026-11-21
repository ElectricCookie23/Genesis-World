/// <reference lib="webworker" />
// Worker entry point: owns all world state and runs the fixed-timestep loop.
import { Simulation } from './simulation';
import { linkInfo } from './link';
import { anchor, battle, citizenLife, museum, witness } from './ground';
import { Counterfactual, changeFor, replayable, type Change } from './whatif';
import { ancestry, archiveIndex, article, atlas, braid, placeAt, records } from './memory';
import { G, P, PHEN_COUNT, sizeMetres } from './genetics';
import { nearestCell } from './world';
import { loadSimulation, saveSimulation, type SaveState } from './snapshot';
import {
  HISTORY_SPEED, BEFORE_HISTORY, SPEEDS, type CellSnapshot, type FromWorker, type HerdSnapshot, type DynastyDetail, type HouseMember, type SiteDetail, type NationDetail, type PersonInfo, type NationInfo, type PlantInfo, type SpeciesInfo, type ToWorker, type WorldStats,
  type WonderInfo, type MemoryAnswer,
} from '../shared/protocol';
import { ERAS, earthNote, eraOf } from './history/eras';
import { CALAMITIES, REBUILDS } from './history/calamity';
import { LEXICON, SAYINGS } from './history/syntax';
import { languageList, scriptInfo } from './history/tongues';
import { galleryList } from './history/gallery';
import { describeMusic, lineOf, tradition } from './history/music';
import { describeColony } from './history/colony';
import { describePandemic } from './history/plague';
import { describeGreatWar } from './history/greatwar';
import { chartingOf } from './history/worldmap';
import { GOODS, describeMarket } from './history/trade';
import { GRUDGE_YEARS, secretTies, web } from './history/diplomacy';
import { bodyFrom, type Body } from './history/script';
import { compound } from './history/language';
import { SLOT_INDEX, WEB, wayFor } from './history/tech';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const TICK_HZ = 20;
/** While a big event plays out, time runs no faster than this (years per second). */
const SLOW_YPS = 1500;
let sim: Simulation | null = null;
let speedIndex = 0;
let lastCells = 0;
let lastStats = 0;
let lastSpecies = 0;
// The lists of species, towns and countries are large in a late world (a thousand towns, two hundred countries). If
// the page takes longer to take one in than the worker takes to make the next, they queue without limit (it reached
// gigabytes). So the next is not sent until the page says it has the last (or eight seconds have gone by).
let pageHas = true, sentLists = 0;
let lastCosmos = 0;
let tickMs = 0;
let cellsRequested = false;
let slowOnEvents = true;
let slowUntil = 0;
let speciesVersion = -1;
let plantVersion = -1;
const sentExtinct = new Set<number>();
const rewinds: { simYear: number; title: string; save: SaveState; era?: boolean }[] = [];
/** The world as it was just before the last tool was used: where "what if I had not?" starts from. */
let beforeTool: SaveState | null = null;
/** A what-if being worked out, a slice at a time between ticks (expansion E55, E56). */
let job: Counterfactual | null = null;
let lastJobPost = 0;

/** Start the two re-runs for a change, from the latest saved moment before it. */
function startWhatIf(s: Simulation, change: Change, save: SaveState | null): void {
  const live = s.civ.historyLive;
  // how far past the change the two copies are taken: to the present if that is near enough, never further than can be run in a minute or two
  const cap = live ? 6000 : 20e6, least = live ? 300 : 1.5e6;
  if (!save) { post({ type: 'whatif', state: null, problem: 'There is no saved moment from before this to start again from. Rewind points are kept at great events; an event older than the oldest of them cannot be taken away.' }); return; }
  if (change.year - save.simYear > cap) { post({ type: 'whatif', state: null, problem: 'The nearest saved moment is too long before this event to run forward from in reasonable time.' }); return; }
  const to = change.year + Math.max(least, Math.min(cap, s.simYear - change.year));
  job = new Counterfactual(save, change, to);
  lastJobPost = 0;
}

function runWhatIf(): void {
  if (!job) return;
  job.advance(35);
  const now = performance.now();
  if (job.done) {
    const maps = job.maps();
    post({ type: 'whatif', state: job.state(), maps }, [maps.withMap.buffer, maps.withoutMap.buffer, ...new Set(maps.heat.map((h) => h.buffer))] as Transferable[]);
    job = null;
  } else if (now - lastJobPost > 400) { lastJobPost = now; post({ type: 'whatif', state: job.state() }); }
}
/** While a history is unfolding, time is held at the pace of history unless the user picks a faster speed on purpose. */
const HISTORY_YPS = SPEEDS[HISTORY_SPEED]!.yearsPerSecond;
let historyOverride = false;
let wasHistory = false;
/** Highest era a snapshot has been kept for. */
let snapshotEra = 0;
/** How many rewind points to keep (each is a whole copy of the world). */
let rewindLimit = 12;
/** A jump through time under way: run in slices so that it can be stopped, and so the page hears how far it has got. */
let warp: { end: number; through: boolean; had: boolean; era: number; mark: string } | null = null;

function warpSlice(): void {
  const w = warp;
  if (!w || !sim) return;
  const t0 = performance.now();
  let done = false;
  while (!done && performance.now() - t0 < 400) {
    // toward an age, history is walked in short steps: a whole age can pass in a century
    sim.step(Math.min(w.era >= 0 && sim.civ.historyLive ? 25 : 15000, w.end - sim.simYear));
    keepEra(sim); // the ages passed on the way can be gone back to
    done = sim.simYear >= w.end || (!!w.mark && sim.milestones.has(w.mark))
      || (w.era >= 0 ? sim.civ.historyLive && sim.civ.h.topEra >= w.era : !w.through && !w.had && sim.civ.historyLive);
  }
  if (done) endWarp();
  else { post({ type: 'stats', stats: stats(sim) }); setTimeout(warpSlice, 0); }
}

function endWarp(): void {
  if (!warp || !sim) return;
  warp = null;
  wasHistory = sim.civ.historyLive;
  cellsRequested = true;
  post({ type: 'stats', stats: stats(sim) });
}
/** When there are too many, drop the one that sits closest in time to the point before it, so the rest stay spread over history. */
function thinRewinds(): void {
  while (rewinds.filter((r) => !r.era).length > rewindLimit) {
    let drop = 1, gap = Infinity;
    for (let i = 1; i < rewinds.length - 1; i++) {
      // the start of each era is always kept
      if (rewinds[i]!.title === 'Fork point' || rewinds[i]!.era) continue;
      const g = rewinds[i]!.simYear - rewinds[i - 1]!.simYear;
      if (g < gap) { gap = g; drop = i; }
    }
    rewinds.splice(drop, 1);
  }
}
let lastRewindYear = -1e12;
let focus: { x: number; y: number; z: number; altitude: number } | null = null;
let lastHerds = 0;
let focusRegion = 0;

/** Cohorts in the regions around the camera focus. */
function herds(s: Simulation, f: { x: number; y: number; z: number; altitude: number }): { herds: HerdSnapshot; transfer: Transferable[] } {
  const reg = s.regions, cr = s.creatures;
  focusRegion = nearestCell(reg.grid, f.x, f.y, f.z, focusRegion);
  const rings = f.altitude < 0.12 ? 2 : f.altitude < 0.4 ? 3 : 5;
  const seen = new Set<number>([focusRegion]);
  let frontier = [focusRegion];
  for (let k = 0; k < rings; k++) {
    const next: number[] = [];
    for (const r of frontier) {
      for (let j = 0; j < reg.grid.ncount[r]!; j++) {
        const nb = reg.grid.neighbors[r * 6 + j]!;
        if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
      }
    }
    frontier = next;
  }
  const rs: number[] = [], sp: number[] = [], n: number[] = [], land: number[] = [], fly: number[] = [], fed: number[] = [];
  for (let c = 0; c < cr.high; c++) {
    if (!cr.alive[c] || !seen.has(cr.region[c]!)) continue;
    if (!cr.species[cr.sp[c]!]!.name) continue;
    rs.push(cr.region[c]!); sp.push(cr.sp[c]!); n.push(cr.count[c]!);
    land.push(cr.phen[c * PHEN_COUNT + P.LandUse]!); fly.push(cr.phen[c * PHEN_COUNT + P.Fly]!); fed.push(cr.fed[c]!);
  }
  const h: HerdSnapshot = {
    region: Int32Array.from(rs), species: Int32Array.from(sp), count: Float32Array.from(n),
    land: Float32Array.from(land), fly: Float32Array.from(fly), fed: Float32Array.from(fed),
  };
  return { herds: h, transfer: [h.region.buffer, h.species.buffer, h.count.buffer, h.land.buffer, h.fly.buffer, h.fed.buffer] };
}

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

function snapshotCells(s: Simulation): { cells: CellSnapshot; transfer: Transferable[] } {
  const w = s.world;
  const cells: CellSnapshot = {
    simYear: s.simYear,
    seaLevel: w.seaLevel,
    elevation: w.elevation.slice(),
    temperature: w.temperature.slice(),
    moisture: w.moisture.slice(),
    biome: w.biome.slice(),
    vegetation: w.vegetation.slice(),
    snow: w.snow.slice(),
    cloud: w.cloud.map((c, i) => Math.min(1, c * s.climate.cloudShow[i]!)),
    ash: w.ash.slice(),
    lava: w.lava.slice(),
    lights: w.lights.slice(),
    trail: w.trail.slice(),
    fields: w.fields.slice(),
    reef: w.reef.slice(),
    bloom: w.bloom.slice(),
    canopy: w.canopy.slice(),
    flora: w.flora.slice(),
    flow: w.flow.slice(),
    downhill: w.downhill.slice(),
    windE: w.windE.slice(),
    windN: w.windN.slice(),
    terrainChanged: s.terrainDirty,
  };
  s.terrainDirty = false;
  const transfer = [
    cells.elevation.buffer, cells.temperature.buffer, cells.moisture.buffer, cells.biome.buffer,
    cells.vegetation.buffer, cells.snow.buffer, cells.cloud.buffer, cells.ash.buffer, cells.lava.buffer, cells.lights.buffer, cells.fields.buffer, cells.reef.buffer, cells.bloom.buffer,
    cells.canopy.buffer, cells.flora.buffer, cells.flow.buffer, cells.downhill.buffer, cells.windE.buffer, cells.windN.buffer,
  ];
  return { cells, transfer };
}

/** True when time is being held at the pace of history. */
function historyHeld(): boolean {
  return !!sim && sim.civ.historyLive && !historyOverride && SPEEDS[speedIndex]!.yearsPerSecond > HISTORY_YPS;
}

function currentYps(): number {
  const yps = historyHeld() ? HISTORY_YPS : SPEEDS[speedIndex]!.yearsPerSecond;
  return performance.now() < slowUntil ? Math.min(yps, SLOW_YPS) : yps;
}

function nationDetail(s: Simulation, id: number): NationDetail | null {
  const h = s.civ.h, n = h.nations[id];
  if (!n) return null;
  const land = new Set(n.land), lang = s.civ.languageOf(n);
  const tech = WEB.map((slot, i) => {
    const known = n.know.way[i]!;
    const k = known >= 0 ? known : wayFor(i, land);
    const way = slot.ways[Math.max(0, k)]!;
    const year = known >= 0 ? n.know.year[i]! : -1;
    return {
      slot: slot.id, field: slot.field, level: slot.level, era: eraOf(slot.level), state: known >= 0 ? 1 : k < 0 ? 2 : 0, name: way.name,
      own: compound(lang, way.words[0], way.words[1], known >= 0 ? year : Infinity), year, key: !!slot.key,
    };
  });
  const rulers = h.people.filter((p) => p.nation === id && p.reignFrom >= 0).map((p) => ({ name: p.name, from: p.reignFrom, to: p.reignTo, fate: p.fate, house: h.dynasties[p.dynasty]?.name ?? '', houseId: h.dynasties[p.dynasty] ? p.dynasty : -1 }));
  const houses = h.dynasties.filter((d) => d.nation === id).reverse().slice(0, 30).map((d) => ({ id: d.id, name: d.name, founded: d.founded, ended: d.ended, reigns: d.reigns, generations: d.generations ?? 1 }));
  const info = (p: (typeof h.people)[number]): PersonInfo => {
    const ev = s.events.events[p.events[0] ?? -1];
    return {
      id: p.id, name: p.name, role: p.role, born: p.born, died: p.died, fate: p.fate, bold: p.bold, wise: p.wise, cruel: p.cruel, open: p.open, era: p.era ?? n.era,
      patron: h.people[p.patron]?.name ?? '', rival: h.people[p.rival]?.name ?? '', house: h.dynasties[p.dynasty]?.name ?? '', houseId: h.dynasties[p.dynasty] ? p.dynasty : -1, deed: ev ? ev.title : '', eventId: ev ? ev.id : -1,
    };
  };
  const mine = h.people.filter((p) => p.nation === id);
  const first = mine.find((p) => p.role === 'founder'), now = h.people[n.ruler];
  const others = mine.filter((p) => p.role !== 'ruler' && p.role !== 'founder').reverse().slice(0, 40);
  const people = [...new Set([now, first, ...others].filter((p): p is NonNullable<typeof p> => !!p && p.nation === id))].map(info);
  const races = (h.races ?? []).filter((r) => r.a === id || r.b === id).map((r) => ({ with: h.nations[r.a === id ? r.b : r.a]?.name ?? '', began: r.began, ended: r.ended, eventId: r.eventId }));
  return { id, name: n.name, land: n.land.slice(), species: n.species, people, tech, rulers: rulers.slice(-60), houses, races };
}

/** Whose building fashions a nation borrows (system E14): the most knowledgeable country it is in touch with, if that is another culture, and the more so the more its own culture trades. */
function fashionSource(s: Simulation, n: Simulation['civ']['h']['nations'][number]): { cultureId: number; fashionFrom: number; fashionShare: number } {
  const h = s.civ.h, own = h.cultures[n.culture]!;
  let best: (typeof n) | undefined;
  for (const id of n.contacts) { const o = h.nations[id]; if (o && o.ended < 0 && o.culture !== n.culture && (!best || o.tech > best.tech)) best = o; }
  return { cultureId: own.id * 7919 + 17, fashionFrom: best ? best.culture * 7919 + 17 : -1, fashionShare: best ? Math.min(0.6, 0.15 + 0.45 * own.trade) : 0 };
}

/** What joins each town to others (system E15): for each town, pairs of the other town's id and the kind of network. */
function linksByTown(s: Simulation): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const l of s.civ.h.links ?? []) {
    let a = out.get(l.a); if (!a) out.set(l.a, (a = [])); a.push(l.b, l.kind);
    let b = out.get(l.b); if (!b) out.set(l.b, (b = [])); b.push(l.a, l.kind);
  }
  return out;
}

/** The kinds of network a nation has built, in the order it first built them. */
function networksOf(s: Simulation, nation: number): number[] {
  const out: number[] = [];
  for (const l of s.civ.h.links ?? []) if (l.nation === nation && !out.includes(l.kind)) out.push(l.kind);
  return out;
}

/** The towns the page is told about: every living one, and the ruins of the last few hundred to fall. */
function shownSettlements(s: Simulation): Simulation['civ']['settlements'] {
  const all = s.civ.settlements;
  let ruins = 0;
  for (const t of all) if (t.ruined >= 0) ruins++;
  if (ruins <= 300) return all;
  let skip = ruins - 300;
  // (a ruin with a wonder in it is always shown: the wonder outlasts the town)
  const kept = new Set<number>();
  for (const w of s.civ.h.wonders ?? []) kept.add(w.settlement);
  return all.filter((t) => t.ruined < 0 || skip-- <= 0 || kept.has(t.id));
}

/**
 * The great sea animals a nation's sailors have met (system E29): the largest swimmers alive whose home waters
 * lie within reach of its ships. They are what its mapmakers draw in the empty sea.
 */
function monstersOf(s: Simulation, n: Simulation['civ']['h']['nations'][number], sea: number, giants: { id: number; name: string; cell: number; size: number }[]): { species: number; name: string; cell: number; size: number }[] {
  const cap = s.civ.settlements[n.capital];
  if (!cap || sea <= 0) return [];
  const p = s.grid.pos, c = cap.cell, far = Math.cos(Math.min(3.1, sea * 1.4 + 0.1));
  return giants.filter((g) => p[c * 3]! * p[g.cell * 3]! + p[c * 3 + 1]! * p[g.cell * 3 + 1]! + p[c * 3 + 2]! * p[g.cell * 3 + 2]! >= far).slice(0, 3).map((g) => ({ species: g.id, name: g.name, cell: g.cell, size: g.size }));
}

/** The league a nation belongs to (system E40), if the order it came from still holds. */
function leagueOf(s: Simulation, n: Simulation['civ']['h']['nations'][number]): NationInfo['league'] {
  const g = (s.civ.h.great ?? []).find((x) => x.order && x.order.until < 0 && x.order.members.includes(n.id));
  const league = g?.order?.institutions[0];
  return g && g.order && league ? { name: league.name, own: league.own, since: g.order.year, eventId: league.eventId } : undefined;
}

/** The arms race a nation is in now (system E38). */
function raceOf(s: Simulation, n: Simulation['civ']['h']['nations'][number]): NationInfo['race'] {
  const h = s.civ.h, r = (h.races ?? []).find((x) => x.ended < 0 && (x.a === n.id || x.b === n.id));
  if (!r) return undefined;
  const side = r.a === n.id ? 0 : 1, other = h.nations[side === 0 ? r.b : r.a];
  return { with: other ? other.id : -1, withName: other ? other.name : '', since: r.began, pressed: n.pressed ?? 0, found: r.found[side], arms: r.arms[side], eventId: r.eventId };
}

/** A nation's colonies overseas (system E36): those it still holds. */
function coloniesOf(s: Simulation, n: Simulation['civ']['h']['nations'][number]): NonNullable<NationInfo['colonies']> | undefined {
  const out: NonNullable<NationInfo['colonies']> = [];
  for (const c of s.civ.h.colonies ?? []) {
    if (c.mother !== n.id || c.freed >= 0 || c.gone >= 0 || c.child >= 0) continue;
    const seat = s.civ.settlements[c.seat];
    if (!seat) continue;
    let towns = 0;
    for (const st of s.civ.settlements) if (st.ruined < 0 && st.nation === n.id && st.colony === c.id) towns++;
    if (towns) out.push({ id: c.id, seat: seat.id, name: seat.name, founded: c.founded, towns, identity: c.identity, note: describeColony(c, s.simYear), eventId: c.eventId });
  }
  return out.length ? out : undefined;
}

/** The music of a nation's people in its present age (system E27), once any of its kind has made music. */
function musicOf(s: Simulation, n: Simulation['civ']['h']['nations'][number]): { tradition: ReturnType<typeof tradition>; about: string } | undefined {
  const h = s.civ.h, g = s.creatures.species[n.species]?.ref, c = h.cultures[n.culture];
  if (!g || !c || n.tech < 0.3) return undefined;
  const t = tradition(lineOf(h.cultures, h.languages[c.language]!.family, c.id), {
    size: g[G.Size]!, water: g[G.Water]!, flight: Math.max(0, Math.min(1, (g[G.LimbType]! - 0.7) * 4)), hearing: Math.max(g[G.Hearing]!, g[G.Echo]!), harsh: g[G.Aggression]!, quick: g[G.Metabolism]!, limbs: g[G.LimbPairs]!, land: n.land,
  }, n.era);
  return { tradition: t, about: describeMusic(t) };
}

/** What a species looks like in its own pictures (system E23). */
function bodyOf(s: Simulation): (species: number) => Body {
  return (species) => { const g = s.creatures.species[species]?.ref; return g ? bodyFrom(g[G.LimbPairs]!, g[G.LimbType]!, g[G.Neck]!, g[G.Horn]!, g[G.Tail]!) : { legs: 2, neck: 0.4, horn: 0, wings: 0, tail: 0.4 }; };
}

/** The years a country's building laws were made (system E20): fire, earthquake, flood; undefined if it has none. */
function codeYears(s: Simulation, nation: number): number[] | undefined {
  const c = nation >= 0 ? s.civ.h.nations[nation]?.codes : undefined;
  return c && (c.fire || c.quake || c.flood) ? [c.fire?.year ?? -1, c.quake?.year ?? -1, c.flood?.year ?? -1] : undefined;
}

/** The wonders of each town (system E19), by the town's id. */
function wondersByTown(s: Simulation): Map<number, WonderInfo[]> {
  const out = new Map<number, WonderInfo[]>();
  const h = s.civ.h;
  for (const w of h.wonders ?? []) {
    let list = out.get(w.settlement);
    if (!list) out.set(w.settlement, (list = []));
    list.push({ id: w.id, kind: w.kind, name: w.name, what: w.what, why: w.why, builder: h.nations[w.nation]?.name ?? '', year: w.year, done: w.done, eventId: w.eventId, cause: w.cause, causeTitle: s.events.events[w.cause]?.title ?? '', toward: w.toward ?? -1, bearing: w.bearing ?? NaN });
  }
  return out;
}

/** A ruling house with its family tree: those who ruled, their husbands and wives, and the children who fought for the throne. */
function dynastyDetail(s: Simulation, id: number): DynastyDetail | null {
  const h = s.civ.h, d = h.dynasties[id];
  if (!d) return null;
  const n = h.nations[d.nation]!;
  const first = h.people[d.founder];
  const base = first ? first.gen ?? 0 : 0;
  // the family: its rulers, anyone else born into it, and those who married in
  const family = h.people.filter((p) => p.dynasty === id && p.role !== 'consort');
  const ids = new Set(family.map((p) => p.id));
  const wars = s.events.events.filter((e) => (e.type === 'war' || e.type === 'civil-war' || e.type === 'conquest') && e.data?.nation === n.id);
  const members: HouseMember[] = family.slice(-80).map((p) => {
    const wife = h.people[p.spouse ?? -1];
    const to = p.reignTo < 0 ? Infinity : p.reignTo;
    return {
      id: p.id, name: p.name, role: p.role, parent: ids.has(p.parent) ? p.parent : -1, gen: Math.max(0, (p.gen ?? 0) - base), born: p.born, died: p.died, fate: p.fate,
      reignFrom: p.reignFrom, reignTo: p.reignTo, nation: h.nations[p.nation]?.name ?? '', spouse: wife ? wife.name : '', spouseHouse: wife ? h.dynasties[wife.dynasty]?.name ?? '' : '',
      claim: (p.claim ?? -1) >= 0 ? h.nations[p.claim!]?.name ?? '' : '',
      wars: p.reignFrom >= 0 ? wars.filter((e) => e.simYear >= p.reignFrom && e.simYear <= to).slice(0, 4).map((e) => e.title) : [],
      era: p.era ?? n.era, bold: p.bold, cruel: p.cruel,
    };
  });
  const parent = d.branchOf !== undefined ? h.dynasties[d.branchOf] : undefined;
  return {
    id, name: d.name, nation: n.id, nationName: n.name, species: n.species, founded: d.founded, ended: d.ended, reigns: d.reigns, generations: d.generations ?? 1,
    branchOf: parent ? parent.name : '', branchId: parent ? parent.id : -1,
    branches: h.dynasties.filter((x) => x.branchOf === id).slice(0, 12).map((x) => ({ id: x.id, name: x.name, nation: h.nations[x.nation]?.name ?? '' })),
    members,
  };
}

function nationList(s: Simulation): NationInfo[] {
  const h = s.civ.h;
  // the living, and the forty most lately ended: a long history leaves thousands behind
  const ended = h.nations.filter((n) => n.ended >= 0);
  const keep = new Set(ended.slice(-40).map((n) => n.id));
  // the dozen largest swimmers alive, and where each lives: what sailors meet (system E29)
  const giants = s.creatures.species.filter((x) => x.extinctYear < 0 && x.name && (x.ref[G.Water]! > 0.6 || (x.ref[G.LimbType]! >= 0.25 && x.ref[G.LimbType]! < 0.5)) && x.ref[G.Size]! > 0.55 && s.regions.centre[x.home] !== undefined)
    .sort((a, b) => b.ref[G.Size]! - a.ref[G.Size]!).slice(0, 12).map((x) => ({ id: x.id, name: x.name, cell: s.regions.centre[x.home]!, size: x.ref[G.Size]! }));
  const knows = (n: (typeof h.nations)[number]) => (slot: string): boolean => { const i = SLOT_INDEX.get(slot); return i !== undefined && n.know.way[i]! >= 0; };
  return h.nations.filter((n) => n.ended < 0 || keep.has(n.id)).map((n) => {
    const ruler = h.people[n.ruler], house = h.dynasties[n.dynasty], culture = h.cultures[n.culture]!, cal = s.civ.calendarOf(n);
    return {
      id: n.id, name: n.name, species: n.species, capital: n.capital, founded: n.founded, ended: n.ended, parent: n.parent, government: n.government,
      stability: n.stability, tech: n.tech, era: n.era, eraName: s.civ.eraName(n), eraOwn: s.civ.eraOwnName(n), earth: earthNote(n.era), hue: n.hue, pop: n.pop, towns: n.towns,
      culture: culture.name, language: h.languages[culture.language]!.name, music: musicOf(s, n), idea: n.idea && h.ideologies?.[n.idea.id] ? { name: h.ideologies[n.idea.id]!.name, own: h.ideologies[n.idea.id]!.own, kind: h.ideologies[n.idea.id]!.kind, share: n.idea.share, eventId: h.ideologies[n.idea.id]!.eventId } : undefined, flag: n.flag, league: leagueOf(s, n), race: raceOf(s, n), colonies: coloniesOf(s, n), colonyOf: n.colonyOf !== undefined && h.colonies?.[n.colonyOf] ? { mother: h.colonies[n.colonyOf]!.mother, motherName: h.nations[h.colonies[n.colonyOf]!.mother]?.name ?? '', founded: h.colonies[n.colonyOf]!.founded, declared: h.colonies[n.colonyOf]!.declared, freed: h.colonies[n.colonyOf]!.freed, warEvent: h.colonies[n.colonyOf]!.warEvent } : undefined, creed: n.creed !== undefined && h.ideologies?.[n.creed] ? { name: h.ideologies[n.creed]!.name, own: h.ideologies[n.creed]!.own, kind: h.ideologies[n.creed]!.kind, since: n.revolved ?? 0 } : undefined, trade: n.trade && h.nations[n.trade.to] && h.nations[n.trade.to]!.ended < 0 ? { good: GOODS[n.trade.good]!, to: n.trade.to, toName: h.nations[n.trade.to]!.name, since: n.trade.since, eventId: n.trade.eventId } : undefined, market: n.ended < 0 && n.era >= 1 ? describeMarket({ land: n.land, tech: n.tech, pop: n.pop, towns: Math.max(1, n.towns), mines: n.mines ?? 0, felled: n.felled !== undefined ? 0.7 : 0, knows: knows(n) }) : undefined, festivals: n.festivals && n.festivals.length ? n.festivals : undefined, charting: chartingOf(knows(n), n.tech), contacts: n.contacts.filter((id) => h.nations[id] && h.nations[id]!.ended < 0), monsters: monstersOf(s, n, chartingOf(knows(n), n.tech).sea, giants), script: scriptInfo(h, n.script, n.species, s.simYear, bodyOf(s)), signs: n.signs ?? (s.civ.settlements[n.capital] ? ['land', s.civ.settlements[n.capital]!.modifier || s.civ.settlements[n.capital]!.head] : undefined), ruler: ruler && ruler.died < 0 ? ruler.name : '', rulerSince: ruler && ruler.died < 0 ? ruler.reignFrom : -1,
      house: house ? house.name : '', houseReigns: house ? house.reigns : 0, houseId: house ? house.id : -1, eventId: n.eventId, ...fashionSource(s, n), networks: networksOf(s, n.id), golden: n.golden ? n.golden.own : '', goldenSince: n.golden ? n.golden.since : -1, goldenWorks: n.golden ? n.golden.works : 0,
      calendar: cal ? cal.name : '', calendarOwn: cal ? cal.own : '', calendarEpoch: cal ? cal.epoch : 0, calendarEvent: cal ? cal.eventId : -1,
    };
  });
}

function stats(s: Simulation): WorldStats {
  return {
    simYear: s.simYear,
    yearFrac: s.yearFrac,
    meanTemp: s.climate.meanTemp,
    globalOffset: s.climate.globalOffset,
    iceFraction: s.climate.iceFraction,
    seaLevel: s.world.seaLevel,
    oceanFraction: s.geology.oceanFraction,
    tilt: s.climate.tilt,
    moonAngle: s.moonAngle,
    speedIndex,
    yearsPerSecond: currentYps(),
    history: s.civ.historyActive,
    longPeace: s.civ.h.peace ?? -1,
    historyHeld: historyHeld(),
    historyBegan: s.civ.h.began,
    topEra: s.civ.h.topEra,
    skipTo: warp?.mark ? warp.mark : warp && warp.era >= 0 ? warp.era : undefined,
    reached: BEFORE_HISTORY.filter((b) => s.milestones.has(b.key)).map((b) => b.key),
    tickMs,
    stage: s.stage,
    era: s.era.kind,
    oxygen: s.plants.oxygen,
    livingSpecies: s.creatures.livingSpecies,
    totalSpecies: s.creatures.species.length,
    plantSpecies: s.plants.living,
    population: s.creatures.totalPop,
    landCover: s.plants.totalLandCover / Math.max(1, s.regions.count),
    storms: s.storms.map((x) => x.cell),
    solar: s.climate.solar, starSwell: s.cosmos.swell, starPhase: s.cosmos.starPhase, orbitalRing: s.future.ring, tetherLon: s.future.ringCell >= 0 ? Math.atan2(s.grid.pos[s.future.ringCell * 3 + 2]!, s.grid.pos[s.future.ringCell * 3]!) : 0, pulseRate: s.strange.pulseRate, health: s.strange.health, poleSign: s.strange.poleSign, poleFlip: s.strange.flipProgress(s.simYear),
    cyclones: s.storms.filter((x) => x.hurricane || x.eternal).map((x) => x.cell),
    moons: s.moons,
    ring: s.ring,
    binary: s.binary,
    oldestTreeCell: s.oldestTreeCell,
    civMusic: s.civ.hasMusic,
    monoliths: s.monoliths.map((r) => s.regions.centre[r]!),
    plantToxin: meanToxin(s),
    toxinResist: meanResist(s),
    settlements: s.civ.living,
    maxTech: s.civ.maxTech,
  };
}

function meanToxin(s: Simulation): number {
  let t = 0, w = 0;
  for (const sp of s.plants.species) if (sp.extinctYear < 0 && !sp.aquatic) { t += sp.genes[6]! * sp.cover; w += sp.cover; }
  return w > 0 ? t / w : 0;
}

function meanResist(s: Simulation): number {
  let t = 0, w = 0;
  for (const sp of s.creatures.species) if (sp.extinctYear < 0) { const k = Math.log10(sp.pop + 10); t += sp.ref[G.ToxinResist]! * k; w += k; }
  return w > 0 ? t / w : 0;
}

function speciesList(s: Simulation): SpeciesInfo[] {
  const cr = s.creatures;
  const out: SpeciesInfo[] = [];
  for (const sp of cr.species) {
    const extinct = sp.extinctYear >= 0;
    if (extinct && sentExtinct.has(sp.id)) continue;
    if (extinct) sentExtinct.add(sp.id);
    if (!sp.name) continue;
    out.push({
      id: sp.id, name: sp.name, parent: sp.parent, bornYear: sp.bornYear, extinctYear: sp.extinctYear,
      pop: sp.pop, peakPop: sp.peakPop, regions: sp.regions, homeCell: s.regions.centre[sp.home]!, eventId: sp.eventId,
      genes: sp.ref.slice(), metres: sizeMetres(sp.ref[G.Size]!),
      land: extinct ? 0 : cr.speciesMean(sp.id, P.LandUse, true), fly: extinct ? 0 : cr.speciesMean(sp.id, P.Fly, true),
    });
  }
  return out;
}

function plantList(s: Simulation): PlantInfo[] {
  const out: PlantInfo[] = [];
  for (const sp of s.plants.species) {
    if (sp.extinctYear >= 0 && !sp.established) continue;
    if (sp.cover <= 0 && sp.extinctYear < 0) continue;
    out.push({ id: sp.id, name: sp.name, parent: sp.parent, genes: sp.genes, aquatic: sp.aquatic, extinct: sp.extinctYear >= 0, cover: sp.cover });
  }
  return out;
}

/** A whole copy of the world is kept at the start of every era, for replays, what-ifs and going back to an age. */
function keepEra(s: Simulation): void {
  if (s.civ.h.topEra < snapshotEra) snapshotEra = s.civ.h.topEra;
  if (s.civ.h.topEra > snapshotEra) {
    snapshotEra = s.civ.h.topEra;
    const title = `Start of the ${ERAS[snapshotEra]!.name}`;
    rewinds.push({ simYear: s.simYear, title, save: saveSimulation(s, title), era: true });
    // A kept copy of the world is as large as its record. Where the record is long (a watched history of many
    // countries), a dozen copies ran to gigabytes and the page stopped answering; so the copies together may hold
    // only so many events' worth, and the heaviest that is not the newest goes first.
    const weigh = (r: { save: { data: unknown } }): number => { const e = (r.save.data as { events?: { __nested?: { events?: unknown[] } } }).events; return e && e.__nested && Array.isArray(e.__nested.events) ? e.__nested.events.length : 0; };
    for (let guard = 0; guard < 40 && rewinds.reduce((a, r) => a + weigh(r), 0) > 250000; guard++) {
      let drop = -1, top = -1;
      for (let i = 0; i < rewinds.length - 1; i++) { const w = weigh(rewinds[i]!); if (rewinds[i]!.title !== 'Fork point' && w > top) { top = w; drop = i; } }
      if (drop < 0) break;
      rewinds.splice(drop, 1);
    }
    // where memory is short only the most recent eras are kept
    const eraLimit = Math.max(3, rewindLimit - 2);
    while (rewinds.filter((r) => r.era).length > eraLimit) rewinds.splice(rewinds.findIndex((r) => r.era), 1);
    rewinds.sort((a, b) => a.simYear - b.simYear);
    post({ type: 'timeline', points: rewinds.map((r, index) => ({ index, simYear: r.simYear, title: r.title })) });
  }
}

function tick(): void {
  const s = sim;
  if (!s || warp) return;
  const start = performance.now();
  const yps = currentYps();
  if (yps > 0) s.step(yps / TICK_HZ);
  // history has begun (or ended): the hold on time starts afresh each time
  const active = s.civ.historyLive;
  if (active !== wasHistory) { wasHistory = active; historyOverride = false; }
  keepEra(s);
  // slow time for a few seconds around big events so they can be seen
  if (slowOnEvents && s.bigEvent >= 2 && SPEEDS[speedIndex]!.yearsPerSecond > SLOW_YPS) slowUntil = start + (s.bigEvent >= 3 ? 5000 : 3000);
  const fresh = s.events.drainFresh();
  if (fresh.length) post({ type: 'events', events: fresh });
  // keep a few rewind points: every milestone-grade event, at most one per 4 My
  const major = fresh.find((e) => e.importance >= 3);
  if (major && s.simYear - lastRewindYear > 4e6) {
    lastRewindYear = s.simYear;
    rewinds.push({ simYear: s.simYear, title: major.title, save: saveSimulation(s, major.title) });
    thinRewinds();
    post({ type: 'timeline', points: rewinds.map((r, index) => ({ index, simYear: r.simYear, title: r.title })) });
  }
  const now = performance.now();
  tickMs = tickMs * 0.9 + (now - start) * 0.1;
  const cellInterval = yps > 0 ? 250 : 1000;
  if (cellsRequested || now - lastCells > cellInterval) {
    if (yps > 0 || cellsRequested) {
      const { cells, transfer } = snapshotCells(s);
      post({ type: 'cells', cells }, transfer);
    }
    cellsRequested = false;
    lastCells = now;
  }
  // the rest of the star system changes slowly: told about now and then
  if (now - lastCosmos > 1500) { lastCosmos = now; post({ type: 'cosmos', cosmos: s.cosmos.info(s), messages: s.legacy.messages, archives: s.legacy.archives, link: s.neighbor ? linkInfo(s, s.neighbor) : undefined, strange: s.strange.info(s, focus ? nearestCell(s.regions.grid, focus.x, focus.y, focus.z, focusRegion) : 0), future: s.future.info(), industry: s.industry.info() }); }
  if (now - lastStats > 100) {
    post({ type: 'stats', stats: stats(s) });
    lastStats = now;
  }
  if (now - lastSpecies > 700 && s.stage === 'animals' && (pageHas || now - sentLists > 8000)) {
    lastSpecies = now;
    post({ type: 'species', species: speciesList(s) });
    if (s.civ.settlements.length) {
      pageHas = false; sentLists = now;
      const joins = linksByTown(s);
      const great = wondersByTown(s);
      post({ type: 'settlements', settlements: shownSettlements(s).map((t) => ({ id: t.id, name: t.name, cell: t.cell, species: t.species, pop: t.pop, tech: t.tech, founded: t.founded, lore: t.lore, eventId: t.eventId, nation: t.nation, relic: t.relic >= 0 ? WEB[t.relic]!.ways[0]!.name : undefined, ruined: t.ruined, farms: t.farms, monuments: t.monuments ?? 0, wonders: great.get(t.id), means: t.modifier ? `${t.modifier} ${t.head}` : t.head, names: t.names && t.names.length > 1 ? t.names : undefined, scars: t.scars && t.scars.length ? t.scars.flatMap((x) => [x.year, CALAMITIES.indexOf(x.kind), x.share, REBUILDS.indexOf(x.rebuilt), x.toward ?? -1]) : undefined, codes: codeYears(s, t.nation), cordon: t.cordon ? { year: t.cordon.year, name: (s.civ.h.plagues ?? []).find((p) => p.id === t.cordon!.plague)?.name ?? 'a sickness' } : undefined, walls: t.walls && t.walls.length ? t.walls.flatMap((w) => [w.pop, w.tech]) : undefined, overseas: t.overseas, links: joins.get(t.id), dam: t.dam !== undefined, mine: t.mine !== undefined, layers: (t.strata ? t.strata.length : 1) + (t.over !== undefined ? 1 : 0), peak: t.peak, feral: t.feral !== undefined ? s.creatures.species[t.feral]?.name ?? '' : '', nesting: t.nesting !== undefined ? s.creatures.species[t.nesting]?.name ?? '' : '' })) , nations: nationList(s), armies: (s.civ.h.wars ?? []).filter((w) => w.ended < 0).map((w) => { const t = s.civ.settlements[w.route[Math.min(w.at, w.route.length - 1)]!]; return { cell: t ? t.cell : -1, size: w.army[0].size }; }).filter((a) => a.cell >= 0) });
    }
    speciesVersion = s.creatures.version;
    if (s.plants.version !== plantVersion) {
      plantVersion = s.plants.version;
      post({ type: 'plants', plants: plantList(s) });
    }
  } else if (now - lastSpecies > 700 && s.plants.version !== plantVersion) {
    lastSpecies = now;
    plantVersion = s.plants.version;
    post({ type: 'plants', plants: plantList(s) });
  }
  if (focus && focus.altitude < 1.3 && now - lastHerds > 600 && s.stage === 'animals') {
    lastHerds = now;
    const h = herds(s, focus);
    post({ type: 'herds', herds: h.herds }, h.transfer);
  }
  void speciesVersion;
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init': {
        warp = null;
        sim = new Simulation(msg.seed, msg.gridN);
        if (msg.neighbor) sim.link(msg.neighbor);
        sentExtinct.clear();
        const { cells, transfer } = snapshotCells(sim);
        post({ type: 'ready', seed: msg.seed, gridN: sim.grid.n, tilt: sim.climate.tilt, cells, stats: stats(sim) }, transfer);
        const fresh = sim.events.drainFresh();
        if (fresh.length) post({ type: 'events', events: fresh });
        break;
      }
      case 'speed':
        speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, msg.index));
        // choosing a faster speed while history runs is a decision to skip ahead: it lifts the hold
        historyOverride = !!sim && sim.civ.historyLive && SPEEDS[speedIndex]!.yearsPerSecond > HISTORY_YPS;
        slowUntil = 0;
        break;
      case 'requestCells':
        cellsRequested = true;
        break;
      case 'settings':
        if (msg.slowOnEvents !== undefined) slowOnEvents = msg.slowOnEvents;
        break;
      case 'tool':
        if (sim) {
          beforeTool = saveSimulation(sim, 'before');
          if (msg.tool === 'species' && msg.genes) sim.designSpecies(msg.cell, msg.genes);
          else sim.intervene(msg.tool, msg.cell, msg.power ?? 0.8);
          slowUntil = performance.now() + 6000;
          cellsRequested = true;
        }
        break;
      case 'save':
        if (sim) post({ type: 'saved', slot: msg.slot, save: saveSimulation(sim, msg.name) });
        break;
      case 'load': {
        warp = null;
        const save = msg.save as SaveState;
        sim = new Simulation(save.seed, save.gridN);
        loadSimulation(sim, save);
        if (msg.diverge) sim.diverge();
        snapshotEra = sim.civ.h.topEra; wasHistory = sim.civ.historyLive; historyOverride = false;
        sim.events.drainFresh();
        sentExtinct.clear();
        speciesVersion = -1;
        plantVersion = -1;
        lastSpecies = 0;
        const { cells, transfer } = snapshotCells(sim);
        post({ type: 'loaded', cells, stats: stats(sim), events: sim.events.events }, transfer);
        break;
      }
      case 'requestSite':
        if (sim) {
          const stack = sim.civ.siteOf(msg.id);
          if (stack) {
            const s = sim;
            const detail: SiteDetail = {
              id: msg.id, cell: stack.cell, layers: stack.layers,
              towns: stack.towns.map((t) => ({ id: t.id, name: t.name, people: s.creatures.species[t.species]?.name ?? '', species: t.species, founded: t.founded, ruined: t.ruined, strata: t.strata.map((x) => ({ year: x.year, kind: x.kind, tech: x.tech, cause: s.events.events[x.eventId]?.title ?? '', eventId: s.events.events[x.eventId] ? x.eventId : -1 })) })),
            };
            post({ type: 'site', detail });
          }
        }
        break;
      case 'whatif':
        if (msg.stop) { job = null; post({ type: 'whatif', state: null }); }
        else if (sim && msg.herdAt !== undefined) startWhatIf(sim, { kind: 'herd', title: 'One small herd is spared', year: sim.simYear, cell: msg.herdAt, count: 40 }, saveSimulation(sim, 'now'));
        else if (sim && msg.eventId !== undefined) {
          const e = sim.events.events[msg.eventId];
          if (!e || !replayable(e)) { post({ type: 'whatif', state: null, problem: 'This is not something that can be taken away and run again.' }); break; }
          // the latest saved moment that does not already hold the event
          let save: SaveState | null = null;
          for (const r of rewinds) if (r.simYear < e.simYear && (!save || r.simYear > save.simYear)) save = r.save;
          if (beforeTool && beforeTool.simYear <= e.simYear && e.data?.byHand === 1 && (!save || beforeTool.simYear >= save.simYear)) save = beforeTool;
          startWhatIf(sim, changeFor(e), save);
        }
        break;
      case 'requestMemory':
        if (sim) {
          const a = msg.ask;
          const answer: MemoryAnswer = a.what === 'index' ? { what: 'index', data: archiveIndex(sim) }
            : a.what === 'article' ? { what: 'article', data: article(sim, { kind: a.kind, id: a.id }) }
            : a.what === 'atlas' ? { what: 'atlas', data: atlas(sim) }
            : a.what === 'braid' ? { what: 'braid', data: braid(sim) }
            : a.what === 'records' ? { what: 'records', data: records(sim, a.id) }
            : a.what === 'ancestry' ? { what: 'ancestry', data: ancestry(sim, a.town, a.index) }
            : a.what === 'forecasts' ? { what: 'forecasts', data: sim.forecast.info() }
            : a.what === 'citizen' ? { what: 'citizen', data: citizenLife(sim, a.town, a.index) }
            : a.what === 'anchor' ? { what: 'anchor', data: anchor(sim, a.cell) }
            : a.what === 'witness' ? { what: 'witness', data: witness(sim, a.eventId) }
            : a.what === 'museum' ? { what: 'museum', data: museum(sim, a.id), asked: a.id }
            : a.what === 'battle' ? { what: 'battle', data: battle(sim, a.eventId) }
            : { what: 'place', data: placeAt(sim, a.id, a.year) };
          post({ type: 'memory', answer });
        }
        break;
      case 'requestDiplomacy':
        if (sim) {
          const s = sim, h = s.civ.h, g = s.grid;
          const living = h.nations.filter((n) => n.ended < 0);
          post({ type: 'diplomacy', web: {
            nations: living.map((n) => { const c = s.civ.settlements[n.capital]?.cell ?? 0; return { id: n.id, name: n.name, hue: n.hue, u: (g.lon[c]! + Math.PI) / (Math.PI * 2), v: 0.5 - g.lat[c]! / Math.PI, pop: n.pop }; }),
            // (in a world of many countries, who is merely in touch with whom is thousands of lines: only what is stronger is sent)
            ties: living.length > 40 ? web(h, s.simYear).filter((t) => t.kind !== 'contact') : web(h, s.simYear),
            secret: secretTies(h, s.simYear),
            betrayals: living.flatMap((n) => (n.grudges ?? []).filter((x) => s.simYear - x.year < GRUDGE_YEARS).map((x) => ({ by: h.nations[x.against]?.name ?? '', against: n.name, year: x.year, eventId: x.eventId, avenged: x.avenged ?? -1 }))).sort((a, b) => b.year - a.year).slice(0, 30),
          } });
        }
        break;
      case 'requestPlagues':
        if (sim) {
          const s = sim, h = s.civ.h, towns = s.civ.settlements, live = towns.filter((t) => t.ruined < 0).length;
          post({
            type: 'plagues',
            list: (h.plagues ?? []).slice().reverse().map((p) => ({ id: p.id, name: p.name, own: p.own, began: p.began, ended: p.ended, eventId: p.eventId, text: describePandemic(p, live, s.simYear), steps: p.reached.map((r) => ({ cell: towns[r.town]!.cell, from: r.from >= 0 ? towns[r.from]!.cell : -1, town: towns[r.town]!.name, year: r.year, via: r.via, dead: r.dead, shut: r.shut, eventId: r.eventId })) })),
            ways: s.civ.tradeEdges(s).map((e) => ({ a: towns[e.a]!.cell, b: towns[e.b]!.cell, via: e.via })),
          });
        }
        break;
      case 'requestGreatWars':
        if (sim) {
          const s = sim, h = s.civ.h, towns = s.civ.settlements;
          const name = (id: number): string => h.nations[id]?.name ?? '';
          post({ type: 'greatWars', list: (h.great ?? []).slice().reverse().map((g) => ({
            id: g.id, name: g.name, own: g.own, began: g.began, ended: g.ended, world: g.world, eventId: g.eventId, endEvent: g.endEvent, text: describeGreatWar(g, name, s.simYear),
            sides: g.sides.map((ids) => ({ names: ids.map(name), cells: towns.filter((t) => t.ruined < 0 && ids.includes(t.nation) && h.nations[t.nation]!.ended < 0).map((t) => t.cell) })),
            institutions: (g.order?.institutions ?? []).map((i) => ({ kind: i.kind, name: i.name, own: i.own, cell: towns[i.seat]?.cell ?? -1, eventId: i.eventId })),
            holds: !!g.order && g.order.until < 0,
          })) });
        }
        break;
      case 'got':
        pageHas = true;
        break;
      case 'requestWars':
        if (sim) { const s = sim, h = s.civ.h; post({ type: 'wars', list: (h.wars ?? []).slice(-30).reverse().map((w) => ({ id: w.id, attacker: h.nations[w.a]?.name ?? '', defender: h.nations[w.b]?.name ?? '', year: w.year, ended: w.ended, outcome: w.outcome, eventId: w.eventId, peaceEvent: w.peaceEvent, battles: w.battles.map((b) => { const t = s.civ.settlements[b.settlement]; return { year: b.year, cell: t ? t.cell : -1, town: t ? t.name : '', kind: b.kind, winner: b.winner, sizes: b.sizes, decided: b.decided, taken: b.taken, eventId: b.eventId, text: s.events.events[b.eventId]?.description ?? '' }; }) })) }); }
        break;
      case 'requestMarket':
        if (sim) { const s = sim, h = s.civ.h, m = h.market; post({ type: 'market', market: { goods: [...GOODS], years: m ? m.years : [], prices: m ? m.prices : GOODS.map(() => []), bubble: m && m.bubble ? { good: GOODS[m.bubble.good]!, nation: h.nations[m.bubble.nation]?.name ?? '', since: m.bubble.since, froth: m.bubble.froth } : undefined, panics: s.events.events.filter((e) => e.type === 'panic').slice(-30).reverse().map((e) => ({ year: e.simYear, title: e.title, eventId: e.id, good: String(e.data?.good ?? '') })) } }); }
        break;
      case 'requestLegends':
        if (sim) { const s = sim, h = s.civ.h; post({ type: 'legends', list: (h.legends ?? []).slice(-80).reverse().map((L) => ({ id: L.id, year: L.year, nation: h.nations[L.nation]?.name ?? '', town: s.civ.settlements[L.settlement]?.name ?? '', cell: s.civ.settlements[L.settlement]?.cell ?? -1, species: L.species, speciesName: s.creatures.species[L.species]?.name ?? '', extinctYear: s.creatures.species[L.species]?.extinctYear ?? -1, kind: L.kind, own: L.own, means: L.means, found: L.found, tale: L.tale, eventId: L.eventId, known: L.known ? { year: L.known.year, nation: h.nations[L.known.nation]?.name ?? '', text: L.known.text, eventId: L.known.eventId } : undefined })) }); }
        break;
      case 'requestGallery':
        if (sim) post({ type: 'gallery', ...galleryList(sim.civ.h, sim.events.events, sim.civ.settlements, bodyOf(sim)) });
        break;
      case 'requestLanguages':
        if (sim) post({ type: 'languages', lexicon: [...LEXICON], sayings: SAYINGS.map((x) => x.english), list: languageList(sim.civ.h, sim.simYear, bodyOf(sim)) });
        break;
      case 'requestDynasty':
        if (sim) { const detail = dynastyDetail(sim, msg.id); if (detail) post({ type: 'dynasty', detail }); }
        break;
      case 'requestNation':
        if (sim) { const detail = nationDetail(sim, msg.id); if (detail) post({ type: 'nation', detail }); }
        break;
      case 'requestLayer':
        if (sim) { const values = sim.layer(msg.kind); post({ type: 'layer', kind: msg.kind, values }, [values.buffer]); }
        break;
      case 'rewindLimit':
        rewindLimit = Math.max(2, Math.min(24, msg.count));
        thinRewinds();
        break;
      case 'fork':
        if (sim) {
          rewinds.push({ simYear: sim.simYear, title: 'Fork point', save: saveSimulation(sim, 'fork') });
          thinRewinds();
          post({ type: 'timeline', points: rewinds.map((r, index) => ({ index, simYear: r.simYear, title: r.title })) });
        }
        break;
      case 'rewind': {
        const point = rewinds[msg.index];
        if (!point) break;
        warp = null;
        sim = new Simulation(point.save.seed, point.save.gridN);
        loadSimulation(sim, point.save);
        snapshotEra = sim.civ.h.topEra; wasHistory = sim.civ.historyLive; historyOverride = false;
        sim.events.drainFresh();
        sentExtinct.clear();
        plantVersion = -1;
        lastSpecies = 0;
        rewinds.length = msg.index + 1;
        lastRewindYear = sim.simYear;
        const { cells, transfer } = snapshotCells(sim);
        post({ type: 'loaded', cells, stats: stats(sim), events: sim.events.events }, transfer);
        post({ type: 'timeline', points: rewinds.map((r, index) => ({ index, simYear: r.simYear, title: r.title })) });
        break;
      }
      case 'warp':
        // a jump through time stops where history begins (unless it began before the jump, or the caller asked to
        // run through), or at the age asked for: that is the part worth watching
        if (msg.stop) endWarp();
        else if (sim && !warp) {
          warp = { end: sim.simYear + (msg.years ?? 0), through: !!msg.through, had: sim.civ.historyLive, era: msg.untilEra ?? -1, mark: msg.untilMark ?? '' };
          warpSlice();
        }
        break;
      case 'focus':
        focus = { x: msg.x, y: msg.y, z: msg.z, altitude: msg.altitude };
        break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

setInterval(() => {
  try {
    runWhatIf();
    tick();
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
}, 1000 / TICK_HZ);
