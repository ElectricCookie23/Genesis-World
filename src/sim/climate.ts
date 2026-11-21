// Temperature, moisture, wind, snow, biomes, long-term climate cycles.
import { RNG } from './rng';
import { makeNoise, fbm } from './noise';
import { Biome, type World } from './world';

export interface ClimateState {
  /** Axial tilt in radians. */
  tilt: number;
  /** Long cycle phases and periods (years). */
  cycles: { period: number; amp: number; phase: number }[];
  /** Greenhouse forcing in deg C (volcanic CO2, civilisation, etc.). Decays slowly. */
  greenhouse: number;
  /** Aerosol cooling in deg C (ash, impact dust). Decays fast. */
  aerosol: number;
  /** Extra forcing from the experiment tools, deg C, decays. */
  forced: number;
  /** Current global offset actually applied. */
  globalOffset: number;
  /** Mean surface temperature, deg C. */
  meanTemp: number;
  iceFraction: number;
  /** Per-cell static temperature variation. */
  jitter: Float32Array;
  /** Upwind neighbour for each cell. */
  upwind: Int32Array;
  /** For every sea cell, the sea cell its surface water flows in from (itself where the water is still or on land). */
  upcurrent: Int32Array;
  /** Sea surface temperature: it remembers, so warmth and cold are carried a long way along the currents. */
  sst: Float32Array;
  /** The sea cell that a current has warmed or cooled furthest from what its latitude alone would give, and by how much (deg C). */
  currentCell: number;
  currentAnomaly: number;
  /** Carried humidity. */
  humidity: Float32Array;
  /** Annual mean temperature (smoothed), used for biomes. */
  meanT: Float32Array;
  scratch: Float32Array;
  /** Solar brightness multiplier (rises in the far future). */
  solar: number;
  /** Cooling under the shadow of a ring system, deg C at the equator. */
  ringShadow: number;
  /** Static per-cell values: sin(latitude), rain band and cloud band factors. */
  sinLat: Float32Array;
  rainBand: Float32Array;
  cloudBand: Float32Array;
  /** What the drawn cloud is multiplied by at each cell: this world's own belts over the plain ones. */
  cloudShow: Float32Array;
}

export function createClimate(world: World, rng: RNG): ClimateState {
  const { grid } = world;
  const count = grid.count;
  const r = rng.fork('climate');
  const noise = makeNoise(r);
  const jitter = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    jitter[i] = 2.2 * fbm(noise, grid.pos[i * 3]! * 3, grid.pos[i * 3 + 1]! * 3, grid.pos[i * 3 + 2]! * 3, 3);
  }
  const state: ClimateState = {
    tilt: (r.range(14, 30) * Math.PI) / 180,
    cycles: [
      { period: r.range(34e6, 52e6), amp: r.range(2.4, 3.3), phase: r.range(0, Math.PI * 2) },
      { period: r.range(9e6, 15e6), amp: r.range(1.0, 1.7), phase: r.range(0, Math.PI * 2) },
      { period: r.range(90e3, 130e3), amp: r.range(0.45, 0.8), phase: r.range(0, Math.PI * 2) },
      { period: r.range(36e3, 46e3), amp: r.range(0.15, 0.3), phase: r.range(0, Math.PI * 2) },
    ],
    greenhouse: 2.5,
    aerosol: 0,
    forced: 0,
    globalOffset: 0,
    meanTemp: 15,
    iceFraction: 0,
    jitter,
    upwind: new Int32Array(count),
    upcurrent: new Int32Array(count),
    sst: new Float32Array(count).fill(NaN),
    currentCell: -1,
    currentAnomaly: 0,
    humidity: new Float32Array(count),
    meanT: new Float32Array(count),
    scratch: new Float32Array(count),
    solar: 1,
    ringShadow: 0,
    sinLat: new Float32Array(count),
    rainBand: new Float32Array(count),
    cloudBand: new Float32Array(count),
    cloudShow: new Float32Array(count),
  };
  // The belts of weather differ from world to world: how strong the convective belt is, how far off the equator it
  // sits and how wide, where the dry belts lie, and how cloudy the middle latitudes are. On some worlds the belt at
  // the equator is hardly there, and the cloud is in the middle latitudes instead.
  const b = r.fork('bands');
  const wet = b.range(0, 0.95), off = b.range(-12, 12), wide = b.range(0.6, 1.7);
  // the belt is not a ruled line: it wanders north and south as it goes round, and is thick in places and broken in others
  const p1 = b.range(0, 6.28), p2 = b.range(0, 6.28), p3 = b.range(0, 6.28), sway = b.range(4, 14);
  const dryAt = b.range(20, 33), dry = b.range(0.5, 1.2), midAt = b.range(44, 64), mid = b.range(0.5, 1.6);
  const bump = (x: number, at: number, w: number): number => Math.exp(-((x - at) * (x - at)) / w);
  for (let i = 0; i < count; i++) {
    const d = grid.lat[i]! * (180 / Math.PI), a = Math.abs(d);
    state.sinLat[i] = Math.sin(grid.lat[i]!);
    // convective belt near the equator, dry subtropical highs, wet mid-latitudes
    // (the simulation keeps its plain belts, so the climates and histories of worlds are as they were: only the cloud
    // that is drawn differs, through cloudShow)
    state.rainBand[i] = 0.55 + 0.75 * bump(a, 0, 220) - 0.38 * bump(a, 27, 90) + 0.25 * bump(a, 52, 200);
    state.cloudBand[i] = 0.5 + 0.6 * bump(a, 0, 160) - 0.4 * bump(a, 26, 110) + 0.45 * bump(a, 55, 260);
    // how much more or less cloud this world shows at this latitude than the plain belts give
    const lon = grid.lon[i]!;
    const at = off + sway * Math.sin(2 * lon + p1) + 0.4 * sway * Math.sin(5 * lon + p2);
    const patch = Math.max(0, 0.5 + 0.6 * Math.sin(3 * lon + p3) * Math.sin(7 * lon + p2 + d * 0.12) + 0.25 * Math.sin(11 * lon + p1));
    state.cloudShow[i] = (0.5 + 0.6 * wet * patch * bump(d, at, 160 * wide) - 0.4 * dry * bump(a, dryAt, 110) + 0.45 * mid * bump(a, midAt, 260)) / state.cloudBand[i]!;
  }
  computeWind(world, state, r);
  computeCurrents(world, state);
  return state;
}

