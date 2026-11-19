// Plates that really drift: every plate's crust is carried forward around its rotation pole, so the
// outlines of the plates move too. Where two plates arrive at the same place they collide (the
// lighter continental crust rides up and mountains grow); where a plate has moved away and nothing
// has arrived, new sea floor forms at a ridge and joins the plate that left.
import { nearestCell, type World } from './world';

/** Angle between neighbouring cells of the fine grid, in radians (about one cell). */
const CELL = 0.016;
/** Depth of new sea floor at a ridge, and of old abyssal floor (km). */
const RIDGE = -2.1;
const ABYSS = -2.6;

export interface DriftResult {
  /** Cells where two plates met this step. */
  collisions: number;
  /** Cells of new sea floor. */
  spread: number;
  /** Cells that changed plate. */
  moved: number;
}

/**
 * Advance the plates by `years`. Each plate saves up its motion until it has moved a whole cell,
 * then all of its crust steps forward together, so slow plates still move.
 */
export function driftPlatesMoving(world: World, years: number): DriftResult {
  const { grid, elevation, plates, plate } = world;
  const { pos, count } = grid;
  const my = years / 1e6;
  const steps = new Float32Array(plates.length);
  let any = false;
  for (let p = 0; p < plates.length; p++) {
    const pl = plates[p]! as (typeof plates)[number] & { acc?: number };
    pl.acc = (pl.acc ?? 0) + pl.speed * my;
    const whole = Math.trunc(pl.acc / CELL);
    if (whole !== 0) { steps[p] = Math.max(-3, Math.min(3, whole)) * CELL; pl.acc -= whole * CELL; any = true; }
  }
  const result: DriftResult = { collisions: 0, spread: 0, moved: 0 };
  if (!any) return result;
  const nextElev = new Float32Array(count).fill(NaN);
  const nextPlate = new Int32Array(count).fill(-1);
  // how much crust has piled onto each cell from a second plate
  const pile = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = plate[i]!;
    const a = steps[p]!;
    let j = i;
    if (a !== 0) {
      const pl = plates[p]!;
      const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
      const c = Math.cos(a), s = Math.sin(a), d = (pl.ax * x + pl.ay * y + pl.az * z) * (1 - c);
      j = nearestCell(grid, x * c + (pl.ay * z - pl.az * y) * s + pl.ax * d, y * c + (pl.az * x - pl.ax * z) * s + pl.ay * d, z * c + (pl.ax * y - pl.ay * x) * s + pl.az * d, i);
    }
    const e = elevation[i]!;
    const here = nextPlate[j]!;
    if (here < 0) { nextPlate[j] = p; nextElev[j] = e; continue; }
    const other = nextElev[j]!;
    if (here === p) {
      // two cells of one plate landing together (the grid is not perfectly even): keep the higher
      if (e > other) nextElev[j] = e;
      continue;
    }
    // two plates in one place: the higher (lighter, continental) crust stays on top, the other goes under
    result.collisions++;
    const loser = Math.min(e, other);
    if (e > other) { nextPlate[j] = p; nextElev[j] = e; }
    // crust is thickened where continents meet; where sea floor dives under land, a volcanic range is fed
    pile[j] += loser > -0.6 ? 0.22 : 0.05;
  }
  for (let j = 0; j < count; j++) {
    if (nextPlate[j]! < 0) {
      // a gap opened behind a departing plate: fresh floor wells up and stays with the plate that was here
      nextPlate[j] = plate[j]!;
      nextElev[j] = RIDGE;
      result.spread++;
    } else if (pile[j]! > 0) {
      // ranges grow quickly at first and ever more slowly as they near the height the crust can hold up
      const base = Math.max(nextElev[j]!, -0.4);
      nextElev[j] = base + pile[j]! * Math.max(0, 1 - base / 7.5);
    }
  }
  // young ridge floor sinks toward the abyss as it ages; spread the uplift of collisions a little so ranges have foothills
  for (let j = 0; j < count; j++) {
    let e = nextElev[j]!;
    if (e < -0.6 && e > ABYSS) e += (ABYSS - e) * 0.04;
    if (pile[j]! > 0) {
      for (let k = 0; k < grid.ncount[j]!; k++) {
        const nb = grid.neighbors[j * 6 + k]!;
        // the crust that went under is not lost: it thickens the margin, lifting foothills and shallow shelves beside the range
        if (pile[nb] === 0 && nextElev[nb]! > -2.2 && nextElev[nb]! < 5) nextElev[nb] = nextElev[nb]! + pile[j]! * (nextElev[nb]! > -0.6 ? 0.3 : 0.9);
      }
    }
    nextElev[j] = e;
  }
  // continental crust is too light to be destroyed: whatever volume went under comes back as a slow rise of the continents and their shelves
  let before = 0, after = 0, shelf = 0;
  for (let j = 0; j < count; j++) {
    before += Math.max(0, elevation[j]! + 0.6);
    after += Math.max(0, nextElev[j]! + 0.6);
    if (nextElev[j]! > -1.0 && nextElev[j]! < 4) shelf++;
  }
  if (after < before && shelf > 0) {
    const lift = Math.min(0.05, (before - after) / shelf);
    for (let j = 0; j < count; j++) if (nextElev[j]! > -1.0 && nextElev[j]! < 4) nextElev[j] = nextElev[j]! + lift;
  }
  for (let j = 0; j < count; j++) {
    if (nextPlate[j] !== plate[j]) result.moved++;
    plate[j] = nextPlate[j]!;
    elevation[j] = nextElev[j]!;
  }
  return result;
}
