// Wars with campaigns (system E33). A war is not one throw of the dice: an army is raised, marches from town
// to town along the roads, eats what it carries, meets the defenders in the field or sits down before walls,
// and wins or is broken. Each meeting is decided by numbers, by what each side knows how to make, by how well
// fed and how willing its soldiers are, by the ground, by who leads, and only then by luck.
//
// The rules of a single clash are here, pure, so that the engine and the tests use the same ones.

/** An army in the field. */
export interface Army {
  /** Soldiers, in thousands, and what it began with. */
  size: number; raised: number;
  /** What its makers know (the country's technology when it marched). */
  tech: number;
  /** How willing it is to fight (0..1) and how well it is fed (0..1). */
  morale: number; supply: number;
  /** How good its leader is (0..1), and the leader's name. */
  lead: number; leader: string;
}

export const BATTLE_KINDS = ['field', 'siege', 'storm', 'raid'] as const;
export type BattleKind = (typeof BATTLE_KINDS)[number];

/** One meeting of a war. */
export interface Battle {
  year: number;
  /** The town it was fought at or for. */
  settlement: number;
  kind: BattleKind;
  /** Who won: 0 the attacker, 1 the defender. */
  winner: 0 | 1;
  /** How many each side brought (thousands), attacker first, and how many each lost. */
  sizes: [number, number]; lost: [number, number];
  /** What decided it, in a few words. */
  decided: string;
  /** Did the town change hands? */
  taken: boolean;
  eventId: number;
}

/** A war: who against whom, the road the attacker means to take, where it has got to, and every battle so far. */
export interface War {
  id: number;
  /** The attacker and the defender (nation ids). */
  a: number; b: number;
  year: number;
  /** The year it ended, or -1. */
  ended: number;
  /** The event that began it, and the event of the peace (-1 until then). */
  eventId: number; peaceEvent: number;
  /** Does the attacker mean to keep what it takes, or only to burn it? */
  conquest: boolean;
  /** The towns the attacker means to take, in order (settlement ids), and how many it has dealt with. */
  route: number[]; at: number;
  /** Years it has sat before the town it is now at. */
  sieging: number;
  army: [Army, Army];
  battles: Battle[];
  outcome: '' | 'attacker' | 'defender' | 'stalemate';
  /** Towns that changed hands in it. */
  taken: number[];
  /** The great war it is part of (system E40): a great war's id. */
  great?: number;
  /** For a war a mother country fights to keep a colony (system E36): the colony's id. */
  independence?: number;
}

/** The ground a clash is fought on, as far as it matters: how much it favours whoever holds it (0 open plain, 1 a hill town behind a river), and the walls the town has (0 none). */
export interface Field { ground: number; walls: number }

/** How strong an army is where it stands: numbers, craft, will, food and its leader. */
export function strength(a: Army): number {
  return a.size * (0.5 + 1.2 * a.tech) * (0.4 + 0.6 * a.morale) * (0.35 + 0.65 * a.supply) * (0.8 + 0.4 * a.lead);
}

/**
 * Resolve one clash. `luck` is 0..1 (0.5 is none either way). The defender has the ground, and in an assault the
 * walls; gunpowder makes walls count for much less. Returns who won, what each lost, and what decided it.
 */
export function clash(att: Army, def: Army, field: Field, kind: BattleKind, luck: number): { winner: 0 | 1; lost: [number, number]; decided: string } {
  const walls = kind === 'storm' ? field.walls * (att.tech >= 0.63 ? 0.25 : 1) : 0;
  const hold = 1 + 0.35 * field.ground + 0.45 * walls;
  const a = strength(att) * (0.75 + 0.5 * luck), d = strength(def) * hold * (0.75 + 0.5 * (1 - luck));
  const winner: 0 | 1 = a > d ? 0 : 1;
  const edge = Math.max(a, d) / Math.max(1e-6, Math.min(a, d));
  // the loser of a close fight gets away in order; the loser of a rout does not
  const hard = Math.min(0.6, 0.22 + 0.12 * (edge - 1)), light = Math.max(0.05, 0.16 - 0.03 * (edge - 1));
  const lost: [number, number] = winner === 0 ? [att.size * light, def.size * hard] : [att.size * hard, def.size * light];
  // what decided it: whichever advantage of the winner over the loser was greatest
  const w = winner === 0 ? att : def, l = winner === 0 ? def : att;
  const reasons: [number, string][] = [
    [w.size / Math.max(0.01, l.size), 'numbers'],
    [(0.5 + 1.2 * w.tech) / (0.5 + 1.2 * l.tech), 'better arms'],
    [(0.4 + 0.6 * w.morale) / (0.4 + 0.6 * l.morale), 'the will to fight'],
    [(0.35 + 0.65 * w.supply) / (0.35 + 0.65 * l.supply), l.supply < 0.45 ? 'hunger in the other camp' : 'full wagons'],
    [(0.8 + 0.4 * w.lead) / (0.8 + 0.4 * l.lead), `the generalship of ${w.leader}`],
    [winner === 1 ? hold : 1, walls > 0 ? 'the walls' : 'the ground'],
    [winner === 0 ? 0.75 + 0.5 * luck : 0.75 + 0.5 * (1 - luck), 'luck'],
  ];
  reasons.sort((x, y) => y[0] - x[0]);
  return { winner, lost, decided: reasons[0]![1] };
}

/** How many years an army must sit before a town's walls before it can storm them or the town gives in: none without walls, fewer with powder. */
export function siegeYears(walls: number, tech: number): number {
  if (walls <= 0) return 0;
  return tech >= 0.63 ? 1 : Math.min(3, 1 + walls);
}

/** A battle in a sentence. */
export function describeBattle(b: Battle, town: string, attacker: string, defender: string): string {
  const who = b.winner === 0 ? attacker : defender;
  const n = (v: number) => `${Math.max(1, Math.round(v))},000`;
  const what = b.kind === 'field' ? `${attacker} (${n(b.sizes[0])}) met ${defender} (${n(b.sizes[1])}) in the field before ${town}`
    : b.kind === 'siege' ? `${attacker} sat down before the walls of ${town} with ${n(b.sizes[0])}`
      : b.kind === 'storm' ? `${attacker} stormed ${town} with ${n(b.sizes[0])} against ${n(b.sizes[1])} on the walls`
        : `${attacker} fell on ${town} with ${n(b.sizes[0])}`;
  const end = b.kind === 'siege' ? (b.winner === 0 ? `${town} opened its gates` : 'the besiegers ate their horses and went home') : `${who} had the day`;
  return `${what}, and ${end}: ${b.decided} decided it.${b.taken ? ` ${town} changed hands.` : ''}`;
}
