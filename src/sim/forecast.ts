// Forecasts (expansion E60).
//
// The brief called these prophecies, made by prophets. The owner has taken religion out of the game, so they are what
// the same idea is without it: a scholar of some nation says what will happen, and the world then shows whether it
// does. Each forecast is one of two kinds, and the difference is the point:
//   reckoned  worked out from something that really is regular or really is under way in this world: a comet that has
//             come back before, a sea that has been rising for a century, a mountain that has burned twice
//   guessed   said with no pattern behind it: a stone will fall, the town will burn, the ruling house will end
// Nothing decides the outcome but the simulation. A reckoned forecast is usually right and a guess is right now and
// then by chance; the panel keeps the score of both. When a forecast is borne out, the nation it was made in trusts
// its scholars more and asks them for more.
//
// Plain data on the simulation with its own random stream, like the other expansion modules. It emits events and
// changes nothing else.
import type { RNG } from './rng';
import type { Simulation } from './simulation';
import type { Settlement } from './civilization';

export type ForecastKind = 'comet' | 'sea-rise' | 'sea-fall' | 'cold' | 'warm' | 'mountain' | 'stone' | 'fire' | 'house';

export interface Forecast {
  id: number;
  year: number;
  /** The year by which it must have happened. */
  due: number;
  nation: number;
  town: number;
  /** The scholar who made it. */
  by: string;
  kind: ForecastKind;
  basis: 'reckoned' | 'guessed';
  text: string;
  /** What it was reckoned from, in a few words ('' for a guess). */
  from: string;
  outcome: 'open' | 'kept' | 'failed';
  /** The event that announced it, the event that settled it (-1 while open), and the event that made it true (-1 if none). */
  eventId: number;
  outcomeEvent: number;
  proof: number;
  /** What it is tested against: a level, a year, a house. */
  mark: number;
}

export interface ForecastInfo {
  forecasts: Forecast[];
  /** Kept and failed, for each basis. */
  reckoned: [number, number];
  guessed: [number, number];
}

const NAMES = ['Aro', 'Belu', 'Cima', 'Dael', 'Eshu', 'Fenn', 'Gora', 'Hali', 'Ibe', 'Jossa', 'Kemi', 'Luan', 'Maro', 'Neth', 'Oda', 'Pell', 'Quen', 'Rhu', 'Sova', 'Tane'];

export class Forecasts {
  rng: RNG;
  list: Forecast[] = [];
  /** When the next one may be made. */
  private nextAt = 0;
  /** Sea level and mean temperature a while ago, and when that was: a trend is the difference from then to now. */
  private seaWas = 0;
  private tempWas = 0;
  private sampledAt = -1;
  private seaTrend = 0;
  private tempTrend = 0;
  /** How far each nation trusts its scholars: every forecast borne out adds to it. */
  private trust: Record<number, number> = {};
  /** Events already looked at. */
  private seen = 0;

  constructor(rng: RNG) { this.rng = rng; }

  step(sim: Simulation, dt: number): void {
    const year = sim.simYear;
    // the slow drift of sea and air, measured over a century or so
    if (this.sampledAt < 0 || year - this.sampledAt > 20000) { this.seaWas = sim.world.seaLevel; this.tempWas = sim.climate.meanTemp; this.sampledAt = year; this.seaTrend = 0; this.tempTrend = 0; }
    else if (year - this.sampledAt >= 120) {
      this.seaTrend = (sim.world.seaLevel - this.seaWas) / (year - this.sampledAt);
      this.tempTrend = (sim.climate.meanTemp - this.tempWas) / (year - this.sampledAt);
      this.seaWas = sim.world.seaLevel; this.tempWas = sim.climate.meanTemp; this.sampledAt = year;
    }
    this.settle(sim);
    if (sim.civ.historyLive && dt <= 200 && year >= this.nextAt) this.make(sim);
  }

