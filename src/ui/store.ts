// Tiny observable store shared by the Preact UI and the app.
import { useEffect, useState } from 'preact/hooks';
import type { SimEvent } from '../sim/events';
import type { DynastyDetail, LanguageInfo, SiteDetail, NationDetail, NationInfo, PlantInfo, SettlementInfo, SpeciesInfo, TimelinePoint, WorldStats } from '../shared/protocol';
import type { Nation } from '../render/gfx/nations';
import type { GoalRecord, GoalState } from '../game/goals';
import type { CosmosInfo } from '../sim/cosmos';
import type { Archive, StarMessage } from '../sim/legacy';
import type { LinkInfo } from '../sim/link';
import type { StrangeInfo } from '../sim/strange';
import type { FutureInfo } from '../sim/future';
import type { IndustryInfo } from '../sim/industry';
import type { Article, Atlas, IndexGroup, Lane, PastPlace, Records, Ref, Step } from '../sim/memory';
import type { MemoryAsk } from '../shared/protocol';
import type { ForecastInfo } from '../sim/forecast';

export type Panel = 'none' | 'chronicle' | 'tree' | 'help' | 'tools' | 'settings' | 'guide' | 'peoples' | 'graphs' | 'designer' | 'map' | 'section' | 'nation' | 'dynasty' | 'site' | 'tongues' | 'goals' | 'system' | 'microscope' | 'archive';
export type MemoryTab = 'archive' | 'atlas' | 'braid' | 'records' | 'ancestry' | 'chronoscope' | 'forecasts';
export type Overlay = 'none' | 'temp' | 'rain' | 'life' | 'people' | 'fossils' | 'nations' | 'fungal' | 'diversity' | 'oxygen';

/** One person in an individual's family tree; key is set when that relative is drawn in the world and can be selected. */
export interface Relative { name: string; key: number | null; }
export interface FamilyTree { self: string; parents: [string, string]; grandparents: [string, string, string, string]; siblings: Relative[]; young: Relative[]; }
/** The other future, when the timeline has been forked and both are running. */
export interface OtherFuture { stats: WorldStats | null; events: SimEvent[]; forkedAt: number; }

