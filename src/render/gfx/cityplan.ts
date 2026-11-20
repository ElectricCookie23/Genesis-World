// The plan of a town (system E11). A town is not a scatter of buildings: it has roads that lead
// somewhere, streets that branch off them, plots along the streets, quarters with different
// work, and walls from the times it was threatened. The plan is computed from the place (where
// the water is, which way the land rises, where the neighbouring towns lie) and from what has
// happened there (a school, a harbour, wars), and from nothing else: it is never stored. Plots
// carry a build order, so a town that grows fills in along its streets in the same order every
// time it is drawn, and a time-lapse of its growth is simply the same plan cut at more plots.
//
// Plan units: one unit is about the frontage of a house. East is +x, north is +y.

export type District = 'market' | 'school' | 'homes' | 'workshops' | 'docks';

export interface CitySite {
  /** A number that is this town's alone (from the world's seed and the town's id). */
  seed: number;
  /** Directions of the roads out of town toward its neighbours (radians, 0 = east, counter-clockwise), most important first. */
  roads: number[];
  /** Direction of the nearest open water, and how far the shore is in plan units (Infinity inland). */
  coast: number;
  shore: number;
  /** Which way the land rises, and how steeply (0 flat .. 1 a mountainside). */
  uphill: number;
  slope: number;
  /** What has happened here. */
  /** Has a school: a place of learning on the high ground, once its people write. */
  school: boolean;
  port: boolean;
  capital: boolean;
  /** Each time it built a wall: how many plots the town had then. */
  walls: number[];
}

export interface Street {
  points: [number, number][];
  /** 0 a road out of town, 1 a street, 2 a lane. */
  rank: number;
  /** The town has this street once it has this many plots. */
  order: number;
}

export interface Plot {
  x: number;
  y: number;
  /** Facing: the building looks onto its street. */
  yaw: number;
  district: District;
  /** 1 at the centre .. 0 at the edge of the full plan. */
  central: number;
  /** Index of its street. */
  street: number;
}

export interface Wall {
  /** The line of the wall; a gap in the numbers (NaN) is a stretch not built, where the water is. */
  points: [number, number][];
  gates: [number, number][];
  /** The town had this many plots when it built the wall, and has it for ever after. */
  order: number;
}

export interface CityPlan {
  /** In build order: a town of n plots is the first n. */
  plots: Plot[];
  streets: Street[];
  walls: Wall[];
  /** Places kept open round the middle of town for great works (system E12): a monument stands on each one that has been built. */
  monuments: [number, number][];
  /** Where the school stands (if the site has one) and where the harbour is (if it has one). */
  school: [number, number] | null;
  harbour: [number, number] | null;
}

