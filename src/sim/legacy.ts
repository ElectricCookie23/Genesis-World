// What peoples leave, and what they send out (expansion E99 and E100).
//
// E99: a people with radio and lights to spare sends a message to the stars, the way ours did from Arecibo: a short
// account of who they are and where, made only of things that are true of that world (their numbers, their place
// among the planets, their moon, their air, the shape of their bodies). It is addressed to no one. (As first written,
// this was a message to whoever had been changing their world; the owner took that out with the rest of the religion.)
// E100: when a people ends, or leaves, it seals an archive: its own account of itself, made from the record. A later
// people that builds nearby finds it; the player can open any of them.
//
// Plain data on the simulation with its own random stream, like the rest of section 10.
import type { RNG } from './rng';
import type { Simulation } from './simulation';
import type { SimEvent } from './events';
import { G } from './genetics';

/** A message sent to the stars. `glyphs` are numbers a picture of each sign is drawn from; `text` is what it says. */
export interface StarMessage {
  id: number;
  year: number;
  /** The town that sends it, and where that is. */
  town: string;
  cell: number;
  species: number;
  glyphs: number[];
  text: string;
  /** The nearest star, and how many years the message takes to pass it. */
  toward: string;
  years: number;
  eventId: number;
}

export interface Archive {
  id: number;
  year: number;
  /** A vault under a city, a record buried in the hills, or a monument left in orbit. */
  kind: 'vault' | 'buried record' | 'orbital monument';
  place: string;
  cell: number;
  species: number;
  people: string;
  /** Their history as they told it. */
  lines: string[];
  eventId: number;
  /** The later people who found it, and when; -1 until then. */
  foundBy: number;
  foundYear: number;
  foundEvent: number;
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const count = (n: number) => COUNT[n] ?? String(n);

export class Legacy {
  rng: RNG;
  messages: StarMessage[] = [];
  archives: Archive[] = [];
  /** Peoples that have already sent their message. */
  private sent: number[] = [];
  private seen = 0;
  /** Peoples that had towns when last looked at, and the town to leave a record in. */
  private alive: Record<number, number> = {};

  constructor(rng: RNG) { this.rng = rng; }

  step(sim: Simulation): void {
    const events = sim.events.events;
    for (; this.seen < events.length; this.seen++) {
      const e = events[this.seen]!;
      // an ending, or a leaving: something is left behind
      if (e.type === 'nuclear-war' || e.type === 'exodus') this.sealAll(sim, e, 'vault');
      else if (e.type === 'milestone' && e.data?.key === 'departure') this.sealAll(sim, e, 'orbital monument');
    }
    this.watch(sim);
    this.discover(sim);
    this.speak(sim);
  }

  // ------------------------------------------------------------------ E100 the last archive

  /** Notice a people whose last town has just emptied: it buried a record on the way out. */
  private watch(sim: Simulation): void {
    const now: Record<number, number> = {};
    for (const st of sim.civ.settlements) {
      if (st.ruined >= 0) continue;
      const best = now[st.species];
      if (best === undefined || st.tech > sim.civ.settlements[best]!.tech) now[st.species] = st.id;
    }
    for (const key of Object.keys(this.alive)) {
      const species = Number(key);
      if (now[species] !== undefined) continue;
      const last = sim.civ.settlements[this.alive[species]!];
      // only a people that could write leaves a record
      if (last && last.tech >= 0.3 && !this.archives.some((a) => a.species === species && sim.simYear - a.year < 5000)) {
        this.seal(sim, species, last.id, last.eventId, 'buried record');
      }
    }
    this.alive = now;
  }

  private sealAll(sim: Simulation, cause: SimEvent, kind: Archive['kind']): void {
    const done = new Set<number>();
    const towns = [...sim.civ.settlements].filter((st) => st.ruined < 0).sort((a, b) => b.tech - a.tech);
    for (const st of towns) {
      if (done.has(st.species) || st.tech < 0.3) continue;
      done.add(st.species);
      this.seal(sim, st.species, st.id, cause.id, kind);
    }
  }

