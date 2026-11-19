// Slow shaping of the land by water and life: rivers cut canyons where they run steep and build
// deltas where they meet the sea; volcanic islands on the sea floor sink once their fire has gone
// out; and coral keeps pace with the sinking, leaving a ring of reef around a lagoon: an atoll.
import type { World } from './world';

export interface LandformResult {
  /** Cells cut deeper by rivers this step. */
  canyon: number;
  /** Sea cells raised by river mud this step, and how many of them became land. */
  delta: number;
  newLand: number;
  /** Reef cells that kept themselves at the surface this step. */
  reefHeld: number;
  /** Cells that are ringed reef around deeper water: atoll rims. */
  atollRim: number;
}

/**
 * amount is a dimensionless step size (about 1 for a 15,000 year step at full strength).
 * Needs world.flow and world.downhill to be current (computeDrainage).
 */
export function shapeLandforms(world: World, amount: number): LandformResult {
  const { grid, elevation, flow, downhill, seaLevel, reef, plates, plate, temperature } = world;
  const { neighbors, ncount, count } = grid;
  const res: LandformResult = { canyon: 0, delta: 0, newLand: 0, reefHeld: 0, atollRim: 0 };
  // ---- rivers: the power of a stream grows with its water and its fall
  for (let i = 0; i < count; i++) {
    const d = downhill[i]!;
    const e = elevation[i]!;
    if (d < 0 || e <= seaLevel) continue;
    const fl = flow[i]!;
    if (fl < 2.5) continue;
    const below = elevation[d]!;
    const fall = e - below;
    if (below > seaLevel) {
      if (fall < 0.08) continue;
      // cut down, but never below the bed downstream
      const cut = Math.min(fall - 0.03, 0.0035 * Math.sqrt(fl) * fall * amount);
      if (cut > 0) { elevation[i] = e - cut; res.canyon++; }
    } else {
      // the river has reached the sea: its mud settles in the shallows and builds them up toward the surface
      const mud = Math.min(0.02, 0.0012 * Math.sqrt(fl) * amount);
      const target = seaLevel + 0.015;
      if (below < target) {
        const was = below;
        elevation[d] = Math.min(target, below + mud);
        res.delta++;
        if (was <= seaLevel && elevation[d]! > seaLevel) res.newLand++;
      }
      // a big river spreads its mud to the sea cells beside the mouth as well: the delta fans out
      if (fl > 12) for (let k = 0; k < ncount[d]!; k++) {
        const nb = neighbors[d * 6 + k]!;
        const en = elevation[nb]!;
        if (en <= seaLevel && en > seaLevel - 0.25) { elevation[nb] = Math.min(seaLevel - 0.005, en + mud * 0.4); res.delta++; }
      }
    }
  }
  // ---- volcanic islands on ocean crust sink slowly as the crust under them cools
  for (let i = 0; i < count; i++) {
    const e = elevation[i]!;
    if (e < seaLevel - 0.6 || e > seaLevel + 2.5 || plates[plate[i]!]!.continental) continue;
    // only small islands: land with open sea close on every side
    let sea = 0;
    for (let k = 0; k < ncount[i]!; k++) if (elevation[neighbors[i * 6 + k]!]! <= seaLevel - 0.3) sea++;
    if (sea < 4 && e > seaLevel) continue;
    elevation[i] = e - 0.001 * amount;
  }
  // ---- coral grows upward as fast as the island sinks, as long as the water is warm and the reef alive
  for (let i = 0; i < count; i++) {
    if (reef[i]! < 0.25) continue;
    const e = elevation[i]!;
    const depth = seaLevel - e;
    if (depth < 0.012 || depth > 0.35 || temperature[i]! < 18) continue;
    elevation[i] = Math.min(seaLevel - 0.012, e + 0.0024 * amount * reef[i]!);
    res.reefHeld++;
  }
  // ---- count atoll rims: living reef just under the surface with deeper water on one side and a lagoon or open sea on the other, no land
  for (let i = 0; i < count; i++) {
    if (reef[i]! < 0.25 || seaLevel - elevation[i]! > 0.06) continue;
    let deep = 0, land = 0;
    for (let k = 0; k < ncount[i]!; k++) { const en = elevation[neighbors[i * 6 + k]!]!; if (en > seaLevel) land++; else if (seaLevel - en > 0.12) deep++; }
    if (!land && deep >= 2) res.atollRim++;
  }
  return res;
}

/**
 * Dust lifted from dry land by strong wind falls on the sea downwind and feeds the plankton there.
 * Returns the share of sea cells that received dust; out[i] is the dust each cell received (0..1).
 */
export function dustFall(world: World, out: Float32Array): number {
  const { grid, elevation, seaLevel, moisture, windE, windN, vegetation } = world;
  const { pos, neighbors, ncount, count } = grid;
  out.fill(0);
  let fed = 0;
  for (let i = 0; i < count; i += 3) {
    if (elevation[i]! <= seaLevel || moisture[i]! > 0.16 || vegetation[i]! > 0.2) continue;
    const we = windE[i]!, wn = windN[i]!;
    const speed = Math.hypot(we, wn);
    if (speed < 0.6) continue;
    // walk downwind until the sea is under the dust, a dozen cells at most
    const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
    const el = Math.hypot(x, z) || 1;
    const dx = (-z / el) * we + ((-y * x) / el) * wn, dy = el * wn, dz = (x / el) * we + ((-y * z) / el) * wn;
    let cur = i;
    for (let step = 0; step < 14; step++) {
      let best = cur, bd = -Infinity;
      for (let k = 0; k < ncount[cur]!; k++) {
        const nb = neighbors[cur * 6 + k]!;
        const d = (pos[nb * 3]! - pos[cur * 3]!) * dx + (pos[nb * 3 + 1]! - pos[cur * 3 + 1]!) * dy + (pos[nb * 3 + 2]! - pos[cur * 3 + 2]!) * dz;
        if (d > bd) { bd = d; best = nb; }
      }
      cur = best;
      if (elevation[cur]! <= seaLevel) {
        // the plume widens as it goes: the cell and its neighbours all get some
        const give = Math.min(1, speed * 0.5) * (1 - step / 16);
        if (out[cur] === 0) fed++;
        out[cur] = Math.min(1, out[cur]! + give);
        for (let k = 0; k < ncount[cur]!; k++) { const nb = neighbors[cur * 6 + k]!; if (elevation[nb]! <= seaLevel) out[nb] = Math.min(1, out[nb]! + give * 0.4); }
      }
    }
  }
  return fed;
}
