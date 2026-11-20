// Disasters in cities (system E20). A town burns, is shaken down, is flooded or is buried in ash. How much
// of it is lost depends on what it is built of and where it stands, and what is built afterwards is not
// what stood before: stone for timber after a great fire, low and braced after an earthquake, floors on
// posts or the low quarter given up after a flood, the side toward the mountain left to the ash.
//
// Everything here is a pure function, used by the history engine (how much is lost, what the answer is)
// and by the page (what has become of each plot of the town in a given year). Nothing is stored about
// single buildings: a town keeps only its scars.

export const CALAMITIES = ['fire', 'quake', 'flood', 'ash'] as const;
export type CalamityKind = (typeof CALAMITIES)[number];

/** How a town builds again after a calamity: as before, in stone, low and braced, raised on posts, or elsewhere. */
export const REBUILDS = ['', 'stone', 'braced', 'raised', 'moved'] as const;
export type Rebuild = (typeof REBUILDS)[number];

/** What a calamity left on a town: when, what kind, how much of the town was lost (0..1) and how it built again. */
export interface Scar {
  year: number;
  kind: CalamityKind;
  share: number;
  /** The event that records it, or -1. */
  eventId: number;
  rebuilt: Rebuild;
  /** The cell the harm came from (the mountain), if it came from somewhere. */
  toward?: number;
}

/** The building laws of a country: the year each was made and the event that records it. */
export interface Codes {
  fire?: { year: number; eventId: number };
  quake?: { year: number; eventId: number };
  flood?: { year: number; eventId: number };
}

/** The ground a town stands on, as far as calamities care: each 0..1. */
export interface Ground {
  /** How dry the air is (a dry town burns). */
  dry: number;
  /** How low it lies by a river or the sea (a low town floods). */
  low: number;
  /** How near the grinding edge of a plate it stands (it is shaken). */
  fault: number;
  /** How near a volcano it stands. */
  peak: number;
}

const sat = (x: number): number => Math.max(0, Math.min(1, x));

/** How much of a town is timber and thatch, by what it knows: all of a village, little of a city of steel. */
export function woodShare(tech: number): number {
  return 1 - 0.85 * sat((tech - 0.42) / 0.5);
}

/**
 * How badly unbraced walls fall when the ground shakes: huts of poles and hide hardly at all, tall masonry worst,
 * steel frames little.
 */
export function brittle(tech: number): number {
  const up = sat((tech - 0.28) / 0.3), down = sat((tech - 0.8) / 0.2);
  return 0.15 + 0.85 * up * (1 - 0.8 * down);
}

/** The chance per year of each calamity for a town of this crowding (people against room, 0..1+) on this ground. */
export function hazards(tech: number, crowd: number, ground: Ground, codes: Codes | undefined): Record<CalamityKind, number> {
  return {
    fire: (1 / 300) * sat(crowd) * (0.4 + ground.dry) * woodShare(tech) * (codes?.fire ? 0.35 : 1),
    quake: ground.fault > 0.25 ? ground.fault / 650 : 0,
    flood: (ground.low * ground.low) / 480 * (codes?.flood ? 0.4 : 1),
    ash: (ground.peak * ground.peak) / 2600,
  };
}

/**
 * How much of the town a calamity of this strength (0..1) destroys. It depends on what the town is built of
 * and where it stands, and on whether its country has learned from the last one.
 */
export function damage(kind: CalamityKind, tech: number, ground: Ground, strength: number, codes: Codes | undefined): number {
  const s = sat(strength);
  let lost: number;
  if (kind === 'fire') lost = (0.08 + 0.8 * s) * (0.12 + 0.88 * woodShare(tech)) * (0.7 + 0.3 * ground.dry) * (codes?.fire ? 0.4 : 1);
  else if (kind === 'quake') lost = (0.1 + 0.75 * s) * brittle(tech) * (0.6 + 0.4 * ground.fault) * (codes?.quake ? 0.45 : 1);
  else if (kind === 'flood') lost = (0.1 + 0.6 * s) * (0.25 + 0.75 * ground.low) * (codes?.flood ? 0.5 : 1);
  else lost = (0.2 + 0.75 * s) * (0.3 + 0.7 * ground.peak);
  return Math.max(0.02, Math.min(0.95, lost));
}

