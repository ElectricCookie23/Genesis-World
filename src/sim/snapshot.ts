// Saving and restoring the whole simulation. A save holds only what changes over time;
// everything derived from the seed (grid, regions, noise) is rebuilt when loading.
import type { Simulation } from './simulation';

/** Static or derived members that are rebuilt from the seed and must not be saved. */
const SKIP = new Set(['grid', 'regions', 'reg', 'regionStart', 'regionList', 'regionFill', 'scratch', 'prof', 'neighbors', 'ncount', 'tris', 'pos', 'lat', 'lon']);
/** Shared references that are saved once elsewhere. */
const SKIP_IN: Record<string, Set<string>> = { creatures: new Set(['plants']) };

type Plain = Record<string, unknown>;

function isTyped(v: unknown): v is Float32Array {
  return ArrayBuffer.isView(v) && !(v instanceof DataView);
}

function capture(obj: object, path: string, seen: WeakSet<object>): Plain {
  const out: Plain = {};
  seen.add(obj);
  for (const key of Object.keys(obj)) {
    if (SKIP.has(key) || SKIP_IN[path]?.has(key)) continue;
    const v = (obj as Plain)[key];
    if (typeof v === 'function') continue;
    if (v === null || typeof v !== 'object') out[key] = v;
    else if (isTyped(v)) out[key] = (v as Float32Array).slice();
    else if (Array.isArray(v) || v instanceof Map || v instanceof Set) out[key] = v;
    else if (!seen.has(v)) out[key] = { __nested: capture(v, key, seen) };
  }
  return out;
}

function restore(target: object, data: Plain): void {
  for (const key of Object.keys(data)) {
    const v = data[key];
    const cur = (target as Plain)[key];
    if (v !== null && typeof v === 'object' && '__nested' in (v as Plain)) {
      if (cur && typeof cur === 'object') restore(cur, (v as { __nested: Plain }).__nested);
      // (a record that a fresh world does not have yet, such as one made later in a history, is built here)
      else { const made: Plain = {}; restore(made, (v as { __nested: Plain }).__nested); (target as Plain)[key] = made; }
    } else if (isTyped(v) && isTyped(cur) && cur.length === v.length) (cur as Float32Array).set(v);
    else (target as Plain)[key] = v;
  }
}

export interface SaveState {
  version: number;
  seed: string;
  gridN: number;
  simYear: number;
  savedAt: number;
  name: string;
  data: Plain;
}

export const SAVE_VERSION = 1;

/** A structured-cloneable copy of the simulation's changing state. */
export function saveSimulation(sim: Simulation, name = ''): SaveState {
  const data = capture(sim, 'sim', new WeakSet());
  // structuredClone deep-copies arrays of species, events and so on, so the save is detached from the live sim
  return structuredClone({ version: SAVE_VERSION, seed: sim.seed, gridN: sim.grid.n, simYear: sim.simYear, savedAt: Date.now(), name, data });
}

/** Overwrite a freshly built simulation (same seed) with saved state. */
export function loadSimulation(sim: Simulation, save: SaveState): void {
  if (save.version !== SAVE_VERSION) throw new Error('This save is from a different version of Genesis.');
  if (save.seed !== sim.seed) throw new Error('Save and world seeds differ.');
  restore(sim, structuredClone(save.data));
  // region summaries are derived, not saved: without this a loaded world ran on year-zero summaries until its next ecology step
  sim.refreshDerived();
  sim.terrainDirty = true;
}