/** A small repeatable random stream. */
function stream(seed: number): () => number {
  let a = (seed | 0) || 0x9e3779b9;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const turn = (a: number): number => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

/** The largest town the plan is drawn for. */
export const MAX_PLOTS = 320;

/**
 * Lay out a town. `site` says what the place is like and what has happened there; the result is the whole
 * town as it would be at its largest, with a build order on every plot and street.
 */
export function planCity(site: CitySite): CityPlan {
  const rnd = stream(site.seed);
  const coastal = Number.isFinite(site.shore);
  const cx = Math.cos(site.coast), cy = Math.sin(site.coast);
  const ux = Math.cos(site.uphill), uy = Math.sin(site.uphill);
  /** Dry land: this side of the shore (the shore wanders a little, so a waterfront is not a ruled line). */
  const dry = (x: number, y: number, margin = 0): boolean => !coastal || x * cx + y * cy < site.shore - margin + 0.6 * Math.sin((x * -cy + y * cx) * 0.45 + site.seed % 7);
  const reach = 24;

  // ---- the roads out of town: toward the neighbours, to the water, up to the school
  const headings: number[] = [];
  const add = (a: number, apart = 0.55) => { if (headings.every((h) => Math.abs(turn(h - a)) > apart)) headings.push(a); };
  for (const r of site.roads.slice(0, 4)) add(r);
  if (coastal && (site.port || site.shore < 14)) add(site.coast, 0.4);
  if (site.school && site.slope > 0.05) add(site.uphill, 0.4);
  // every town has at least a way in and a way out, and a crossroads if it is a capital
  for (let k = 0; headings.length < (site.capital ? 4 : 2) && k < 12; k++) add((headings[0] ?? rnd() * 6.28) + Math.PI * (k % 2 ? 0.5 : 1) + (rnd() - 0.5) * 0.5 + k * 0.4);

  const streets: Street[] = [];
  /** How far from the centre along the streets each street begins: what build order is counted from. */
  const startAt: number[] = [];
  const grow = (x: number, y: number, heading: number, length: number, rank: number, wander: number, from: number): number => {
    const pts: [number, number][] = [[x, y]];
    let h = heading;
    for (let s = 0; s < length; s++) {
      // a road bends with the land: on a slope it eases round toward the contour instead of going straight up
      const up = Math.cos(h) * ux + Math.sin(h) * uy;
      h += (rnd() - 0.5) * wander - site.slope * 0.35 * up * Math.sign(Math.cos(h) * -uy + Math.sin(h) * ux || 1);
      const nx = x + Math.cos(h), ny = y + Math.sin(h);
      if (!dry(nx, ny, rank === 0 ? -0.2 : 0.4)) break;
      if (Math.hypot(nx, ny) > reach) break;
      x = nx; y = ny;
      pts.push([x, y]);
    }
    if (pts.length < 2) return -1;
    streets.push({ points: pts, rank, order: 0 });
    startAt.push(from);
    return streets.length - 1;
  };
  for (const h of headings) grow(0, 0, h, reach, 0, 0.16, 0);
  const mains = streets.length;
  // ---- streets off the roads, alternately to either side, closer together near the centre
  for (let m = 0; m < mains; m++) {
    const road = streets[m]!.points;
    let side = rnd() < 0.5 ? 1 : -1;
    for (let i = 2 + Math.floor(rnd() * 2); i < road.length - 1; i += 2 + Math.floor(rnd() * 2 + i * 0.06)) {
      const [x, y] = road[i]!, [px, py] = road[i - 1]!;
      const along = Math.atan2(y - py, x - px);
      const s = grow(x, y, along + side * (Math.PI / 2 + (rnd() - 0.5) * 0.4), 3 + Math.floor(rnd() * 5 + Math.max(0, 8 - i * 0.4)), 1, 0.2, i);
      side = -side;
      if (s < 0) continue;
      // and lanes off the longer streets
      const st = streets[s]!.points;
      for (let j = 2; j < st.length - 1; j += 3 + Math.floor(rnd() * 2)) {
        const [lx, ly] = st[j]!, [qx, qy] = st[j - 1]!;
        grow(lx, ly, Math.atan2(ly - qy, lx - qx) + (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2 + (rnd() - 0.5) * 0.3), 2 + Math.floor(rnd() * 4), 2, 0.25, i + j);
      }
    }
  }

  // ---- the special places
  const harbourRoad = coastal ? streets.findIndex((s, i) => i < mains && Math.abs(turn(Math.atan2(s.points[1]![1], s.points[1]![0]) - site.coast)) < 0.5) : -1;
  const harbour: [number, number] | null = harbourRoad >= 0 ? streets[harbourRoad]!.points[streets[harbourRoad]!.points.length - 1]! : null;
  const school: [number, number] | null = site.school ? [ux * (3.2 + 2 * site.slope) + (rnd() - 0.5), uy * (3.2 + 2 * site.slope) + (rnd() - 0.5)] : null;
  if (school && !dry(school[0], school[1], 1)) { school[0] = -cx * 3.5; school[1] = -cy * 3.5; }
  // the quarter of smoke and noise lies along one road, away from the school
  const workRoad = mains > 1 ? (harbourRoad === 0 ? 1 : mains - 1) : -1;

  // ---- plots along both sides of every street
  const taken = new Map<number, [number, number][]>();
  const key = (x: number, y: number) => Math.floor(x / 1.2) * 4099 + Math.floor(y / 1.2);
  const free = (x: number, y: number): boolean => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = taken.get(key(x + dx * 1.2, y + dy * 1.2));
      if (list) for (const [qx, qy] of list) if ((qx - x) * (qx - x) + (qy - y) * (qy - y) < 0.98) return false;
    }
    return true;
  };
  const claim = (x: number, y: number) => { const k = key(x, y); const list = taken.get(k); if (list) list.push([x, y]); else taken.set(k, [[x, y]]); };
  // streets themselves take up room: nothing is built on a roadway
  const onRoad = (x: number, y: number, own: number): boolean => {
    for (let s = 0; s < streets.length; s++) {
      if (s === own) continue;
      const p = streets[s]!.points;
      for (let i = 0; i < p.length; i += 1) { const dx = p[i]![0] - x, dy = p[i]![1] - y; if (dx * dx + dy * dy < 0.36) return true; }
    }
    return false;
  };
  if (school) claim(school[0], school[1]);
  // room for great works: between the roads, a little way out from the square
  const monuments: [number, number][] = [];
  const bearings = streets.slice(0, mains).map((s) => Math.atan2(s.points[1]![1], s.points[1]![0])).sort((a, b) => a - b);
  for (let k = 0; k < bearings.length && monuments.length < 5; k++) {
    const a = bearings[k]!, b = k + 1 < bearings.length ? bearings[k + 1]! : bearings[0]! + Math.PI * 2;
    if (b - a < 0.7) continue;
    const mid = (a + b) / 2, r = 2.3 + rnd() * 0.9;
    const x = Math.cos(mid) * r, y = Math.sin(mid) * r;
    if (!dry(x, y, 1) || !free(x, y)) continue;
    claim(x, y); claim(x + 0.6, y); claim(x - 0.6, y); claim(x, y + 0.6); claim(x, y - 0.6);
    monuments.push([x, y]);
  }
  const raw: { plot: Plot; score: number }[] = [];
  for (let s = 0; s < streets.length; s++) {
    const st = streets[s]!;
    const p = st.points;
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1]!, [x1, y1] = p[i]!;
      const along = Math.atan2(y1 - y0, x1 - x0);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      for (const side of [1, -1]) {
        const off = 0.78 + (st.rank === 0 ? 0.12 : 0);
        const x = mx + Math.cos(along + side * Math.PI / 2) * off, y = my + Math.sin(along + side * Math.PI / 2) * off;
        const fromCentre = Math.hypot(x, y);
        // the market square at the crossing stays open
        if (fromCentre < 1.25 || !dry(x, y, 0.5) || !free(x, y) || onRoad(x, y, s)) continue;
        claim(x, y);
        const walk = startAt[s]! + i;
        const nearSchool = school ? Math.hypot(x - school[0], y - school[1]) : 99;
        const nearWater = harbour ? Math.hypot(x - harbour[0], y - harbour[1]) : 99;
        const district: District = fromCentre < 3.6 ? 'market' : nearSchool < 2.6 ? 'school' : nearWater < 4.2 ? 'docks' : (s === workRoad || (startAt[s] !== 0 && fromCentre > 7 && Math.abs(turn(Math.atan2(y, x) - Math.atan2(streets[Math.max(0, workRoad)]!.points[1]![1], streets[Math.max(0, workRoad)]!.points[1]![0]))) < 0.6)) && fromCentre > 5 ? 'workshops' : 'homes';
        // what is built first: along the roads, near the middle, near the water if there is a harbour
        const score = walk * (st.rank === 0 ? 0.75 : st.rank === 1 ? 1 : 1.25) + (district === 'docks' ? -2 : 0) + rnd() * 2.2;
        raw.push({ plot: { x, y, yaw: along + (side > 0 ? -Math.PI / 2 : Math.PI / 2), district, central: 0, street: s }, score });
      }
    }
  }
  raw.sort((a, b) => a.score - b.score);
  const plots = raw.slice(0, MAX_PLOTS).map((r) => r.plot);
  let far = 1;
  for (const p of plots) far = Math.max(far, Math.hypot(p.x, p.y));
  for (const p of plots) p.central = 1 - Math.hypot(p.x, p.y) / far;
  // a street exists from the moment its first plot is built
  const first = new Array<number>(streets.length).fill(MAX_PLOTS + 1);
  plots.forEach((p, i) => { if (first[p.street]! > i) first[p.street] = i; });
  streets.forEach((s, i) => { s.order = s.rank === 0 ? 0 : first[i]!; });

  // ---- walls: each one round the town as it was when the wall was built
  const walls: Wall[] = [];
  for (const size of [...site.walls].sort((a, b) => a - b)) {
    const n = Math.max(6, Math.min(plots.length, Math.round(size)));
    const radii = plots.slice(0, n).map((p) => Math.hypot(p.x, p.y)).sort((a, b) => a - b);
    const r = (radii[Math.floor(radii.length * 0.9)] ?? 3) + 1.3;
    if (walls.length && r < (walls[walls.length - 1]!.points.reduce((m, p) => Math.max(m, Math.hypot(p[0], p[1]) || 0), 0)) + 2.5) continue;
    const pts: [number, number][] = [];
    const lobes = 3 + Math.floor(rnd() * 3), phase = rnd() * 6.28;
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const rr = r * (1 + 0.1 * Math.sin(a * lobes + phase));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      pts.push(dry(x, y, 0.3) ? [x, y] : [NaN, NaN]);
    }
    const gates: [number, number][] = [];
    for (let m = 0; m < mains; m++) {
      const road = streets[m]!.points;
      const g = road.find((p) => Math.hypot(p[0], p[1]) >= r * 0.96);
      if (g) gates.push(g);
    }
    walls.push({ points: pts, gates, order: n });
  }
  return { plots, streets, walls, monuments, school, harbour };
}

