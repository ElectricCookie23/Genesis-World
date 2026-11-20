// Industry to the near future (expansion section 7).
//
// E61, E62 fuel: coal is laid down wherever thick wet forest stood, oil wherever a shallow sea was thick with life,
//          all through the world's history. When a people comes to burn them, each field can say what it was.
// E63 electrification: fire-lit towns go over to electric light, city by city.
// E64 the climate they cause: what they burn warms the world, by an amount that is kept count of.
// E65 the radio bubble: from the first broadcast, a shell of signals grows at the speed of light.
// E66 the information age: a network that comes to join every great town.
// E67 the space age: launches leave debris, and debris can cascade and close the sky for a while.
// E68 moon bases.      E69 a world council that changes what its members do.
// E70 asteroid defence: a people that watches the sky can turn a falling rock aside.
//
// Plain data with its own random stream, like sections 8 to 10. It reads the civilization the simulation already
// has (towns, their knowledge, the industry and space-age events) and adds to it; it does not replace any of it.
import type { RNG } from './rng';
import type { Simulation } from './simulation';
import type { SimEvent } from './events';

/** A fuel field, and where in the world's past it came from. */
export interface Deposit {
  kind: 'coal' | 'oil';
  region: number;
  cell: number;
  /** How much was laid down, in arbitrary units, and the years over which most of it formed. */
  amount: number;
  from: number;
  to: number;
  /** What it was: the plant whose forests became the coal, or the sea whose life became the oil. */
  source: string;
  sourceEvent: number;
  /** Set when a people starts to dig it. */
  eventId: number;
}

export interface IndustryInfo {
  deposits: Deposit[];
  /** Share of lit towns that have gone over to electric light. */
  electric: number;
  /** Degrees of warming their emissions have caused so far. */
  warming: number;
  /** The year of the first broadcast, or -1. The bubble's radius in light years is the years since. */
  firstBroadcast: number;
  firstMessage: string;
  /** Share of great towns joined to the network. */
  network: number;
  debris: number;
  /** The year the sky opens again after a cascade, or -1. */
  skyClosedUntil: number;
  moonBase: boolean;
  council: { since: number; members: number; decisions: string[] } | null;
  defence: boolean;
  deflected: number;
}

const FIRST_WORDS = ['A count from one to nine, repeated.', 'The hour, read out by a tired voice.', 'A song with a drum in it.', 'Weather for the coast.', 'Two operators asking whether the other can hear.', 'The names of ships due in harbour.'];

export class Industry {
  rng: RNG;
  // ---- laid down over deep time, per region
  private coal: Float32Array;
  private oil: Float32Array;
  private coalFrom: Float64Array;
  private coalTo: Float64Array;
  private oilFrom: Float64Array;
  private oilTo: Float64Array;
  private coalPlant: Int32Array;
  deposits: Deposit[] = [];
  private opened = false;
  private noted: Record<string, number> = {};
  // ---- E63
  electric = 0;
  // ---- E64
  /** Greenhouse warming before industry began, so theirs can be told apart. */
  private baseline = -1;
  warming = 0;
  /** Emissions are cut by this share once a council agrees to it. */
  cut = 0;
  // ---- E65
  firstBroadcast = -1;
  firstMessage = '';
  // ---- E66
  network = 0;
  // ---- E67
  debris = 0;
  skyClosedUntil = -1;
  // ---- E68, E69, E70
  moonBase = false;
  council: { since: number; members: number; decisions: string[] } | null = null;
  defence = false;
  deflected = 0;
  private seen = 0;
  private crisis = -1;

  constructor(rng: RNG, regions: number) {
    this.rng = rng;
    this.coal = new Float32Array(regions); this.oil = new Float32Array(regions);
    this.coalFrom = new Float64Array(regions).fill(-1); this.coalTo = new Float64Array(regions).fill(-1);
    this.oilFrom = new Float64Array(regions).fill(-1); this.oilTo = new Float64Array(regions).fill(-1);
    this.coalPlant = new Int32Array(regions).fill(-1);
  }

  private once(key: string, make: () => SimEvent): number {
    if (this.noted[key] === undefined) this.noted[key] = make().id;
    return this.noted[key]!;
  }

  /** True while a debris cascade keeps anything from being launched. */
  skyClosed(year: number): boolean { return this.skyClosedUntil >= 0 && year < this.skyClosedUntil; }

