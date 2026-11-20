// Message protocol between the simulation worker and the main thread.
import type { SimEvent } from '../sim/events';

export const SPEEDS = [
  { key: 'pause', label: 'Pause', yearsPerSecond: 0 },
  { key: '1x', label: '1x', yearsPerSecond: 1 / 365 },
  { key: '10x', label: '10x', yearsPerSecond: 1 },
  // the pace of history: a reign passes in about a second, an era in a minute or two
  { key: 'history', label: 'History', yearsPerSecond: 25 },
  { key: '100x', label: '100x', yearsPerSecond: 30_000 },
  { key: '1000x', label: '1000x', yearsPerSecond: 100_000 },
  { key: 'epoch', label: 'Epoch', yearsPerSecond: 300_000 },
] as const;
export type SpeedIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Index of the speed history is watched at. */
export const HISTORY_SPEED = 3;

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
  /** Ground worn by migrating herds, 0..1. */
  trail: Float32Array;
  fields: Float32Array;
  reef: Float32Array;
  bloom: Float32Array;
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
  /** A history is unfolding (at least one nation exists). */
  history?: boolean;
  /** The year the long peace began (nations live on, history is no longer made), or -1. */
  longPeace?: number;
  /** Time is being held at the pace of history instead of the chosen speed. */
  historyHeld?: boolean;
  /** Year history began, or -1. */
  historyBegan?: number;
  /** Highest era any nation has reached. */
  topEra?: number;
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
  /** Cells at the centres of cyclones (hurricanes and the eternal storm), for the renderer's spiral cloud bands. */
  cyclones: number[];
  /** Brightness of the star relative to today (1 = normal); the aurora follows it. */
  solar: number;
  settlements: number;
  maxTech: number;
  /** Arms race: mean toxicity of land plants and mean toxin resistance of animals. */
  plantToxin: number;
  toxinResist: number;
  moons: number;
  ring: boolean;
  binary: boolean;
  oldestTreeCell: number;
  civMusic: boolean;
  monoliths: number[];
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
  /** Has raised a temple (after the sky has meddled often enough). */
  temple?: boolean;
  farms?: boolean;
  /** Nation it belongs to, or -1 while it is a camp outside history. */
  nation?: number;
  /** Something here was built with a technique its people have forgotten: the plain name of it (system E5). */
  relic?: string;
}

/** A nation as the simulation keeps it. */
export interface NationInfo {
  id: number; name: string; species: number; capital: number; founded: number; ended: number; parent: number;
  government: string; stability: number; tech: number; era: number; eraName: string; hue: number;
  /** The age in the nation's own tongue, and what it compares to on Earth. */
  eraOwn: string; earth: string;
  /** People, in thousands, and number of towns. */
  pop: number; towns: number;
  culture: string; language: string;
  ruler: string; rulerSince: number; house: string; houseReigns: number;
  eventId: number;
}

/** One need of the tech web as one nation stands toward it. */
export interface TechCell {
  slot: string; field: string; level: number; era: number;
  /** 0 not yet discovered, 1 discovered, 2 its land allows no way to it. */
  state: number;
  /** The invention that meets the need (the way this nation found, or would find), in plain words and in its own language. */
  name: string; own: string;
  /** Year of discovery, when discovered. */
  year: number;
  key: boolean;
}

/** One of the people on a nation's record. */
export interface PersonInfo {
  id: number; name: string;
  /** 'ruler', 'founder', 'inventor', 'prophet', 'general', 'explorer', 'artist' or 'scholar'. */
  role: string;
  born: number;
  /** Year of death, or -1 while alive. */
  died: number;
  fate: string;
  /** Temperament, each 0..1. */
  bold: number; wise: number; cruel: number; pious: number;
  /** The age their nation was in when they rose: it sets the style of the portrait. */
  era: number;
  /** The ruler they served and a rival, by name ('' if none). */
  patron: string; rival: string;
  house: string;
  /** What they are remembered for: the title and id of the first event they are tied to. */
  deed: string; eventId: number;
}

/** Everything about one nation that is too big to send all the time. */
export interface NationDetail {
  id: number; name: string; land: string[];
  /** The species of its people. */
  species: number;
  /** Its people on record: the reigning ruler and the founder first, then the others, latest first. */
  people: PersonInfo[];
  tech: TechCell[];
  /** Its rulers on record, oldest first. */
  rulers: { name: string; from: number; to: number; fate: string; house: string }[];
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
  | { type: 'god'; tool: string; cell: number; power?: number; genes?: number[] }
  | { type: 'settings'; slowOnEvents?: boolean }
  | { type: 'save'; name: string; slot: string }
  | { type: 'rewind'; index: number }
  | { type: 'fork' }
  | { type: 'load'; save: unknown; diverge?: boolean }
  | { type: 'requestLayer'; kind: 'diversity' | 'oxygen' }
  | { type: 'requestNation'; id: number }
  | { type: 'rewindLimit'; count: number }
  /** Jump ahead by running the sim flat out (used by automated checks). */
  /** Jump ahead. It stops where a history begins, unless `through` is set (for scripts that need to reach a date). */
  | { type: 'warp'; years: number; through?: boolean };

export type FromWorker =
  | { type: 'ready'; seed: string; gridN: number; tilt: number; cells: CellSnapshot; stats: WorldStats }
  | { type: 'cells'; cells: CellSnapshot }
  | { type: 'stats'; stats: WorldStats }
  | { type: 'events'; events: SimEvent[] }
  | { type: 'species'; species: SpeciesInfo[] }
  | { type: 'plants'; plants: PlantInfo[] }
  | { type: 'herds'; herds: HerdSnapshot }
  | { type: 'saved'; slot: string; save: unknown }
  | { type: 'layer'; kind: 'diversity' | 'oxygen'; values: Float32Array }
  | { type: 'nation'; detail: NationDetail }
  | { type: 'settlements'; settlements: SettlementInfo[]; nations?: NationInfo[] }
  | { type: 'timeline'; points: TimelinePoint[] }
  | { type: 'loaded'; cells: CellSnapshot; stats: WorldStats; events: SimEvent[] }
  | { type: 'error'; message: string };
