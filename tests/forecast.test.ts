// Forecasts (expansion E60): scholars say what will happen; the world shows whether it does.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { saveSimulation, loadSimulation } from '../src/sim/snapshot';
import type { Forecast } from '../src/sim/forecast';

const fresh = () => { const sim = new Simulation('amber-reef-101', 15); sim.step(1000); return sim; };
const made = (sim: Simulation, over: Partial<Forecast>): Forecast => {
  const ev = sim.emit({ type: 'forecast', title: 'A forecast', description: 'Something will happen.', importance: 0 });
  const f: Forecast = { id: sim.forecast.list.length, year: sim.simYear, due: sim.simYear + 50, nation: -1, town: -1, by: 'Aro', kind: 'stone', basis: 'guessed', text: 'A great stone will fall.', from: '', outcome: 'open', eventId: ev.id, outcomeEvent: -1, proof: -1, mark: sim.simYear, ...over };
  sim.forecast.list.push(f);
  return f;
};
const landCell = (sim: Simulation) => { for (let i = 0; i < sim.grid.count; i++) if (sim.world.elevation[i]! > sim.world.seaLevel + 0.1) return i; return 0; };

describe('E60 forecasts', () => {
  it('a forecast is borne out by the event it named, and the outcome is caused by both', () => {
    const sim = fresh();
    const f = made(sim, {});
    sim.step(5);
    expect(f.outcome).toBe('open');
    const strike = sim.meteor(landCell(sim), 0.4, true);
    sim.step(1);
    expect(f.outcome).toBe('kept');
    expect(f.proof).toBe(strike.id);
    const out = sim.events.events[f.outcomeEvent]!;
    expect(out.type).toBe('forecast-kept');
    expect(out.causes).toEqual(expect.arrayContaining([f.eventId, strike.id]));
    expect(out.description).toContain(f.text);
    // it is settled once
    sim.meteor(landCell(sim), 0.4, true);
    sim.step(1);
    expect(sim.events.events.filter((e) => e.type === 'forecast-kept').length).toBe(1);
  });

  it('fails when its time runs out with nothing to show', () => {
    const sim = fresh();
    const f = made(sim, { kind: 'fire', due: sim.simYear + 20 });
    sim.step(19);
    expect(f.outcome).toBe('open');
    sim.step(5);
    expect(f.outcome).toBe('failed');
    expect(f.proof).toBe(-1);
    expect(sim.events.events[f.outcomeEvent]!.type).toBe('forecast-failed');
    expect(sim.events.events[f.outcomeEvent]!.causes).toEqual([f.eventId]);
  });

  it('reads a level on the day named, not before', () => {
    const sim = fresh();
    const sea = sim.world.seaLevel, temp = sim.climate.meanTemp;
    const higher = made(sim, { kind: 'sea-rise', basis: 'reckoned', mark: sea - 1, due: sim.simYear + 30 });
    const lower = made(sim, { kind: 'sea-fall', basis: 'reckoned', mark: sea - 1, due: sim.simYear + 30 });
    const colder = made(sim, { kind: 'cold', basis: 'reckoned', mark: temp + 50, due: sim.simYear + 30 });
    const warmer = made(sim, { kind: 'warm', basis: 'reckoned', mark: temp + 50, due: sim.simYear + 30 });
    sim.step(20);
    for (const f of [higher, lower, colder, warmer]) expect(f.outcome).toBe('open');
    sim.step(11);
    expect(higher.outcome).toBe('kept');
    expect(lower.outcome).toBe('failed');
    expect(colder.outcome).toBe('kept');
    expect(warmer.outcome).toBe('failed');
    const info = sim.forecast.info();
    expect(info.reckoned).toEqual([2, 2]);
    expect(info.guessed).toEqual([0, 0]);
  });

  it('is carried in a save', () => {
    const sim = fresh();
    made(sim, {});
    made(sim, { kind: 'fire', due: sim.simYear + 20 });
    sim.step(5);
    const back = new Simulation('amber-reef-101', 15);
    loadSimulation(back, saveSimulation(sim));
    expect(back.forecast.list).toEqual(sim.forecast.list);
    back.step(30); sim.step(30);
    expect(back.forecast.list.map((f) => f.outcome)).toEqual(sim.forecast.list.map((f) => f.outcome));
    expect(back.forecast.list[1]!.outcome).toBe('failed');
  });

  it('makes none without a nation that keeps records', () => {
    const sim = fresh();
    sim.step(5000);
    expect(sim.forecast.list.length).toBe(0);
  });
});
