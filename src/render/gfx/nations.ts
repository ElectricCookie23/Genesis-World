// Nations and the night map. The simulation tracks settlements; here they are grouped into nations
// (a founding city and the towns of its people around it), given a name, a light colour and an emblem,
// and turned into what the renderer needs: territory and borders, roads and sea lanes, and a map of
// city light. Nothing here feeds back into the simulation.
import type { Grid } from '../../sim/world';
import type { CellSnapshot, NationInfo, SettlementInfo, SpeciesInfo } from '../../shared/protocol';
import { G } from '../../sim/genetics';

export type RGB = [number, number, number];

export interface Emblem {
  /** 0 plain, 1 split down, 2 split across, 3 diagonal, 4 quartered, 5 bordered */
  division: number;
  /** 0 disc, 1 ring, 2 star, 3 triangle, 4 diamond, 5 crescent, 6 three dots, 7 bar */
  charge: number;
  points: number;
}

export interface Nation {
  id: number;
  /** Settlement id of the founding city. */
  capital: number;
  name: string;
  species: number;
  members: number[];
  /** Light signature at full technology, linear RGB. */
  signature: RGB;
  /** The colour its lights have now (firelight until it learns better). */
  color: RGB;
  accent: RGB;
  tech: number;
  /** People, in thousands. */
  pop: number;
  /** Direction of the capital. */
  dir: [number, number, number];
  emblem: Emblem;
  /** In a golden age: its lights and map colour are graded warm. */
  golden?: boolean;
  /** Its culture's number, the culture whose building fashions it borrows (-1 none) and how much (system E14). */
  cultureId?: number;
  fashionFrom?: number;
  fashionShare?: number;
}

/** The warm grade of a golden age: a colour pulled toward gold and lifted a little, never past full brightness. */
export function goldenGrade(c: RGB): RGB {
  const gold: RGB = [1.0, 0.8, 0.38];
  const mix = (a: number, b: number) => Math.min(1, (a * 0.5 + b * 0.5) * 1.12);
  return [mix(c[0], gold[0]), mix(c[1], gold[1]), mix(c[2], gold[2])];
}

const hash = (n: number): number => { let x = (n | 0) * 374761393 + 668265263; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

function hsv(h: number, s: number, v: number): RGB {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

const FIRE: RGB = [1.0, 0.5, 0.14];
const LAMP: RGB = [1.0, 0.66, 0.3];
const GAS: RGB = [0.95, 0.93, 0.62];

/**
 * The colour of a people's lights at a level of knowledge (system E2): open fire, then oil lamps from
 * the Age of Sails, pale gas light in the Age of Engines, and electric light in the nation's own colour
 * from the Age of Signals on.
 */
export function lightColour(tech: number, signature: RGB): RGB {
  const stops: [number, RGB][] = [[0.45, FIRE], [0.66, LAMP], [0.9, GAS], [1.04, signature]];
  if (tech <= stops[0]![0]) return [...FIRE] as RGB;
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i]!, [t0, c0] = stops[i - 1]!;
    if (tech <= t1) { const t = (tech - t0) / (t1 - t0), k = t * t * (3 - 2 * t); return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k]; }
  }
  return [...signature] as RGB;
}

function nationName(capital: string, seed: number, tech: number): string {
  const root = capital.replace(/[aeiou]+$/i, '') || capital;
  const r = hash(seed * 31 + 7);
  if (tech < 0.3) return [`The ${capital} Bands`, `People of ${capital}`, `${root}i Clans`][Math.floor(r * 3)]!;
  if (tech < 0.6) return [`Kingdom of ${capital}`, `${root}ia`, `Realm of ${capital}`, `${root}an League`, `${root}eth`][Math.floor(r * 5)]!;
  return [`${root}ia`, `Republic of ${capital}`, `${root}an Union`, `${root}ar Compact`, `United ${root}ia`, `${root}eth Dominion`, `Free ${capital}`][Math.floor(r * 7)]!;
}

