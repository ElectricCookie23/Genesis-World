// Civilization. Two clocks run here.
//
// Prehistory runs on the planet's clock: a lineage that stays clever long enough begins to keep what
// it learns, and its wandering bands make camps. Camps change over many thousands of years.
//
// History runs on a human clock. The moment a camp plants its first fields it founds or joins a
// nation, and from then on that nation is advanced year by year: rulers are born, reign and die,
// knowledge grows, towns are founded and abandoned, eras turn. Each nation is in its own era.
// Ordinary citizens are never simulated one by one (see history/citizens.ts); rulers and other
// people history remembers are stored for good.
import { G, GENE_COUNT, P, PHEN_COUNT, computePhenotype } from './genetics';
import { RNG, hashSeed } from './rng';
import type { Simulation } from './simulation';
import { calendarName, dateIn, type Calendar, type CalendarKind } from './history/calendar';
import { Log } from './history/celllog';
import { eraOf, eraSlot, eraTitle, earthNote } from './history/eras';
import { hash32 } from './history/hash';
import { capital, compound, makeLanguage, personName, placeMeanings, soundChange, splitLanguage, word, type Language } from './history/language';
import { clearedCover } from './plants';
import { driftSpan } from './history/syntax';
import { wearOf, type Script } from './history/script';
import { ART_STYLES, against, styleOfEra, subjectOf, type Movement, type Painting } from './history/art';
import { stillCleared } from './history/decay';
import { answer, damage, hazards, type CalamityKind, type Ground, type Rebuild, type Scar } from './history/calamity';
import { NETWORKS, emptyHistory, type Link, type Culture, type Dynasty, type HistoryState, type Nation, type Person, type Role, type Wonder, type WonderKind } from './history/model';
import { SLOT_INDEX, WEB, borrowable, chooseNext, copyKnowledge, forget, levelOf, newKnowledge, shed, wayFor, type Land, type Leaning } from './history/tech';

/** One layer in the ground of a town site (system E17). */
/** One of the names a place has had (system E22). */
export interface PlaceName { name: string; year: number; why: string; eventId?: number }

export interface Stratum {
  year: number;
  /** A building phase ('camp', 'village', 'town', 'city', 'great city'), a destruction ('burnt', 'flood', 'ash', 'shaken'), a falling back ('decay') or the end ('abandoned'). */
  kind: string;
  /** What the town knew then: it sets what the layer is made of. */
  tech: number;
  /** The event behind it, or -1. */
  eventId: number;
}

/** A town site with everything under it, for the dig view (system E17): the towns that stood here, oldest first. */
export interface SiteStack {
  cell: number;
  towns: { id: number; name: string; species: number; founded: number; ruined: number; strata: Stratum[] }[];
  /** How many layers in all. */
  layers: number;
}

const PHASE = ['camp', 'village', 'town', 'city', 'great city'];

export interface Settlement {
  id: number;
  name: string;
  cell: number;
  region: number;
  species: number;
  /** People, in thousands. */
  pop: number;
  /** 0 camp, 0.3 village, 0.6 city, 1 great city. */
  tech: number;
  founded: number;
  /** The event this town's oldest story is about (something its people saw and still tell of), or -1. */
  lore: number;
  /** What calamities have left on it (system E20): the last few, oldest first. */
  scars?: Scar[];
  /** The language its name is spoken in (system E22): the name wears as that language does. */
  tongue?: number;
  /** Every name it has had, oldest first, once it has had more than one: the name, the year it came into use, and why. */
  names?: PlaceName[];
  eventId: number;
  ruined: number; // year it was abandoned, or -1
  painted: boolean;
  farms: boolean;
  stars: boolean;
  /** Nation it belongs to, or -1 while it is still a camp outside history. */
  nation: number;
  /** What its name means, so the name can be spoken as the language was in any year. */
  head: string;
  modifier: string;
  /** A slot of the tech web: something here was built with a technique its people have since forgotten (system E5), or -1. */
  relic: number;
  /** Founded by settlers who came across the sea. */
  overseas?: boolean;
  /** The most people it ever held (thousands): how large its ruin is (system E18). */
  peak?: number;
  /** After it was left: the tame animals that run wild in it, and the animals that nest in its towers (species ids). */
  feral?: number;
  nesting?: number;
  /** What lies in the ground here (system E17): each building phase and each destruction of this town, oldest first. */
  strata?: Stratum[];
  /** The ruin this town was founded on top of, if any. */
  over?: number;
  /** Where it has dammed a river, and where it mines (cells), once it has (system E16). */
  dam?: number;
  mine?: number;
  /** The walls it has built (system E11): how many people it held and what it knew each time it was threatened and walled itself in. */
  walls?: { pop: number; tech: number; year: number }[];
  /** Great works raised here in golden ages (system E10). */
  monuments?: number;
  /** How warm its land was when its people last chose to live here: what a later cold is measured against. */
  homeTemp?: number;
}

export const INTELLIGENCE_THRESHOLD = 0.5;
/** A lineage must stay clever this long (years) before it starts keeping what it learns. */
export const MIND_YEARS = 15e6;
/** Level of knowledge at which a camp plants fields and history begins for it. */
export const FARMING = 0.22;
/** At most this many history ticks in one call: under a fast-forward each tick covers more years. */
const MAX_TICKS = 300;
/** Ticks longer than this many years are a fast-forward: rulers and minor events are summarised, not recorded. */
const SUMMARY_YEARS = 8;
/** After a departure, the years over which the towns of home thin out before the long peace settles on those who stayed. */
const STAYED_YEARS = 1200;
/** A people that has stood at the top of knowledge this long without leaving settles into the long peace. */
const SUMMIT_YEARS = 3000;
/** For this long after a last war no one will fight another. */
const LAST_WAR_MEMORY = 6000;
/** No history is made for longer than this: a people that has not changed in so long lives by custom. */
const LONGEST_HISTORY = 40000;

const sat = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** What a people may call its golden age: two meanings for its own tongue, and the same in plain words. */
/** What schools of painters name themselves for: something painters look at, and a way of looking at it. */
const ART_HEADS = ['eye', 'hand', 'river', 'hill', 'stone', 'wind', 'sun', 'land', 'fire', 'star', 'sea', 'town', 'moon', 'forest'];
const ART_MODS = ['new', 'old', 'bright', 'red', 'white', 'low', 'green', 'cold', 'high', 'long', 'black', 'great'];

const GOLDEN_NAMES: [string, string, string][] = [
  ['sun', 'great', 'the Great Sun'], ['star', 'new', 'the New Star'], ['king', 'old', 'the Old Kings'], ['land', 'green', 'the Green Land'], ['river', 'great', 'the Full River'],
  ['fire', 'new', 'the Bright Hearth'], ['hill', 'high', 'the High Hill'], ['sea', 'great', 'the Wide Sea'], ['people', 'great', 'the Great People'], ['town', 'new', 'the New Towns'],
];
/** How the chronicle tells of the first of each kind of network: a title and a line, with the two towns and the nation. */
const FIRST_LINK: [string, string][] = [
  ['The first made road', 'Between {a} and {b} the track has been dug out, drained and laid with stone. Carts cross in a day what took a week in the rains.'],
  ['The first aqueduct', 'Water from the hills now runs into {b} along a channel carried on arches. For the first time a town has more water than its wells could ever give.'],
  ['The first barge canal', '{n} has cut a level waterway from {a} to {b}. One animal on the towpath now pulls what took a hundred on the road.'],
  ['The first railway', 'Iron rails join {a} and {b}, and an engine on them hauls more in a morning than the canal carries in a week. Distance in {n} will never mean what it did.'],
  ['The first telegraph', 'A wire runs from {a} to {b}, and a message sent along it arrives before the sender has put down the key. News in {n} has stopped travelling at the speed of a horse.'],
  ['The first pipeline', 'Rock oil now flows from {a} to {b} through an iron pipe laid across the country, day and night, with no one carrying it.'],
  ['The first power line', 'A line on tall towers carries power from {a} to {b}. That night the streets of {b} are lit by something made a long way off.'],
];
const NTH = ['Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'];
/** How far from its capital a nation of each era can hold a town, counted in regions (the spacing of neighbouring towns). */
const REACH = [2.5, 3.5, 4.5, 6, 10, 14, 22, 45, 99, 99];

/** How many towns a nation of each era can govern before its size itself begins to pull it apart. */
const GOVERNABLE = [3, 5, 8, 14, 24, 40, 70, 120, 200, 300];

/** Size class of a settlement from its level of knowledge: 0 camp, 1 village, 2 town, 3 city, 4 great city. */
export function sizeClass(tech: number): number {
  return tech >= 0.9 ? 4 : tech >= 0.6 ? 3 : tech >= 0.45 ? 2 : tech >= 0.3 ? 1 : 0;
}

export class Civilization {
  settlements: Settlement[] = [];
  /** Species that have crossed the threshold. */
  sapient: number[] = [];
  living = 0;
  maxTech = 0;
  spaceAgeYear = -1;
  departed = false;
  /** The year the departure happened, or -1. */
  departedYear = -1;
  hasMusic = false;
  /** Nations, cultures, languages and remembered people. */
  h: HistoryState = emptyHistory();
  private ships = false;
  private industrial = false;
  private occupied = new Map<number, number>(); // region -> settlement id
  private cleverSince = new Map<number, number>();
  private seedNum = 0;

  /** True while at least one nation exists: the world then has a history worth watching year by year. */
  get historyActive(): boolean {
    return this.h.began >= 0 && this.h.nations.some((n) => n.ended < 0);
  }

  /** True while history is still being made: nations exist and the long peace has not settled on them. */
  get historyLive(): boolean {
    return this.historyActive && !((this.h.peace ?? -1) >= 0);
  }

  // ------------------------------------------------------------------ prehistory (once per ecology step)

  step(sim: Simulation, rng: RNG, tau: number): void {
    const cr = sim.creatures, reg = sim.regions;
    if (!this.seedNum) this.seedNum = hashSeed(`history:${sim.seed}`) || 1;
    // a lineage crosses the threshold: clever, social, and numerous enough to keep what it learns
    for (const s of cr.species) {
      if (s.extinctYear >= 0 || this.sapient.includes(s.id) || !s.name) continue;
      // a world has room for few peoples: once two kinds of mind hold it, a third does not arise beside them
      if (this.sapient.filter((id) => cr.species[id]!.extinctYear < 0).length >= 2) continue;
      const clever = s.ref[G.Intelligence]! > INTELLIGENCE_THRESHOLD && s.ref[G.Sociality]! > 0.35 && s.pop > 2000 && cr.speciesMean(s.id, P.LandUse, true) > 0.4;
      // cleverness is inherited down a lineage: a daughter species keeps its parent's head start
      if (!clever) { this.cleverSince.delete(s.id); continue; }
      if (!this.cleverSince.has(s.id)) this.cleverSince.set(s.id, this.cleverSince.get(s.parent) ?? sim.simYear);
      if (sim.simYear - this.cleverSince.get(s.id)! > MIND_YEARS) {
        this.sapient.push(s.id);
        this.cultureFor(sim, s.id, sim.simYear);
        sim.civEvent('threshold', s.id, reg.centre[s.home]!, -1);
      }
    }
    if (!this.sapient.length) return;
    // found the first camps where the people live
    for (const sid of this.sapient) {
      const s = cr.species[sid]!;
      if (s.extinctYear >= 0) continue;
      const mine = this.settlements.filter((x) => x.species === sid && x.ruined < 0).length;
      if (mine === 0 && !this.occupied.has(s.home) && reg.land[s.home]! > 0.3) this.found(sim, rng, sid, s.home, -1, sim.simYear);
    }
    // camps outside history: they grow, wander on and learn over thousands of years
    for (const st of this.settlements) {
      if (st.ruined >= 0 || st.nation >= 0) continue;
      const s = cr.species[st.species]!;
      if (this.failed(sim, st, s.extinctYear >= 0)) { this.abandon(sim, st, sim.simYear); continue; }
      const capacity = this.capacity(sim, st);
      st.pop += st.pop * 0.6 * (1 - st.pop / Math.max(0.5, capacity)) * Math.min(1, tau * 2);
      const neighbours = this.neighbourCount(sim, st);
      st.tech = Math.min(FARMING + 0.001, st.tech + tau * 0.0009 * (0.4 + Math.log10(1 + st.pop)) * (1 + 0.35 * neighbours) * (0.6 + s.ref[G.Intelligence]!));
      if (!st.painted && st.tech > 0.06) {
        st.painted = true;
        // cave paintings show the animals these people really live among
        const prey = this.neighbourSpecies(sim, st, true);
        if (prey >= 0) {
          const at = sim.events.events.length;
          sim.civEvent('painting', st.species, st.cell, st.id, prey);
          // the first pictures anyone made are kept in the gallery too (system E26): a hunt, in ochre, on rock
          const old = (this.h.paintings ??= []);
          if (sim.events.events.length > at && old.filter((p) => p.era === 0).length < 6) {
            const id = (this.h.paintingSeq = (this.h.paintingSeq ?? 0) + 1);
            old.push({ id, year: sim.simYear, nation: -1, species: st.species, settlement: st.id, eventId: at, subject: 'hunt', era: 0, style: 0, movement: -1, title: sim.events.events[at]!.title, painter: '', seed: hash32(this.seedNum, id, 0xa35), hueA: 0.05, hueB: 0.55, night: false, detail: '', first: !old.some((p) => p.era === 0) });
          }
        }
      }
      // bands split off and make new camps
      if (st.pop > capacity * 0.7 && rng.chance(Math.min(0.5, 0.05 * tau))) {
        const nb = reg.grid.neighbors[st.region * 6 + rng.int(reg.grid.ncount[st.region]!)]!;
        if (!this.occupied.has(nb) && reg.land[nb]! > 0.3 && reg.ice[nb]! < 0.5) {
          const d = this.found(sim, rng, st.species, nb, st.id, sim.simYear);
          if (d) { d.tech = st.tech * 0.6; d.lore = st.lore; st.pop *= 0.85; }
        }
      }
      // the first fields: this camp steps into history
      if (st.tech >= FARMING) this.enterHistory(sim, rng, st, sim.simYear);
    }
    this.census();
    // monoliths: animals living beside one grow cleverer, generation by generation
    if (sim.monoliths.length) {
      for (let c = 0; c < cr.high; c++) {
        if (!cr.alive[c] || !sim.monoliths.includes(cr.region[c]!)) continue;
        const g = c * GENE_COUNT;
        cr.genome[g + G.Intelligence] = Math.min(1, cr.genome[g + G.Intelligence]! + 0.01 * Math.min(1, tau * 4));
        cr.genome[g + G.Curiosity] = Math.min(1, cr.genome[g + G.Curiosity]! + 0.01 * Math.min(1, tau * 4));
        computePhenotype(cr.genome, g, cr.phen, c * PHEN_COUNT);
      }
    }
    this.tend(sim, tau);
    this.paint(sim);
    this.glow(sim);
    this.regrow(sim);
    this.clear(sim);
  }

  // ------------------------------------------------------------------ history (every simulation step)

  /**
   * Advance history by `dt` years. Watched at a human pace this is one tick a year. Under a
   * fast-forward a tick covers more years (never more than MAX_TICKS ticks in a call), with every rate
   * scaled to the length of the tick.
   */
  advance(sim: Simulation, rng: RNG, dt: number): void {
    const h = this.h;
    if (h.began < 0 || !h.nations.some((n) => n.ended < 0)) {
      // no nation is left: whatever comes next begins its own ages, its own first ships, its own sky
      if (h.topEra > 0 || this.departed || (h.peace ?? -1) >= 0) { h.topEra = 0; h.peakEra = 0; h.firsts.length = 0; h.peace = -1; h.topSince = -1; h.since = -1; this.departed = false; this.departedYear = -1; this.spaceAgeYear = -1; this.industrial = false; this.ships = false; }
      h.pending = 0;
      return;
    }
    h.pending += dt;
    if (h.pending < 1) return;
    // (in the long peace nothing happens that needs fine steps: a whole call is one tick, which keeps a jump
    // through millions of years as quick with a living civilization as without one)
    const years = (h.peace ?? -1) >= 0 ? Math.max(1, Math.floor(h.pending)) : Math.max(1, Math.ceil(h.pending / MAX_TICKS));
    const ticks = Math.floor(h.pending / years);
    const start = sim.simYear - h.pending;
    sim.quietEvents = years > SUMMARY_YEARS;
    for (let k = 0; k < ticks; k++) this.tick(sim, rng, years, start + (k + 1) * years);
    sim.quietEvents = false;
    h.pending -= ticks * years;
    this.census();
    this.paint(sim);
    this.glow(sim);
    this.regrow(sim);
    this.clear(sim);
  }

  /** One tick of history, `y` years long, ending in year `year`. */
  private tick(sim: Simulation, rng: RNG, y: number, year: number): void {
    const h = this.h, cr = sim.creatures;
    this.fine = y <= SUMMARY_YEARS;
    if (h.notables.length) this.lives(sim, rng, y, year);
    // who belongs to whom
    const members = new Map<number, Settlement[]>();
    for (const st of this.settlements) {
      if (st.ruined >= 0 || st.nation < 0) continue;
      let list = members.get(st.nation);
      if (!list) members.set(st.nation, (list = []));
      list.push(st);
    }
    if ((h.peace ?? -1) >= 0) { this.peaceTick(sim, rng, members, y, year); return; }
    let most = 1;
    for (const list of members.values()) if (list.length > most) most = list.length;
    for (const n of h.nations) {
      // (a country founded during this very tick has its first turn in the next one)
      if (n.ended >= 0 || n.founded >= year) continue;
      const towns = members.get(n.id);
      if (!towns || !towns.length) { this.endNation(sim, n, year); continue; }
      const sp = cr.species[n.species]!;
      // ---- a people driven out moves before its towns are counted lost (system E9)
      this.exodus(sim, rng, n, towns, year);
      let pop = 0, big = towns[0]!;
      for (const st of towns) { pop += st.pop; if (st.pop > big.pop) big = st; }
      n.pop = pop; n.towns = towns.length;
      const seat = this.settlements[n.capital];
      if (!seat || seat.ruined >= 0 || seat.nation !== n.id) n.capital = big.id;
      // ---- the ruler grows old
      const ruler = h.people[n.ruler];
      if (ruler && ruler.died < 0 && y > SUMMARY_YEARS) this.reignsPass(sim, rng, n, y, year);
      else if (ruler && ruler.died < 0) {
        const span = this.lifespan(sim, n.species);
        const age = year - ruler.born;
        const hazard = 0.006 * Math.exp((age - 0.55 * span) / (0.14 * span));
        if (rng.chance(1 - Math.exp(-hazard * y))) this.succession(sim, rng, n, towns, year, age > span * 0.75 ? 'died of old age' : rng.pick(['died of a fever', 'died in a fall', 'died after a short illness', 'was killed hunting', 'died in the night']));
        else if (this.fine && (ruler.spouse ?? -1) < 0 && n.contacts.length && rng.chance(1 - Math.exp(-y * 0.006))) this.marry(sim, rng, n, year);
      }
      // a succession can end the country (a union by marriage hands its towns to another): it has no more year to live.
      // (Without this its towns went on to found daughters in its name, which were then living towns of a fallen country.)
      if (n.ended >= 0) continue;
      // ---- knowledge: more people, clever people and neighbours to learn from all speed it; so does what is already known
      const reach = Math.min(4, towns.length - 1) * 0.08;
      const quick = 1 + 6 * sat((n.tech - 0.7) / 0.3) ** 2;
      // (learning gathers where the people are: a country much smaller than the greatest of its day works more slowly)
      const rate = 6.5e-5 * (n.golden ? 1.45 : 1) * (0.5 + 0.5 * Math.min(1, towns.length / Math.max(1, 0.5 * most))) * (0.45 + Math.log10(1 + pop) / 3) * (0.6 + sp.ref[G.Intelligence]!) * (1 + reach) * quick * (0.6 + 0.4 * n.stability) * (0.9 + 0.2 * (ruler ? ruler.wise : 0.5));
      this.research(sim, rng, n, towns, rate * y, year, y);
      // ---- a library burns (system E5): likelier in troubled times, and only once there is writing to burn
      if (n.know.way[SLOT_INDEX.get('write')!]! >= 0 && rng.chance(1 - Math.exp(-y * (0.4 + 1.6 * (1 - n.stability) + n.fatigue) / 2600))) {
        const capTown = this.settlements[n.capital]!;
        this.loseKnowledge(sim, rng, n, towns, 2 + rng.int(3), year, `The library of ${capTown.name} has burned${n.fatigue > 0.2 ? ' in the fighting' : ''}.`, n.woes.length ? n.woes[n.woes.length - 1]!.eventId : -1);
      }
      // ---- how well it holds together, and what happens when it does not (system E4)
      if (this.fate(sim, rng, n, towns, y, year)) continue;
      // ---- what it does to the land (system E16)
      this.works(sim, rng, n, towns, y, year);
      // ---- what is built between its towns (system E15)
      this.network(sim, rng, n, towns, y, year);
      // ---- golden ages begin, raise their monuments and end (system E10)
      this.flourish(sim, rng, n, towns, y, year);
      // ---- its painters paint what has happened, in the manner of their age and their school (system E26)
      this.art(sim, n, y, year);
      // ---- once it can write, it writes in some script: its own, or one it learned (system E23)
      if (n.script === undefined) this.writing(sim, n, year);
      // ---- now and then it raises a wonder, because of something that happened (system E19)
      this.wonder(sim, rng, n, towns, y, year);
      // ---- a people that charts the stars fixes its count of years (system E8)
      if (this.fine && n.know.way[SLOT_INDEX.get('sky2')!]! >= 0 && this.calendarOf(n)?.kind === 'founding' && rng.chance(1 - Math.exp(-y / 40))) this.reformCalendar(sim, rng, n, year);
      // ---- in hard years someone may stand up and say what is wrong
      if (this.fine && n.woes.length && year - n.woes[n.woes.length - 1]!.year < 25 && rng.chance(1 - Math.exp(-y * 0.006))) this.reformer(sim, rng, n, year);
      // ---- a new era
      const era = eraOf(n.tech);
      if (era > n.era) {
        n.era = era;
        const first = era > h.topEra;
        if (first) h.topEra = era;
        // an age the world had reached before, lost in a great ruin, and has now made again
        const again = first && era <= (h.peakEra ?? 0);
        if (first && !again) h.peakEra = era;
        const cap = this.settlements[n.capital]!;
        const title = this.eraName(n), own = this.eraOwnName(n, year);
        const ev = sim.emit({
          type: 'era', year, cellId: cap.cell, title: again ? `The ${title} comes again` : first ? `The ${title} begins` : `${n.name} enters its ${title}`,
          description: again
            ? `What the world lost has been made again. In ${n.name} they have climbed back to where their forebears stood before the ruin. ${eraLine(era)} They call these years ${own}.`
            : first
            ? `In ${n.name} something has changed for good. ${eraLine(era)} They will come to call these years ${own}. No one alive will see the world go back.`
            : `${n.name} has come to a new age of its own, which it calls ${own}. ${eraLine(era)}`,
          causes: [n.eventId].filter((x) => x >= 0), importance: first ? 2 : 0, speciesIds: [n.species], data: again ? { nation: n.id, era, earth: earthNote(era), own, name: n.name, again: 1 } : { nation: n.id, era, earth: earthNote(era), own, name: n.name },
        });
        sim.cellLog.note(cap.cell, year, Log.Era, era);
        this.credit(sim, rng, n, ev.id, again ? 'It is the reign of {name}.' : 'It begins in the reign of {name}.');
      }
      // ---- its towns
      for (const st of towns) this.town(sim, rng, n, st, st.id === n.capital, y, year);
    }
    // industry: burning the buried forests of older ages warms the whole world
    let living = 0, maxTech = 0;
    for (const st of this.settlements) { if (st.ruined < 0) { living++; if (st.tech > maxTech) maxTech = st.tech; } }
    if (maxTech > 0.85) {
      if (!this.industrial) { this.industrial = true; const at = sim.events.events.length, lead = this.leadTown(); sim.civEvent('industry', this.sapient[0]!, -1, -1); if (lead) this.stepForward(sim, lead, at, 'The first great engine was built by {name}.', 'inventor'); }
      sim.climate.greenhouse = Math.min(9, sim.climate.greenhouse + 1.2e-5 * y * living);
    }
    if (this.spaceAgeYear < 0 && maxTech >= 1.1 && living >= 12) {
      this.spaceAgeYear = year;
      { const at = sim.events.events.length, lead = this.leadTown(); sim.civEvent('space', this.sapient[0]!, -1, -1); if (lead) this.stepForward(sim, lead, at, 'The first of them to ride one up and come home alive was {name}.', 'explorer'); }
    }
    // departure: a people that has held the sky for long enough finally leaves
    if (!this.departed && this.spaceAgeYear >= 0 && year - this.spaceAgeYear > 1500 && living >= 12) {
      this.departed = true; this.departedYear = year;
      { const at = sim.events.events.length, lead = this.leadTown(); sim.civEvent('departure', this.sapient[0]!, -1, -1); if (lead) this.stepForward(sim, lead, at, 'The captain of the first ship out was {name}.', 'explorer'); }
    }
    // ---- every living language wears a little, and peoples long apart come to speak differently (system E21)
    this.drift(y, year);
    this.partTongues(sim, year);
    // ---- the sky as people see it (system E8); nothing is recorded of it under a fast-forward
    if (this.fine) this.sky(sim, rng, y, year);
    // ---- the long peace: a history does not go on for ever
    let top = 0;
    for (const n of h.nations) if (n.ended < 0 && n.tech > top) top = n.tech;
    if (top >= 1.18) { if ((h.topSince ?? -1) < 0) h.topSince = year; } else h.topSince = -1;
    const since = (h.since ?? -1) >= 0 ? h.since! : h.began;
    const why = this.departed && year - this.departedYear >= STAYED_YEARS ? 'stayed'
      : (h.topSince ?? -1) >= 0 && year - h.topSince! >= SUMMIT_YEARS ? 'summit'
        : year - since >= LONGEST_HISTORY ? 'custom' : '';
    if (why && living > 0) this.settle(sim, year, why);
  }

