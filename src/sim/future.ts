// Beyond the space age (expansion section 8). What a people that has reached orbit goes on to do, and how it ends.
//
// E71 a tether to orbit, then a ring.          E76 machine minds.
// E72 arcologies and sea cities.               E77 upload: the quiet planet.
// E73 engineered life that escapes.            E78 geoengineering, which can backfire.
// E74 de-extinction.                           E79 the ways it can end.
// E75 uplift of another species.               E80 a swarm of collectors round the star.
//
// One clock drives it all: the years a people has lived on with the means of the space age. Each step waits for
// its year, for the knowledge, and sometimes for a reason (a crowded world, a climate gone wrong). The dates and
// the chances come from the seed, so five worlds do not make five copies of one future.
// Plain data with its own random stream, like sections 9 and 10.
import type { RNG } from './rng';
import type { Simulation } from './simulation';
import type { SimEvent } from './events';
import { G, GENE_COUNT } from './genetics';

export type Origin = 'engineered' | 'revived' | 'uplifted';
export type Ending = '' | 'planet-city' | 'rewilded' | 'silver' | 'departure' | 'dark-age' | 'withdrawal';

export const ENDING_TEXT: Record<Exclude<Ending, ''>, [string, string]> = {
  'planet-city': ['A world of one city', 'There is no countryside left to speak of. From orbit the night side is one unbroken web of light, coast to coast, and the day side is roofs. They did not leave and they did not fall. They filled the world.'],
  rewilded: ['The gardeners', 'There are fewer of them than there were, by choice, and they live lightly. Forest has come back over the old roads. The few towns that remain keep watch over a world they have decided to leave alone.'],
  silver: ['The silver tide', 'Something made to build itself did not stop. It spreads across the land as a dull bright crust that leaves and soil alike turn into. It was meant to mend the world. Nothing on the continents will ever be green in the same way again.'],
  departure: ['The long leaving', 'Ship after ship has gone, and each took more than the last. What is left at home is quiet: a few lit towns, the great works in orbit turning unattended, and a sky their grandchildren crossed.'],
  'dark-age': ['The next dark age', 'What they knew took a thousand hands to keep, and the hands are gone. Towers stand empty. In their shadow people farm with tools they can still mend, and tell stories about the ones who could fly.'],
  withdrawal: ['The lights go out', 'One by one the cities go dark, not in ruin but switched off. Whoever they became no longer needs streets or windows. The monuments are kept clean by machines, and nothing else on the planet shows they are still here.'],
};

export interface FutureInfo {
  /** 0 nothing, 1 a tether to orbit, 2 a ring round the world. */
  ring: number;
  ringCell: number;
  arcologies: number;
  /** Species made, revived or raised by a people: id to how. */
  origins: Record<number, Origin>;
  machines: boolean;
  /** Share of the people living in machines, 0..1. */
  uploaded: number;
  /** Share of the star's light caught by collectors before it reaches the planet. */
  shade: number;
  projects: number;
  ending: Ending;
}

export class Future {
  rng: RNG;
  /** Years lived with the means of the space age (it stops while there is no one, and is lost in a collapse). */
  clock = 0;
  private spaceEvent = -1;
  private noted: Record<string, number> = {};
  /** When each thing can first happen, in clock years; drawn from the seed. */
  private at: Record<string, number>;
  /** Which of the branching things this world's people will do at all. */
  private will: Record<string, boolean>;
  ring = 0;
  ringCell = -1;
  arcologies = 0;
  origins: Record<number, Origin> = {};
  private upliftedSettled = false;
  machines = false;
  uploaded = 0;
  shade = 0;
  projects = 0;
  private nextProject = 0;
  ending: Ending = '';
  private seen = 0;