/** Size of a settlement on a 0..1 scale: logarithmic in its people, so great cities do not swamp everything. */
export function settlementSize(pop: number): number {
  return Math.max(0.04, Math.min(1, (Math.log10(Math.max(1, pop * 1000)) - 1.5) / 5.2));
}

/**
 * Group living settlements into nations. The oldest settlement in a neighbourhood is the capital;
 * later ones of the same people nearby belong to it (towns that tell the same story of themselves hold together further).
 */
export function deriveNations(settlements: SettlementInfo[], grid: Grid, species: Map<number, SpeciesInfo>, known: NationInfo[] = []): Nation[] {
  // Where the simulation has founded nations, those are the nations: their towns are grouped as the simulation
  // has them, under its names and colours. Camps still outside history are grouped by nearness as before.
  const info = new Map(known.map((n) => [n.id, n]));
  const rank = (s: SettlementInfo): number => { const n = s.nation !== undefined && s.nation >= 0 ? info.get(s.nation) : undefined; return n ? (n.capital === s.id ? 2e9 : 1e9) + n.pop : 0; };
  const alive = settlements.filter((s) => s.ruined < 0).sort((a, b) => rank(b) - rank(a) || a.founded - b.founded || a.id - b.id);
  const nations: Nation[] = [];
  const { pos } = grid;
  const caps: SettlementInfo[] = [];
  for (const s of alive) {
    const sx = pos[s.cell * 3]!, sy = pos[s.cell * 3 + 1]!, sz = pos[s.cell * 3 + 2]!;
    let best = -1, bd = Infinity;
    const mine = s.nation !== undefined && s.nation >= 0 ? s.nation : -1;
    if (mine >= 0) best = caps.findIndex((c) => c.nation === mine);
    for (let k = 0; k < caps.length && mine < 0; k++) {
      const c = caps[k]!;
      if (c.species !== s.species || (c.nation ?? -1) >= 0) continue;
      const d = Math.acos(Math.max(-1, Math.min(1, sx * pos[c.cell * 3]! + sy * pos[c.cell * 3 + 1]! + sz * pos[c.cell * 3 + 2]!)));
      const reach = 0.3 + (c.lore >= 0 && c.lore === s.lore ? 0.14 : 0) - (c.lore >= 0 && s.lore >= 0 && c.lore !== s.lore ? 0.12 : 0);
      if (d < reach && d < bd) { bd = d; best = k; }
    }
    if (best < 0 && caps.length >= 24) {
      // the map is full: join the nearest nation of any kind
      for (let k = 0; k < caps.length; k++) {
        const c = caps[k]!;
        const d = Math.acos(Math.max(-1, Math.min(1, sx * pos[c.cell * 3]! + sy * pos[c.cell * 3 + 1]! + sz * pos[c.cell * 3 + 2]!)));
        if (d < bd) { bd = d; best = k; }
      }
    }
    if (best >= 0) { nations[best]!.members.push(s.id); continue; }
    caps.push(s);
    const sp = species.get(s.species);
    // the signature colour starts from the people's own biology (the hue of their glow or skin) and is spread per nation
    const bio = sp ? (sp.genes[G.Glow]! > 0.3 ? sp.genes[G.GlowHue]! : sp.genes[G.Hue]!) : hash(s.species);
    const own = mine >= 0 ? info.get(mine) : undefined;
    const hue = own ? own.hue : (bio + nations.filter((n) => n.species === s.species).length * 0.381966 + hash(s.id * 13 + 5) * 0.08) % 1;
    const emblemSeed = s.id * 97 + s.species * 13;
    nations.push({
      id: nations.length, capital: s.id, name: '', species: s.species, members: [s.id],
      signature: hsv(hue, 0.78, 1), color: FIRE, accent: hsv((hue + 0.42 + hash(emblemSeed) * 0.16) % 1, 0.6, 0.95), tech: 0, pop: 0,
      dir: [sx, sy, sz],
      emblem: { division: Math.floor(hash(emblemSeed + 1) * 6), charge: Math.floor(hash(emblemSeed + 2) * 8), points: 4 + Math.floor(hash(emblemSeed + 3) * 5) },
    });
  }
  const byId = new Map(settlements.map((s) => [s.id, s]));
  for (const n of nations) {
    let pop = 0, tech = 0;
    for (const m of n.members) { const s = byId.get(m)!; pop += s.pop; tech = Math.max(tech, s.tech); }
    n.pop = pop; n.tech = tech;
    const cap = byId.get(n.capital)!;
    const own = cap.nation !== undefined && cap.nation >= 0 ? info.get(cap.nation) : undefined;
    n.name = own ? own.name : nationName(cap.name, cap.id * 7 + n.species, tech);
    n.color = lightColour(tech, n.signature);
    // a country in its golden age shows it: its lights and its colour on the map lean warm and bright (system E10)
    n.golden = !!own && !!own.golden;
    if (own) { n.cultureId = own.cultureId; n.fashionFrom = own.fashionFrom; n.fashionShare = own.fashionShare; }
    if (n.golden) n.color = goldenGrade(n.color);
  }
  return nations;
}

