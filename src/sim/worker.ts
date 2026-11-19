/// <reference lib="webworker" />
// Worker entry point: owns all world state and runs the fixed-timestep loop.
import { Simulation } from './simulation';
import { G, P, PHEN_COUNT, sizeMetres } from './genetics';
import { nearestCell } from './world';
import { loadSimulation, saveSimulation, type SaveState } from './snapshot';
import {
  HISTORY_SPEED, SPEEDS, type CellSnapshot, type FromWorker, type HerdSnapshot, type NationDetail, type NationInfo, type PlantInfo, type SpeciesInfo, type ToWorker, type WorldStats,
} from '../shared/protocol';
import { ERAS, eraOf } from './history/eras';
import { compound } from './history/language';
import { WEB, wayFor } from './history/tech';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const TICK_HZ = 20;
/** While a big event plays out, time runs no faster than this (years per second). */
const SLOW_YPS = 1500;
let sim: Simulation | null = null;
let speedIndex = 0;
let lastCells = 0;
let lastStats = 0;
let lastSpecies = 0;
let tickMs = 0;
let cellsRequested = false;
let slowOnEvents = true;
let slowUntil = 0;
let speciesVersion = -1;
let plantVersion = -1;
const sentExtinct = new Set<number>();
const rewinds: { simYear: number; title: string; save: SaveState; era?: boolean }[] = [];
/** While a history is unfolding, time is held at the pace of history unless the user picks a faster speed on purpose. */
const HISTORY_YPS = SPEEDS[HISTORY_SPEED]!.yearsPerSecond;
let historyOverride = false;
let wasHistory = false;
/** Highest era a snapshot has been kept for. */
let snapshotEra = 0;
/** How many rewind points to keep (each is a whole copy of the world). */
let rewindLimit = 12;
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
    cloud: w.cloud.slice(),
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
  return !!sim && sim.civ.historyActive && !historyOverride && SPEEDS[speedIndex]!.yearsPerSecond > HISTORY_YPS;
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
  const rulers = h.people.filter((p) => p.nation === id && p.reignFrom >= 0).map((p) => ({ name: p.name, from: p.reignFrom, to: p.reignTo, fate: p.fate, house: h.dynasties[p.dynasty]?.name ?? '' }));
  return { id, name: n.name, land: n.land.slice(), tech, rulers: rulers.slice(-60) };
}

function nationList(s: Simulation): NationInfo[] {
  const h = s.civ.h;
  return h.nations.map((n) => {
    const ruler = h.people[n.ruler], house = h.dynasties[n.dynasty], culture = h.cultures[n.culture]!;
    return {
      id: n.id, name: n.name, species: n.species, capital: n.capital, founded: n.founded, ended: n.ended, parent: n.parent, government: n.government,
      stability: n.stability, tech: n.tech, era: n.era, eraName: ERAS[n.era]!.name, hue: n.hue, pop: n.pop, towns: n.towns,
      culture: culture.name, language: h.languages[culture.language]!.name, ruler: ruler ? ruler.name : '', rulerSince: ruler ? ruler.reignFrom : -1,
      house: house ? house.name : '', houseReigns: house ? house.reigns : 0, eventId: n.eventId,
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
    historyHeld: historyHeld(),
    historyBegan: s.civ.h.began,
    topEra: s.civ.h.topEra,
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
    solar: s.climate.solar,
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

function tick(): void {
  const s = sim;
  if (!s) return;
  const start = performance.now();
  const yps = currentYps();
  if (yps > 0) s.step(yps / TICK_HZ);
  // history has begun (or ended): the hold on time starts afresh each time
  const active = s.civ.historyActive;
  if (active !== wasHistory) { wasHistory = active; historyOverride = false; }
  // a whole copy of the world is kept at the start of every era, for replays and what-ifs
  if (s.civ.h.topEra < snapshotEra) snapshotEra = s.civ.h.topEra;
  if (s.civ.h.topEra > snapshotEra) {
    snapshotEra = s.civ.h.topEra;
    const title = `Start of the ${ERAS[snapshotEra]!.name}`;
    rewinds.push({ simYear: s.simYear, title, save: saveSimulation(s, title), era: true });
    // where memory is short only the most recent eras are kept
    const eraLimit = Math.max(3, rewindLimit - 2);
    while (rewinds.filter((r) => r.era).length > eraLimit) rewinds.splice(rewinds.findIndex((r) => r.era), 1);
    rewinds.sort((a, b) => a.simYear - b.simYear);
    post({ type: 'timeline', points: rewinds.map((r, index) => ({ index, simYear: r.simYear, title: r.title })) });
  }
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
  if (now - lastStats > 100) {
    post({ type: 'stats', stats: stats(s) });
    lastStats = now;
  }
  if (now - lastSpecies > 700 && s.stage === 'animals') {
    lastSpecies = now;
    post({ type: 'species', species: speciesList(s) });
    if (s.civ.settlements.length) {
      post({ type: 'settlements', settlements: s.civ.settlements.map((t) => ({ id: t.id, name: t.name, cell: t.cell, species: t.species, pop: t.pop, tech: t.tech, founded: t.founded, belief: t.belief, eventId: t.eventId, nation: t.nation, ruined: t.ruined, temple: t.temple, farms: t.farms })) , nations: nationList(s) });
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
        sim = new Simulation(msg.seed, msg.gridN);
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
        historyOverride = !!sim && sim.civ.historyActive && SPEEDS[speedIndex]!.yearsPerSecond > HISTORY_YPS;
        slowUntil = 0;
        break;
      case 'requestCells':
        cellsRequested = true;
        break;
      case 'settings':
        if (msg.slowOnEvents !== undefined) slowOnEvents = msg.slowOnEvents;
        break;
      case 'god':
        if (sim) {
          if (msg.tool === 'species' && msg.genes) sim.designSpecies(msg.cell, msg.genes);
          else sim.god(msg.tool, msg.cell, msg.power ?? 0.8);
          slowUntil = performance.now() + 6000;
          cellsRequested = true;
        }
        break;
      case 'save':
        if (sim) post({ type: 'saved', slot: msg.slot, save: saveSimulation(sim, msg.name) });
        break;
      case 'load': {
        const save = msg.save as SaveState;
        sim = new Simulation(save.seed, save.gridN);
        loadSimulation(sim, save);
        if (msg.diverge) sim.diverge();
        snapshotEra = sim.civ.h.topEra; wasHistory = sim.civ.historyActive; historyOverride = false;
        sim.events.drainFresh();
        sentExtinct.clear();
        speciesVersion = -1;
        plantVersion = -1;
        lastSpecies = 0;
        const { cells, transfer } = snapshotCells(sim);
        post({ type: 'loaded', cells, stats: stats(sim), events: sim.events.events }, transfer);
        break;
      }
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
        sim = new Simulation(point.save.seed, point.save.gridN);
        loadSimulation(sim, point.save);
        snapshotEra = sim.civ.h.topEra; wasHistory = sim.civ.historyActive; historyOverride = false;
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
        if (sim) {
          const end = sim.simYear + msg.years;
          const had = sim.civ.historyActive;
          // a jump through time stops where history begins (unless it began before the jump): that is the part worth watching
          while (sim.simYear < end) { sim.step(15000); if (!had && sim.civ.historyActive) break; }
          cellsRequested = true;
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
    tick();
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
}, 1000 / TICK_HZ);