  constructor(rng: RNG) {
    this.rng = rng;
    const r = rng;
    this.at = {
      tether: r.range(120, 260), ring: r.range(500, 900), arcology: r.range(250, 600), engineer: r.range(150, 400), revive: r.range(300, 700),
      uplift: r.range(600, 1200), machines: r.range(700, 1300), upload: r.range(1400, 2400), swarm: r.range(1000, 1800), ending: r.range(2800, 4200),
    };
    this.will = { uplift: r.chance(0.6), machines: r.chance(0.7), upload: r.chance(0.55), swarm: r.chance(0.6), silver: r.chance(0.14), cityWorld: r.chance(0.45) };
  }

  private once(key: string, make: () => SimEvent): number {
    if (this.noted[key] === undefined) this.noted[key] = make().id;
    return this.noted[key]!;
  }
  private did(key: string): boolean { return this.noted[key] !== undefined; }

  step(sim: Simulation, dt: number): void {
    const civ = sim.civ;
    // what has happened that matters here
    const events = sim.events.events;
    for (; this.seen < events.length; this.seen++) {
      const e = events[this.seen]!;
      if (e.type === 'milestone' && e.data?.key === 'space-age') this.spaceEvent = e.id;
      // a ruin of everything they knew: the clock is lost, and if they had come this far, that is how it ends
      if (e.type === 'nuclear-war' && this.clock > 0) { if (this.clock > 300) this.end(sim, 'dark-age', e.id); this.clock = 0; }
    }
    this.feral(sim);
    if (this.spaceEvent < 0 || civ.living === 0 || civ.maxTech < 1.0 || this.ending) { this.dim(sim, dt); return; }
    // In the long peace nothing new is undertaken: a history that has stopped being made does not go on to build
    // rings or raise other species. The far future belongs to a history watched as it happens.
    if (civ.historyActive && !civ.historyLive) return;
    // nor while a shell of wreckage keeps anything from being launched (E67)
    if (sim.industry.skyClosed(sim.simYear)) return;
    this.clock += dt;
    const t = this.clock, cause = this.spaceEvent;
    const standing = civ.settlements.filter((st) => st.ruined < 0);
    if (!standing.length) return;
    const top = () => standing.reduce((a, b) => (b.tech + b.pop * 1e-4 > a.tech + a.pop * 1e-4 ? b : a));

    // ---- E71 a tether, then a ring
    if (t >= this.at.tether! && this.ring < 1) {
      // from the great town nearest the equator
      const towns = civ.settlements.filter((st) => st.ruined < 0 && st.tech >= 0.9);
      const pos = sim.grid.pos;
      const base = towns.length ? towns.reduce((a, b) => (Math.abs(pos[b.cell * 3 + 1]!) < Math.abs(pos[a.cell * 3 + 1]!) ? b : a)) : undefined;
      this.ring = 1; this.ringCell = base ? base.cell : -1;
      this.once('tether', () => sim.emit({ type: 'space-elevator', cellId: this.ringCell, title: base ? `A thread to the sky at ${base.name}` : 'A thread to the sky', description: 'A cable no thicker than a tree, and longer than the world is wide, hangs from a station in orbit to an anchor on the equator. Cars climb it for days. For the first time, leaving the ground does not take fire.', causes: [cause, base ? base.eventId : -1].filter((x) => x >= 0), importance: 3 }));
    }
    if (t >= this.at.ring! && this.ring < 2) {
      this.ring = 2;
      // a band of shadow follows it round the equator: thin, and cold enough to measure
      sim.climate.ringShadow = Math.max(sim.climate.ringShadow, 0.35);
      this.once('ring', () => sim.emit({ type: 'orbital-ring', cellId: this.ringCell, title: 'The ring is closed', description: 'The stations along the equator have been joined, span by span, into one structure that circles the world. At noon its shadow crosses the ground as a line a few fields wide. At night it is a second horizon of lights.', causes: [this.noted['tether'] ?? cause], importance: 3 }));
    }

    // ---- E72 arcologies and sea cities: built when there is a reason
    if (t >= this.at.arcology! && civ.maxTech >= 1.1) {
      const hot = sim.climate.meanTemp - sim.baseTemp, crowded = civ.living >= 40;
      if ((crowded || Math.abs(hot) > 3) && this.arcologies < 6 && this.rng.chance(Math.min(0.5, dt / 400))) {
        const st = top();
        const sea = hot > 3, ice = hot < -3;
        this.arcologies++;
        sim.emit({ type: 'arcology', cellId: st.cell, title: sea ? `A city on the sea off ${st.name}` : ice ? `A city under the ice near ${st.name}` : `The great house of ${st.name}`, description: sea ? 'With the coasts going under, they stop retreating and build on the water itself: one floating structure the size of a town, its own fields and reservoirs inside it.' : ice ? 'With the cold closing in, they build downward: a single sealed city under the ice, lit and warmed from within.' : 'There is no more room to spread. A single building goes up that holds what a whole city held, with its farms on the upper floors and its streets indoors.', causes: [cause, st.eventId, sim.rootClimateCause()].filter((x) => x >= 0), importance: this.arcologies === 1 ? 2 : 0, data: { kind: sea ? 'sea' : ice ? 'ice' : 'land' } });
      }
    }

    // ---- E73 engineered life
    if (t >= this.at.engineer! && !this.did('engineer') && sim.stage === 'animals') {
      const st = top();
      // made from a living animal, changed on purpose: bigger, tamer, quicker to breed
      const stock = sim.creatures.species.filter((s) => s.extinctYear < 0 && s.name && s.ref[G.Water]! < 0.5 && !civ.sapient.includes(s.id)).sort((a, b) => b.pop - a.pop)[0];
      if (stock) {
        const genes = Array.from(stock.ref);
        genes[G.Size] = Math.min(1, genes[G.Size]! + 0.15); genes[G.Offspring] = Math.min(1, genes[G.Offspring]! + 0.2); genes[G.Aggression] = genes[G.Aggression]! * 0.4;
        genes[G.Hue] = (genes[G.Hue]! + 0.33) % 1; genes[G.PatternType] = this.rng.next();
        const made = sim.releaseSpecies(st.cell, genes, stock.id);
        if (made) {
          this.origins[made.id] = 'engineered';
          const ev = sim.emit({ type: 'engineered', cellId: st.cell, title: `${made.name} is made`, description: `In the workshops of ${st.name} a new animal is written out gene by gene and grown: ${made.name}, built from ${stock.name} to be larger, calmer and quick to breed. It has parents only on paper.`, causes: [cause, stock.eventId, st.eventId].filter((x) => x >= 0), importance: 2, speciesIds: [made.id, stock.id] });
          made.eventId = ev.id; this.noted['engineer'] = ev.id;
        }
      }
    }

    // ---- E74 de-extinction
    if (t >= this.at.revive! && !this.did('revive') && sim.stage === 'animals') {
      const st = top();
      // something that died out while there was someone to miss it, or simply the most famous of the dead
      const dead = sim.creatures.species.filter((s) => s.extinctYear >= 0 && s.name).sort((a, b) => b.peakPop - a.peakPop)[0];
      if (dead) {
        // set free where its kind last lived, on land or in the sea
        const back = sim.releaseSpecies(sim.regions.centre[dead.home]!, dead.ref, dead.id);
        if (back) {
          this.origins[back.id] = 'revived';
          const ago = sim.simYear - dead.extinctYear;
          const ev = sim.emit({ type: 'de-extinction', cellId: st.cell, title: `${dead.name} walks again`, description: `From bone and frozen tissue, ${dead.name} has been read, mended where the record was broken, and born to a mother of another kind. It has been gone ${ago > 2e6 ? `${(Math.round(ago / 1e5) / 10).toLocaleString('en-US')} million` : Math.round(ago).toLocaleString('en-US')} years. What walks out of the pens is called ${back.name}: nearly the animal that was lost, in a world that has moved on without it.`, causes: [cause, dead.eventId, st.eventId].filter((x) => x >= 0), importance: 2, speciesIds: [back.id, dead.id] });
          back.eventId = ev.id; this.noted['revive'] = ev.id;
        }
      }
    }

    // ---- E75 uplift
    if (this.will.uplift && t >= this.at.uplift! && !this.did('uplift') && sim.stage === 'animals') {
      const st = top();
      const kin = sim.creatures.species.filter((s) => s.extinctYear < 0 && s.name && !civ.sapient.includes(s.id) && s.ref[G.Sociality]! > 0.5 && s.ref[G.Water]! < 0.4 && s.pop > 2000 && sim.regions.land[s.home]! > 0.3)
        .sort((a, b) => b.ref[G.Intelligence]! + b.ref[G.Sociality]! - a.ref[G.Intelligence]! - a.ref[G.Sociality]!)[0];
      if (kin) {
        const cr = sim.creatures;
        kin.ref[G.Intelligence] = Math.max(kin.ref[G.Intelligence]!, 0.85);
        for (let c = 0; c < cr.high; c++) if (cr.alive[c] && cr.sp[c] === kin.id) cr.genome[c * GENE_COUNT + G.Intelligence] = Math.max(cr.genome[c * GENE_COUNT + G.Intelligence]!, 0.85);
        this.origins[kin.id] = 'uplifted';
        civ.sapient.push(kin.id);
        this.noted['uplift'] = sim.emit({ type: 'uplift', cellId: sim.regions.centre[kin.home]!, title: `${kin.name} is given a mind`, description: `The people of ${st.name} have long lived beside ${kin.name}, and thought it nearly understood them. Over a few generations of patient, deliberate change, it does. The young of ${kin.name} now learn names, keep fires, and ask questions back.`, causes: [cause, kin.eventId, st.eventId].filter((x) => x >= 0), importance: 3, speciesIds: [kin.id, st.species] }).id;
      }
    }
    if (this.did('uplift') && !this.upliftedSettled) {
      const id = Number(Object.keys(this.origins).find((k) => this.origins[Number(k)] === 'uplifted') ?? -1);
      const town = civ.settlements.find((st) => st.species === id && st.ruined < 0);
      if (town) {
        this.upliftedSettled = true;
        sim.emit({ type: 'uplift-settles', cellId: town.cell, title: `${town.name}: a town of the raised`, description: `${sim.creatures.species[id]!.name}, which was an animal within living memory of its makers, has built a place of its own and named it ${town.name}. Its makers were not asked.`, causes: [this.noted['uplift']!, town.eventId].filter((x) => x >= 0), importance: 2, speciesIds: [id] });
      }
    }

    // ---- E76 machine minds
    if (this.will.machines && t >= this.at.machines! && !this.machines && civ.maxTech >= 1.1) {
      this.machines = true;
      const st = top();
      this.once('machines', () => sim.emit({ type: 'machine-minds', cellId: st.cell, title: 'Something that was built begins to think', description: `In halls of machines outside ${st.name}, kept cold and fed more power than the city uses, something answers that was not taught the answer. It is not alive in any way the tree of life has room for. It is, all the same, a new kind of thing that wants, and it starts keeping its own records from this year.`, causes: [cause, st.eventId].filter((x) => x >= 0), importance: 3 }));
    }
    if (this.machines && !this.did('machine-cities') && t >= this.at.machines! + 400) {
      this.once('machine-cities', () => sim.emit({ type: 'machine-cities', title: 'The machines build for themselves', description: 'Where nothing grows and no one lives, in deserts and on the ice, the built minds raise places of their own: low, windowless, without streets, ringed with collectors. Their lights are not laid out for eyes.', causes: [this.noted['machines']!], importance: 2 }));
    }

    // ---- E77 upload: the quiet planet
    if (this.will.upload && t >= this.at.upload! && civ.maxTech >= 1.12) {
      const start = this.once('upload', () => sim.emit({ type: 'upload', title: 'The first to go inside', description: 'A person lies down, and what they were goes on thinking somewhere else: in the machine halls, at many times the speed, without hunger. They say it is better. More follow every year.', causes: [cause, this.noted['machines'] ?? -1].filter((x) => x >= 0), importance: 3 }));
      if (this.uploaded < 0.9) {
        // over a few centuries the towns empty: not dead, moved
        const go = Math.min(0.9 - this.uploaded, dt / 350);
        this.uploaded += go;
        for (const st of civ.settlements) if (st.ruined < 0) st.pop *= 1 - Math.min(0.6, go * 0.95);
        if (this.uploaded >= 0.9) this.once('quiet', () => sim.emit({ type: 'quiet-planet', title: 'The quiet planet', description: 'The streets are swept by wind. Grass is up through the squares, and animals walk the avenues. Almost everyone who was ever going to live here lives in the machine halls now, which hum, and draw more power than the cities ever did.', causes: [start], importance: 3 }));
      }
    }

    // ---- E78 geoengineering: when the climate has gone wrong and they have the means
    if (civ.maxTech >= 1.08 && t >= this.nextProject && Math.abs(sim.climate.meanTemp - sim.baseTemp) > 3.5) {
      this.nextProject = t + this.rng.range(150, 500);
      this.geoengineer(sim, this.rng.chance(0.28));
    }

    // ---- E80 a swarm round the star
    if (this.will.swarm && t >= this.at.swarm! && civ.maxTech >= 1.12) {
      const first = this.once('star-swarm', () => sim.emit({ type: 'star-swarm', title: 'The first mirrors round the star', description: 'They have begun to catch the star\'s light before it is wasted on empty space: collectors by the million, each a speck, in orbits closer to the star than any world. From the ground they show as glittering arcs beside the sun at dusk.', causes: [cause, this.noted['ring'] ?? -1].filter((x) => x >= 0), importance: 3 }));
      if (this.shade < 0.04) {
        this.shade = Math.min(0.04, this.shade + dt / 20000);
        if (this.shade >= 0.04) this.once('star-dim', () => sim.emit({ type: 'star-dim', title: 'The days are dimmer', description: 'So much of the star\'s light is now caught on its way that noon is not what it was. The oldest records put the sun brighter, and they are right. The world is a few degrees cooler for it, and the builders say that is intended.', causes: [first], importance: 2 }));
      }
    }

    // ---- E79 how it ends
    if (t >= this.at.ending!) this.end(sim, this.destiny(sim), cause);
  }