/** A tiny binary heap of (cost, cell) pairs. */
class Heap {
  private c: number[] = [];
  private v: number[] = [];
  get size(): number { return this.c.length; }
  push(cost: number, value: number): void {
    const c = this.c, v = this.v;
    let i = c.length;
    c.push(cost); v.push(value);
    while (i > 0) { const p = (i - 1) >> 1; if (c[p]! <= cost) break; c[i] = c[p]!; v[i] = v[p]!; i = p; }
    c[i] = cost; v[i] = value;
  }
  pop(): [number, number] {
    const c = this.c, v = this.v;
    const topC = c[0]!, topV = v[0]!;
    const lc = c.pop()!, lv = v.pop()!;
    const n = c.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let k = i * 2 + 1;
        if (k >= n) break;
        if (k + 1 < n && c[k + 1]! < c[k]!) k++;
        if (c[k]! >= lc) break;
        c[i] = c[k]!; v[i] = v[k]!; i = k;
      }
      c[i] = lc; v[i] = lv;
    }
    return [topC, topV];
  }
}

export interface CivLayers {
  /** Nation that owns each cell, or -1. Coastal waters are claimed too, weakly. */
  owner: Int16Array;
  /** 0 on a border between two nations, 0.55 on a frontier with unclaimed land, 1 elsewhere. */
  edge: Float32Array;
  /** City light per cell, 0..1 (capitals brightest, on a log scale of people). */
  glow: Float32Array;
  /** Land claimed, 0 or 1. */
  claim: Float32Array;
  /** Colour of the owning nation's lights. */
  r: Float32Array; g: Float32Array; b: Float32Array;
  tech: Float32Array;
  /** War flicker and plague or collapse darkness per cell, 0..1. */
  war: Float32Array;
  dark: Float32Array;
}

/** What is happening to a town's lights: war (flicker), darkness (plague, collapse), and a festival night (system E30: brighter or dark, wider, in its own colour). */
export interface Unrest { war: number; dark: number; feast?: { glow: number; spread: number; flicker: number; dark: number; colour: readonly number[] | null } }

