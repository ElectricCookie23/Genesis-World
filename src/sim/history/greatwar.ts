// World wars (system E40). A war between two countries stays between them unless they have friends. A
// country sworn to one of them (an alliance, read out or not) follows it in; so do that country's own allies
// on the other side; and so on, until everyone bound to anyone is in. Most of the time that is three or four
// countries and a bad decade. When enough of the great powers of the day are among them, it is a world war:
// every workshop in every belligerent country is turned to it, towns change hands on every front, and when
// the last of its wars has ended the peace is made by all of them together, with new institutions meant to
// see that it does not happen again: a league, a court, a common fund for what was burned.
//
// The rules of who is drawn in, when it counts as a world war and who won are here, pure.

export const INSTITUTION_KINDS = ['league', 'court', 'fund'] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

/** Something set up by the peace. */
export interface Institution {
  kind: InstitutionKind;
  /** Its name in plain words and in the tongue of the town it sits in. */
  name: string; own: string;
  /** The town it sits in (a settlement's id). */
  seat: number;
  eventId: number;
}

/** What the peace set up: who belongs to it, what it consists of, and when it failed (-1 while it holds). */
export interface Order {
  year: number;
  members: number[];
  institutions: Institution[];
  until: number;
  failEvent: number;
  /** The last year its court settled a quarrel between two members. */
  settled?: number;
}

/** A war that drew in the allies of those who began it. */
export interface GreatWar {
  id: number;
  name: string; own: string;
  began: number;
  /** The year its last war ended, or -1. */
  ended: number;
  /** The war the others joined (a war's id), and every war fought in it. */
  origin: number;
  wars: number[];
  /** The two sides (nation ids): the attacker of the first war and its friends, and the defender and its. */
  sides: [number[], number[]];
  /** Were enough of the great powers in it for it to be a world war? */
  world: boolean;
  /** The event of its beginning and of its peace (-1 until then). */
  eventId: number; endEvent: number;
  /** Which side had the better of it (-1 neither, or not yet). */
  winner: -1 | 0 | 1;
  /** Towns that changed hands in it and were kept (settlement ids). */
  taken: number[];
  order?: Order;
}

/** Who is drawn in, and by whom. */
export interface Joined { nation: number; side: 0 | 1; with: number }

/**
 * Chain the alliances out from the two countries that began a war. Each round, every country sworn to someone
 * already on a side joins that side, unless it is already in or is sworn to both sides at once (it stays out).
 * No side grows past `most` countries: beyond that, promises are not kept.
 * Returns the two sides and who joined on account of whom, in the order they came in.
 */
export function chain(a: number, b: number, alliesOf: (id: number) => number[], rounds = 3, most = 6): { sides: [number[], number[]]; joined: Joined[] } {
  const sides: [number[], number[]] = [[a], [b]];
  const joined: Joined[] = [];
  const on = (k: 0 | 1, id: number): boolean => sides[k].includes(id);
  for (let round = 0; round < rounds; round++) {
    const coming: Joined[] = [];
    for (const k of [0, 1] as const) {
      for (const m of sides[k]) {
        for (const x of alliesOf(m)) {
          if (on(0, x) || on(1, x) || coming.some((c) => c.nation === x && c.side === k)) continue;
          coming.push({ nation: x, side: k, with: m });
        }
      }
    }
    // (a country called by both sides in the same round answers neither)
    const torn = new Set(coming.filter((c) => coming.some((d) => d.nation === c.nation && d.side !== c.side)).map((c) => c.nation));
    const come = coming.filter((c) => !torn.has(c.nation));
    if (!come.length) break;
    for (const c of come) { if (sides[c.side].length >= most) continue; sides[c.side].push(c.nation); joined.push(c); }
  }
  return { sides, joined };
}

/** How much a country counts for in the world: its people, and what they know how to make. */
export function weight(pop: number, tech: number): number {
  return Math.max(0, pop) * (0.5 + Math.max(0, tech));
}

/** The great powers of the day: the countries that count for at least a third of what the greatest does, six at most, greatest first. */
export function powers(nations: { id: number; pop: number; tech: number }[]): number[] {
  const ranked = nations.map((n) => ({ id: n.id, w: weight(n.pop, n.tech) })).filter((x) => x.w > 0).sort((x, y) => y.w - x.w);
  if (!ranked.length) return [];
  return ranked.filter((x) => x.w >= ranked[0]!.w / 3).slice(0, 6).map((x) => x.id);
}

/**
 * Is it a world war? Four countries or more are in it, and either three of the great powers are among them,
 * or the belligerents between them hold six in ten of the world's people.
 */
export function isWorld(belligerents: number[], great: number[], share: number): boolean {
  if (belligerents.length < 4) return false;
  return belligerents.filter((id) => great.includes(id)).length >= 3 || share >= 0.6;
}

/**
 * Who had the better of it: each war won counts for its side, and each town taken and kept counts again.
 * `side` is the side of that war's attacker.
 */
export function victor(wars: { side: 0 | 1; outcome: string; kept: number }[]): -1 | 0 | 1 {
  const score = [0, 0];
  for (const w of wars) {
    if (w.outcome === 'attacker') score[w.side]! += 1 + w.kept;
    else if (w.outcome === 'defender') score[1 - w.side]! += 1;
    else score[w.side]! += w.kept;
  }
  return score[0]! > score[1]! ? 0 : score[1]! > score[0]! ? 1 : -1;
}

/** The chance a league keeps two of its members from a war they would otherwise have fought. */
export const LEAGUE_HOLDS = 0.7;

/** What each institution is for, in a sentence. */
export function purposeOf(kind: InstitutionKind): string {
  return kind === 'league' ? 'every country that fought sends an envoy to it, and has sworn that a quarrel between any two will be brought there before it is brought to the field'
    : kind === 'court' ? 'judges from both sides sit in it together, and a country may bring another before it instead of marching on it'
      : 'every member pays into it by its means, and it pays out to the towns that were burned, on whichever side they stood';
}

/** The plain name of an institution that sits in a town. */
export function institutionName(kind: InstitutionKind, town: string): string {
  return kind === 'league' ? `the League of ${town}` : kind === 'court' ? `the Court of ${town}` : `the Common Fund of ${town}`;
}

/** A great war in a sentence. */
export function describeGreatWar(g: GreatWar, name: (id: number) => string, year: number): string {
  // (the first four of a side by name, and the rest by number)
  const list = (ids: number[]): string => { const all = ids.map(name).filter(Boolean), n = all.slice(0, 4), more = all.length - n.length; if (more > 0) return `${n.join(', ')} and ${more} ${more === 1 ? 'other' : 'others'}`; return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0] ?? 'no one'; };
  const span = Math.max(1, Math.round((g.ended >= 0 ? g.ended : year) - g.began));
  const how = g.ended < 0 ? 'It is still being fought.' : g.winner < 0 ? 'Neither side had the better of it.' : `${list(g.sides[g.winner as 0 | 1])} had the better of it.`;
  return `${list(g.sides[0])} against ${list(g.sides[1])}: ${g.wars.length} wars in ${span} ${span === 1 ? 'year' : 'years'}${g.taken.length ? `, and ${g.taken.length} ${g.taken.length === 1 ? 'town' : 'towns'} under a new flag at the end of it` : ''}. ${how}`;
}
