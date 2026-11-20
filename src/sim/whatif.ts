// The counterfactual engine and the butterfly tracker (expansion E55 and E56).
//
// "What if it had not happened?" is answered the way an experiment answers it: with a control. Two copies of the world
// are started from the same saved moment before the event and stepped forward in exactly the same way. In one the event
// is made to happen in its year, as it did. In the other it is not. Everything else is the same, so whatever differs
// between them afterwards is the work of that one event, and of nothing else.
//
// Neither copy is the world on screen. A world run again is never quite the same world (its steps fall on different
// days), which is exactly why the comparison is between two re-runs and not between a re-run and the original.
//
// The butterfly tracker is the same machine with a change too small to matter: one small herd that lived where it
// would have died. It records, at intervals, how much of the planet differs between the two copies. The difference
// starts in one place and spreads.
import { Simulation } from './simulation';
import { loadSimulation, type SaveState } from './snapshot';
import type { SimEvent } from './events';

/** One change, applied to the first copy only. */
export type Change =
  | { kind: 'event'; eventId: number; type: string; title: string; year: number; cell: number; size: number; tool: string; dir: [number, number, number] }
  | { kind: 'herd'; title: string; year: number; cell: number; count: number };

/** Which events can be made to happen again by hand, and so can be taken away. */
export function replayable(e: SimEvent): boolean {
  return e.type === 'impact' || e.type === 'plague' || e.type === 'rogue-planet' || e.type === 'gamma-burst' || (e.type.startsWith('tool-') && e.type !== 'tool-species');
}

export function changeFor(e: SimEvent): Change {
  const d = e.data ?? {};
  const n = (v: number | string | undefined, or: number) => (typeof v === 'number' ? v : or);
  return { kind: 'event', eventId: e.id, type: e.type, title: e.title, year: e.simYear, cell: Math.max(0, e.cellId), size: n(d.size, 0.6), tool: e.type.startsWith('tool-') ? e.type.slice(5) : '', dir: [n(d.x, 1), n(d.y, 0), n(d.z, 0)] };
}

/** What one copy of the world amounts to at a moment: the figures the two are compared by. */
export interface Outcome {
  year: number;
  meanTemp: number;
  seaLevel: number;
  ice: number;
  oxygen: number;
  species: number;
  animals: number;
  /** The five most numerous animals. */
  top: { name: string; pop: number }[];
  plantCover: number;
  towns: number;
  nations: number;
  people: number;
  maxTech: number;
  /** Names of every living species, and of every living nation. */
  living: string[];
  realms: string[];
}

export function outcome(sim: Simulation): Outcome {
  const sp = sim.creatures.species.filter((s) => s.extinctYear < 0 && s.pop > 0);
  const towns = sim.civ.settlements.filter((s) => s.ruined < 0);
  const nations = sim.civ.h.nations.filter((n) => n.ended < 0);
  return {
    year: sim.simYear, meanTemp: sim.climate.meanTemp, seaLevel: sim.world.seaLevel, ice: sim.climate.iceFraction, oxygen: sim.plants.oxygen,
    species: sp.length, animals: sim.creatures.totalPop,
    top: [...sp].sort((a, b) => b.pop - a.pop).slice(0, 5).map((s) => ({ name: s.name, pop: s.pop })),
    plantCover: sim.plants.totalLandCover + sim.plants.totalSeaCover,
    towns: towns.length, nations: nations.length, people: towns.reduce((n, s) => n + s.pop, 0), maxTech: towns.reduce((m, s) => Math.max(m, s.tech), 0),
    living: sp.map((s) => s.name), realms: nations.map((n) => n.name),
  };
}

