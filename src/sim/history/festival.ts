// Holidays and festivals (system E30). A people that counts its years marks days in them: the day its country
// began, the day a war was won, the night a town burned, the harvest, the year the comet comes back. Each
// festival is tied to the event it remembers, comes round on its day, and changes how the towns are lit that
// night: lanterns in every window, bonfires on the hills, or no lights at all.
//
// (The game has no religion, by the owner's decision: these are days of remembering and of the seasons.)
// Everything here is pure: whether a festival is on in a given year and day, and what it does to the lights.

export const FESTIVAL_KINDS = ['founding', 'harvest', 'victory', 'remembrance', 'comet', 'eclipse'] as const;
export type FestivalKind = (typeof FESTIVAL_KINDS)[number];

/** How the towns are lit on the night: more lamps, fires that flicker, floating lights, or none. */
export type FestivalLight = 'lanterns' | 'bonfires' | 'lights-out' | 'floating';

export interface Festival {
  id: number;
  kind: FestivalKind;
  /** Its name in the people's tongue, and in plain words. */
  own: string; name: string;
  /** The event it remembers. */
  eventId: number;
  /** The year it was first kept; the time of year it falls on (0..1 of the year); and how many years lie between one and the next (1 for every year). */
  since: number; day: number; every: number;
  /** How many days it lasts. */
  days: number;
  light: FestivalLight;
}

/** What each kind of festival does to the lights. */
export function lightOf(kind: FestivalKind): FestivalLight {
  return kind === 'remembrance' ? 'lights-out' : kind === 'harvest' || kind === 'victory' ? 'bonfires' : kind === 'comet' ? 'floating' : 'lanterns';
}

/** Is the festival on at this moment (a year with its fraction)? It comes on its day, for its days, every `every` years counted from the year it was first kept. */
export function festivalOn(f: Festival, year: number): boolean {
  if (year < f.since) return false;
  const whole = Math.floor(year), frac = year - whole;
  const span = f.days / 365;
  // (a festival of several years' spacing lasts its whole year: the year the comet is in the sky)
  if (f.every > 1) return (whole - Math.floor(f.since)) % Math.round(f.every) === 0;
  // (a hair's allowance, so that the first moment of its day counts as its day)
  let d = frac - f.day + 1e-9;
  d -= Math.floor(d);
  return d < span;
}

/** Days until it next begins (0 while it is on). */
export function daysUntil(f: Festival, year: number): number {
  if (festivalOn(f, year)) return 0;
  const whole = Math.floor(year), frac = year - whole;
  if (f.every > 1) { const k = Math.round(f.every), into = ((whole - Math.floor(f.since)) % k + k) % k; return Math.round(((k - into) - frac) * 365); }
  let d = f.day - frac;
  d -= Math.floor(d);
  return Math.max(1, Math.round(d * 365));
}

/** What a festival night does to a town's lights: how much brighter, how much wider the glow spreads, how much it flickers, how dark it goes, and its colour (linear RGB), or null to keep the town's own. */
export interface Feast { glow: number; spread: number; flicker: number; dark: number; colour: [number, number, number] | null }

export function feastOf(light: FestivalLight, hue: number): Feast {
  const rgb = (h: number, s: number, v: number): [number, number, number] => {
    const k = (n: number) => { const x = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
    return [k(5), k(3), k(1)];
  };
  if (light === 'lights-out') return { glow: 0.12, spread: 1, flicker: 0, dark: 1, colour: null };
  if (light === 'bonfires') return { glow: 1.6, spread: 2.8, flicker: 0.8, dark: 0, colour: [1.0, 0.26, 0.04] };
  if (light === 'floating') return { glow: 1.4, spread: 2.6, flicker: 0.15, dark: 0, colour: [0.55, 0.8, 1.0] };
  return { glow: 1.9, spread: 2.4, flicker: 0, dark: 0, colour: rgb(hue, 0.55, 1) };
}

/** A festival in a sentence. */
export function describeFestival(f: Festival, year: number): string {
  const when = f.every > 1 ? `kept for a whole year every ${Math.round(f.every)} years` : `kept for ${f.days} ${f.days === 1 ? 'day' : 'days'} every year`;
  const how = f.light === 'lights-out' ? 'no lamp is lit: from above, the towns go dark' : f.light === 'bonfires' ? 'fires are lit on every hill round every town' : f.light === 'floating' ? 'lights are set afloat and hung along every road' : 'there is a lantern in every window';
  const n = daysUntil(f, year);
  return `${f.own}, ${f.name}: ${when}, when ${how}. ${n === 0 ? 'It is being kept now.' : `It is next kept in ${n.toLocaleString('en-US')} ${n === 1 ? 'day' : 'days'}.`}`;
}