  step(sim: Simulation, dt: number): void {
    this.laydown(sim, dt);
    const civ = sim.civ, year = sim.simYear;
    const events = sim.events.events;
    for (; this.seen < events.length; this.seen++) {
      const e = events[this.seen]!;
      if (e.type === 'industry') { this.noted['industry'] = e.id; this.baseline = sim.climate.greenhouse; }
      if (e.type === 'nuclear-war' || e.type === 'world-war' || (e.type === 'war' && e.importance >= 2) || e.type === 'geoengineering-backfire') this.crisis = e.id;
    }
    if (civ.living === 0) return;
    const industry = this.noted['industry'];
    if (industry === undefined) return;
    const towns = civ.settlements.filter((st) => st.ruined < 0);
    if (!towns.length) return;
    const lead = towns.reduce((a, b) => (b.tech > a.tech ? b : a));

    // ---- E61, E62: the fields are opened, each with its history
    if (!this.opened) { this.opened = true; this.open(sim, industry); }

    // ---- E63: electric light, a few years after the first engines, spreading town by town
    if (civ.maxTech >= 0.92 && this.electric < 1) {
      this.once('electric', () => sim.emit({ type: 'electrification', cellId: lead.cell, title: `${lead.name} is lit without fire`, description: `One evening the streets of ${lead.name} are lit all at once, by lamps that do not flicker and burn nothing. From above, one amber town has turned white. The others will follow, as fast as wire can be strung.`, causes: [industry, lead.eventId].filter((x) => x >= 0), importance: 2 }));
      this.electric = Math.min(1, this.electric + dt / 120);
      if (this.electric >= 1) this.once('grid', () => sim.emit({ type: 'grid-complete', title: 'No town is lit by fire any more', description: 'The last lamplighters have put away their poles. Every town of any size is on the wire, and the night side of the world is a different colour than it was a lifetime ago.', causes: [this.noted['electric']!], importance: 1 }));
    }

    // ---- E64: the warming that is theirs
    if (this.baseline >= 0) {
      // (the simulation's own rule adds their emissions to the greenhouse; a council's agreement takes some back)
      if (this.cut > 0) sim.climate.greenhouse = Math.max(this.baseline, sim.climate.greenhouse - this.cut * 1.2e-5 * Math.min(dt, 5000) * civ.living);
      this.warming = Math.max(0, sim.climate.greenhouse - this.baseline);
      if (this.warming > 1.5) this.once('warming', () => sim.emit({ type: 'warming', title: 'The world they warmed', description: `Since the first engines the air has grown ${this.warming.toFixed(1)} degrees warmer than it would have been, and the cause is in the smoke. The ice is drawing back, and the tide lines are higher than the old harbour walls were built for.`, causes: [industry], importance: 3, data: { degrees: this.warming } }));
    }

    // ---- E65: the first broadcast
    if (civ.maxTech >= 0.98 && this.firstBroadcast < 0) {
      this.firstBroadcast = year; this.firstMessage = this.rng.pick(FIRST_WORDS);
      this.once('radio', () => sim.emit({ type: 'radio', cellId: lead.cell, title: 'The first broadcast', description: `From a mast outside ${lead.name}, a signal goes out to anyone with a receiver. ${this.firstMessage} It also goes straight up, and keeps going: from this year a shell of their voices spreads out among the stars, a light year further every year.`, causes: [this.noted['electric'] ?? industry], importance: 2 }));
    }

    // ---- E66: the network
    if (civ.maxTech >= 1.04 && this.network < 1) {
      this.once('network', () => sim.emit({ type: 'network', cellId: lead.cell, title: 'Cables under the sea', description: 'Lines are laid along the sea bed from coast to coast, and through them towns half a world apart talk as if they shared a wall. There are halls now that hold nothing but what people have written to each other.', causes: [this.noted['radio'] ?? industry], importance: 2 }));
      this.network = Math.min(1, this.network + dt / 90);
      if (this.network >= 1) this.once('network-complete', () => sim.emit({ type: 'network-complete', title: 'Every great town is on the network', description: 'There is no city left that the cables do not reach. Seen from the night side, pulses run along lines no ship follows.', causes: [this.noted['network']!], importance: 1 }));
    }

    // ---- E67: launches, debris, and a sky that can close
    if (sim.milestones.has('space-age')) {
      if (this.skyClosed(year)) { /* nothing goes up */ }
      else {
        if (this.skyClosedUntil >= 0) {
          this.skyClosedUntil = -1; this.debris = 0.2;
          sim.emit({ type: 'sky-reopens', title: 'The sky is open again', description: 'Enough of the wreckage has fallen and burned. The first launch in generations goes up through a gap the tables say is safe, and comes back.', causes: [this.noted['cascade'] ?? -1].filter((x) => x >= 0), importance: 2 });
          delete this.noted['cascade'];
        }
        // every launch leaves something behind
        this.debris = Math.min(1.5, this.debris + (dt / 400) * (0.5 + this.rng.next()));
        if (this.debris > 0.7 && this.rng.chance(Math.min(0.5, (this.debris - 0.7) * dt / 300))) this.cascade(sim);
      }
    }

    // ---- E68: a base on the moon
    if (!this.moonBase && sim.moons > 0 && sim.milestones.has('space-age') && civ.maxTech >= 1.1 && !this.skyClosed(year) && this.rng.chance(Math.min(0.5, dt / 250))) {
      this.moonBase = true;
      this.once('moon', () => sim.emit({ type: 'moon-base', cellId: lead.cell, title: 'Lights on the moon', description: `On the dark part of the moon's face there is a point of light that was not there last year. People from ${lead.name} are living there, under a roof, on air they brought with them.`, causes: [sim.milestones.get('space-age')!, lead.eventId].filter((x) => x >= 0), importance: 3 }));
    }
    if (this.moonBase && sim.moons === 0) this.moonBase = false;

    // ---- E69: a world council, after something that frightened everyone
    if (!this.council && civ.maxTech >= 0.95 && (this.crisis >= 0 || this.warming > 2) && civ.h.nations.filter((n) => n.ended < 0).length + (civ.h.began < 0 ? 3 : 0) >= 3) {
      const members = Math.max(3, civ.h.nations.filter((n) => n.ended < 0).length);
      const cause = this.crisis >= 0 ? this.crisis : this.noted['warming'] ?? industry;
      this.council = { since: year, members, decisions: [] };
      this.once('council', () => sim.emit({ type: 'world-council', cellId: lead.cell, title: 'A council of the world', description: `After what has happened, ${members} countries send people to sit in one room at ${lead.name} and agree to be bound by what the room decides. It has no army. It has the fact that everyone remembers why it was made.`, causes: [cause], importance: 3 }));
    }
    if (this.council && this.cut === 0 && this.warming > 1) {
      // its first real decision: burn less
      this.cut = 0.6;
      this.council.decisions.push('to burn less: emissions cut by six parts in ten');
      sim.emit({ type: 'council-decision', title: 'The council rations the smoke', description: 'Every member agrees to burn less, by a share written into the treaty, and to be watched while it does. From this year the warming slows.', causes: [this.noted['council']!, this.noted['warming'] ?? -1].filter((x) => x >= 0), importance: 2, data: { cut: 0.6 } });
    }

    // ---- E70: watching the sky for rocks
    if (!this.defence && sim.milestones.has('space-age') && civ.maxTech >= 1.08) {
      this.defence = true;
      this.once('defence', () => sim.emit({ type: 'sky-watch', cellId: lead.cell, title: 'They begin to watch for falling rocks', description: 'Every rock larger than a house that crosses the world\'s path is now found, followed and listed, and there are machines kept ready to go out and meet one.', causes: [sim.milestones.get('space-age')!], importance: 2 }));
    }
  }

