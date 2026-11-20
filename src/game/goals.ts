// Goals: optional things to aim for. The game is a sandbox first; nothing here costs anything, locks
// anything or can be lost. A goal only watches the world the player is already running and says how
// far along it is. Everything is judged from what the page already knows (stats, species, settlements
// and the event record), so the simulation itself does not know goals exist.
import type { SettlementInfo, SpeciesInfo, WorldStats } from '../shared/protocol';
import type { SimEvent } from '../sim/events';

/** What a goal may look at. */
export interface GoalView {
  stats: WorldStats;
  species: Map<number, SpeciesInfo>;
  settlements: SettlementInfo[];
  /** All events by id (sparse). */
  events: (SimEvent | undefined)[];
  /** How many nations the page is showing. */
  nations: number;
}

export interface GoalResult {
  /** 0 to 1. */
  progress: number;
  done: boolean;
  /** Where things stand, in a few words. */
  note: string;
  /** The event to open under "Why did this happen?", when there is one. */
  eventId?: number;
}

export interface Goal {
  id: string;
  title: string;
  /** What to pull off. */
  brief: string;
  /** A nudge toward how, for players who want one. */
  hint: string;
  /**
   * Judge the goal. `memo` is a small number the goal may keep between checks (for goals with two
   * steps, such as "freeze the world, then thaw it"); return the new value in `memo`.
   */
  check(v: GoalView, memo: number): GoalResult & { memo?: number };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const living = (v: GoalView): SpeciesInfo[] => [...v.species.values()].filter((s) => s.extinctYear < 0);
const best = <T>(list: T[], score: (x: T) => number): T | undefined => {
  let top: T | undefined, s = -Infinity;
  for (const x of list) { const q = score(x); if (q > s) { s = q; top = x; } }
  return top;
};
const lastEvent = (v: GoalView, test: (e: SimEvent) => boolean): SimEvent | undefined => {
  for (let i = v.events.length - 1; i >= 0; i--) { const e = v.events[i]; if (e && test(e)) return e; }
  return undefined;
};
const metres = (m: number): string => (m >= 1 ? `${m.toFixed(1)} m` : `${Math.round(m * 100)} cm`);

// Targets, set from headless runs of the default worlds (scripts/checks/goalsweep.ts) so each can be reached.
/** Share of the land under plants. A full-size world settles a little under a fifth once plants are ashore. */
const GREEN = 1 / 8;
/** The simulation's own line between gliding and flying. */
const FLIES = 0.45;
/** Kinds of animal alive at once. A full-size world left alone holds about forty. */
const CROWD = 50;
/** Ice below this share of the globe counts as thawed; quiet worlds sit between 0.15 and 0.35. */
const THAWED = 0.25;

export const GOALS: Goal[] = [
  {
    id: 'green', title: 'A green world',
    brief: 'Get plants growing across an eighth of the land.',
    hint: 'Plants need oxygen-makers in the sea first, then time. Warmth and rain help; ice and ash do not.',
    check: (v) => {
      // the sim counts cover over the whole globe; a player thinks of the land
      const c = clamp01(v.stats.landCover / Math.max(0.05, 1 - v.stats.oceanFraction));
      return { progress: clamp01(c / GREEN), done: c >= GREEN, note: `${Math.round(c * 100)}% of the land is green` };
    },
  },
  {
    id: 'ashore', title: 'Out of the water',
    brief: 'Have an animal that lives on land.',
    hint: 'Land animals follow land plants. Shallow seas and long coasts give them somewhere to start.',
    check: (v) => {
      const sp = best(living(v), (s) => s.land);
      const land = sp?.land ?? 0;
      return { progress: clamp01(land / 0.5), done: land > 0.5, note: sp ? `${sp.name} spends ${Math.round(land * 100)}% of its life ashore` : 'no animals yet', eventId: sp && land > 0.5 ? sp.eventId : undefined };
    },
  },
  {
    id: 'wings', title: 'Take to the air',
    brief: 'Have an animal that truly flies.',
    hint: 'Flight is rare on its own: gliders come first, among small, light animals in forests. Or design a winged animal yourself and see whether it lasts.',
    check: (v) => {
      const sp = best(living(v), (s) => s.fly);
      const fly = sp?.fly ?? 0;
      return { progress: clamp01(fly / FLIES), done: fly > FLIES, note: !sp ? 'no animals yet' : fly > FLIES ? `${sp.name} flies` : fly > 0.12 ? `${sp.name} can glide` : 'nothing leaves the ground yet', eventId: sp && fly > FLIES ? sp.eventId : undefined };
    },
  },
  {
    id: 'giant', title: 'Giants',
    brief: 'Raise a land animal at least five metres long.',
    hint: 'Size pays where food is plentiful and the climate is steady. A long warm era helps.',
    check: (v) => {
      const sp = best(living(v).filter((s) => s.land > 0.5), (s) => s.metres);
      const m = sp?.metres ?? 0;
      return { progress: clamp01(m / 5), done: m >= 5, note: sp ? `the largest on land is ${sp.name}, ${metres(m)}` : 'nothing lives on land yet', eventId: sp && m >= 5 ? sp.eventId : undefined };
    },
  },
  {
    id: 'crowd', title: 'A crowded world',
    brief: `Have ${CROWD} kinds of animal alive at the same time.`,
    hint: 'A world left alone holds about forty. Variety comes from variety of places: islands, mountains, different climates. Animals you design and release count too.',
    check: (v) => {
      const n = v.stats.livingSpecies;
      return { progress: clamp01(n / CROWD), done: n >= CROWD, note: `${n} kinds alive now` };
    },
  },
  {
    id: 'comeback', title: 'Back from the brink',
    brief: 'After a mass extinction, see life double from its lowest point.',
    hint: 'You can wait for a catastrophe or cause one. What matters is what is left alive, and where.',
    check: (v, memo) => {
      const e = lastEvent(v, (x) => x.type === 'mass-extinction');
      if (!e) return { progress: 0, done: false, note: 'no mass extinction has happened yet', memo: 0 };
      // memo holds which extinction is being watched and the fewest kinds seen since: (event id + 1) * 1000 + fewest
      const n = v.stats.livingSpecies;
      const same = Math.floor(memo / 1000) === e.id + 1;
      const low = Math.min(999, same ? Math.min(memo % 1000, n) : n);
      const target = Math.max(low * 2, low + 5);
      return { progress: 0.25 + 0.75 * clamp01((n - low) / (target - low)), done: n >= target, note: `${n} kinds alive; ${low} at the worst after ${e.title}`, eventId: e.id, memo: (e.id + 1) * 1000 + low };
    },
  },
  {
    id: 'thaw', title: 'Snowball and thaw',
    brief: 'Let ice cover half the world, then bring it back below a quarter, with animals still alive.',
    hint: 'Cold feeds on itself: ice reflects sunlight. An ice age from the sky tools starts it; warmth, volcanoes and time undo it.',
    check: (v, memo) => {
      const ice = v.stats.iceFraction;
      if (memo < 1) {
        const frozen = ice >= 0.5;
        return { progress: 0.5 * clamp01(ice / 0.5), done: false, note: `ice covers ${Math.round(ice * 100)}% of the world`, memo: frozen ? 1 : 0 };
      }
      const thawed = ice <= THAWED && v.stats.livingSpecies > 0;
      return { progress: 0.5 + 0.5 * clamp01((0.5 - ice) / (0.5 - THAWED)), done: thawed, note: `frozen once; ice is now ${Math.round(ice * 100)}%`, memo: 1 };
    },
  },
  {
    id: 'fires', title: 'First fires',
    brief: 'See a people settle down.',
    hint: 'Minds grow in clever, sociable land animals that stay numerous for a long time.',
    check: (v) => {
      const live = v.settlements.filter((s) => s.ruined < 0);
      const first = best(live, (s) => -s.founded);
      return { progress: live.length ? 1 : 0, done: live.length > 0, note: live.length ? `${live.length} settlements` : 'no one has settled yet', eventId: first && first.eventId >= 0 ? first.eventId : undefined };
    },
  },
  {
    id: 'city', title: 'A city',
    brief: 'Have a settlement grow into a city.',
    hint: 'Farms come first, then villages. Peace, rivers and a coast all help a town grow.',
    check: (v) => {
      const top = best(v.settlements.filter((s) => s.ruined < 0), (s) => s.tech);
      const t = top?.tech ?? 0;
      return { progress: clamp01(t / 0.6), done: t >= 0.6, note: top ? `${top.name} leads the way` : 'no settlements yet', eventId: top && t >= 0.6 && top.eventId >= 0 ? top.eventId : undefined };
    },
  },
  {
    id: 'nations', title: 'A world of nations',
    brief: 'Have ten nations on the map at once.',
    hint: 'Nations multiply where the land is broken up by seas and mountains.',
    check: (v) => ({ progress: clamp01(v.nations / 10), done: v.nations >= 10, note: `${v.nations} nations` }),
  },
  {
    id: 'stars', title: 'Leave home',
    brief: 'See a people leave the planet.',
    hint: 'It takes a long, unbroken history. Catastrophes set it back; so do wars.',
    check: (v) => {
      const e = lastEvent(v, (x) => x.type === 'milestone' && x.data?.key === 'departure');
      const t = v.stats.maxTech;
      return { progress: e ? 1 : clamp01(t / 1.1) * 0.9, done: !!e, note: e ? 'they have gone' : t > 0 ? 'knowledge is growing' : 'no one to leave yet', eventId: e?.id };
    },
  },
];

/** What is remembered about goals between visits. */
export interface GoalRecord {
  /** Goals reached: where and when. */
  done: Record<string, { seed: string; year: number; eventId?: number }>;
  /** Per-goal memo for goals with more than one step, kept per seed so a new world starts them again. */
  memo: Record<string, number>;
  /** The goal shown on screen while playing, or '' for none. */
  tracked: string;
}

export const emptyRecord = (): GoalRecord => ({ done: {}, memo: {}, tracked: '' });

/** `reached`: on any world, ever. `here`: on this world. */
export interface GoalState { goal: Goal; result: GoalResult; reached: boolean; here: boolean }

/**
 * Judge every goal against the world as it is. Returns the state of each for display, and the ids
 * reached for the first time by this check (the record is updated in place).
 */
export function evaluateGoals(v: GoalView, record: GoalRecord, seed: string): { states: GoalState[]; fresh: string[] } {
  const states: GoalState[] = [];
  const fresh: string[] = [];
  for (const goal of GOALS) {
    const key = `${seed}:${goal.id}`;
    const r = goal.check(v, record.memo[key] ?? 0);
    if (r.memo !== undefined) record.memo[key] = r.memo;
    const was = record.done[goal.id];
    if (r.done && !was) {
      record.done[goal.id] = { seed, year: v.stats.simYear, eventId: r.eventId };
      fresh.push(goal.id);
    }
    states.push({ goal, result: { progress: r.progress, done: r.done, note: r.note, eventId: r.eventId }, reached: !!record.done[goal.id], here: record.done[goal.id]?.seed === seed });
  }
  return { states, fresh };
}
