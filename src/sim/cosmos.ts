// Out of this world (expansion section 10): the star system the planet belongs to and what reaches it from
// outside. Other planets circle the same star; the gas giant among them times the comets. A great impact can carry
// life to the neighbouring world. Rarely a wandering planet passes through, or a far-off star dies with its beam
// pointed this way. In the very far future the star itself swells. And when a people leaves, its ships are
// followed across the dark, and what they find comes back as a report on another real world.
//
// Everything here is plain data on the simulation, so saves and rewinds carry it without special handling, and it
// draws on its own random stream, so nothing else in a history changes because this exists.
import { RNG, randomSeedCode } from './rng';
import { placeName } from './names';
import type { Simulation } from './simulation';
import type { SimEvent } from './events';

export type BodyKind = 'rock' | 'giant' | 'ice';

/** Another planet of this system. */
export interface Body {
  name: string;
  kind: BodyKind;
  /** Distance from the star, with the home world at 1 when the system formed. */
  au: number;
  /** Length of its year in home years. */
  period: number;
  /** Where on its orbit it started, 0..1. */
  phase: number;
  /** Drawn size, home world = 1. */
  size: number;
  hue: number;
  /** How much of a biosphere it has, 0..1, and how much it could ever hold. */
  life: number;
  room: number;
  lifeSince: number;
  /** 0 sterile, 1 microbes, 2 living mats, 3 a thin green. */
  lifeStage: number;
  lifeEvent: number;
}

/** A nearby star that ships can be sent to. Its world is a real one: the seed code opens it. */
export interface Star { name: string; ly: number; angle: number; seed: string }

export interface Fleet {
  id: number;
  name: string;
  /** A probe is small and fast and only looks; an ark carries people and takes many lifetimes. */
  kind: 'probe' | 'ark';
  star: number;
  /** Share of the speed of light. */
  speed: number;
  launched: number;
  arrives: number;
  /** When word of the arrival gets home (light takes a year per light year). */
  heard: number;
  arrived: boolean;
  reported: boolean;
  eventId: number;
}

/** What a ship found: a picture and a few lines about a world grown from a different seed. */
export interface Report {
  fleet: number;
  year: number;
  star: string;
  seed: string;
  /** Share of the surface that is land, ice; mean temperature in deg C. */
  land: number;
  ice: number;
  temp: number;
  /** A small map, MAP_W by MAP_H, row by row from the north: 0 sea, 1 land, 2 ice, 3 high ground. */
  map: number[];
  summary: string;
  eventId: number;
}

export const MAP_W = 36, MAP_H = 18;
export const LIFE_STAGES = ['sterile', 'microbes', 'living mats', 'a thin green'] as const;
/** How long the star takes to swell once it leaves its long noon, and then to become a giant. */
const SUBGIANT_YEARS = 40e6, GIANT_YEARS = 40e6;

/** What the page is told. */
export interface CosmosInfo {
  starName: string;
  /** 0 steady, 1 swelling, 2 red giant. */
  starPhase: number;
  swell: number;
  au: number;
  bodies: { name: string; kind: BodyKind; au: number; period: number; phase: number; size: number; hue: number; life: number; lifeStage: number; lifeSince: number }[];
  /** The gas giant's slow cycle: where it is in it (0 = comets fall inward) and how long it lasts. */
  giantCycle: number;
  giantPhase: number;
  nextComet: number;
  flybys: number;
  bursts: number;
  stars: Star[];
  fleets: Fleet[];
  reports: Report[];
}

export class Cosmos {
  rng: RNG;
  starName: string;
  bodies: Body[] = [];
  stars: Star[] = [];
  /** The home world's distance from its star; a passing planet can change it for good. */
  au = 1;
  /** The gas giant's orbit turns slowly; each time its far point sweeps the comet belt, comets fall inward. */
  cycle: number;
  flybyAt: number;
  flybys = 0;
  lastFlyby = -1;
  burstAt: number;
  bursts = 0;
  /** The year the star leaves its long steady life. */
  giantAt: number;
  starPhase = 0;
  /** How much larger than in its prime the star looks in the sky. */
  swell = 1;
  /** Sea boiled away, km of depth. */
  seaLoss = 0;
  private noted: Record<string, number> = {};
  /** Rocks knocked inward and still on their way: when, how big, and what sent them. */
  private falling: { year: number; size: number; cause: number }[] = [];
  private seen = 0;
  fleets: Fleet[] = [];
  reports: Report[] = [];