  /** Forests and seas lay down fuel, all through the world's life. */
  private laydown(sim: Simulation, dt: number): void {
    const pl = sim.plants, reg = sim.regions, year = sim.simYear;
    const k = Math.min(1, dt / 15000);
    for (let r = 0; r < reg.count; r++) {
      // coal: old, closed forest on wet ground
      if (pl.forestAge[r]! > 4 && reg.moisture[r]! > 0.45 && reg.land[r]! > 0.3) {
        this.coal[r] = this.coal[r]! + k * pl.canopy[r]!;
        if (this.coalFrom[r]! < 0) this.coalFrom[r] = year;
        this.coalTo[r] = year;
        if (pl.dominant[r]! >= 0) this.coalPlant[r] = pl.dominant[r]!;
      }
      // oil: a shallow sea thick with life
      if (reg.shallow[r]! > 0.3 && pl.seaCover[r]! > 0.35) {
        this.oil[r] = this.oil[r]! + k * pl.seaCover[r]!;
        if (this.oilFrom[r]! < 0) this.oilFrom[r] = year;
        this.oilTo[r] = year;
      }
    }
  }

  /** The richest fields are found and worked; each is recorded with what it was made of and when. */
  private open(sim: Simulation, industry: number): void {
    const reg = sim.regions, pl = sim.plants, year = sim.simYear;
    const ago = (y: number) => { const a = year - y; return a > 2e6 ? `${(Math.round(a / 1e5) / 10).toLocaleString('en-US')} million years ago` : `${Math.max(1, Math.round(a / 1000)).toLocaleString('en-US')} thousand years ago`; };
    const pick = (amount: Float32Array, n: number) => Array.from(amount.keys()).filter((r) => amount[r]! > 0.5).sort((a, b) => amount[b]! - amount[a]!).slice(0, n);
    const forest = sim.milestones.get('first-forest') ?? -1;
    for (const r of pick(this.coal, 5)) {
      const plant = this.coalPlant[r]! >= 0 ? pl.species[this.coalPlant[r]!] : undefined;
      const source = plant ? `the ${plant.name} forests` : 'forests no one has a name for';
      const sourceEvent = plant && plant.eventId >= 0 ? plant.eventId : forest;
      const ev = sim.emit({ type: 'coal-field', cellId: reg.centre[r]!, title: 'A coal field is opened', description: `Under these hills lies a black seam as thick as a house. It is ${source} that stood here from ${ago(this.coalFrom[r]!)} to ${ago(this.coalTo[r]!)}: every tree that fell into that wet ground and did not rot. It took that long to make, and it will be burned in a few lifetimes.`, causes: [industry, sourceEvent].filter((x) => x >= 0), importance: 1, data: { region: r } });
      this.deposits.push({ kind: 'coal', region: r, cell: reg.centre[r]!, amount: this.coal[r]!, from: this.coalFrom[r]!, to: this.coalTo[r]!, source, sourceEvent, eventId: ev.id });
    }
    const life = sim.milestones.get('first-life') ?? -1;
    for (const r of pick(this.oil, 4)) {
      const source = `the plankton seas of ${ago((this.oilFrom[r]! + this.oilTo[r]!) / 2)}`;
      const ev = sim.emit({ type: 'oil-field', cellId: reg.centre[r]!, title: 'An oil field is opened', description: `What comes up the well here was alive once. This oil formed from ${source}: a warm shallow sea so thick with drifting life that it rained down on the sea bed for ages and was buried. They are burning the sunlight of that sea.`, causes: [industry, life].filter((x) => x >= 0), importance: 1, data: { region: r } });
      this.deposits.push({ kind: 'oil', region: r, cell: reg.centre[r]!, amount: this.oil[r]!, from: this.oilFrom[r]!, to: this.oilTo[r]!, source, sourceEvent: life, eventId: ev.id });
    }
  }