  /** A people sets down its own account of itself, where its greatest town stands (or over it). */
  seal(sim: Simulation, species: number, town: number, cause: number, kind: Archive['kind']): Archive {
    const st = sim.civ.settlements[town]!;
    const people = sim.creatures.species[species]?.name ?? 'a people';
    const first = sim.civ.settlements.reduce((y, s) => (s.species === species ? Math.min(y, s.founded) : y), sim.simYear);
    // their history in their own words: what the record holds about them, the weightiest first, then put in order
    const theirs = sim.events.events.filter((e) => e.simYear >= first && e.importance >= 1 && e.type !== 'archive' && e.type !== 'archive-found'
      && (e.speciesIds?.includes(species) || e.type === 'era' || e.type === 'war' || e.type === 'nuclear-war' || e.type === 'exodus' || e.type === 'milestone'));
    const chosen = theirs.sort((a, b) => b.importance - a.importance || a.simYear - b.simYear).slice(0, 9).sort((a, b) => a.simYear - b.simYear);
    const lines = chosen.map((e) => {
      const ago = Math.round(sim.simYear - e.simYear);
      const when = ago < 2 ? 'At the end' : ago < 2000 ? `${ago.toLocaleString('en-US')} years before the end` : `${(Math.round(ago / 100) / 10).toLocaleString('en-US')} thousand years before the end`;
      return `${when}: ${e.title}. ${e.description}`;
    });
    if (!lines.length) lines.push('We were here. We built, and we kept count of the years. That is all there was time to write.');
    const where = kind === 'orbital monument' ? `above ${st.name}` : kind === 'vault' ? `under ${st.name}` : `in the hills near ${st.name}`;
    const ev = sim.emit({
      type: 'archive', cellId: st.cell, title: kind === 'orbital monument' ? `A monument is left in orbit ${where}` : kind === 'vault' ? `The vault ${where} is sealed` : `A record is buried ${where}`,
      description: kind === 'orbital monument'
        ? `Before they go, ${people} leave something circling the world they are leaving: a record of who they were, meant to outlast everything below it.`
        : kind === 'vault'
          ? `With the end in sight, ${people} seal what they know ${where}: their years, their rulers, their mistakes, cut into something that will not rot.`
          : `The last of ${people} to live at ${st.name} bury what they have written and walk away. No one is left to read it.`,
      causes: [cause, st.eventId].filter((x) => x >= 0), importance: 2, speciesIds: [species], data: { archive: this.archives.length },
    });
    const archive: Archive = { id: this.archives.length, year: sim.simYear, kind, place: st.name, cell: st.cell, species, people, lines, eventId: ev.id, foundBy: -1, foundYear: -1, foundEvent: -1 };
    this.archives.push(archive);
    return archive;
  }

  /** A later people that builds near an archive of an earlier one digs it up, or reaches it in orbit. */
  discover(sim: Simulation): void {
    if (!this.archives.some((a) => a.foundBy < 0)) return;
    const pos = sim.grid.pos;
    for (const a of this.archives) {
      if (a.foundBy >= 0) continue;
      for (const st of sim.civ.settlements) {
        if (st.ruined >= 0 || st.species === a.species) continue;
        // what is in orbit takes the means to get there; what is in the ground takes a town near enough to dig
        if (a.kind === 'orbital monument' ? st.tech < 1.05 : st.tech < 0.45) continue;
        const near = pos[st.cell * 3]! * pos[a.cell * 3]! + pos[st.cell * 3 + 1]! * pos[a.cell * 3 + 1]! + pos[st.cell * 3 + 2]! * pos[a.cell * 3 + 2]!;
        if (a.kind !== 'orbital monument' && near < Math.cos(0.3)) continue;
        const finders = sim.creatures.species[st.species]?.name ?? 'a later people';
        const age = sim.simYear - a.year;
        const ev = sim.emit({
          type: 'archive-found', cellId: st.cell, title: a.kind === 'orbital monument' ? `${finders} reach the monument of ${a.people}` : `${finders} open the archive of ${a.people}`,
          description: `${a.kind === 'orbital monument' ? `In orbit above them, ${finders} of ${st.name} find a thing no one of their kind made` : `Digging near ${st.name}, ${finders} break into a sealed place`}: the record of ${a.people}, who were here ${age > 2e6 ? `${(Math.round(age / 1e5) / 10).toLocaleString('en-US')} million` : Math.round(age).toLocaleString('en-US')} years before them. It begins: "${a.lines[0]!.slice(0, 160)}"`,
          causes: [a.eventId, st.eventId].filter((x) => x >= 0), importance: 3, speciesIds: [st.species, a.species], data: { archive: a.id },
        });
        a.foundBy = st.species; a.foundYear = sim.simYear; a.foundEvent = ev.id;
        break;
      }
    }
  }

  // ------------------------------------------------------------------ E99 a message to the stars

