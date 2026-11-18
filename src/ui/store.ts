// Tiny observable store shared by the Preact UI and the app.
import { useEffect, useState } from 'preact/hooks';
import type { SimEvent } from '../sim/events';
import type { WorldStats } from '../shared/protocol';

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
  events: SimEvent[];
  notice: string;
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
  notice: '',
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
};