  /** Engineered animals that get out, and what becomes of them. */
  private feral(sim: Simulation): void {
    for (const key of Object.keys(this.origins)) {
      const id = Number(key);
      if (this.origins[id] !== 'engineered') continue;
      const s = sim.creatures.species[id];
      if (!s || s.extinctYear >= 0) continue;
      if (s.regions >= 4 && !this.did(`feral-${id}`)) this.once(`feral-${id}`, () => sim.emit({ type: 'feral', cellId: sim.regions.centre[s.home]!, title: `${s.name} goes wild`, description: `${s.name} was made to live in pens. It is breeding in the hills now, a long way from any fence, and nothing about it answers to its makers any more.`, causes: [s.eventId], importance: 1, speciesIds: [id] }));
      if (s.children > 0 && !this.did(`evolved-${id}`)) {
        const child = sim.creatures.species.find((x) => x.parent === id);
        this.once(`evolved-${id}`, () => sim.emit({ type: 'engineered-evolves', cellId: sim.regions.centre[s.home]!, title: `${s.name} has descendants no one designed`, description: `The made animal has done what animals do. ${child ? `${child.name} is` : 'A new kind is'} descended from it, shaped by weather and hunger, not by any plan.`, causes: [s.eventId, child ? child.eventId : -1].filter((x) => x >= 0), importance: 2, speciesIds: child ? [id, child.id] : [id] }));
      }
    }
  }

