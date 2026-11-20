// The documentary maker's plan (expansion E59).
import { describe, expect, it } from 'vitest';
import { planFilm, shotAt } from '../src/game/film';
import { Simulation } from '../src/sim/simulation';
import type { SimEvent } from '../src/sim/events';

const event = (id: number, over: Partial<SimEvent> = {}): SimEvent => ({ id, type: 'speciation', simYear: id * 1000, cellId: id, title: `Event ${id}`, description: `Something happened, number ${id}, and it is told in a sentence.`, causes: [], causeWeights: [], effects: [], importance: 1, ...over });

describe('E59 the documentary plan', () => {
  it('fills the whole length with shots, in the order things happened, with no gap and no shot too short to read', () => {
    const events = Array.from({ length: 300 }, (_, i) => event(i, { importance: i % 7 === 0 ? 3 : i % 3 === 0 ? 2 : 1, effects: i % 11 === 0 ? [1, 2, 3, 4, 5] : [] }));
    for (const minutes of [1, 3, 10]) {
      const shots = planFilm(events, minutes);
      expect(shots.length).toBe(Math.round((minutes * 60) / 9));
      expect(shots[0]!.at).toBe(0);
      for (let i = 1; i < shots.length; i++) {
        expect(shots[i]!.year).toBeGreaterThanOrEqual(shots[i - 1]!.year);
        expect(shots[i]!.at).toBeCloseTo(shots[i - 1]!.at + shots[i - 1]!.seconds, 6);
      }
      const end = shots[shots.length - 1]!;
      expect(end.at + end.seconds).toBeCloseTo(minutes * 60, 6);
      for (const s of shots) expect(s.seconds).toBeGreaterThan(4);
      expect(new Set(shots.map((s) => s.eventId)).size).toBe(shots.length);
      // every stretch of the record gives a shot: none of the film sits in one corner of history
      const tenth = shots.filter((s) => s.eventId < 30).length, last = shots.filter((s) => s.eventId >= 270).length;
      expect(tenth).toBeGreaterThan(0);
      expect(last).toBeGreaterThan(0);
      // and it prefers what mattered
      expect(shots.filter((s) => events[s.eventId]!.importance >= 2).length).toBeGreaterThan(shots.length * 0.8);
      expect(shotAt(shots, 0)).toBe(0);
      expect(shotAt(shots, minutes * 60 - 0.01)).toBe(shots.length - 1);
      expect(shotAt(shots, minutes * 60 + 1)).toBe(-1);
    }
  });

  it('opens on the first life and closes on the latest thing of note, and copes with a short record', () => {
    const events = [event(0, { importance: 0 }), event(1), event(2, { type: 'milestone', importance: 3, data: { key: 'first-life' }, title: 'First life' }), ...Array.from({ length: 80 }, (_, i) => event(i + 3, { importance: 2 }))];
    const shots = planFilm(events, 1);
    expect(shots[0]!.title).toBe('First life');
    expect(shots[shots.length - 1]!.eventId).toBe(82);
    expect(planFilm([], 3)).toEqual([]);
    const few = planFilm(events.slice(0, 4), 3);
    expect(few.length).toBe(3); // the one of no importance is left out
    expect(few[few.length - 1]!.at + few[few.length - 1]!.seconds).toBeCloseTo(180, 6);
  });

  it('a three-minute film of a real world runs from the beginning of life to the present', () => {
    const sim = new Simulation('amber-reef-101', 15);
    while (sim.simYear < 40e6) sim.step(15000);
    const shots = planFilm(sim.events.events, 3);
    expect(shots.length).toBe(20);
    expect(shots.some((s) => s.eventId === sim.milestones.get('first-life'))).toBe(true);
    expect(shots[shots.length - 1]!.year).toBeGreaterThan(sim.simYear - 6e6);
    expect(shots[shots.length - 1]!.at + shots[shots.length - 1]!.seconds).toBeCloseTo(180, 6);
    for (const s of shots) { expect(s.text.length).toBeGreaterThan(10); expect(sim.events.events[s.eventId]!.title).toBe(s.title); }
  });
});
