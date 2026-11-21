// Arms races (system E38). Two countries of like strength that have fought, or that one of them expects to
// fight, do not stand their soldiers down. Each watches what the other's smiths are making and orders the
// same, and better. A country under that pressure learns faster than it would in peace; what it learns
// next is more likely to be arms; and each new weapon leaves something behind in the workshops that the
// peaceful crafts can use.
//
// The rules of how hard a country is pressed and what that does to its learning are here, pure.

/** A rivalry between two countries, as the history keeps it. */
export interface Race {
  id: number;
  /** The two countries (nation ids, lower first). */
  a: number; b: number;
  began: number;
  /** The year it cooled, or -1. */
  ended: number;
  /** The event of its beginning, and of its end (-1 until then). */
  eventId: number; endEvent: number;
  /** What each has learned while it lasted, and how much of that was arms. */
  found: [number, number]; arms: [number, number];
}

/** How long after their last war two countries go on watching each other, in years. */
export const WATCH_YEARS = 60;

/** How much research an arms discovery leaves over for the peaceful crafts, when the country is fully pressed. */
export const SPILL = 0.25;

/** What a war between two countries of like strength puts into the workshops of each at once, in discoveries' worth of research; and how many years must pass before another war does so again. */
export const BURST = 0.7;
export const BURST_EVERY = 10;

const sat = (x: number): number => Math.max(0, Math.min(1, x));

/** Are two countries of like strength? Neither more than three times the other in people, nor more than an age or so ahead. */
export function peers(popA: number, popB: number, techA: number, techB: number): boolean {
  const big = Math.max(popA, popB), small = Math.min(popA, popB);
  return small > 0 && big <= 3 * small && Math.abs(techA - techB) <= 0.15;
}

/**
 * How hard one country is pressed by another, 0..1: fully while they are at war, less with every year since
 * their last one, and more while one of them has an old wrong it has not avenged.
 */
export function tension(sinceWar: number | undefined, atWar: boolean, grudge: boolean): number {
  if (atWar) return 1;
  const cooled = sinceWar === undefined ? 0 : 0.8 * sat(1 - sinceWar / WATCH_YEARS);
  return sat(cooled + (grudge ? 0.3 : 0));
}

/** How much faster a pressed country learns: twice as fast when fully pressed. */
export function drive(pressed: number): number {
  return 1 + sat(pressed);
}

/** How much likelier its next discovery is to be arms. */
export function armsLean(pressed: number): number {
  return 1 + 2.5 * sat(pressed);
}

/** A race in a sentence. */
export function describeRace(r: Race, a: string, b: string, year: number): string {
  const span = Math.max(1, Math.round((r.ended >= 0 ? r.ended : year) - r.began));
  const side = (name: string, k: 0 | 1): string => `${name} ${r.ended >= 0 ? 'learned' : 'has learned'} ${r.found[k]} ${r.found[k] === 1 ? 'thing' : 'things'}, ${r.arms[k]} of them arms`;
  return `${a} and ${b} ${r.ended >= 0 ? 'armed' : 'have been arming'} against each other for ${span} ${span === 1 ? 'year' : 'years'}. ${side(a, 0)}; ${side(b, 1)}.`;
}
