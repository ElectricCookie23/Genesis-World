/// <reference lib="webworker" />
// Worker entry point: owns all world state and runs the fixed-timestep loop.
import { Simulation } from './simulation';
import { G, P, sizeMetres } from './genetics';
import {
  SPEEDS, type CellSnapshot, type FromWorker, type PlantInfo, type SpeciesInfo, type ToWorker, type WorldStats,
} from '../shared/protocol';

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
    cells.vegetation.buffer, cells.snow.buffer, cells.cloud.buffer, cells.ash.buffer, cells.lava.buffer,
    cells.canopy.buffer, cells.flora.buffer, cells.flow.buffer, cells.downhill.buffer, cells.windE.buffer, cells.windN.buffer,
  ];
  return { cells, transfer };
}

function currentYps(): number {
  const yps = SPEEDS[speedIndex]!.yearsPerSecond;
  return performance.now() < slowUntil ? Math.min(yps, SLOW_YPS) : yps;
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
    tickMs,
    stage: s.stage,
    era: s.era.kind,
    oxygen: s.plants.oxygen,
    livingSpecies: s.creatures.livingSpecies,
    totalSpecies: s.creatures.species.length,
    plantSpecies: s.plants.living,
    population: s.creatures.totalPop,
    landCover: s.plants.totalLandCover / Math.max(1, s.regions.count),
  };
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
  // slow time for a few seconds around big events so they can be seen
  if (slowOnEvents && s.bigEvent >= 2 && SPEEDS[speedIndex]!.yearsPerSecond > SLOW_YPS) slowUntil = start + (s.bigEvent >= 3 ? 5000 : 3000);
  const fresh = s.events.drainFresh();
  if (fresh.length) post({ type: 'events', events: fresh });
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
        slowUntil = 0;
        break;
      case 'requestCells':
        cellsRequested = true;
        break;
      case 'settings':
        if (msg.slowOnEvents !== undefined) slowOnEvents = msg.slowOnEvents;
        break;
      case 'god':
        if (sim && msg.tool === 'meteor') {
          sim.meteor(msg.cell, msg.power ?? 0.8, true);
          slowUntil = performance.now() + 6000;
          cellsRequested = true;
        }
        break;
      case 'warp':
        if (sim) {
          const end = sim.simYear + msg.years;
          while (sim.simYear < end) sim.step(15000);
          cellsRequested = true;
        }
        break;
      case 'focus':
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
