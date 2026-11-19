// Tiny observable store shared by the Preact UI and the app.
import { useEffect, useState } from 'preact/hooks';
import type { SimEvent } from '../sim/events';
import type { PlantInfo, SettlementInfo, SpeciesInfo, TimelinePoint, WorldStats } from '../shared/protocol';
import type { Nation } from '../render/gfx/nations';

export type Panel = 'none' | 'chronicle' | 'tree' | 'help' | 'god' | 'settings' | 'guide' | 'peoples' | 'graphs' | 'designer' | 'map' | 'section';
export type Overlay = 'none' | 'temp' | 'rain' | 'life' | 'people' | 'fossils' | 'nations';

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
  timeline: TimelinePoint[];
  overlay: Overlay;
  colorblind: boolean;
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
  timeline: [],
  overlay: 'none',
  colorblind: false,
  handsOff: false,
  director: false,
  history: [],
  design: {},
  photoFilter: 'none',
  recording: false,
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
  setPhotoFilter: (_f: string) => {},
  savePhoto: () => {},
  toggleRecording: () => {},
  saveGif: () => {},
  exportBook: () => {},
  drawSection: (_canvas: HTMLCanvasElement) => {},
  familyOf: (_key: number): string[] => [],
  fork: () => {},
  /** Screen position of a direction on the globe: [x, y, visible 0..1]. */
  project: (_x: number, _y: number, _z: number): [number, number, number] => [0, 0, 0],
};

export function togglePanel(p: Panel): void {
  update({ panel: state.panel === p ? 'none' : p });
}
