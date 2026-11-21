// The civilization layers as textures: who owns the land, where the cities glow and in what colour,
// where borders run, and the road and sea-lane network. Rebuilt whenever the settlements change.
import type { CubeTexture } from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { Grid } from '../../sim/world';
import type { CellSnapshot, NationInfo, SettlementInfo, SpeciesInfo } from '../../shared/protocol';
import type { CubeBake } from './cubebake';
import { LineField } from './linefield';
import { buildLayers, buildNetworks, deriveNations, type CivLayers, type Nation, type Unrest } from './nations';

/** 1 when the Night Map overlay is on: borders, territory wash and names. */
export const uNightMap = uniform(0);

export class CivMap {
  /** bytes: rgb = light colour of the nation here, a = city glow */
  readonly a: CubeTexture;
  /** bytes: r = border edge (0 on a border), g = technology, b = war flicker, a = darkness (plague, collapse) */
  readonly b: CubeTexture;
  /** Roads (codes 1..127 by importance) and sea lanes (128..255). */
  readonly roads: LineField;
  nations: Nation[] = [];
  private layers?: CivLayers;
  private settlements: SettlementInfo[] = [];
  private unrest = new Map<number, Unrest>();
  private netKey = '';
  private dirty = false;
  private lastBuild = -1e9;
  private pts = new Float32Array(3 * 256);
  roadCount = 0;
  laneCount = 0;
  /** Sea lanes as chains of cells, for the boats. */
  lanes: number[][] = [];
  get towns(): SettlementInfo[] { return this.settlements; }

  constructor(private grid: Grid, private bake: CubeBake, roadSize = 512) {
    this.a = bake.create(false);
    this.b = bake.create(false);
    this.roads = new LineField(roadSize);
    // start with "no border anywhere"
    bake.fill(this.b, 0, new Float32Array(grid.count).fill(1));
    bake.commit(this.b);
  }

  setSettlements(list: SettlementInfo[], known?: NationInfo[]): void {
    this.settlements = list;
    if (known) this.known = known;
    this.dirty = true;
  }
  /** Nations as the simulation has them (empty before history begins). */
  private known: NationInfo[] = [];

  /** Festival nights (system E30), by the simulation's nation id: what each does to the lights of that nation's towns. */
  private feasts = new Map<number, NonNullable<Unrest['feast']>>();
  private feastKey = '';
  setFeasts(byNation: Map<number, NonNullable<Unrest['feast']>>): void {
    const key = [...byNation.entries()].map(([id, f]) => `${id}:${f.glow}:${f.dark}:${f.flicker}:${f.colour ? f.colour.join('/') : ''}`).sort().join(',');
    if (key === this.feastKey) return;
    this.feastKey = key;
    this.feasts = byNation;
    // (a festival begins and ends on its day: the lights change at once)
    this.dirty = true;
    this.lastBuild = -1e9;
  }

  /** Armies in the field (system E33): where each is camped and how large it is. */
  private camps: { cell: number; size: number }[] = [];
  setCamps(list: { cell: number; size: number }[]): void {
    const key = (l: { cell: number; size: number }[]) => l.map((c) => `${c.cell}:${Math.round(c.size)}`).join(',');
    if (key(list) === key(this.camps)) return;
    this.camps = list;
    this.dirty = true;
  }

  /** A war or a plague at a settlement: its lights flicker or go dark for a while. */
  disturb(cell: number, kind: 'war' | 'plague'): void {
    for (const s of this.settlements) {
      if (s.cell !== cell) continue;
      const u = this.unrest.get(s.id) ?? { war: 0, dark: 0 };
      if (kind === 'war') u.war = 1; else u.dark = 1;
      this.unrest.set(s.id, u);
      this.dirty = true;
    }
  }

  /** Call every frame; rebuilds at most every couple of seconds, and only when something changed. */
  update(cells: CellSnapshot | undefined, species: Map<number, SpeciesInfo>, now: number, dt: number, force = false): boolean {
    // unrest fades in real time so it can be seen at any simulation speed
    let fading = false;
    for (const [id, u] of this.unrest) {
      u.war = Math.max(0, u.war - dt / 40); u.dark = Math.max(0, u.dark - dt / 70);
      if (u.war <= 0 && u.dark <= 0) this.unrest.delete(id); else fading = true;
    }
    if (!cells || (!force && now - this.lastBuild < (fading ? 1500 : 2500)) || (!this.dirty && !fading && !force)) return false;
    this.lastBuild = now;
    this.dirty = false;
    this.nations = deriveNations(this.settlements, this.grid, species, this.known);
    let lights = this.unrest;
    if (this.feasts.size) {
      lights = new Map(this.unrest);
      for (const st of this.settlements) { const f = st.nation !== undefined ? this.feasts.get(st.nation) : undefined; if (f && st.ruined < 0) lights.set(st.id, { war: lights.get(st.id)?.war ?? 0, dark: lights.get(st.id)?.dark ?? 0, feast: f }); }
    }
    this.layers = buildLayers(this.grid, cells, this.settlements, this.nations, lights, this.layers, this.camps);
    const L = this.layers, b = this.bake;
    b.fill(this.a, 0, L.r); b.fill(this.a, 1, L.g); b.fill(this.a, 2, L.b); b.fill(this.a, 3, L.glow);
    b.commit(this.a);
    b.fill(this.b, 0, L.edge); b.fill(this.b, 1, L.tech); b.fill(this.b, 2, L.war); b.fill(this.b, 3, L.dark);
    b.commit(this.b);
    // roads change only when towns appear, fall, or cross a technology threshold
    const key = this.settlements.map((s) => `${s.id}:${s.ruined >= 0 ? 'x' : Math.floor(s.tech * 5)}`).join(',');
    if (key !== this.netKey) {
      this.netKey = key;
      const net = buildNetworks(this.grid, cells, this.settlements);
      this.roads.clear();
      const { pos } = this.grid;
      const stamp = (path: number[], code: number, bend: number) => {
        const n = Math.min(path.length, 256);
        for (let i = 0; i < n; i++) { const c = path[i]!; this.pts[i * 3] = pos[c * 3]!; this.pts[i * 3 + 1] = pos[c * 3 + 1]!; this.pts[i * 3 + 2] = pos[c * 3 + 2]!; }
        this.roads.chain(this.pts, n, () => code, bend);
      };
      for (const r of net.roads) stamp(r.cells, Math.max(1, Math.min(127, Math.round(r.importance * 127))), 0.0012);
      for (const l of net.lanes) stamp(l.cells, 128 + Math.max(0, Math.min(127, Math.round(l.importance * 127))), 0.0006);
      this.roads.commit();
      this.roadCount = net.roads.length;
      this.laneCount = net.lanes.length;
      this.lanes = net.lanes.map((l) => l.cells);
    }
    return true;
  }
}