  /** One town of a nation, over `y` years. */
  private town(sim: Simulation, rng: RNG, n: Nation, st: Settlement, isCapital: boolean, y: number, year: number): void {
    const cr = sim.creatures, reg = sim.regions;
    const s = cr.species[st.species]!;
    if (this.failed(sim, st, s.extinctYear >= 0)) { this.abandon(sim, st, year); return; }
    if (st.pop > (st.peak ?? 0)) st.peak = st.pop;
    const capacity = this.capacity(sim, st);
    if (this.departed && year - this.departedYear < STAYED_YEARS) {
      // many leave: for a thousand years the towns of home thin out, to about half of what they were
      st.pop *= Math.exp(-y / 1700);
    } else {
      // people: a few per cent a year while there is room
      const grow = 1 - Math.exp(-0.03 * y);
      st.pop += st.pop * grow * (1 - st.pop / Math.max(0.5, capacity));
      if (st.pop > capacity * 1.5) st.pop = capacity * 1.5;
    }
    // what the nation knows reaches its towns within a generation or two; the capital first
    const before = st.tech;
    const target = n.tech * (isCapital ? 1 : 0.86);
    if (target > st.tech) st.tech += (target - st.tech) * (1 - Math.exp(-y / 45));
    // in a dark age the towns slip back, more slowly than they rose: what was built outlasts the knowing how
    else if (target < st.tech - 0.02) st.tech += (target - st.tech) * (1 - Math.exp(-y / 160));
    if (!st.painted && st.tech > 0.06) st.painted = true;
    if (st.tech >= 0.3 && before < 0.3) { const at = sim.events.events.length; sim.civEvent('village', st.species, st.cell, st.id); if (sim.events.events.length > at) this.credit(sim, null, n, at, 'It answers to {name}.'); }
    if (st.tech >= 0.6 && before < 0.6) { const at = sim.events.events.length; sim.civEvent('city', st.species, st.cell, st.id); if (sim.events.events.length > at) this.credit(sim, rng, n, at, `Its great hall is the work of {name}.`, 'artist', year); }
    // (a town founded by settlers who already knew how to build one begins as what it is, not as a camp)
    if (st.strata && st.strata.length === 1 && st.strata[0]!.kind === 'camp' && sizeClass(before) > 0) { st.strata[0]!.kind = PHASE[sizeClass(before)]!; st.strata[0]!.tech = before; }
    if (sizeClass(st.tech) !== sizeClass(before)) {
      sim.cellLog.note(st.cell, year, Log.Size, sizeClass(st.tech));
      // a town that has grown into a larger kind of place is rebuilt as one; one that has slipped back decays (system E17)
      this.layer(st, year, sizeClass(st.tech) > sizeClass(before) ? PHASE[sizeClass(st.tech)]! : 'decay', -1);
    }
    if (!this.hasMusic && st.tech > 0.35) { this.hasMusic = true; const at = sim.events.events.length; sim.civEvent('music', st.species, st.cell, st.id); if (sim.events.events.length > at) this.credit(sim, rng, n, at, `The first tune anyone wrote down is by {name}.`, 'artist', year); }
    // star lore: villagers name a constellation after a vanished animal whose bones they find
    if (!st.stars && st.tech > 0.4) {
      st.stars = true;
      const gone = cr.species.filter((x) => x.extinctYear >= 0 && x.peakRegions >= 10 && x.name);
      if (gone.length && rng.chance(0.12)) sim.civEvent('constellation', st.species, st.cell, st.id, rng.pick(gone).id);
    }
    // ---- fire, earthquake, flood and ash (system E20)
    this.calamity(sim, rng, n, st, capacity, y, year);
    // war: neighbours of another nation or another kind sometimes fight, those who tell the same stories of the past less often (campaigns proper are system E33)
    const head = this.h.people[n.ruler];
    if (st.tech > 0.3 && rng.chance(Math.min(0.5, 0.0004 * y * (0.6 + 0.8 * (head ? head.bold : 0.5))))) {
      for (let j = 0; j < reg.grid.ncount[st.region]!; j++) {
        const oid = this.occupied.get(reg.grid.neighbors[st.region * 6 + j]!);
        if (oid === undefined) continue;
        const o = this.settlements[oid]!;
        if (o.nation === st.nation && o.species === st.species) continue;
        // a marriage between the ruling houses keeps the peace while it is remembered (system E7)
        if (this.allied(n, o.nation, year)) continue;
        if (o.species === st.species && (o.lore === st.lore || o.lore < 0 || st.lore < 0) && !rng.chance(0.35)) continue;
        st.pop *= 0.7; o.pop *= 0.65; st.tech = Math.max(0.03, st.tech - 0.02); o.tech = Math.max(0.03, o.tech - 0.02);
        n.fatigue = sat(n.fatigue + 0.22);
        // conquest carries knowledge with it, or burns it (system E3)
        const foe = o.nation >= 0 ? this.h.nations[o.nation] : undefined;
        if (foe && foe.ended < 0 && foe.id !== n.id) {
          const [strong, weak] = n.tech >= foe.tech ? [n, foe] : [foe, n];
          if (strong.tech - weak.tech > 0.05) {
            const wl = new Set(weak.land);
            if (rng.chance(0.5)) { for (let k = 0; k < 2; k++) { const i = borrowable(weak.know, strong.know, wl); if (i >= 0) { weak.know.way[i] = wayFor(i, wl); weak.know.year[i] = year; } } }
            else { let top = -1; for (let i = 0; i < WEB.length; i++) if (weak.know.way[i]! >= 0 && (top < 0 || WEB[i]!.level > WEB[top]!.level)) top = i; if (top >= 0) weak.know.way[top] = -1; }
          }
        }
        // a town that has been fought over walls itself in, and again when it has outgrown its walls (system E11)
        this.fortify(st, year); this.fortify(o, year);
        const struck = o;
        const warAt = sim.events.events.length;
        sim.civEvent('war', st.species, st.cell, st.id, o.id);
        const warEvent = sim.events.events.length > warAt ? warAt : -1;
        // the town that was attacked burns, and is rebuilt on its own ashes (system E17)
        if (struck.tech >= 0.3) this.layer(struck, year, 'burnt', warEvent, 120);
        this.woe(n, 'war', warEvent, year, 0.07);
        const general = this.credit(sim, rng, n, warEvent, `{name} led the host of ${n.name}.`, 'general', year);
        if (foe && foe.ended < 0 && foe.id !== n.id) {
          foe.fatigue = sat(foe.fatigue + 0.22);
          this.woe(foe, 'war', warEvent, year, 0.09);
          const other = this.fine ? this.credit(sim, rng, foe, warEvent, `{name} stood against them for ${foe.name}.`, 'general', year) : null;
          if (general && other && general.id !== other.id) { general.rival = other.id; other.rival = general.id; }
          // the stronger side sometimes keeps what it took: this is how countries grow past what they can hold
          const warlike = this.h.cultures[n.culture]!.war;
          if (o.species === st.species && n.pop > foe.pop * 0.5 && n.tech >= foe.tech - 0.06 && rng.chance(0.25 + 0.35 * warlike)) {
            o.nation = n.id; o.pop *= 0.85;
            sim.cellLog.note(o.cell, year, Log.Owner, n.id);
            const taken = sim.emit({ type: 'conquest', year, cellId: o.cell, title: `${n.name} takes ${o.name}`, description: `${o.name} has a new flag over its gate. It belonged to ${foe.name} until this year.`, causes: [warEvent, n.eventId].filter((x) => x >= 0), importance: foe.capital === o.id ? 1 : 0, speciesIds: [st.species], data: { nation: n.id, from: foe.id } });
            if (general && taken.id >= 0) { taken.description += ` ${general.name} rode in first.`; taken.data = { ...taken.data, person: general.id }; general.events.push(taken.id); }
            // conquerors rename what they take (system E22): the same meaning said in their own tongue, more often the more warlike they are
            // (the luck in it comes from the town and the year, not from the stream that decides wars)
            if (taken.id >= 0 && (hash32(this.seedNum, o.id, Math.floor(year), 0x4e3a) % 1000) / 1000 < 0.3 + 0.5 * warlike) {
              const was = o.name;
              if (this.rename(o, this.languageOf(n), year, `renamed by ${n.name}, who took it from ${foe.name}`, taken.id, true)) taken.description += ` Its new masters call it ${o.name}, which means in their tongue what ${was} meant in the old one.`;
            }
          }
        }
        // with the atom in hand, a war can end the age
        // (only between nations that hold the sky, rarely, and never while the last one is remembered)
        if (this.spaceAgeYear >= 0 && !this.departed && n.era >= 8 && year - (this.h.lastWar ?? -1e9) > LAST_WAR_MEMORY && rng.chance(0.012)) { this.h.lastWar = year; const at = sim.events.events.length; sim.civEvent('nuclear', st.species, st.cell, st.id); if (sim.events.events.length > at) this.credit(sim, null, n, at, 'The order was given by {name}.'); }
        break;
      }
    }
    // sickness travels the roads between crowded towns
    if (st.tech > 0.5 && st.pop > 20 && rng.chance(Math.min(0.5, 0.0001 * y))) {
      st.pop *= 0.5;
      const plagueAt = sim.events.events.length;
      sim.civEvent('city-plague', st.species, st.cell, st.id);
      if (sim.events.events.length > plagueAt) this.credit(sim, rng, n, plagueAt, '{name}, a healer, stayed to tend the sick when others fled.', 'scholar', year);
      this.woe(n, 'plague', sim.events.events.length > plagueAt ? plagueAt : -1, year, 0.14);
      // when the few who knew a craft die together, the craft dies with them
      if (isCapital && rng.chance(0.35)) this.loseKnowledge(sim, rng, n, [st], 1 + rng.int(2), year, `The plague in ${st.name} took the last who knew how.`, sim.events.events.length > plagueAt ? plagueAt : -1);
      for (let j = 0; j < reg.grid.ncount[st.region]!; j++) {
        const oid = this.occupied.get(reg.grid.neighbors[st.region * 6 + j]!);
        if (oid !== undefined) this.settlements[oid]!.pop *= 0.7;
      }
    }
    // people move on and found daughter towns
    if (!this.departed && st.pop > capacity * 0.7 && rng.chance(Math.min(0.6, 0.004 * y * (1 + st.tech * 3)))) {
      let nb = reg.grid.neighbors[st.region * 6 + rng.int(reg.grid.ncount[st.region]!)]!;
      // where the land ends, a people with boats looks across the water
      let bySea = false;
      if (reg.land[nb]! <= 0.3 && rng.chance(0.5)) { const shore = this.voyage(sim, n, st.region, nb); if (shore >= 0) { nb = shore; bySea = true; } }
      if (!this.occupied.has(nb) && reg.land[nb]! > 0.3 && reg.ice[nb]! < 0.5) {
        const d = this.found(sim, rng, st.species, nb, st.id, year);
        if (d) {
          if (bySea) {
            d.overseas = true;
            const ev = sim.events.events[d.eventId];
            if (ev) ev.description = `${ev.description} They came by sea from ${st.name}.`;
          }
          d.tech = Math.max(FARMING, st.tech * 0.6); d.lore = st.lore; d.farms = true; st.pop *= 0.85;
          // a country can only hold what its age lets it reach: settlers who go further answer to no one back home
          const cap = this.settlements[n.capital]!, gp = sim.grid.pos;
          const cos = gp[cap.cell * 3]! * gp[d.cell * 3]! + gp[cap.cell * 3 + 1]! * gp[d.cell * 3 + 1]! + gp[cap.cell * 3 + 2]! * gp[d.cell * 3 + 2]!;
          const spacing = Math.sqrt((4 * Math.PI) / reg.count);
          if (Math.acos(Math.max(-1, Math.min(1, cos))) > REACH[n.era]! * spacing) {
            const far = this.newNation(sim, rng, d, year, n);
            const ev = sim.events.events[d.eventId], first = this.h.people[far.ruler];
            if (ev && first) { ev.description = `${ev.description} The settlers were led by ${first.name}.`; ev.data = { ...(ev.data ?? {}), person: first.id, nation: far.id }; first.events.push(ev.id); }
          } else {
            d.nation = n.id; sim.cellLog.note(d.cell, year, Log.Owner, n.id);
            this.credit(sim, rng, n, d.eventId, 'The settlers were led by {name}.', 'explorer', year);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ nations, cultures, people

  /** The culture of a species (made the first time it is asked for). */
  private cultureFor(sim: Simulation, species: number, year: number): Culture {
    const h = this.h;
    const have = h.cultures.find((c) => c.species === species);
    if (have) return have;
    if (!this.seedNum) this.seedNum = hashSeed(`history:${sim.seed}`) || 1;
    const g = sim.creatures.species[species]!.ref;
    const lang = makeLanguage(h.languages.length, this.seedNum, {
      size: g[G.Size]!, water: g[G.Water]!, flight: sat((g[G.LimbType]! - 0.7) * 4), hearing: Math.max(g[G.Hearing]!, g[G.Echo]!), harsh: g[G.Aggression]!,
    }, year);
    h.languages.push(lang);
    const c: Culture = {
      id: h.cultures.length, name: capital(word(lang, 'people')), species, language: lang.id, parent: -1, born: year,
      war: sat(g[G.Aggression]! * 0.7 + g[G.Territorial]! * 0.4), custom: sat(0.35 + (1 - g[G.Curiosity]!) * 0.4 + g[G.Sociality]! * 0.2),
      trade: sat(g[G.Sociality]! * 0.5 + g[G.Curiosity]! * 0.5), craft: sat(g[G.Intelligence]! * 0.7 + g[G.Curiosity]! * 0.3), hue: g[G.Glow]! > 0.4 ? g[G.GlowHue]! : g[G.Hue]!,
    };
    lang.name = c.name;
    h.cultures.push(c);
    return c;
  }

  /** A people that has grown apart from its parent: its speech has drifted and its values have shifted a little. */
  private daughterCulture(rng: RNG, parent: Culture, year: number, home?: Settlement): Culture {
    const h = this.h;
    const lang = splitLanguage(h.languages[parent.language]!, h.languages.length, year);
    for (let k = 0; k < 3; k++) soundChange(lang, rng, year);
    h.languages.push(lang);
    const nudge = (v: number) => sat(v + (rng.next() - 0.5) * 0.3);
    // What they call themselves: "the people" in their own tongue, as every people does. Where that is what a
    // sister people already calls itself, they are the people of their chief town, or of its river or hill.
    const name = this.peopleName(lang, capital(word(lang, 'people')), year, home);
    const c: Culture = {
      id: h.cultures.length, name, species: parent.species, language: lang.id, parent: parent.id, born: year,
      war: nudge(parent.war), custom: nudge(parent.custom), trade: nudge(parent.trade), craft: nudge(parent.craft), hue: (parent.hue + 0.06 + rng.next() * 0.12) % 1,
    };
    lang.name = c.name;
    h.cultures.push(c);
    return c;
  }

  /** A name for a new people that no other people has: the one offered, or failing that the people of their town, river or hill. */
  private peopleName(lang: Language, offered: string, year: number, home?: Settlement): string {
    const h = this.h;
    const taken = (x: string): boolean => h.cultures.some((o) => o.name === x);
    let name = offered;
    const marks = home ? [home.modifier, home.head, 'new', 'high', 'far', 'low', 'old'] : ['new', 'high', 'far', 'low', 'old', 'sea', 'hill'];
    for (let k = 0; taken(name) && k < marks.length; k++) if (marks[k]) name = compound(lang, 'people', marks[k]!, year);
    for (let k = 2; taken(name) && k < 60; k++) name = `${capital(word(lang, 'people'))} ${k}`;
    return name;
  }

  /**
   * Newcomers and the people who took them in become one people (system E9): a new culture whose speech is the
   * hosts' with sounds and habits of the newcomers, and whose values lie between the two. `share` is the
   * newcomers' part of the whole.
   */
  private mixCulture(sim: Simulation, rng: RNG, host: Nation, guest: Culture, share: number, year: number, cause: number): Culture {
    const h = this.h;
    const old = h.cultures[host.culture]!;
    const lang = splitLanguage(h.languages[old.language]!, h.languages.length, year);
    // the newcomers' sounds enter the language
    const theirs = h.languages[guest.language]!;
    for (const c of theirs.consonants) if (!lang.consonants.includes(c) && lang.consonants.length < 16 && rng.chance(0.5)) lang.consonants.push(c);
    for (const v of theirs.vowels) if (!lang.vowels.includes(v) && lang.vowels.length < 8 && rng.chance(0.4)) lang.vowels.push(v);
    for (let k = 0; k < 2; k++) soundChange(lang, rng, year);
    h.languages.push(lang);
    const mid = (a: number, b: number) => sat(a * (1 - share) + b * share);
    const cut = Math.max(2, Math.ceil(old.name.length / 2));
    const c: Culture = {
      id: h.cultures.length, name: this.peopleName(lang, capital(`${old.name.slice(0, cut)}${guest.name.slice(Math.floor(guest.name.length / 2)).toLowerCase()}`), year, this.settlements[host.capital]), species: old.species, language: lang.id, parent: old.id, born: year,
      war: mid(old.war, guest.war), custom: mid(old.custom, guest.custom), trade: sat(mid(old.trade, guest.trade) + 0.05), craft: mid(old.craft, guest.craft),
      hue: (old.hue + (((guest.hue - old.hue + 1.5) % 1) - 0.5) * share + 1) % 1, mixedWith: guest.id,
    };
    lang.name = c.name;
    h.cultures.push(c);
    host.culture = c.id;
    this.respeak(c.language, year, `the speech of ${host.name} had become ${c.name}`);
    const cap = this.settlements[host.capital]!;
    sim.emit({
      type: 'culture', year, cellId: cap.cell, title: `A new people: the ${c.name}`,
      description: `In ${host.name} the newcomers and the old families have become one people. They call themselves the ${c.name}. Their speech is still that of the ${old.name}, with sounds and words the ${guest.name} brought, and their customs are a little of both.`,
      causes: [cause, host.eventId].filter((x, i, a) => x >= 0 && a.indexOf(x) === i), importance: 1, speciesIds: [host.species], data: { nation: host.id, culture: c.id, parent: old.id, other: guest.id },
    });
    return c;
  }

  /** The event in the cause graph that explains why a people is on the move. */
  private pushCause(sim: Simulation, why: string, n: Nation): number {
    const byHand = (type: string): number => { for (let i = sim.interventions.length - 1; i >= 0; i--) { const e = sim.events.events[sim.interventions[i]!]; if (e && e.type === type && sim.simYear - e.simYear < 60000) return e.id; } return -1; };
    const era = sim.era.eventId;
    if (why === 'ice') { const g = byHand('tool-iceage'); return g >= 0 ? g : sim.era.kind === 'ice' || sim.era.kind === 'winter' ? era : sim.rootClimateCause(); }
    if (why === 'sea') { const g = byHand('tool-flood'); return g >= 0 ? g : sim.seaCause >= 0 ? sim.seaCause : era >= 0 ? era : sim.rootClimateCause(); }
    return n.woes.length ? n.woes[n.woes.length - 1]!.eventId : era;
  }

  /**
   * Migrations of peoples (system E9). When the sea takes a nation's towns, or the ice comes down on them, or
   * the land can no longer feed them, the people do not simply die: they move. They look for free land they
   * can reach on foot, or by sea if they have boats, and found new towns there; if every place within reach
   * is taken they move in with another nation of their kind, and the two peoples mix.
   */
  private exodus(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], year: number): void {
    if (year - (n.moved ?? -1e9) < 150 || !towns.length) return;
    const h = this.h, reg = sim.regions, g = reg.grid, w = sim.world;
    const leaving: { st: Settlement; why: string; share: number }[] = [];
    let people = 0, total = 0;
    const tally: Record<string, number> = { sea: 0, ice: 0, famine: 0 };
    for (const st of towns) {
      if (st.ruined >= 0) continue;
      total += st.pop;
      const room = this.capacity(sim, st);
      // cold drives people out when it is a change: a town founded in a cold country stays until it grows colder still
      const cold = reg.landTemp[st.region]!;
      const base = (st.homeTemp ??= cold);
      const iced = (cold < base - 4 && cold < 1) || (reg.ice[st.region]! > 0.45 && base > -1);
      const why = w.elevation[st.cell]! <= w.seaLevel ? 'sea' : iced ? 'ice' : st.pop > 3 && st.pop > 1.7 * room ? 'famine' : '';
      if (!why) continue;
      const share = why === 'sea' ? 0.85 : why === 'ice' ? 0.75 : Math.min(0.6, 1 - room / st.pop);
      leaving.push({ st, why, share });
      people += st.pop * share; tally[why] = (tally[why] ?? 0) + st.pop * share;
    }
    // one town emptying is not the migration of a people
    const why = tally.sea! >= tally.ice! && tally.sea! >= tally.famine! ? 'sea' : tally.ice! >= tally.famine! ? 'ice' : 'famine';
    // (unless it is a large town going under the sea: the water takes towns one at a time)
    if (!leaving.length || people < 2 || (leaving.length < 2 && people < 0.25 * total && !(why === 'sea' && people >= 8))) return;
    const origin = leaving.reduce((a, b) => (b.st.pop > a.st.pop ? b : a)).st;
    // ---- where can they go? outward from the largest town that is emptying, over land, and over water as far as their boats reach
    const knows = (id: string) => n.know.way[SLOT_INDEX.get(id)!]! >= 0;
    const spacing = Math.sqrt((4 * Math.PI) / reg.count);
    const water = Math.round((knows('steamship') ? 4 : knows('ship2') ? 1.7 : knows('ship1') ? Math.max(0.55, 5 * spacing) : knows('sail') ? 3 * spacing : knows('boat') ? 1.6 * spacing : 0) / spacing);
    const here = reg.landTemp[origin.region]!;
    const seen = new Map<number, number>([[origin.region, 0]]);   // region -> water crossed so far
    let frontier = [origin.region];
    const free: { region: number; score: number }[] = [];
    let host: Settlement | undefined, hostAt = 99, freeAt = 99;
    for (let depth = 1; depth <= 16 && frontier.length; depth++) {
      const next: number[] = [];
      for (const r of frontier) {
        const wet = seen.get(r)!;
        for (let k = 0; k < g.ncount[r]!; k++) {
          const nb = g.neighbors[r * 6 + k]!;
          if (seen.has(nb)) continue;
          const land = reg.land[nb]! > 0.3;
          const crossed = land ? wet : wet + 1;
          if (crossed > water) continue;
          seen.set(nb, crossed);
          next.push(nb);
          if (!land) continue;
          const oid = this.occupied.get(nb);
          if (oid !== undefined) { const o = this.settlements[oid]!; if (!host && o.nation >= 0 && o.nation !== n.id && o.species === n.species && h.nations[o.nation]!.ended < 0) { host = o; hostAt = depth; } continue; }
          const centre = reg.centre[nb]!;
          // (people fleeing the sea want ground well above it)
          if (reg.ice[nb]! > 0.3 || reg.landTemp[nb]! < -2 || w.elevation[centre]! <= w.seaLevel + (why === 'sea' ? 0.03 : 0.004)) continue;
          if (why === 'ice' && reg.landTemp[nb]! < here + 1.5) continue;
          if (freeAt > depth) freeAt = depth;
          free.push({ region: nb, score: sim.plants.landFood[nb]! + 0.02 * Math.min(20, reg.landTemp[nb]! - here) - 0.03 * depth + rng.next() * 0.05 });
        }
      }
      frontier = next;
      if (free.length >= 12) break;
    }
    free.sort((a, b) => b.score - a.score);
    const wanted = Math.max(1, Math.min(4, Math.round(people / 40) + 1, leaving.length + 1));
    const cause = this.pushCause(sim, why, n);
    const gp = sim.grid.pos;
    const made: Settlement[] = [];
    let tech = 0;
    for (const l of leaving) tech = Math.max(tech, l.st.tech);
    // people on the move go to their own kind when that is much nearer than empty land, and sometimes anyway
    const toHost = !!host && (hostAt + 2 < freeAt || rng.chance(0.2));
    if (free.length && !toHost) {
      for (const f of free) {
        if (made.length >= wanted) break;
        if (this.occupied.has(f.region)) continue;
        const d = this.found(sim, rng, n.species, f.region, origin.id, year);
        if (d) { d.tech = Math.max(FARMING, tech * 0.92); d.lore = origin.lore; d.farms = true; made.push(d); }
      }
    }
    if (!made.length && !host) return;       // nowhere to go: they die where they stand, as before
    // (those who stay behind have chosen the place as it now is)
    for (const l of leaving) { l.st.pop *= 1 - l.share; l.st.homeTemp = reg.landTemp[l.st.region]!; }
    n.moved = year;
    const capGoes = leaving.some((l) => l.st.id === n.capital);
    const from = origin.name, cap = this.settlements[n.capital]!;
    const peace = (h.peace ?? -1) >= 0;
    let where: string, target: Settlement, hostNation: Nation | undefined;
    if (made.length) {
      for (const d of made) d.pop = Math.max(d.pop, (people * 0.8) / made.length);
      target = made[0]!;
      const cos = gp[cap.cell * 3]! * gp[target.cell * 3]! + gp[cap.cell * 3 + 1]! * gp[target.cell * 3 + 1]! + gp[cap.cell * 3 + 2]! * gp[target.cell * 3 + 2]!;
      const far = Math.acos(Math.max(-1, Math.min(1, cos))) > REACH[n.era]! * spacing;
      if (capGoes || !far || peace) {
        // the nation goes with its people: the court moves if its seat is among the towns left behind
        for (const d of made) { d.nation = n.id; sim.cellLog.note(d.cell, year, Log.Owner, n.id); }
        if (capGoes) n.capital = target.id;
      } else {
        const born = this.newNation(sim, rng, target, year, n, 'far');
        for (const d of made) if (d.id !== target.id) { d.nation = born.id; sim.cellLog.note(d.cell, year, Log.Owner, born.id); }
      }
      where = made.length === 1 ? `at ${target.name}` : `at ${made.slice(0, -1).map((d) => d.name).join(', ')} and ${made[made.length - 1]!.name}`;
    } else {
      // every place is taken: they move in with another nation of their kind
      target = host!;
      hostNation = h.nations[host!.nation]!;
      const theirs = this.settlements.filter((x) => x.ruined < 0 && x.nation === hostNation!.id);
      let hostPop = 0;
      for (const x of theirs) hostPop += x.pop;
      const near = [...theirs].sort((a, b) => (gp[b.cell * 3]! * gp[host!.cell * 3]! + gp[b.cell * 3 + 1]! * gp[host!.cell * 3 + 1]! + gp[b.cell * 3 + 2]! * gp[host!.cell * 3 + 2]!) - (gp[a.cell * 3]! * gp[host!.cell * 3]! + gp[a.cell * 3 + 1]! * gp[host!.cell * 3 + 1]! + gp[a.cell * 3 + 2]! * gp[host!.cell * 3 + 2]!)).slice(0, 3);
      for (const x of near) x.pop += (people * 0.75) / near.length;
      // what the newcomers know that their hosts do not is learned from them; so many mouths at once strain the country
      const land = new Set(hostNation.land);
      for (let k = 0; k < 3; k++) { const i = borrowable(hostNation.know, n.know, land); if (i >= 0) { hostNation.know.way[i] = wayFor(i, land); hostNation.know.year[i] = year; } }
      hostNation.stability = sat(hostNation.stability - 0.08);
      where = `among the people of ${hostNation.name}, around ${host!.name}`;
      const share = (people * 0.75) / Math.max(1, hostPop + people * 0.75);
      const ev = this.migrationEvent(sim, n, year, why, cause, origin, target, people, from, where, leaving.length, hostNation);
      if (hostNation.culture !== n.culture && share > 0.15) this.mixCulture(sim, rng, hostNation, h.cultures[n.culture]!, share, year, ev);
      if (!peace) this.credit(sim, rng, n, ev, '{name} led them.', 'explorer', year);
      return;
    }
    const ev = this.migrationEvent(sim, n, year, why, cause, origin, target, people, from, where, leaving.length, undefined);
    if (!peace) this.credit(sim, rng, n, ev, '{name} led them.', 'explorer', year);
  }

  /** The chronicle entry for a migration. Returns its event id. */
  private migrationEvent(sim: Simulation, n: Nation, year: number, why: string, cause: number, origin: Settlement, target: Settlement, people: number, from: string, where: string, towns: number, host: Nation | undefined): number {
    const sp = sim.creatures.species[n.species]!;
    const push = why === 'sea' ? `The sea has come up over the fields of ${n.name}.` : why === 'ice' ? `The ice has come down on ${n.name}, and the summers no longer ripen anything.` : `The land of ${n.name} can no longer feed those who live on it.`;
    const count = Math.max(1, Math.round(people));
    const ev = sim.emit({
      type: 'migration', year, cellId: target.cell, title: `The ${n.name} migration`,
      description: `${push} From ${from}${towns > 1 ? ` and ${towns - 1} other ${towns - 1 === 1 ? 'town' : 'towns'}` : ''} some ${count.toLocaleString('en-US')} thousand of ${sp.name} take what they can carry and go. They settle ${where}${host ? ', bringing their speech, their gods and their crafts with them' : ''}.`,
      causes: [cause, n.eventId].filter((x, i, a) => x >= 0 && a.indexOf(x) === i), importance: why === 'famine' ? 1 : 2, speciesIds: [n.species],
      data: host ? { nation: n.id, cause: why, from: origin.cell, to: target.cell, people: count, host: host.id } : { nation: n.id, cause: why, from: origin.cell, to: target.cell, people: count },
    });
    return ev.id;
  }

  /** What a nation's present age is called, in plain words: named for how this nation got there. */
  eraName(n: Nation, era = n.era): string {
    const land = new Set(n.land);
    return eraTitle(era, (slotId) => {
      const i = SLOT_INDEX.get(slotId);
      if (i === undefined) return '';
      const k = n.know.way[i]! >= 0 ? n.know.way[i]! : wayFor(i, land);
      return k >= 0 ? WEB[i]!.ways[k]!.id : '';
    });
  }

  /** The same age in the nation's own tongue: its word for the thing the age is named for, and its word for a span of years. */
  eraOwnName(n: Nation, year = Infinity, era = n.era): string {
    const lang = this.languageOf(n), land = new Set(n.land);
    const i = SLOT_INDEX.get(eraSlot(era));
    let what = ['herd', 'field', 'fire', 'stone', 'sea', 'new', 'fire', 'star', 'moon', 'star'][era] ?? 'new';
    if (i !== undefined) { const k = n.know.way[i]! >= 0 ? n.know.way[i]! : wayFor(i, land); if (k >= 0) what = WEB[i]!.ways[k]!.words[0]; }
    return `${compound(lang, what, undefined, year)} ${capital(word(lang, 'years'))}`;
  }

  languageOf(nation: Nation): Language {
    return this.h.languages[this.h.cultures[nation.culture]!.language]!;
  }

  /** Usual length of life of a species, in years. */
  lifespan(sim: Simulation, species: number): number {
    return 25 + 60 * sim.creatures.species[species]!.ref[G.Lifespan]!;
  }

  private person(rng: RNG, n: Nation, role: Role, year: number, age: number, parent: number, dynasty: number): Person {
    const h = this.h;
    const elder = parent >= 0 ? h.people[parent] : undefined;
    const lean = (inherited: number | undefined): number => sat((inherited ?? rng.next()) * 0.5 + rng.next() * 0.5);
    const p: Person = {
      id: h.people.length, name: personName(this.languageOf(n), hash32(this.seedNum, h.people.length, 0x9e0)), role, nation: n.id, culture: n.culture,
      born: year - age, died: -1, dynasty, parent, bold: lean(elder?.bold), wise: lean(elder?.wise), cruel: lean(elder?.cruel), open: lean(elder?.open),
      events: [], fate: '', reignFrom: role === 'ruler' ? year : -1, reignTo: -1, patron: role === 'ruler' || role === 'founder' ? -1 : n.ruler, rival: -1, rose: year, era: n.era, gen: elder ? (elder.gen ?? 0) + 1 : 0, spouse: -1,
    };
    h.people.push(p);
    if (role !== 'ruler' && role !== 'founder') h.notables.push(p.id);
    return p;
  }

  private dynasty(n: Nation, founder: Person, year: number): Dynasty {
    const h = this.h;
    const d: Dynasty = { id: h.dynasties.length, name: `House of ${founder.name}`, nation: n.id, founder: founder.id, founded: year, ended: -1, rulers: [founder.id], reigns: 1, generations: 1 };
    h.dynasties.push(d);
    founder.dynasty = d.id;
    return d;
  }

  /**
   * Knowledge is lost (system E5). The newest things a nation knows go first. What had been built with them
   * still stands in its towns for a while, as works no one alive can repair or copy.
   */
  private loseKnowledge(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], count: number, year: number, how: string, cause: number): void {
    const known = n.know.way.reduce((a, w) => a + (w >= 0 ? 1 : 0), 0);
    if (known < 4 || count < 1) return;
    const land = new Set(n.land);
    // (the names must be read before the ways are cleared)
    const names: string[] = [];
    const order: number[] = [];
    for (let i = 0; i < WEB.length; i++) if (n.know.way[i]! >= 0) order.push(i);
    order.sort((a, b) => WEB[b]!.level - WEB[a]!.level);
    for (const i of order.slice(0, Math.round(count))) names.push(WEB[i]!.ways[n.know.way[i]!]!.name);
    const cap = this.settlements[n.capital]!;
    const ev = sim.emit({
      type: 'knowledge-lost', year, cellId: cap.cell, title: `Lost knowledge in ${n.name}`,
      description: `${how} ${n.name} no longer knows ${names.length === 1 ? `the secret of ${names[0]}` : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`}. What was made that way still stands, and no one alive can make more.`,
      causes: [cause, n.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [n.species], data: { nation: n.id, lost: names.length },
    });
    this.credit(sim, rng, n, ev.id, how.includes('library') ? '{name}, its keeper, saved what could be carried.' : '{name} wrote down what little was remembered.', 'scholar', year);
    const gone = forget(n.know, count, year, ev.id);
    // the largest towns keep the works: relics of a forgotten technique
    const big = [...towns].sort((a, b) => b.pop - a.pop);
    gone.forEach((slotIndex, k) => { const st = big[k % big.length]; if (st && st.relic < 0) st.relic = slotIndex; });
    n.know.saved = 0;
    n.tech = Math.min(1.2, levelOf(n.know, land));
    n.era = Math.min(n.era, eraOf(n.tech));
  }

  /**
   * Tie a person to an event (system E6): the event names them, and their record lists it. With a role, a new
   * person of that role is made for the occasion (only while people are being recorded one by one); without,
   * the nation's ruler is the one named. `phrase` is a sentence with {name} in it.
   */
  private credit(sim: Simulation, rng: RNG | null, n: Nation, eventId: number, phrase: string, role?: Role, year = sim.simYear): Person | null {
    const ev = eventId >= 0 ? sim.events.events[eventId] : undefined;
    if (!ev) return null;
    let who: Person | undefined;
    if (role) {
      // under a fast-forward only rulers are kept, and no one else is named
      if (!this.fine || !rng) return null;
      who = this.person(rng, n, role, year, this.lifespan(sim, n.species) * (0.28 + rng.next() * 0.35), -1, -1);
    } else who = this.h.people[n.ruler];
    if (!who) return null;
    const said = phrase.replace('{name}', who.name);
    // a "first of its kind" milestone the event set off in the same breath belongs to the same person
    for (let i = ev.id; i < sim.events.events.length; i++) {
      const e = sim.events.events[i]!;
      if (i > ev.id && (e.type !== 'milestone' || !e.causes.includes(ev.id))) continue;
      e.description = `${e.description} ${said}`;
      e.data = { ...(e.data ?? {}), person: who.id, nation: (e.data?.nation as number | undefined) ?? n.id };
      who.events.push(e.id);
    }
    return who;
  }

  /** Someone from a town steps forward at an event there: a teller where a story takes root, a captain on the first ships. */
  private stepForward(sim: Simulation, st: Settlement, at: number, phrase: string, role: Role): void {
    if (st.nation < 0 || sim.events.events.length <= at) return;
    const n = this.h.nations[st.nation];
    if (!n || n.ended >= 0) return;
    this.credit(sim, new RNG(hash32(this.seedNum, at, st.id, 0x9e1) || 1), n, at, phrase, role, sim.simYear);
  }

  /** Whether people are being recorded one by one this tick (false under a fast-forward). */
  private fine = true;

  /** The lives of the people on record who are not rulers run their course. */
  private lives(sim: Simulation, rng: RNG, y: number, year: number): void {
    const h = this.h;
    for (let k = h.notables.length - 1; k >= 0; k--) {
      const p = h.people[h.notables[k]!]!;
      const span = this.lifespan(sim, h.nations[p.nation]!.species);
      const age = year - p.born;
      const old = age > span * 0.75;
      // some callings are more dangerous than others
      const risk = old ? 1 : p.role === 'general' ? 5 : p.role === 'explorer' ? 4 : p.role === 'reformer' ? 2.5 : 1;
      const hazard = 0.006 * risk * Math.exp((age - 0.55 * span) / (0.14 * span));
      if (!rng.chance(1 - Math.exp(-hazard * y))) continue;
      p.died = year;
      p.fate = p.role === 'general' ? (old ? 'died in bed, to the surprise of many' : rng.pick(['fell in battle', 'died of a wound that would not heal', 'was put to death by a jealous ruler']))
        : p.role === 'reformer' ? (old ? 'died old, still arguing' : rng.pick(['was driven out by a crowd', 'walked into the hills and was not seen again', 'died in prison']))
        : p.role === 'teller' ? (old ? 'died old, still telling it' : rng.pick(['died on the road between two towns', 'died of a fever', 'died with the story half told']))
        : p.role === 'explorer' ? (old ? 'died at home, still talking of the sea' : rng.pick(['was lost with all hands', 'died of a fever far from home', 'never came back']))
        : p.role === 'artist' ? (old ? 'died old and famous' : rng.pick(['died poor', 'died young, with the great work unfinished', 'drank to death']))
        : p.role === 'consort' ? (old ? 'died old at court' : rng.pick(['died of a fever', 'died young, far from home', 'died in the same year as the wedding feast was remembered']))
        : p.role === 'claimant' ? (old ? 'died old, never crowned' : rng.pick(['died in exile', 'was killed by order of the crown', 'died a prisoner']))
        : old ? 'died old, still at work' : rng.pick(['died of a fever', 'died in an accident in the workshop', 'died in the night']);
      h.notables.splice(k, 1);
    }
  }

  /** A blow to a nation: remembered for a few generations, and blamed if the nation then breaks. */
  private woe(n: Nation, kind: string, eventId: number, year: number, cost: number): void {
    n.woes.push({ kind, eventId, year });
    if (n.woes.length > 8) n.woes.shift();
    n.stability = sat(n.stability - cost);
  }

  /**
   * Rise and fall (system E4). A nation's stability follows what its people live through: hunger, wealth
   * gathered in few hands, how long its ruling house has held, weariness of war, disasters and plagues,
   * how far its towns have grown apart, and how much land it is trying to hold. When stability fails the nation loses a
   * province, splits in a civil war, or falls apart into successor states. Returns true if the nation has
   * ceased to exist this tick.
   */
  private fate(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], y: number, year: number): boolean {
    const h = this.h, gp = sim.grid.pos;
    const cap = this.settlements[n.capital]!;
    const spacing = Math.sqrt((4 * Math.PI) / sim.regions.count);
    const angle = (a: Settlement, b: Settlement): number => Math.acos(Math.max(-1, Math.min(1, gp[a.cell * 3]! * gp[b.cell * 3]! + gp[a.cell * 3 + 1]! * gp[b.cell * 3 + 1]! + gp[a.cell * 3 + 2]! * gp[b.cell * 3 + 2]!)));
    // ---- what bears on it
    let crowd = 0, far = 0;
    const stories = new Map<number, number>();
    for (const st of towns) {
      crowd += Math.min(2, st.pop / Math.max(0.5, this.capacity(sim, st)));
      stories.set(st.lore, (stories.get(st.lore) ?? 0) + 1);
      // (a town the capital can reach by rail or by wire is not far, however many miles away)
      if (angle(cap, st) > REACH[n.era]! * spacing && !this.wired.has(st.id)) far++;
    }
    const hunger = sat((crowd / towns.length - 0.97) * 5);
    const split = towns.length > 1 ? 1 - Math.max(...stories.values()) / towns.length : 0;
    const overreach = far / towns.length;
    // (a country can be inherited or conquered into a size its age has no means to govern: system E7 makes such unions)
    const size = Math.log2(1 + towns.length) / 7 + 1.2 * sat(towns.length / GOVERNABLE[n.era]! - 1);
    n.inequality = sat(n.inequality + y * 0.00045 * (0.4 + n.tech) * (1 - n.inequality));
    n.fatigue *= Math.exp(-y / 40);
    const house = h.dynasties[n.dynasty], ruler = h.people[n.ruler];
    const legit = house ? sat(house.reigns / 8) : 0;
    while (n.woes.length && year - n.woes[0]!.year > 150) n.woes.shift();
    const target = 0.82 - 0.3 * hunger - 0.36 * n.inequality - 0.28 * n.fatigue - 0.2 * split - 0.3 * overreach - 0.3 * size + 0.12 * legit
      + (ruler ? (ruler.wise - 0.5) * 0.1 - (ruler.cruel - 0.5) * 0.08 : 0);
    n.stability = sat(n.stability + (target - n.stability) * (1 - Math.exp(-y / 25)) + (rng.next() - 0.5) * 0.03 * Math.sqrt(y));
    if (towns.length > n.peakTowns) { n.peakTowns = towns.length; n.peakYear = year; }
    if (towns.length < 3 || n.stability >= 0.3) return false;
    // ---- why, in words and in the cause graph
    const blame: [number, string][] = [
      [hunger * 0.3, 'its granaries were empty'], [n.inequality * 0.36, 'a few families owned almost everything'], [n.fatigue * 0.28, 'its people were sick of war'],
      [split * 0.2, 'its towns no longer felt themselves one people'], [overreach * 0.3, 'its roads were too long to hold'], [size * 0.3, 'it had grown too large to govern'],
      [(1 - legit) * 0.12, 'its ruling house was new and unloved'],
    ];
    for (const w of n.woes) blame.push([0.12, w.kind === 'war' ? 'it had lost too many to war' : w.kind === 'plague' ? 'plague had emptied its streets' : w.kind === 'disaster' ? 'the land itself had turned on it' : 'the succession was disputed']);
    const seen = new Set<string>();
    const reasons = blame.sort((a, b) => b[0] - a[0]).filter(([m, text]) => m > 0.04 && !seen.has(text) && !!seen.add(text)).slice(0, 3).map(([, text]) => text);
    const because = reasons.length > 1 ? `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}` : reasons[0] ?? 'no one would fight for it';
    const causes = [...new Set(n.woes.map((w) => w.eventId).filter((x) => x >= 0))];
    const others = towns.filter((st) => st.id !== cap.id).sort((a, b) => angle(cap, b) - angle(cap, a));
    // ---- collapse: the whole nation comes apart into successor states and its capital goes dark
    if (n.stability < 0.12 && towns.length >= 5 && rng.chance(1 - Math.exp(-y / 25))) {
      const ev = sim.emit({
        type: 'nation-collapse', year, cellId: cap.cell, title: `The fall of ${n.name}`,
        description: `${n.name} is gone. At its height it held ${n.peakTowns} towns; ${because}. ${cap.name} is half empty, and every province looks to itself.`,
        causes: [n.eventId, ...causes].filter((x) => x >= 0), importance: 2, speciesIds: [n.species], data: { nation: n.id, towns: towns.length },
      });
      this.credit(sim, rng, n, ev.id, '{name} was the last to rule it.');
      if (n.golden) this.endGolden(sim, n, year, 'the country itself came apart', ev.id);
      cap.pop *= 0.45;
      // the largest towns that stand well apart each become the seat of a successor
      const seats: Settlement[] = [];
      for (const st of [...towns].sort((a, b) => b.pop - a.pop)) { if (seats.length < 6 && seats.every((s) => angle(s, st) > 1.6 * spacing)) seats.push(st); }
      const heirs = seats.map((seat) => this.newNation(sim, rng, seat, year, n, 'successor', [ev.id]));
      for (const st of towns) {
        let best = 0, bd = Infinity;
        for (let k = 0; k < seats.length; k++) { const d = angle(seats[k]!, st); if (d < bd) { bd = d; best = k; } }
        st.nation = heirs[best]!.id; st.pop *= 0.85;
        sim.cellLog.note(st.cell, year, Log.Owner, heirs[best]!.id);
      }
      for (const heir of heirs) {
        heir.stability = 0.55; heir.inequality = n.inequality * 0.4;
        // the schools and workshops of the old country served all of it: each piece keeps less than the whole knew
        const mine = towns.filter((st) => st.nation === heir.id);
        const known = heir.know.way.reduce((a, w) => a + (w >= 0 ? 1 : 0), 0);
        this.loseKnowledge(sim, rng, heir, mine, known * (0.08 + 0.2 * rng.next()), year, `When ${n.name} fell its craftsmen scattered.`, ev.id);
      }
      this.closeNation(n, year, 'fell apart');
      return true;
    }
    // ---- civil war: a rival court in the second city, and the country divides between them
    if (n.stability < 0.2 && towns.length >= 4 && rng.chance(1 - Math.exp(-y / 40))) {
      const rival = [...others].sort((a, b) => b.pop - a.pop).find((st) => angle(cap, st) > 1.2 * spacing) ?? others[0]!;
      const ev = sim.emit({
        type: 'civil-war', year, cellId: rival.cell, title: `Civil war in ${n.name}`,
        description: `${rival.name} has raised its own ruler against ${cap.name}: ${because}. Towns choose a side, or have one chosen for them.`,
        causes: [n.eventId, ...causes].filter((x) => x >= 0), importance: 2, speciesIds: [n.species], data: { nation: n.id },
      });
      const other = this.newNation(sim, rng, rival, year, n, 'breakaway', [ev.id]);
      {
        const claimant = h.people[other.ruler]!, crowned = h.people[n.ruler];
        ev.description += ` ${claimant.name} claims the country${crowned ? ` against ${crowned.name}` : ''}.`;
        ev.data = { ...ev.data, person: claimant.id };
        claimant.events.push(ev.id);
        if (crowned) { claimant.rival = crowned.id; crowned.rival = claimant.id; crowned.events.push(ev.id); }
      }
      for (const st of others) {
        st.pop *= 0.8;
        if (st.id !== rival.id && angle(rival, st) < angle(cap, st)) { st.nation = other.id; sim.cellLog.note(st.cell, year, Log.Owner, other.id); }
      }
      cap.pop *= 0.8;
      n.fatigue = sat(n.fatigue + 0.4); other.fatigue = 0.4;
      n.stability = 0.5; other.stability = 0.5; n.inequality *= 0.6;
      this.woe(n, 'war', ev.id, year, 0);
      return false;
    }
    // ---- secession: the furthest province goes its own way
    if (rng.chance(1 - Math.exp(-y / 60))) {
      const seed = others[0]!;
      const ev = sim.emit({
        type: 'secession', year, cellId: seed.cell, title: `${seed.name} breaks away from ${n.name}`,
        description: `The far province around ${seed.name} has stopped sending its taxes and its sons: ${because}.`,
        causes: [n.eventId, ...causes].filter((x) => x >= 0), importance: 1, speciesIds: [n.species], data: { nation: n.id },
      });
      const other = this.newNation(sim, rng, seed, year, n, 'breakaway', [ev.id]);
      { const leader = h.people[other.ruler]!; ev.description += ` ${leader.name} leads them.`; ev.data = { ...ev.data, person: leader.id }; leader.events.push(ev.id); }
      let taken = 1;
      for (const st of others) {
        if (st.id === seed.id || taken >= towns.length / 2) continue;
        if (angle(seed, st) < 2.2 * spacing && angle(seed, st) < angle(cap, st)) { st.nation = other.id; sim.cellLog.note(st.cell, year, Log.Owner, other.id); taken++; }
      }
      n.stability = sat(n.stability + 0.2); n.inequality *= 0.85;
      return false;
    }
    return false;
  }

  /** What a nation's land offers, from the places its towns stand on. */
  private survey(sim: Simulation, n: Nation, towns: Settlement[]): Land[] {
    const w = sim.world, reg = sim.regions, g = reg.grid;
    const has = new Set<Land>();
    for (const st of towns) {
      const r = st.region;
      if (reg.land[r]! < 0.97) has.add('coast');
      for (let j = 0; j < g.ncount[r]!; j++) if (reg.land[g.neighbors[r * 6 + j]!]! < 0.5) has.add('coast');
      if (w.flow[st.cell]! > 3) has.add('river');
      if (w.canopy[st.cell]! > 0.25 || w.vegetation[st.cell]! > 0.6) has.add('forest');
      if (w.moisture[st.cell]! < 0.3) has.add('sand');
      if (reg.landTemp[r]! < 2) has.add('cold');
      // ore and coal lie where they lie: fixed for each region by the seed, likelier under high ground
      const high = w.elevation[st.cell]! - w.seaLevel > 0.8;
      if ((hash32(this.seedNum, r, 0x0e) % 1000) / 1000 < (high ? 0.55 : 0.14)) has.add('ore');
      if ((hash32(this.seedNum, r, 0xc0a1) % 1000) / 1000 < 0.2) has.add('coal');
    }
    if (has.has('coast')) has.add('sand');
    if (sim.creatures.species.some((s) => s.tamedBy === n.species && s.extinctYear < 0)) has.add('beasts');
    return [...has].sort();
  }

  /**
   * Who a nation is in touch with: nations whose towns stand next to its own, and, once it builds ships,
   * nations on other coasts within the range of its ships.
   */
  private contactsOf(sim: Simulation, n: Nation, towns: Settlement[]): number[] {
    const reg = sim.regions, g = reg.grid, h = this.h, gp = sim.grid.pos;
    const out = new Set<number>();
    const way = this.contactWay;
    way.clear();
    for (const st of towns) {
      for (let j = 0; j < g.ncount[st.region]!; j++) {
        const oid = this.occupied.get(g.neighbors[st.region * 6 + j]!);
        if (oid === undefined) continue;
        const o = this.settlements[oid]!;
        if (o.nation >= 0 && o.nation !== n.id) { out.add(o.nation); way.set(o.nation, 0); }
      }
    }
    // by sea: rafts keep to the shore, keeled ships cross a strait, ocean ships and engine ships reach anywhere
    const knows = (id: string) => n.know.way[SLOT_INDEX.get(id)!]! >= 0;
    const range = knows('steamship') ? 4 : knows('ship2') ? 1.7 : knows('ship1') ? 0.55 : knows('sail') ? 0.25 : 0;
    if (range > 0 && n.land.includes('coast')) {
      const cap = this.settlements[n.capital]!;
      for (const o of h.nations) {
        if (o.id === n.id || o.ended >= 0 || !o.land.includes('coast')) continue;
        const oc = this.settlements[o.capital]!;
        const cos = gp[cap.cell * 3]! * gp[oc.cell * 3]! + gp[cap.cell * 3 + 1]! * gp[oc.cell * 3 + 1]! + gp[cap.cell * 3 + 2]! * gp[oc.cell * 3 + 2]!;
        if (Math.acos(Math.max(-1, Math.min(1, cos))) < range) { out.add(o.id); if (!way.has(o.id)) way.set(o.id, 1); }
      }
    }
    // from the Age of Signals word travels without ships or roads
    if (n.era >= 7) for (const o of h.nations) if (o.id !== n.id && o.ended < 0 && o.era >= 7) { out.add(o.id); if (!way.has(o.id)) way.set(o.id, 2); }
    return [...out].sort((a, b) => a - b);
  }

  /**
   * Where a boat that puts out from region `from` across the water at `first` makes land: a free region on
   * the far shore, within the reach of the nation's ships, or -1. It holds its heading away from home.
   */
  private voyage(sim: Simulation, n: Nation, from: number, first: number): number {
    const reg = sim.regions, g = reg.grid, p = g.pos;
    const knows = (id: string) => n.know.way[SLOT_INDEX.get(id)!]! >= 0;
    const spacing = Math.sqrt((4 * Math.PI) / reg.count);
    // rafts cross a strait, sails a narrow sea, keeled ships a wide one, ocean ships and engine ships any water
    const range = knows('steamship') ? 4 : knows('ship2') ? 1.7 : knows('ship1') ? Math.max(0.55, 5 * spacing) : knows('sail') ? 3 * spacing : knows('boat') ? 1.6 * spacing : 0;
    if (range <= 0) return -1;
    const ox = p[from * 3]!, oy = p[from * 3 + 1]!, oz = p[from * 3 + 2]!;
    let cur = first;
    for (let hop = 0; hop < 400; hop++) {
      if (reg.land[cur]! > 0.3) return this.occupied.has(cur) || reg.ice[cur]! >= 0.5 ? -1 : cur;
      let best = -1, bd = p[cur * 3]! * ox + p[cur * 3 + 1]! * oy + p[cur * 3 + 2]! * oz;
      for (let k = 0; k < g.ncount[cur]!; k++) {
        const nb = g.neighbors[cur * 6 + k]!;
        const d = p[nb * 3]! * ox + p[nb * 3 + 1]! * oy + p[nb * 3 + 2]! * oz;
        if (d < bd) { bd = d; best = nb; }
      }
      if (best < 0 || Math.acos(Math.max(-1, Math.min(1, bd))) > range) return -1;
      cur = best;
    }
    return -1;
  }

  /**
   * The long peace begins. A history cannot be made for ever: sooner or later a people either leaves, or has
   * all it wants, or has simply lived one way for so long that nothing changes. From then on its nations and
   * towns stay as they are, lit and lived in, until the planet itself disturbs them. `why` is 'stayed' (those
   * left behind after a departure), 'summit' (at the top of knowledge) or 'custom' (unchanged for too long).
   */
  private settle(sim: Simulation, year: number, why: string): void {
    const h = this.h;
    h.peace = year;
    let pop = 0;
    for (const st of this.settlements) if (st.ruined < 0 && st.nation >= 0) pop += st.pop;
    h.peacePop = pop;
    const lead = this.leadTown();
    const n = lead ? h.nations[lead.nation] : undefined;
    const sp = sim.creatures.species[n ? n.species : this.sapient[0]!];
    const who = sp ? sp.name : 'this people';
    const ev = sim.emit({
      type: 'long-peace', year, cellId: lead ? lead.cell : -1, title: 'The long peace',
      description: why === 'stayed'
        ? `Not everyone left. Those of ${who} who stayed keep the old cities lit and the fields in order, and want for nothing. Nothing in their world is new any more, and no one counts the years by kings.`
        : why === 'summit'
          ? `There is nothing left that ${who} wants and cannot make. The quarrels of its nations fade into custom, its ruling houses into ceremony. Its cities will shine like this for as long as the planet lets them.`
          : `${n ? `The people of ${n.name}` : who} have lived the same way for longer than any of them can reckon, and no longer expect anything else. From here their story is one of seasons, not of kings.`,
      causes: [n ? n.eventId : -1].filter((x) => x >= 0), importance: 3, speciesIds: sp ? [sp.id] : [], data: { why },
    });
    if (n) this.credit(sim, null, n, ev.id, 'The last ruler anyone troubled to remember was {name}.');
    // and the last great work of the old kind (system E19): a hall for the peace itself
    if (n && lead && ev.id >= 0 && n.era >= 2) this.raise(sim, null, n, lead, 'peace-hall', ev.id, `${compound(this.languageOf(n), 'hold', 'great', year)}, the hall of the long peace`, 'a domed hall open to anyone',
      'It was raised when the quarrels of the nations faded into custom, and it belongs to none of them.',
      `At ${lead.name} they raise a hall under a single dome, with a door on every side and no throne in it. It belongs to no country. Anyone may come in.`, year);
    // the records of rulers close: from here no one keeps them
    for (const x of h.nations) {
      if (x.ended >= 0) continue;
      if (x.golden) this.endGolden(sim, x, year, 'nothing in it was new any more, and it faded into custom', ev.id);
      const ruler = h.people[x.ruler], house = h.dynasties[x.dynasty];
      if (ruler && ruler.died < 0) { ruler.died = year; ruler.reignTo = year; ruler.fate = 'was the last ruler whose name was kept'; }
      if (house && house.ended < 0) house.ended = year;
      x.government = 'custom'; x.stability = 1; x.fatigue = 0; x.woes.length = 0;
    }
  }

  /** One tick of the long peace: towns live on, spread slowly and can still be lost to the planet; nothing else changes. */
  private peaceTick(sim: Simulation, rng: RNG, members: Map<number, Settlement[]>, y: number, year: number): void {
    const h = this.h, reg = sim.regions;
    let pop = 0, cause = -1;
    for (const n of h.nations) {
      if (n.ended >= 0) continue;
      const towns = members.get(n.id);
      if (!towns || !towns.length) { this.endNation(sim, n, year); continue; }
      if (n.woes.length) { cause = n.woes[n.woes.length - 1]!.eventId; n.woes.length = 0; }
      this.exodus(sim, rng, n, towns, year);
      let sum = 0, big = towns[0]!;
      for (const st of towns) {
        const sp = sim.creatures.species[st.species]!;
        if (this.failed(sim, st, sp.extinctYear >= 0)) { this.abandon(sim, st, year); continue; }
        const room = this.capacity(sim, st) * 0.6;
        st.pop += (room - st.pop) * (1 - Math.exp(-y / 300));
        sum += st.pop;
        if (st.pop > big.pop) big = st;
        // the land fills slowly: a new town now and then, by land or across the water, under the same custom
        if (st.pop > room * 0.8 && rng.chance(Math.min(0.3, 0.0003 * y))) {
          let nb = reg.grid.neighbors[st.region * 6 + rng.int(reg.grid.ncount[st.region]!)]!;
          let bySea = false;
          if (reg.land[nb]! <= 0.3) { nb = this.voyage(sim, n, st.region, nb); bySea = true; }
          if (nb >= 0 && !this.occupied.has(nb) && reg.land[nb]! > 0.3 && reg.ice[nb]! < 0.5) {
            const d = this.found(sim, rng, st.species, nb, st.id, year);
            if (d) { d.tech = st.tech; d.lore = st.lore; d.farms = true; d.nation = n.id; d.pop = Math.max(d.pop, st.pop * 0.1); if (bySea) d.overseas = true; sim.cellLog.note(d.cell, year, Log.Owner, n.id); }
          }
        }
      }
      n.pop = sum; n.towns = towns.length;
      const seat = this.settlements[n.capital];
      if (!seat || seat.ruined >= 0 || seat.nation !== n.id) n.capital = big.id;
      pop += sum;
    }
    if (pop > (h.peacePop ?? 0)) h.peacePop = pop;
    // the planet breaks the peace: when most of the people are gone, the survivors have to begin again
    if (pop > 0 && pop < 0.3 * (h.peacePop ?? 0)) this.unsettle(sim, rng, year, cause);
  }

  /** The long peace is broken by a catastrophe: much is forgotten, rulers are needed again, and history resumes. */
  private unsettle(sim: Simulation, rng: RNG, year: number, cause: number): void {
    const h = this.h;
    h.peace = -1; h.since = year; h.topSince = -1;
    const lead = this.leadTown();
    const because = cause >= 0 && sim.events.events[cause] ? sim.events.events[cause]!.title : '';
    const ev = sim.emit({
      type: 'peace-broken', year, cellId: lead ? lead.cell : -1, title: 'The long peace ends',
      description: `${because ? `After ${because.charAt(0).toLowerCase()}${because.slice(1)}, m` : 'M'}ost of the people are gone, and with them most of what was known. The survivors need leaders again, and granaries, and walls. Their years are worth counting once more.`,
      causes: [cause].filter((x) => x >= 0), importance: 3, speciesIds: lead ? [lead.species] : [], data: {},
    });
    for (const n of h.nations) {
      if (n.ended >= 0) continue;
      const land = new Set(n.land);
      const keep = FARMING + (n.tech - FARMING) * 0.5;
      for (let i = 0; i < WEB.length; i++) if (n.know.way[i]! >= 0 && WEB[i]!.level > keep) { n.know.way[i] = -1; n.know.lost[i] = year; n.know.lostEvent[i] = ev.id; }
      n.know.saved = 0;
      n.tech = Math.max(FARMING, levelOf(n.know, land)); n.era = eraOf(n.tech); n.stability = 0.5;
      this.enthrone(sim, rng, n, year);
      for (const st of this.settlements) if (st.ruined < 0 && st.nation === n.id) st.tech = Math.min(st.tech, n.tech);
    }
    h.topEra = h.nations.reduce((m, n) => (n.ended < 0 ? Math.max(m, n.era) : m), 0);
    this.credit(sim, null, h.nations[lead ? lead.nation : 0]!, ev.id, 'The first to be followed was {name}.');
  }

  /** How each nation in the last list of contacts was reached: 0 across a border, 1 by sea, 2 by signal. */
  private contactWay = new Map<number, number>();

  /** Nations meeting for the first time (system E6: the explorers who found the way are remembered). */
  private meetings(sim: Simulation, rng: RNG, n: Nation, year: number): void {
    const h = this.h;
    const met = (n.met ??= []);
    for (const id of n.contacts) {
      if (met.includes(id)) continue;
      met.push(id);
      const o = h.nations[id]!;
      const theirs = (o.met ??= []);
      if (theirs.includes(n.id)) continue;
      theirs.push(n.id);
      const way = this.contactWay.get(id) ?? 0;
      const cap = this.settlements[n.capital]!, far = this.settlements[o.capital]!;
      const apart = Math.abs(n.era - o.era);
      const ahead = n.era > o.era ? n : o, behind = n.era > o.era ? o : n;
      const ev = sim.emit({
        type: 'contact', year, cellId: far.cell, title: `${n.name} meets ${o.name}`,
        description: (way === 1
          ? `A ship out of ${cap.name} makes land on a shore where the fires are not its own people's. The country is ${o.name}.`
          : way === 2
            ? `A voice from ${o.name} is heard in ${cap.name}, carried on nothing but air. Until now neither country knew the other was there.`
            : `Travellers from ${n.name} come over the last hill and find tilled fields that are not theirs. The country is ${o.name}.`)
          + (apart >= 2 ? ` ${ahead.name} is in its ${this.eraName(ahead)}; ${behind.name} is still in its ${this.eraName(behind)}, and has never seen such things.` : ''),
        causes: [n.eventId, o.eventId].filter((x) => x >= 0), importance: apart >= 2 || way === 1 ? 1 : 0, speciesIds: n.species === o.species ? [n.species] : [n.species, o.species], data: { nation: n.id, other: o.id, way },
      });
      // a crossing or a meeting of unequal peoples makes a name; a meeting at a border is only dated by who ruled
      const who = way === 0 && apart < 2 ? (this.credit(sim, null, n, ev.id, 'It was in the reign of {name}.'), null)
        : this.credit(sim, rng, n, ev.id, way === 2 ? 'The one listening that night was {name}.' : '{name} led the way, and came home to tell of it.', way === 2 ? 'scholar' : 'explorer', year);
      // what a traveller brings home is worth a little study: a bold one brings back more
      n.know.saved += 0.002 + (who ? 0.003 * who.bold : 0);
    }
  }

  /**
   * In hard years someone walks from town to town saying what went wrong and what should change (system E6).
   * What comes of it depends on who rules.
   */
  private reformer(sim: Simulation, rng: RNG, n: Nation, year: number): void {
    const h = this.h;
    const woe = n.woes[n.woes.length - 1];
    if (!woe || h.notables.some((id) => h.people[id]!.role === 'reformer' && h.people[id]!.nation === n.id)) return;
    const ruler = h.people[n.ruler];
    const cap = this.settlements[n.capital]!;
    const who = this.person(rng, n, 'reformer', year, this.lifespan(sim, n.species) * (0.25 + rng.next() * 0.3), -1, -1);
    const after = woe.kind === 'plague' ? 'After the plague' : woe.kind === 'war' ? 'After the war' : woe.kind === 'disaster' ? 'After the disaster' : 'In the quarrel over who should rule';
    const says = woe.kind === 'plague' ? rng.pick(['that the rich fled and left the poor to nurse the sick', 'that the dead are owed more than a pit', 'that the sickness came by the wells, and the wells must be kept clean'])
      : woe.kind === 'war' ? rng.pick(['that no more children should be sent to the wars', 'that the dead of both sides lie in the same ground', 'that the war was lost by those who ordered it'])
        : woe.kind === 'disaster' ? rng.pick(['that the town should never have been built where it was', 'that what fell was built too quickly and too cheaply', 'that it will come again, and next time they must be ready'])
          : rng.pick(['that no house rules by right', 'that the crown belongs to whoever is just', 'that rulers answer to the ruled']);
    let end: string;
    if (ruler && ruler.cruel > 0.62 && ruler.open < 0.6) {
      who.died = year; who.fate = `was put to death by ${ruler.name}`;
      h.notables.splice(h.notables.indexOf(who.id), 1);
      n.stability = sat(n.stability - 0.06);
      end = `${ruler.name} has ${who.name} put to death, and the words spread the faster for it.`;
    } else if (ruler && ruler.open > 0.55) {
      n.stability = sat(n.stability + 0.08);
      end = `${ruler.name} sends for ${who.name} and listens, and the country is quieter for it.`;
    } else {
      n.stability = sat(n.stability - 0.03); n.inequality = sat(n.inequality - 0.05);
      end = `The poor follow ${who.name}; the court does not, and the granaries are opened to keep the peace.`;
    }
    const ev = sim.emit({
      type: 'reformer', year, cellId: cap.cell, title: `${who.name} speaks out in ${n.name}`,
      description: `${after}, ${who.name} walks from town to town in ${n.name} saying ${says}. ${end}`,
      causes: [woe.eventId, n.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [n.species], data: { nation: n.id, person: who.id },
    });
    who.events.push(ev.id);
    if (ruler && who.died >= 0) who.rival = ruler.id;
  }

  /** The chief town of the most advanced living nation of history, if there is one. */
  private leadTown(): Settlement | undefined {
    let best: Nation | undefined;
    for (const n of this.h.nations) if (n.ended < 0 && (!best || n.tech > best.tech)) best = n;
    return best ? this.settlements[best.capital] : undefined;
  }

  /** How a culture and its ruler lean among the fields of knowledge. */
  private leaning(n: Nation): Leaning {
    const c = this.h.cultures[n.culture]!, r = this.h.people[n.ruler];
    return {
      war: 0.55 + 0.9 * c.war + (r ? r.bold * 0.3 : 0), trade: 0.6 + 0.9 * c.trade, craft: 0.7 + 0.6 * c.craft, mind: 0.7 + 0.5 * c.craft + (r ? r.wise * 0.3 : 0),
      life: 0.8 + 0.4 * c.custom, sea: 0.7 + 0.6 * c.trade, sky: 0.75 + 0.5 * c.craft, build: 0.8 + 0.4 * c.custom, food: 1, power: 1,
    };
  }

  /**
   * Research (the tech web, system E1). `gain` is how much the level of knowledge would have risen in a
   * world where knowledge was one number; it is saved up and spent on discoveries, one need at a time.
   */
  private research(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], gain: number, year: number, y: number): void {
    const h = this.h;
    if (year - n.surveyed > 60) { n.land = this.survey(sim, n, towns); n.contacts = this.contactsOf(sim, n, towns); n.surveyed = year; this.meetings(sim, rng, n, year); }
    const land = new Set(n.land);
    let possible = 0;
    for (let i = 0; i < WEB.length; i++) if (wayFor(i, land) >= 0) possible++;
    const each = (1.2 - FARMING) / Math.max(1, possible);
    n.know.saved += gain / each;
    // ---- learning from neighbours (system E3): what a nation in contact already knows is far cheaper to take up than
    // to discover, so neighbours and trading partners keep pace while a people alone on an island falls ages behind
    {
      // one teacher at a time: the most knowledgeable nation it is in touch with
      let other: Nation | undefined;
      for (const id of n.contacts) { const o = h.nations[id]; if (o && o.ended < 0 && o.tech > n.tech + 0.004 && (!other || o.tech > other.tech)) other = o; }
      // about one thing learned every century and a half (a lifetime or two in the Age of Signals), sooner for a trading
      // people: enough to keep neighbours within sight of each other, not enough to keep them level
      const culture = h.cultures[n.culture]!;
      const every = other && n.era >= 7 && other.era >= 7 ? 70 : 150;
      if (other && rng.chance(1 - Math.exp(-y * (0.6 + 0.8 * culture.trade) / every))) {
        const i = borrowable(n.know, other.know, land);
        if (i >= 0) {
          n.know.way[i] = wayFor(i, land); n.know.year[i] = year;
          n.know.saved = Math.max(-1, n.know.saved - 0.3 * WEB[i]!.ways[n.know.way[i]!]!.cost);
          n.borrowed = (n.borrowed ?? 0) + 1;
        }
      }
    }
    for (let made = 0; made < 8; made++) {
      const i = chooseNext(n.know, land, this.leaning(n), rng);
      if (i < 0) { n.know.saved = Math.min(n.know.saved, 2); break; }
      const k = wayFor(i, land), slot = WEB[i]!, way = slot.ways[k]!;
      // what was once known comes back sooner: the old works still stand to be studied, and more so where one stands in its own towns
      const relicHere = n.know.lost[i]! > 0 && towns.some((st) => st.relic === i);
      const cost = way.cost * (n.know.lost[i]! > 0 ? (relicHere ? 0.3 : 0.55) : 1);
      if (n.know.saved < cost) break;
      n.know.saved -= cost;
      n.know.way[i] = k; n.know.year[i] = year;
      if (n.know.lost[i]! > 0) {
        const gone = Math.round(year - n.know.lost[i]!);
        const capTown = this.settlements[n.capital]!;
        sim.emit({
          type: 'knowledge-regained', year, cellId: capTown.cell, title: `${capital(way.name)} found again`,
          description: `${n.name} can make ${way.name} once more, ${gone.toLocaleString('en-US')} years after the knowledge was lost${relicHere ? `. They learned it from what the old builders left standing in ${towns.find((st) => st.relic === i)!.name}` : ''}.`,
          causes: [n.know.lostEvent[i]!, n.eventId].filter((x) => x >= 0), importance: slot.key || gone > 300 ? 1 : 0, speciesIds: [n.species], data: { nation: n.id, slot: slot.id, years: gone },
        });
        n.know.lost[i] = 0;
        for (const st of towns) if (st.relic === i) st.relic = -1;
        if (sim.events.events.length && sim.events.events[sim.events.events.length - 1]!.type === 'knowledge-regained') this.credit(sim, rng, n, sim.events.events.length - 1, 'The one who worked it out was {name}.', 'scholar', year);
        continue;
      }
      const first = !h.firsts[i];
      if (first) h.firsts[i] = 1;
      // the chronicle tells of turning points, the first time anyone reaches them; every discovery is kept in the nation's own record
      if (slot.key && first) {
        const lang = this.languageOf(n), cap = this.settlements[n.capital]!;
        const own = compound(lang, way.words[0], way.words[1], year);
        const inventor = y <= SUMMARY_YEARS ? this.person(rng, n, 'inventor', year, this.lifespan(sim, n.species) * (0.3 + rng.next() * 0.3), -1, -1) : null;
        const ev = sim.emit({
          type: 'invention', year, cellId: cap.cell, title: `${capital(way.name)}`,
          description: inventor
            ? `In ${cap.name}, ${inventor.name} of ${n.name} has made ${way.name} work. Their word for it is ${own.toLowerCase()}. ${slot.ways.length > 1 && k > 0 ? `Their land gave them no ${slot.ways[0]!.land === 'ore' ? 'ore' : 'easier way'}, so they found this one.` : 'No one anywhere had it before.'}`
            : `${n.name} has ${way.name} now. Their word for it is ${own.toLowerCase()}.`,
          causes: [n.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [n.species], data: inventor ? { nation: n.id, slot: slot.id, way: way.id, person: inventor.id } : { nation: n.id, slot: slot.id, way: way.id },
        });
        if (inventor) inventor.events.push(ev.id);
      }
    }
    n.tech = Math.min(1.2, levelOf(n.know, land));
  }

  /**
   * Many years pass in one tick (a fast-forward). Rulers come and go faster than a tick, so they are not
   * recorded one by one: the house counts its reigns, the ruler of the day is replaced in the same record,
   * and a house that falls gives its record to the next. History then costs the same memory however long it runs.
   */
  private reignsPass(sim: Simulation, rng: RNG, n: Nation, y: number, year: number): void {
    const h = this.h;
    const span = this.lifespan(sim, n.species);
    const reigns = Math.max(0, Math.floor(y / (0.34 * span) + rng.next()));
    if (!reigns) return;
    const ruler = h.people[n.ruler]!, house = h.dynasties[n.dynasty];
    const lang = this.languageOf(n);
    ruler.name = personName(lang, hash32(this.seedNum, n.id, Math.floor(year), 0x9e0));
    ruler.born = year - span * (0.3 + rng.next() * 0.3); ruler.reignFrom = year - rng.next() * 0.3 * span;
    ruler.bold = rng.next(); ruler.wise = rng.next(); ruler.cruel = rng.next(); ruler.open = rng.next();
    ruler.events.length = 0; ruler.parent = -1; ruler.role = 'ruler';
    if (!house) return;
    const heir = 0.84 + 0.14 * n.stability;
    if (rng.chance(1 - Math.pow(heir, reigns))) {
      const old = house.reigns + Math.floor(rng.next() * reigns);
      this.woe(n, 'succession', -1, year, 0.16);
      if (old >= 12) {
        const cap = this.settlements[n.capital]!;
        sim.emit({ type: 'dynasty', year, cellId: cap.cell, title: `A new house in ${n.name}`, description: `The ${house.name} is over after ${old} reigns. ${ruler.name} holds ${cap.name} now.`, causes: [n.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [n.species], data: { nation: n.id } });
      }
      house.name = `House of ${ruler.name}`; house.founded = year; house.reigns = 1; house.generations = 1; house.rulers = [ruler.id]; house.founder = ruler.id;
    } else { house.reigns += reigns; house.generations = (house.generations ?? 1) + Math.round(reigns * 0.8); }
  }

  /**
   * Golden ages (system E10). A country that is steady, well fed, of some size and in touch with at least two
   * others may enter a golden age: knowledge comes faster, great works are raised in its towns, and its people
   * give the years a name. Wealth gathers in few hands while it lasts, and it ends when war, plague, disaster or
   * a disputed succession reaches it, when the country grows unsteady, when its partners are gone, or when too
   * few own too much. The end is an event caused by whatever ended it.
   */
  private flourish(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], y: number, year: number): void {
    const h = this.h;
    let partners = 0;
    for (const id of n.contacts) if (h.nations[id] && h.nations[id]!.ended < 0) partners++;
    const woe = n.woes.length ? n.woes[n.woes.length - 1]! : undefined;
    const cap = this.settlements[n.capital]!;
    const g = n.golden;
    if (!g) {
      if (towns.length < 4 || n.era < 2 || n.stability < 0.64 || partners < 2 || (woe && year - woe.year < 30) || year - (n.goldenEnded ?? -1e9) < 250) return;
      let full = 0;
      for (const st of towns) full += Math.min(1, st.pop / Math.max(0.5, this.capacity(sim, st)));
      if (full / towns.length < 0.7 || !rng.chance(1 - Math.exp(-y / 80))) return;
      const lang = this.languageOf(n);
      // what they will call these years: two meanings in their own tongue, different for each country and each time
      const [head, modifier, gloss] = GOLDEN_NAMES[hash32(this.seedNum, n.id, Math.floor(year), 0x901d) % GOLDEN_NAMES.length]!;
      const own = `the ${compound(lang, head, modifier, year)}`;
      const house = h.dynasties[n.dynasty];
      const friends = (n.allies ?? []).filter((a) => a.until > year && a.eventId >= 0).map((a) => a.eventId);
      const settled = house && house.reigns >= 3 ? h.people[house.founder]?.events[0] ?? -1 : -1;
      const ev = sim.emit({
        type: 'golden-age', year, cellId: cap.cell, title: `The golden age of ${n.name}`,
        description: `${n.name} is at peace, its granaries are full, and its traders reach ${partners} other ${partners === 1 ? 'country' : 'countries'}. The workshops and schools of ${cap.name} are crowded and its builders are never without work. Its people will remember these years as ${own}, ${gloss}.`,
        causes: [n.eventId, settled, ...friends.slice(-2)].filter((x, i, a) => x >= 0 && sim.events.events[x] && a.indexOf(x) === i), importance: 2, speciesIds: [n.species], data: { nation: n.id, own, gloss },
      });
      n.golden = { since: year, eventId: ev.id, own, works: 0 };
      this.credit(sim, rng, n, ev.id, 'It begins in the reign of {name}.');
      return;
    }
    // while it lasts: wealth gathers, and great works go up
    n.inequality = sat(n.inequality + y * 0.0007 * (1 - n.inequality));
    if (rng.chance(1 - Math.exp(-y / 30))) {
      const site = towns[rng.int(Math.min(towns.length, 3))] ?? cap;
      site.monuments = (site.monuments ?? 0) + 1;
      g.works++;
      const what = rng.pick(['a great hall', 'a library', 'a hall with a roof no one thought could stand', 'a bridge of a hundred arches', 'a tower to watch the stars from', 'a theatre cut into the hill', 'gardens watered from the mountains', 'a harbour wall a mile long']);
      const at = sim.emit({
        type: 'monument', year, cellId: site.cell, title: `${capital(what)} at ${site.name}`,
        description: `In ${g.own}, ${n.name} raises ${what} at ${site.name}.`,
        causes: [g.eventId].filter((x) => x >= 0), importance: g.works === 1 ? 1 : 0, speciesIds: [n.species], data: { nation: n.id, settlement: site.id },
      });
      this.credit(sim, rng, n, at.id, 'It is the work of {name}.', 'artist', year);
    }
    // how it ends
    const struck = woe && woe.year > g.since && year - woe.year < 12 ? woe : undefined;
    const reason = struck ? (struck.kind === 'war' ? 'war reached it' : struck.kind === 'plague' ? 'plague emptied its workshops' : struck.kind === 'disaster' ? 'the land itself turned on it' : 'its ruling house was shaken')
      : n.stability < 0.45 ? 'the country had grown unsteady' : partners === 0 ? 'its trading partners were gone' : n.inequality > 0.82 ? 'its wealth had gathered in too few hands' : towns.length < 3 ? 'too little of the country was left' : '';
    if (reason) this.endGolden(sim, n, year, reason, struck ? struck.eventId : -1);
  }

  /** A golden age is over: the chronicle says how long it lasted, what it left and what ended it. */
  private endGolden(sim: Simulation, n: Nation, year: number, reason: string, cause: number): void {
    const g = n.golden;
    if (!g) return;
    n.golden = undefined;
    n.goldenEnded = year;
    const cap = this.settlements[n.capital];
    const lasted = Math.max(1, Math.round(year - g.since));
    const ev = sim.emit({
      type: 'golden-age-end', year, cellId: cap ? cap.cell : -1, title: `The end of ${g.own}`,
      description: `After ${lasted.toLocaleString('en-US')} ${lasted === 1 ? 'year' : 'years'}, the golden age of ${n.name} is over: ${reason}. ${g.works === 0 ? 'It left no great work behind.' : `${g.works} great ${g.works === 1 ? 'work stands' : 'works stand'} from those years.`}`,
      causes: [g.eventId, cause].filter((x, i, a) => x >= 0 && sim.events.events[x] && a.indexOf(x) === i), importance: lasted >= 100 ? 2 : 1, speciesIds: [n.species], data: { nation: n.id, years: lasted, works: g.works, reason },
    });
    this.credit(sim, null, n, ev.id, 'It ended in the reign of {name}.');
  }

  /** A new layer in the ground of a town (system E17). Destructions of one kind closer together than `apart` years are one layer. */
  private layer(st: Settlement, year: number, kind: string, eventId: number, apart = 0): void {
    const strata = (st.strata ??= [{ year: st.founded, kind: 'camp', tech: 0.03, eventId: -1 }]);
    const last = strata[strata.length - 1];
    if (apart > 0 && strata.some((x) => x.kind === kind && year - x.year < apart)) return;
    if (last && last.kind === kind && kind !== 'burnt') return;
    strata.push({ year, kind, tech: st.tech, eventId });
    // a deep site keeps its first layers and its latest; the middle is thinned
    if (strata.length > 14) strata.splice(4, 1);
  }

  /** Everything in the ground at a town's site (system E17): this town, the ruin it was built on, the ruin under that, and any town built later on top. */
  siteOf(id: number): SiteStack | null {
    const start = this.settlements[id];
    if (!start) return null;
    // down to the bottom
    let bottom = start;
    for (let guard = 0; guard < 40 && bottom.over !== undefined && this.settlements[bottom.over]; guard++) bottom = this.settlements[bottom.over]!;
    // and up again through everything built on it
    const towns: Settlement[] = [bottom];
    for (let guard = 0; guard < 40; guard++) {
      const top = towns[towns.length - 1]!;
      const next = this.settlements.find((x) => x.over === top.id);
      if (!next) break;
      towns.push(next);
    }
    let layers = 0;
    const out = towns.map((t) => { const strata = t.strata ?? [{ year: t.founded, kind: 'camp', tech: 0.03, eventId: -1 }]; layers += strata.length; return { id: t.id, name: t.name, species: t.species, founded: t.founded, ruined: t.ruined, strata }; });
    return { cell: bottom.cell, towns: out, layers };
  }

  /** A threatened town builds a wall round itself as it then stands; a town that has doubled since builds another further out. */
  private fortify(st: Settlement, year: number): void {
    if (st.tech < 0.3 || st.ruined >= 0) return;
    const walls = (st.walls ??= []);
    const last = walls[walls.length - 1];
    if (walls.length >= 4 || (last && st.pop < last.pop * 2.2)) return;
    walls.push({ pop: st.pop, tech: st.tech, year });
  }

  /** False switches off every change people make to the land (system E16): used to measure what those changes do. */
  landUse = true;

  /**
   * Landscape change (system E16). A nation with water mills dams the rivers by its towns; one that smelts and has
   * ore in its hills opens mines; and one whose towns stand in forest fells it. Each is recorded: the first dam and
   * the first mine anywhere, and for every nation the time its forests went.
   */
  private works(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], y: number, year: number): void {
    const h = this.h, w = sim.world, g = sim.grid;
    const knows = (id: string) => n.know.way[SLOT_INDEX.get(id)!]! >= 0;
    const firsts = (h.firstWorks ??= {});
    // dams
    if (knows('mill1') && rng.chance(1 - Math.exp(-y / 90))) {
      const st = towns[rng.int(towns.length)]!;
      if (st.dam === undefined && st.tech > 0.45) {
        let site = -1, most = 3;
        for (let j = 0; j < g.ncount[st.cell]!; j++) { const nb = g.neighbors[st.cell * 6 + j]!; if (w.elevation[nb]! > w.seaLevel && w.elevation[nb]! >= w.elevation[st.cell]! && w.flow[nb]! > most) { most = w.flow[nb]!; site = nb; } }
        if (site >= 0) {
          st.dam = site;
          const first = firsts.dam === undefined;
          const ev = sim.emit({
            type: 'landscape', year, cellId: site, title: first ? 'The first dam' : `A dam above ${st.name}`,
            description: first
              ? `Above ${st.name} the people of ${n.name} have closed the valley with a wall of earth and stone. The river stops, spreads and becomes a lake, and below it the mills turn all year.`
              : `${n.name} has dammed the river above ${st.name}. A lake stands where there were meadows.`,
            causes: [st.eventId, n.eventId].filter((x) => x >= 0), importance: first ? 2 : 0, speciesIds: [n.species], data: { nation: n.id, settlement: st.id, work: 'dam' },
          });
          if (first && ev.id >= 0) firsts.dam = ev.id;
          this.credit(sim, rng, n, ev.id, 'It is the work of {name}.', 'inventor', year);
        }
      }
    }
    // mines
    if (knows('edge') && n.land.includes('ore') && rng.chance(1 - Math.exp(-y / 70))) {
      const st = towns[rng.int(towns.length)]!;
      if (st.mine === undefined) {
        let site = -1, top = w.elevation[st.cell]! + 0.05;
        for (let j = 0; j < g.ncount[st.cell]!; j++) { const nb = g.neighbors[st.cell * 6 + j]!; if (w.elevation[nb]! > top) { top = w.elevation[nb]!; site = nb; } }
        if (site >= 0) {
          st.mine = site;
          const first = firsts.mine === undefined;
          const ev = sim.emit({
            type: 'landscape', year, cellId: site, title: first ? 'The first mine' : `A mine in the hills of ${st.name}`,
            description: first
              ? `In the hills above ${st.name} they no longer gather ore from the surface. They follow the vein into the rock, and a grey scar of broken stone spreads down the slope below the adit.`
              : `${n.name} has opened a mine above ${st.name}. The hillside below it is bare spoil.`,
            causes: [st.eventId, n.eventId].filter((x) => x >= 0), importance: first ? 2 : 0, speciesIds: [n.species], data: { nation: n.id, settlement: st.id, work: 'mine' },
          });
          if (first && ev.id >= 0) firsts.mine = ev.id;
          this.credit(sim, rng, n, ev.id, 'The first to go underground was {name}.', 'explorer', year);
        }
      }
    }
    // the felling of the forests: when most of its towns that stand in forest country have grown past villages
    if (n.felled === undefined && towns.length >= 4) {
      let wooded = 0, cut = 0;
      for (const st of towns) if (sim.plants.canopy[st.region]! > 0.4) { wooded++; if (st.tech > 0.45) cut++; }
      if (wooded >= 3 && cut >= wooded * 0.6) {
        n.felled = year;
        const first = firsts.felled === undefined;
        const cap = this.settlements[n.capital]!;
        const ev = sim.emit({
          type: 'landscape', year, cellId: cap.cell, title: first ? 'The forests fall' : `The forests of ${n.name} are cut`,
          description: `Round the towns of ${n.name} the woods have gone for fields, beams and charcoal, a ring at a time, and the rings have met. Where the trees stood the ground dries sooner after rain, and the rain itself comes a little less often.`,
          causes: [n.eventId].filter((x) => x >= 0), importance: first ? 2 : 1, speciesIds: [n.species], data: { nation: n.id, work: 'felling', towns: cut },
        });
        if (first && ev.id >= 0) firsts.felled = ev.id;
        this.credit(sim, null, n, ev.id, 'It was done by the reign of {name}.');
      }
    }
  }

  /** Towns reached by a railway or a wire, as of the last look (system E15). */
  private wired = new Set<number>();

  /**
   * Infrastructure networks (system E15). Once a nation knows how, it joins its towns with made roads, then
   * aqueducts, canals, railways, telegraph wires, pipelines and power lines, a stretch at a time. Each kind grows
   * as a tree from the capital: the next stretch always goes to the town that is cheapest to reach from one
   * already joined, where cost is distance made worse by a climb, by a sea in the way (only wires cross water)
   * and by a border. A stretch to a neighbouring country's town is built now and then, for trade. The first
   * of each kind in the world is an event.
   */
  private network(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], y: number, year: number): void {
    if (towns.length < 2) return;
    const h = this.h, gp = sim.grid.pos, el = sim.world.elevation;
    const links = (h.links ??= []);
    // links to towns that are gone are gone too (looked at once per nation per tick: the list is short)
    if (links.length && rng.chance(0.2)) { const kept = links.filter((l) => this.settlements[l.a]!.ruined < 0 && this.settlements[l.b]!.ruined < 0); if (kept.length !== links.length) h.links = kept; }
    const list = h.links!;
    const dist = (a: Settlement, b: Settlement): number => Math.acos(Math.max(-1, Math.min(1, gp[a.cell * 3]! * gp[b.cell * 3]! + gp[a.cell * 3 + 1]! * gp[b.cell * 3 + 1]! + gp[a.cell * 3 + 2]! * gp[b.cell * 3 + 2]!)));
    for (let k = 0; k < NETWORKS.length; k++) {
      const net = NETWORKS[k]!;
      if (n.know.way[SLOT_INDEX.get(net.needs)!]! < 0) continue;
      // how many stretches this tick: one every `every` years on average, a few at most
      const due = y / net.every;
      let stretches = Math.min(3, Math.floor(due) + (rng.chance(due - Math.floor(due)) ? 1 : 0));
      if (!stretches) continue;
      const mine = list.filter((l) => l.kind === k);
      const count = new Map<number, number>();
      for (const l of mine) { count.set(l.a, (count.get(l.a) ?? 0) + 1); count.set(l.b, (count.get(l.b) ?? 0) + 1); }
      const joined = new Set<number>([n.capital]);
      for (const l of mine) if (this.settlements[l.a]!.nation === n.id || this.settlements[l.b]!.nation === n.id) { joined.add(l.a); joined.add(l.b); }
      // an aqueduct serves a town of some size; the rest join every town
      const wanted = towns.filter((st) => k !== 1 || st.pop > 25);
      for (; stretches > 0; stretches--) {
        let best: [Settlement, Settlement] | undefined, cost = Infinity;
        for (const from of towns) {
          if (!joined.has(from.id) || (count.get(from.id) ?? 0) >= 3) continue;
          for (const to of wanted) {
            if (joined.has(to.id) || to.id === from.id) continue;
            const d = dist(from, to);
            // a climb makes any stretch dearer; water in the way stops everything but wires
            let c = d * (1 + 2.5 * Math.abs(el[from.cell]! - el[to.cell]!));
            if (!net.sea && (from.overseas !== to.overseas || this.seaBetween(sim, from.cell, to.cell))) c = Infinity;
            if (c < cost) { cost = c; best = [from, to]; }
          }
        }
        // now and then, instead, a stretch over the border to the nearest town of a country it is in touch with
        if ((k === 0 || k === 3 || k === 4) && rng.chance(0.18)) {
          for (const id of n.contacts) {
            const o = h.nations[id];
            if (!o || o.ended >= 0 || o.know.way[SLOT_INDEX.get(net.needs)!]! < 0) continue;
            const far = this.settlements[o.capital];
            const near = towns.reduce((m, st) => (far && dist(st, far) < dist(m, far) ? st : m), towns[0]!);
            if (!far || far.ruined >= 0 || mine.some((l) => (l.a === near.id && l.b === far.id) || (l.b === near.id && l.a === far.id))) continue;
            if (!net.sea && this.seaBetween(sim, near.cell, far.cell)) continue;
            const c = dist(near, far) * 1.6;
            if (c < cost * 1.5) { cost = c; best = [near, far]; }
          }
        }
        if (!best) break;
        const [from, to] = best;
        const link: Link = { a: Math.min(from.id, to.id), b: Math.max(from.id, to.id), kind: k, year, nation: n.id };
        if (list.some((l) => l.a === link.a && l.b === link.b && l.kind === k)) { joined.add(to.id); continue; }
        list.push(link);
        mine.push(link);
        joined.add(to.id);
        count.set(from.id, (count.get(from.id) ?? 0) + 1); count.set(to.id, (count.get(to.id) ?? 0) + 1);
        const firsts = (h.firstLinks ??= []);
        if (firsts[k] === undefined || firsts[k]! < 0) {
          const told = FIRST_LINK[k]!;
          const ev = sim.emit({
            type: 'network', year, cellId: to.cell, title: told[0],
            description: told[1].replace(/\{a\}/g, from.name).replace(/\{b\}/g, to.name).replace(/\{n\}/g, n.name),
            causes: [n.eventId, h.firstLinks!.filter((x) => x !== undefined && x >= 0).slice(-1)[0] ?? -1].filter((x) => x >= 0), importance: 2, speciesIds: [n.species], data: { nation: n.id, kind: k, a: link.a, b: link.b },
          });
          firsts[k] = ev.id;
          this.credit(sim, rng, n, ev.id, 'It was laid out by {name}.', 'inventor', year);
        }
      }
    }
    // which of its towns the capital now reaches quickly
    for (const st of towns) this.wired.delete(st.id);
    for (const l of list) if (l.kind === 3 || l.kind === 4) { if (this.settlements[l.a]!.nation === n.id) this.wired.add(l.a); if (this.settlements[l.b]!.nation === n.id) this.wired.add(l.b); }
  }

  /** A town that has been left gives its land back slowly (system E18): fields to scrub in a few generations, streets to forest in centuries. */
  private regrow(sim: Simulation): void {
    if (!this.landUse) return;
    const { cleared, elevation, seaLevel } = sim.world, g = sim.grid, year = sim.simYear;
    for (const st of this.settlements) {
      if (st.ruined < 0 || !st.farms) continue;
      const years = year - st.ruined;
      if (years > 2600) continue;
      const streets = stillCleared(years, true), land = stillCleared(years, false);
      if (elevation[st.cell]! > seaLevel) cleared[st.cell] = Math.max(cleared[st.cell]!, streets);
      if (land > 0) for (let j = 0; j < g.ncount[st.cell]!; j++) { const nb = g.neighbors[st.cell * 6 + j]!; if (elevation[nb]! > seaLevel) cleared[nb] = Math.max(cleared[nb]!, land); }
    }
  }

  /**
   * A change in what is cleared shows at once (system E16): the plant cover of a cell is recomputed for its new
   * clearing from what it would be wild, without waiting for the plants' own next step. (That step applies the
   * clearing itself and notes that it has.)
   */
  private clear(sim: Simulation): void {
    const { cleared, clearedApplied: applied, vegetation, canopy } = sim.world;
    for (let i = 0; i < cleared.length; i++) {
      const c = cleared[i]!, a = applied[i]!;
      if (c === a) continue;
      const wild = Math.max(0, Math.min(1, (vegetation[i]! - 0.22 * a) / (1 - 0.8 * a)));
      vegetation[i] = clearedCover(wild, c);
      canopy[i] = a < 0.999 ? (canopy[i]! / (1 - a)) * (1 - c) : 0;
      applied[i] = c;
    }
  }

  /** The networks show at night (system E15): lamps along the roads and canals, the fires of engines, the glare under power lines. */
  private glow(sim: Simulation): void {
    const list = this.h.links;
    if (!list || !list.length) return;
    const g = sim.grid, { lights, elevation, seaLevel } = sim.world;
    // the latest few hundred are enough to draw the web
    for (let i = Math.max(0, list.length - 500); i < list.length; i++) {
      const l = list[i]!, shine = NETWORKS[l.kind]!.glow;
      if (shine <= 0) continue;
      const from = this.settlements[l.a]!, to = this.settlements[l.b]!;
      if (from.ruined >= 0 || to.ruined >= 0) continue;
      const target = to.cell, tx = g.pos[target * 3]!, ty = g.pos[target * 3 + 1]!, tz = g.pos[target * 3 + 2]!;
      let cur = from.cell;
      for (let step = 0; step < 60 && cur !== target; step++) {
        let best = cur, bd = g.pos[cur * 3]! * tx + g.pos[cur * 3 + 1]! * ty + g.pos[cur * 3 + 2]! * tz;
        for (let k = 0; k < g.ncount[cur]!; k++) { const nb = g.neighbors[cur * 6 + k]!; const d = g.pos[nb * 3]! * tx + g.pos[nb * 3 + 1]! * ty + g.pos[nb * 3 + 2]! * tz; if (d > bd) { bd = d; best = nb; } }
        if (best === cur) break;
        cur = best;
        if (elevation[cur]! > seaLevel) lights[cur] = Math.max(lights[cur]!, shine);
      }
    }
  }

  /** Whether open water lies on the straight way between two cells (looked at in a few places along it). */
  private seaBetween(sim: Simulation, a: number, b: number): boolean {
    const gp = sim.grid.pos, el = sim.world.elevation, sea = sim.world.seaLevel;
    let cur = a;
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const x = gp[a * 3]! * (1 - t) + gp[b * 3]! * t, y = gp[a * 3 + 1]! * (1 - t) + gp[b * 3 + 1]! * t, z = gp[a * 3 + 2]! * (1 - t) + gp[b * 3 + 2]! * t;
      // walk to the cell nearest that point
      for (let guard = 0; guard < 400; guard++) {
        let best = cur, bd = gp[cur * 3]! * x + gp[cur * 3 + 1]! * y + gp[cur * 3 + 2]! * z;
        for (let j = 0; j < sim.grid.ncount[cur]!; j++) { const nb = sim.grid.neighbors[cur * 6 + j]!; const d = gp[nb * 3]! * x + gp[nb * 3 + 1]! * y + gp[nb * 3 + 2]! * z; if (d > bd) { bd = d; best = nb; } }
        if (best === cur) break;
        cur = best;
      }
      if (el[cur]! <= sea - 0.05) return true;
    }
    return false;
  }

  /** The count of years a nation keeps. */
  calendarOf(n: Nation): Calendar | undefined {
    return this.h.calendars?.[n.calendar ?? -1];
  }

  /** A date in a nation's own count: "Year 412 of the Falling Light". */
  dateFor(n: Nation, year: number): string {
    const cal = this.calendarOf(n);
    return cal ? dateIn(cal, year) : '';
  }

  /**
   * A new count of years (system E8), tied to an event in the cause graph. If the event was never recorded
   * (it happened under a fast-forward) the count is tied to the nearest thing that was: the nation's own
   * founding, or the dawn of its history.
   */
  private newCalendar(sim: Simulation, n: Nation, year: number, kind: CalendarKind, eventId: number, epoch: number, detail: string, who: string): Calendar {
    const h = this.h;
    const list = (h.calendars ??= []);
    const real = eventId >= 0 && sim.events.events[eventId] ? eventId : n.eventId >= 0 ? n.eventId : h.dawnEvent ?? -1;
    let [name, head, modifier] = calendarName(kind, hash32(this.seedNum, list.length, n.id), detail, who);
    // two peoples may count from different returns of the same comet: their counts must not share a name
    for (let salt = 1; salt < 7 && list.some((c) => c.name === name && Math.floor(c.epoch) !== Math.floor(epoch)); salt++) [name, head, modifier] = calendarName(kind, hash32(this.seedNum, list.length, n.id, salt), detail, who);
    const taken = (text: string) => list.some((c) => c.name === text && Math.floor(c.epoch) !== Math.floor(epoch));
    if (taken(name)) name = `${name} of ${this.settlements[n.capital]?.name ?? n.name}`;
    // (the same town can be the seat of more than one beginning)
    if (taken(name)) { const base = name.replace(/^the /, ''); let k = 2; while (taken(`the ${NTH[Math.min(k, NTH.length) - 2]} ${base}`) && k < NTH.length + 1) k++; name = `the ${NTH[Math.min(k, NTH.length + 1) - 2] ?? 'Later'} ${base}`; if (taken(name)) name = `${name}, as counted in ${n.name}`; }
    const cal: Calendar = { id: list.length, name, own: compound(this.languageOf(n), head, modifier, year), epoch, eventId: real, kind, nation: n.id, set: year };
    list.push(cal);
    return cal;
  }

  /**
   * A nation that can chart the stars fixes its count of years on the thing its people remember best: a sight
   * in the sky, a disaster they lived through, a reformer's teaching, or the crowning of the house that rules them.
   */
  private reformCalendar(sim: Simulation, rng: RNG, n: Nation, year: number): void {
    const h = this.h;
    const culture = h.cultures[n.culture]!;
    const house = h.dynasties[n.dynasty];
    type Memory = { kind: CalendarKind; eventId: number; year: number; detail: string; who: string; weight: number };
    const memories: Memory[] = [];
    const ev = (id: number) => (id >= 0 ? sim.events.events[id] : undefined);
    if (h.sign && year - h.sign.year < 120 && ev(h.sign.eventId)) memories.push({ kind: h.sign.kind, eventId: h.sign.eventId, year: h.sign.year, detail: '', who: '', weight: h.sign.kind === 'eclipse' ? 0.9 : 0.55 });
    for (const w of n.woes) { const e = ev(w.eventId); if (e && (w.kind === 'disaster' || w.kind === 'plague')) memories.push({ kind: 'disaster', eventId: e.id, year: w.year, detail: `${e.type} ${e.title}`, who: '', weight: 0.9 }); }
    for (let i = h.people.length - 1, seen = 0; i >= 0 && seen < 400; i--, seen++) {
      const p = h.people[i]!;
      if (p.role === 'reformer' && p.nation === n.id && year - p.rose < 150 && ev(p.events[0] ?? -1)) { memories.push({ kind: 'teaching', eventId: p.events[0]!, year: p.rose, detail: '', who: p.name, weight: 0.7 + 0.6 * culture.custom }); break; }
    }
    if (house && house.ended < 0) {
      const crowned = ev(h.people[house.founder]?.events[0] ?? -1);
      if (crowned && house.reigns >= 2) memories.push({ kind: 'crown', eventId: crowned.id, year: house.founded, detail: '', who: house.name, weight: 0.5 + 0.1 * Math.min(6, house.reigns) });
    }
    if (!memories.length) return;
    let total = 0;
    for (const m of memories) total += m.weight;
    let roll = rng.next() * total, chosen = memories[0]!;
    for (const m of memories) { roll -= m.weight; if (roll <= 0) { chosen = m; break; } }
    const cal = this.newCalendar(sim, n, year, chosen.kind, chosen.eventId, chosen.year, chosen.detail, chosen.who);
    n.calendar = cal.id;
    const cap = this.settlements[n.capital]!;
    const first = !h.calendars!.some((c) => c.id !== cal.id && c.kind !== 'founding');
    const remembered = sim.events.events[cal.eventId]!;
    const out = sim.emit({
      type: 'calendar', year, cellId: cap.cell, title: first ? 'The first calendar' : `${n.name} counts its years anew`,
      description: `The star-watchers of ${cap.name} fix the count of years for ${n.name}. Year 1 is the year of ${cal.name}: "${remembered.title}". In their own tongue the count is ${cal.own}. By it, this is ${dateIn(cal, year)}.`,
      causes: [cal.eventId, n.eventId].filter((x, i, a) => x >= 0 && a.indexOf(x) === i), importance: first ? 2 : 0, speciesIds: [n.species], data: { nation: n.id, calendar: cal.id },
    });
    this.credit(sim, rng, n, out.id, '{name} worked out the count.', 'scholar', year);
  }

  /**
   * Wonders (system E19). A country that is past its first cities, steady and of some size now and then raises a
   * giant work, and always because of something in the record: the comet that came back when the count said it
   * would, the day the sun went dark, a crater, a mountain that burned, a war won, a plague outlived, the founder
   * of its ruling house, its towns across the sea, its golden age, the place where the first city stood. The
   * wonder keeps the event that inspired it, and its own raising is an event caused by that one. A wonder takes
   * a lifetime or more to build and outlasts the town it stands in by thousands of years.
   */
  private wonder(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], y: number, year: number): void {
    const h = this.h;
    if (n.era < 2 || towns.length < 3 || n.stability < 0.5 || n.fatigue > 0.35) return;
    const all = (h.wonders ??= []);
    // (the world raises one every few generations at most, and a country one in several centuries)
    let lastHere = -1e9, lastAny = -1e9, mine = 0;
    for (const w of all) { if (w.year > lastAny) lastAny = w.year; if (w.nation === n.id) { mine++; if (w.year > lastHere) lastHere = w.year; if (w.done > year) return; } }
    if (year - lastAny < 90 || year - lastHere < 350 + 250 * mine) return;
    if (!rng.chance(1 - Math.exp(-y / 90))) return;
    const real = (id: number | undefined): id is number => id !== undefined && id >= 0 && !!sim.events.events[id];
    const has = (kind: WonderKind, cause: number): boolean => all.some((w) => w.kind === kind && (w.cause === cause || (w.nation === n.id && this.settlements[w.settlement]!.ruined < 0)));
    const cap = this.settlements[n.capital]!;
    const pos = sim.grid.pos;
    const near = (cell: number): { st: Settlement; d: number } => {
      let best = towns[0]!, bd = -2;
      for (const st of towns) { const d = pos[st.cell * 3]! * pos[cell * 3]! + pos[st.cell * 3 + 1]! * pos[cell * 3 + 1]! + pos[st.cell * 3 + 2]! * pos[cell * 3 + 2]!; if (d > bd) { bd = d; best = st; } }
      return { st: best, d: Math.acos(Math.min(1, bd)) };
    };
    const lang = this.languageOf(n);
    // (its name in their own tongue: two meanings, the second chosen by the country and the year)
    const called = (head: string, ...modifiers: string[]): string => compound(lang, head, modifiers[hash32(this.seedNum, n.id, Math.floor(year), 0x30d) % modifiers.length]!, year);
    const count = (kind: WonderKind): number => { let c = 0; for (const w of all) if (w.kind === kind) c++; return c; };
    type Plan = { kind: WonderKind; cause: number; at: Settlement; name: string; what: string; why: string; toward?: number; bearing?: number; say: string };
    const plans: Plan[] = [];
    // ---- a crater: one people saw it made, a later one only finds the ring of hills
    const fall = sim.events.last('impact');
    if (fall && fall.cellId >= 0 && year - fall.simYear < 3e6) {
      const { st, d } = near(fall.cellId);
      if (d < 0.6 && st.cell !== fall.cellId && !has('crater-stair', fall.id)) {
        const seen = fall.simYear >= h.began && h.began >= 0;
        plans.push({ kind: 'crater-stair', cause: fall.id, at: st, toward: fall.cellId, name: `${called('stone', 'star', 'high', 'fire')}, the stair of the fallen star`, what: 'a stepped mound whose great stair faces the crater',
          why: seen ? `It faces the crater of ${fall.title.replace(/^The /, 'the ')}, which their forebears saw fall.` : `It faces the great ring of hills left by ${fall.title.replace(/^The /, 'the ')}, which no river made and no one living saw.`,
          say: seen ? `The day the sky fell is still told in ${n.name}. At ${st.name} they raise a mound of many steps so that it is never forgotten, and its great stair faces the crater.` : `The surveyors of ${n.name} have walked the ring of hills and found it a perfect round. At ${st.name} they raise a mound of many steps, from the top of which the whole ring can be seen at once, and its great stair faces the crater.` });
      }
    }
    // ---- a mountain that burned, or any other disaster the land sent
    const woe = n.woes.length ? n.woes[n.woes.length - 1]! : undefined;
    if (woe && woe.kind === 'disaster' && real(woe.eventId) && year - woe.year < 60 && year - woe.year > 4) {
      const ev = sim.events.events[woe.eventId]!;
      if (/erupt|volcan/.test(ev.type) && ev.cellId >= 0 && !has('fire-watch', ev.id)) {
        const { st, d } = near(ev.cellId);
        if (d < 0.5 && st.cell !== ev.cellId) plans.push({ kind: 'fire-watch', cause: ev.id, at: st, toward: ev.cellId, name: `${called('hill', 'fire', 'red', 'high')}, the watch on the burning mountain`, what: 'a stepped watch-mound that faces the volcano',
          why: `It faces the mountain that burned in "${ev.title}", and a watch is kept on its summit day and night, with a beacon ready to light if the mountain stirs.`,
          say: `No one in ${n.name} means to be caught asleep by the mountain again after "${ev.title}". At ${st.name} they raise a mound of many steps facing it and set a watch on the summit, with a beacon to light as a warning.` });
      } else if (!has('memorial', ev.id)) plans.push({ kind: 'memorial', cause: ev.id, at: cap, name: `${called('stone', 'long', 'cold', 'black')}, the stone of remembrance`, what: 'a single standing stone taller than any tower',
        why: `It was raised for the dead of "${ev.title}".`,
        say: `No one in ${n.name} is without someone lost in "${ev.title}". At ${cap.name} they quarry a single stone taller than any tower and stand it upright, with no name on it, because there were too many.` });
    }
    if (woe && woe.kind === 'plague' && real(woe.eventId) && year - woe.year < 60 && year - woe.year > 4 && !has('memorial', woe.eventId)) {
      const ev = sim.events.events[woe.eventId]!;
      plans.push({ kind: 'memorial', cause: ev.id, at: cap, name: `${called('stone', 'white', 'cold', 'salt')}, the stone of remembrance`, what: 'a single standing stone taller than any tower',
        why: `It was raised for the dead of "${ev.title}".`,
        say: `The sickness has passed. At ${cap.name} those who are left quarry a single stone taller than any tower and stand it upright for those who are not.` });
    }
    // ---- a war won
    if (woe && woe.kind === 'war' && real(woe.eventId) && year - woe.year < 40 && !has('victory', woe.eventId)) {
      const ev = sim.events.events[woe.eventId]!;
      plans.push({ kind: 'victory', cause: ev.id, at: cap, name: `${called('king', 'high', 'red', 'great')}, the column of the victory`, what: 'a column with the whole war carved in a spiral up it',
        why: `It tells the story of "${ev.title}" as ${n.name} wishes it remembered.`,
        say: `${n.name} has come out of "${ev.title}" the stronger. At ${cap.name} it raises a column higher than the walls, with the whole war carved in a spiral up it and the enemy always shown running.` });
    }
    // ---- the sky: the comet that keeps its appointments, and the day the sun went dark
    const watches = n.know.way[SLOT_INDEX.get('sky1')!]! >= 0;
    const v = h.visitor;
    if (watches && v && real(v.last) && sim.events.events[v.last]!.causes.length && !has('observatory', v.last)) {
      // (its long slot lies along the track the comet takes down the sky, which is the same at every return)
      const bearing = ((hash32(this.seedNum, 0xc0e9) % 360) * Math.PI) / 180;
      plans.push({ kind: 'observatory', cause: v.last, at: cap, bearing, name: `${called('star', 'well', 'long', 'cold', 'high')}, the house of the Visitor`, what: 'an observatory whose slot lies along the comet\'s path',
        why: `It was built to watch for the Visitor, the small comet that returns every ${v.period} years, and its slot lies along the comet\'s path down the sky.`,
        say: `The Visitor came back when the count said it would. ${n.name} resolves never to miss it again: at ${cap.name} it raises a great round house with a slot in its roof that lies along the comet's path, and sets watchers there for the ${v.period} years until the next return.` });
    }
    const sign = h.sign;
    if (watches && sign && sign.kind === 'eclipse' && real(sign.eventId) && year - sign.year < 50 && !has('sungate', sign.eventId)) {
      const ev = sim.events.events[sign.eventId]!;
      const at = this.settlements.find((st) => st.cell === ev.cellId && st.ruined < 0 && st.nation === n.id);
      if (at) plans.push({ kind: 'sungate', cause: ev.id, at, bearing: ((hash32(this.seedNum, ev.id, 0x5a7e) % 360) * Math.PI) / 180, name: `${called('sun', 'cross', 'black', 'stone')}, the gate of the dark sun`, what: 'a gate of three stones, and a ring of stones round it',
        why: `Through it, on one day of the year, the sun rises where it stood when it went dark in "${ev.title}".`,
        say: `No one who stood in the streets of ${at.name} when the sun went dark has forgotten it. They raise a gate of three stones, each the size of a hill, set so that once a year the sun rises through it where it stood that noon.` });
    }
    // ---- the founder of an old house
    const house = h.dynasties[n.dynasty];
    if (house && house.ended < 0 && (house.generations ?? 0) >= 4) {
      const founder = h.people[house.founder];
      const first = founder ? founder.events.find((e) => real(e)) : undefined;
      if (founder && real(first) && !has('tomb', first)) plans.push({ kind: 'tomb', cause: first, at: cap, name: `${called('hill', 'king', 'old', 'great')}, the tomb of ${founder.name}`, what: 'a pyramid over the founder of the ruling house',
        why: `It holds ${founder.name}, who founded the ${house.name}, ${house.generations} generations before it was built.`,
        say: `The ${house.name} has ruled ${n.name} for ${house.generations} generations and wishes to be thought eternal. It moves the bones of its founder, ${founder.name}, to ${cap.name} and raises a mountain of dressed stone over them.` });
    }
    // ---- towns across the sea
    const far = towns.find((st) => st.overseas && real(st.eventId)), port = cap.overseas ? towns.find((st) => !st.overseas) : cap;
    if (far && port && n.know.way[SLOT_INDEX.get('sail')!]! >= 0 && !has('lighthouse', far.eventId)) {
      plans.push({ kind: 'lighthouse', cause: far.eventId, at: port, toward: far.cell, name: `${called('fire', 'sea', 'salt', 'wind', 'high')}, the great light`, what: 'a lighthouse seen a day\'s sail away',
        why: `It guides home the ships that sail between ${port.name} and ${far.name}, the town its people founded across the sea.`,
        say: `Too many ships bound for ${far.name} have not come back. At ${port.name} ${n.name} raises a tower on the shore with a fire at its head that can be seen a day's sail away.` });
    }
    // ---- a golden age
    const g = n.golden;
    if (g && real(g.eventId) && year - g.since > 30 && !has('great-bell', g.eventId)) plans.push({ kind: 'great-bell', cause: g.eventId, at: cap, name: `${called('great', 'sun', 'red', 'bright')}, the great bell of ${cap.name}`, what: 'a bell of bronze as tall as a hill',
      why: `It was cast in ${g.own}, the golden age of ${n.name}, to show what its makers could do.`,
      say: `In ${g.own} there is nothing ${n.name} thinks beyond it. At ${cap.name} its founders cast a bell in bronze as tall as a hill, in a single pour that takes a year to cool, and hang it between two piers of stone. It is rung once in a generation and heard for a day's walk.` });
    // ---- the place where the first city stood
    const firstCity = sim.milestones.get('first-city');
    if (real(firstCity) && n.era >= 3 && !all.some((w) => w.kind === 'first-tower')) {
      const ev = sim.events.events[firstCity]!;
      if (year - ev.simYear > 1500 && ev.cellId >= 0) {
        // (whatever stands or lies on that ground now: the town itself, a later one on its ruin, or the ruin)
        let site: Settlement | undefined;
        for (const st of this.settlements) if (st.cell === ev.cellId && (!site || st.ruined < 0 || (site.ruined >= 0 && st.ruined > site.ruined))) site = st;
        const { d } = near(ev.cellId);
        if (site && d < 0.35 && (site.ruined >= 0 || site.nation === n.id)) plans.push({ kind: 'first-tower', cause: firstCity, at: site, name: `${called('town', 'old', 'high', 'great')}, the tower of the first city`, what: 'a tower where the first city stood',
          why: `It stands where ${site.name}, the first city in the world, ${site.ruined >= 0 ? 'stood' : 'was founded'}, ${Math.round((year - ev.simYear) / 100) * 100} years before.`,
          say: site.ruined >= 0
            ? `The scholars of ${n.name} have found the place where the first city stood. There is little left of ${site.name} but mounds. Among them they raise a tower higher than anything its builders could have imagined, so that the place is not lost again.`
            : `${site.name} was the first city in the world, and ${n.name}, which holds it now, wants that remembered. In the oldest part of the town it raises a tower higher than anything the first builders could have imagined.` });
      }
    }
    if (!plans.length) return;
    // Which of its reasons it acts on: the rarest reasons weigh most (a crater or the first city before another
    // column), and a kind the world already has many of weighs less each time, so that no two wonders in sight of
    // each other are likely to be alike.
    const rare: Record<WonderKind, number> = { 'crater-stair': 9, 'first-tower': 9, 'fire-watch': 6, sungate: 3, observatory: 2, lighthouse: 2, 'great-bell': 2, tomb: 1.5, victory: 1, memorial: 1, 'peace-hall': 1 };
    let sum = 0;
    const weights = plans.map((p) => { const w = rare[p.kind] / (1 + count(p.kind)) ** 2; sum += w; return w; });
    let pick = rng.next() * sum, k = 0;
    while (k < plans.length - 1 && pick > weights[k]!) pick -= weights[k++]!;
    const p = plans[k]!;
    // (and it needs to be worth a generation's work: the tenth of a kind is seldom begun at all)
    if (!rng.chance(Math.min(1, 3 * weights[k]!))) return;
    this.raise(sim, rng, n, p.at, p.kind, p.cause, p.name, p.what, p.why, p.say, year, p.toward, p.bearing);
  }

  /** Begin a wonder: it is an event caused by what inspired it, and work on it lasts a lifetime or more. */
  private raise(sim: Simulation, rng: RNG | null, n: Nation, at: Settlement, kind: WonderKind, cause: number, name: string, what: string, why: string, say: string, year: number, toward?: number, bearing?: number): Wonder | null {
    const h = this.h, all = (h.wonders ??= []);
    const first = !all.length;
    // (hands and ramps take generations; engines take decades)
    const years = Math.round((kind === 'memorial' || kind === 'victory' ? 0.4 : 1) * (130 - 100 * sat((n.tech - 0.3) / 0.7)) * (0.8 + 0.4 * (hash32(this.seedNum, all.length, 0xb11d) % 100) / 100));
    const ev = sim.emit({
      type: 'wonder', year, cellId: at.cell, title: first ? `The first wonder: ${name}` : capital(name),
      description: `${say} The work will take ${years} years.`,
      causes: [cause, n.eventId].filter((x, i, a) => x >= 0 && sim.events.events[x] && a.indexOf(x) === i), causeWeights: [1, 0.3], importance: first ? 3 : 2, speciesIds: [n.species],
      data: { nation: n.id, settlement: at.id, kind, cause },
    });
    if (ev.id < 0 || !ev.causes.includes(cause)) return null;
    const w: Wonder = { id: (h.wonderSeq = (h.wonderSeq ?? 0) + 1), kind, name: capital(name), what, why, settlement: at.id, nation: n.id, year, done: year + years, eventId: ev.id, cause };
    if (toward !== undefined) w.toward = toward;
    if (bearing !== undefined) w.bearing = bearing;
    all.push(w);
    // (the list is kept to a page or two: the first to go are those whose towns have been ruins longest)
    if (all.length > 240) {
      let worst = -1, since = Infinity;
      for (let i = 0; i < all.length - 1; i++) { const r = this.settlements[all[i]!.settlement]!.ruined; if (r >= 0 && r < since) { since = r; worst = i; } }
      all.splice(worst >= 0 ? worst : 0, 1);
    }
    this.credit(sim, rng, n, ev.id, kind === 'tomb' || kind === 'victory' || kind === 'great-bell' ? 'It was ordered by {name}.' : 'It was begun in the reign of {name}.');
    return w;
  }

  /**
   * Languages change (system E21). Every language still spoken loses or shifts a sound every few centuries:
   * more slowly once it is written down, and more slowly the more it has already changed. Which sound is luck,
   * so sisters that began identical drift apart, while the words they began with stay recognisable in both.
   * (The luck comes from the language and the year, not from the stream that decides wars and reigns.)
   */
  private drift(y: number, year: number): void {
    const h = this.h;
    const write = SLOT_INDEX.get('write')!;
    const written = new Map<number, boolean>();
    for (const n of h.nations) {
      if (n.ended >= 0) continue;
      const lang = h.cultures[n.culture]!.language;
      written.set(lang, (written.get(lang) ?? false) || n.know.way[write]! >= 0);
    }
    for (const [id, w] of written) {
      const lang = h.languages[id]!;
      if (lang.changes.length >= 64) continue;
      const luck = new RNG(hash32(this.seedNum, id, Math.floor(year), 0xd41f7));
      if (!luck.chance(1 - Math.exp(-y / driftSpan(lang.changes.length, w)))) continue;
      const change = soundChange(lang, luck, year);
      // the names of places wear with the speech of those who live in them (system E22)
      if (change) this.respeak(id, year, `in ${lang.name}, ${change.note}`);
    }
  }

  /**
   * Daughter languages (system E21). Countries that share a people and a tongue do not share them for ever. The
   * oldest of them keeps the name; each of the others, once it has been a country of its own for long enough,
   * is found to be speaking something a traveller from the old country can no longer follow: sooner if the two
   * have lost touch, later if they trade and read each other's writing. From then on it is a people of its own,
   * with a daughter language that starts from the parent's words and drifts its own way.
   */
  private partTongues(sim: Simulation, year: number): void {
    const h = this.h;
    const sharing = new Map<number, Nation[]>();
    for (const n of h.nations) {
      if (n.ended >= 0) continue;
      let list = sharing.get(n.culture);
      if (!list) sharing.set(n.culture, (list = []));
      list.push(n);
    }
    const write = SLOT_INDEX.get('write')!;
    for (const [cid, list] of sharing) {
      if (list.length < 2) continue;
      const old = h.cultures[cid]!;
      let home = list[0]!;
      for (const n of list) if (n.founded < home.founded) home = n;
      for (const n of list) {
        if (n === home || n.founded >= year) continue;
        const touch = n.contacts.includes(home.id) || home.contacts.includes(n.id);
        const written = n.know.way[write]! >= 0 && home.know.way[write]! >= 0;
        const wait = (touch ? 1100 : 420) * (written && touch ? 1.4 : 1) * (0.7 + 0.6 * ((hash32(this.seedNum, n.id, 0x7019) % 1000) / 1000));
        const since = Math.max(n.founded, old.born);
        if (year - since < wait) continue;
        const was = h.languages[old.language]!;
        const c = this.daughterCulture(new RNG(hash32(this.seedNum, n.id, 0x701a)), old, year, this.settlements[n.capital]);
        n.culture = c.id;
        const now = h.languages[c.language]!;
        this.respeak(c.language, year, `the speech of ${n.name} had become ${c.name}`);
        // two words that show it: the ones that have moved furthest apart
        const shown = ['water', 'sun', 'people', 'fire', 'star', 'river', 'stone', 'child'].map((m) => [m, word(was, m), word(now, m)] as const).filter((x) => x[1] !== x[2]).slice(0, 2);
        const first = !h.firstTongue;
        const cap = this.settlements[n.capital]!;
        const ev = sim.emit({
          type: 'language', year, cellId: cap.cell, title: first ? `The first parting of tongues: ${c.name} and ${old.name}` : `${n.name} speaks a tongue of its own`,
          description: `It is ${Math.round((year - since) / 10) * 10} years since ${n.name} and ${home.name} were one people${touch ? '' : ', and for most of them neither has had word of the other'}. A traveller from one can still pick out words in the other${shown.length ? ` (${shown.map((x) => `"${x[0]}" is ${x[1]} there and ${x[2]} here`).join(', ')})` : ''}, but can no longer follow what is said. The speech of ${n.name} is now a language of its own, ${c.name}.`,
          causes: [n.eventId].filter((x) => x >= 0 && sim.events.events[x]), importance: first ? 2 : 0, speciesIds: [n.species], data: { nation: n.id, culture: c.id, parent: old.id },
        });
        if (first && ev.id >= 0) h.firstTongue = ev.id;
      }
    }
  }

  /**
   * Art movements (system E26). A country's painters paint real events: the first painting of each age it
   * enters, and now and then, while its years are being watched, something that has just happened to it. From
   * the age of flat figures on they belong to a movement: one begun at home, or one learned from a country they
   * are in touch with whose painters are newer; and when a movement has been followed long enough, or the age
   * has moved past it, the young painters begin another against it, which uses colour the other way.
   * (The luck in all of it comes from the country and the year, not from the stream that decides wars.)
   */
  private art(sim: Simulation, n: Nation, y: number, year: number): void {
    const h = this.h, ev = sim.events.events;
    const style = styleOfEra(n.era);
    const paintings = (h.paintings ??= []), movements = (h.movements ??= []);
    const luck = (k: number): number => (hash32(this.seedNum, n.id, Math.floor(year), k) % 100000) / 100000;
    const cap = this.settlements[n.capital]!;
    const lang = this.languageOf(n);
    // ---- the movement its painters follow
    if (style >= 1) {
      const mine = n.movement !== undefined ? movements[n.movement] : undefined;
      let seen: Movement | undefined;
      for (const id of n.contacts) {
        const o = h.nations[id];
        const m = o && o.ended < 0 && o.movement !== undefined ? movements[o.movement] : undefined;
        if (m && m.style <= style && (!mine || m.born > mine.born) && (!seen || m.born > seen.born)) seen = m;
      }
      const tired = !mine || mine.style < style || year - (n.movedArt ?? mine.born) > 260 + (hash32(this.seedNum, n.id, movements.length, 0xa31) % 300);
      if (seen && seen.id !== n.movement && luck(1) < 1 - Math.exp(-y / 120)) {
        n.movement = seen.id; n.movedArt = year;
        sim.emit({
          type: 'art-movement', year, cellId: cap.cell, title: `${seen.name} reaches ${n.name}`,
          description: `Painters who have seen the work of ${h.nations[seen.nation]?.name ?? 'another country'} come home to ${cap.name} and will paint no other way. ${mine ? `${mine.name} is suddenly what old people like.` : `It is the first school of painting ${n.name} has had.`}`,
          causes: [seen.eventId, n.eventId].filter((x, i, a) => x >= 0 && ev[x] && a.indexOf(x) === i), importance: 0, speciesIds: [n.species], data: { nation: n.id, movement: seen.id },
        });
      } else if (tired && luck(2) < 1 - Math.exp(-y / 60)) {
        // (a name no school has had: one of a dozen things painters look at, and one of a dozen ways of looking)
        let head = '', modifier = '', plain = '';
        for (let salt = 0; salt < 40; salt++) {
          const k = hash32(this.seedNum, n.id, movements.length, 0xa32 + salt);
          head = ART_HEADS[k % ART_HEADS.length]!; modifier = ART_MODS[(k >>> 8) % ART_MODS.length]!;
          plain = `the ${capital(modifier)} ${capital(head)} ${['school', 'painters', 'manner'][(k >>> 16) % 3]}`;
          if (!movements.some((m) => m.name === plain)) break;
        }
        const use = against(mine, hash32(this.seedNum, n.id, movements.length, 0xa33));
        const first = !movements.length;
        const m: Movement = { id: movements.length, name: plain, own: compound(lang, head, modifier, year), style, turn: use.turn, loud: use.loud, born: year, nation: n.id, parent: mine ? mine.id : -1, against: mine ? mine.id : -1, eventId: -1 };
        const e = sim.emit({
          type: 'art-movement', year, cellId: cap.cell, title: first ? `The first school of painters: ${plain}` : mine ? `${plain}: the painters of ${n.name} turn against ${mine.name}` : `${plain}: a school of painters in ${n.name}`,
          description: mine
            ? `The young painters of ${cap.name} have had enough of ${mine.name}. Where it was ${mine.loud > 0.5 ? 'loud' : 'muted'} they are ${use.loud > 0.5 ? 'loud' : 'muted'}; where it leaned ${mine.turn > 0 ? 'warm' : 'cool'} they lean ${use.turn > 0 ? 'warm' : 'cool'}${mine.style < style ? `; and they paint ${ART_STYLES[style]}, which no one did before` : ''}. They call themselves ${m.own}, ${plain}.`
            : `In ${cap.name} those who paint have begun to agree on how it should be done: ${ART_STYLES[style]}, ${use.loud > 0.5 ? 'in strong colour' : 'in quiet colour'}. They call their way ${m.own}, ${plain}.`,
          causes: [mine ? mine.eventId : -1, n.eventId].filter((x, i, a) => x >= 0 && ev[x] && a.indexOf(x) === i), importance: first ? 2 : 0, speciesIds: [n.species], data: { nation: n.id, movement: m.id, against: m.against },
        });
        m.eventId = e.id;
        movements.push(m);
        n.movement = m.id; n.movedArt = year;
      }
    }
    // ---- what they paint: the first painting of each age, and now and then something that has just happened
    const firstOfAge = (n.paintedEra ?? -1) < n.era;
    if (!firstOfAge && !(this.fine && luck(3) < 1 - Math.exp((-y * (n.golden ? 2 : 1)) / 45))) return;
    const offered: number[] = [];
    const woes = n.woes.slice(-3).reverse();
    for (const w of woes) if (year - w.year < 60) offered.push(w.eventId);
    for (const w of h.wonders ?? []) if (w.nation === n.id && year - w.year < 80) offered.push(w.eventId);
    if (h.sign && year - h.sign.year < 40) offered.push(h.sign.eventId);
    if (n.golden) offered.push(n.golden.eventId);
    for (const c of [n.codes?.fire, n.codes?.quake, n.codes?.flood]) if (c && year - c.year < 60) offered.push(c.eventId);
    const ruler = h.people[n.ruler];
    if (ruler && ruler.events.length) offered.push(ruler.events[0]!);
    if (n.script !== undefined && h.scripts?.[n.script] && year - h.scripts[n.script]!.born < 80) offered.push(h.scripts[n.script]!.eventId);
    offered.push(cap.eventId, n.eventId, h.dawnEvent ?? -1);
    const fresh = (id: number): boolean => id >= 0 && !!ev[id] && subjectOf(ev[id]!.type) !== null && !paintings.some((p) => p.nation === n.id && p.eventId === id && (!firstOfAge || p.era === n.era));
    const pick = offered.find(fresh);
    if (pick === undefined) return;
    const what = ev[pick]!, subject = subjectOf(what.type)!;
    const mine = n.movement !== undefined ? movements[n.movement] : undefined;
    const wonder = subject === 'wonder' ? h.wonders?.find((w) => w.eventId === pick) : undefined;
    const id = (h.paintingSeq = (h.paintingSeq ?? 0) + 1);
    const p: Painting = {
      id, year, nation: n.id, species: n.species, settlement: cap.id, eventId: pick, subject, era: n.era, style, movement: mine && mine.style === style ? mine.id : -1,
      title: what.title, painter: this.fine ? personName(lang, hash32(this.seedNum, id, 0xa34), year) : '', seed: hash32(this.seedNum, id, 0xa35),
      hueA: n.hue, hueB: (n.hue + 0.42 + ((hash32(this.seedNum, id, 0xa36) % 100) / 100) * 0.16) % 1,
      night: subject !== 'sky' ? hash32(this.seedNum, id, 0xa37) % 5 === 0 : what.type !== 'eclipse', detail: wonder ? wonder.kind : subject === 'sky' ? what.type : '', first: firstOfAge,
    };
    paintings.push(p);
    n.paintedEra = n.era;
    // the first picture in each manner anywhere is remembered
    const firsts = (h.firstStyles ??= []);
    if (firsts[style] === undefined) {
      const e = sim.emit({
        type: 'artwork', year, cellId: cap.cell, title: `The first picture ${ART_STYLES[style]}`,
        description: `At ${cap.name} someone has made a picture of "${what.title}" ${ART_STYLES[style]}${style === 0 ? ', on the wall of a shelter, in red earth and soot' : style === 1 ? ': every figure flat, in its own colour, inside a painted border' : style === 2 ? ': the far things small and the near things large, as the eye sees them' : style === 3 ? ': not the things themselves but the light on them, in dabs of colour that only join at a distance' : ': nothing in it is a thing at all, and those who were there say it is exactly how it was'}.${p.painter ? ` The painter was ${p.painter}.` : ''}`,
        causes: [pick, n.eventId].filter((x, i, a) => x >= 0 && ev[x] && a.indexOf(x) === i), importance: 1, speciesIds: [n.species], data: { nation: n.id, painting: id, style },
      });
      firsts[style] = e.id;
    }
    // (the gallery is kept to a few rooms: the first to go are the oldest that are not the first of their age)
    if (paintings.length > 260) { const k = paintings.findIndex((x) => !x.first); paintings.splice(k >= 0 ? k : 0, 1); }
  }

  /**
   * Writing systems (system E23). A country that has learned to write writes in some script. If a country it is
   * in touch with already writes, it takes that script and bends it to its own tongue: a daughter script, which
   * starts as worn as its teacher's is and then wears its own way. Otherwise it begins its own, from pictures.
   * A country that comes out of one that writes keeps its script.
   */
  private writing(sim: Simulation, n: Nation, year: number): void {
    const h = this.h;
    if (n.know.way[SLOT_INDEX.get('write')!]! < 0) return;
    const scripts = (h.scripts ??= []);
    let teacher: Nation | undefined;
    for (const id of n.contacts) {
      const o = h.nations[id];
      if (o && o.script !== undefined && (!teacher || scripts[o.script]!.born < scripts[teacher.script!]!.born)) teacher = o;
    }
    const from = teacher ? scripts[teacher.script!]! : undefined;
    const people = h.cultures[n.culture]!;
    const first = !scripts.length;
    const cap = this.settlements[n.capital]!;
    const paper = n.know.way[SLOT_INDEX.get('paper')!]! >= 0;
    const sc: Script = {
      id: scripts.length, parent: from ? from.id : -1, nation: n.id, born: year, from: from ? wearOf(from, year) : 0, eventId: -1,
      hand: paper || hash32(this.seedNum, scripts.length, 0x5c2) % 3 === 0 ? 1 : 0, name: `${people.name} script`,
    };
    const ev = sim.emit({
      type: 'script', year, cellId: cap.cell, title: first ? `The first writing: the ${sc.name}` : from ? `${n.name} takes up writing` : `${n.name} begins to write`,
      description: from
        ? `${n.name} has taken the writing of ${teacher!.name} and bent it to its own tongue. The signs are those of the ${from.name}, ${sc.hand ? 'drawn now with a brush' : 'cut now with a blade'}; within a few lifetimes no one from ${teacher!.name} will read them easily.`
        : `In ${n.name} the tallies kept at ${cap.name} have become pictures, and the pictures have begun to stand for words: three waves for water, a ring with rays for the sun, the outline of one of themselves for "people". ${sc.hand ? 'They are drawn with a brush.' : 'They are cut and pressed, in straight strokes.'} Anything that can be said can now be kept.`,
      causes: [from ? from.eventId : -1, n.eventId].filter((x, i, a) => x >= 0 && sim.events.events[x] && a.indexOf(x) === i), importance: first ? 2 : 0, speciesIds: [n.species],
      data: { nation: n.id, script: sc.id, parent: sc.parent },
    });
    sc.eventId = ev.id;
    scripts.push(sc);
    n.script = sc.id;
    this.credit(sim, null, n, ev.id, 'It was the reign of {name}.');
  }

  /** Does language `id` come down from language `ancestor` (or is it the same)? */
  private descends(id: number, ancestor: number): boolean {
    for (let l = this.h.languages[id]; l; l = this.h.languages[l.parent]) if (l.id === ancestor) return true;
    return false;
  }

  /**
   * Place name drift (system E22). When the speech of a people changes, the names of the places they live in are
   * said the new way: every living town whose people now speak language `id`, and whose name is in that
   * language or one it came down from, is re-spoken. A town held by people of a sister tongue is re-spoken
   * their way too; one held by people of another family keeps its name as a fossil until someone renames it.
   */
  private respeak(id: number, year: number, why: string): void {
    const h = this.h, lang = h.languages[id]!;
    const speaks = new Set<number>();
    for (const n of h.nations) if (n.ended < 0 && h.cultures[n.culture]!.language === id) speaks.add(n.id);
    for (const st of this.settlements) {
      if (st.ruined >= 0) continue;
      if (st.nation >= 0 ? !speaks.has(st.nation) : st.tongue !== id) continue;
      const from = st.tongue ?? id;
      if (this.descends(id, from)) this.rename(st, lang, year, why, -1, false);
      else if (h.languages[from] && h.languages[from]!.family === lang.family) this.rename(st, lang, year, `said the way of its new people, who speak ${lang.name}`, -1, false);
    }
  }

  /**
   * Give a town the name its meanings make in a language in a given year, and keep the old one in its record.
   * Returns false if nothing changed (the name comes out the same, or another living town already bears it).
   */
  private rename(st: Settlement, lang: Language, year: number, why: string, eventId: number, renamed: boolean): boolean {
    const next = compound(lang, st.head, st.modifier || undefined, year);
    const old = st.tongue;
    st.tongue = lang.id;
    if (next === st.name) return false;
    if (this.settlements.some((x) => x.ruined < 0 && x.id !== st.id && x.name === next)) { st.tongue = old; return false; }
    const names = (st.names ??= [{ name: st.name, year: st.founded, why: 'founded' }]);
    const entry: PlaceName = { name: next, year, why };
    if (eventId >= 0) entry.eventId = eventId;
    // (two changes in one lifetime are remembered as one, unless a conqueror made the second)
    const last = names[names.length - 1]!;
    if (!renamed && names.length > 1 && year - last.year < 25 && last.eventId === undefined) names[names.length - 1] = entry;
    else names.push(entry);
    // a long record keeps its first name and its latest
    if (names.length > 8) names.splice(1, names.length - 8);
    st.name = next;
    return true;
  }

  /** The sky on a human clock: a small comet that comes back within living memory, and now and then an eclipse. */
  private sky(sim: Simulation, rng: RNG, y: number, year: number): void {
    const h = this.h;
    const watchers = h.nations.filter((n) => n.ended < 0 && n.know.way[SLOT_INDEX.get('sky1')!]! >= 0);
    if (!watchers.length) return;
    const v = (h.visitor ??= { period: 46 + (hash32(this.seedNum, 0xc0e7) % 70), next: year + (hash32(this.seedNum, 0xc0e8) % 60), last: -1 });
    if (year >= v.next) {
      v.next += v.period * Math.max(1, Math.ceil((year - v.next + 1) / v.period));
      const seen = rng.pick(watchers), cap = this.settlements[seen.capital]!;
      const ev = sim.emit({
        type: 'comet', year, cellId: cap.cell, title: 'The Visitor returns',
        description: v.last < 0 ? `A small comet hangs in the dusk over ${cap.name}. Those who keep the count of days mark it, in case it comes again.` : `The small comet is back over ${cap.name}, ${v.period} years after it was last seen, as the count said it would be.`,
        causes: v.last >= 0 ? [v.last] : [], importance: 0, speciesIds: [seen.species], data: { nation: seen.id },
      });
      if (ev.id >= 0) { v.last = ev.id; h.sign = { eventId: ev.id, year, kind: 'comet' }; this.credit(sim, null, seen, ev.id, 'It was seen in the reign of {name}.'); }
    }
    if (rng.chance(1 - Math.exp(-y / 170))) {
      const seen = rng.pick(watchers), cap = this.settlements[seen.capital]!;
      const ev = sim.emit({
        type: 'eclipse', year, cellId: cap.cell, title: `Eclipse over ${cap.name}`,
        description: `At noon the sun goes dark over ${cap.name}. For a few minutes the stars come out and no one in the streets speaks.`,
        causes: [], importance: 0, speciesIds: [seen.species], data: { nation: seen.id },
      });
      if (ev.id >= 0) { h.sign = { eventId: ev.id, year, kind: 'eclipse' }; this.credit(sim, null, seen, ev.id, 'It was the reign of {name}.'); }
    }
  }

  /** True while a marriage between the ruling houses keeps nation `n` from fighting nation `other`. */
  private allied(n: Nation, other: number, year: number): boolean {
    if (!n.allies || other < 0) return false;
    for (const a of n.allies) if (a.nation === other && a.until > year) return true;
    return false;
  }

  /**
   * The ruler marries into the ruling house of a country they are in touch with (system E7). While the
   * match is remembered the two countries do not fight, and a child of it has a claim on the other throne.
   */
  private marry(sim: Simulation, rng: RNG, n: Nation, year: number): void {
    const h = this.h;
    const ruler = h.people[n.ruler];
    if (!ruler) return;
    const open = n.contacts.map((id) => h.nations[id]!).filter((o) => o && o.ended < 0 && o.species === n.species && h.dynasties[o.dynasty] && h.dynasties[o.dynasty]!.ended < 0 && o.dynasty !== n.dynasty && !this.allied(n, o.id, year));
    if (!open.length) return;
    const other = rng.pick(open);
    const theirs = h.dynasties[other.dynasty]!, head = h.people[other.ruler];
    const span = this.lifespan(sim, n.species);
    const consort = this.person(rng, n, 'consort', year, Math.max(span * 0.18, Math.min(span * 0.5, year - ruler.born - span * 0.05 + rng.next() * span * 0.1)), -1, theirs.id);
    consort.name = personName(this.languageOf(other), hash32(this.seedNum, consort.id, 0x9e2));
    consort.gen = head ? (head.gen ?? 0) + 1 : 0;
    consort.spouse = ruler.id; ruler.spouse = consort.id; ruler.match = other.id;
    const until = year + 60 + rng.next() * 60;
    const cap = this.settlements[n.capital]!;
    const ev = sim.emit({
      type: 'marriage', year, cellId: cap.cell, title: `${n.name} and ${other.name} joined by marriage`,
      description: `${ruler.name} of ${n.name} weds ${consort.name} of the ${theirs.name}, which rules ${other.name}. While the match is remembered the two countries will not fight, and a child of it may one day claim both.`,
      causes: [n.eventId, other.eventId].filter((x) => x >= 0), importance: n.towns >= 6 && other.towns >= 6 ? 1 : 0, speciesIds: [n.species], data: { nation: n.id, other: other.id, person: consort.id },
    });
    consort.events.push(ev.id); ruler.events.push(ev.id);
    (n.allies ??= []).push({ nation: other.id, until, eventId: ev.id });
    (other.allies ??= []).push({ nation: n.id, until, eventId: ev.id });
    for (const x of [n, other]) if (x.allies!.length > 6) x.allies!.shift();
    n.stability = sat(n.stability + 0.03);
  }

  /**
   * The ruler is gone (system E7). A grown child follows if there is one, and a second child may dispute
   * it, which in an unsteady country means civil war. With no child a brother or sister may follow; failing
   * that a ruler abroad with a claim by marriage takes the throne for their own house; failing that the
   * house is over and another family takes its place.
   */
  private succession(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], year: number, fate: string): void {
    const h = this.h;
    const old = h.people[n.ruler]!;
    old.died = year; old.reignTo = year; old.fate = fate;
    const span = this.lifespan(sim, n.species);
    const house = h.dynasties[n.dynasty];
    const cap = this.settlements[n.capital]!;
    const age = year - old.born;
    // how many of the ruler's children are grown: more for one who lived long, and for one who married
    const wed = (old.spouse ?? -1) >= 0 ? 0.06 : 0;
    const kids = !house ? 0 : age > 0.45 * span ? (rng.chance(0.9 + wed) ? 1 + rng.int(3) : 0) : age > 0.32 * span ? (rng.chance(0.62 + wed) ? 1 + rng.int(2) : 0) : rng.chance(0.2 + wed) ? 1 : 0;
    const crown = (next: Person, line: Dynasty): void => {
      line.rulers.push(next.id); line.reigns++;
      const first = h.people[line.founder];
      line.generations = Math.max(line.generations ?? 1, (next.gen ?? 0) - (first ? first.gen ?? 0 : 0) + 1);
      n.ruler = next.id;
    };
    // the great families will not always follow the heir: likelier in an unsteady country, and for a house still new
    const refused = !!house && rng.chance(0.03 + 0.16 * (1 - n.stability) + (house.reigns < 3 ? 0.05 : 0));
    if (house && kids > 0 && !refused) {
      // a usurper: in a country coming apart, a general on record may set the heir aside
      const general = n.stability < 0.3 && rng.chance(0.3) ? h.notables.map((id) => h.people[id]!).find((p) => p.role === 'general' && p.nation === n.id && p.died < 0) : undefined;
      if (general) {
        house.ended = year;
        h.notables.splice(h.notables.indexOf(general.id), 1);
        general.role = 'ruler'; general.reignFrom = year; general.patron = -1; general.gen = 0;
        const line = this.dynasty(n, general, year);
        n.ruler = general.id; n.dynasty = line.id;
        const ev = sim.emit({
          type: 'dynasty', year, cellId: cap.cell, title: `A general takes ${n.name}`,
          description: `${old.name} ${fate}. The heir was a child of the ${house.name}; the army was ${general.name}'s. ${general.name} holds ${cap.name} now, and the ${house.name} is over after ${house.reigns} ${house.reigns === 1 ? 'reign' : 'reigns'}.`,
          causes: [n.eventId, general.events[0] ?? -1].filter((x) => x >= 0), importance: house.reigns >= 8 ? 1 : 0, speciesIds: [n.species], data: { nation: n.id, person: general.id },
        });
        general.events.push(ev.id); old.events.push(ev.id);
        this.woe(n, 'succession', ev.id, year, 0.12);
        return;
      }
      const heir = this.person(rng, n, 'ruler', year, Math.max(span * 0.16, Math.min(span * 0.5, age - span * (0.22 + rng.next() * 0.1))), old.id, house.id);
      // a claim comes from a parent's marriage, or is handed down
      heir.claim = (old.match ?? -1) >= 0 ? old.match : old.claim ?? -1;
      crown(heir, house);
      // a disputed succession: likelier in an unsteady country
      if (kids > 1 && rng.chance(0.04 + 0.2 * (1 - n.stability))) {
        const rivalAge = Math.max(span * 0.14, (year - heir.born) - span * (0.02 + rng.next() * 0.06));
        const claimant = this.person(rng, n, 'claimant', year, rivalAge, old.id, house.id);
        claimant.rival = heir.id; heir.rival = claimant.id;
        const war = towns.length >= 5 && rng.chance(0.1 + 0.5 * (1 - n.stability));
        const ev = sim.emit({
          type: war ? 'civil-war' : 'dynasty', year, cellId: cap.cell, title: war ? `Civil war in ${n.name}` : `Disputed succession in ${n.name}`,
          description: `${old.name} ${fate}, and two children of the ${house.name} both claim ${cap.name}. ${heir.name} is crowned there.`,
          causes: [n.eventId].filter((x) => x >= 0), importance: war ? 2 : 0, speciesIds: [n.species], data: { nation: n.id, person: claimant.id },
        });
        claimant.events.push(ev.id); heir.events.push(ev.id); old.events.push(ev.id);
        if (war) this.successionWar(sim, rng, n, towns, year, heir, claimant, ev.id);
        else {
          const end = rng.pick(['flees over the border and is not heard of again', 'is shut up in a tower for life', 'dies in the fighting at the gate', 'is bought off with a province to govern']);
          const ev2 = sim.events.events[ev.id]!;
          ev2.description += ` ${claimant.name} ${end}.`;
          if (!end.startsWith('is bought')) { claimant.died = end.startsWith('dies') ? year : -1; if (claimant.died >= 0) { claimant.fate = 'died fighting for the throne'; h.notables.splice(h.notables.indexOf(claimant.id), 1); } }
          this.woe(n, 'succession', ev.id, year, 0.07);
        }
      }
      return;
    }
    // no child: a brother or sister of the dead ruler
    if (house && !refused && rng.chance(0.45)) {
      const kin = this.person(rng, n, 'ruler', year, Math.max(span * 0.25, age - span * rng.next() * 0.12), old.parent, house.id);
      kin.gen = old.gen ?? 0;
      crown(kin, house);
      return;
    }
    // a claim by marriage: a ruler abroad whose parent married into this house
    const claimer = house ? h.nations.map((x) => (x.ended < 0 && x.id !== n.id ? h.people[x.ruler] : undefined)).find((p) => p && p.died < 0 && p.claim === n.id) : undefined;
    if (house && claimer) {
      const theirs = h.dynasties[claimer.dynasty]!, abroad = h.nations[claimer.nation]!;
      house.ended = year;
      const next = this.person(rng, n, 'ruler', year, Math.max(span * 0.16, (year - claimer.born) - span * (0.22 + rng.next() * 0.1)), claimer.id, theirs.id);
      const line = this.dynasty(n, next, year);
      line.name = theirs.name; line.branchOf = theirs.id;
      n.ruler = next.id; n.dynasty = line.id;
      claimer.claim = -1;
      // where the two countries lie close enough for one court to hold both, they become one
      const seat = this.settlements[abroad.capital];
      if (seat && rng.chance(0.7)) {
        const gp = sim.grid.pos;
        const cos = gp[seat.cell * 3]! * gp[cap.cell * 3]! + gp[seat.cell * 3 + 1]! * gp[cap.cell * 3 + 1]! + gp[seat.cell * 3 + 2]! * gp[cap.cell * 3 + 2]!;
        if (Math.acos(Math.max(-1, Math.min(1, cos))) < 1.5 * REACH[abroad.era]! * Math.sqrt((4 * Math.PI) / sim.regions.count)) {
          const ev = sim.emit({
            type: 'union', year, cellId: cap.cell, title: `${n.name} is joined to ${abroad.name}`,
            description: `${old.name} ${fate} and left no heir. By an old marriage the claim falls to ${claimer.name} of the ${theirs.name}, and ${n.name} with its ${towns.length} ${towns.length === 1 ? 'town' : 'towns'} becomes part of ${abroad.name}. No battle was fought for it.`,
            causes: [n.eventId, abroad.eventId].filter((x) => x >= 0), importance: towns.length + abroad.towns >= 8 ? 2 : 1, speciesIds: [n.species], data: { nation: abroad.id, other: n.id, person: claimer.id },
          });
          claimer.events.push(ev.id); old.events.push(ev.id);
          for (const st of towns) { st.nation = abroad.id; sim.cellLog.note(st.cell, year, Log.Owner, abroad.id); }
          abroad.towns += towns.length;
          // what either country knew, the united one knows
          const land = new Set(abroad.land);
          for (let i = 0; i < WEB.length; i++) if (abroad.know.way[i]! < 0 && n.know.way[i]! >= 0 && wayFor(i, land) >= 0) { abroad.know.way[i] = wayFor(i, land); abroad.know.year[i] = year; }
          claimer.claim = -1;
          if (n.golden) this.endGolden(sim, n, year, `the country was joined to ${abroad.name}`, ev.id);
          n.ended = year; n.pop = 0; n.towns = 0;
          return;
        }
      }
      const until = year + 80;
      (n.allies ??= []).push({ nation: abroad.id, until, eventId: -1 });
      (abroad.allies ??= []).push({ nation: n.id, until, eventId: -1 });
      const ev = sim.emit({
        type: 'dynasty', year, cellId: cap.cell, title: `${n.name} passes to the ${theirs.name}`,
        description: `${old.name} ${fate} and left no heir. By an old marriage the claim falls to ${claimer.name} of ${abroad.name}, who sends ${next.name} to rule in ${cap.name}. The ${house.name} is over after ${house.reigns} ${house.reigns === 1 ? 'reign' : 'reigns'}; two countries now answer to one family.`,
        causes: [n.eventId, abroad.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [n.species], data: { nation: n.id, other: abroad.id, person: next.id },
      });
      n.allies[n.allies.length - 1]!.eventId = ev.id; abroad.allies[abroad.allies.length - 1]!.eventId = ev.id;
      next.events.push(ev.id); old.events.push(ev.id); claimer.events.push(ev.id);
      this.woe(n, 'succession', ev.id, year, 0.05);
      return;
    }
    if (house) house.ended = year;
    const next = this.person(rng, n, 'ruler', year, span * (0.3 + rng.next() * 0.25), -1, -1);
    const line = this.dynasty(n, next, year);
    n.ruler = next.id; n.dynasty = line.id;
    const ev = sim.emit({
      type: 'dynasty', year, cellId: cap.cell, title: `A new house in ${n.name}`,
      description: house ? `${old.name} ${fate} and left no heir the great families would follow. ${next.name} takes ${cap.name}, and the ${house.name} is over after ${house.reigns} ${house.reigns === 1 ? 'reign' : 'reigns'}.` : `${next.name} takes ${cap.name}.`,
      causes: [n.eventId].filter((x) => x >= 0), importance: house && house.reigns >= 12 ? 1 : 0, speciesIds: [n.species], data: { nation: n.id, person: next.id },
    });
    next.events.push(ev.id); old.events.push(ev.id);
    this.woe(n, 'succession', ev.id, year, 0.16);
  }

  /** Two children of one house fight for it: the second city crowns the younger, and the country divides between them. */
  private successionWar(sim: Simulation, rng: RNG, n: Nation, towns: Settlement[], year: number, heir: Person, claimant: Person, eventId: number): void {
    const gp = sim.grid.pos;
    const cap = this.settlements[n.capital]!;
    const spacing = Math.sqrt((4 * Math.PI) / sim.regions.count);
    const angle = (a: Settlement, b: Settlement): number => Math.acos(Math.max(-1, Math.min(1, gp[a.cell * 3]! * gp[b.cell * 3]! + gp[a.cell * 3 + 1]! * gp[b.cell * 3 + 1]! + gp[a.cell * 3 + 2]! * gp[b.cell * 3 + 2]!)));
    const others = towns.filter((st) => st.id !== cap.id && st.ruined < 0);
    if (!others.length) return;
    const seat = [...others].sort((a, b) => b.pop - a.pop).find((st) => angle(cap, st) > 1.2 * spacing) ?? others[0]!;
    const ev = sim.events.events[eventId]!;
    ev.description += ` ${claimant.name} is crowned in ${seat.name}. Towns choose a side, or have one chosen for them.`;
    ev.cellId = seat.cell;
    const other = this.newNation(sim, rng, seat, year, n, 'breakaway', [eventId], claimant);
    for (const st of others) {
      st.pop *= 0.8;
      if (st.id !== seat.id && angle(seat, st) < angle(cap, st)) { st.nation = other.id; sim.cellLog.note(st.cell, year, Log.Owner, other.id); }
    }
    cap.pop *= 0.8;
    n.fatigue = sat(n.fatigue + 0.4); other.fatigue = 0.4;
    n.stability = 0.5; other.stability = 0.5;
    this.woe(n, 'succession', eventId, year, 0);
    // each branch keeps its claim on the other half: when one line fails the country may be made whole again
    heir.claim = other.id; claimant.claim = n.id;
  }

  /** A camp has planted fields. It joins a neighbouring nation of its own people, or founds one. */
  private enterHistory(sim: Simulation, rng: RNG, st: Settlement, year: number): void {
    const h = this.h, reg = sim.regions;
    st.farms = true;
    sim.civEvent('farms', st.species, st.cell, st.id);
    const tame = this.neighbourSpecies(sim, st, false);
    if (tame >= 0 && sim.creatures.species[tame]!.tamedBy < 0) {
      sim.creatures.species[tame]!.tamedBy = st.species;
      sim.civEvent('tamed', st.species, st.cell, st.id, tame);
    }
    // a nation of the same people next door takes the new farmers in
    for (let j = 0; j < reg.grid.ncount[st.region]!; j++) {
      const oid = this.occupied.get(reg.grid.neighbors[st.region * 6 + j]!);
      if (oid === undefined) continue;
      const o = this.settlements[oid]!;
      if (o.nation >= 0 && o.species === st.species && h.nations[o.nation]!.ended < 0) {
        st.nation = o.nation;
        sim.cellLog.note(st.cell, year, Log.Owner, o.nation);
        return;
      }
    }
    if ((h.peace ?? -1) >= 0) {
      // in the long peace new farmers of the same people simply take up the custom of the nearest nation
      const gp = sim.grid.pos;
      let best: Nation | undefined, bd = -2;
      for (const n of h.nations) {
        if (n.ended >= 0 || n.species !== st.species) continue;
        const cap = this.settlements[n.capital];
        if (!cap) continue;
        const d = gp[cap.cell * 3]! * gp[st.cell * 3]! + gp[cap.cell * 3 + 1]! * gp[st.cell * 3 + 1]! + gp[cap.cell * 3 + 2]! * gp[st.cell * 3 + 2]!;
        if (d > bd) { bd = d; best = n; }
      }
      if (best) { st.nation = best.id; st.tech = Math.max(st.tech, FARMING); sim.cellLog.note(st.cell, year, Log.Owner, best.id); return; }
      // but another people planting its first fields is news: the old nations wake
      this.wake(sim, rng, year, st);
    }
    this.newNation(sim, rng, st, year, null);
  }

  /** The long peace ends without a catastrophe: a new people has appeared, and the old nations have things to decide again. */
  private wake(sim: Simulation, rng: RNG, year: number, newcomer: Settlement): void {
    const h = this.h;
    h.peace = -1; h.since = year; h.topSince = -1;
    const sp = sim.creatures.species[newcomer.species]!;
    const ev = sim.emit({
      type: 'peace-broken', year, cellId: newcomer.cell, title: 'The long peace ends',
      description: `At ${newcomer.name} another people, ${sp.name}, has planted fields of its own. The old nations look up from their customs: there is someone new in the world, and things to decide again.`,
      causes: [newcomer.eventId].filter((x) => x >= 0), importance: 3, speciesIds: [newcomer.species], data: {},
    });
    let lead: Nation | undefined;
    for (const n of h.nations) {
      if (n.ended >= 0) continue;
      this.enthrone(sim, rng, n, year);
      n.stability = 0.7;
      if (!lead || n.tech > lead.tech) lead = n;
    }
    if (lead) this.credit(sim, null, lead, ev.id, 'Among the old nations {name} was the first to send envoys.');
  }

  /** A nation that kept no rulers follows one again. */
  private enthrone(sim: Simulation, rng: RNG, n: Nation, year: number): void {
    const first = this.person(rng, n, 'ruler', year, this.lifespan(sim, n.species) * (0.3 + rng.next() * 0.25), -1, -1);
    const house = this.dynasty(n, first, year);
    n.ruler = first.id; n.dynasty = house.id; n.government = 'chiefdom';
  }

  /** A town becomes the first of a new country: on its own (the first farmers of a land) or by going beyond the reach of the one it came from. */
  private newNation(sim: Simulation, rng: RNG, st: Settlement, year: number, from: Nation | null, why: 'far' | 'breakaway' | 'successor' = 'far', because: number[] = [], lead?: Person): Nation {
    const h = this.h;
    // its people (system E9): a country keeps the culture it came out of, but settlers who crossed the sea to found
    // their own, and farmers who began apart from every other nation, become a people of their own
    const root = from ? h.cultures[from.culture]! : this.cultureFor(sim, st.species, year);
    const apart = from ? (why === 'far' ? !!st.overseas || rng.chance(0.2) : rng.chance(why === 'successor' ? 0.15 : 0.08)) : h.nations.some((x) => x.species === st.species);
    const culture = apart ? this.daughterCulture(rng, root, year, st) : root;
    const lang = h.languages[culture.language]!;
    // named for its first town, in its own tongue
    let name = compound(lang, 'land', st.modifier || st.head, year);
    for (let salt = 0; h.nations.some((x) => x.name === name) && salt < 6; salt++) name = compound(lang, ['land', 'people', 'hold', 'march', 'reach', 'home'][salt]!, salt % 2 ? st.head : `${st.head}-${salt}`, year);
    const n: Nation = {
      id: h.nations.length, name, culture: culture.id, species: st.species, capital: st.id, founded: year, ended: -1, parent: from ? from.id : -1, government: 'chiefdom',
      ruler: -1, dynasty: -1, stability: 0.7, tech: st.tech, era: eraOf(st.tech), hue: (culture.hue + ((hash32(this.seedNum, h.nations.length, 7) % 1000) / 1000) * 0.3 + 0.85) % 1, eventId: -1, pop: st.pop, towns: 1,
      know: newKnowledge(), land: [], surveyed: -1e9, contacts: [], inequality: from ? from.inequality * 0.5 : 0.05, fatigue: 0, woes: [], peakYear: year, peakTowns: 1,
    };
    // (a country that comes out of one that writes keeps its script; its name is written with the signs for what it means)
    if (from && from.script !== undefined) n.script = from.script;
    n.signs = ['land', st.modifier || st.head];
    // settlers carry what the old country knew; what their new land cannot support they will have to relearn another way
    if (from) {
      copyKnowledge(from.know, n.know); n.land = from.land.slice();
      // a band of settlers, or one province on its own, cannot keep up every craft of a whole country: the newest
      // are left behind (system E3), so a young country starts about an age behind the one it came from
      if (why !== 'successor') { let known = 0; for (let i = 0; i < WEB.length; i++) if (n.know.way[i]! >= 0) known++; shed(n.know, known * (why === 'far' ? 0.2 : 0.12)); }
      n.tech = Math.max(FARMING, levelOf(n.know, new Set(n.land))); n.era = eraOf(n.tech);
    }
    h.nations.push(n);
    const span = this.lifespan(sim, st.species);
    // (a claimant of an older house who takes a throne of their own founds a branch of it)
    const first = lead ?? this.person(rng, n, 'founder', year, span * (0.3 + rng.next() * 0.25), -1, -1);
    const branch = lead ? lead.dynasty : -1;
    if (lead) { lead.nation = n.id; lead.role = 'founder'; lead.patron = -1; const at = h.notables.indexOf(lead.id); if (at >= 0) h.notables.splice(at, 1); }
    first.reignFrom = year;
    const house = this.dynasty(n, first, year);
    if (branch >= 0) house.branchOf = branch;
    n.ruler = first.id; n.dynasty = house.id;
    st.nation = n.id;
    // (a people that has just become its own says the name of its town its own way: system E22)
    if (apart && from) this.rename(st, lang, year, `the speech of ${n.name} had become ${culture.name}`, -1, false);
    const dawn = h.began < 0;
    if (dawn) h.began = year;
    const sp = sim.creatures.species[st.species]!;
    const ev = sim.emit({
      type: 'nation', year, cellId: st.cell, title: dawn ? 'The dawn of history' : `${n.name} is founded`,
      description: dawn
        ? `At ${st.name} the people of ${sp.name} have planted fields and stayed to guard them. They call their country ${n.name} and follow ${first.name}. From here on their years are worth counting one by one.`
        : from && why === 'breakaway'
          ? `${st.name} and the towns around it will take no more orders from ${this.settlements[from.capital]?.name ?? from.name}. They follow ${first.name} now and call their country ${n.name}.`
          : from && why === 'successor'
            ? `Out of what was ${from.name}, ${first.name} holds ${st.name} and the land around it, and calls it ${n.name}.`
            : from
              ? `${st.name} lies too far from ${this.settlements[from.capital]!.name} for any order to reach it. Its settlers follow ${first.name} now and call their country ${n.name}.`
              : `The farmers around ${st.name} now answer to ${first.name}. They call their country ${n.name}.`,
      causes: [st.eventId, from ? from.eventId : -1, ...because].filter((x) => x >= 0), importance: dawn ? 3 : 1, speciesIds: [st.species], data: { nation: n.id, person: first.id },
    });
    n.eventId = ev.id;
    first.events.push(ev.id);
    if (dawn || (h.dawnEvent ?? -1) < 0) h.dawnEvent = ev.id;
    // its count of years (system E8): settlers and successors keep the count they were born under; a country that
    // broke away in anger, or began on its own, counts from its own beginning
    const old = from ? this.calendarOf(from) : undefined;
    if (old && why !== 'successor' && !(why === 'breakaway' && rng.chance(0.5))) n.calendar = old.id;
    else n.calendar = this.newCalendar(sim, n, year, 'founding', ev.id, year, dawn || !from ? 'dawn' : why === 'far' ? (st.overseas ? 'sea' : 'land') : why, from ? from.name : '').id;
    sim.cellLog.note(st.cell, year, Log.Owner, n.id);
    sim.cellLog.note(st.cell, year, Log.Era, n.era);
    return n;
  }

  /** The records of a nation that has ceased to exist are closed. */
  private closeNation(n: Nation, year: number, fate: string): void {
    const h = this.h;
    n.ended = year; n.pop = 0; n.towns = 0;
    n.golden = undefined;
    const ruler = h.people[n.ruler];
    if (ruler && ruler.died < 0) { ruler.died = year; ruler.reignTo = year; ruler.fate = fate === 'fell apart' ? 'was the last to rule it' : 'died with the country'; }
    const house = h.dynasties[n.dynasty];
    if (house && house.ended < 0) house.ended = year;
  }

  private endNation(sim: Simulation, n: Nation, year: number): void {
    if (n.golden) this.endGolden(sim, n, year, 'its last town stood empty', -1);
    this.closeNation(n, year, 'emptied');
    const ev = sim.emit({
      type: 'nation-fall', year, cellId: this.settlements[n.capital]?.cell ?? -1, title: `${n.name} is no more`,
      description: `The last town of ${n.name} stands empty. It lasted ${Math.round(year - n.founded).toLocaleString('en-US')} years.`,
      causes: [n.eventId].filter((x) => x >= 0), importance: year - n.founded > 400 ? 1 : 0, speciesIds: [n.species], data: { nation: n.id },
    });
    this.credit(sim, null, n, ev.id, 'Its last ruler was {name}.');
  }

  // ------------------------------------------------------------------ shared by both clocks

  private capacity(sim: Simulation, st: Settlement): number {
    const reg = sim.regions;
    const food = sim.plants.landFood[st.region]! + (1 - reg.land[st.region]!) * 0.15;
    const cold = reg.landTemp[st.region]! < -4 ? 0.3 : 1;
    // farming and tools raise how many people the land can feed
    return (2 + 60 * food) * (1 + 14 * st.tech * st.tech) * cold;
  }

  /** The people died out, or the place can no longer feed or hold anyone. */
  private failed(sim: Simulation, st: Settlement, speciesGone: boolean): boolean {
    return speciesGone || st.pop < 0.05 || sim.world.elevation[st.cell]! <= sim.world.seaLevel;
  }

  private abandon(sim: Simulation, st: Settlement, year: number): void {
    st.ruined = year;
    this.layer(st, year, 'abandoned', -1);
    this.occupied.delete(st.region);
    sim.cellLog.note(st.cell, year, Log.Ruined, st.id);
    sim.cellLog.note(st.cell, year, Log.Owner, -1);
    sim.civEvent('ruin', st.species, st.cell, st.id);
    this.goWild(sim, st, year);
  }

  /**
   * Feral cities (system E18). When a town is left, the animals its people kept run wild in it, and where it had
   * towers something that flies takes them for cliffs and nests there. When the last town of a people is gone,
   * the animals they tamed are tame no longer.
   */
  private goWild(sim: Simulation, st: Settlement, year: number): void {
    if (st.tech < 0.3) return;
    const cr = sim.creatures, h = this.h;
    const ruin = st.eventId;
    const firsts = (h.firstWild ??= {});
    // the herds
    const tame = cr.species.find((sp) => sp.tamedBy === st.species && sp.extinctYear < 0 && !!sp.name);
    if (tame) {
      let here = false;
      for (let c = 0; c < cr.high && !here; c++) if (cr.alive[c] && cr.sp[c] === tame.id && cr.region[c] === st.region) here = true;
      if (here) {
        st.feral = tame.id;
        const first = firsts.feral === undefined;
        const ev = sim.emit({
          type: 'feral', year, cellId: st.cell, title: first ? 'The herds run wild' : `Wild herds in ${st.name}`,
          description: `No one drives the ${tame.name} of ${st.name} out to pasture any more. They graze the fields that fed their keepers and shelter in the empty houses, and each generation is a little warier than the last.`,
          causes: [ruin].filter((x) => x >= 0), importance: first ? 2 : 0, speciesIds: [tame.id], data: { settlement: st.id, species: tame.id },
        });
        if (first && ev.id >= 0) firsts.feral = ev.id;
      }
      // with the last town of their keepers gone, they are a wild animal again
      if (!this.settlements.some((x) => x.ruined < 0 && x.species === st.species)) tame.tamedBy = -1;
    }
    // the towers
    if (st.tech >= 0.6) {
      let best = -1, most = 0;
      for (let c = 0; c < cr.high; c++) {
        if (!cr.alive[c] || cr.region[c] !== st.region || cr.sp[c] === st.species) continue;
        if (cr.phen[c * PHEN_COUNT + P.Fly]! < 0.4) continue;
        if (cr.count[c]! > most && cr.species[cr.sp[c]!]!.name) { most = cr.count[c]!; best = c; }
      }
      if (best >= 0) {
        const sp = cr.species[cr.sp[best]!]!;
        st.nesting = sp.id;
        // somewhere safe to raise young is worth a good deal
        cr.count[best] = cr.count[best]! * 1.15;
        const first = firsts.nesting === undefined;
        const ev = sim.emit({
          type: 'feral', year, cellId: st.cell, title: first ? 'Nests in the towers' : `${sp.name} nests in ${st.name}`,
          description: `The towers of ${st.name} are cliffs now, as far as ${sp.name} is concerned: high ledges out of reach of anything that hunts on the ground. The window openings fill with nests.`,
          causes: [ruin].filter((x) => x >= 0), importance: first ? 2 : 0, speciesIds: [sp.id], data: { settlement: st.id, species: sp.id },
        });
        if (first && ev.id >= 0) firsts.nesting = ev.id;
      }
    }
  }

  private census(): void {
    let living = 0, maxTech = 0;
    for (const st of this.settlements) { if (st.ruined < 0) { living++; if (st.tech > maxTech) maxTech = st.tech; } }
    this.living = living;
    this.maxTech = maxTech;
  }

  /** A species living beside a settlement: its main prey (largest other animal) or a grazer worth taming. */
  private neighbourSpecies(sim: Simulation, st: Settlement, anyDiet: boolean): number {
    const cr = sim.creatures;
    let best = -1, bb = 0;
    for (let c = 0; c < cr.high; c++) {
      if (!cr.alive[c] || cr.region[c] !== st.region || cr.sp[c] === st.species) continue;
      const g = c * GENE_COUNT, p = c * PHEN_COUNT;
      if (cr.phen[p + P.LandUse]! < 0.4) continue;
      if (!anyDiet && (cr.genome[g + G.Diet]! > 0.35 || cr.genome[g + G.Size]! < 0.25)) continue;
      const b = cr.count[c]! * cr.phen[p + P.Mass]!;
      if (b > bb && cr.species[cr.sp[c]!]!.name) { bb = b; best = cr.sp[c]!; }
    }
    return best;
  }

  /** Tamed herds near settlements are fed and bred: calmer, more sociable, a little smaller each generation. */
  private tend(sim: Simulation, tau: number): void {
    const cr = sim.creatures;
    for (let c = 0; c < cr.high; c++) {
      if (!cr.alive[c]) continue;
      const sp = cr.species[cr.sp[c]!]!;
      if (sp.tamedBy < 0 || !this.occupied.has(cr.region[c]!)) continue;
      const g = c * GENE_COUNT;
      const k = Math.min(0.05, 0.004 * tau);
      cr.genome[g + G.Aggression] = cr.genome[g + G.Aggression]! * (1 - k);
      cr.genome[g + G.Sociality] = cr.genome[g + G.Sociality]! + (1 - cr.genome[g + G.Sociality]!) * k;
      cr.genome[g + G.Boldness] = cr.genome[g + G.Boldness]! + (0.8 - cr.genome[g + G.Boldness]!) * k;
      computePhenotype(cr.genome, g, cr.phen, c * PHEN_COUNT);
      cr.count[c] = cr.count[c]! * (1 + Math.min(0.2, 0.08 * tau));
    }
  }

  /** The worst war: most people die and much knowledge is lost. */
  devastate(): void {
    for (const st of this.settlements) {
      if (st.ruined >= 0) continue;
      st.pop *= 0.25;
      st.tech *= 0.55;
    }
    for (const n of this.h.nations) {
      if (n.ended >= 0) continue;
      // the newest knowledge is the first to go: everything above about half of what was known is lost
      const land = new Set(n.land);
      const keep = FARMING + (n.tech - FARMING) * 0.45;
      for (let i = 0; i < WEB.length; i++) if (n.know.way[i]! >= 0 && WEB[i]!.level > keep) n.know.way[i] = -1;
      n.know.saved = 0;
      n.tech = Math.min(n.tech * 0.55, levelOf(n.know, land) + 0.02);
      n.era = eraOf(n.tech); n.stability *= 0.4;
    }
    this.h.topEra = this.h.nations.reduce((m, n) => (n.ended < 0 ? Math.max(m, n.era) : m), 0);
    this.spaceAgeYear = -1;
  }

  /**
   * A world saved before religion was taken out of the game (the owner's decision) is read with the names of today:
   * a town's faith becomes the story it tells, a prophet a teller, a temple nothing at all.
   */
  mend(): void {
    type Old = Record<string, unknown>;
    for (const st of this.settlements) {
      const o = st as unknown as Old;
      if (st.lore === undefined) st.lore = typeof o.belief === 'number' ? o.belief : -1;
      delete o.belief; delete o.temple;
      if (st.tongue === undefined) { const n = st.nation >= 0 ? this.h.nations[st.nation] : undefined; const c = n ? this.h.cultures[n.culture] : this.h.cultures.find((x) => x.species === st.species); if (c) st.tongue = c.language; }
    }
    for (const p of this.h.people) {
      const o = p as unknown as Old;
      if (o.role === 'prophet') p.role = 'teller';
      if (p.open === undefined) p.open = typeof o.pious === 'number' ? o.pious : 0.5;
      delete o.pious;
    }
    for (const c of this.h.cultures) {
      const o = c as unknown as Old;
      if (c.custom === undefined) c.custom = typeof o.faith === 'number' ? o.faith : 0.5;
      delete o.faith;
    }
    for (const c of this.h.calendars ?? []) if ((c.kind as string) === 'prophet') c.kind = 'teaching';
    for (const w of this.h.wonders ?? []) { if ((w.kind as string) === 'crater-temple') w.kind = 'crater-stair'; if ((w.kind as string) === 'fire-temple') w.kind = 'fire-watch'; if ((w.kind as string) === 'colossus') { w.kind = 'great-bell'; w.what = 'a bell of bronze as tall as a hill'; } }
  }

  /** A sight in the sky that every young culture sees: in some towns it becomes the story they tell of themselves. */
  sighting(sim: Simulation, eventId: number, rng: RNG): void {
    for (const st of this.settlements) {
      if (st.ruined >= 0 || st.lore >= 0 || st.tech > 0.7 || !rng.chance(0.5)) continue;
      st.lore = eventId;
      const at = sim.events.events.length;
      sim.civEvent('story', st.species, st.cell, st.id, eventId);
      this.stepForward(sim, st, at, 'The one who first told it was {name}.', 'teller');
    }
  }

  private neighbourCount(sim: Simulation, st: Settlement): number {
    const reg = sim.regions;
    let n = 0;
    for (let j = 0; j < reg.grid.ncount[st.region]!; j++) if (this.occupied.has(reg.grid.neighbors[st.region * 6 + j]!)) n++;
    return n;
  }

  private found(sim: Simulation, rng: RNG, species: number, region: number, parent: number, year: number): Settlement | null {
    const reg = sim.regions, w = sim.world;
    // a habitable land cell in the region, preferring low ground near water
    let cell = -1, best = -Infinity;
    for (let k = reg.cellStart[region]!; k < reg.cellStart[region + 1]!; k++) {
      const c = reg.cellList[k]!;
      const h = w.elevation[c]! - w.seaLevel;
      if (h <= 0.01) continue;
      const score = -h + w.flow[c]! * 0.1 + rng.next() * 0.3;
      if (score > best) { best = score; cell = c; }
    }
    if (cell < 0) return null;
    // People build where people built before (system E17): on the mound of the last town that stood in this country,
    // if its site is still dry land.
    let under: Settlement | undefined;
    for (let i = this.settlements.length - 1; i >= 0 && !under; i--) { const x = this.settlements[i]!; if (x.region === region && x.ruined >= 0 && w.elevation[x.cell]! - w.seaLevel > 0.01) under = x; }
    if (under) cell = under.cell;
    // named in the people's own language, from what the name means
    const id = this.settlements.length;
    // (the tongue of those who founded it: the country its mother town belongs to, or the first people of its kind)
    const mother = parent >= 0 ? this.settlements[parent] : undefined;
    const founders = mother && mother.nation >= 0 ? this.h.nations[mother.nation] : undefined;
    const lang = founders ? this.languageOf(founders) : this.h.languages[mother?.tongue ?? this.cultureFor(sim, species, year).language]!;
    let meanings = placeMeanings(hash32(this.seedNum, id));
    let name = compound(lang, meanings.head, meanings.modifier, year);
    for (let salt = 1; salt < 6 && this.settlements.some((x) => x.name === name); salt++) { meanings = placeMeanings(hash32(this.seedNum, id, salt)); name = compound(lang, meanings.head, meanings.modifier, year); }
    const st: Settlement = {
      id, name, cell, region, species, pop: 0.2, tech: 0.03, founded: year, lore: -1, eventId: -1, ruined: -1, painted: false, farms: false, stars: false,
      nation: -1, head: meanings.head, modifier: meanings.modifier ?? '', relic: -1, homeTemp: reg.landTemp[region]!, tongue: lang.id,
      strata: [{ year, kind: 'camp', tech: 0.03, eventId: -1 }], over: under ? under.id : undefined,
    };
    this.settlements.push(st);
    this.occupied.set(region, st.id);
    sim.cellLog.note(cell, year, Log.Settled, st.id);
    // a later people building where an older, different people once lived find what was left behind
    const ruin = this.settlements.find((x) => x.region === region && x.ruined >= 0 && x.species !== species && x.tech > 0.25);
    if (ruin) sim.civEvent('rediscover', species, cell, st.id, ruin.id);
    sim.civEvent(parent < 0 ? 'camp' : 'daughter', species, cell, st.id);
    return st;
  }

  /** The ground a town stands on, as calamities see it (system E20). */
  private groundOf(sim: Simulation, st: Settlement): Ground & { mountain: number } {
    const w = sim.world, g = sim.grid, cell = st.cell;
    let coast = false;
    for (let j = 0; j < g.ncount[cell]!; j++) if (w.elevation[g.neighbors[cell * 6 + j]!]! <= w.seaLevel) coast = true;
    const river = Math.min(1, w.flow[cell]! * 4);
    const shore = coast ? sat(1 - (w.elevation[cell]! - w.seaLevel) / 0.15) : 0;
    // the nearest volcano, if one is within a few days' walk
    let peak = 0, mountain = -1;
    const p = g.pos;
    for (const v of sim.geology.volcanoes) {
      const d = p[cell * 3]! * p[v.cell * 3]! + p[cell * 3 + 1]! * p[v.cell * 3 + 1]! + p[cell * 3 + 2]! * p[v.cell * 3 + 2]!;
      const near = sat((d - 0.9925) / 0.0075);
      if (near > peak && v.cell !== cell) { peak = near; mountain = v.cell; }
    }
    return { dry: sat(1 - w.moisture[cell]!), low: Math.max(river > 0.3 ? river : 0, shore), fault: Math.min(1, Math.abs(sim.geology.convergence[cell] ?? 0)), peak, mountain };
  }

  /**
   * Disasters in cities (system E20). A town of timber in a dry country burns; one on the edge of a plate is
   * shaken down; one on low ground by a river or the sea is flooded; one under a volcano is buried in ash. How
   * much is lost depends on what it is built of and where it stands (`sim/history/calamity.ts`).
   */
  private calamity(sim: Simulation, rng: RNG, n: Nation, st: Settlement, capacity: number, y: number, year: number): void {
    if (st.tech < 0.3 || st.pop < 1) return;
    // (a cheap gate first: no town suffers more than one calamity in sixty years on average, and most far fewer)
    const ceiling = 1 / 60;
    if (!rng.chance(1 - Math.exp(-y * ceiling))) return;
    const ground = this.groundOf(sim, st);
    const risk = hazards(st.tech, st.pop / Math.max(0.5, capacity), ground, n.codes);
    const total = risk.fire + risk.quake + risk.flood + risk.ash;
    if (!rng.chance(Math.min(1, total / ceiling))) return;
    let pick = rng.next() * total;
    const kind: CalamityKind = (pick -= risk.fire) < 0 ? 'fire' : (pick -= risk.quake) < 0 ? 'quake' : (pick -= risk.flood) < 0 ? 'flood' : 'ash';
    const share = damage(kind, st.tech, ground, rng.next(), n.codes);
    const part = share >= 0.75 ? 'almost all' : share >= 0.55 ? 'more than half' : share >= 0.4 ? 'nearly half' : share >= 0.27 ? 'a third' : share >= 0.17 ? 'a fifth' : 'a part';
    const great = share >= 0.33;
    const peakName = kind === 'ash' ? sim.geology.volcanoes.find((v) => v.cell === ground.mountain)?.name ?? 'the mountain' : '';
    const [type, title, description] = kind === 'fire'
      ? ['city-fire', great ? `The great fire of ${st.name}` : `Fire in ${st.name}`, rng.pick([`A fire that began in one kitchen crosses ${st.name} on the wind. By morning ${part} of the town is ash.`, `In a dry season ${st.name} burns for three days. ${capital(part)} of it is gone when the wind drops.`, `Fire runs along the roofs of ${st.name} faster than anyone can pull them down. ${capital(part)} of the town is lost.`])]
      : kind === 'quake'
        ? ['city-quake', `${st.name} is thrown down`, rng.pick([`The ground under ${st.name} moves for less than a minute. ${capital(part)} of the town is rubble at the end of it.`, `An earthquake brings down ${part} of ${st.name}. ${st.tech < 0.8 && st.tech > 0.45 ? 'The tallest buildings fall first.' : 'What was built light is still standing.'}`])]
        : kind === 'flood'
          ? ['city-flood', `The flood at ${st.name}`, rng.pick([`The water rises through ${st.name} in a night and stays for a month. ${capital(part)} of the town stood on the low ground.`, `After weeks of rain the water comes into ${st.name}. ${capital(part)} of the town is under it.`])]
          : ['eruption', `${capital(peakName)} buries ${st.name}`, `${capital(peakName)} wakes. Ash falls on ${st.name} for days, and ${part} of the town, the side toward the mountain, lies under it.`];
    const ev = sim.emit({
      type, year, cellId: kind === 'ash' && ground.mountain >= 0 ? ground.mountain : st.cell, title, description,
      causes: [st.eventId, n.eventId].filter((x, i, a) => x >= 0 && sim.events.events[x] && a.indexOf(x) === i), causeWeights: [1, 0.3],
      importance: share >= 0.55 && st.id === n.capital ? 2 : great ? 1 : 0, speciesIds: [st.species], data: { nation: n.id, settlement: st.id, share: Math.round(share * 100) / 100 },
    });
    // people: most get out of a fire, fewer out of falling walls or ash
    st.pop *= 1 - share * (kind === 'fire' ? 0.15 : kind === 'flood' ? 0.2 : kind === 'quake' ? 0.35 : 0.5);
    if (kind === 'ash' && ground.mountain >= 0) sim.world.ash[st.cell] = Math.max(sim.world.ash[st.cell]!, 0.5 * share);
    this.layer(st, year, kind === 'fire' ? 'burnt' : kind === 'quake' ? 'shaken' : kind === 'flood' ? 'flood' : 'ash', ev.id, 30);
    this.woe(n, 'disaster', ev.id, year, 0.03 + 0.12 * share / Math.max(1, n.towns));
    if (kind === 'quake') this.fortify(st, year);
    this.scar(sim, rng, n, st, kind, share, ev.id, year, kind === 'ash' && ground.mountain >= 0 ? ground.mountain : undefined);
  }

  /**
   * A calamity leaves its mark on a town, and the town answers it (system E20): it builds again as before, or
   * differently. The first answer of a kind in a country is a building law, an event caused by the calamity,
   * and every town of that country builds by it from then on.
   */
  private scar(sim: Simulation, rng: RNG | null, n: Nation | undefined, st: Settlement, kind: CalamityKind, share: number, eventId: number, year: number, toward?: number): void {
    if (st.tech < 0.3) return;
    const how = answer(kind, share, st.tech, n?.codes);
    let rebuilt: Rebuild = how.rebuilt;
    if (how.law && n) {
      const which = kind === 'fire' ? 'fire' : kind === 'quake' ? 'quake' : 'flood';
      const firsts = (this.h.firstCodes ??= {});
      const first = firsts[which] === undefined;
      const text = kind === 'fire'
        ? [`${n.name} forbids thatch and timber in its towns`, `After the fire at ${st.name}, ${n.name} rules that within a town nothing may be roofed in thatch or fronted in timber. What burned is to be built again in stone and tile, and the streets made wide enough to stop a fire.`]
        : kind === 'quake'
          ? [`${n.name} rules how its towns may be built`, `After the earthquake at ${st.name}, ${n.name} rules that nothing in its towns may stand taller than three floors, and that every wall be tied with timber so that it bends before it breaks.`]
          : rebuilt === 'moved'
            ? [`${n.name} gives up the low ground`, `After the flood at ${st.name}, ${n.name} rules that no one may build again below the mark the water reached. The low quarter of ${st.name} is left to the reeds.`]
            : [`${n.name} raises its floors`, `After the flood at ${st.name}, ${n.name} rules that by the water every floor must stand on posts, a man's height above the mark the water reached.`];
      const ev = sim.emit({
        type: 'building-law', year, cellId: st.cell, title: first ? `The first building law: ${text[0]!}` : text[0]!, description: text[1]!,
        causes: [eventId, n.eventId].filter((x, i, a) => x >= 0 && sim.events.events[x] && a.indexOf(x) === i), causeWeights: [1, 0.3],
        importance: first ? 2 : 1, speciesIds: [n.species], data: { nation: n.id, settlement: st.id, kind: which },
      });
      (n.codes ??= {})[which] = { year, eventId: ev.id };
      if (first) firsts[which] = ev.id;
      this.credit(sim, rng, n, ev.id, 'The law was drawn up by {name}.', 'scholar', year);
    } else if (how.law) rebuilt = how.rebuilt === 'moved' ? 'moved' : '';
    const scars = (st.scars ??= []);
    const s: Scar = { year, kind, share, eventId, rebuilt };
    if (toward !== undefined) s.toward = toward;
    scars.push(s);
    if (scars.length > 5) scars.shift();
  }

  /** A disaster near settlements: people die, and in young towns it becomes the story they tell of themselves. */
  witness(sim: Simulation, eventId: number, regions: number[], kill: number[]): void {
    for (let k = 0; k < regions.length; k++) {
      const id = this.occupied.get(regions[k]!);
      if (id === undefined) continue;
      const st = this.settlements[id]!;
      st.pop *= 1 - Math.min(0.9, kill[k]!);
      // what struck it lies in its ground afterwards (system E17): ash, silt, or the rubble of fallen walls
      if (kill[k]! >= 0.2) {
        const what = sim.events.events[eventId]?.type ?? '';
        this.layer(st, sim.simYear, /erupt|impact|winter|volcan/.test(what) ? 'ash' : /tsunami|flood|sea|wave|storm/.test(what) ? 'flood' : /quake/.test(what) ? 'shaken' : 'burnt', eventId, 60);
      }
      const nation = st.nation >= 0 ? this.h.nations[st.nation] : undefined;
      // and it shows in the town afterwards (system E20): what the planet does to a town is answered like any other calamity
      if (kill[k]! >= 0.12 && this.historyActive) {
        const what = sim.events.events[eventId], type = what?.type ?? '';
        const kind: CalamityKind = /erupt|impact|winter|volcan/.test(type) ? 'ash' : /tsunami|flood|sea|wave|storm|hurricane/.test(type) ? 'flood' : /quake/.test(type) ? 'quake' : 'fire';
        this.scar(sim, null, nation && nation.ended < 0 ? nation : undefined, st, kind, Math.min(0.9, kill[k]!), eventId, sim.simYear, kind === 'ash' && what && what.cellId >= 0 && what.cellId !== st.cell ? what.cellId : undefined);
      }
      if (nation && nation.ended < 0) this.woe(nation, 'disaster', eventId, sim.simYear, 0.06 + 0.2 * Math.min(0.9, kill[k]!) / Math.max(1, nation.towns));
      if (st.lore < 0 && st.tech < 0.7) {
        st.lore = eventId;
        const at = sim.events.events.length;
        sim.civEvent('story', st.species, st.cell, st.id, eventId);
        this.stepForward(sim, st, at, '{name}, who lived through it, told the story so well that it is still told.', 'teller');
      }
    }
  }

  /** Paint night lights, farmland and roads onto the planet's cells. */
  private paint(sim: Simulation): void {
    const { lights, fields, elevation, seaLevel } = sim.world;
    lights.fill(0);
    fields.fill(0);
    const cleared = sim.world.cleared, flow = sim.world.flow;
    cleared.fill(0);
    const g = sim.grid, reg = sim.regions;
    for (const st of this.settlements) {
      if (st.ruined >= 0) continue;
      // ---- the land a town uses (system E16): its fields, the woods it cuts beyond them, its mine and its dam
      if (st.farms && this.landUse) {
        const far = st.tech > 0.3, further = st.pop > 60 && st.tech > 0.45;
        // (a late age plants as it cuts: its outer woods are thinned, not felled)
        const outer = st.tech > 1.05 ? 0.22 : 0.45;
        for (let j = 0; j < g.ncount[st.cell]!; j++) {
          const nb = g.neighbors[st.cell * 6 + j]!;
          if (elevation[nb]! <= seaLevel) continue;
          cleared[nb] = 1;
          if (!far) continue;
          for (let k = 0; k < g.ncount[nb]!; k++) {
            const n2 = g.neighbors[nb * 6 + k]!;
            if (elevation[n2]! <= seaLevel) continue;
            cleared[n2] = Math.max(cleared[n2]!, st.tech > 0.7 ? 1 : 0.5);
            if (further) for (let m = 0; m < g.ncount[n2]!; m++) { const n3 = g.neighbors[n2 * 6 + m]!; if (elevation[n3]! > seaLevel) cleared[n3] = Math.max(cleared[n3]!, outer); }
          }
        }
        cleared[st.cell] = 1;
        if (st.mine !== undefined && elevation[st.mine]! > seaLevel) { cleared[st.mine] = 1; lights[st.mine] = Math.max(lights[st.mine]!, st.tech > 0.85 ? 0.12 : 0.04); }
        // a dam holds a lake behind it: the river stands wide at the dam and for a way upstream
        const dam: number = st.dam ?? -1;
        if (dam >= 0 && elevation[dam]! > seaLevel) {
          flow[dam] = Math.max(flow[dam]!, 34);
          let above = -1, most = 0;
          for (let j = 0; j < g.ncount[dam]!; j++) { const cell: number = g.neighbors[dam * 6 + j]!; if (sim.world.downhill[cell] === dam && flow[cell]! > most) { most = flow[cell]!; above = cell; } }
          if (above >= 0) flow[above] = Math.max(flow[above]!, 24);
        }
      }
      const glow = Math.min(1, 0.12 + st.tech * 0.9);
      lights[st.cell] = Math.max(lights[st.cell]!, glow);
      for (let j = 0; j < g.ncount[st.cell]!; j++) {
        const nb = g.neighbors[st.cell * 6 + j]!;
        if (elevation[nb]! <= seaLevel) continue;
        if (st.tech > 0.45) lights[nb] = Math.max(lights[nb]!, glow * (st.tech - 0.4) * 0.9);
        if (st.farms) {
          fields[nb] = Math.max(fields[nb]!, Math.min(1, st.tech * 1.4));
          // big cities are ringed by a second belt of farms
          if (st.tech > 0.7) for (let k = 0; k < g.ncount[nb]!; k++) {
            const n2 = g.neighbors[nb * 6 + k]!;
            if (elevation[n2]! > seaLevel) fields[n2] = Math.max(fields[n2]!, 0.6);
          }
        }
      }
      // sea trade: lamp-lit ships between cities that face the same water
      if (st.tech > 0.7 && this.settlements.length > 3) {
        const other = this.settlements[(st.id * 7 + 3) % this.settlements.length]!;
        const ax = g.pos[st.cell * 3]!, ay = g.pos[st.cell * 3 + 1]!, az = g.pos[st.cell * 3 + 2]!;
        const tx = g.pos[other.cell * 3]!, ty = g.pos[other.cell * 3 + 1]!, tz = g.pos[other.cell * 3 + 2]!;
        if (other.ruined < 0 && other.id !== st.id && other.tech > 0.5 && ax * tx + ay * ty + az * tz > 0.8) {
          let cur = st.cell, wet = 0;
          for (let step = 0; step < 40 && cur !== other.cell; step++) {
            let best = cur, bd = g.pos[cur * 3]! * tx + g.pos[cur * 3 + 1]! * ty + g.pos[cur * 3 + 2]! * tz;
            for (let k = 0; k < g.ncount[cur]!; k++) {
              const nb = g.neighbors[cur * 6 + k]!;
              const d = g.pos[nb * 3]! * tx + g.pos[nb * 3 + 1]! * ty + g.pos[nb * 3 + 2]! * tz;
              if (d > bd) { bd = d; best = nb; }
            }
            if (best === cur) break;
            cur = best;
            if (elevation[cur]! <= seaLevel) { lights[cur] = Math.max(lights[cur]!, 0.14); wet++; }
          }
          if (wet > 2 && !this.ships) { this.ships = true; const at = sim.events.events.length; sim.civEvent('trade', st.species, st.cell, st.id); this.stepForward(sim, st, at, 'The first captain to make the crossing and come home was {name}.', 'explorer'); }
        }
      }
      // roads: lit ways between neighbouring towns
      if (st.tech > 0.55) {
        for (let j = 0; j < reg.grid.ncount[st.region]!; j++) {
          const other = this.occupied.get(reg.grid.neighbors[st.region * 6 + j]!);
          if (other === undefined || other >= st.id) continue;
          const target = this.settlements[other]!.cell;
          const tx = g.pos[target * 3]!, ty = g.pos[target * 3 + 1]!, tz = g.pos[target * 3 + 2]!;
          let cur = st.cell;
          for (let step = 0; step < 14 && cur !== target; step++) {
            let best = cur, bd = g.pos[cur * 3]! * tx + g.pos[cur * 3 + 1]! * ty + g.pos[cur * 3 + 2]! * tz;
            for (let k = 0; k < g.ncount[cur]!; k++) {
              const nb = g.neighbors[cur * 6 + k]!;
              const d = g.pos[nb * 3]! * tx + g.pos[nb * 3 + 1]! * ty + g.pos[nb * 3 + 2]! * tz;
              if (d > bd) { bd = d; best = nb; }
            }
            if (best === cur) break;
            cur = best;
            if (elevation[cur]! > seaLevel) lights[cur] = Math.max(lights[cur]!, 0.16);
          }
        }
      }
    }
  }
}

/** One line on what changes when an era begins. */
function eraLine(era: number): string {
  return [
    'They wander and make camp.',
    'They plant, they wait, and they stay where the harvest is.',
    'Clay goes into the fire and comes out as jars, bricks and tallies that outlast the hand that made them.',
    'Stone is piled on stone until a town can shut its gates.',
    'Ships leave sight of land on purpose, and come back.',
    'What one person writes can now be read by thousands who never met them.',
    'Fire is put to work. It pulls, it pumps, and it never tires.',
    'Voices and pictures cross the world faster than any messenger.',
    'They have put their own machines above the sky.',
    'They are doing things their grandparents had no words for.',
  ][era] ?? '';
}