/** What a plan looks like in a few numbers: used to tell two towns apart. */
export interface PlanShape {
  plots: number;
  /** Share of plots in each quarter. */
  share: Record<District, number>;
  /** How far from round the town is: 1 a circle, more for a town strung out along a road or a shore. */
  stretch: number;
  /** Where its middle lies relative to the crossing (a town on a shore leans inland). */
  lean: [number, number];
  walls: number;
  roads: number;
}

export function planShape(plan: CityPlan, plots = plan.plots.length): PlanShape {
  const list = plan.plots.slice(0, plots);
  const share: Record<District, number> = { market: 0, school: 0, homes: 0, workshops: 0, docks: 0 };
  let mx = 0, my = 0;
  for (const p of list) { share[p.district] += 1 / Math.max(1, list.length); mx += p.x; my += p.y; }
  mx /= Math.max(1, list.length); my /= Math.max(1, list.length);
  let xx = 0, yy = 0, xy = 0;
  for (const p of list) { xx += (p.x - mx) ** 2; yy += (p.y - my) ** 2; xy += (p.x - mx) * (p.y - my); }
  const t = xx + yy, d = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
  return { plots: list.length, share, stretch: Math.sqrt((t + d) / Math.max(1e-6, t - d)), lean: [mx, my], walls: plan.walls.filter((w) => w.order <= plots).length, roads: plan.streets.filter((s) => s.rank === 0).length };
}

