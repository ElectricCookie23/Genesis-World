// Plague years (system E37). A sickness that has learned to live in people (it comes from the microbe layer:
// every one has a strain) breaks out in a crowded town and then goes where people go: along the made roads
// and canals and railways, across the sea lanes, down the routes the merchants keep. A town off every route
// is reached late or not at all. A country that knows the sickness comes with travellers, and is steady
// enough to be obeyed, shuts its gates and throws a wall across the road: fewer catch it, and fewer die.
// When it is spent, the countries it emptied are different: hands are scarce, and those who own the land
// must pay for them.
//
// The rules of how it is carried and what it costs are here, pure, so that the engine and the tests agree.

/** How a sickness came to a town: where it began, along a made way, across a sea lane, down a merchants' route, or on foot from the next valley. */
export const VIAS = ['origin', 'road', 'sea', 'trade', 'foot'] as const;
export type Via = (typeof VIAS)[number];

/** One town reached. */
export interface Reach {
  /** The town, the year, and the town it came from (-1 where it began). */
  town: number; year: number; from: number;
  via: Via;
  /** The share of its people who died. */
  dead: number;
  /** Had it shut its gates? */
  shut: boolean;
  eventId: number;
}

/** A pandemic as the history keeps it. */
export interface Pandemic {
  id: number;
  /** Its name in plain words and in the tongue of the town it began in. */
  name: string; own: string;
  began: number;
  /** The year it was spent, or -1. */
  ended: number;
  /** The town it began in, the event of its beginning, the strain it came from, and the event of its end (-1 until then). */
  origin: number; eventId: number; strain: number; endEvent: number;
  /** How readily it is caught and how often it kills, each 0..1. */
  catching: number; deadly: number;
  reached: Reach[];
}

/** A way between two towns that trade travels. */
export interface Edge { a: number; b: number; via: Via; eventId: number }

const sat = (x: number): number => Math.max(0, Math.min(1, x));

/** How long a town goes on giving the sickness to others, in years. */
export const CATCHING_YEARS = 2;

/** The chance, in one year, that a sickness is carried along one way from a town that has it to a town that does not. */
export function carried(via: Via, catching: number, shut: boolean): number {
  const base = via === 'trade' ? 0.75 : via === 'road' ? 0.7 : via === 'sea' ? 0.6 : via === 'foot' ? 0.05 : 0;
  return sat(base * (0.5 + 0.7 * catching) * (shut ? 0.25 : 1));
}

/**
 * Does a town shut its gates? Only when its country knows that sickness comes with travellers (it has towns
 * and writing enough), is steady enough to be obeyed, and has had warning: the sickness has been abroad a year.
 */
export function shuts(tech: number, stability: number, yearsAbroad: number): boolean {
  return tech >= 0.5 && stability >= 0.5 && yearsAbroad >= 1;
}

/** The share of a town's people who die: by how deadly the sickness is, less behind shut gates, much less once there is medicine; `luck` is 0..1. */
export function toll(deadly: number, tech: number, shut: boolean, luck: number): number {
  const medicine = tech >= 1 ? 0.25 : tech >= 0.8 ? 0.55 : 1;
  return sat(deadly * (0.7 + 0.6 * luck) * (shut ? 0.55 : 1) * medicine);
}

/** The share of a pandemic's towns (other than the first) that it reached along a way trade travels. */
export function alongTrade(p: Pick<Pandemic, 'reached'>): number {
  let n = 0, on = 0;
  for (const r of p.reached) { if (r.via === 'origin') continue; n++; if (r.via !== 'foot') on++; }
  return n ? on / n : 1;
}

/** Does this way join these two towns (in either direction)? */
export function joins(e: Edge, a: number, b: number): boolean {
  return (e.a === a && e.b === b) || (e.a === b && e.b === a);
}

/** The meanings a sickness's name is built from in its first town's tongue, and its name in plain words. */
export function plagueName(pick: number): [string, string, string] {
  const names: [string, string, string][] = [
    ['fire', 'red', 'the Red Fever'], ['water', 'old', 'the Well Sickness'], ['wind', 'great', 'the Great Cough'], ['moon', 'red', 'the Red Moon Sickness'],
    ['hand', 'red', 'the Red Hand'], ['fire', 'many', 'the Burning'], ['eye', 'red', 'the Red Eye'], ['river', 'old', 'the River Fever'],
  ];
  return names[((pick % names.length) + names.length) % names.length]!;
}

/** How a town was reached, in a few words. */
export function describeVia(via: Via): string {
  return via === 'origin' ? 'it began here' : via === 'road' ? 'along the made road' : via === 'sea' ? 'by the sea lane' : via === 'trade' ? 'with the merchants' : 'on foot from the next valley';
}

/** A pandemic in a sentence. */
export function describePandemic(p: Pandemic, towns: number, year: number): string {
  const share = Math.round(alongTrade(p) * 100);
  const dead = p.reached.length ? Math.round((p.reached.reduce((a, r) => a + r.dead, 0) / p.reached.length) * 100) : 0;
  const span = Math.max(1, Math.round((p.ended >= 0 ? p.ended : year) - p.began));
  return `${p.name} ${p.ended >= 0 ? 'ran' : 'has run'} for ${span} ${span === 1 ? 'year' : 'years'} and reached ${p.reached.length} of ${towns} towns; about ${dead} in a hundred died where it came. ${share} in a hundred of the towns it reached, it reached along a way that trade travels.`;
}
