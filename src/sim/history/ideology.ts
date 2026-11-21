// Ideologies (system E35). Ideas about how a country should be run arise from how it is: where a few own
// almost everything, the idea that no one should; where nothing holds, the idea of one strong hand; where
// much is newly known, rule by those who know; where everything is changing, the old law; where trade is
// everything, a council of those who trade. An idea has a name in the tongue of those who first held it. It
// gains or loses followers as conditions favour it, crosses borders, and when enough of an unsteady country
// holds it, there is a revolution: the country is governed another way from that year, under another flag.
//
// The rules of how strongly conditions call for each idea are here, pure.

export const IDEAS = ['levelling', 'order', 'reason', 'custom', 'commons'] as const;
export type Idea = (typeof IDEAS)[number];

/** How a country is governed after a revolution in the name of each idea. */
export const IDEA_GOVERNMENT: Record<Idea, 'republic' | 'iron rule' | 'rule of the learned' | 'the old law' | 'council of merchants'> = { levelling: 'republic', order: 'iron rule', reason: 'rule of the learned', custom: 'the old law', commons: 'council of merchants' };

/** The colour of each idea on the map. */
export const IDEA_COLOUR: Record<Idea, string> = { levelling: '#e0563a', order: '#b08ae6', reason: '#5ab8e8', custom: '#c9a24a', commons: '#62c98a' };

/** Each idea in three or four words, for a map key. */
export const IDEA_LABEL: Record<Idea, string> = { levelling: 'no one above another', order: 'one strong hand', reason: 'those who know', custom: 'the old ways', commons: 'those who trade' };

/** What each idea says, in a sentence. */
export const IDEA_SAYS: Record<Idea, string> = {
  levelling: 'that what the land gives belongs to those who work it, and that no one should own a hundred times what another does',
  order: 'that a country needs one hand on it, and that quarrelling is a luxury of safe times',
  reason: 'that those who know how things work should decide how they are run',
  custom: 'that the old ways were right, and that every trouble began when they were left',
  commons: 'that those who make and carry the goods should set the rules they trade by',
};

/** An idea as the history keeps it. */
export interface Ideology {
  id: number;
  kind: Idea;
  /** Its name in plain words and in the tongue of those who first held it. */
  name: string; own: string;
  born: number;
  /** The country it arose in. */
  nation: number;
  eventId: number;
}

/** How a country is, as far as ideas care: each 0..1 unless said. */
export interface Conditions {
  inequality: number; stability: number; fatigue: number; tech: number;
  /** How closely its people hold to the ways of their forebears. */
  custom: number;
  /** Does it have a chief trade, coin, a slump after a crash, the printing press? */
  trade: boolean; coin: boolean; slump: boolean; press: boolean;
}

const sat = (x: number): number => Math.max(0, Math.min(1, x));

/** How strongly a country's conditions call for an idea, 0..1. */
export function pressure(kind: Idea, c: Conditions): number {
  switch (kind) {
    case 'levelling': return sat(sat((c.inequality - 0.4) / 0.35) * (c.slump ? 1.2 : 0.95));
    case 'order': return sat(0.9 * sat((0.55 - c.stability) / 0.25) + 0.4 * c.fatigue);
    case 'reason': return sat(sat((c.tech - 0.6) / 0.3) * (1.25 - 0.6 * c.custom) * (c.press ? 1 : 0.7));
    case 'custom': return sat(c.custom * c.custom * sat((c.tech - 0.55) / 0.4));
    // (the merchants' idea belongs to the age of merchants: it gives way once there are engines)
    case 'commons': return sat(((c.trade ? 0.45 : 0) + (c.coin ? 0.3 : 0)) * (1.2 - 0.7 * c.inequality) * (1 - 0.5 * sat((c.tech - 0.75) / 0.3)));
  }
}

/** The idea a country's conditions call for most, if any calls loudly enough to be taken up. `not` is how the country is governed already: no one rises for what they have. */
export function ripest(c: Conditions, not = ''): Idea | null {
  let best: Idea | null = null, top = 0.55;
  for (const k of IDEAS) { if (IDEA_GOVERNMENT[k] === not) continue; const p = pressure(k, c); if (p > top) { top = p; best = k; } }
  return best;
}

/** How the share of a country that holds an idea changes over `years`: it grows while conditions call for it, faster with the press, and fades when they do not. */
export function drift(share: number, kind: Idea, c: Conditions, years = 1): number {
  const p = pressure(kind, c);
  return sat(share + (p - 0.38) * 0.022 * (c.press ? 1.5 : 1) * years);
}

/** How a country is governed, as it reads after "is" or "was": "a kingdom", "under the old law". */
export function governedAs(g: string): string {
  return g === 'iron rule' ? 'under iron rule' : g === 'rule of the learned' ? 'under the rule of the learned' : g === 'the old law' ? 'under the old law' : g === 'council of merchants' ? 'under a council of merchants' : g === 'custom' ? 'ruled by custom' : g === 'empire' ? 'an empire' : `a ${g}`;
}

/** The meanings an idea's name is built from in its people's tongue, and its name in plain words: `pick` chooses among those its kind allows. */
export function ideaName(kind: Idea, pick: number): [string, string, string] {
  const names: Record<Idea, [string, string, string][]> = {
    levelling: [['people', 'one', 'the One People'], ['land', 'people', 'the Common Land'], ['hand', 'many', 'the Many Hands']],
    order: [['hand', 'great', 'the Strong Hand'], ['stone', 'king', 'the Stone Rule'], ['one', 'king', 'the One Voice']],
    reason: [['eye', 'bright', 'the Clear Sight'], ['star', 'new', 'the New Measure'], ['tongue', 'bright', 'the Plain Word']],
    custom: [['old', 'land', 'the Old Law'], ['mother', 'old', 'the Mothers\' Way'], ['stone', 'old', 'the Standing Stones']],
    commons: [['town', 'many', 'the Free Towns'], ['river', 'people', 'the Open Road'], ['hand', 'give', 'the Fair Measure']],
  };
  const list = names[kind];
  return list[((pick % list.length) + list.length) % list.length]!;
}
