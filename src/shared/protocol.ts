// Message protocol between the simulation worker and the main thread.
import type { SimEvent } from '../sim/events';
import type { CosmosInfo } from '../sim/cosmos';
import type { Archive, ObserverMessage } from '../sim/legacy';
import type { LinkInfo } from '../sim/link';

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
  /** How much larger than in its prime the star looks (1 until it leaves its long steady life), and 0 steady, 1 swelling, 2 red giant. */
  starSwell?: number;
  starPhase?: number;
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

/** A wonder as the page sees it (system E19): what it is, who raised it and when, and the event that inspired it. */
export interface WonderInfo {
  id: number;
  /** One of the kinds in `WONDER_KINDS` (sim/history/model.ts). */
  kind: string;
  name: string; what: string; why: string;
  /** The country that raised it (its name), the year work began and the year it was or will be finished. */
  builder: string; year: number; done: number;
  /** The event of its raising, the event that inspired it and that event's title. */
  eventId: number; cause: number; causeTitle: string;
  /** The cell it faces (-1 if none) and the bearing of its long axis, radians east of north (NaN if not fixed). */
  toward: number; bearing: number;
}

export interface SettlementInfo {
  id: number; name: string; cell: number; species: number; pop: number; tech: number; founded: number; belief: number; eventId: number; ruined: number;
  /** Has raised a temple (after the sky has meddled often enough). */
  temple?: boolean;
  /** Great works raised here in golden ages. */
  monuments?: number;
  /** The wonders that stand here, or are being built (system E19). */
  wonders?: WonderInfo[];
  /** Its walls, oldest first, as pairs: the people it held (thousands) and what it knew when each was built. */
  walls?: number[];
  /** Founded by settlers who came by sea. */
  overseas?: boolean;
  /** The most people it ever held (thousands): how large its ruin is. After it was left: the name of the tame animal that runs wild in it and of the animal that nests in its towers ('' if none) (system E18). */
  peak?: number;
  feral?: string;
  nesting?: string;
  /** How many layers lie in the ground here, counting the ruins it stands on (system E17). */
  layers?: number;
  /** Has dammed a river; works a mine (system E16). */
  dam?: boolean;
  mine?: boolean;
  /** What joins it to other towns (system E15), as pairs: the other town's id and the kind of network (0 road, 1 aqueduct, 2 canal, 3 railway, 4 telegraph, 5 pipeline, 6 power line). */
  links?: number[];
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
  /** Id of the ruling house, or -1. */
  houseId: number;
  /** The kinds of network its towns are joined by (system E15), as a list of kind numbers in the order it first built them. */
  networks: number[];
  /** Its culture's number, the culture it borrows its building fashions from (-1 if none) and how much it borrows, 0..1 (system E14). */
  cultureId: number; fashionFrom: number; fashionShare: number;
  /** What its people call its golden age while one lasts ('' otherwise), the year it began, and its great works so far (system E10). */
  golden: string; goldenSince: number; goldenWorks: number;
  /** Its count of years (system E8): what Year 1 remembers, the same in its own tongue, the sim year that is Year 1, and the event it is tied to. */
  calendar: string; calendarOwn: string; calendarEpoch: number; calendarEvent: number;
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
  house: string; houseId: number;
  /** What they are remembered for: the title and id of the first event they are tied to. */
  deed: string; eventId: number;
}

/** One layer in the ground of a town site (system E17), as the dig view shows it. */
export interface SiteLayer {
  year: number;
  /** 'camp', 'village', 'town', 'city', 'great city', 'burnt', 'flood', 'ash', 'shaken', 'decay' or 'abandoned'. */
  kind: string;
  tech: number;
  /** The event behind it ('' if none), and its id (-1 if none). */
  cause: string; eventId: number;
}

/** Everything in the ground at one site: the towns that stood there, oldest first, each with its layers. */
export interface SiteDetail {
  id: number; cell: number; layers: number;
  towns: { id: number; name: string; people: string; species: number; founded: number; ruined: number; strata: SiteLayer[] }[];
}

/** One member of a ruling house, for its family tree. */
export interface HouseMember {
  id: number; name: string; role: string;
  /** Parent among the members shown, or -1. */
  parent: number;
  /** Generation, counted from the first of the house shown. */
  gen: number;
  born: number; died: number; fate: string;
  /** Years of rule (from, to; to is -1 while reigning), or -1 and -1 for one who never ruled. */
  reignFrom: number; reignTo: number;
  /** The nation they ruled or lived in. */
  nation: string;
  /** Husband or wife, and the house they came from ('' if none on record). */
  spouse: string; spouseHouse: string;
  /** A throne they could claim through a parent ('' if none). */
  claim: string;
  /** Wars and civil wars that began in their reign: titles, oldest first (at most four). */
  wars: string[];
  era: number; bold: number; cruel: number;
}

/** A ruling house and its family tree (system E7). */
export interface DynastyDetail {
  id: number; name: string; nation: number; nationName: string; species: number;
  founded: number; ended: number; reigns: number; generations: number;
  /** The house it is a branch of ('' if none), and that house's id (-1 if none). */
  branchOf: string; branchId: number;
  /** Houses that branched from this one. */
  branches: { id: number; name: string; nation: string }[];
  members: HouseMember[];
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
  rulers: { name: string; from: number; to: number; fate: string; house: string; houseId: number }[];
  /** Its ruling houses, latest first. */
  houses: { id: number; name: string; founded: number; ended: number; reigns: number; generations: number }[];
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
  | { type: 'init'; seed: string; gridN?: number; neighbor?: string }
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
  | { type: 'requestDynasty'; id: number }
  | { type: 'requestSite'; id: number }
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
  | { type: 'dynasty'; detail: DynastyDetail }
  | { type: 'site'; detail: SiteDetail }
  | { type: 'settlements'; settlements: SettlementInfo[]; nations?: NationInfo[] }
  | { type: 'timeline'; points: TimelinePoint[] }
  | { type: 'cosmos'; cosmos: CosmosInfo; messages: ObserverMessage[]; archives: Archive[]; link?: LinkInfo }
  | { type: 'loaded'; cells: CellSnapshot; stats: WorldStats; events: SimEvent[] }
  | { type: 'error'; message: string };
