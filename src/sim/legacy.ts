// What peoples leave, and what they say to whoever is watching (expansion E99 and E100).
//
// E99: a people that has seen the sky meddle, and has lights enough to write with, arranges them into a message for
// the one who did it. What the message says comes from what the player really did to that world.
// E100: when a people ends, or leaves, it seals an archive: its own account of itself, made from the record. A later
// people that builds nearby finds it; the player can open any of them.
//
// Plain data on the simulation with its own random stream, like the rest of section 10.
import type { RNG } from './rng';
import type { Simulation } from './simulation';
import type { SimEvent } from './events';

/** A message written in lights. `glyphs` are numbers a picture of each sign is drawn from; `text` is what it says. */
export interface ObserverMessage {
  id: number;
  year: number;
  /** The town whose lights spell it, and where that is. */
  town: string;
  cell: number;
  species: number;
  glyphs: number[];
  text: string;
  /** The intervention it answers. */
  about: number;
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

/** What a people says about each thing the sky did to it, by the kind of event. */
const ANSWERS: Record<string, string[]> = {
  impact: ['You threw the stone. We counted our dead and we are still here.', 'The stone you dropped made a sea where our fathers farmed. We sail on it now.'],
  'god-iceage': ['You took the warmth. We learned fire better because of it.', 'The cold you sent killed the old ways. We kept the new ones.'],
  'god-heat': ['You lit the air. We remember which rivers died.', 'The summer that did not end: we know now that it was you.'],
  'god-mountain': ['You raised the mountains. We live in their shadow and we thank you for the rivers.', 'Where you lifted the land we built our highest city.'],
  'god-flood': ['You sent the sea over our coasts. Our oldest story is about the boat.', 'The flood was yours. So are we, who came through it.'],
  plague: ['The sickness came from a clear sky. We know its author.', 'You sent the fever. We learned to heal.'],
  'god-lightning': ['Fire from a cloudless sky. We have kept it burning ever since.', 'You struck the forest. We took a branch from it.'],
  'god-shatter': ['You broke the moon. Our nights are brighter and our tides are gone.', 'There was a moon in our oldest songs. We know who took it.'],
  'god-generay': ['You changed what we were. We do not know whether to thank you.', 'The strange births were your doing. Some of them were us.'],
  'god-comet': ['You called the comet. We named our years by it.', 'The long-tailed star came when you wished it. We watched.'],
  'god-tilt': ['You tipped the world. We had to learn the seasons twice.', 'The sun does not rise where it did. That was you.'],
  'god-shield': ['Something kept the fire from us. We think it was you.', 'There is a place the storms never reached. We built our temple there.'],
  'god-monolith': ['The black stone taught us. Was that what you wanted?', 'We were animals until the slab. We remember that, a little.'],
  'god-life': ['The seeds fell from an empty sky. Everything we eat came from them.', 'You planted the world. We are tending it.'],
  'god-species': ['You made a creature and set it down among us. We hunted it, then we herded it.', 'One of the animals here has no ancestors. We noticed.'],
  'rogue-planet': ['You sent the dark world through our sky. Our year has a different length now.', 'The wandering world was your doing. We had to make new calendars.'],
  'gamma-burst': ['You burned half the sky. Those of us on the other side lived to write this.', 'The light we could not see killed everything in the open. We know where it came from.'],
};
const CLOSING = ['We see you.', 'Are you still there?', 'Do it again and we will be ready.', 'Leave us be.', 'Tell us why.', 'We are grateful. We are afraid.'];

export class Legacy {
  rng: RNG;
  messages: ObserverMessage[] = [];
  archives: Archive[] = [];
  /** Interventions already answered. */
  private answered: number[] = [];
  private nextMessage = 0;
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

  // ------------------------------------------------------------------ E99 messages to the observer

  /** A people with lights to write with answers something the sky did to it. */
  private speak(sim: Simulation): void {
    if (sim.simYear < this.nextMessage || sim.civ.living === 0 || this.messages.length >= 12) return;
    const open = sim.godEvents.filter((id) => !this.answered.includes(id));
    if (!open.length) return;
    // lights enough to be read from above, or a faith built on the sky's doings and a town that keeps it
    const towns = sim.civ.settlements.filter((st) => st.ruined < 0 && st.tech >= 0.85);
    if (!towns.length) return;
    const town = towns.reduce((a, b) => (b.tech > a.tech ? b : a));
    // the one they remember best: the latest thing done to them since they could remember at all
    const since = sim.civ.settlements.reduce((y, s) => (s.species === town.species ? Math.min(y, s.founded) : y), sim.simYear);
    // (and not the same season: it takes a generation to decide what to say)
    const known = open.map((id) => sim.events.events[id]!).filter((e) => e && e.simYear >= since - 1 && sim.simYear - e.simYear >= 20);
    for (const id of open) { const e = sim.events.events[id]; if (!e || e.simYear < since - 1) this.answered.push(id); } // before their time: never answered
    if (!known.length) return;
    const about = known[known.length - 1]!;
    this.answered.push(about.id);
    const r = this.rng;
    const said = r.pick(ANSWERS[about.type] ?? ['Something reached down and changed our world. We know it was not chance.']);
    const text = `${said} ${r.pick(CLOSING)}`;
    const glyphs: number[] = [];
    for (const word of text.split(' ')) { let h = 2166136261; for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.toLowerCase().charCodeAt(i), 16777619); glyphs.push((h >>> 0) % 4096); }
    const people = sim.creatures.species[town.species]?.name ?? 'They';
    const ev = sim.emit({
      type: 'observer-message', cellId: town.cell, title: `${town.name} writes to the sky`,
      description: `On the night side, the lights of ${town.name} go out street by street and come back in a pattern: signs, each a district wide, laid out to be read from above. ${people} are speaking to whoever did what was done to them. It says: "${text}"`,
      causes: [about.id, town.eventId].filter((x) => x >= 0), importance: 3, speciesIds: [town.species], data: { message: this.messages.length },
    });
    this.messages.push({ id: this.messages.length, year: sim.simYear, town: town.name, cell: town.cell, species: town.species, glyphs, text, about: about.id, eventId: ev.id });
    this.nextMessage = sim.simYear + r.range(300, 2500);
  }
}
