// Diplomacy (system E34). Countries make treaties: a peace after a war, a trade pact with a long-standing
// buyer, an alliance against a common enemy. A treaty can be broken, by the simplest means there is: attacking
// the country it was made with. That is a betrayal, it is remembered for generations, and the country betrayed
// will, when it is able, go to war over it: a war caused by the betrayal, decades after.
//
// The web of who stands how with whom is worked out from what the record already holds.
import type { HistoryState } from './model';

export const TREATY_KINDS = ['peace', 'trade', 'alliance'] as const;
export type TreatyKind = (typeof TREATY_KINDS)[number];

export interface Treaty {
  id: number;
  a: number; b: number;
  kind: TreatyKind;
  /** The year it was made and the year it runs out. */
  year: number; until: number;
  eventId: number;
  /** Signed and not read out (system E39): not in the web of how countries stand until it comes out. */
  secret?: boolean;
  /** If it was broken: when, by which of the two, and the event of the betrayal. */
  broken?: { year: number; by: number; eventId: number };
}

/** A wrong a country remembers: who did it, the event of it, when, and when (if ever) it went to war over it. */
export interface Grudge { against: number; eventId: number; year: number; avenged?: number }

/** How long a betrayal is remembered, in years. */
export const GRUDGE_YEARS = 180;

/** How two countries stand, strongest first: what a line between them in the web is drawn as. */
export const TIE_KINDS = ['war', 'grudge', 'alliance', 'marriage', 'peace', 'trade-pact', 'trade', 'contact'] as const;
export type TieKind = (typeof TIE_KINDS)[number];

export const TIE_COLOUR: Record<TieKind, string> = { war: '#ff4a3a', grudge: '#b3402e', alliance: '#62d67a', marriage: '#e8b0ff', peace: '#9fd0ff', 'trade-pact': '#ffd76a', trade: '#b89a4a', contact: '#ffffff30' };

export interface Tie { a: number; b: number; kind: TieKind; since: number; eventId: number; label: string }

/** The treaty in force between two countries in a year, if there is one. */
export function pactBetween(h: HistoryState, a: number, b: number, year: number): Treaty | undefined {
  for (const t of h.treaties ?? []) if (!t.broken && t.until > year && ((t.a === a && t.b === b) || (t.a === b && t.b === a))) return t;
  return undefined;
}

/**
 * The web: one line for each pair of living countries that have anything to do with each other, drawn as the
 * strongest thing between them (a war over everything, then a remembered betrayal, then a treaty, a marriage,
 * a trade, and at the least that they are in touch).
 */
export function web(h: HistoryState, year: number): Tie[] {
  const alive = (id: number): boolean => !!h.nations[id] && h.nations[id]!.ended < 0;
  const ties = new Map<string, Tie>();
  const rank = (k: TieKind): number => TIE_KINDS.indexOf(k);
  const put = (a: number, b: number, kind: TieKind, since: number, eventId: number, label: string): void => {
    if (a === b || !alive(a) || !alive(b)) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const have = ties.get(key);
    if (!have || rank(kind) < rank(have.kind)) ties.set(key, { a: Math.min(a, b), b: Math.max(a, b), kind, since, eventId, label });
  };
  const name = (id: number): string => h.nations[id]?.name ?? '';
  for (const n of h.nations) {
    if (n.ended >= 0) continue;
    for (const id of n.contacts) put(n.id, id, 'contact', n.founded, -1, `${n.name} and ${name(id)} are in touch.`);
    if (n.trade) put(n.id, n.trade.to, 'trade', n.trade.since, n.trade.eventId, `${n.name} sells to ${name(n.trade.to)}.`);
    for (const m of n.allies ?? []) if (m.until > year) put(n.id, m.nation, 'marriage', year, m.eventId, `The ruling houses of ${n.name} and ${name(m.nation)} are joined by marriage.`);
    for (const g of n.grudges ?? []) if (year - g.year < GRUDGE_YEARS && g.avenged === undefined) put(n.id, g.against, 'grudge', g.year, g.eventId, `${n.name} has not forgotten what ${name(g.against)} did.`);
  }
  for (const t of h.treaties ?? []) if (!t.broken && t.until > year && !t.secret) put(t.a, t.b, t.kind === 'trade' ? 'trade-pact' : t.kind, t.year, t.eventId, t.kind === 'peace' ? `${name(t.a)} and ${name(t.b)} have sworn peace.` : t.kind === 'trade' ? `${name(t.a)} and ${name(t.b)} have a pact of trade.` : `${name(t.a)} and ${name(t.b)} are allies.`);
  for (const w of h.wars ?? []) if (w.ended < 0) put(w.a, w.b, 'war', w.year, w.eventId, `${name(w.a)} is at war with ${name(w.b)}.`);
  return [...ties.values()].sort((x, y) => rank(x.kind) - rank(y.kind));
}

/** The pacts in force that were signed in secret (system E39): what the web of how countries stand does not show. */
export function secretTies(h: HistoryState, year: number): Tie[] {
  const out: Tie[] = [];
  for (const t of h.treaties ?? []) {
    if (!t.secret || t.broken || t.until <= year) continue;
    const a = h.nations[t.a], b = h.nations[t.b];
    if (!a || !b || a.ended >= 0 || b.ended >= 0) continue;
    out.push({ a: Math.min(t.a, t.b), b: Math.max(t.a, t.b), kind: 'alliance', since: t.year, eventId: t.eventId, label: `${a.name} and ${b.name} have a pact that neither has read out.` });
  }
  return out;
}
