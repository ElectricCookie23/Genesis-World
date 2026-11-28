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
  /** Made small for keeping by `packSave` (see there); `loadSimulation` reads either kind. */
  packed?: boolean;
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

/** A typed array kept in pieces: what `packSave` puts in place of a large one. The pieces stop where the array's trailing zeros begin. */
interface Chunked { __chunks: Float32Array[]; length: number; type: string }
const isChunked = (v: unknown): v is Chunked => !!v && typeof v === 'object' && Array.isArray((v as Chunked).__chunks);

/**
 * The pieces of the copy made last, by where each array sits in the save. Handed to `packSave` again for the next
 * copy, it lets that copy use the same pieces wherever nothing has changed: the record of every place only grows,
 * the land hardly moves in a century, and a dozen kept copies of one world are mostly the same bytes.
 */
export type ChunkPool = Map<string, Float32Array[]>;

/** Arrays smaller than this are kept whole. */
const CHUNK_MIN_BYTES = 32768;
/** The size of a piece. */
const CHUNK_BYTES = 65536;

/** Are these two runs of numbers the same, bit for bit? (`a` from `from` for the length of `b`.) */
function sameBits(a: Float32Array, from: number, b: Float32Array): boolean {
  const size = a.BYTES_PER_ELEMENT, bytes = b.byteLength, at = a.byteOffset + from * size;
  if (at % 4 === 0 && b.byteOffset % 4 === 0 && bytes % 4 === 0) {
    const x = new Uint32Array(a.buffer, at, bytes / 4), y = new Uint32Array(b.buffer, b.byteOffset, bytes / 4);
    for (let i = 0; i < y.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  const x = new Uint8Array(a.buffer, at, bytes), y = new Uint8Array(b.buffer, b.byteOffset, bytes);
  for (let i = 0; i < y.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/** A large array cut into pieces, without the zeros at its end, using the pool's piece wherever it is the same. */
function chunked(v: Float32Array, path: string, pool: ChunkPool | undefined): Chunked {
  let end = v.length;
  while (end > 0 && Object.is(v[end - 1], 0)) end--;   // (not a minus zero: what comes back must be the same bit for bit)
  const per = Math.max(1, Math.floor(CHUNK_BYTES / v.BYTES_PER_ELEMENT));
  const before = pool?.get(path), chunks: Float32Array[] = [];
  for (let from = 0, j = 0; from < end; from += per, j++) {
    const n = Math.min(per, end - from), old = before?.[j];
    chunks.push(old && old.constructor === v.constructor && old.length === n && sameBits(v, from, old) ? old : v.slice(from, from + n));
  }
  pool?.set(path, chunks);
  return { __chunks: chunks, length: v.length, type: v.constructor.name };
}

const KINDS: Record<string, new (n: number) => Float32Array> = {
  Float32Array, Float64Array: Float64Array as never, Int8Array: Int8Array as never, Uint8Array: Uint8Array as never, Uint8ClampedArray: Uint8ClampedArray as never,
  Int16Array: Int16Array as never, Uint16Array: Uint16Array as never, Int32Array: Int32Array as never, Uint32Array: Uint32Array as never,
};

/** The array a `Chunked` was made from. */
function whole(c: Chunked): Float32Array {
  const make = KINDS[c.type];
  if (!make) throw new Error(`A kept copy of the world holds numbers of a kind this version cannot read (${c.type}).`);
  const out = new make(c.length);
  let at = 0;
  for (const piece of c.__chunks) { out.set(piece, at); at += piece.length; }
  return out;
}

/** A copy of a save's tree of records (the records themselves, not what is in them), so that it can be changed without touching the save. */
function copyTree(data: Plain): Plain {
  const out: Plain = { ...data };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v && typeof v === 'object' && '__nested' in (v as Plain)) out[k] = { __nested: copyTree((v as { __nested: Plain }).__nested) };
  }
  return out;
}

/** Every record in a save's tree, with where it sits. */
function eachRecord(data: Plain, path: string, visit: (rec: Plain, path: string) => void): void {
  visit(data, path);
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v && typeof v === 'object' && '__nested' in (v as Plain)) eachRecord((v as { __nested: Plain }).__nested, `${path}.${k}`, visit);
  }
}

/**
 * A copy of a save made small, for keeping. The page's worker keeps a dozen or two whole copies of the world to
 * go back to. In a late, crowded world a copy holds tens of thousands of events and people on record; as live
 * records those cost four or five times what they cost as text, and it was the copies, not the world, that ran
 * the page out of memory. Here the two long lists are turned into text, and every large array of numbers is cut
 * into pieces without the unused rows at its end (a new world's tables of animals are reserved whole and empty:
 * nine megabytes of thirteen). Given the `pool` that the copy before was made with, a piece that has not changed
 * since is not copied again but shared. `unpackSave` (which `loadSimulation` calls for itself) puts it all back.
 * The save handed in is left as it was.
 */
export function packSave(save: SaveState, pool?: ChunkPool): SaveState {
  const data = copyTree(save.data);
  for (const { holder, key } of longLists(data)) {
    const list = holder[key];
    if (Array.isArray(list)) holder[key] = { __packed: JSON.stringify(list), length: list.length } satisfies Packed;
  }
  eachRecord(data, 'sim', (rec, path) => {
    for (const k of Object.keys(rec)) {
      const v = rec[k];
      if (isTyped(v) && v.byteLength >= CHUNK_MIN_BYTES) rec[k] = chunked(v, `${path}.${k}`, pool);
    }
  });
  const out: SaveState = { ...save, data, packed: true };
  if (save.neighbor) out.neighbor = packSave(save.neighbor);
  return out;
}

/** The save as it was before `packSave` (a save that was never packed is returned as it is). */
export function unpackSave(save: SaveState): SaveState {
  if (!save.packed && !longLists(save.data).some(({ holder, key }) => isPacked(holder[key])) && !save.neighbor) return save;
  const data = copyTree(save.data);
  for (const { holder, key } of longLists(data)) { const v = holder[key]; if (isPacked(v)) holder[key] = JSON.parse(v.__packed); }
  eachRecord(data, 'sim', (rec) => {
    for (const k of Object.keys(rec)) { const v = rec[k]; if (isChunked(v)) rec[k] = whole(v); }
  });
  const fresh: SaveState = { ...save, data };
  delete fresh.packed;
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