export interface UIState {
  stats: WorldStats | null;
  speedIndex: number;
  lastSpeedIndex: number;
  seed: string;
  backend: string;
  fps: number;
  opening: boolean;
  skipVisible: boolean;
  uiHidden: boolean;
  postcard: boolean;
  chronicleLine: string;
  /** All events by id (sparse until received). */
  events: SimEvent[];
  /** Ids of events worth narrating, oldest first. */
  chronicle: number[];
  species: Map<number, SpeciesInfo>;
  plants: Map<number, PlantInfo>;
  panel: Panel;
  /** Event shown in the "Why did this happen?" panel. */
  whyEvent: number;
  selectedSpecies: number;
  /** The individual creature selected or followed. */
  creature: { key: number; species: number; name: string; age: string; action: string; following: boolean } | null;
  milestone: SimEvent | null;
  notice: string;
  tool: string;
  slowOnEvents: boolean;
  hintStep: number;
  mobile: boolean;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  musicVolume: number;
  soundVolume: number;
  reducedMotion: boolean;
  slots: SlotInfo[];
  settlements: SettlementInfo[];
  /** Nations derived from the settlements (name, colours, emblem), for the Night Map and the Peoples panel. */
  nations: Nation[];
  /** Nations as the simulation keeps them: rulers, houses, eras. */
  realms: NationInfo[];
  /** The nation whose knowledge and rulers are being looked at, when it has arrived. */
  nationDetail: NationDetail | null;
  /** The record (expansion Section 6): which view is open, and what the simulation has answered for each. */
  memTab: MemoryTab;
  memIndex: IndexGroup[] | null;
  memArticle: Article | null;
  /** Articles opened on the way here, oldest first: the last one is the one being read. */
  memTrail: Ref[];
  memAtlas: Atlas | null;
  memBraid: { from: number; to: number; lanes: Lane[] } | null;
  memRecords: Records | null;
  memAncestry: { name: string; town: string; steps: Step[] } | null;
  /** The chronoscope: the town being looked at and the year its dial is set to; and that town as it then stood. */
  chrono: { id: number; year: number } | null;
  memPlace: PastPlace | null;
  memForecasts: ForecastInfo | null;
  /** The town site whose layers are open (system E17). */
  siteDetail: SiteDetail | null;
  /** The ruling house whose family tree is open. */
  dynastyDetail: DynastyDetail | null;
  /** The languages of the world, when they have arrived (system E21), and the one being looked at (its id, or -1 for the most spoken). */
  languages: { lexicon: string[]; sayings: string[]; list: LanguageInfo[] } | null;
  tongue: number;
  timeline: TimelinePoint[];
  /** Set while two futures run side by side. */
  other: OtherFuture | null;
  overlay: Overlay;
  colorblind: boolean;
  /** Show "comparable to Earth around ..." beside the names of ages. */
  earthNotes: boolean;
  /** An age has just begun somewhere for the first time: shown as a banner for a few seconds. */
  eraBanner: { title: string; nation: string; own: string; earth: string; year: number } | null;
  /** When on, the experiment tools are locked and the world runs untouched. */
  handsOff: boolean;
  /** Documentary director: the camera flies to whatever just happened. */
  director: boolean;
  /** Samples of world history for the graphs. */
  history: { year: number; temp: number; oxygen: number; species: number; pop: number; land: number; toxin: number; resist: number }[];
  /** Genes of the species being designed (index -> value), merged over defaults. */
  design: Record<number, number>;
  photoFilter: string;
  recording: boolean;
  /** Optional goals: how each stands in this world, what has been reached on any world, and the one kept on screen. */
  goals: GoalState[];
  goalsDone: GoalRecord['done'];
  goalTracked: string;
  /** The star system and what has come from or gone beyond it. */
  cosmos: CosmosInfo | null;
  /** What peoples have sent to the stars, the archives they left, and the message being shown over the globe just now. */
  skyMessages: StarMessage[];
  archives: Archive[];
  skyMessage: { id: number; until: number } | null;
  /** The linked second world, if there is one. */
  link: LinkInfo | null;
  /** Strata, the magnetic field, microbes under the camera, the hive mind, the swarm (expansion section 9). */
  strange: StrangeInfo | null;
  /** What a people has done beyond the space age (expansion section 8). */
  future: FutureInfo | null;
  /** Fuel fields and what an industrial people has done (expansion section 7). */
  industry: IndustryInfo | null;
  /** The heartbeat is heard as well as seen. */
  pulseSound: boolean;
}

export interface SlotInfo { slot: number; name: string; seed: string; simYear: number; savedAt: number; }

export const state: UIState = {
  stats: null,
  speedIndex: 0,
  lastSpeedIndex: 3,
  seed: '',
  backend: '',
  fps: 60,
  opening: true,
  skipVisible: false,
  uiHidden: false,
  postcard: false,
  chronicleLine: '',
  events: [],
  chronicle: [],
  species: new Map(),
  plants: new Map(),
  panel: 'none',
  whyEvent: -1,
  selectedSpecies: -1,
  creature: null,
  milestone: null,
  notice: '',
  tool: '',
  slowOnEvents: true,
  hintStep: 0,
  mobile: false,
  quality: 'high',
  musicVolume: 0.6,
  soundVolume: 0.7,
  reducedMotion: false,
  slots: [],
  settlements: [],
  nations: [],
  realms: [],
  nationDetail: null,
  dynastyDetail: null,
  languages: null,
  tongue: -1,
  siteDetail: null,
  memTab: 'archive',
  memIndex: null,
  memArticle: null,
  memTrail: [],
  memAtlas: null,
  memBraid: null,
  memRecords: null,
  memAncestry: null,
  chrono: null,
  memPlace: null,
  memForecasts: null,
  timeline: [],
  other: null,
  overlay: 'none',
  colorblind: false,
  earthNotes: false,
  eraBanner: null,
  handsOff: false,
  director: false,
  history: [],
  design: {},
  photoFilter: 'none',
  recording: false,
  goals: [],
  goalsDone: {},
  goalTracked: '',
  cosmos: null,
  skyMessages: [],
  archives: [],
  skyMessage: null,
  link: null,
  strange: null,
  future: null,
  industry: null,
  pulseSound: true,
};