  /** A scholar of some nation that keeps written records says what is coming. */
  private make(sim: Simulation): void {
    const h = sim.civ.h, r = this.rng, year = sim.simYear;
    const nations = h.nations.filter((n) => n.ended < 0 && n.tech >= 0.45 && n.towns > 0);
    this.nextAt = year + r.range(60, 260);
    if (!nations.length || this.list.filter((f) => f.outcome === 'open').length >= 8) return;
    // a nation whose scholars have been right before asks them more often
    const n = nations.reduce((a, b) => ((this.trust[b.id] ?? 0) + r.next() > (this.trust[a.id] ?? 0) + r.next() ? b : a));
    const towns = sim.civ.settlements.filter((s) => s.nation === n.id && s.ruined < 0);
    if (!towns.length) return;
    const cap = sim.civ.settlements[n.capital] && sim.civ.settlements[n.capital]!.ruined < 0 ? sim.civ.settlements[n.capital]! : towns[0]!;
    const scholar = h.people.filter((p) => p.nation === n.id && p.role === 'scholar' && p.died < 0).pop();
    const by = scholar?.name ?? r.pick(NAMES);
    const ev = sim.events.events;
    const open = (k: ForecastKind) => this.list.some((f) => f.outcome === 'open' && f.kind === k && f.nation === n.id);
    type Draft = Pick<Forecast, 'kind' | 'basis' | 'text' | 'from' | 'due' | 'mark' | 'town'>;
    const drafts: Draft[] = [];
    // what can be reckoned, from what is really so
    const v = h.visitor;
    if (v && v.last >= 0 && v.next > year + 2 && !open('comet')) drafts.push({ kind: 'comet', basis: 'reckoned', town: cap.id, mark: v.next, due: v.next + 3, from: `it was last seen ${Math.round(year - ev[v.last]!.simYear)} years ago and comes every ${v.period}`, text: `The small comet will be back over ${cap.name} in ${Math.round(v.next - year)} years.` });
    const span = Math.round(r.range(60, 140));
    if (Math.abs(this.seaTrend) > 2e-6 && !open('sea-rise') && !open('sea-fall')) {
      const up = this.seaTrend > 0;
      drafts.push({ kind: up ? 'sea-rise' : 'sea-fall', basis: 'reckoned', town: cap.id, mark: sim.world.seaLevel, due: year + span, from: `the tide marks have ${up ? 'climbed' : 'dropped'} for a century`, text: `In ${span} years the sea will stand ${up ? 'higher' : 'lower'} on the harbour stones of ${cap.name} than it does today.` });
    }
    if (Math.abs(this.tempTrend) > 4e-4 && !open('cold') && !open('warm')) {
      const up = this.tempTrend > 0;
      drafts.push({ kind: up ? 'warm' : 'cold', basis: 'reckoned', town: cap.id, mark: sim.climate.meanTemp, due: year + span, from: `the first frost has come ${up ? 'later' : 'earlier'} each decade`, text: `In ${span} years the winters at ${cap.name} will be ${up ? 'milder' : 'harder'} than they are now.` });
    }
    const pos = sim.grid.pos;
    const near = (a: number, b: number) => pos[a * 3]! * pos[b * 3]! + pos[a * 3 + 1]! * pos[b * 3 + 1]! + pos[a * 3 + 2]! * pos[b * 3 + 2]! > Math.cos(0.3);
    if (!open('mountain')) {
      for (const st of towns) {
        const burned = ev.filter((e) => (e.type === 'eruption' || e.type === 'super-eruption') && e.cellId >= 0 && e.simYear > year - 6000 && near(e.cellId, st.cell));
        if (burned.length >= 2) {
          const gap = (burned[burned.length - 1]!.simYear - burned[0]!.simYear) / (burned.length - 1);
          const wait = Math.max(40, Math.round(gap * 1.5));
          drafts.push({ kind: 'mountain', basis: 'reckoned', town: st.id, mark: st.cell, due: year + wait, from: `it has burned ${burned.length} times in the memory of ${st.name}, about ${Math.round(gap)} years apart`, text: `The mountain by ${st.name} will burn again within ${wait} years.` });
          break;
        }
      }
    }
    // and what is only said
    const any = r.pick(towns);
    const wait = Math.round(r.range(40, 120));
    if (!open('stone')) drafts.push({ kind: 'stone', basis: 'guessed', town: any.id, mark: year, due: year + wait, from: '', text: `A great stone will fall from the sky within ${wait} years.` });
    if (!open('fire')) drafts.push({ kind: 'fire', basis: 'guessed', town: any.id, mark: year, due: year + wait, from: '', text: `${any.name} will burn within ${wait} years.` });
    const house = h.dynasties[n.dynasty];
    if (house && house.ended < 0 && !open('house')) drafts.push({ kind: 'house', basis: 'guessed', town: cap.id, mark: house.id, due: year + wait, from: '', text: `The ${house.name} will not rule ${n.name} ${wait} years from now.` });
    if (!drafts.length) return;
    // scholars who have been believed are asked for what they can work out; the rest say what will be listened to
    const reckoned = drafts.filter((d) => d.basis === 'reckoned'), guessed = drafts.filter((d) => d.basis === 'guessed');
    const careful = reckoned.length > 0 && (guessed.length === 0 || r.chance(0.45 + 0.1 * Math.min(4, this.trust[n.id] ?? 0)));
    const d = r.pick(careful ? reckoned : guessed.length ? guessed : reckoned);
    const event = sim.emit({
      type: 'forecast', cellId: sim.civ.settlements[d.town]!.cell, title: `${by} of ${n.name} makes a forecast`,
      description: `${d.text} ${d.basis === 'reckoned' ? `${by} gives the reckoning: ${d.from}.` : `${by} gives no reckoning for it.`}`,
      causes: [n.eventId, d.kind === 'comet' && v ? v.last : -1].filter((x) => x >= 0), importance: 0, speciesIds: [n.species], data: { nation: n.id, forecast: this.list.length },
    });
    this.list.push({ id: this.list.length, year, nation: n.id, by, outcome: 'open', eventId: event.id, outcomeEvent: -1, proof: -1, ...d });
  }