  /** What a people would say of itself to a stranger: only things that are true of this world, in the order ours chose. */
  describe(sim: Simulation, species: number): string {
    const sp = sim.creatures.species[species];
    const people = sp?.name ?? 'a people';
    const towns = sim.civ.settlements.filter((st) => st.ruined < 0 && st.species === species);
    const pop = towns.reduce((n, st) => n + st.pop, 0);
    const lines = [`We are ${people}. We count ${Math.round(pop).toLocaleString('en-US')} thousand of us, in ${towns.length === 1 ? 'one town' : `${count(towns.length)} towns`}.`];
    // where: the home world's place among the planets, counted outward from the star
    const cos = sim.cosmos;
    const inner = cos.bodies.filter((b) => b.au < cos.au).length;
    lines.push(`Our world is the ${ORDINAL[inner] ?? `${inner + 1}th`} of ${count(cos.bodies.length + 1)} around the star we call ${cos.starName}.`);
    lines.push(sim.ring ? 'It wears a ring where its moon used to be.' : sim.moons === 0 ? 'It has no moon.' : sim.moons === 1 ? 'It has one moon.' : `It has ${count(sim.moons)} moons.`);
    lines.push(`One part in ${Math.max(2, Math.round(1 / Math.max(0.02, sim.plants.oxygen)))} of its air is the gas we breathe; the plants made it.`);
    // what they are: counted from the genes the renderer draws them from
    if (sp) {
      const g = sp.ref;
      const pairs = g[G.LimbPairs]! > 0.12 ? Math.max(1, Math.round(g[G.LimbPairs]! * 4)) : 0;
      const eyes = Math.round(g[G.EyeCount]! * 6);
      lines.push(`We have ${pairs ? `${count(pairs * 2)} limbs` : 'no limbs'} and ${eyes ? (eyes === 1 ? 'one eye' : `${count(eyes)} eyes`) : 'no eyes'}.`);
    }
    return lines.join(' ');
  }

  /** A people that has radio, and lights enough to be seen from space, sends one message out. Each people sends once. */
  private speak(sim: Simulation): void {
    if (sim.civ.living === 0 || this.messages.length >= 12) return;
    const towns = sim.civ.settlements.filter((st) => st.ruined < 0 && st.tech >= 1.0 && !this.sent.includes(st.species));
    if (!towns.length) return;
    const town = towns.reduce((a, b) => (b.tech > a.tech ? b : a));
    this.sent.push(town.species);
    const text = this.describe(sim, town.species);
    const glyphs: number[] = [];
    for (const word of text.split(' ')) { let h = 2166136261; for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.toLowerCase().charCodeAt(i), 16777619); glyphs.push((h >>> 0) % 4096); }
    const people = sim.creatures.species[town.species]?.name ?? 'They';
    const near = sim.cosmos.stars.reduce((a, b) => (b.ly < a.ly ? b : a), sim.cosmos.stars[0] ?? { name: 'the nearest star', ly: 4, angle: 0, seed: '' });
    const years = Math.round(near.ly * 10) / 10;
    const ev = sim.emit({
      type: 'star-message', cellId: town.cell, title: `${town.name} sends a message to the stars`,
      description: `${people} of ${town.name} turn their strongest transmitter on the sky and send a short account of themselves, in signs chosen so that a stranger could work them out: numbers first, then where they are, then what they are. It is addressed to no one. At the speed of light it will pass ${near.name} in ${years.toLocaleString('en-US')} years. It says: "${text}"`,
      causes: [town.eventId].filter((x) => x >= 0), importance: 3, speciesIds: [town.species], data: { message: this.messages.length },
    });
    this.messages.push({ id: this.messages.length, year: sim.simYear, town: town.name, cell: town.cell, species: town.species, glyphs, text, toward: near.name, years, eventId: ev.id });
  }

  /** A world saved when peoples still wrote to whoever was changing it is read without those messages. */
  mend(sim: Simulation): void {
    const o = this as unknown as Record<string, unknown>;
    delete o.answered; delete o.nextMessage;
    if (!this.sent) this.sent = [];
    this.messages = this.messages.filter((m) => typeof (m as unknown as Record<string, unknown>).about !== 'number');
    this.messages.forEach((m, i) => { m.id = i; });
    for (const e of sim.events.events) {
      if (e.type !== 'observer-message') continue;
      e.type = 'night-lights';
      e.title = e.title.replace('writes to the sky', 'lights its streets in a pattern');
      e.description = 'On the night side, the lights of a town go out street by street and come back in a pattern wide enough to be seen from space.';
    }
  }
}