/** The differences between two outcomes, said plainly, the weightiest first. */
export function differences(a: Outcome, b: Outcome): string[] {
  const out: string[] = [];
  const names = (list: string[], limit = 5) => (list.length > limit ? `${list.slice(0, limit).join(', ')} and ${list.length - limit} more` : list.join(', '));
  const onlyA = a.living.filter((n) => !b.living.includes(n)), onlyB = b.living.filter((n) => !a.living.includes(n));
  if (a.species !== b.species) out.push(`${a.species} kinds of animal are alive with it, ${b.species} without it.`);
  if (onlyA.length) out.push(`Alive only where it happened: ${names(onlyA)}.`);
  if (onlyB.length) out.push(`Alive only where it did not: ${names(onlyB)}.`);
  const share = (x: number, y: number) => Math.abs(x - y) / Math.max(1, Math.max(x, y));
  if (share(a.animals, b.animals) > 0.03) out.push(`There are ${a.animals > b.animals ? 'more' : 'fewer'} animals with it: ${Math.round(a.animals).toLocaleString('en-US')} against ${Math.round(b.animals).toLocaleString('en-US')}.`);
  if (a.top[0] && b.top[0] && a.top[0].name !== b.top[0].name) out.push(`The commonest animal is ${a.top[0].name} with it and ${b.top[0].name} without it.`);
  if (Math.abs(a.meanTemp - b.meanTemp) > 0.2) out.push(`The world is ${Math.abs(a.meanTemp - b.meanTemp).toFixed(1)} degrees ${a.meanTemp > b.meanTemp ? 'warmer' : 'colder'} with it.`);
  if (Math.abs(a.seaLevel - b.seaLevel) > 0.01) out.push(`The sea stands ${Math.round(Math.abs(a.seaLevel - b.seaLevel) * 1000)} metres ${a.seaLevel > b.seaLevel ? 'higher' : 'lower'} with it.`);
  if (Math.abs(a.ice - b.ice) > 0.02) out.push(`Ice covers ${Math.round(a.ice * 100)}% of the world with it, ${Math.round(b.ice * 100)}% without it.`);
  if (share(a.plantCover, b.plantCover) > 0.05) out.push(`Plants cover ${a.plantCover > b.plantCover ? 'more' : 'less'} of the world with it.`);
  if (a.towns !== b.towns) out.push(`${a.towns} ${a.towns === 1 ? 'town stands' : 'towns stand'} with it, ${b.towns} without it.`);
  if (a.nations !== b.nations) out.push(`${a.nations} ${a.nations === 1 ? 'nation' : 'nations'} with it, ${b.nations} without it.`);
  const realmA = a.realms.filter((n) => !b.realms.includes(n)), realmB = b.realms.filter((n) => !a.realms.includes(n));
  if (realmA.length) out.push(`Nations that exist only where it happened: ${names(realmA)}.`);
  if (realmB.length) out.push(`Nations that exist only where it did not: ${names(realmB)}.`);
  if (share(a.people, b.people) > 0.05 && a.towns + b.towns > 0) out.push(`${Math.round(a.people * 1000).toLocaleString('en-US')} people live in towns with it, ${Math.round(b.people * 1000).toLocaleString('en-US')} without it.`);
  if (Math.abs(a.maxTech - b.maxTech) > 0.04) out.push(`Its peoples know ${a.maxTech > b.maxTech ? 'more' : 'less'} with it than without it.`);
  if (!out.length) out.push('By every measure kept here the two worlds are the same.');
  return out;
}

export interface WhatIfState {
  change: Change;
  /** The year both copies started from, and the year they are taken to. */
  from: number;
  to: number;
  /** How far along, 0..1. */
  progress: number;
  done: boolean;
  with: Outcome;
  without: Outcome;
  differences: string[];
  /** How much of the planet differs at each checkpoint (share of cells, 0..1), oldest first. */
  spread: { year: number; share: number }[];
}
/** The pictures, sent once at the end: each copy's surface, and how different each cell was at each checkpoint. */
export interface WhatIfMaps { withMap: Uint8Array; withoutMap: Uint8Array; heat: Uint8Array[] }

const CHECKPOINTS = 24;

export class Counterfactual {
  /** The copy in which it happens, and the copy in which it does not. */
  a: Simulation;
  b: Simulation;
  from: number;
  applied = false;
  spread: { year: number; share: number }[] = [];
  heat: Uint8Array[] = [];
  /** Where the checkpoints start, and how long they run. */
  private start: number;
  private span: number;

  constructor(save: SaveState, public change: Change, public to: number) {
    this.a = new Simulation(save.seed, save.gridN);
    loadSimulation(this.a, save);
    this.b = new Simulation(save.seed, save.gridN, this.a.grid);
    loadSimulation(this.b, save);
    this.from = this.a.simYear;
    this.start = Math.max(this.from, change.year);
    this.span = Math.max(1, to - this.start);
  }

  /**
   * When checkpoint k falls. A difference spreads fast at first and then has nowhere left to go, so the checkpoints
   * crowd toward the start: the first is the very next step after the change, the last is the end.
   */
  private checkAt(k: number): number { return this.start + this.span * Math.pow((k + 1) / CHECKPOINTS, 3); }

  get done(): boolean { return this.a.simYear >= this.to; }
  get progress(): number { return Math.min(1, (this.a.simYear - this.from) / Math.max(1, this.to - this.from)); }