/**
 * What a town does about it. A great fire where there is written law makes a building law (stone for timber);
 * a bad earthquake makes one too (low, and braced); a flood raises floors on posts, and a great one makes a
 * town give up its low ground; a town half buried in ash builds again on the side away from the mountain.
 * `law` says whether this answer is a new law of the country.
 */
export function answer(kind: CalamityKind, share: number, tech: number, codes: Codes | undefined): { rebuilt: Rebuild; law: boolean } {
  if (kind === 'fire') {
    if (codes?.fire) return { rebuilt: 'stone', law: false };
    return share >= 0.33 && tech >= 0.36 ? { rebuilt: 'stone', law: true } : { rebuilt: '', law: false };
  }
  if (kind === 'quake') {
    if (codes?.quake) return { rebuilt: 'braced', law: false };
    return share >= 0.28 && tech >= 0.4 ? { rebuilt: 'braced', law: true } : { rebuilt: '', law: false };
  }
  if (kind === 'flood') {
    if (share >= 0.4 && tech >= 0.5) return { rebuilt: 'moved', law: !codes?.flood };
    if (codes?.flood) return { rebuilt: 'raised', law: false };
    return share >= 0.22 && tech >= 0.33 ? { rebuilt: 'raised', law: true } : { rebuilt: '', law: false };
  }
  return { rebuilt: share >= 0.45 ? 'moved' : '', law: false };
}

/** How long a town takes to build again what it lost: a generation with hands, a decade with engines. */
export function rebuildYears(tech: number): number {
  return 9 + 26 * (1 - sat((tech - 0.3) / 0.7));
}

