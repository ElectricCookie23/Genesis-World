// Rivers as part of the ground: the drainage network is drawn into a line field (see linefield.ts),
// so the terrain shader can draw smooth, thin, curving rivers of any width with no extra geometry.
import type { CubeTexture } from 'three/webgpu';
import type { Grid } from '../../sim/world';
import type { CellSnapshot } from '../../shared/protocol';
import { LineField } from './linefield';

/** Widest river half-width, in planet radii. */
export const RIVER_MAX_WIDTH = 0.0024;

export class RiverMap {
  readonly field: LineField;
  private lastBuild = -1e9;
  count = 0;

  constructor(private grid: Grid, readonly size = 512) {
    this.field = new LineField(size);
  }

  get texture(): CubeTexture { return this.field.texture; }
  get range(): number { return this.field.range; }

  /** Redraw from the current drainage. Takes tens of milliseconds, so it is throttled. */
  update(cells: CellSnapshot, now: number, force = false): void {
    if (!force && now - this.lastBuild < 6000) return;
    this.lastBuild = now;
    const { pos, count } = this.grid;
    const { flow, downhill, elevation, seaLevel, temperature, snow } = cells;
    this.field.clear();
    const width = (fl: number) => Math.min(RIVER_MAX_WIDTH, 0.0003 + 0.0002 * Math.sqrt(fl));
    const code = (w: number) => Math.max(1, Math.min(255, Math.round((w / RIVER_MAX_WIDTH) * 255)));
    const pts = new Float32Array(9);
    let segs = 0;
    for (let i = 0; i < count; i++) {
      const fl = flow[i]!;
      const d = downhill[i]!;
      if (fl < 1.6 || d < 0 || elevation[i]! <= seaLevel || temperature[i]! < -2 || snow[i]! > 1.5) continue;
      const dd = elevation[d]! > seaLevel ? downhill[d]! : -1;
      // a curve from the middle of this step, around the next cell, to the middle of the following step
      for (let k = 0; k < 3; k++) {
        pts[k] = (pos[i * 3 + k]! + pos[d * 3 + k]!) / 2;
        pts[3 + k] = pos[d * 3 + k]!;
        pts[6 + k] = dd >= 0 ? (pos[d * 3 + k]! + pos[dd * 3 + k]!) / 2 : pos[d * 3 + k]!;
      }
      const w = code((width(fl) + width(Math.max(flow[d]!, fl))) / 2);
      this.bezier(pts, w);
      segs++;
    }
    this.count = segs;
    this.field.commit();
  }

  private p0 = [0, 0, 0];
  private p1 = [0, 0, 0];
  /** One quadratic curve with gentle meanders, so rivers do not follow the cell grid in straight hops. */
  private bezier(q: Float32Array, code: number): void {
    const F = 230, AMP = 0.0019, PIECES = 5;
    const p0 = this.p0, p1 = this.p1;
    for (let s = 0; s <= PIECES; s++) {
      const t = s / PIECES, u = 1 - t;
      for (let k = 0; k < 3; k++) p1[k] = u * u * q[k]! + 2 * u * t * q[3 + k]! + t * t * q[6 + k]!;
      const x = p1[0]!, y = p1[1]!, z = p1[2]!;
      p1[0] = x + AMP * (Math.sin(y * F + 1.3) + Math.sin(z * F * 1.31 + 0.7));
      p1[1] = y + AMP * (Math.sin(z * F + 2.1) + Math.sin(x * F * 1.27 + 5.1));
      p1[2] = z + AMP * (Math.sin(x * F + 4.2) + Math.sin(y * F * 1.19 + 3.3));
      const l = Math.hypot(p1[0]!, p1[1]!, p1[2]!);
      p1[0]! /= l; p1[1]! /= l; p1[2]! /= l;
      if (s > 0) this.field.piece(p0, p1, code);
      p0[0] = p1[0]!; p0[1] = p1[1]!; p0[2] = p1[2]!;
    }
  }
}