export function buildLayers(grid: Grid, cells: CellSnapshot, settlements: SettlementInfo[], nations: Nation[], unrest: Map<number, Unrest>, out?: CivLayers): CivLayers {
  const n = grid.count;
  const L: CivLayers = out ?? {
    owner: new Int16Array(n), edge: new Float32Array(n), glow: new Float32Array(n), claim: new Float32Array(n),
    r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), tech: new Float32Array(n), war: new Float32Array(n), dark: new Float32Array(n),
  };
  L.owner.fill(-1); L.edge.fill(1); L.glow.fill(0); L.claim.fill(0); L.r.fill(0); L.g.fill(0); L.b.fill(0); L.tech.fill(0); L.war.fill(0); L.dark.fill(0);
  if (!nations.length) return L;
  const { pos, neighbors, ncount } = grid;
  const { elevation, seaLevel } = cells;
  const nationOf = new Map<number, Nation>();
  for (const nat of nations) for (const m of nat.members) nationOf.set(m, nat);
  // ---- territory: every town claims outward over land; bigger towns reach further. Sea is claimed only close to shore.
  const cost = new Float32Array(n).fill(Infinity);
  const heap = new Heap();
  for (const s of settlements) {
    const nat = nationOf.get(s.id);
    if (!nat || s.ruined >= 0) continue;
    const reach = 2.2 + 8 * settlementSize(s.pop) * (0.5 + 0.5 * s.tech);
    if (-reach < cost[s.cell]!) { cost[s.cell] = -reach; L.owner[s.cell] = nat.id; heap.push(-reach, s.cell); }
  }
  while (heap.size) {
    const [c, cell] = heap.pop();
    if (c > cost[cell]!) continue;
    const own = L.owner[cell]!;
    const wet = elevation[cell]! <= seaLevel;
    for (let k = 0; k < ncount[cell]!; k++) {
      const nb = neighbors[cell * 6 + k]!;
      const sea = elevation[nb]! <= seaLevel;
      const step = sea ? (wet ? 3.2 : 2.4) : 1 + Math.min(2.5, Math.abs(elevation[nb]! - elevation[cell]!) * 1.4);
      const nc = c + step;
      if (nc < 0 && nc < cost[nb]!) { cost[nb] = nc; L.owner[nb] = own; heap.push(nc, nb); }
    }
  }
  for (let i = 0; i < n; i++) {
    const o = L.owner[i]!;
    if (o < 0) continue;
    const nat = nations[o]!;
    L.r[i] = nat.color[0]; L.g[i] = nat.color[1]; L.b[i] = nat.color[2]; L.tech[i] = nat.tech;
    if (elevation[i]! <= seaLevel) continue;
    L.claim[i] = 1;
    let e = 1;
    for (let k = 0; k < ncount[i]!; k++) {
      const nb = neighbors[i * 6 + k]!;
      if (elevation[nb]! <= seaLevel) continue;
      const o2 = L.owner[nb]!;
      if (o2 >= 0 && o2 !== o) { if (o < o2) e = 0; } else if (o2 < 0 && e > 0.55) e = 0.55;
    }
    L.edge[i] = e;
  }
  // colour bleeds a little past the claimed cells so lights near the edge keep their hue when blended
  for (let i = 0; i < n; i++) {
    if (L.owner[i]! >= 0) continue;
    let r = 0, g = 0, b = 0, w = 0;
    for (let k = 0; k < ncount[i]!; k++) { const nb = neighbors[i * 6 + k]!; if (L.owner[nb]! >= 0) { r += L.r[nb]!; g += L.g[nb]!; b += L.b[nb]!; w++; } }
    if (w) { L.r[i] = r / w; L.g[i] = g / w; L.b[i] = b / w; }
  }
  // ---- city light: a bright core falling away with distance, sized by people and technology
  const seen = new Int32Array(n).fill(-1);
  const queue: number[] = [];
  for (const s of settlements) {
    const nat = nationOf.get(s.id);
    if (!nat || s.ruined >= 0) continue;
    const size = settlementSize(s.pop);
    const u = unrest.get(s.id);
    const feast = u?.feast;
    // (on a festival night a town is brighter, or dark, and its light reaches further into the country round it)
    const core = Math.min(1, (0.3 + 0.7 * size * (0.35 + 0.65 * s.tech)) * (s.id === nat.capital ? 1.15 : 1) * (feast ? feast.glow : 1));
    const radius = (0.008 + 0.034 * size * (0.25 + 0.75 * s.tech)) * (feast ? feast.spread : 1);
    const cx = pos[s.cell * 3]!, cy = pos[s.cell * 3 + 1]!, cz = pos[s.cell * 3 + 2]!;
    queue.length = 0; queue.push(s.cell); seen[s.cell] = s.id;
    for (let q = 0; q < queue.length; q++) {
      const cell = queue[q]!;
      const d = Math.acos(Math.max(-1, Math.min(1, cx * pos[cell * 3]! + cy * pos[cell * 3 + 1]! + cz * pos[cell * 3 + 2]!)));
      const land = elevation[cell]! > seaLevel;
      const v = cell === s.cell ? core : core * Math.pow(Math.max(0, 1 - d / radius), 1.5) * (land ? 1 : 0);
      if (v > L.glow[cell]!) L.glow[cell] = v;
      if (u) { const f = Math.max(0, 1 - d / (radius + 0.03)); L.war[cell] = Math.max(L.war[cell]!, Math.max(u.war, feast ? feast.flicker : 0) * f); L.dark[cell] = Math.max(L.dark[cell]!, Math.max(u.dark, feast ? feast.dark : 0) * f); }
      if (feast && feast.colour && v > 0.01) { const m = Math.min(1, 0.4 + v); L.r[cell] = L.r[cell]! + (feast.colour[0]! - L.r[cell]!) * m; L.g[cell] = L.g[cell]! + (feast.colour[1]! - L.g[cell]!) * m; L.b[cell] = L.b[cell]! + (feast.colour[2]! - L.b[cell]!) * m; }
      if (d > radius + 0.03) continue;
      for (let k = 0; k < ncount[cell]!; k++) { const nb = neighbors[cell * 6 + k]!; if (seen[nb] !== s.id) { seen[nb] = s.id; queue.push(nb); } }
    }
  }
  return L;
}