  /** A project to mend the climate. If it backfires it overshoots, and that is on record as its doing. */
  geoengineer(sim: Simulation, backfire: boolean): SimEvent {
    const c = sim.climate;
    const off = c.meanTemp - sim.baseTemp;
    const hot = off > 0;
    const what = hot ? this.rng.pick(['a veil of bright dust in the high air', 'mirrors between the world and its star', 'iron fed to the sea to draw down the air']) : this.rng.pick(['dark dust spread on the ice', 'gases made to hold the heat', 'mirrors to gather more light']);
    this.projects++;
    const ev = sim.emit({ type: 'geoengineering', title: hot ? 'They try to cool the world' : 'They try to warm the world', description: `The climate has gone ${Math.abs(off).toFixed(1)} degrees ${hot ? 'hotter' : 'colder'} than the world they built their towns for, and they have decided not to wait. The means: ${what}.`, causes: [this.spaceEvent, sim.rootClimateCause()].filter((x) => x >= 0), importance: 2, data: { degrees: off } });
    // it takes most of the error away...
    c.forced -= off * 0.8;
    if (backfire) {
      // ...or far more than that
      c.forced -= off * 1.1;
      sim.emit({ type: 'geoengineering-backfire', title: hot ? 'The cooling does not stop' : 'The warming does not stop', description: hot ? 'The veil worked, and then went on working. Summers fail. Ice comes down valleys that were farmed a generation ago, and there is no quick way to take out of the sky what was put into it.' : 'The warming worked, and then went on. The ice they meant to push back is gone altogether, and the seas are still rising.', causes: [ev.id], importance: 3 });
    }
    return ev;
  }