const listeners = new Set<() => void>();
let scheduled = false;

export function update(patch: Partial<UIState>): void {
  Object.assign(state, patch);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const l of listeners) l();
  });
}

export function useStore(): UIState {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

/** Actions the UI can call; filled in by main.ts. */
export const actions = {
  setSpeed: (_index: number) => {},
  togglePause: () => {},
  skipOpening: () => {},
  flyToCell: (_cell: number, _dist?: number) => {},
  selectSpecies: (_id: number) => {},
  setSlowOnEvents: (_on: boolean) => {},
  copySeedLink: () => {},
  newWorld: (_seed?: string) => {},
  followCreature: (_on: boolean) => {},
  setQuality: (_q: UIState['quality']) => {},
  setMusicVolume: (_v: number) => {},
  setSoundVolume: (_v: number) => {},
  setReducedMotion: (_on: boolean) => {},
  saveSlot: (_name: string) => {},
  loadSlot: (_slot: number) => {},
  deleteSlot: (_slot: number) => {},
  setOverlay: (_o: Overlay) => {},
  setColorblind: (_on: boolean) => {},
  rewind: (_index: number) => {},
  drawMap: (_canvas: HTMLCanvasElement) => {},
  mapClick: (_u: number, _v: number) => {},
  /** Where a cell lies on the flat map, as fractions of its width and height. */
  mapPoint: (_cell: number): [number, number] => [0, 0],
  setPhotoFilter: (_f: string) => {},
  savePhoto: () => {},
  toggleRecording: () => {},
  saveGif: () => {},
  exportBook: () => {},
  drawSection: (_canvas: HTMLCanvasElement) => {},
  familyOf: (_key: number): string[] => [],
  familyTree: (_key: number): FamilyTree | null => null,
  /** Open the knowledge and rulers of a nation (by the simulation's nation id). */
  openNation: (_id: number) => {},
  openDynasty: (_id: number) => {},
  /** Put a question to the record; the answer arrives in the store. */
  askMemory: (_ask: MemoryAsk) => {},
  /** Open the archive at an article, remembering the way back. */
  openArticle: (_ref: Ref) => {},
  /** Set the chronoscope's dial for a town (null puts the town back in the present). */
  setChrono: (_id: number, _year: number | null) => {},
  /** The flat map of the present with no towns marked, for drawing the past over. */
  drawBareMap: (_canvas: HTMLCanvasElement) => {},
  /** Open the languages of the world, at one of them if its name is given. */
  openLanguages: (_name?: string) => {},
  /** Open the dig view of a town's site. */
  openSite: (_id: number) => {},
  /** How a town's builders build and of what, in a sentence. */
  architecture: (_st: SettlementInfo): string => '',
  /** What is being built in a town just now, if it is in view from close by. */
  construction: (_id: number): { what: string; progress: number; years: number; stage: string }[] => [],
  /** Fly to a town and replay its growth. */
  timelapse: (_id: number, _cell: number) => {},
  setEarthNotes: (_on: boolean) => {},
  selectCreatureKey: (_key: number) => {},
  /** Swap places with the other future, or stop running it. */
  /** Keep one goal on screen while playing ('' for none), or forget every goal reached. */
  setPulseSound: (_on: boolean) => {},
  trackGoal: (_id: string) => {},
  resetGoals: () => {},
  crossOver: () => {},
  endOtherFuture: () => {},
  fork: () => {},
  /** Screen position of a direction on the globe: [x, y, visible 0..1]. */
  project: (_x: number, _y: number, _z: number): [number, number, number] => [0, 0, 0],
  /** Direction of a cell on the globe. */
  cellDir: (_cell: number): [number, number, number] => [0, 1, 0],
  /** The planet's disc on screen: centre x, y and radius in pixels. */
  disc: (): [number, number, number] => [0, 0, 1e9],
};

export function togglePanel(p: Panel): void {
  update({ panel: state.panel === p ? 'none' : p });
}
