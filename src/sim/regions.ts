// Ecological regions: a coarse icosphere laid over the fine planet grid.
// Life (plants and creature populations) is simulated per region; terrain and climate per fine cell.
import { buildGrid, nearestCell, type Grid, type World } from './world';
import type { ClimateState } from './climate';

export interface Regions {
  grid: Grid;
  count: number;
  /** Region index for every fine cell. */
  regionOf: Int32Array;
  /** CSR lists of the fine cells in each region. */
  cellStart: Int32Array;
  cellList: Int32Array;
  land: Float32Array; // fraction of cells above sea level
  shallow: Float32Array; // fraction of cells that are shallow sea
  temp: Float32Array; // mean annual temperature
  landTemp: Float32Array;
  moisture: Float32Array; // mean over land cells
  elevation: Float32Array; // mean land elevation above sea
  ice: Float32Array; // fraction of land under ice
  fertility: Float32Array;
  /** Fine cell nearest the region centre. */
  centre: Int32Array;
}

export function buildRegions(fine: Grid): Regions {
  const n = Math.max(4, Math.round(fine.n / 3));
  const grid = buildGrid(n);
  const count = grid.count;
  const regionOf = new Int32Array(fine.count);
  const sizes = new Int32Array(count);
  let last = 0;
  for (let i = 0; i < fine.count; i++) {
    last = nearestCell(grid, fine.pos[i * 3]!, fine.pos[i * 3 + 1]!, fine.pos[i * 3 + 2]!, last);
    regionOf[i] = last;
    sizes[last] = sizes[last]! + 1;
  }
  const cellStart = new Int32Array(count + 1);
  for (let r = 0; r < count; r++) cellStart[r + 1] = cellStart[r]! + sizes[r]!;
  const fill = cellStart.slice(0, count);
  const cellList = new Int32Array(fine.count);
  for (let i = 0; i < fine.count; i++) {
    const r = regionOf[i]!;
    cellList[fill[r]!] = i;
    fill[r] = fill[r]! + 1;
  }
  const centre = new Int32Array(count);
  let c = 0;
  for (let r = 0; r < count; r++) {
    c = nearestCell(fine, grid.pos[r * 3]!, grid.pos[r * 3 + 1]!, grid.pos[r * 3 + 2]!, c);
    centre[r] = c;
  }
  const f = () => new Float32Array(count);
  return {
    grid, count, regionOf, cellStart, cellList, centre,
    land: f(), shallow: f(), temp: f(), landTemp: f(), moisture: f(), elevation: f(), ice: f(), fertility: f(),
  };
}

export function updateRegions(reg: Regions, world: World, climate: ClimateState): void {
  const { count, cellStart, cellList } = reg;
  const { elevation, seaLevel, moisture, snow, fertility } = world;
  const meanT = climate.meanT;
  for (let r = 0; r < count; r++) {
    let land = 0, shallow = 0, t = 0, lt = 0, m = 0, e = 0, ice = 0, fert = 0;
    const a = cellStart[r]!, b = cellStart[r + 1]!;
    for (let k = a; k < b; k++) {
      const i = cellList[k]!;
      const h = elevation[i]! - seaLevel;
      t += meanT[i]!;
      if (h > 0) {
        land++;
        lt += meanT[i]!;
        m += moisture[i]!;
        e += h;
        fert += fertility[i]!;
        if (snow[i]! > 8 || meanT[i]! < -9) ice++;
      } else if (h > -0.35) shallow++;
    }
    const n = b - a;
    reg.land[r] = land / n;
    reg.shallow[r] = shallow / n;
    reg.temp[r] = t / n;
    reg.landTemp[r] = land ? lt / land : t / n;
    reg.moisture[r] = land ? m / land : 0;
    reg.elevation[r] = land ? e / land : 0;
    reg.ice[r] = land ? ice / land : 0;
    reg.fertility[r] = land ? fert / land : 0.5;
  }
}
