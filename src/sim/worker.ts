/// <reference lib="webworker" />
// Worker entry point: owns all world state and runs the fixed-timestep loop.
import { Simulation } from './simulation';
import { SPEEDS, type CellSnapshot, type FromWorker, type ToWorker, type WorldStats } from '../shared/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const TICK_HZ = 20;
let sim: Simulation | null = null;
let speedIndex = 0;
let lastCells = 0;
let lastStats = 0;
let tickMs = 0;
let cellsRequested = false;

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
    flow: w.flow.slice(),
    downhill: w.downhill.slice(),
    windE: w.windE.slice(),
    windN: w.windN.slice(),
    terrainChanged: s.terrainDirty,
  };
  s.terrainDirty = false;
  const transfer = [
    cells.elevation.buffer, cells.temperature.buffer, cells.moisture.buffer, cells.biome.buffer,
    cells.vegetation.buffer, cells.snow.buffer, cells.cloud.buffer, cells.ash.buffer,
    cells.flow.buffer, cells.downhill.buffer, cells.windE.buffer, cells.windN.buffer,
  ];
  return { cells, transfer };
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
    yearsPerSecond: SPEEDS[speedIndex]!.yearsPerSecond,
    tickMs,
  };
}

function tick(): void {
  const s = sim;
  if (!s) return;
  const start = performance.now();
  const yps = SPEEDS[speedIndex]!.yearsPerSecond;
  if (yps > 0) s.step(yps / TICK_HZ);
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
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init': {
        sim = new Simulation(msg.seed, msg.gridN);
        const { cells, transfer } = snapshotCells(sim);
        post({ type: 'ready', seed: msg.seed, gridN: sim.grid.n, tilt: sim.climate.tilt, cells, stats: stats(sim) }, transfer);
        const fresh = sim.events.drainFresh();
        if (fresh.length) post({ type: 'events', events: fresh });
        break;
      }
      case 'speed':
        speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, msg.index));
        break;
      case 'requestCells':
        cellsRequested = true;
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
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}, 1000 / TICK_HZ);