export interface Networks {
  /** Each road: cells from one town to another. importance 0..1. */
  roads: { cells: number[]; importance: number }[];
  lanes: { cells: number[]; importance: number }[];
}

/** Cheapest path over the cell graph, or null. */
function route(grid: Grid, from: number, to: number, stepCost: (a: number, b: number) => number, limit: number, cost: Float32Array, prev: Int32Array, touched: number[]): number[] | null {
  const { pos, neighbors, ncount } = grid;
  const tx = pos[to * 3]!, ty = pos[to * 3 + 1]!, tz = pos[to * 3 + 2]!;
  const spacing = 0.016;
  const h = (c: number) => Math.acos(Math.max(-1, Math.min(1, pos[c * 3]! * tx + pos[c * 3 + 1]! * ty + pos[c * 3 + 2]! * tz))) / spacing * 0.8;
  for (const t of touched) { cost[t] = Infinity; prev[t] = -1; }
  touched.length = 0;
  const heap = new Heap();
  cost[from] = 0; touched.push(from); heap.push(h(from), from);
  let expanded = 0;
  while (heap.size && expanded++ < limit) {
    const [, cell] = heap.pop();
    if (cell === to) {
      const path = [to];
      let c = to;
      while (c !== from && prev[c]! >= 0) { c = prev[c]!; path.push(c); }
      return path.reverse();
    }
    const base = cost[cell]!;
    for (let k = 0; k < ncount[cell]!; k++) {
      const nb = neighbors[cell * 6 + k]!;
      const sc = stepCost(cell, nb);
      if (!(sc < 1e8)) continue;
      const nc = base + sc;
      if (nc < cost[nb]!) { if (cost[nb] === Infinity) touched.push(nb); cost[nb] = nc; prev[nb] = cell; heap.push(nc + h(nb), nb); }
    }
  }
  return null;
}

/**
 * Roads between neighbouring towns, following valleys, rivers and coasts; sea lanes between ports.
 * Only towns advanced enough build them.
 */
