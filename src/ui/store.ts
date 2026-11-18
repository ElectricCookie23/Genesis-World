// Tiny observable store shared by the Preact UI and the app.
import { useEffect, useState } from 'preact/hooks';
import type { SimEvent } from '../sim/events';
import type { PlantInfo, SpeciesInfo, WorldStats } from '../shared/protocol';

export type Panel = 'none' | 'chronicle' | 'tree' | 'help' | 'god' | 'settings';

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
}

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
};

export function togglePanel(p: Panel): void {
  update({ panel: state.panel === p ? 'none' : p });
}