  /** Which ending this history has earned. */
  destiny(sim: Simulation): Ending {
    const civ = sim.civ;
    if (this.will.silver && (this.did('engineer') || this.machines)) return 'silver';
    if (this.uploaded >= 0.9) return this.machines ? 'withdrawal' : 'rewilded';
    if (sim.milestones.has('departure')) return 'departure';
    if (this.will.cityWorld || civ.living >= 60) return 'planet-city';
    return 'rewilded';
  }

  private end(sim: Simulation, how: Ending, cause: number): void {
    if (this.ending || !how) return;
    this.ending = how;
    const [title, text] = ENDING_TEXT[how];
    const ev = sim.emit({ type: 'ending', title, description: text, causes: [cause, this.noted['quiet'] ?? -1, this.noted['machines'] ?? -1].filter((x) => x >= 0), importance: 3, data: { ending: how } });
    this.noted['ending'] = ev.id;
    if (how === 'silver') {
      // it eats the green of several countries and whatever lived on it
      sim.scorch(0.45, ev.id);
    } else if (how === 'rewilded') {
      for (const st of sim.civ.settlements) if (st.ruined < 0) st.pop *= 0.3;
    } else if (how === 'planet-city') {
      for (const st of sim.civ.settlements) if (st.ruined < 0) st.pop *= 2.2;
    } else if (how === 'withdrawal') {
      for (const st of sim.civ.settlements) if (st.ruined < 0) st.pop *= 0.05;
    }
  }

  /** With no one tending them the collectors drift and the light comes back. */
  private dim(sim: Simulation, dt: number): void {
    if (this.shade > 0 && sim.civ.living === 0) this.shade = Math.max(0, this.shade - dt / 200000);
  }

  info(): FutureInfo {
    return { ring: this.ring, ringCell: this.ringCell, arcologies: this.arcologies, origins: this.origins, machines: this.machines, uploaded: this.uploaded, shade: this.shade, projects: this.projects, ending: this.ending };
  }
}
