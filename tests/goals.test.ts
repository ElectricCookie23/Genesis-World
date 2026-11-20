// The optional goals: judged only from what the page knows, never lost, and remembered across worlds.
import { describe, expect, it } from 'vitest';
import { GOALS, emptyRecord, evaluateGoals, type GoalView } from '../src/game/goals';
import type { SettlementInfo, SpeciesInfo, WorldStats } from '../src/shared/protocol';
import type { SimEvent } from '../src/sim/events';

const stats = (over: Partial<WorldStats> = {}): WorldStats => ({ simYear: 1e6, iceFraction: 0.2, landCover: 0, oceanFraction: 0.7, livingSpecies: 0, maxTech: 0, settlements: 0, ...over } as WorldStats);
const kind = (id: number, over: Partial<SpeciesInfo> = {}): SpeciesInfo => ({ id, name: `Kind ${id}`, parent: -1, bornYear: 0, extinctYear: -1, pop: 100, eventId: id, metres: 0.3, land: 0, fly: 0, ...over } as SpeciesInfo);
const town = (id: number, over: Partial<SettlementInfo> = {}): SettlementInfo => ({ id, name: `Town ${id}`, cell: 0, species: 0, pop: 5, tech: 0.1, founded: 100 + id, lore: 0, eventId: 50 + id, ruined: -1, ...over });
const event = (id: number, over: Partial<SimEvent> = {}): SimEvent => ({ id, type: 'speciation', simYear: id, cellId: 0, title: `Event ${id}`, description: '', causes: [], causeWeights: [], effects: [], importance: 1, ...over });
const view = (over: Partial<GoalView> = {}): GoalView => ({ stats: stats(), species: new Map(), settlements: [], events: [], nations: 0, ...over });
const state = (v: GoalView, id: string, record = emptyRecord(), seed = 'a') => evaluateGoals(v, record, seed).states.find((s) => s.goal.id === id)!;

describe('goals', () => {
  it('have distinct ids and something to say', () => {
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    for (const g of GOALS) { expect(g.title.length).toBeGreaterThan(3); expect(g.brief.length).toBeGreaterThan(10); expect(g.hint.length).toBeGreaterThan(10); }
  });

  it('reach nothing on an empty world, and never report progress outside 0 to 1', () => {
    const { states, fresh } = evaluateGoals(view(), emptyRecord(), 'a');
    expect(fresh).toEqual([]);
    for (const s of states) { expect(s.reached).toBe(false); expect(s.result.progress).toBeGreaterThanOrEqual(0); expect(s.result.progress).toBeLessThanOrEqual(1); expect(s.result.note.length).toBeGreaterThan(0); }
  });

  it('judge life from the living, not the dead', () => {
    const species = new Map([[1, kind(1, { land: 0.9, metres: 7, extinctYear: 5 })], [2, kind(2, { land: 0.2, fly: 0.1 })]]);
    expect(state(view({ species }), 'ashore').result.done).toBe(false);
    expect(state(view({ species }), 'giant').result.done).toBe(false);
    species.set(3, kind(3, { land: 0.8, metres: 6, fly: 0.5 }));
    species.set(4, kind(4, { fly: 0.3 }));
    const v = view({ species });
    expect(state(v, 'ashore').result.done).toBe(true);
    expect(state(v, 'ashore').result.eventId).toBe(3);
    expect(state(v, 'giant').result.done).toBe(true);
    expect(state(v, 'wings').result.done).toBe(true);
  });

  it('count a giant only on land', () => {
    const species = new Map([[1, kind(1, { land: 0.05, metres: 20 })]]);
    expect(state(view({ species }), 'giant').result.done).toBe(false);
  });

  it('want a mass extinction, then life winning back ground from its lowest point, before a comeback counts', () => {
    const record = emptyRecord();
    expect(state(view({ stats: stats({ livingSpecies: 40 }) }), 'comeback', record).result.done).toBe(false);
    const events = [event(0), event(1, { type: 'mass-extinction', title: 'The Great Dying' })];
    // seen with many kinds still alive: not a comeback yet, whatever the number
    const first = state(view({ stats: stats({ livingSpecies: 18 }), events }), 'comeback', record);
    expect(first.result.done).toBe(false);
    expect(first.result.eventId).toBe(1);
    expect(state(view({ stats: stats({ livingSpecies: 6 }), events }), 'comeback', record).result.done).toBe(false);
    expect(state(view({ stats: stats({ livingSpecies: 10 }), events }), 'comeback', record).result.done).toBe(false);
    expect(state(view({ stats: stats({ livingSpecies: 11 }), events }), 'comeback', record).result.done).toBe(true);
    // a later extinction starts the count again
    const again = [...events, event(2, { type: 'mass-extinction', title: 'The Second Dying' })];
    expect(state(view({ stats: stats({ livingSpecies: 12 }), events: again }), 'comeback', record).result.done).toBe(false);
  });

  it('make the snowball a two-step goal that remembers the freeze, per world', () => {
    const record = emptyRecord();
    expect(state(view({ stats: stats({ iceFraction: 0.1, livingSpecies: 5 }) }), 'thaw', record).result.done).toBe(false);
    expect(state(view({ stats: stats({ iceFraction: 0.6, livingSpecies: 5 }) }), 'thaw', record).result.done).toBe(false);
    expect(state(view({ stats: stats({ iceFraction: 0.3, livingSpecies: 5 }) }), 'thaw', record).result.done).toBe(false);
    // a thaw on another world does not count as this one's
    expect(state(view({ stats: stats({ iceFraction: 0.1, livingSpecies: 5 }) }), 'thaw', record, 'b').result.done).toBe(false);
    const thawed = evaluateGoals(view({ stats: stats({ iceFraction: 0.1, livingSpecies: 5 }) }), record, 'a');
    expect(thawed.fresh).toContain('thaw');
  });

  it('judge peoples from living towns', () => {
    expect(state(view({ settlements: [town(1, { ruined: 500 })] }), 'fires').result.done).toBe(false);
    const v = view({ settlements: [town(1, { ruined: 500 }), town(2), town(3, { tech: 0.7 })], nations: 10 });
    expect(state(v, 'fires').result.done).toBe(true);
    expect(state(v, 'fires').result.eventId).toBe(52);
    expect(state(v, 'city').result.done).toBe(true);
    expect(state(v, 'nations').result.done).toBe(true);
  });

  it('see the departure in the record', () => {
    expect(state(view({ stats: stats({ maxTech: 1 }) }), 'stars').result.done).toBe(false);
    const events = [event(0, { type: 'milestone', title: 'Departure', data: { key: 'departure' } })];
    const s = state(view({ events }), 'stars');
    expect(s.result.done).toBe(true);
    expect(s.result.eventId).toBe(0);
  });

  it('announce a goal once and keep it, even after the world moves on or changes', () => {
    const record = emptyRecord();
    const green = view({ stats: stats({ landCover: 0.06, simYear: 7e6 }) });
    expect(evaluateGoals(green, record, 'a').fresh).toEqual(['green']);
    expect(evaluateGoals(green, record, 'a').fresh).toEqual([]);
    expect(record.done.green).toEqual({ seed: 'a', year: 7e6, eventId: undefined });
    const bare = evaluateGoals(view(), record, 'b').states.find((s) => s.goal.id === 'green')!;
    expect(bare.reached).toBe(true);
    expect(bare.here).toBe(false);
    expect(bare.result.done).toBe(false);
    // the record survives being written out and read back
    expect(JSON.parse(JSON.stringify(record)).done.green.seed).toBe('a');
  });
});