  /** Make the change in the first copy. */
  private apply(): void {
    const s = this.a, c = this.change;
    this.applied = true;
    if (c.kind === 'herd') {
      // a small herd of the commonest animal there is spared: the same animals, a few more of them
      const region = s.regions.regionOf[c.cell]!;
      const cr = s.creatures;
      let best = -1, most = 0;
      for (const k of cr.cohortsIn(region)) if (cr.alive[k] && cr.count[k]! > most) { most = cr.count[k]!; best = k; }
      if (best >= 0) cr.count[best] = cr.count[best]! + c.count;
      else { const sp = cr.species.filter((x) => x.extinctYear < 0).sort((x, y) => y.pop - x.pop)[0]; if (sp) cr.spawn(sp.id, region, c.count, sp.ref, 0); }
      return;
    }
    const region = s.regions.regionOf[c.cell]!;
    if (c.type === 'impact') s.meteor(c.cell, c.size, true);
    else if (c.type === 'plague') s.plague(region, true);
    else if (c.type === 'rogue-planet') s.cosmos.flyby(s, true);
    else if (c.type === 'gamma-burst') s.cosmos.burst(s, c.dir, true);
    else if (c.tool) s.intervene(c.tool, c.cell);
  }

  /** How different each cell of the two copies is just now, 0..255, and the share that differ at all. */
  private compare(): { cells: Uint8Array; share: number } {
    const a = this.a, b = this.b, n = a.grid.count;
    const R = a.regions.count;
    const popA = new Float32Array(R), popB = new Float32Array(R);
    for (const [sim, pop] of [[a, popA], [b, popB]] as const) {
      const cr = sim.creatures;
      for (let k = 0; k < cr.alive.length; k++) if (cr.alive[k]) pop[cr.region[k]!] = pop[cr.region[k]!]! + cr.count[k]!;
    }
    const owner = (sim: Simulation) => { const m = new Map<number, number>(); for (const st of sim.civ.settlements) if (st.ruined < 0) m.set(st.cell, st.nation + 2); return m; };
    const ownA = owner(a), ownB = owner(b);
    const cells = new Uint8Array(n);
    let differ = 0;
    for (let i = 0; i < n; i++) {
      const r = a.regions.regionOf[i]!;
      const pa = popA[r]!, pb = popB[r]!;
      let d = Math.abs(pa - pb) / Math.max(50, pa, pb);
      d = Math.max(d, Math.min(1, Math.abs(a.world.vegetation[i]! - b.world.vegetation[i]!) * 3));
      if (a.world.biome[i] !== b.world.biome[i]) d = Math.max(d, 0.8);
      if (Math.abs(a.world.elevation[i]! - b.world.elevation[i]!) > 0.05) d = 1;
      if ((ownA.get(i) ?? 0) !== (ownB.get(i) ?? 0)) d = 1;
      if (d > 0.04) differ++;
      cells[i] = Math.round(Math.min(1, d) * 255);
    }
    return { cells, share: differ / n };
  }

  /** Step both copies, the same way, until the time allowed is used up or the end is reached. */
  advance(budgetMs: number): void {
    const start = Date.now();
    while (!this.done && Date.now() - start < budgetMs) {
      const a = this.a, b = this.b;
      // deep time goes in long steps, a living history in short ones; never past the event, a checkpoint or the end
      let dt = a.civ.historyLive || b.civ.historyLive ? 5 : 15000;
      if (!this.applied && this.change.year > a.simYear) dt = Math.min(dt, this.change.year - a.simYear);
      if (this.applied && this.heat.length < CHECKPOINTS) dt = Math.min(dt, Math.max(dt / 8, this.checkAt(this.heat.length) - a.simYear));
      dt = Math.max(1, Math.min(dt, this.to - a.simYear));
      a.step(dt); b.step(dt);
      if (!this.applied && a.simYear >= this.change.year) this.apply();
      if (this.applied && this.heat.length < CHECKPOINTS && a.simYear >= this.checkAt(this.heat.length)) {
        const { cells, share } = this.compare();
        this.heat.push(cells); this.spread.push({ year: a.simYear, share });
        // one picture a step: a long step may pass several checkpoints at once
        while (this.heat.length < CHECKPOINTS && a.simYear >= this.checkAt(this.heat.length)) { this.heat.push(cells); this.spread.push({ year: a.simYear, share }); }
      }
    }
    if (this.done && !this.applied) this.apply();
    if (this.done && (!this.spread.length || this.spread[this.spread.length - 1]!.year < this.a.simYear)) {
      const { cells, share } = this.compare();
      this.heat.push(cells); this.spread.push({ year: this.a.simYear, share });
    }
  }

  state(): WhatIfState {
    const wa = outcome(this.a), wb = outcome(this.b);
    return { change: this.change, from: this.from, to: this.to, progress: this.progress, done: this.done, with: wa, without: wb, differences: this.done ? differences(wa, wb) : [], spread: this.spread };
  }

  /** Each copy's surface as one byte a cell: the biome, or 255 for open water. */
  maps(): WhatIfMaps {
    const face = (s: Simulation) => { const m = new Uint8Array(s.grid.count); for (let i = 0; i < m.length; i++) m[i] = s.world.elevation[i]! <= s.world.seaLevel ? 255 : s.world.biome[i]!; return m; };
    return { withMap: face(this.a), withoutMap: face(this.b), heat: this.heat };
  }
}


