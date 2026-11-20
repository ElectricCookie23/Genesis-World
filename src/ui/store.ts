// Tiny observable store shared by the Preact UI and the app.
import { useEffect, useState } from 'preact/hooks';
import type { SimEvent } from '../sim/events';
import type { DynastyDetail, NationDetail, NationInfo, PlantInfo, SettlementInfo, SpeciesInfo, TimelinePoint, WorldStats } from '../shared/protocol';
import type { Nation } from '../render/gfx/nations';
import type { GoalRecord, GoalState } from '../game/goals';

export type Panel = 'none' | 'chronicle' | 'tree' | 'help' | 'god' | 'settings' | 'guide' | 'peoples' | 'graphs' | 'designer' | 'map' | 'section' | 'nation' | 'dynasty' | 'goals';
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
  godTool: string;
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
  /** The ruling house whose family tree is open. */
  dynastyDetail: DynastyDetail | null;
  timeline: TimelinePoint[];
  /** Set while two futures run side by side. */
  other: OtherFuture | null;
  overlay: Overlay;
  colorblind: boolean;
  /** Show "comparable to Earth around ..." beside the names of ages. */
  earthNotes: boolean;
  /** An age has just begun somewhere for the first time: shown as a banner for a few seconds. */
  eraBanner: { title: string; nation: string; own: string; earth: string; year: number } | null;
  /** When on, god tools are locked and the world runs untouched. */
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
  godTool: '',
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
  setEarthNotes: (_on: boolean) => {},
  selectCreatureKey: (_key: number) => {},
  /** Swap places with the other future, or stop running it. */
  /** Keep one goal on screen while playing ('' for none), or forget every goal reached. */
  trackGoal: (_id: string) => {},
  resetGoals: () => {},
  crossOver: () => {},
  endOtherFuture: () => {},
  fork: () => {},
  /** Screen position of a direction on the globe: [x, y, visible 0..1]. */
  project: (_x: number, _y: number, _z: number): [number, number, number] => [0, 0, 0],
  /** The planet's disc on screen: centre x, y and radius in pixels. */
  disc: (): [number, number, number] => [0, 0, 1e9],
};

export function togglePanel(p: Panel): void {
  update({ panel: state.panel === p ? 'none' : p });
}