/** A plot of a town in a given year: standing, a wreck, being built again, or given up for good. */
export interface PlotFate {
  state: 'standing' | 'wreck' | 'rebuilding' | 'given-up';
  /** How far the rebuilding has got, 0..1 (1 when standing). */
  progress: number;
  /** How it is built now: in stone, low and braced, on posts. */
  stone: boolean; braced: boolean; raised: boolean;
  /** What wrecked it, while it is a wreck, rebuilding or given up. */
  cause: CalamityKind | '';
  /** The year it was last built. */
  born: number;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const turn = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Was this plot among what a calamity destroyed? A fire takes the quarter downwind of where it began, a flood
 * the side toward the water, ash the side toward the mountain; an earthquake takes buildings here and there.
 * `x`, `y` are the plot's place on the plan, `radius` the town's; `water` is the bearing of the water (or of
 * downhill) and `mountain` the bearing of what the scar came from.
 */
export function struck(scar: Scar, k: number, x: number, y: number, radius: number, seed: number, water: number, mountain: number): boolean {
  const share = sat(scar.share);
  if (scar.kind === 'quake') return hash(seed * 0.37 + k * 13.7 + scar.year * 0.011) < share;
  if (scar.kind === 'fire') {
    // (the quarter downwind, and ragged at its edges)
    const wind = hash(seed * 0.91 + scar.year * 0.017) * Math.PI * 2;
    const off = Math.abs(turn(Math.atan2(y, x) - wind)) / Math.PI;
    return off + (hash(seed + k * 7.9 + scar.year) - 0.5) * 0.12 < share || (share > 0.5 && Math.hypot(x, y) < radius * 0.2);
  }
  const b = scar.kind === 'flood' ? water : mountain;
  const along = (x * Math.cos(b) + y * Math.sin(b)) / Math.max(1, radius);
  return along + (hash(seed + k * 3.3 + scar.year) - 0.5) * 0.2 > 1 - 2 * share;
}

/**
 * What has become of a plot by `year`. `built` is the year it was first built. Scars are taken oldest first:
 * a plot wrecked lies as it fell for a while, is built again over a few years in whatever way the town then
 * builds, and can be wrecked again. `codeYears` are the years the country's building laws were made
 * (fire, quake, flood; negative for none): what is built after a law follows it. `stretch` lengthens the
 * rebuilding (a time-lapse of a town's whole life needs its fires to last long enough to see).
 */
export function plotFate(k: number, x: number, y: number, radius: number, built: number, scars: readonly Scar[], codeYears: readonly number[], year: number, tech: number, seed: number, water: number, mountain: (cell: number) => number, stretch = 1): PlotFate {
  const law = (i: number, born: number): boolean => (codeYears[i] ?? -1) >= 0 && born > codeYears[i]!;
  let born = built;
  let stone = law(0, born), braced = law(1, born), raised = false;
  for (const scar of scars) {
    if (scar.year > year) break;
    if (born >= scar.year) continue;
    if (!struck(scar, k, x, y, radius, seed, water, scar.toward !== undefined ? mountain(scar.toward) : 0)) continue;
    if (scar.rebuilt === 'moved') return { state: 'given-up', progress: 0, stone, braced, raised, cause: scar.kind, born };
    const span = rebuildYears(tech) * stretch;
    const start = scar.year + span * (0.08 + 0.62 * hash(seed * 1.7 + k * 5.1 + scar.year * 0.013));
    const took = span * 0.3 * (0.5 + hash(seed * 2.3 + k * 9.7 + scar.year * 0.019));
    // how it will be built this time: by the answer to this calamity, and by any law made since
    const nowStone = scar.rebuilt === 'stone' || law(0, start), nowBraced = scar.rebuilt === 'braced' || law(1, start), nowRaised = scar.rebuilt === 'raised';
    if (year < start) return { state: 'wreck', progress: 0, stone, braced, raised, cause: scar.kind, born };
    if (year < start + took) return { state: 'rebuilding', progress: (year - start) / took, stone: nowStone, braced: nowBraced, raised: nowRaised, cause: scar.kind, born };
    born = start + took;
    stone = nowStone; braced = nowBraced; raised = nowRaised || (raised && scar.kind !== 'flood');
  }
  return { state: 'standing', progress: 1, stone, braced, raised, cause: '', born };
}

/** A scar in a sentence, for the town's card. */
export function describeScar(scar: Scar, yearsAgo: number): string {
  const part = scar.share >= 0.75 ? 'almost all' : scar.share >= 0.55 ? 'more than half' : scar.share >= 0.4 ? 'nearly half' : scar.share >= 0.27 ? 'a third' : scar.share >= 0.17 ? 'a fifth' : scar.share >= 0.08 ? 'a tenth' : 'a few streets';
  const what = scar.kind === 'fire' ? `Fire took ${part} of the town` : scar.kind === 'quake' ? `An earthquake threw down ${part} of the town` : scar.kind === 'flood' ? `A flood took ${part} of the town` : `Ash buried ${part} of the town`;
  const how = scar.rebuilt === 'stone' ? ' It was built again in stone and tile, with wider streets.'
    : scar.rebuilt === 'braced' ? ' It was built again lower, with walls tied in timber.'
      : scar.rebuilt === 'raised' ? ' It was built again with its floors raised on posts above the high-water mark.'
        : scar.rebuilt === 'moved' ? (scar.kind === 'flood' ? ' The low ground by the water was given up for good.' : ' The side toward the mountain was never built on again.')
          : ' It was built again as it had been.';
  const when = yearsAgo < 1.5 ? 'this year' : `${Math.round(yearsAgo).toLocaleString('en-US')} years ago`;
  return `${what} ${when}.${how}`;
}