/** Zonal wind bands (trades, westerlies, polar easterlies) with seeded variation. */
export function computeWind(world: World, state: ClimateState, rng: RNG): void {
  const { grid } = world;
  const { pos, lat, neighbors, ncount, count } = grid;
  const noise = makeNoise(rng.fork('wind'));
  for (let i = 0; i < count; i++) {
    const a = (Math.abs(lat[i]!) * 180) / Math.PI;
    const s = lat[i]! >= 0 ? 1 : -1;
    let u: number, v: number;
    if (a < 30) {
      u = -Math.cos((a / 30) * (Math.PI / 2));
      v = -s * 0.35 * Math.sin((a / 30) * Math.PI);
    } else if (a < 60) {
      u = Math.sin(((a - 30) / 30) * Math.PI);
      v = s * 0.3 * Math.sin(((a - 30) / 30) * Math.PI);
    } else {
      u = -0.6 * Math.sin(((a - 60) / 30) * Math.PI);
      v = -s * 0.25 * Math.sin(((a - 60) / 30) * Math.PI);
    }
    const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
    u += 0.35 * noise(x * 2.2, y * 2.2, z * 2.2);
    v += 0.35 * noise(x * 2.2 + 17, y * 2.2, z * 2.2);
    world.windE[i] = u;
    world.windN[i] = v;
    // east and north tangent vectors
    let ex = -z, ez = x;
    const el = Math.hypot(ex, ez) || 1;
    ex /= el; ez /= el;
    const nx = -y * ez, ny = ez * x - ex * z, nz = y * ex;
    const wx = u * ex + v * nx, wy = v * ny, wz = u * ez + v * nz;
    let best = -1, bestDot = -Infinity;
    for (let j = 0; j < ncount[i]!; j++) {
      const nb = neighbors[i * 6 + j]!;
      const d = -((pos[nb * 3]! - x) * wx + (pos[nb * 3 + 1]! - y) * wy + (pos[nb * 3 + 2]! - z) * wz);
      if (d > bestDot) { bestDot = d; best = nb; }
    }
    state.upwind[i] = best;
  }
}

/**
 * Surface currents of the sea. The wind pushes the water, the planet's spin turns it (to the right in the north,
 * to the left in the south), and where it meets land it runs along the coast. Call again whenever the coasts change.
 */