  /** Wreckage in orbit strikes wreckage until the whole shell is closed. */
  cascade(sim: Simulation): SimEvent {
    const years = this.rng.range(150, 600);
    this.skyClosedUntil = sim.simYear + years;
    const ev = sim.emit({ type: 'debris-cascade', title: 'The sky closes', description: 'Two dead machines meet in orbit, and their pieces meet others. Within a year there is a shell of wreckage round the world moving faster than any shot, and nothing that goes up through it comes back. They can see the stars. They cannot reach them.', causes: [sim.milestones.get('space-age') ?? -1].filter((x) => x >= 0), importance: 3, data: { years } });
    this.noted['cascade'] = ev.id;
    return ev;
  }

  /**
   * A rock is on its way. A people that watches the sky and can still launch may turn it aside: returns the event of
   * the deflection, or null if the rock comes down.
   */
  intercept(sim: Simulation, cell: number, size: number): SimEvent | null {
    if (!this.defence || sim.civ.living === 0 || this.skyClosed(sim.simYear)) return null;
    // the bigger the rock, the harder to move in time
    if (!this.rng.chance(Math.max(0.25, 0.9 - size * 0.5))) return null;
    this.deflected++;
    return sim.emit({ type: 'meteor-deflected', cellId: cell, title: 'A falling rock is turned aside', description: 'It was found months out, on a path that ended on the ground. Machines went up to meet it, and pushed, for weeks. It crosses the sky in one night as a slow bright streak and is gone, and the next day is an ordinary day.', causes: [this.noted['defence'] ?? -1].filter((x) => x >= 0), importance: 3, data: { size } });
  }

  info(): IndustryInfo {
    return { deposits: this.deposits, electric: this.electric, warming: this.warming, firstBroadcast: this.firstBroadcast, firstMessage: this.firstMessage, network: this.network, debris: this.debris, skyClosedUntil: this.skyClosedUntil, moonBase: this.moonBase, council: this.council, defence: this.defence, deflected: this.deflected };
  }
}