// ---------------------------------------------------------------- construction (system E12)

export interface Site {
  /** Which plot of the town (an index into the plan's plots, below the town's size). */
  plot: number;
  /** How far along the work is, 0 .. 1. */
  progress: number;
  /** How many years this job takes from first trench to last tile. */
  years: number;
  /** Which of the town's building crews is on it. */
  crew: number;
}

/**
 * How long each of a town's crews spends on one job: the first builds houses (a season), the second halls and
 * towers (a year and a half), the third the largest buildings (six years). At 1x a day passes each second, so
 * a house goes up in a minute and a half of watching; at 10x a year passes each second, houses are finished
 * too fast to follow, and it is the six-year jobs and the great works that can be watched.
 */
export const CREW_YEARS = [0.25, 1.5, 6];

/** A job is worth drawing only if watching it takes a few seconds at the present speed. */
export function watchable(site: Site, yearsPerSecond: number): boolean {
  return yearsPerSecond <= 0 || site.years / yearsPerSecond >= 3;
}

export const STAGES = ['foundation', 'frame', 'walls', 'roof', 'details'] as const;

/** The stage a job is at. */
export function stageOf(progress: number): (typeof STAGES)[number] {
  return progress < 0.15 ? 'foundation' : progress < 0.4 ? 'frame' : progress < 0.75 ? 'walls' : progress < 0.93 ? 'roof' : 'details';
}

function mix32(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

/**
 * The building sites of a town at a moment (system E12). A town is always being built: each crew takes one
 * plot at a time, works on it for its span of years, then moves to another. Which plot is a matter of the
 * town, the crew and the count of jobs it has done, so the same town at the same date always shows the same
 * work at the same stage, with nothing stored. Half the time a crew is at the growing edge (the newest tenth
 * of the town); otherwise it is rebuilding something older. `central(i)` says how near the middle plot i is,
 * so the crew that builds great works chooses a place for them.
 */
export function buildingSites(seed: number, plots: number, year: number, central?: (plot: number) => number): Site[] {
  const out: Site[] = [];
  if (plots < 2) return out;
  const crews = plots >= 80 ? 3 : plots >= 20 ? 2 : 1;
  for (let j = 0; j < crews; j++) {
    const span = CREW_YEARS[j]!;
    // crews do not all start on the same day
    const t = year / span + (mix32(seed, j, 0x51e) % 1000) / 1000;
    const job = Math.floor(t);
    let plot = -1;
    for (let attempt = 0; attempt < 6 && plot < 0; attempt++) {
      const h = mix32(seed, j * 131 + attempt, job);
      const edge = (h & 1) === 0;
      // the great-works crew builds toward the middle (the older half of the town); the others anywhere, often at the edge
      const p = j === 2 ? (h >>> 1) % Math.ceil(plots / 2) : edge ? plots - 1 - ((h >>> 1) % Math.max(1, Math.ceil(plots / 10))) : (h >>> 1) % plots;
      if (j === 2 && central && central(p) < 0.5 && attempt < 4) continue;
      // no two crews on one plot
      if (out.some((s) => s.plot === p)) continue;
      plot = p;
    }
    // (failing all else, the first plot no one is working on)
    for (let p = 0; plot < 0 && p < plots; p++) if (!out.some((s) => s.plot === p)) plot = p;
    if (plot >= 0) out.push({ plot, progress: t - job, years: span, crew: j });
  }
  return out;
}
