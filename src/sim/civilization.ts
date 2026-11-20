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
import { Log } from './history/celllog';
import { eraOf, eraSlot, eraTitle, earthNote } from './history/eras';
import { hash32 } from './history/hash';
import { capital, compound, makeLanguage, personName, placeMeanings, word, type Language } from './history/language';
import { emptyHistory, type Culture, type Dynasty, type HistoryState, type Nation, type Person, type Role } from './history/model';
import { SLOT_INDEX, WEB, borrowable, chooseNext, copyKnowledge, forget, levelOf, newKnowledge, shed, wayFor, type Land, type Leaning } from './history/tech';

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
  /** Event the people's beliefs are founded on, or -1. */
  belief: number;
  eventId: number;
  ruined: number; // year it was abandoned, or -1
  painted: boolean;
  temple: boolean;
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
/** How far from its capital a nation of each era can hold a town, counted in regions (the spacing of neighbouring towns). */
const REACH = [2.5, 3.5, 4.5, 6, 10, 14, 22, 45, 99, 99];

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
        if (prey >= 0) sim.civEvent('painting', st.species, st.cell, st.id, prey);
      }
      // bands split off and make new camps
      if (st.pop > capacity * 0.7 && rng.chance(Math.min(0.5, 0.05 * tau))) {
        const nb = reg.grid.neighbors[st.region * 6 + rng.int(reg.grid.ncount[st.region]!)]!;
        if (!this.occupied.has(nb) && reg.land[nb]! > 0.3 && reg.ice[nb]! < 0.5) {
          const d = this.found(sim, rng, st.species, nb, st.id, sim.simYear);
          if (d) { d.tech = st.tech * 0.6; d.belief = st.belief; st.pop *= 0.85; }
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
    const years = Math.max(1, Math.ceil(h.pending / MAX_TICKS));
    const ticks = Math.floor(h.pending / years);
    const start = sim.simYear - h.pending;
    sim.quietEvents = years > SUMMARY_YEARS;
    for (let k = 0; k < ticks; k++) this.tick(sim, rng, years, start + (k + 1) * years);
    sim.quietEvents = false;
    h.pending -= ticks * years;
    this.census();
    this.paint(sim);
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
        if (rng.chance(1 - Math.exp(-hazard * y))) this.succession(sim, rng, n, year, age > span * 0.75 ? 'died of old age' : rng.pick(['died of a fever', 'died in a fall', 'died after a short illness', 'was killed hunting', 'died in the night']));
      }
      // ---- knowledge: more people, clever people and neighbours to learn from all speed it; so does what is already known
      const reach = Math.min(4, towns.length - 1) * 0.08;
      const quick = 1 + 6 * sat((n.tech - 0.7) / 0.3) ** 2;
      // (learning gathers where the people are: a country much smaller than the greatest of its day works more slowly)
      const rate = 6.5e-5 * (0.5 + 0.5 * Math.min(1, towns.length / Math.max(1, 0.5 * most))) * (0.45 + Math.log10(1 + pop) / 3) * (0.6 + sp.ref[G.Intelligence]!) * (1 + reach) * quick * (0.6 + 0.4 * n.stability) * (0.9 + 0.2 * (ruler ? ruler.wise : 0.5));
      this.research(sim, rng, n, towns, rate * y, year, y);
      // ---- a library burns (system E5): likelier in troubled times, and only once there is writing to burn
      if (n.know.way[SLOT_INDEX.get('write')!]! >= 0 && rng.chance(1 - Math.exp(-y * (0.4 + 1.6 * (1 - n.stability) + n.fatigue) / 2600))) {
        const capTown = this.settlements[n.capital]!;
        this.loseKnowledge(sim, rng, n, towns, 2 + rng.int(3), year, `The library of ${capTown.name} has burned${n.fatigue > 0.2 ? ' in the fighting' : ''}.`, n.woes.length ? n.woes[n.woes.length - 1]!.eventId : -1);
      }
      // ---- how well it holds together, and what happens when it does not (system E4)
      if (this.fate(sim, rng, n, towns, y, year)) continue;
      // ---- in hard years a preacher may rise
      if (this.fine && n.woes.length && year - n.woes[n.woes.length - 1]!.year < 25 && rng.chance(1 - Math.exp(-y * 0.006))) this.preacher(sim, rng, n, year);
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
    if (!st.temple && st.tech > 0.3 && sim.godEvents.length >= 3) { st.temple = true; const at = sim.events.events.length; sim.civEvent('temple', st.species, st.cell, st.id); this.stepForward(sim, st, at, 'Its carvings are the work of {name}.', 'artist'); }
    if (st.tech >= 0.3 && before < 0.3) { const at = sim.events.events.length; sim.civEvent('village', st.species, st.cell, st.id); if (sim.events.events.length > at) this.credit(sim, null, n, at, 'It answers to {name}.'); }
    if (st.tech >= 0.6 && before < 0.6) { const at = sim.events.events.length; sim.civEvent('city', st.species, st.cell, st.id); if (sim.events.events.length > at) this.credit(sim, rng, n, at, `Its great hall is the work of {name}.`, 'artist', year); }
    if (sizeClass(st.tech) !== sizeClass(before)) sim.cellLog.note(st.cell, year, Log.Size, sizeClass(st.tech));
    if (!this.hasMusic && st.tech > 0.35) { this.hasMusic = true; const at = sim.events.events.length; sim.civEvent('music', st.species, st.cell, st.id); if (sim.events.events.length > at) this.credit(sim, rng, n, at, `The first tune anyone wrote down is by {name}.`, 'artist', year); }
    // star lore: villagers name a constellation after a vanished animal whose bones they find
    if (!st.stars && st.tech > 0.4) {
      st.stars = true;
      const gone = cr.species.filter((x) => x.extinctYear >= 0 && x.peakRegions >= 10 && x.name);
      if (gone.length && rng.chance(0.12)) sim.civEvent('constellation', st.species, st.cell, st.id, rng.pick(gone).id);
    }
    // war: neighbours of another nation, another kind or another faith sometimes fight (campaigns proper are system E33)
    const head = this.h.people[n.ruler];
    if (st.tech > 0.3 && rng.chance(Math.min(0.5, 0.0004 * y * (0.6 + 0.8 * (head ? head.bold : 0.5))))) {
      for (let j = 0; j < reg.grid.ncount[st.region]!; j++) {
        const oid = this.occupied.get(reg.grid.neighbors[st.region * 6 + j]!);
        if (oid === undefined) continue;
        const o = this.settlements[oid]!;
        if (o.nation === st.nation && o.species === st.species) continue;
        if (o.species === st.species && (o.belief === st.belief || o.belief < 0 || st.belief < 0) && !rng.chance(0.35)) continue;
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
        const warAt = sim.events.events.length;
        sim.civEvent('war', st.species, st.cell, st.id, o.id);
        const warEvent = sim.events.events.length > warAt ? warAt : -1;
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
          d.tech = Math.max(FARMING, st.tech * 0.6); d.belief = st.belief; d.farms = true; st.pop *= 0.85;
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
      war: sat(g[G.Aggression]! * 0.7 + g[G.Territorial]! * 0.4), faith: sat(0.35 + (1 - g[G.Curiosity]!) * 0.4 + g[G.Sociality]! * 0.2),
      trade: sat(g[G.Sociality]! * 0.5 + g[G.Curiosity]! * 0.5), craft: sat(g[G.Intelligence]! * 0.7 + g[G.Curiosity]! * 0.3), hue: g[G.Glow]! > 0.4 ? g[G.GlowHue]! : g[G.Hue]!,
    };
    lang.name = c.name;
    h.cultures.push(c);
    return c;
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
      born: year - age, died: -1, dynasty, parent, bold: lean(elder?.bold), wise: lean(elder?.wise), cruel: lean(elder?.cruel), pious: lean(elder?.pious),
      events: [], fate: '', reignFrom: role === 'ruler' ? year : -1, reignTo: -1, patron: role === 'ruler' || role === 'founder' ? -1 : n.ruler, rival: -1, rose: year, era: n.era,
    };
    h.people.push(p);
    if (role !== 'ruler' && role !== 'founder') h.notables.push(p.id);
    return p;
  }

  private dynasty(n: Nation, founder: Person, year: number): Dynasty {
    const h = this.h;
    const d: Dynasty = { id: h.dynasties.length, name: `House of ${founder.name}`, nation: n.id, founder: founder.id, founded: year, ended: -1, rulers: [founder.id], reigns: 1 };
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

  /** Someone from a town steps forward at an event there: a prophet at a new faith, a captain on the first ships. */
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
      const risk = old ? 1 : p.role === 'general' ? 5 : p.role === 'explorer' ? 4 : p.role === 'prophet' ? 2.5 : 1;
      const hazard = 0.006 * risk * Math.exp((age - 0.55 * span) / (0.14 * span));
      if (!rng.chance(1 - Math.exp(-hazard * y))) continue;
      p.died = year;
      p.fate = p.role === 'general' ? (old ? 'died in bed, to the surprise of many' : rng.pick(['fell in battle', 'died of a wound that would not heal', 'was put to death by a jealous ruler']))
        : p.role === 'prophet' ? (old ? 'died old, surrounded by followers' : rng.pick(['was stoned by a crowd', 'walked into the hills and was not seen again', 'died fasting']))
        : p.role === 'explorer' ? (old ? 'died at home, still talking of the sea' : rng.pick(['was lost with all hands', 'died of a fever far from home', 'never came back']))
        : p.role === 'artist' ? (old ? 'died old and famous' : rng.pick(['died poor', 'died young, with the great work unfinished', 'drank to death']))
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
   * quarrels of faith, and how much land it is trying to hold. When stability fails the nation loses a
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
    const faiths = new Map<number, number>();
    for (const st of towns) {
      crowd += Math.min(2, st.pop / Math.max(0.5, this.capacity(sim, st)));
      faiths.set(st.belief, (faiths.get(st.belief) ?? 0) + 1);
      if (angle(cap, st) > REACH[n.era]! * spacing) far++;
    }
    const hunger = sat((crowd / towns.length - 0.97) * 5);
    const split = towns.length > 1 ? 1 - Math.max(...faiths.values()) / towns.length : 0;
    const overreach = far / towns.length;
    const size = Math.log2(1 + towns.length) / 7;
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
      [split * 0.2, 'its towns no longer shared a faith'], [overreach * 0.3, 'its roads were too long to hold'], [size * 0.3, 'it had grown too large to govern'],
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
    // the records of rulers close: from here no one keeps them
    for (const x of h.nations) {
      if (x.ended >= 0) continue;
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
            if (d) { d.tech = st.tech; d.belief = st.belief; d.farms = true; d.nation = n.id; d.pop = Math.max(d.pop, st.pop * 0.1); if (bySea) d.overseas = true; sim.cellLog.note(d.cell, year, Log.Owner, n.id); }
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

  /** In hard years someone walks from town to town with a new teaching (system E6). What comes of it depends on who rules. */
  private preacher(sim: Simulation, rng: RNG, n: Nation, year: number): void {
    const h = this.h;
    const woe = n.woes[n.woes.length - 1];
    if (!woe || h.notables.some((id) => h.people[id]!.role === 'prophet' && h.people[id]!.nation === n.id)) return;
    const ruler = h.people[n.ruler];
    const cap = this.settlements[n.capital]!;
    const who = this.person(rng, n, 'prophet', year, this.lifespan(sim, n.species) * (0.25 + rng.next() * 0.3), -1, -1);
    const after = woe.kind === 'plague' ? 'After the plague' : woe.kind === 'war' ? 'After the war' : woe.kind === 'disaster' ? 'After the disaster' : 'In the quarrel over who should rule';
    const says = woe.kind === 'plague' ? rng.pick(['that the sickness was a judgment on the rich', 'that the dead are owed more than a pit', 'that the wells must be kept clean and holy'])
      : woe.kind === 'war' ? rng.pick(['that no more children should be sent to the wars', 'that the dead of both sides lie in the same ground', 'that the war was lost for want of faith'])
        : woe.kind === 'disaster' ? rng.pick(['that the land itself has spoken', 'that what was thrown down was built in pride', 'that the sky will ask again'])
          : rng.pick(['that no house rules by right', 'that the crown belongs to whoever is just', 'that rulers answer to something higher']);
    let end: string;
    if (ruler && ruler.cruel > 0.62 && ruler.pious < 0.6) {
      who.died = year; who.fate = `was put to death by ${ruler.name}`;
      h.notables.splice(h.notables.indexOf(who.id), 1);
      n.stability = sat(n.stability - 0.06);
      end = `${ruler.name} has ${who.name} put to death, and the teaching spreads the faster for it.`;
    } else if (ruler && ruler.pious > 0.55) {
      n.stability = sat(n.stability + 0.08);
      end = `${ruler.name} sends for ${who.name} and listens, and the country is quieter for it.`;
    } else {
      n.stability = sat(n.stability - 0.03); n.inequality = sat(n.inequality - 0.05);
      end = `The poor follow ${who.name}; the court does not, and the granaries are opened to keep the peace.`;
    }
    const ev = sim.emit({
      type: 'prophet', year, cellId: cap.cell, title: `${who.name} preaches in ${n.name}`,
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
      life: 0.8 + 0.4 * c.faith, sea: 0.7 + 0.6 * c.trade, sky: 0.75 + 0.5 * c.craft, build: 0.8 + 0.4 * c.faith, food: 1, power: 1,
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
    ruler.bold = rng.next(); ruler.wise = rng.next(); ruler.cruel = rng.next(); ruler.pious = rng.next();
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
      house.name = `House of ${ruler.name}`; house.founded = year; house.reigns = 1; house.rulers = [ruler.id]; house.founder = ruler.id;
    } else house.reigns += reigns;
  }

  /** The ruler is gone: an heir of the house follows, or the house falls and another takes its place. */
  private succession(sim: Simulation, rng: RNG, n: Nation, year: number, fate: string): void {
    const h = this.h;
    const old = h.people[n.ruler]!;
    old.died = year; old.reignTo = year; old.fate = fate;
    const span = this.lifespan(sim, n.species);
    const house = h.dynasties[n.dynasty];
    // an heir is likelier in a steady realm
    if (house && rng.chance(0.84 + 0.14 * n.stability)) {
      const next = this.person(rng, n, 'ruler', year, span * (0.25 + rng.next() * 0.3), old.id, house.id);
      house.rulers.push(next.id);
      house.reigns++;
      n.ruler = next.id;
      return;
    }
    if (house) house.ended = year;
    const next = this.person(rng, n, 'ruler', year, span * (0.3 + rng.next() * 0.25), -1, -1);
    const line = this.dynasty(n, next, year);
    n.ruler = next.id; n.dynasty = line.id;
    const cap = this.settlements[n.capital]!;
    const ev = sim.emit({
      type: 'dynasty', year, cellId: cap.cell, title: `A new house in ${n.name}`,
      description: house ? `${old.name} ${fate} and left no heir the great families would follow. ${next.name} takes ${cap.name}, and the ${house.name} is over after ${house.reigns} ${house.reigns === 1 ? 'reign' : 'reigns'}.` : `${next.name} takes power in ${cap.name}.`,
      causes: [n.eventId].filter((x) => x >= 0), importance: house && house.reigns >= 12 ? 1 : 0, speciesIds: [n.species], data: { nation: n.id, person: next.id },
    });
    next.events.push(ev.id); old.events.push(ev.id);
    this.woe(n, 'succession', ev.id, year, 0.16);
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
  private newNation(sim: Simulation, rng: RNG, st: Settlement, year: number, from: Nation | null, why: 'far' | 'breakaway' | 'successor' = 'far', because: number[] = []): Nation {
    const h = this.h;
    const culture = this.cultureFor(sim, st.species, year);
    const lang = h.languages[culture.language]!;
    // named for its first town, in its own tongue
    let name = compound(lang, 'land', st.modifier || st.head, year);
    for (let salt = 0; h.nations.some((x) => x.name === name) && salt < 6; salt++) name = compound(lang, ['land', 'people', 'hold', 'march', 'reach', 'home'][salt]!, salt % 2 ? st.head : `${st.head}-${salt}`, year);
    const n: Nation = {
      id: h.nations.length, name, culture: culture.id, species: st.species, capital: st.id, founded: year, ended: -1, parent: from ? from.id : -1, government: 'chiefdom',
      ruler: -1, dynasty: -1, stability: 0.7, tech: st.tech, era: eraOf(st.tech), hue: (culture.hue + ((hash32(this.seedNum, h.nations.length, 7) % 1000) / 1000) * 0.3 + 0.85) % 1, eventId: -1, pop: st.pop, towns: 1,
      know: newKnowledge(), land: [], surveyed: -1e9, contacts: [], inequality: from ? from.inequality * 0.5 : 0.05, fatigue: 0, woes: [], peakYear: year, peakTowns: 1,
    };
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
    const first = this.person(rng, n, 'founder', year, span * (0.3 + rng.next() * 0.25), -1, -1);
    first.reignFrom = year;
    const house = this.dynasty(n, first, year);
    n.ruler = first.id; n.dynasty = house.id;
    st.nation = n.id;
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
    sim.cellLog.note(st.cell, year, Log.Owner, n.id);
    sim.cellLog.note(st.cell, year, Log.Era, n.era);
    return n;
  }

  /** The records of a nation that has ceased to exist are closed. */
  private closeNation(n: Nation, year: number, fate: string): void {
    const h = this.h;
    n.ended = year; n.pop = 0; n.towns = 0;
    const ruler = h.people[n.ruler];
    if (ruler && ruler.died < 0) { ruler.died = year; ruler.reignTo = year; ruler.fate = fate === 'fell apart' ? 'was the last to rule it' : 'died with the country'; }
    const house = h.dynasties[n.dynasty];
    if (house && house.ended < 0) house.ended = year;
  }

  private endNation(sim: Simulation, n: Nation, year: number): void {
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
    this.occupied.delete(st.region);
    sim.cellLog.note(st.cell, year, Log.Ruined, st.id);
    sim.cellLog.note(st.cell, year, Log.Owner, -1);
    sim.civEvent('ruin', st.species, st.cell, st.id);
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

  /** A sight in the sky that every young culture sees: some will build a faith on it. */
  omen(sim: Simulation, eventId: number, rng: RNG): void {
    for (const st of this.settlements) {
      if (st.ruined >= 0 || st.belief >= 0 || st.tech > 0.7 || !rng.chance(0.5)) continue;
      st.belief = eventId;
      const at = sim.events.events.length;
      sim.civEvent('belief', st.species, st.cell, st.id, eventId);
      this.stepForward(sim, st, at, 'The one who first preached it was {name}.', 'prophet');
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
    // named in the people's own language, from what the name means
    const id = this.settlements.length;
    const lang = this.h.languages[this.cultureFor(sim, species, year).language]!;
    let meanings = placeMeanings(hash32(this.seedNum, id));
    let name = compound(lang, meanings.head, meanings.modifier, year);
    for (let salt = 1; salt < 6 && this.settlements.some((x) => x.name === name); salt++) { meanings = placeMeanings(hash32(this.seedNum, id, salt)); name = compound(lang, meanings.head, meanings.modifier, year); }
    const st: Settlement = {
      id, name, cell, region, species, pop: 0.2, tech: 0.03, founded: year, belief: -1, eventId: -1, ruined: -1, painted: false, temple: false, farms: false, stars: false,
      nation: -1, head: meanings.head, modifier: meanings.modifier ?? '', relic: -1,
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

  /** A disaster near settlements: people die, and young cultures build beliefs on what they saw. */
  witness(sim: Simulation, eventId: number, regions: number[], kill: number[]): void {
    for (let k = 0; k < regions.length; k++) {
      const id = this.occupied.get(regions[k]!);
      if (id === undefined) continue;
      const st = this.settlements[id]!;
      st.pop *= 1 - Math.min(0.9, kill[k]!);
      const nation = st.nation >= 0 ? this.h.nations[st.nation] : undefined;
      if (nation && nation.ended < 0) this.woe(nation, 'disaster', eventId, sim.simYear, 0.06 + 0.2 * Math.min(0.9, kill[k]!) / Math.max(1, nation.towns));
      if (st.belief < 0 && st.tech < 0.7) {
        st.belief = eventId;
        const at = sim.events.events.length;
        sim.civEvent('belief', st.species, st.cell, st.id, eventId);
        this.stepForward(sim, st, at, '{name}, who lived through it, told the story until it became a creed.', 'prophet');
      }
    }
  }

  /** Paint night lights, farmland and roads onto the planet's cells. */
  private paint(sim: Simulation): void {
    const { lights, fields, elevation, seaLevel } = sim.world;
    lights.fill(0);
    fields.fill(0);
    const g = sim.grid, reg = sim.regions;
    for (const st of this.settlements) {
      if (st.ruined >= 0) continue;
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
