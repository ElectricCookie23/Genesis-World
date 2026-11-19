// Message protocol between the simulation worker and the main thread.
import type { SimEvent } from '../sim/events';

export const SPEEDS = [
  { key: 'pause', label: 'Pause', yearsPerSecond: 0 },
  { key: '1x', label: '1x', yearsPerSecond: 1 / 365 },
  { key: '10x', label: '10x', yearsPerSecond: 1 },
  { key: '100x', label: '100x', yearsPerSecond: 30_000 },
  { key: '1000x', label: '1000x', yearsPerSecond: 100_000 },
  { key: 'epoch', label: 'Epoch', yearsPerSecond: 300_000 },
] as const;
export type SpeedIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** Per-cell fields posted to the renderer. Buffers are transferred, not copied. */
export interface CellSnapshot {
  simYear: number;
  seaLevel: number;
  /** Bit flags of what changed since the previous snapshot. */
  elevation: Float32Array;
  temperature: Float32Array;
  moisture: Float32Array;
  biome: Uint8Array;
  vegetation: Float32Array;
  snow: Float32Array;
  cloud: Float32Array;
  ash: Float32Array;
  lava: Float32Array;
  lights: Float32Array;
  fields: Float32Array;
  canopy: Float32Array;
  flora: Int32Array;
  flow: Float32Array;
  downhill: Int32Array;
  windE: Float32Array;
  windN: Float32Array;
  terrainChanged: boolean;
}

export interface WorldStats {
  simYear: number;
  yearFrac: number;
  meanTemp: number;
  globalOffset: number;
  iceFraction: number;
  seaLevel: number;
  oceanFraction: number;
  tilt: number;
  moonAngle: number;
  speedIndex: number;
  /** Actual years per second being simulated (may be reduced around big events). */
  yearsPerSecond: number;
  tickMs: number;
  stage: string;
  era: string;
  oxygen: number;
  livingSpecies: number;
  totalSpecies: number;
  plantSpecies: number;
  population: number;
  landCover: number;
  /** Cells under storm cells right now (lightning flickers there). */
  storms: number[];
  settlements: number;
  maxTech: number;
}

/** One animal species, as shown in the tree of life and info cards. */
export interface SpeciesInfo {
  id: number;
  name: string;
  parent: number;
  bornYear: number;
  extinctYear: number;
  pop: number;
  peakPop: number;
  regions: number;
  /** Fine cell at the heart of its range. */
  homeCell: number;
  eventId: number;
  /** Reference genome (GENE_COUNT floats). */
  genes: Float32Array;
  metres: number;
  land: number;
  fly: number;
}

export interface PlantInfo {
  id: number;
  name: string;
  parent: number;
  genes: Float32Array;
  aquatic: boolean;
  extinct: boolean;
  cover: number;
}

export interface SettlementInfo {
  id: number; name: string; cell: number; species: number; pop: number; tech: number; founded: number; belief: number; eventId: number; ruined: number;
}

/** A point in history the user can rewind to. */
export interface TimelinePoint { index: number; simYear: number; title: string; }

/** Populations in the regions around the camera focus, for drawing individuals. */
export interface HerdSnapshot {
  /** Per cohort: region index, species id, head count, fraction of time on land, flight ability, how well fed. */
  region: Int32Array;
  species: Int32Array;
  count: Float32Array;
  land: Float32Array;
  fly: Float32Array;
  fed: Float32Array;
}

export type ToWorker =
  | { type: 'init'; seed: string; gridN?: number }
  | { type: 'speed'; index: number }
  | { type: 'focus'; x: number; y: number; z: number; altitude: number }
  | { type: 'requestCells' }
  | { type: 'god'; tool: string; cell: number; power?: number }
  | { type: 'settings'; slowOnEvents?: boolean }
  | { type: 'save'; name: string; slot: string }
  | { type: 'rewind'; index: number }
  | { type: 'load'; save: unknown }
  /** Jump ahead by running the sim flat out (used by automated checks). */
  | { type: 'warp'; years: number };

export type FromWorker =
  | { type: 'ready'; seed: string; gridN: number; tilt: number; cells: CellSnapshot; stats: WorldStats }
  | { type: 'cells'; cells: CellSnapshot }
  | { type: 'stats'; stats: WorldStats }
  | { type: 'events'; events: SimEvent[] }
  | { type: 'species'; species: SpeciesInfo[] }
  | { type: 'plants'; plants: PlantInfo[] }
  | { type: 'herds'; herds: HerdSnapshot }
  | { type: 'saved'; slot: string; save: unknown }
  | { type: 'settlements'; settlements: SettlementInfo[] }
  | { type: 'timeline'; points: TimelinePoint[] }
  | { type: 'loaded'; cells: CellSnapshot; stats: WorldStats; events: SimEvent[] }
  | { type: 'error'; message: string };