export function computeCurrents(world: World, state: ClimateState): void {
  const { grid, elevation, seaLevel, windE, windN } = world;
  const { pos, lat, neighbors, ncount, count } = grid;
  if (!state.upcurrent || state.upcurrent.length !== count) state.upcurrent = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    if (elevation[i]! > seaLevel) { state.upcurrent[i] = i; continue; }
    const turn = lat[i]! >= 0 ? -0.7 : 0.7;
    const c = Math.cos(turn), sn = Math.sin(turn);
    const u = windE[i]! * c - windN[i]! * sn, v = windE[i]! * sn + windN[i]! * c;
    const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
    let ex = -z, ez = x;
    const el = Math.hypot(ex, ez) || 1;
    ex /= el; ez /= el;
    const nx = -y * ez, ny = ez * x - ex * z, nz = y * ex;
    const wx = u * ex + v * nx, wy = v * ny, wz = u * ez + v * nz;
    // the water here came from whichever neighbouring sea cell lies most nearly upstream; land does not count
    let best = i, bestDot = 0;
    for (let j = 0; j < ncount[i]!; j++) {
      const nb = neighbors[i * 6 + j]!;
      if (elevation[nb]! > seaLevel) continue;
      const d = -((pos[nb * 3]! - x) * wx + (pos[nb * 3 + 1]! - y) * wy + (pos[nb * 3 + 2]! - z) * wz);
      if (d > bestDot) { bestDot = d; best = nb; }
    }
    state.upcurrent[i] = best;
  }
}

export function longCycleOffset(state: ClimateState, simYear: number): number {
  let o = 0;
  for (const c of state.cycles) o += c.amp * Math.sin((simYear / c.period) * Math.PI * 2 + c.phase);
  return o;
}

/**
 * Update temperature for the current moment.
 * yearFrac: 0..1 position in the year, or -1 to use the annual mean (high time speeds).
 */
export function updateTemperature(world: World, state: ClimateState, simYear: number, yearFrac: number): void {
  const { grid, elevation, seaLevel, temperature } = world;
  const { lat, count, neighbors, ncount } = grid;
  const iceFeedback = -6 * Math.max(0, state.iceFraction - 0.08);
  const solar = (state.solar - 1) * 60;
  state.globalOffset = longCycleOffset(state, simYear) + state.greenhouse - state.aerosol + state.forced + iceFeedback + solar;
  const seasonal = yearFrac >= 0;
  const season = seasonal ? Math.sin(yearFrac * Math.PI * 2) : 0;
  const tiltScale = state.tilt / 0.41;
  const scratch = state.scratch;
  for (let i = 0; i < count; i++) {
    const sl = state.sinLat[i]!;
    const h = elevation[i]! - seaLevel;
    const land = h > 0;
    let t = 27.5 - 49 * sl * sl + state.globalOffset + state.jitter[i]!;
    if (seasonal) t += season * sl * tiltScale * (land ? 15 : 5);
    if (land) t -= 6.2 * h;
    scratch[i] = t;
  }
  // maritime smoothing
  if (!state.upcurrent || state.upcurrent.length !== count || !state.sst || state.sst.length !== count) { computeCurrents(world, state); state.sst = new Float32Array(count).fill(NaN); }
  const upc = state.upcurrent, sst = state.sst;
  let anomalyBest = 0, anomalyCell = -1;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    let s = 0;
    const nc = ncount[i]!;
    for (let j = 0; j < nc; j++) s += scratch[neighbors[i * 6 + j]!]!;
    let t = scratch[i]! * 0.7 + (s / nc) * 0.3;
    // ocean currents: the sea remembers its temperature and hands it on downstream, so warm water reaches cold coasts
    // and cold water runs down toward the tropics along the shores that steer it
    if (elevation[i]! <= seaLevel) {
      const up = upc[i]!, up2 = upc[up]!;
      const before = Number.isFinite(sst[i]!) ? sst[i]! : t;
      const s1 = Number.isFinite(sst[up]!) ? sst[up]! : scratch[up]!, s2 = Number.isFinite(sst[up2]!) ? sst[up2]! : scratch[up2]!;
      const now = before + (t - before) * 0.22 + (s1 * 0.6 + s2 * 0.4 - before) * 0.45;
      sst[i] = now;
      const local = t;
      t = t * 0.45 + now * 0.55;
      const anomaly = Math.abs(t - local);
      if (anomaly > anomalyBest) { anomalyBest = anomaly; anomalyCell = i; }
    } else sst[i] = t;
    // a ring system casts a cold stripe of shadow along the equator
    if (state.ringShadow > 0) { const sl = state.sinLat[i]!; t -= state.ringShadow * Math.exp(-(sl * sl) / 0.006); }
    temperature[i] = t;
    sum += t;
    // slow-moving annual mean for biome classification
    state.meanT[i] = seasonal ? state.meanT[i]! + (t - season * state.sinLat[i]! * tiltScale * (elevation[i]! > seaLevel ? 15 : 5) - state.meanT[i]!) * 0.2 : t;
  }
  state.meanTemp = sum / count;
  state.currentAnomaly = anomalyBest;
  state.currentCell = anomalyCell;
}