  constructor(rng: RNG, cometPeriod: number) {
    this.rng = rng;
    const r = rng;
    this.starName = placeName(r);
    this.cycle = cometPeriod;
    // a barren rocky neighbour on the inside or just outside, a gas giant, and an ice world beyond it
    const inner = r.chance(0.5);
    const rockAu = inner ? r.range(0.62, 0.8) : r.range(1.35, 1.7);
    const giantAu = r.range(4.2, 6.5), iceAu = giantAu * r.range(1.9, 3.2);
    const make = (kind: BodyKind, au: number, size: number, hue: number, room: number): Body => ({
      name: placeName(r), kind, au, period: Math.pow(au, 1.5), phase: r.next(), size, hue, life: 0, room, lifeSince: -1, lifeStage: 0, lifeEvent: -1,
    });
    this.bodies.push(make('rock', rockAu, r.range(0.45, 0.9), r.range(0.02, 0.1), r.range(0.12, 0.45)));
    this.bodies.push(make('giant', giantAu, r.range(7, 11), r.range(0.06, 0.14), 0));
    this.bodies.push(make('ice', iceAu, r.range(1.6, 3.6), r.range(0.5, 0.62), r.range(0.02, 0.08)));
    // the stars near enough to reach, nearest first
    const n = 7;
    for (let i = 0; i < n; i++) this.stars.push({ name: placeName(r), ly: 0, angle: r.range(0, Math.PI * 2), seed: randomSeedCode(r.int(2 ** 32)) });
    const far = this.stars.map(() => 4 + 44 * Math.pow(r.next(), 1.6)).sort((a, b) => a - b);
    this.stars.forEach((s, i) => { s.ly = Math.round(far[i]! * 10) / 10; });
    // rare things, each on its own date so a world can be read ahead of time by nobody
    this.flybyAt = r.range(260e6, 900e6);
    this.burstAt = r.range(180e6, 1100e6);
    this.giantAt = r.range(650e6, 900e6);
  }

  get rock(): Body { return this.bodies[0]!; }
  get giant(): Body { return this.bodies[1]!; }

  /** Where the gas giant is in its slow cycle at a given year, 0..1, given the date of a comet's return. */
  giantPhase(year: number, cometNext: number): number {
    const p = ((year - cometNext) / this.cycle) % 1;
    return p < 0 ? p + 1 : p;
  }

  /** The star's brightness as the planet feels it: the star's own, thinned by distance. */
  solar(year: number): number {
    // a star in its prime brightens very slowly (as before this module existed)
    let lum = year > 380e6 ? 1 + ((year - 380e6) / 1e9) * 0.3 : 1;
    if (year > this.giantAt) {
      const t = year - this.giantAt;
      const a = Math.min(1, t / SUBGIANT_YEARS), b = Math.max(0, Math.min(1, (t - SUBGIANT_YEARS) / GIANT_YEARS));
      lum += 0.2 * a + 1.3 * b * b;
    }
    return lum / (this.au * this.au);
  }

