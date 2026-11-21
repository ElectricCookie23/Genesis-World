// Colonization and independence (system E36). A country with ocean-going ships and people to spare plants
// towns on a far shore and governs them from home. A colony's people are born there, not in the old country;
// each generation thinks of itself a little less as the old country's and a little more as its own. The
// further away it is, the more it is taxed, the larger it grows beside its mother and the more trouble there
// is at home, the faster that goes. In the end it declares itself free, the mother country sends an army
// across the water, and either the colony is brought back or a new country is born.
//
// The rules of how fast a colony grows apart and what its rising's chances are, are here, pure.

/** A colony as the history keeps it. */
export interface Colony {
  id: number;
  /** The country that planted it (a nation's id) and its chief town (a settlement's id). */
  mother: number;
  seat: number;
  founded: number;
  eventId: number;
  /** How far its people think of themselves as a people of their own: 0 the old country's, 1 and over their own. */
  identity: number;
  /** The year it declared itself free (or -1), the war that followed (a war's id, or -1) and the event of that war. */
  declared: number;
  war: number;
  warEvent: number;
  /** The country it became, while it fights for that and after (a nation's id, or -1). */
  child: number;
  /** The year it was recognised as a country (or -1). */
  freed: number;
  /** The year its last rising was put down (or -1), and the year its last town was lost or emptied (or -1). */
  crushed: number;
  gone: number;
}

/** How a colony stands with its mother country, each 0..1 unless said. */
export interface Standing {
  /** How far it is from the mother country's capital, in radians round the globe. */
  distance: number;
  /** Its people as a share of the mother country's (colony included). */
  share: number;
  /** How unequal and how war-weary the mother country is, and how steady. */
  inequality: number; fatigue: number; stability: number;
  /** Has there been a revolution at home within living memory? Is there print? */
  revolution: boolean; press: boolean;
}

const sat = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * How much a colony's sense of itself grows in a year. Left alone it takes about ten generations; distance,
 * taxes, the mother country's wars, its own size and news of a revolution at home all shorten that.
 */
export function growsApart(s: Standing): number {
  const push = 1 + 0.6 * sat(s.distance / 1.5) + 0.9 * s.inequality + 0.8 * s.fatigue + 1.2 * sat(s.share / 0.4) + (s.revolution ? 0.7 : 0) + (s.press ? 0.3 : 0);
  return push / 420;
}

/**
 * Is a colony ready to declare itself free? Its people must think of themselves as their own, and there must be
 * enough of them to think they can win: more than one town, or a good share of the mother country's people. A
 * colony whose last rising was put down waits two generations before it tries again.
 */
export function ready(c: Pick<Colony, 'identity' | 'crushed'>, towns: number, share: number, year: number): boolean {
  if (c.identity < 1 || (c.crushed >= 0 && year - c.crushed < 60)) return false;
  return towns >= 2 || share >= 0.12;
}

/**
 * The army a mother country can put ashore, as a share of the one it could raise at home: ships carry only so
 * many, and fewer the further they must go.
 */
export function shipped(distance: number, steam: boolean): number {
  return (steam ? 0.6 : 0.4) / (1 + 1.2 * distance);
}

/** How many years, on average, a colony that is ready waits before it declares: not long when the mother country is unsteady. */
export function waits(s: Standing): number {
  return s.stability < 0.5 ? 8 : s.stability < 0.65 ? 25 : 70;
}

/**
 * The chance a rising succeeds when it is not fought out battle by battle (time is running too fast to
 * follow a campaign): better the further the army must sail, the larger the colony beside its mother, and
 * the more unsteady or war-weary the mother country is.
 */
export function odds(s: Standing): number {
  return sat(0.3 + 0.25 * sat(s.distance / 1.5) + 0.5 * sat(s.share / 0.5) + 0.3 * (1 - s.stability) + 0.2 * s.fatigue - 0.15);
}

/** A colony's state in a few words. */
export function describeColony(c: Pick<Colony, 'identity' | 'freed' | 'crushed' | 'gone' | 'founded'>, year: number): string {
  if (c.freed >= 0) return 'a country of its own';
  if (c.gone >= 0) return 'lost';
  const share = Math.round(sat(c.identity) * 100);
  const mood = c.identity >= 1 ? 'its people think of themselves as a people of their own' : c.identity >= 0.6 ? `about ${share} in a hundred of its people would say they are of the colony first` : c.identity >= 0.25 ? 'its people are beginning to speak of the old country as somewhere else' : 'its people still call the old country home';
  return `${mood}${c.crushed >= 0 ? `; a rising was put down ${Math.max(1, Math.round(year - c.crushed))} years ago` : ''}`;
}
