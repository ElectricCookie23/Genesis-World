// Resources and trade goods (system E31). What a country has to sell is what its land gives and what it
// knows how to make of it; what it needs is its people and its age. Where a thing is scarce it is dear, and
// merchants carry each thing from where it is cheap to where it is dear: a country's chief trade is whichever
// good, to whichever of the countries it is in touch with, turns the best profit. Find ore, learn to make
// glass, fell the last forest, and the prices change and the trade turns with them.
//
// Everything here is pure: supply, demand and price for a country, and the best trade between two.

export const GOODS = ['grain', 'timber', 'ore', 'salt', 'dye', 'glass', 'spice', 'hides', 'fish', 'coal'] as const;
export type Good = (typeof GOODS)[number];

/** The colour each good's routes are drawn in. */
export const GOOD_COLOUR: Record<Good, string> = {
  grain: '#e8c85a', timber: '#7fae5a', ore: '#b8bcc8', salt: '#f4f0e6', dye: '#b565d8', glass: '#7fd6e8', spice: '#e8703a', hides: '#b8845a', fish: '#5a9be8', coal: '#6a6470',
};

/** What a country's economy rests on. */
export interface Economy {
  /** What its land gives: 'ore', 'coast', 'river', 'forest', 'beasts', 'sand', 'coal', 'cold'. */
  land: readonly string[];
  tech: number;
  /** People (thousands), towns, working mines, and how much of its forest it has felled (0..1). */
  pop: number; towns: number; mines: number; felled: number;
  knows: (slot: string) => boolean;
}

/** How much of each good a country makes, for each of its people, where 1 is enough for itself in a plain age. */
export function supply(e: Economy): number[] {
  const has = (x: string): boolean => e.land.includes(x);
  const crowd = Math.max(0, Math.min(1, e.pop / Math.max(1, e.towns) / 400));
  return GOODS.map((g) => {
    switch (g) {
      case 'grain': return Math.max(0.2, 0.95 + (has('river') ? 0.45 : 0) + (e.knows('plough') ? 0.25 : 0) - (has('sand') && !has('river') ? 0.35 : 0) - (has('cold') ? 0.35 : 0) - 0.3 * crowd);
      case 'timber': return has('forest') ? 1.7 * (1 - 0.85 * e.felled) : 0.12;
      case 'ore': return has('ore') ? (e.knows('edge') ? 0.45 + 0.7 * Math.min(2, e.mines) : 0.2) : 0;
      case 'salt': return has('coast') || has('sand') ? (e.knows('salt') ? 1.6 : 0.4) : 0.05;
      case 'dye': return e.knows('dye') ? (has('forest') ? 1.5 : 0.5) : 0;
      case 'glass': return e.knows('glass') ? (has('sand') ? 1.6 : 0.3) : 0;
      case 'spice': return has('forest') && !has('cold') ? 1.3 : 0.08;
      case 'hides': return has('beasts') ? 1.6 : 0.3;
      case 'fish': return has('coast') ? 1.5 : has('river') ? 0.5 : 0;
      case 'coal': return has('coal') ? (e.knows('engine') || e.knows('steelish') ? 1.6 : 0.3) : 0;
    }
  });
}

/** How much of each good a country wants, for each of its people. */
export function demand(e: Economy): number[] {
  const t = e.tech;
  return GOODS.map((g) => {
    switch (g) {
      case 'grain': return 1;
      case 'timber': return 0.5 + 0.5 * Math.min(1, t);
      case 'ore': return t > 0.36 ? 0.4 + 0.9 * Math.min(1, t) : 0.08;
      case 'salt': return 0.6;
      case 'dye': return t > 0.4 ? 0.7 : 0.15;
      case 'glass': return t > 0.5 ? 0.65 : 0.03;
      case 'spice': return 0.3 + 0.5 * Math.min(1, t);
      case 'hides': return 0.5;
      case 'fish': return 0.3;
      case 'coal': return t >= 0.85 ? 1.3 : 0.04;
    }
  });
}

/** What each good costs in a country: what is wanted over what there is. 1 is a fair price; 8 is the dearest anything gets, 0.15 the cheapest. */
export function prices(e: Economy): number[] {
  const s = supply(e), d = demand(e);
  return GOODS.map((_, i) => Math.max(0.15, Math.min(8, d[i]! / (s[i]! + 0.06))));
}

/**
 * The best trade a seller can do with a buyer: the good the seller has more of than it needs that is dearest in
 * the buyer's country compared with at home. `gain` is how many times dearer; null if nothing is worth the journey.
 */
export function bestTrade(seller: Economy, buyer: Economy): { good: number; gain: number } | null {
  const s = supply(seller), d = demand(seller), ps = prices(seller), pb = prices(buyer), want = demand(buyer);
  let best = -1, gain = 1.3;
  for (let i = 0; i < GOODS.length; i++) {
    // (the seller must have it to spare, and the buyer must want it: no one carries coal to a people without engines)
    if (s[i]! < d[i]! * 1.15 || s[i]! < 0.5 || want[i]! < 0.25) continue;
    const ratio = pb[i]! / ps[i]!;
    if (ratio > gain) { gain = ratio; best = i; }
  }
  return best >= 0 ? { good: best, gain } : null;
}

/** A country's market in a sentence: what is dear there and what is cheap. */
export function describeMarket(e: Economy): string {
  const p = prices(e).map((v, i) => ({ v, g: GOODS[i]! })).filter((x) => demand(e)[GOODS.indexOf(x.g)]! > 0.1);
  const dear = p.filter((x) => x.v >= 2).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.g), cheap = p.filter((x) => x.v <= 0.6).sort((a, b) => a.v - b.v).slice(0, 3).map((x) => x.g);
  const list = (a: string[]): string => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] ?? '');
  return `${dear.length ? `${list(dear).charAt(0).toUpperCase()}${list(dear).slice(1)} ${dear.length > 1 ? 'are' : 'is'} dear here` : 'Nothing is very dear here'}${cheap.length ? `; ${list(cheap)} ${cheap.length > 1 ? 'are' : 'is'} cheap` : ''}.`;
}