export function buildNetworks(grid: Grid, cells: CellSnapshot, settlements: SettlementInfo[]): Networks {
  const { pos, neighbors, ncount, count } = grid;
  const { elevation, seaLevel, flow } = cells;
  const trail = cells.trail;
  const alive = settlements.filter((s) => s.ruined < 0 && s.tech > 0.3);
  const net: Networks = { roads: [], lanes: [] };
  if (alive.length < 2) return net;
  const coastal = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (elevation[i]! <= seaLevel) continue;
    for (let k = 0; k < ncount[i]!; k++) if (elevation[neighbors[i * 6 + k]!]! <= seaLevel) { coastal[i] = 1; break; }
  }
  const landStep = (a: number, b: number): number => {
    if (elevation[b]! <= seaLevel) return 1e9;
    let c = 1 + Math.abs(elevation[b]! - elevation[a]!) * 3.5 + Math.max(0, elevation[b]! - seaLevel - 2.2) * 0.8;
    if (flow[b]! > 1.6) c *= 0.72;
    if (coastal[b]) c *= 0.86;
    // the first roads follow the old trails the herds wore, long before there was anyone to build a road
    if (trail && trail[b]! > 0.2) c *= 1 - 0.4 * Math.min(1, trail[b]! * 1.5);
    return c;
  };
  const seaStep = (a: number, b: number): number => {
    if (elevation[b]! > seaLevel) return 1e9;
    // ships keep to open water but not far from shore
    return seaLevel - elevation[b]! < 0.05 ? 1.6 : 1;
  };
  const cost = new Float32Array(count).fill(Infinity);
  const prev = new Int32Array(count).fill(-1);
  const touched: number[] = [];
  const dist = (a: SettlementInfo, b: SettlementInfo) => Math.acos(Math.max(-1, Math.min(1, pos[a.cell * 3]! * pos[b.cell * 3]! + pos[a.cell * 3 + 1]! * pos[b.cell * 3 + 1]! + pos[a.cell * 3 + 2]! * pos[b.cell * 3 + 2]!)));
  const done = new Set<string>();
  const linked = new Set<string>();
  let budget = 160;
  for (const s of alive) {
    const near = alive.filter((o) => o.id !== s.id).map((o) => ({ o, d: dist(s, o) })).filter((x) => x.d < 0.55).sort((a, b) => a.d - b.d).slice(0, 3);
    for (const { o, d } of near) {
      const key = s.id < o.id ? `${s.id}-${o.id}` : `${o.id}-${s.id}`;
      if (done.has(key) || budget <= 0) continue;
      done.add(key); budget--;
      const path = route(grid, s.cell, o.cell, landStep, 2500 + Math.round(d * 40000), cost, prev, touched);
      if (path && path.length < 90) { net.roads.push({ cells: path, importance: Math.min(s.tech, o.tech) }); linked.add(key); }
    }
  }
  // sea lanes: ports with ships, to the nearest ports they cannot easily reach by road
  const ports = alive.filter((s) => s.tech > 0.6 && coastal[s.cell]);
  const harbour = (cell: number): number => { for (let k = 0; k < ncount[cell]!; k++) { const nb = neighbors[cell * 6 + k]!; if (elevation[nb]! <= seaLevel) return nb; } return -1; };
  let seaBudget = 60;
  for (const s of ports) {
    const near = ports.filter((o) => o.id !== s.id).map((o) => ({ o, d: dist(s, o) })).filter((x) => x.d < 1.3).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { o, d } of near) {
      const key = s.id < o.id ? `${s.id}-${o.id}` : `${o.id}-${s.id}`;
      if (done.has(`sea${key}`) || seaBudget <= 0 || (linked.has(key) && d < 0.2)) continue;
      done.add(`sea${key}`); seaBudget--;
      const a = harbour(s.cell), b = harbour(o.cell);
      if (a < 0 || b < 0) continue;
      const path = route(grid, a, b, seaStep, 5000 + Math.round(d * 30000), cost, prev, touched);
      if (path && path.length > 2) net.lanes.push({ cells: path, importance: Math.min(s.tech, o.tech) });
    }
  }
  return net;
}
