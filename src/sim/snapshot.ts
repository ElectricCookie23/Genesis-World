// Saving and restoring the whole simulation. A save holds only what changes over time;
// everything derived from the seed (grid, regions, noise) is rebuilt when loading.
import { Simulation } from './simulation';

/** Static or derived members that are rebuilt from the seed and must not be saved. */
const SKIP = new Set(['neighbor', 'grid', 'regions', 'reg', 'regionStart', 'regionList', 'regionFill', 'scratch', 'prof', 'neighbors', 'ncount', 'tris', 'pos', 'lat', 'lon']);
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
  /** The linked world (expansion E98), saved whole beside this one. */
  neighbor?: SaveState;
}

export const SAVE_VERSION = 1;

/** A structured-cloneable copy of the simulation's changing state. */
export function saveSimulation(sim: Simulation, name = ''): SaveState {
  const data = capture(sim, 'sim', new WeakSet());
  // structuredClone deep-copies arrays of species, events and so on, so the save is detached from the live sim
  const save: SaveState = structuredClone({ version: SAVE_VERSION, seed: sim.seed, gridN: sim.grid.n, simYear: sim.simYear, savedAt: Date.now(), name, data });
  if (sim.neighbor) save.neighbor = saveSimulation(sim.neighbor, name);
  return save;
}

/** A long list of small records kept as text: what `packSave` puts in its place. */
interface Packed { __packed: string; length: number }
const isPacked = (v: unknown): v is Packed => !!v && typeof v === 'object' && typeof (v as Packed).__packed === 'string';

/** Where a save's long lists of small records are: the event log, and the people on record. */
function longLists(data: Plain): { holder: Plain; key: string }[] {
  const nested = (v: unknown): Plain | undefined => (v && typeof v === 'object' && '__nested' in (v as Plain) ? (v as { __nested: Plain }).__nested : undefined);
  const out: { holder: Plain; key: string }[] = [];
  const events = nested(data.events);
  if (events) out.push({ holder: events, key: 'events' });
  const civ = nested(data.civ), h = civ ? nested(civ.h) : undefined;
  if (h) out.push({ holder: h, key: 'people' });
  return out;
}

/**
 * A copy of a save made small, for keeping. The page's worker keeps a dozen or two whole copies of the world to
 * go back to. In a late, crowded world a copy holds tens of thousands of events and people on record; as live
 * records those cost four or five times what they cost as text, and it was the copies, not the world, that ran
 * the page out of memory. Here the two long lists are turned into text; `unpackSave` (which `loadSimulation`
 * calls for itself) turns them back. Everything else in the save is shared with the original, not copied.
 */
export function packSave(save: SaveState): SaveState {
  const copyDown = (data: Plain, path: string[]): Plain => {
    // (copy only the objects on the way down to a list, so that the save handed in is left as it was)
    const out: Plain = { ...data };
    if (!path.length) return out;
    const k = path[0]!;
    const inner = (data[k] as { __nested: Plain }).__nested;
    out[k] = { __nested: copyDown(inner, path.slice(1)) };
    return out;
  };
  let data = save.data;
  for (const path of [['events'], ['civ', 'h']] as string[][]) {
    let at: Plain | undefined = data;
    for (const k of path) at = at && at[k] && typeof at[k] === 'object' && '__nested' in (at[k] as Plain) ? (at[k] as { __nested: Plain }).__nested : undefined;
    if (!at) continue;
    data = copyDown(data, path);
  }
  for (const { holder, key } of longLists(data)) {
    const list = holder[key];
    if (Array.isArray(list)) holder[key] = { __packed: JSON.stringify(list), length: list.length } satisfies Packed;
  }
  const out: SaveState = { ...save, data };
  if (save.neighbor) out.neighbor = packSave(save.neighbor);
  return out;
}

/** The save as it was before `packSave` (a save that was never packed is returned as it is). */
export function unpackSave(save: SaveState): SaveState {
  if (!longLists(save.data).some(({ holder, key }) => isPacked(holder[key])) && !save.neighbor) return save;
  const fresh = packSave({ ...save, neighbor: undefined });   // (copies the path down to each list; lists already packed stay packed)
  for (const { holder, key } of longLists(fresh.data)) { const v = holder[key]; if (isPacked(v)) holder[key] = JSON.parse(v.__packed); }
  if (save.neighbor) fresh.neighbor = unpackSave(save.neighbor);
  return fresh;
}

/** How many events a save holds, packed or not (what the worker weighs its kept copies by). */
export function eventsIn(save: SaveState): number {
  const at = longLists(save.data).find((x) => x.key === 'events');
  const v = at ? at.holder[at.key] : undefined;
  return Array.isArray(v) ? v.length : isPacked(v) ? v.length : 0;
}

/** Overwrite a freshly built simulation (same seed) with saved state. */
export function loadSimulation(sim: Simulation, save: SaveState): void {
  save = unpackSave(save);
  if (save.version !== SAVE_VERSION) throw new Error('This save is from a different version of Genesis.');
  if (save.seed !== sim.seed) throw new Error('Save and world seeds differ.');
  restore(sim, structuredClone(save.data));
  // a linked world comes back with it, or goes if the save had none
  if (save.neighbor) { sim.neighbor = new Simulation(save.neighbor.seed, save.neighbor.gridN); loadSimulation(sim.neighbor, save.neighbor); }
  else sim.neighbor = undefined;
  // region summaries are derived, not saved: without this a loaded world ran on year-zero summaries until its next ecology step
  sim.refreshDerived();
  sim.terrainDirty = true;
}