/** Advect humidity along the wind and rain it out. A few passes per call. */
export function updateMoisture(world: World, state: ClimateState, passes: number): void {
  const { grid, elevation, seaLevel, moisture, vegetation } = world;
  const { count } = grid;
  const { humidity, upwind, meanT, scratch } = state;
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < count; i++) {
      const t = meanT[i]!;
      const h = elevation[i]! - seaLevel;
      if (h <= 0) {
        const evap = t < -2 ? 0.08 : Math.max(0.12, Math.min(1, 0.3 + 0.024 * t));
        scratch[i] = humidity[upwind[i]!]! * 0.5 + evap * 0.5;
        continue;
      }
      const up = upwind[i]!;
      const hin = humidity[up]!;
      const lift = Math.max(0, h - Math.max(0, elevation[up]! - seaLevel));
      const band = state.rainBand[i]!;
      const cold = Math.max(0.15, Math.min(1, (t + 18) / 34));
      const rainRate = Math.min(0.9, (0.07 + 0.55 * Math.min(1.2, lift)) * band);
      const rain = hin * rainRate;
      moisture[i] = Math.min(1, rain * 6.5 * cold + vegetation[i]! * 0.06);
      scratch[i] = Math.max(0, hin - rain * 0.8 + vegetation[i]! * 0.012);
    }
    humidity.set(scratch);
  }
  const cloud = world.cloud;
  for (let i = 0; i < count; i++) {
    if (elevation[i]! <= seaLevel) moisture[i] = Math.min(1, humidity[i]!);
    const band = state.cloudBand[i]!;
    const target = Math.max(0, Math.min(1, humidity[i]! * band * 0.95 + (elevation[i]! > seaLevel ? moisture[i]! * 0.3 : 0)));
    cloud[i] = cloud[i]! + (target - cloud[i]!) * 0.25;
  }
}

/** Snow and ice build up where it is cold and melt where it is warm. dt in years. */
export function updateSnow(world: World, state: ClimateState, dtYears: number): void {
  const { grid, elevation, seaLevel, snow, temperature, moisture } = world;
  const count = grid.count;
  const k = Math.min(1, dtYears * 0.5 + 0.02);
  let ice = 0;
  for (let i = 0; i < count; i++) {
    const t = temperature[i]!;
    const land = elevation[i]! > seaLevel;
    // equilibrium depth for this temperature; approached at rate k
    let target = 0;
    if (t < 0) target = Math.min(land ? 60 : 3, -t * (land ? 0.6 + 2.5 * moisture[i]! : 0.25));
    snow[i] = snow[i]! + (target - snow[i]!) * (target > snow[i]! ? k * 0.5 : k);
    if (snow[i]! > 0.6) ice++;
  }
  state.iceFraction = ice / count;
}

export function classifyBiomes(world: World, state: ClimateState): void {
  const { grid, elevation, seaLevel, moisture, biome, snow, ash } = world;
  const { meanT } = state;
  for (let i = 0; i < grid.count; i++) {
    const h = elevation[i]! - seaLevel;
    const t = meanT[i]!;
    const m = moisture[i]!;
    let b: Biome;
    if (h <= 0) {
      if (t < -3.5) b = Biome.SeaIce;
      else if (h < -1.6) b = Biome.DeepOcean;
      else if (h < -0.22) b = Biome.Ocean;
      else b = Biome.Shallows;
    } else if (ash[i]! > 0.65) b = Biome.Volcanic;
    else if (t < -9 || snow[i]! > 12) b = Biome.Ice;
    else if (h > 3.4 && t < 4) b = Biome.Alpine;
    else if (t < -1.5) b = Biome.Tundra;
    else if (h < 0.035 && t > 4) b = Biome.Beach;
    else if (t < 6.5) b = m > 0.28 ? Biome.Taiga : Biome.Tundra;
    else if (t < 20) {
      if (m > 0.8 && h < 0.12) b = Biome.Wetland;
      else if (m > 0.5) b = Biome.TemperateForest;
      else if (m > 0.27) b = Biome.Grassland;
      else if (m > 0.13) b = Biome.Shrubland;
      else b = h < 0.12 && t > 14 ? Biome.SaltFlat : Biome.Desert;
    } else if (m > 0.85 && h < 0.12) b = Biome.Wetland;
    else if (m > 0.6) b = Biome.Rainforest;
    else if (m > 0.3) b = Biome.Savanna;
    else if (m > 0.14) b = Biome.Shrubland;
    // hot dry lowlands are the beds of dried-up seas: salt flats
    else b = h < 0.12 ? Biome.SaltFlat : Biome.Desert;
    biome[i] = b;
  }
}
