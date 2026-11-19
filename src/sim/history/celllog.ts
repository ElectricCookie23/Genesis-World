// The history of every place.
// Each cell keeps a compact record of what changed there and when: its biome, who owned it, what
// was built or abandoned, how big the town grew, what happened. From that record the state of any
// cell can be rebuilt for any year. Entries live in a few shared growing arrays, threaded per cell
// as a linked list (each entry points at the cell's previous one), so a million entries cost about
// twenty megabytes and a cell with no history costs four bytes.

export const enum Log {
  /** value = biome index */
  Biome = 1,
  /** value = nation id, or -1 when it passes out of any nation's hands */
  Owner = 2,
  /** value = settlement id founded on this cell */
  Settled = 3,
  /** value = settlement id abandoned */
  Ruined = 4,
  /** value = size class of the settlement here: 0 camp, 1 village, 2 town, 3 city, 4 great city */
  Size = 5,
  /** value = event id of something notable that happened here */
  Event = 6,
  /** value = era index reached here */
  Era = 7,
}

export interface PlaceState {
  /** Biome index, or -1 if never recorded. */
  biome: number;
  /** Owning nation, or -1. */
  owner: number;
  /** Settlement standing here, or -1. */
  settlement: number;
  /** Settlements that once stood here and were abandoned by then, oldest first. */
  ruins: number[];
  size: number;
  era: number;
  /** Events recorded here up to that year, oldest first. */
  events: number[];
}

export class CellLog {
  /** Index of each cell's newest entry, or -1. */
  head: Int32Array;
  year: Float64Array;
  kind: Uint8Array;
  value: Int32Array;
  prev: Int32Array;
  count = 0;
  /** Entries are refused past this many (the oldest record is never thrown away; new minor ones are). */
  limit: number;

  constructor(cells: number, limit = 1_200_000) {
    this.head = new Int32Array(cells).fill(-1);
    const start = 4096;
    this.year = new Float64Array(start);
    this.kind = new Uint8Array(start);
    this.value = new Int32Array(start);
    this.prev = new Int32Array(start);
    this.limit = limit;
  }

  private grow(): void {
    const n = Math.min(this.limit, this.year.length * 2);
    const year = new Float64Array(n); year.set(this.year); this.year = year;
    const kind = new Uint8Array(n); kind.set(this.kind); this.kind = kind;
    const value = new Int32Array(n); value.set(this.value); this.value = value;
    const prev = new Int32Array(n); prev.set(this.prev); this.prev = prev;
  }

  /** The newest value of a kind at a cell, or `none`. */
  last(cell: number, kind: Log, none = -1): number {
    for (let i = this.head[cell]!; i >= 0; i = this.prev[i]!) if (this.kind[i] === kind) return this.value[i]!;
    return none;
  }

  /** Record a change. Repeats of the current value are dropped. Returns false if the log is full. */
  note(cell: number, year: number, kind: Log, value: number): boolean {
    if (cell < 0 || cell >= this.head.length) return false;
    if (kind !== Log.Event && kind !== Log.Settled && kind !== Log.Ruined && this.last(cell, kind, -2) === value) return true;
    // the land's own slow changes may fill most of the log, but the last part is kept for what people do
    if (kind === Log.Biome && this.count >= this.limit * 0.7) return false;
    if (this.count >= this.year.length) {
      if (this.year.length >= this.limit) return false;
      this.grow();
    }
    const i = this.count++;
    this.year[i] = year; this.kind[i] = kind; this.value[i] = value; this.prev[i] = this.head[cell]!;
    this.head[cell] = i;
    return true;
  }

  /** What stood at a cell in a given year. */
  stateAt(cell: number, year: number): PlaceState {
    const s: PlaceState = { biome: -1, owner: -1, settlement: -1, ruins: [], size: 0, era: 0, events: [] };
    let gotBiome = false, gotOwner = false, gotSize = false, gotEra = false, settledSeen = false;
    const ruined = new Set<number>();
    for (let i = this.head[cell]!; i >= 0; i = this.prev[i]!) {
      if (this.year[i]! > year) continue;
      const v = this.value[i]!;
      switch (this.kind[i]) {
        case Log.Biome: if (!gotBiome) { s.biome = v; gotBiome = true; } break;
        case Log.Owner: if (!gotOwner) { s.owner = v; gotOwner = true; } break;
        case Log.Size: if (!gotSize) { s.size = v; gotSize = true; } break;
        case Log.Era: if (!gotEra) { s.era = v; gotEra = true; } break;
        case Log.Event: s.events.unshift(v); break;
        case Log.Ruined: ruined.add(v); s.ruins.unshift(v); break;
        case Log.Settled: if (!settledSeen && !ruined.has(v)) { s.settlement = v; settledSeen = true; } break;
      }
    }
    if (s.settlement < 0) { s.size = 0; }
    return s;
  }

  /** Every entry of a cell, oldest first: for a place's timeline. */
  entries(cell: number): { year: number; kind: Log; value: number }[] {
    const out: { year: number; kind: Log; value: number }[] = [];
    for (let i = this.head[cell]!; i >= 0; i = this.prev[i]!) out.unshift({ year: this.year[i]!, kind: this.kind[i] as Log, value: this.value[i]! });
    return out;
  }
}