  step(sim: Simulation, dt: number): void {
    const year = sim.simYear;
    // ---- what has just happened on the planet that matters out here
    const events = sim.events.events;
    for (; this.seen < events.length; this.seen++) {
      const e = events[this.seen]!;
      if (e.type === 'impact') this.ejecta(sim, e);
      else if (e.type === 'milestone' && e.data?.key === 'departure') this.launch(sim, e, false);
    }
    // ---- the neighbour's own slow life
    for (const b of this.bodies) {
      if (b.life <= 0) continue;
      b.life = Math.min(b.room, b.life + b.life * (1 - b.life / b.room) * (1 - Math.exp(-dt / 12e6)));
      const stage = b.life > b.room * 0.75 && b.room > 0.25 ? 3 : b.life > b.room * 0.3 ? 2 : 1;
      if (stage > b.lifeStage) {
        b.lifeStage = stage;
        if (stage === 2) sim.emit({ type: 'neighbour-life', title: `${b.name} is alive`, description: `What reached ${b.name} has held on. Dark films now coat its wet places, a second living world under the same star.`, causes: [b.lifeEvent], importance: 2, data: { body: b.name } });
        else if (stage === 3) sim.emit({ type: 'neighbour-life', title: `${b.name} turns colour`, description: `Seen from here, the face of ${b.name} is no longer bare. Something that came from this world has learned to live in the open there.`, causes: [b.lifeEvent], importance: 2, data: { body: b.name } });
      }
      // a swollen star ends it
      if (this.starPhase >= 2 && b.kind === 'rock' && b.au < 1.2) { b.life = 0; b.lifeStage = 0; }
    }
    // ---- rocks on their way in
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i]!;
      if (year < f.year) continue;
      this.falling.splice(i, 1);
      sim.meteor(this.rng.int(sim.grid.count), f.size, false, f.cause);
    }
    if (year >= this.flybyAt) { this.flybyAt = year + this.rng.range(500e6, 1500e6); this.flyby(sim, false); }
    if (year >= this.burstAt) { this.burstAt = year + this.rng.range(600e6, 2000e6); this.burst(sim, this.rng.unitVector(), false); }
    this.ageing(sim, dt);
    this.voyages(sim);
  }

  /** A great impact throws rock clear of the planet; some of it carries life to the neighbour. */
  private ejecta(sim: Simulation, impact: SimEvent): void {
    const size = Number(impact.data?.size ?? 0);
    const b = this.rock;
    if (size < 0.45 || sim.stage === 'barren' || b.life > 0 || this.starPhase >= 2) return;
    if (!this.rng.chance(0.25 + 0.6 * size)) return;
    const ev = sim.emit({
      type: 'panspermia', cellId: impact.cellId, title: `Life reaches ${b.name}`,
      description: `${impact.title} threw rock clear of the world, and some of it carried passengers. Ages later a few of those stones fall on ${b.name}, the neighbouring planet, and what was inside them wakes.`,
      causes: [impact.id], importance: 2, data: { body: b.name },
    });
    b.life = 0.004; b.lifeSince = sim.simYear; b.lifeStage = 1; b.lifeEvent = ev.id;
  }

  /** A wandering planet passes through the system: the home world's path is bent, its axis rocked, and comets shaken loose. */
  flyby(sim: Simulation, byHand: boolean): SimEvent {
    const r = this.rng;
    const before = this.au;
    const shift = (r.chance(0.5) ? 1 : -1) * r.range(0.012, 0.035);
    this.au *= 1 + shift;
    const c = sim.climate;
    const lean = (r.chance(0.5) ? 1 : -1) * r.range(0.03, 0.08);
    c.tilt = Math.max(0.05, Math.min(0.75, c.tilt + lean));
    // the giant's slow cycle is not what it was, so the comets keep a new time from now on
    this.cycle *= r.range(0.6, 1.5);
    const degrees = -2 * shift * 60;
    const ev = sim.emit({
      type: 'rogue-planet', title: 'A dark world passes',
      description: `A planet with no sun of its own crosses the sky, a black disc with a pale rim, larger each night and then smaller. When it has gone the year is ${shift > 0 ? 'longer' : 'shorter'} than it was, the seasons sit differently, and the tides took an age to calm. The world now circles ${shift > 0 ? 'a little further from' : 'a little closer to'} its star, and will be about ${Math.abs(degrees).toFixed(1)} degrees ${degrees > 0 ? 'warmer' : 'colder'} for it.`,
      importance: 3, data: { byHand: byHand ? 1 : 0, auBefore: before, auAfter: this.au, tilt: lean },
    });
    this.lastFlyby = ev.id; this.flybys++;
    // the sea sloshes: a short flood of the coasts
    sim.surge(0.1);
    // comets rain inward for an age
    const rocks = 3 + r.int(4);
    for (let i = 0; i < rocks; i++) this.falling.push({ year: sim.simYear + r.range(0.02e6, 1.6e6), size: r.range(0.15, 0.5), cause: ev.id });
    sim.cometNext = Math.min(sim.cometNext, sim.simYear + 1);
    return ev;
  }

  /**
   * A star far away dies with its beam pointed here. The side of the world facing it loses its ozone in an hour and
   * everything in the open there is burned; the far side sees only a glow on the horizon.
   */
  burst(sim: Simulation, dir: [number, number, number], byHand: boolean): SimEvent {
    const reg = sim.regions, pos = sim.grid.pos;
    const regions: number[] = [], kill: number[] = [];
    let centre = -1, best = -2;
    for (let k = 0; k < reg.count; k++) {
      const cell = reg.centre[k]!;
      const facing = pos[cell * 3]! * dir[0] + pos[cell * 3 + 1]! * dir[1] + pos[cell * 3 + 2]! * dir[2];
      if (facing > best) { best = facing; centre = cell; }
      if (facing <= 0.05) continue;
      // worst where the beam came straight down; the sea shields what lives deep in it
      const open = reg.land[k]! > 0.3 ? 1 : 0.35;
      regions.push(k); kill.push(Math.min(0.9, (0.35 + 0.5 * facing) * open));
    }
    const ev = sim.emit({
      type: 'gamma-burst', cellId: centre, title: 'The burning sky',
      description: 'For a few seconds one half of the sky is brighter than the sun, though nothing can be seen there. Far away a star has died with its beam turned this way. On the side that faced it the high air is stripped, and everything living in the open is burned by a light it cannot feel. The other side of the world sees a glow on the horizon and nothing more.',
      importance: 3, data: { byHand: byHand ? 1 : 0, x: dir[0], y: dir[1], z: dir[2] },
    });
    for (const k of regions) sim.regionEvent[k] = ev.id;
    sim.creatures.disaster({ regions, kill, eventId: ev.id });
    sim.plants.ozoneHole = Math.max(sim.plants.ozoneHole, 0.6);
    for (const k of regions) if (reg.land[k]! > 0.3) sim.plants.burn(k, 0.35 * kill[regions.indexOf(k)]!);
    sim.civ.witness(sim, ev.id, regions, kill.map((x) => x * 0.6));
    this.bursts++;
    return ev;
  }

  /** The star grows old: first swelling, then a red giant that boils the seas. */
  private ageing(sim: Simulation, dt: number): void {
    const year = sim.simYear;
    if (year <= this.giantAt) return;
    const t = year - this.giantAt;
    const a = Math.min(1, t / SUBGIANT_YEARS), b = Math.max(0, Math.min(1, (t - SUBGIANT_YEARS) / GIANT_YEARS));
    this.swell = 1 + 0.8 * a + 14 * b * b;
    const once = (key: string, make: () => SimEvent): number => { if (this.noted[key] === undefined) this.noted[key] = make().id; return this.noted[key]!; };
    const first = once('swelling', () => sim.emit({
      type: 'red-giant', title: `${this.starName} begins to swell`,
      description: `The star has burned through the heart of itself. From now on it grows, slowly at first: larger in the sky each age, and redder, and harder to live under.`,
      importance: 3, data: { phase: 1 },
    }));
    if (this.starPhase < 1) this.starPhase = 1;
    if (b > 0) {
      const giant = once('giant', () => {
        const ev = sim.emit({
          type: 'red-giant', title: 'The red giant',
          description: `${this.starName} is no longer a disc but a wall of dull fire across the sky. Nothing that happens on the world now matters as much as that.`,
          causes: [first], importance: 3, data: { phase: 2 },
        });
        // those who can leave, leave
        if (sim.civ.living > 0) {
          const out = sim.milestones.has('departure') || sim.civ.maxTech >= 1.1;
          const last = sim.emit(out
            ? { type: 'exodus', title: 'The last ships', description: 'Everything that can fly is sent up. There is no plan for those who are left, and they know it.', causes: [ev.id], importance: 3 }
            : { type: 'exodus', title: 'No way off', description: 'They can see what the star is doing and they have the numbers to prove it. They have no way to leave. They build deeper, and write everything down.', causes: [ev.id], importance: 3 });
          if (out) this.launch(sim, last, true);
        }
        return ev;
      });
      this.starPhase = 2;
      // the seas go into the sky
      const hot = sim.climate.meanTemp;
      if (hot > 50) {
        this.seaLoss += (dt / 1e6) * 0.3 * Math.min(2, (hot - 50) / 15);
        const boil = once('boil', () => {
          const ev = sim.emit({ type: 'seas-boil', title: 'The seas begin to boil', description: 'Along the equator the water steams at noon. The clouds never part now, and the shorelines walk downhill year by year.', causes: [giant], importance: 3 });
          sim.civ.devastate();
          return ev;
        });
        sim.scorch(Math.min(0.5, 0.04 * (dt / 1e6) * Math.min(3, (hot - 50) / 10)), boil);
        if (this.seaLoss > 5.5) once('dry', () => sim.emit({ type: 'seas-boil', title: 'The last sea', description: 'The deepest basin holds a salt lake, and then a white plain. There is no more sea anywhere on the world.', causes: [boil], importance: 3 }));
      }
    }
  }

  // ------------------------------------------------------------------ ships

  /** Ships leave: a fast probe for the nearest star and arks for others. */
  private launch(sim: Simulation, cause: SimEvent, fleeing: boolean): void {
    const r = this.rng, year = sim.simYear;
    const send = (kind: 'probe' | 'ark', star: number): void => {
      const s = this.stars[star]!;
      const speed = kind === 'probe' ? r.range(0.08, 0.2) : r.range(0.004, 0.02);
      const travel = s.ly / speed;
      const name = placeName(r);
      const ev = sim.emit({
        type: 'fleet', title: kind === 'probe' ? `The ${name} probe leaves for ${s.name}` : `The ark ${name} leaves for ${s.name}`,
        description: kind === 'probe'
          ? `A machine no bigger than a house is flung toward ${s.name}, ${s.ly} light years away. It will take ${Math.round(travel)} years to get there, and its makers will not be the ones who hear from it.`
          : `A ship that is also a town sets out for ${s.name}, ${s.ly} light years away. At its speed the crossing takes ${Math.round(travel).toLocaleString('en-US')} years. Those who arrive will have never seen the world that sent them.`,
        causes: [cause.id], importance: kind === 'probe' ? 1 : 2, data: { fleet: this.fleets.length, star: s.name },
      });
      this.fleets.push({ id: this.fleets.length, name, kind, star, speed, launched: year, arrives: year + travel, heard: year + travel + s.ly, arrived: false, reported: false, eventId: ev.id });
    };
    const taken = new Set(this.fleets.map((f) => f.star));
    const free = this.stars.map((_, i) => i).filter((i) => !taken.has(i));
    if (!free.length) return;
    if (!fleeing) send('probe', free.shift()!);
    const arks = Math.min(free.length, fleeing ? 2 : 1 + r.int(2));
    for (let i = 0; i < arks; i++) send('ark', free.splice(r.int(Math.min(4, free.length)), 1)[0]!);
  }

  private voyages(sim: Simulation): void {
    const year = sim.simYear;
    for (const f of this.fleets) {
      const s = this.stars[f.star]!;
      if (!f.arrived && year >= f.arrives) f.arrived = true;
      if (f.reported || year < f.heard) continue;
      f.reported = true;
      const look = sim.survey(s.seed);
      const lands = look.land < 0.18 ? 'almost all ocean, with scattered islands' : look.land < 0.36 ? 'seas and broad continents' : 'more land than sea';
      const air = look.temp < 2 ? 'cold, its seas edged with ice' : look.temp < 22 ? 'mild' : 'hot';
      const summary = `A world of ${lands}; ${air} (about ${Math.round(look.temp)} degrees), with ice over ${Math.round(look.ice * 100)}% of it.`;
      const ev = sim.emit({
        type: 'transmission', year: f.heard, title: f.kind === 'probe' ? `Word from ${s.name}` : `The ark ${f.name} has landed`,
        description: f.kind === 'probe'
          ? `A whisper arrives from ${s.name}, ${s.ly} years old: the ${f.name} probe got there, and it is sending pictures. ${summary}`
          : `After ${Math.round(f.arrives - f.launched).toLocaleString('en-US')} years in the dark, the ark ${f.name} has made landfall at ${s.name}. The message took ${s.ly} years to come back. ${summary}`,
        causes: [f.eventId], importance: 2, data: { fleet: f.id, star: s.name, seed: s.seed },
      });
      this.reports.push({ fleet: f.id, year: f.heard, star: s.name, seed: s.seed, land: look.land, ice: look.ice, temp: look.temp, map: look.map, summary, eventId: ev.id });
    }
  }

  info(sim: Simulation): CosmosInfo {
    return {
      starName: this.starName, starPhase: this.starPhase, swell: this.swell, au: this.au,
      bodies: this.bodies.map((b) => ({ name: b.name, kind: b.kind, au: b.au, period: b.period, phase: b.phase, size: b.size, hue: b.hue, life: b.life, lifeStage: b.lifeStage, lifeSince: b.lifeSince })),
      giantCycle: this.cycle, giantPhase: this.giantPhase(sim.simYear, sim.cometNext), nextComet: sim.cometNext,
      flybys: this.flybys, bursts: this.bursts, stars: this.stars, fleets: this.fleets, reports: this.reports,
    };
  }
}