  /** See whether the world has borne out, or outlasted, each open forecast. */
  private settle(sim: Simulation): void {
    const ev = sim.events.events, year = sim.simYear;
    const fresh = ev.slice(this.seen);
    this.seen = ev.length;
    const pos = sim.grid.pos;
    const near = (a: number, b: number) => pos[a * 3]! * pos[b * 3]! + pos[a * 3 + 1]! * pos[b * 3 + 1]! + pos[a * 3 + 2]! * pos[b * 3 + 2]! > Math.cos(0.3);
    for (const f of this.list) {
      if (f.outcome !== 'open') continue;
      const st: Settlement | undefined = sim.civ.settlements[f.town];
      let kept = false, proof = -1, over = year > f.due;
      if (f.kind === 'comet') { const e = fresh.find((x) => x.type === 'comet' && Math.abs(x.simYear - f.mark) <= 3); if (e) { kept = true; proof = e.id; } }
      else if (f.kind === 'mountain') { const e = fresh.find((x) => (x.type === 'eruption' || x.type === 'super-eruption') && x.cellId >= 0 && x.simYear > f.year && near(x.cellId, f.mark)); if (e) { kept = true; proof = e.id; } }
      else if (f.kind === 'stone') { const e = fresh.find((x) => x.type === 'impact' && x.simYear > f.year); if (e) { kept = true; proof = e.id; } }
      else if (f.kind === 'fire') { const x = st?.strata?.find((s) => s.kind === 'burnt' && s.year > f.year && s.year <= f.due); if (x) { kept = true; proof = ev[x.eventId] ? x.eventId : -1; } }
      else if (f.kind === 'house') { const d = sim.civ.h.dynasties[f.mark]; if (d && d.ended >= 0 && d.ended <= f.due) kept = true; }
      // a level is read on the day named, not before
      else if (year >= f.due) {
        over = true;
        kept = f.kind === 'sea-rise' ? sim.world.seaLevel > f.mark : f.kind === 'sea-fall' ? sim.world.seaLevel < f.mark : f.kind === 'warm' ? sim.climate.meanTemp > f.mark : sim.climate.meanTemp < f.mark;
      }
      if (!kept && !over) continue;
      f.outcome = kept ? 'kept' : 'failed';
      f.proof = proof;
      const n = sim.civ.h.nations[f.nation];
      const where = st?.name ?? 'the capital';
      if (kept) this.trust[f.nation] = (this.trust[f.nation] ?? 0) + (f.basis === 'reckoned' ? 1 : 0.5);
      const e = sim.emit({
        type: kept ? 'forecast-kept' : 'forecast-failed', cellId: st?.cell ?? -1,
        title: kept ? `The forecast of ${f.by} is borne out` : `The forecast of ${f.by} comes to nothing`,
        description: kept
          ? `${Math.round(year - f.year)} years ago ${f.by} said: "${f.text}" It has happened. ${f.basis === 'reckoned' ? `It was reckoned from what could be counted, and in ${n?.name ?? where} the counting of things is taken more seriously now.` : `Nothing was behind it but the saying, and it came true all the same. In ${n?.name ?? where} few will ask how often such sayings fail.`}`
          : `${Math.round(year - f.year)} years ago ${f.by} said: "${f.text}" The time is up and it has not happened. ${f.basis === 'reckoned' ? 'The reckoning was sound as far as it went; the world did not hold to its pattern.' : 'It was a guess, and guesses mostly go this way.'}`,
        causes: [f.eventId, proof].filter((x) => x >= 0), importance: kept ? 1 : 0, speciesIds: n ? [n.species] : [], data: { nation: f.nation, forecast: f.id },
      });
      f.outcomeEvent = e.id;
    }
  }

  info(): ForecastInfo {
    const tally = (basis: Forecast['basis']): [number, number] => [this.list.filter((f) => f.basis === basis && f.outcome === 'kept').length, this.list.filter((f) => f.basis === basis && f.outcome === 'failed').length];
    return { forecasts: this.list.slice(-60), reckoned: tally('reckoned'), guessed: tally('guessed') };
  }
}
