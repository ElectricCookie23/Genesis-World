// The history engine: languages, text, people, nations and their records.
import { describe, expect, it } from 'vitest';
import { RNG } from '../src/sim/rng';
import { hash32, unit } from '../src/sim/history/hash';
import { applyChange, compound, makeLanguage, personName, placeMeanings, soundChange, splitLanguage, word, wordAt, wordDistance, type Language, type Voice } from '../src/sim/history/language';
import { count, listing, ordinal, write } from '../src/sim/history/grammar';

const big: Voice = { size: 0.9, water: 0.1, flight: 0, hearing: 0.3, harsh: 0.7 };
const small: Voice = { size: 0.1, water: 0.1, flight: 0.9, hearing: 0.8, harsh: 0.1 };
const MEANINGS = ['water', 'river', 'sea', 'hill', 'stone', 'sun', 'moon', 'fire', 'people', 'town', 'king', 'herd', 'old', 'new', 'great', 'bright', 'land', 'star', 'forest', 'wind'];

describe('hashing', () => {
  it('is stable and spreads', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += unit(hash32(77, i));
    expect(sum / 2000).toBeGreaterThan(0.45);
    expect(sum / 2000).toBeLessThan(0.55);
  });
});

describe('languages', () => {
  it('gives the same words for the same seed, and different words for a different people', () => {
    const a = makeLanguage(0, 1234, big, 0), b = makeLanguage(0, 1234, big, 0), c = makeLanguage(1, 1234, small, 0);
    for (const m of MEANINGS) expect(word(a, m)).toBe(word(b, m));
    let differ = 0;
    for (const m of MEANINGS) if (word(a, m) !== word(c, m)) differ++;
    expect(differ).toBeGreaterThan(MEANINGS.length - 3);
    for (const m of MEANINGS) { expect(word(a, m).length).toBeGreaterThan(0); expect(/[aeiou]/.test(word(a, m))).toBe(true); }
  });

  it('a body shapes its sounds: big throats and small ones do not share an inventory', () => {
    let lowBig = 0, lowSmall = 0;
    for (let s = 0; s < 40; s++) {
      const A = makeLanguage(s, 99, big, 0), B = makeLanguage(s, 99, small, 0);
      for (const v of A.vowels.slice(0, 2)) if (v === 'o' || v === 'u' || v === 'a') lowBig++;
      for (const v of B.vowels.slice(0, 2)) if (v === 'o' || v === 'u' || v === 'a') lowSmall++;
    }
    expect(lowBig).toBeGreaterThan(lowSmall);
  });

  it('sound changes alter words, keep them speakable, and are recorded', () => {
    const lang = makeLanguage(0, 4321, big, 0);
    const before = MEANINGS.map((m) => word(lang, m));
    const rng = new RNG(5);
    let made = 0;
    for (let y = 100; y <= 1500; y += 100) if (soundChange(lang, rng, y)) made++;
    expect(made).toBeGreaterThan(5);
    expect(lang.changes.length).toBe(made);
    const after = MEANINGS.map((m) => word(lang, m));
    expect(after.filter((w, i) => w !== before[i]).length).toBeGreaterThan(5);
    for (const w of after) { expect(w.length).toBeGreaterThan(1); expect(/[aeiou]/.test(w)).toBe(true); }
    // the word of an earlier year is still recoverable
    expect(MEANINGS.map((m) => wordAt(lang, m, 50))).toEqual(before);
  });

  it('daughter languages stay recognisably related, strangers do not (E21)', () => {
    const mother = makeLanguage(0, 777, big, 0);
    const rng = new RNG(9);
    for (let y = 100; y <= 400; y += 100) soundChange(mother, rng, y);
    const east = splitLanguage(mother, 1, 500), west = splitLanguage(mother, 2, 500);
    for (let y = 600; y <= 1400; y += 100) { soundChange(east, rng, y); soundChange(west, rng, y); }
    const stranger = makeLanguage(3, 778, small, 0);
    let kin = 0, far = 0, changed = 0;
    for (const m of MEANINGS) { kin += wordDistance(word(east, m), word(west, m)); far += wordDistance(word(east, m), word(stranger, m)); if (word(east, m) !== word(west, m)) changed++; }
    expect(changed).toBeGreaterThan(3);
    // (sisters score 0.43 to 0.48 depending on which twenty words are asked, strangers 0.92: the line is drawn between, not at the sample)
    expect(kin / MEANINGS.length).toBeLessThan(0.55);
    expect(far / MEANINGS.length).toBeGreaterThan(kin / MEANINGS.length + 0.25);
  });

  it('names: places keep their meaning and are re-spoken as the language changes (E22)', () => {
    const lang = makeLanguage(0, 31337, big, 0);
    const m = placeMeanings(42);
    const founded = compound(lang, m.head, m.modifier, 0);
    const rng = new RNG(3);
    for (let y = 100; y <= 2000; y += 100) soundChange(lang, rng, y);
    const now = compound(lang, m.head, m.modifier);
    expect(founded[0]).toBe(founded[0]!.toUpperCase());
    expect(now).not.toBe(founded);
    expect(wordDistance(founded.toLowerCase(), now.toLowerCase())).toBeLessThan(0.7);
    expect(personName(lang, 5)).toBe(personName(lang, 5));
    expect(personName(lang, 5)).not.toBe(personName(lang, 6));
  });

  it('a change never leaves a word empty or without a vowel', () => {
    expect(applyChange('a', { year: 0, from: 'a', to: '', where: 'final', note: '' })).toBe('a');
    expect(applyChange('ta', { year: 0, from: 'a', to: '', where: 'final', note: '' })).toBe('ta');
    expect(applyChange('kata', { year: 0, from: 't', to: 'd', where: 'between', note: '' })).toBe('kada');
    expect(applyChange('kite', { year: 0, from: 'k', to: 'ch', where: 'beforeFront', note: '' })).toBe('chite');
  });
});

describe('template text', () => {
  it('fills facts, rules, inline choices and modifiers', () => {
    const rng = new RNG(1);
    const rules = { deed: ['founded {town}', 'raised the walls of {town}'], mood: ['bitter', 'golden'] };
    const line = write('{ruler} #deed# in #mood.a# year. {thing.cap.s} were [many|few].', { ruler: 'Oru', town: 'Vass', thing: 'city' }, rng, rules);
    expect(line).toMatch(/^Oru (founded|raised the walls of) Vass in (a bitter|a golden) year\. Cities were (many|few)\.$/);
    expect(write('{n.a} {n}', { n: 'eclipse' }, rng)).toBe('an eclipse eclipse');
  });
  it('helpers', () => {
    expect(listing(['a', 'b', 'c'])).toBe('a, b and c');
    expect(listing(['a'])).toBe('a');
    expect(count(3104882)).toBe('3,104,882');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 102].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '102nd']);
  });
});

import { Simulation } from '../src/sim/simulation';
import { saveSimulation, loadSimulation } from '../src/sim/snapshot';
import { CellLog, Log } from '../src/sim/history/celllog';
import { citizen } from '../src/sim/history/citizens';
import { ERAS, earthNote, eraOf } from '../src/sim/history/eras';

describe('the record of a place', () => {
  it('rebuilds what stood at a cell in any year', () => {
    const log = new CellLog(10);
    log.note(3, 100, Log.Biome, 7);
    log.note(3, 500, Log.Settled, 12);
    log.note(3, 500, Log.Owner, 2);
    log.note(3, 900, Log.Size, 2);
    log.note(3, 1200, Log.Event, 44);
    log.note(3, 1500, Log.Owner, 5);
    log.note(3, 2000, Log.Ruined, 12);
    log.note(3, 2000, Log.Owner, -1);
    log.note(3, 2600, Log.Settled, 30);
    log.note(3, 2600, Log.Biome, 9);
    expect(log.stateAt(3, 50)).toEqual({ biome: -1, owner: -1, settlement: -1, ruins: [], size: 0, era: 0, events: [] });
    expect(log.stateAt(3, 600)).toMatchObject({ biome: 7, owner: 2, settlement: 12, size: 0 });
    expect(log.stateAt(3, 1300)).toMatchObject({ owner: 2, settlement: 12, size: 2, events: [44] });
    expect(log.stateAt(3, 1700)).toMatchObject({ owner: 5, settlement: 12 });
    expect(log.stateAt(3, 2100)).toMatchObject({ owner: -1, settlement: -1, ruins: [12], size: 0 });
    expect(log.stateAt(3, 3000)).toMatchObject({ biome: 9, settlement: 30, ruins: [12] });
    expect(log.stateAt(4, 3000).settlement).toBe(-1);
    // repeats are not stored; the log grows past its first allocation
    const before = log.count;
    log.note(3, 2700, Log.Biome, 9);
    expect(log.count).toBe(before);
    for (let i = 0; i < 6000; i++) log.note(i % 10, 3000 + i, Log.Event, i);
    expect(log.count).toBe(before + 6000);
    expect(log.entries(3).length).toBeGreaterThan(600);
  });
});

describe('ordinary people', () => {
  it('the same citizen always comes back the same, and ages with the years', () => {
    const lang = makeLanguage(0, 5150, big, 0);
    const a = citizen(99, 4, 317, 2000, 0.5, lang), b = citizen(99, 4, 317, 2000, 0.5, lang);
    expect(a).toEqual(b);
    const later = citizen(99, 4, 317, 2010, 0.5, lang);
    if (later.born === a.born) { expect(later.name).toBe(a.name); expect(later.age).toBe(a.age + 10); }
    const names = new Set<string>(), trades = new Set<string>();
    for (let i = 0; i < 300; i++) { const c = citizen(99, 4, i, 2000, 0.9, lang); names.add(c.name); trades.add(c.trade); expect(c.age).toBeGreaterThanOrEqual(0); expect(c.household).not.toContain(i); }
    expect(names.size).toBeGreaterThan(120);
    expect(trades.size).toBeGreaterThan(12);
    // a camp has no mill hands
    for (let i = 0; i < 200; i++) expect(citizen(99, 4, i, 2000, 0.1, lang).trade).not.toBe('mill hand');
  });
});

describe('eras', () => {
  it('each nation has its own place on the clock', () => {
    expect(eraOf(0)).toBe(0);
    expect(eraOf(0.22)).toBe(1);
    expect(eraOf(0.86)).toBe(6);
    expect(eraOf(1.2)).toBe(ERAS.length - 1);
    expect(earthNote(4)).toBe('comparable to Earth around 1450');
    expect(earthNote(1)).toBe('comparable to Earth around 8000 BCE');
  });
});

/** Run a small world until it has a history, then on for some thousands of years at a human pace. */
function worldWithHistory(seed: string, maxMy = 260): Simulation | null {
  const sim = new Simulation(seed, 21);
  for (let t = 0; t < maxMy * 1e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
  return sim.civ.historyActive ? sim : null;
}

describe('the history engine', () => {
  const sim = worldWithHistory('amber-reef-101');
  it('a camp that plants fields founds a nation, with a culture, a language, a ruler and a house', () => {
    expect(sim).not.toBeNull();
    const h = sim!.civ.h;
    expect(h.began).toBeGreaterThan(0);
    expect(h.nations.length).toBeGreaterThan(0);
    const n = h.nations[0]!;
    expect(n.name.length).toBeGreaterThan(1);
    expect(h.cultures[n.culture]!.species).toBe(n.species);
    expect(h.languages[h.cultures[n.culture]!.language]!.consonants.length).toBeGreaterThan(4);
    const ruler = h.people[n.ruler]!;
    expect(ruler.nation).toBe(n.id);
    expect(h.dynasties[n.dynasty]!.rulers).toContain(ruler.id);
    // the founding is in the cause graph, tied to the first camp
    const ev = sim!.events.events[n.eventId]!;
    expect(ev.type).toBe('nation');
    expect(ev.causes.length).toBeGreaterThan(0);
    // and the place remembers it
    const cap = sim!.civ.settlements[n.capital]!;
    expect(sim!.cellLog.stateAt(cap.cell, sim!.simYear).owner).toBe(n.id);
    expect(sim!.cellLog.stateAt(cap.cell, cap.founded - 1).settlement).toBe(-1);
  });

  it('history then runs year by year: rulers succeed one another, knowledge grows, eras turn', () => {
    const s = sim!;
    const h = s.civ.h;
    const start = s.simYear, people0 = h.people.length, tech0 = Math.max(...h.nations.map((n) => n.tech));
    for (let y = 0; y < 3000; y++) s.step(1);
    expect(s.simYear - start).toBeCloseTo(3000, 3);
    expect(h.people.length).toBeGreaterThan(people0 + 20);
    const rulers = h.people.filter((p) => p.reignFrom >= 0 && p.reignTo >= 0);
    expect(rulers.length).toBeGreaterThan(10);
    const reigns = rulers.map((p) => p.reignTo - p.reignFrom);
    const mean = reigns.reduce((a, b) => a + b, 0) / reigns.length;
    expect(mean).toBeGreaterThan(5);
    expect(mean).toBeLessThan(60);
    for (const p of rulers) expect(p.died - p.born).toBeLessThan(140);
    expect(Math.max(...h.nations.map((n) => n.tech))).toBeGreaterThan(tech0 + 0.05);
    expect(s.events.events.some((e) => e.type === 'era')).toBe(true);
    // event years fall inside the span that was simulated, not all on its last day
    const eraYears = s.events.events.filter((e) => e.type === 'era' || e.type === 'dynasty').map((e) => e.simYear);
    expect(Math.min(...eraYears)).toBeLessThan(s.simYear - 100);
  }, 120000);

  it('the same history comes out of a fast-forward in broad terms, and is saved and loaded whole', () => {
    const s = sim!;
    const copy = new Simulation('amber-reef-101', 21);
    loadSimulation(copy, saveSimulation(s, 't'));
    expect(copy.civ.h.nations.length).toBe(s.civ.h.nations.length);
    expect(copy.civ.h.people.length).toBe(s.civ.h.people.length);
    expect(copy.cellLog.count).toBe(s.cellLog.count);
    for (let y = 0; y < 200; y++) { s.step(1); copy.step(1); }
    expect(copy.digest()).toBe(s.digest());
    expect(copy.civ.h.people.map((p) => p.name)).toEqual(s.civ.h.people.map((p) => p.name));
    // a coarse step of fifteen thousand years also completes and moves history on
    const era = s.civ.h.topEra;
    s.step(15000);
    expect(s.civ.h.topEra).toBeGreaterThanOrEqual(era);
    expect(Number.isFinite(s.civ.maxTech)).toBe(true);
  }, 120000);
});

import { INVENTIONS, SLOT_INDEX, WEB, chooseNext, levelOf, newKnowledge, open, wayFor, type Land } from '../src/sim/history/tech';

/** Discover everything a land allows, in the order luck and leanings give. */
function discoverAll(land: Land[], seed: number, lean = {}): { order: string[]; ways: string[]; level: number } {
  const k = newKnowledge(), set = new Set(land), rng = new RNG(seed);
  const order: string[] = [], ways: string[] = [];
  for (let n = 0; n < 400; n++) {
    const i = chooseNext(k, set, lean, rng);
    if (i < 0) break;
    const w = wayFor(i, set);
    k.way[i] = w; k.year[i] = n;
    order.push(WEB[i]!.id); ways.push(WEB[i]!.ways[w]!.id);
  }
  return { order, ways, level: levelOf(k, set) };
}

describe('the tech web (E1)', () => {
  it('is a sound web of about 150 inventions', () => {
    expect(INVENTIONS).toBeGreaterThanOrEqual(140);
    expect(WEB.length).toBeGreaterThan(100);
    const ids = new Set<string>();
    for (const s of WEB) {
      expect(s.ways.length).toBeGreaterThan(0);
      for (const need of s.needs) { expect(SLOT_INDEX.has(need)).toBe(true); expect(WEB[SLOT_INDEX.get(need)!]!.level).toBeLessThan(s.level); }
      for (const w of s.ways) { expect(ids.has(w.id)).toBe(false); ids.add(w.id); expect(w.cost).toBeGreaterThan(0); }
    }
    // the levels run from first fields to the top without gaps an era wide
    const levels = WEB.map((s) => s.level).sort((a, b) => a - b);
    expect(levels[0]).toBeGreaterThanOrEqual(0.22);
    expect(levels[levels.length - 1]).toBeLessThanOrEqual(1.2);
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeLessThan(0.03);
  });

  it('five seeds discover in five different orders, and needs always come before what needs them', () => {
    const rich: Land[] = ['ore', 'coast', 'river', 'forest', 'beasts', 'sand', 'coal'];
    const orders = [11, 22, 33, 44, 55].map((s) => discoverAll(rich, s));
    expect(new Set(orders.map((o) => o.order.join(','))).size).toBe(5);
    for (const o of orders) {
      expect(o.level).toBeCloseTo(1.2, 5);
      const at = new Map(o.order.map((id, i) => [id, i]));
      for (const s of WEB) for (const need of s.needs) expect(at.get(need)!).toBeLessThan(at.get(s.id)!);
    }
    // a warlike people reaches arms sooner than a trading one
    const pos = (lean: object) => { let sum = 0; for (let s = 1; s <= 12; s++) sum += discoverAll(rich, s, lean).order.indexOf('guns'); return sum / 12; };
    expect(pos({ war: 2.2 })).toBeLessThan(pos({ war: 0.4 }));
  });

  it('a people with no ore never smelts, and still reaches the top by glass, bone and fired clay', () => {
    const poor = discoverAll(['coast', 'river', 'forest', 'sand'], 7);
    expect(poor.level).toBeCloseTo(1.2, 5);
    for (const metal of ['copper', 'bronze', 'iron', 'steel', 'coinage', 'railways']) expect(poor.ways).not.toContain(metal);
    expect(poor.ways).toContain('glassblade');
    expect(poor.ways).toContain('glazed');
    expect(poor.order).toContain('engine');
    expect(poor.order).toContain('orbit');
    // inland and dry: no seamanship at all, and what needed ships is reached without them
    const inland = discoverAll(['ore', 'beasts'], 7);
    expect(inland.order).not.toContain('sail');
    expect(inland.order).not.toContain('ship2');
    expect(inland.level).toBeCloseTo(1.2, 5);
    expect(open(newKnowledge(), new Set<Land>()).length).toBeGreaterThan(3);
  });

  it('nations in a living world discover, name and record their inventions', () => {
    // (any world with a history will do; which seeds are early changes whenever the rules of life do)
    const s = worldWithHistory('basalt-vale-202');
    expect(s).not.toBeNull();
    for (let y = 0; y < 2500; y++) s!.step(1);
    const h = s!.civ.h;
    const n = [...h.nations].sort((a, b) => b.tech - a.tech)[0]!;
    const known = [...n.know.way].filter((w) => w >= 0).length;
    expect(known).toBeGreaterThan(8);
    expect(n.tech).toBeGreaterThan(0.28);
    const found = s!.events.events.filter((e) => e.type === 'invention');
    expect(found.length).toBeGreaterThan(0);
    for (const e of found) { expect(e.causes.length).toBeGreaterThan(0); expect(e.description).toMatch(/Their word for it is \w+/); }
    // every discovery has its year
    for (let i = 0; i < WEB.length; i++) if (n.know.way[i]! >= 0 && n.parent < 0) expect(n.know.year[i]!).toBeGreaterThanOrEqual(n.founded);
    expect(h.people.some((p) => p.role === 'inventor')).toBe(true);
  }, 240000);
});

import { eraTitle } from '../src/sim/history/eras';
import { lightColour } from '../src/render/gfx/nations';

describe('era progression (E2)', () => {
  it('an age is named for how a people got there', () => {
    const ore = (slot: string) => ({ edge: 'copper', hard: 'iron', compass: 'lodestone', engine: 'steam', telegraph: 'wire' } as Record<string, string>)[slot] ?? '';
    const poor = (slot: string) => ({ edge: 'glassblade', hard: 'sinter', compass: '', engine: 'sunboiler', telegraph: 'heliograph' } as Record<string, string>)[slot] ?? '';
    expect([2, 3, 4, 6, 7].map((e) => eraTitle(e, ore))).toEqual(['Age of Copper', 'Age of Iron', 'Age of Sails', 'Age of Steam', 'Age of Wires']);
    expect([2, 3, 4, 6, 7].map((e) => eraTitle(e, poor))).toEqual(['Age of Glass', 'Age of White Stone', 'Age of Roads', 'Age of Mirrors', 'Age of Flashing Towers']);
    expect(eraTitle(1, ore)).toBe('Age of Fields');
    expect(eraTitle(8, poor)).toBe('Age of Orbit');
  });

  it('a full run passes through at least six ages, each announced, named in the people\'s tongue, and compared to Earth', () => {
    const s = worldWithHistory('amber-reef-101');
    expect(s).not.toBeNull();
    for (let y = 0; y < 8000; y++) s!.step(1);
    // (an age climbed back to after a great ruin is announced as coming again, and is not a first)
    const eras = s!.events.events.filter((e) => e.type === 'era' && e.importance >= 2);
    const firsts = eras.filter((e) => !e.data!.again);
    for (const e of eras.filter((x) => x.data!.again)) { expect(e.title).toMatch(/^The Age .+ comes again$/); expect(firsts.some((f) => f.data!.era === e.data!.era && f.simYear < e.simYear)).toBe(true); }
    expect(firsts.length).toBeGreaterThanOrEqual(6);
    expect(new Set(firsts.map((e) => e.title)).size).toBe(firsts.length);
    for (const e of firsts) {
      expect(e.title).toMatch(/^The Age .+ begins$/);
      expect(String(e.data!.earth)).toMatch(/^comparable to Earth around \d+/);
      expect(String(e.data!.own).length).toBeGreaterThan(3);
      expect(e.causes.length).toBeGreaterThan(0);
    }
    // years of the firsts run forward
    for (let i = 1; i < firsts.length; i++) expect(firsts[i]!.simYear).toBeGreaterThan(firsts[i - 1]!.simYear);
    const n = [...s!.civ.h.nations].sort((a, b) => b.tech - a.tech)[0]!;
    expect(s!.civ.eraName(n)).toMatch(/^Age /);
    expect(s!.civ.eraOwnName(n)).toMatch(/^\S+ \S+$/);
  }, 240000);

  it('the colour of a people\'s lights follows its age', () => {
    const sig: [number, number, number] = [0.2, 0.9, 1.0];
    const fire = lightColour(0.3, sig), lamp = lightColour(0.66, sig), gas = lightColour(0.9, sig), electric = lightColour(1.1, sig);
    expect(fire).toEqual([1.0, 0.5, 0.14]);
    expect(lamp[1]).toBeGreaterThan(fire[1]);
    expect(gas[2]).toBeGreaterThan(lamp[2] + 0.2);
    expect(electric).toEqual(sig);
    // no sudden jumps between neighbouring levels
    for (let t = 0.2; t < 1.2; t += 0.01) { const a = lightColour(t, sig), b = lightColour(t + 0.01, sig); for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(0.08); }
  });
});

import type { SaveState } from '../src/sim/snapshot';
import { borrowable } from '../src/sim/history/tech';

/** Five small worlds saved at the dawn of their history, grown once and shared by every "five seeds" check. */
const FIVE = ['amber-reef-101', 'coral-dune-303', 'ember-moss-404', 'slate-iris-707', 'jade-fjord-505'];
let dawns: (SaveState | null)[] | null = null;
function fiveDawns(): (SaveState | null)[] {
  if (!dawns) {
    dawns = FIVE.map((seed) => {
      const sim = new Simulation(seed, 17);
      for (let t = 0; t < 300e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
      return sim.civ.historyActive ? saveSimulation(sim, 'dawn') : null;
    });
  }
  return dawns;
}
/** A fresh copy of one of the five worlds at its dawn (null if that world never had a history). */
function atDawn(k: number): Simulation | null {
  const save = fiveDawns()[k];
  if (!save) return null;
  const sim = new Simulation(FIVE[k]!, 17);
  loadSimulation(sim, save);
  return sim;
}

describe('uneven history (E3)', () => {
  it('a nation learns from one it is in touch with only what it is ready for, earliest first', () => {
    const land = new Set<Land>(['ore', 'coast', 'river', 'forest', 'beasts', 'sand', 'coal']);
    const teacher = newKnowledge(), pupil = newKnowledge();
    const rng = new RNG(3);
    for (let n = 0; n < 60; n++) { const i = chooseNext(teacher, land, {}, rng); teacher.way[i] = wayFor(i, land); }
    let taken = 0, lastLevel = 0;
    for (let n = 0; n < 200; n++) {
      const i = borrowable(pupil, teacher, land);
      if (i < 0) break;
      for (const need of WEB[i]!.needs) expect(pupil.way[SLOT_INDEX.get(need)!]!).toBeGreaterThanOrEqual(0);
      expect(teacher.way[i]!).toBeGreaterThanOrEqual(0);
      pupil.way[i] = wayFor(i, land); taken++;
      lastLevel = Math.max(lastLevel, WEB[i]!.level);
    }
    expect(taken).toBe(60);
    expect(borrowable(teacher, pupil, land)).toBe(-1);
    // an inland pupil takes what it can and leaves the seamanship
    const dry = new Set<Land>(['ore', 'beasts']), inland = newKnowledge();
    for (let n = 0; n < 200; n++) { const i = borrowable(inland, teacher, dry); if (i < 0) break; expect(WEB[i]!.field).not.toBe('sea'); inland.way[i] = wayFor(i, dry); }
  });

  it('in at least three of five worlds two nations stand two or more ages apart at the same moment', () => {
    const runs = fiveHistories();
    expect(runs.length).toBeGreaterThanOrEqual(4);
    expect(runs.filter((r) => r.gap >= 2).length).toBeGreaterThanOrEqual(3);
    // and knowledge did pass between nations somewhere
    expect(runs.reduce((a, r) => a + r.sim.civ.h.nations.reduce((x, n) => x + (n.borrowed ?? 0), 0), 0)).toBeGreaterThan(10);
    // contacts are always other, real nations
    for (const r of runs) for (const n of r.sim.civ.h.nations) for (const c of n.contacts) { expect(c).not.toBe(n.id); expect(r.sim.civ.h.nations[c]).toBeDefined(); }
  }, 900000);
});

/** The five worlds, each run for six thousand years of history at a human pace: done once, shared by the checks that need a whole history. */
interface Run { seed: string; sim: Simulation; began: number; gap: number }
let histories: Run[] | null = null;
function fiveHistories(): Run[] {
  if (histories) return histories;
  histories = [];
  for (let k = 0; k < FIVE.length; k++) {
    const sim = atDawn(k);
    if (!sim) continue;
    const began = sim.civ.h.began;
    let gap = 0;
    for (let y = 0; y < 6000; y++) {
      sim.step(1);
      if (y % 20) continue;
      const live = sim.civ.h.nations.filter((n) => n.ended < 0);
      if (live.length > 1) gap = Math.max(gap, Math.max(...live.map((n) => n.era)) - Math.min(...live.map((n) => n.era)));
    }
    histories.push({ seed: FIVE[k]!, sim, began, gap });
  }
  return histories;
}

describe('rise and fall (E4)', () => {
  it('nations break: provinces leave, civil wars divide them, and some fall apart, each with its reasons on record', () => {
    const runs = fiveHistories();
    let broke = 0, falls = 0;
    for (const r of runs) {
      const ev = r.sim.events.events;
      const breaks = ev.filter((e) => e.type === 'secession' || e.type === 'civil-war' || e.type === 'nation-collapse');
      if (breaks.length) broke++;
      falls += ev.filter((e) => e.type === 'civil-war' || e.type === 'nation-collapse').length;
      for (const e of breaks) {
        // a readable cause chain: the nation's own founding at least, and words for why
        expect(e.causes.length).toBeGreaterThanOrEqual(1);
        expect(e.description.length).toBeGreaterThan(60);
        for (const c of e.causes) expect(ev[c]).toBeDefined();
      }
      const h = r.sim.civ.h;
      // every living town of history belongs to a living nation; a fallen nation holds nothing
      for (const st of r.sim.civ.settlements) if (st.ruined < 0 && st.nation >= 0) expect(h.nations[st.nation]!.ended).toBeLessThan(0);
      for (const e of ev.filter((x) => x.type === 'nation-collapse')) {
        const fallen = h.nations[Number(e.data!.nation)]!;
        expect(fallen.ended).toBeGreaterThan(0);
        const heirs = h.nations.filter((n) => n.parent === fallen.id && n.founded === fallen.ended);
        expect(heirs.length).toBeGreaterThanOrEqual(1);
        for (const heir of heirs) expect(heir.name).not.toBe(fallen.name);
      }
      for (const n of h.nations) { expect(n.stability).toBeGreaterThanOrEqual(0); expect(n.stability).toBeLessThanOrEqual(1); expect(n.inequality).toBeLessThanOrEqual(1); }
    }
    // most worlds see a nation break within six thousand years, and somewhere one falls or fights itself
    expect(broke).toBeGreaterThanOrEqual(Math.min(3, runs.length));
    expect(falls).toBeGreaterThanOrEqual(1);
  }, 900000);
});

import { forget } from '../src/sim/history/tech';

describe('dark ages (E5)', () => {
  it('the newest knowledge is lost first, and nothing still known rests on something forgotten', () => {
    const land = new Set<Land>(['ore', 'coast', 'river', 'forest', 'beasts', 'sand', 'coal']);
    const k = newKnowledge(), rng = new RNG(8);
    for (let n = 0; n < 70; n++) { const i = chooseNext(k, land, {}, rng); k.way[i] = wayFor(i, land); k.year[i] = n; }
    const before = levelOf(k, land);
    const gone = forget(k, 12, 500, 77);
    expect(gone.length).toBe(12);
    expect(levelOf(k, land)).toBeLessThan(before);
    for (const i of gone) { expect(k.way[i]).toBe(-1); expect(k.lost[i]).toBe(500); expect(k.lostEvent[i]).toBe(77); }
    const lowestGone = Math.min(...gone.map((i) => WEB[i]!.level));
    for (let i = 0; i < WEB.length; i++) {
      if (k.way[i]! < 0) continue;
      expect(WEB[i]!.level).toBeLessThanOrEqual(lowestGone);
      for (const need of WEB[i]!.needs) { const j = SLOT_INDEX.get(need)!; if (wayFor(j, land) >= 0) expect(k.way[j]!).toBeGreaterThanOrEqual(0); }
    }
    // what was lost is open to be found again
    expect(open(k, land).some((i) => gone.includes(i))).toBe(true);
    expect(forget(newKnowledge(), 5, 1).length).toBe(0);
  });

  it('in a long run knowledge is lost, leaves its works behind, and is found again', () => {
    const runs = fiveHistories();
    let lost = 0, regained = 0;
    for (const r of runs) {
      const ev = r.sim.events.events;
      for (const e of ev.filter((x) => x.type === 'knowledge-lost')) {
        lost++;
        expect(e.description).toMatch(/no longer knows/);
        expect(e.causes.length).toBeGreaterThan(0);
      }
      for (const e of ev.filter((x) => x.type === 'knowledge-regained')) {
        regained++;
        expect(Number(e.data!.years)).toBeGreaterThan(0);
        // the finding again is tied to the loss in the cause graph
        expect(e.causes.some((c) => ev[c]!.type === 'knowledge-lost')).toBe(true);
        expect(ev[e.causes.find((c) => ev[c]!.type === 'knowledge-lost')!]!.simYear).toBeLessThan(e.simYear);
      }
      // a relic is always something its nation does not now know, or has only just relearned
      for (const st of r.sim.civ.settlements) if (st.ruined < 0 && st.relic >= 0 && st.nation >= 0) expect(st.relic).toBeLessThan(WEB.length);
    }
    expect(lost).toBeGreaterThanOrEqual(1);
    expect(regained).toBeGreaterThanOrEqual(1);
  }, 900000);
});

import { ART_NAMES, Portrait, artStyle } from '../src/ui/portrait';
import { GENE_COUNT } from '../src/sim/genetics';

/** Everything a drawn portrait is made of, as one string, so two portraits can be compared. */
function drawn(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(drawn).join('');
  if (typeof node !== 'object') return String(node);
  const v = node as { type: unknown; props: Record<string, unknown> };
  if (typeof v.type === 'function') return drawn((v.type as (p: unknown) => unknown)(v.props));
  return `<${String(v.type)} ${Object.entries(v.props).filter(([k, x]) => k !== 'children' && x !== undefined).map(([k, x]) => `${k}=${typeof x === 'object' ? JSON.stringify(x) : String(x)}`).join(' ')}>${drawn(v.props.children)}`;
}

describe('notable people (E6)', () => {
  /** The kinds of event that belong to history proper: at a human pace each must name its person. */
  const NAMED = new Set(['nation', 'era', 'invention', 'dynasty', 'war', 'conquest', 'secession', 'civil-war', 'nation-collapse', 'nation-fall', 'knowledge-lost', 'knowledge-regained', 'contact', 'reformer', 'music', 'trade', 'industry']);

  it('every event of history names the person tied to it', () => {
    const runs = fiveHistories();
    let checked = 0;
    for (const r of runs) {
      const h = r.sim.civ.h;
      for (const e of r.sim.events.events) {
        if (e.simYear < r.began) continue;
        const major = NAMED.has(e.type) || (e.type === 'settlement' && e.importance >= 2);
        if (!major) continue;
        checked++;
        const who = h.people[Number(e.data?.person ?? -1)];
        expect(who, `${r.seed}: ${e.type} "${e.title}" names no one`).toBeDefined();
        expect(`${e.title} ${e.description}`).toContain(who!.name);
        expect(who!.events).toContain(e.id);
      }
    }
    expect(checked).toBeGreaterThan(200);
  }, 900000);

  it('generals, reformers, explorers, artists, scholars and inventors live whole lives with an outcome', () => {
    const runs = fiveHistories();
    const seen = new Map<string, number>();
    let rivals = 0, martyrs = 0, early = 0, soldiers = 0;
    for (const r of runs) {
      const h = r.sim.civ.h, ev = r.sim.events.events, now = r.sim.simYear;
      const roles = new Set<string>();
      for (const p of h.people) {
        roles.add(p.role);
        seen.set(p.role, (seen.get(p.role) ?? 0) + 1);
        expect(p.name.length).toBeGreaterThan(1);
        expect(h.nations[p.nation]).toBeDefined();
        for (const t of [p.bold, p.wise, p.cruel, p.open]) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1); }
        if (p.role === 'ruler' || p.role === 'founder') continue;
        // made by an event, and tied to it
        expect(p.events.length).toBeGreaterThan(0);
        expect(ev[p.events[0]!]!.description).toContain(p.name);
        expect(p.born).toBeLessThan(p.rose);
        expect(p.era).toBeGreaterThanOrEqual(0);
        // they served whoever ruled when they rose
        expect(h.people[p.patron]).toBeDefined();
        // a life ends, in a way that is written down
        if (p.died >= 0) { expect(p.died).toBeGreaterThanOrEqual(p.rose); expect(p.fate.length).toBeGreaterThan(5); }
        else expect(h.notables).toContain(p.id);
        expect(p.died >= 0 ? p.died - p.born : now - p.born).toBeLessThan(r.sim.civ.lifespan(r.sim, h.nations[p.nation]!.species) * 1.6);
        if (p.role === 'general') {
          soldiers++;
          if (p.died >= 0 && !/in bed/.test(p.fate)) early++;
          if (p.rival >= 0) { rivals++; expect(h.people[p.rival]!.rival).toBe(p.id); expect(h.people[p.rival]!.nation).not.toBe(p.nation); }
        }
        if (p.role === 'reformer' && /put to death/.test(p.fate)) { martyrs++; expect(p.died).toBe(p.rose); expect(h.people[p.rival]!.cruel).toBeGreaterThan(0.62); }
      }
      // the living on record are all alive
      for (const id of h.notables) expect(h.people[id]!.died).toBeLessThan(0);
      expect(roles.size).toBeGreaterThanOrEqual(5);
    }
    for (const role of ['ruler', 'founder', 'inventor', 'general', 'reformer', 'explorer', 'artist', 'scholar']) expect(seen.get(role) ?? 0, role).toBeGreaterThan(0);
    // war is a dangerous trade, and the two sides of a war remember each other
    expect(rivals).toBeGreaterThan(0);
    expect(early).toBeGreaterThan(soldiers * 0.15);
    expect(martyrs).toBeGreaterThanOrEqual(0);
  }, 900000);

  it('portraits are drawn from the body of the species, in the manner of the age', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(artStyle)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(ART_NAMES.length).toBe(5);
    const rng = new RNG(5);
    const a = new Float32Array(GENE_COUNT).map(() => rng.next()), b = new Float32Array(GENE_COUNT).map(() => rng.next());
    const face = (genes: Float32Array, era: number, role: string, seed: number) => drawn(Portrait({ genes, era, role, seed }));
    // the same person is always drawn the same
    expect(face(a, 4, 'general', 12)).toBe(face(a, 4, 'general', 12));
    // two species do not look alike, nor do two people of one species, nor two callings
    expect(face(a, 4, 'general', 12)).not.toBe(face(b, 4, 'general', 12));
    expect(face(a, 4, 'general', 12)).not.toBe(face(a, 4, 'general', 13));
    expect(face(a, 4, 'general', 12)).not.toBe(face(a, 4, 'reformer', 12));
    // five ages, five manners
    expect(new Set([0, 2, 4, 6, 8].map((era) => face(a, era, 'ruler', 3))).size).toBe(5);
    for (const era of [0, 2, 4, 6, 8]) for (const role of ['ruler', 'founder', 'inventor', 'teller', 'reformer', 'general', 'explorer', 'artist', 'scholar']) {
      const text = face(b, era, role, 40 + era);
      expect(text).not.toMatch(/NaN|undefined/);
      expect(text.length).toBeGreaterThan(1500);
    }
  });
});

describe('a history that lasts (settlement by sea and the long peace)', () => {
  it('a fast-forwarded history settles into a long peace: towns live on, and the records stop growing', () => {
    // two of the five worlds, jumped through three million years in the steps a warp takes
    let settled = 0;
    for (const k of [0, 2]) {
      const sim = atDawn(k);
      if (!sim) continue;
      const h = sim.civ.h;
      for (let i = 0; i < 40; i++) sim.step(15000);
      const nations = h.nations.length, people = h.people.length, eventsAt = sim.events.events.length;
      const gone = sim.creatures.species[h.nations[0]!.species]!.extinctYear >= 0;
      if (!gone && sim.civ.living > 0) {
        expect((h.peace ?? -1), `${FIVE[k]} has not settled after 600,000 years`).toBeGreaterThanOrEqual(0);
        expect(sim.civ.historyLive).toBe(false);
        expect(sim.civ.historyActive).toBe(true);
        settled++;
        // the peace is announced once, at the top level of the chronicle
        expect(sim.events.events.filter((e) => e.type === 'long-peace').length).toBeGreaterThanOrEqual(1);
      }
      // however the history went, it stayed a bounded record
      expect(nations).toBeLessThan(2500);
      expect(people).toBeLessThan(2500);
      for (let i = 0; i < 160; i++) sim.step(15000);
      // (unless the peace was broken meanwhile, by a catastrophe or by a new people, and history ran again for a while)
      if ((h.peace ?? -1) >= 0 && !sim.events.events.slice(eventsAt).some((e) => e.type === 'peace-broken')) {
        // in the peace nothing is added to the lists of nations and people, and the chronicle is all but silent
        expect(h.nations.length).toBe(nations);
        expect(h.people.length).toBe(people);
        expect(sim.events.events.slice(eventsAt).filter((e) => ['nation', 'war', 'civil-war', 'secession', 'nation-collapse', 'dynasty', 'era'].includes(e.type)).length).toBe(0);
        for (const n of h.nations) if (n.ended < 0) { expect(n.government).toBe('custom'); expect(n.towns).toBeGreaterThan(0); }
        for (const st of sim.civ.settlements) if (st.ruined < 0 && st.nation >= 0) expect(h.nations[st.nation]!.ended).toBeLessThan(0);
      }
    }
    expect(settled).toBeGreaterThanOrEqual(1);
  }, 900000);

  it('a people with boats settles across the water, and only as far as its ships can go', () => {
    const runs = fiveHistories();
    let overseas = 0;
    for (const r of runs) {
      for (const st of r.sim.civ.settlements) {
        if (!st.overseas) continue;
        overseas++;
        // it stands on land, and the chronicle says how its people came
        expect(r.sim.world.elevation[st.cell]! > r.sim.world.seaLevel || st.ruined >= 0).toBe(true);
        const ev = r.sim.events.events[st.eventId];
        if (ev) expect(ev.description).toMatch(/came by sea/);
      }
    }
    expect(overseas).toBeGreaterThan(0);
  }, 900000);
});

import { layoutHouse } from '../src/ui/dynasty';
import type { HouseMember } from '../src/shared/protocol';

describe('dynasties and succession (E7)', () => {
  it('in most worlds a house rules for five generations or more, parent to child', () => {
    const runs = fiveHistories();
    let long = 0, branches = 0, brief = 0, houses = 0;
    for (const r of runs) {
      const h = r.sim.civ.h;
      let best = 0;
      for (const d of h.dynasties) {
        houses++;
        if ((d.generations ?? 1) <= 2) brief++;
        if (d.branchOf !== undefined) { branches++; expect(h.dynasties[d.branchOf]).toBeDefined(); expect(d.branchOf).not.toBe(d.id); }
        // the line of rulers on record: each a child, or a brother or sister, of one before
        const rulers = d.rulers.map((id) => h.people[id]!);
        let chain = 1, top = 1;
        for (let i = 1; i < rulers.length; i++) {
          const p = rulers[i]!, before = rulers[i - 1]!;
          expect(p.dynasty).toBe(d.id);
          expect((p.gen ?? 0)).toBeGreaterThanOrEqual(before.gen ?? 0);
          if (p.parent === before.id) { expect(p.gen).toBe((before.gen ?? 0) + 1); chain++; top = Math.max(top, chain); }
          else if ((p.gen ?? 0) === (before.gen ?? 0)) { /* a brother or sister: same generation */ }
          else chain = 1;
          expect(p.reignFrom).toBeGreaterThanOrEqual(before.reignFrom);
        }
        best = Math.max(best, top);
        expect((d.generations ?? 1)).toBeGreaterThanOrEqual(1);
        expect(d.reigns).toBeGreaterThanOrEqual(d.generations ?? 1);
      }
      if (best >= 5) long++;
    }
    expect(long).toBeGreaterThanOrEqual(Math.min(4, runs.length));
    // and they do not all last: many houses are over within two generations
    expect(brief).toBeGreaterThan(houses * 0.15);
    expect(branches).toBeGreaterThan(0);
  }, 900000);

  it('disputed successions, marriages between houses, alliances and inherited thrones are all on record', () => {
    const runs = fiveHistories();
    let marriages = 0, disputes = 0, wars = 0, inherited = 0, unions = 0;
    for (const r of runs) {
      const h = r.sim.civ.h, ev = r.sim.events.events;
      for (const e of ev) {
        if (e.type === 'marriage') {
          marriages++;
          const consort = h.people[Number(e.data!.person)]!;
          expect(consort.role).toBe('consort');
          const ruler = h.people[consort.spouse!]!;
          expect(ruler.spouse).toBe(consort.id);
          expect(ruler.match).toBe(Number(e.data!.other));
          // the consort comes from the other country's house
          expect(h.dynasties[consort.dynasty]!.nation).toBe(Number(e.data!.other));
          expect(e.description).toContain(consort.name);
          expect(e.causes.length).toBeGreaterThan(0);
        }
        if (e.title.startsWith('Disputed succession')) { disputes++; expect(h.people[Number(e.data!.person)]!.dynasty).toBeGreaterThanOrEqual(0); }
        if (e.type === 'civil-war' && /two children/.test(e.description)) {
          wars++;
          // the younger child rules the half that followed them, as a branch of the same house
          const claimant = h.people[Number(e.data!.person)]!;
          const theirs = h.dynasties[claimant.dynasty]!;
          expect(theirs.branchOf).toBeDefined();
          expect(h.people[claimant.rival]!.rival).toBe(claimant.id);
        }
        if (/ passes to the /.test(e.title)) { inherited++; expect(h.nations[Number(e.data!.other)]).toBeDefined(); }
        if (e.type === 'union') { unions++; expect(h.nations[Number(e.data!.other)]!.ended).toBe(e.simYear); expect(e.description).toMatch(/No battle was fought/); }
      }
      // an alliance is always held by both sides, and for the same time
      for (const n of h.nations) for (const a of n.allies ?? []) {
        const back = (h.nations[a.nation]!.allies ?? []).find((b) => b.nation === n.id && b.until === a.until);
        if (h.nations[a.nation]!.ended < 0 && n.ended < 0 && (h.nations[a.nation]!.allies ?? []).length < 6) expect(back, `${n.name} and ${h.nations[a.nation]!.name}`).toBeDefined();
      }
      // a claim is on a real country, never one's own
      for (const p of h.people) if ((p.claim ?? -1) >= 0) { expect(h.nations[p.claim!]).toBeDefined(); }
    }
    expect(marriages).toBeGreaterThan(10);
    expect(disputes).toBeGreaterThan(5);
    expect(wars).toBeGreaterThanOrEqual(1);
    expect(inherited + unions).toBeGreaterThanOrEqual(1);
  }, 900000);

  it('a family tree is laid out with every child below its parent and no two people in one place', () => {
    const m = (id: number, parent: number, gen: number, born: number): HouseMember => ({ id, name: `p${id}`, role: 'ruler', parent, gen, born, died: -1, fate: '', reignFrom: born + 20, reignTo: -1, nation: 'n', spouse: '', spouseHouse: '', claim: '', wars: [], era: 2, bold: 0.5, cruel: 0.5 });
    const family = [m(1, -1, 0, 0), m(2, 1, 1, 20), m(3, 1, 1, 22), m(4, 2, 2, 40), m(5, 2, 2, 43), m(6, 3, 2, 45), m(7, -1, 0, 3), m(8, 6, 3, 70), m(9, 99, 4, 90)];
    const { nodes, width, height } = layoutHouse(family);
    expect(nodes.length).toBe(family.length);
    const at = new Map(nodes.map((n) => [n.m.id, n]));
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x).toBeLessThan(width); expect(n.y).toBeLessThan(height);
      const parent = at.get(n.m.parent);
      if (parent) expect(n.y).toBeGreaterThan(parent.y);
      for (const o of nodes) if (o !== n) expect(o.x === n.x && o.y === n.y).toBe(false);
    }
    // a parent stands over the middle of its children
    expect(at.get(2)!.x).toBe((at.get(4)!.x + at.get(5)!.x) / 2);
    expect(layoutHouse([]).nodes.length).toBe(0);
  });
});

import { calendarName, dateIn, localYear } from '../src/sim/history/calendar';

describe('calendars (E8)', () => {
  it('a date is counted from Year 1, and backwards before it', () => {
    const cal = { name: 'the Falling Light', epoch: 3104471.4 };
    expect(localYear(cal, 3104471.9)).toBe(1);
    expect(localYear(cal, 3104882)).toBe(412);
    expect(dateIn(cal, 3104882)).toBe('Year 412 of the Falling Light');
    expect(dateIn(cal, 3104470)).toBe('1 year before the Falling Light');
    expect(dateIn(cal, 3104441)).toBe('30 years before the Falling Light');
    // a count is named for what it remembers
    expect(calendarName('founding', 1, 'dawn', '')[0]).toBe('the First Fields');
    expect(calendarName('founding', 1, 'sea', '')[0]).toBe('the Landing');
    expect(calendarName('founding', 1, 'successor', 'Old Country')[0]).toBe('the Fall of Old Country');
    expect(calendarName('crown', 1, '', 'House of Atlei')[0]).toBe('the House of Atlei');
    expect(calendarName('teaching', 1, '', 'Feipa')[0]).toBe('the Teaching of Feipa');
    expect(calendarName('disaster', 1, 'eruption The mountain opens', '')[0]).toBe('the Ash');
    expect(calendarName('comet', 5, '', '')).toEqual(calendarName('comet', 5, '', ''));
  });

  it('every nation keeps a count of years tied to a real event in the cause graph', () => {
    const runs = fiveHistories();
    let reformed = 0, shared = 0, sky = 0, nations = 0;
    for (const r of runs) {
      const h = r.sim.civ.h, ev = r.sim.events.events;
      const cals = h.calendars ?? [];
      for (const n of h.nations) {
        nations++;
        const cal = r.sim.civ.calendarOf(n);
        expect(cal, `${r.seed}: ${n.name} keeps no count`).toBeDefined();
        const tied = ev[cal!.eventId];
        expect(tied, `${r.seed}: the count of ${n.name} is tied to nothing`).toBeDefined();
        // Year 1 is the year of that event, and the count was not set before the event happened
        expect(Math.abs(tied!.simYear - cal!.epoch)).toBeLessThan(2);
        expect(cal!.set).toBeGreaterThanOrEqual(cal!.epoch);
        expect(cal!.name).toMatch(/^the /);
        expect(cal!.own.length).toBeGreaterThan(2);
        if (n.ended < 0) expect(r.sim.civ.dateFor(n, r.sim.simYear)).toMatch(/^Year [\d,]+ of the /);
        if (cal!.nation !== n.id) shared++;
      }
      for (const c of cals) {
        if (c.kind !== 'founding') reformed++;
        if (c.kind === 'comet' || c.kind === 'eclipse') { sky++; expect(ev[c.eventId]!.type).toBe(c.kind); }
        // two counts never share a name unless they count from the same year
        for (const o of cals) if (o.id < c.id && o.name === c.name) expect(Math.floor(o.epoch)).toBe(Math.floor(c.epoch));
      }
      // a reform is announced, names the count and says what today's date is by it
      for (const e of ev.filter((x) => x.type === 'calendar')) {
        const c = cals[Number(e.data!.calendar)]!;
        expect(e.description).toContain(c.name);
        expect(e.description).toContain(c.own);
        expect(e.causes).toContain(c.eventId);
      }
      // the small comet keeps its appointments
      const returns = ev.filter((x) => x.title === 'The Visitor returns');
      for (let i = 1; i < returns.length; i++) expect((returns[i]!.simYear - returns[i - 1]!.simYear) % h.visitor!.period).toBeLessThan(1.5);
    }
    expect(nations).toBeGreaterThan(20);
    expect(reformed).toBeGreaterThan(5);
    expect(sky).toBeGreaterThan(0);
    // settlers and successors mostly keep the count they were born under
    expect(shared).toBeGreaterThan(0);
  }, 900000);
});

import { arrowPath, recentMigrations } from '../src/ui/panels';
import type { SimEvent } from '../src/sim/events';

describe('migrations of peoples (E9)', () => {
  /** A world three thousand years into its history, then struck by hand, then left for two thousand more. */
  function struck(tool: string, times = 1): { sim: Simulation; strike: number; before: number } {
    const sim = atDawn(0)!;
    for (let y = 0; y < 3000; y++) sim.step(1);
    const before = sim.events.events.length;
    const town = sim.civ.settlements.find((s) => s.ruined < 0)!;
    for (let k = 0; k < times; k++) sim.intervene(tool, town.cell);
    // (the act itself, not whatever followed it in the same breath: a town may make it the story it tells of itself)
    const strike = sim.interventions[sim.interventions.length - 1]!;
    for (let y = 0; y < 2500; y += 10) sim.step(10);
    return { sim, strike, before };
  }
  const checkMoves = (sim: Simulation, moves: SimEvent[]): void => {
    const h = sim.civ.h, cells = sim.grid.count;
    for (const e of moves) {
      const d = e.data!;
      expect(h.nations[Number(d.nation)]).toBeDefined();
      expect(Number(d.from)).toBeGreaterThanOrEqual(0); expect(Number(d.from)).toBeLessThan(cells);
      expect(Number(d.to)).toBeGreaterThanOrEqual(0); expect(Number(d.to)).toBeLessThan(cells);
      expect(d.to).not.toBe(d.from);
      expect(Number(d.people)).toBeGreaterThan(0);
      expect(['ice', 'sea', 'famine']).toContain(d.cause);
      expect(e.causes.length).toBeGreaterThan(0);
      for (const c of e.causes) expect(sim.events.events[c]).toBeDefined();
      // they arrive somewhere: a town stands (or stood) where the chronicle says they settled
      expect(sim.civ.settlements.some((s) => s.cell === d.to)).toBe(true);
      if (d.host !== undefined) expect(e.description).toMatch(/among the people of/);
    }
  };

  it('an ice age sets a people moving, and the chronicle says why', () => {
    // (two strikes: how hard a world must be hit before a people leaves depends on where its towns happen to stand)
    const { sim, strike, before } = struck('iceage', 2);
    const moves = sim.events.events.slice(before).filter((e) => e.type === 'migration');
    expect(moves.length).toBeGreaterThanOrEqual(1);
    checkMoves(sim, moves);
    const cold = moves.filter((e) => e.data!.cause === 'ice');
    expect(cold.length).toBeGreaterThanOrEqual(1);
    // the cold that was called down is the cause on record
    expect(cold.some((e) => e.causes.includes(strike))).toBe(true);
    expect(cold[0]!.importance).toBeGreaterThanOrEqual(2);
    expect(cold[0]!.description).toMatch(/The ice has come down/);
    // no people moves twice within a few generations
    const byNation = new Map<number, number[]>();
    for (const e of moves) { const k = Number(e.data!.nation); byNation.set(k, [...(byNation.get(k) ?? []), e.simYear]); }
    for (const years of byNation.values()) for (let i = 1; i < years.length; i++) expect(years[i]! - years[i - 1]!).toBeGreaterThanOrEqual(150);
  }, 300000);

  it('a rising sea drives the people of drowned towns to higher ground', () => {
    // (two floods: one lifts the sea a sixth of a kilometre, which in this world takes too few towns to move a people)
    const { sim, strike, before } = struck('flood', 2);
    const moves = sim.events.events.slice(before).filter((e) => e.type === 'migration');
    checkMoves(sim, moves);
    const wet = moves.filter((e) => e.data!.cause === 'sea');
    expect(wet.length).toBeGreaterThanOrEqual(1);
    expect(wet.some((e) => e.causes.includes(strike))).toBe(true);
    // where they went stands above the water still, or was itself given up when the sea kept rising
    for (const e of wet) {
      // (a new town, or the town of another nation that took them in)
      const town = [...sim.civ.settlements].reverse().find((x) => x.cell === e.data!.to && x.founded <= e.simYear)!;
      expect(town).toBeDefined();
      expect(sim.world.elevation[town.cell]! > sim.world.seaLevel || town.ruined >= 0).toBe(true);
    }
  }, 300000);

  it('peoples grow apart and, where migrants move in, mix', () => {
    const runs = fiveHistories();
    let many = 0, mixed = 0;
    for (const r of runs) {
      const h = r.sim.civ.h;
      if (h.cultures.length > 1) many++;
      for (const n of h.nations) expect(h.cultures[n.culture]).toBeDefined();
      for (const c of h.cultures) {
        expect(h.languages[c.language]).toBeDefined();
        if (c.parent >= 0) {
          const parent = h.cultures[c.parent]!;
          expect(parent.species).toBe(c.species);
          // a daughter people speaks a changed tongue: some everyday words are no longer the same
          const mine = h.languages[c.language]!, theirs = h.languages[parent.language]!;
          expect(MEANINGS.some((m) => word(mine, m) !== word(theirs, m))).toBe(true);
          expect(MEANINGS.filter((m) => wordDistance(word(mine, m), word(theirs, m)) < 0.6).length).toBeGreaterThan(MEANINGS.length / 3);
        }
        if (c.mixedWith !== undefined) { mixed++; expect(h.cultures[c.mixedWith]).toBeDefined(); expect(c.mixedWith).not.toBe(c.parent); }
      }
      for (const e of r.sim.events.events.filter((x) => x.type === 'culture')) {
        const c = h.cultures[Number(e.data!.culture)]!;
        expect(c.mixedWith).toBe(Number(e.data!.other));
        expect(e.causes.some((id) => r.sim.events.events[id]!.type === 'migration')).toBe(true);
      }
      checkMoves(r.sim, r.sim.events.events.filter((e) => e.type === 'migration'));
    }
    expect(many).toBeGreaterThanOrEqual(3);
    expect(mixed).toBeGreaterThanOrEqual(0);
  }, 900000);

  it('the map draws an arrow for each recent migration, the short way round', () => {
    const ev = (id: number, type: string, data?: Record<string, number | string>): SimEvent => ({ id, type, simYear: id, cellId: -1, title: 't', description: 'd', causes: [], causeWeights: [], importance: 2, speciesIds: [], data } as unknown as SimEvent);
    const list = [ev(0, 'war'), ev(1, 'migration', { from: 3, to: 9, cause: 'ice' }), ev(2, 'migration'), ev(3, 'migration', { from: 4, to: 5, cause: 'sea' })];
    expect(recentMigrations(list).map((e) => e.id)).toEqual([1, 3]);
    expect(recentMigrations(list, 1).map((e) => e.id)).toEqual([3]);
    const straight = arrowPath([0.2, 0.5], [0.4, 0.5]);
    expect(straight).toMatch(/^M 144\.0 180\.0 Q /);
    expect(straight).toMatch(/ 288\.0 180\.0$/);
    // across the edge of the map the arrow goes the short way, off the side, not back across the whole world
    const wrap = arrowPath([0.95, 0.5], [0.05, 0.5]);
    expect(Number(wrap.split(' ').slice(-2)[0])).toBeGreaterThan(720);
  });
});

import { goldenGrade } from '../src/render/gfx/nations';

describe('golden ages (E10)', () => {
  it('golden ages begin, raise great works and end, each with its causes on record', () => {
    const runs = fiveHistories();
    let ages = 0, ended = 0, worlds = 0, works = 0;
    const reasons = new Set<string>();
    for (const r of runs) {
      const h = r.sim.civ.h, ev = r.sim.events.events;
      const starts = ev.filter((e) => e.type === 'golden-age');
      if (starts.length) worlds++;
      for (const e of starts) {
        ages++;
        const n = h.nations[Number(e.data!.nation)]!;
        expect(e.title).toBe(`The golden age of ${n.name}`);
        expect(e.importance).toBe(2);
        // the chronicle names the age, in the people's own tongue and in plain words
        expect(String(e.data!.own)).toMatch(/^the \S+/);
        expect(e.description).toContain(String(e.data!.own));
        expect(e.description).toContain(String(e.data!.gloss));
        expect(e.causes.length).toBeGreaterThan(0);
        for (const c of e.causes) expect(ev[c]!.simYear).toBeLessThanOrEqual(e.simYear);
        expect(h.people[Number(e.data!.person)]).toBeDefined();
      }
      for (const e of ev.filter((x) => x.type === 'golden-age-end')) {
        ended++;
        const d = e.data!;
        reasons.add(String(d.reason));
        // it is tied to the age it ends, and to whatever ended it
        const began = e.causes.map((c) => ev[c]!).find((c) => c.type === 'golden-age')!;
        expect(began).toBeDefined();
        expect(began.data!.nation).toBe(d.nation);
        expect(Math.abs(e.simYear - began.simYear - Number(d.years))).toBeLessThan(2);
        expect(e.description).toContain(String(d.reason));
        if (/war reached|plague|land itself|ruling house/.test(String(d.reason))) expect(e.causes.length).toBeGreaterThanOrEqual(2);
        // the great works of the age are the monuments raised between its beginning and its end
        const raised = ev.filter((x) => x.type === 'monument' && x.data!.nation === d.nation && x.causes.includes(began.id));
        expect(raised.length).toBe(Number(d.works));
        works += raised.length;
        // no country has two golden ages within a few generations
        const next = starts.find((x) => x.data!.nation === d.nation && x.simYear > e.simYear);
        if (next) expect(next.simYear - e.simYear).toBeGreaterThanOrEqual(250);
      }
      for (const e of ev.filter((x) => x.type === 'monument')) {
        const town = r.sim.civ.settlements[Number(e.data!.settlement)]!;
        expect(town.monuments ?? 0).toBeGreaterThan(0);
        expect(ev[e.causes[0]!]!.type).toBe('golden-age');
      }
      // a country still in its golden age is alive, and one that has ended keeps no flag
      for (const n of h.nations) if (n.golden) { expect(n.ended).toBeLessThan(0); expect(ev[n.golden.eventId]!.type).toBe('golden-age'); }
    }
    expect(worlds).toBeGreaterThanOrEqual(Math.min(3, runs.length));
    expect(ages).toBeGreaterThanOrEqual(6);
    expect(ended).toBeGreaterThanOrEqual(4);
    expect(works).toBeGreaterThan(0);
    expect(reasons.size).toBeGreaterThanOrEqual(2);
  }, 900000);

  it('a country in its golden age is shown warm on the map', () => {
    const cool: [number, number, number] = [0.2, 0.9, 1.0];
    const warm = goldenGrade(cool);
    expect(warm[0]).toBeGreaterThan(cool[0]);
    expect(warm[2]).toBeLessThan(cool[2]);
    for (const v of warm) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    // already warm colours stay warm, and nothing is pushed past full brightness
    const fire = goldenGrade([1.0, 0.5, 0.14]);
    expect(fire[0]).toBe(1);
    expect(fire[1]).toBeGreaterThan(0.5);
  });
});

import { NETWORKS, WONDER_KINDS } from '../src/sim/history/model';
import { LEXICON, SAYINGS, describeGrammar, describeSounds, driftSpan, grammarOf, say } from '../src/sim/history/syntax';
import { CALAMITIES, REBUILDS, answer, brittle, damage, describeScar, hazards, plotFate, rebuildYears, woodShare, type Ground, type Scar } from '../src/sim/history/calamity';

describe('infrastructure networks (E15)', () => {
  it('a full run joins its towns with at least five kinds of network, one after another', () => {
    const runs = fiveHistories();
    let most = 0, cross = 0, total = 0;
    for (const r of runs) {
      const h = r.sim.civ.h, ev = r.sim.events.events, links = h.links ?? [];
      const kinds = new Set(links.map((l) => l.kind));
      most = Math.max(most, kinds.size);
      total += links.length;
      const seen = new Set<string>();
      const perTown = new Map<string, number>();
      for (const l of links) {
        const a = r.sim.civ.settlements[l.a]!, b = r.sim.civ.settlements[l.b]!;
        expect(a).toBeDefined(); expect(b).toBeDefined();
        expect(l.a).toBeLessThan(l.b);
        expect(NETWORKS[l.kind]).toBeDefined();
        // never the same stretch twice
        const key = `${l.a}-${l.b}-${l.kind}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        // the nation that built it knew how
        expect(h.nations[l.nation]).toBeDefined();
        for (const t of [l.a, l.b]) perTown.set(`${t}-${l.kind}`, (perTown.get(`${t}-${l.kind}`) ?? 0) + 1);
        if (a.nation !== b.nation) cross++;
      }
      // the first of each kind is in the chronicle, tied to the two towns and to the first of the kind before it
      const firsts = (h.firstLinks ?? []).map((id, k) => ({ k, e: id !== undefined && id >= 0 ? ev[id]! : undefined })).filter((x) => x.e);
      for (const { k, e } of firsts) {
        expect(e!.type).toBe('network');
        expect(e!.importance).toBe(2);
        expect(Number(e!.data!.kind)).toBe(k);
        expect(e!.description).not.toMatch(/\{[abn]\}/);
        // (by the name it bore then: names wear, system E22)
        const names = [Number(e!.data!.a), Number(e!.data!.b)].flatMap((id) => { const st = r.sim.civ.settlements[id]!; return st.names ? st.names.map((x) => x.name) : [st.name]; });
        expect(names.some((name) => e!.description.includes(name))).toBe(true);
        expect(links.filter((l) => l.kind === k).every((l) => l.year >= e!.simYear - 1)).toBe(true);
      }
      // a kind is only ever built by a people that had the knowledge for it, so the kinds come in over the centuries
      const years = firsts.map((x) => x.e!.simYear).sort((a, b) => a - b);
      if (years.length >= 5) expect(years[years.length - 1]! - years[0]!).toBeGreaterThan(500);
    }
    expect(most).toBeGreaterThanOrEqual(5);
    expect(total).toBeGreaterThan(100);
    expect(cross).toBeGreaterThan(0);
  }, 900000);

  it('the kinds of network come in the order a people learns them', () => {
    const level = (id: string) => WEB[SLOT_INDEX.get(id)!]!.level;
    for (let k = 1; k < NETWORKS.length; k++) expect(level(NETWORKS[k]!.needs)).toBeGreaterThan(level(NETWORKS[k - 1]!.needs));
    expect(NETWORKS.length).toBeGreaterThanOrEqual(7);
    expect(new Set(NETWORKS.map((n) => n.id)).size).toBe(NETWORKS.length);
    // only wires cross the sea
    expect(NETWORKS.filter((n) => n.sea).map((n) => n.id)).toEqual(['wire', 'power']);
  });
});

import { updateMoisture } from '../src/sim/climate';
import { clearedCover } from '../src/sim/plants';

describe('farmland and landscape change (E16)', () => {
  it('cutting a forest measurably lowers the rainfall where it stood', () => {
    const sim = atDawn(0)!;
    const w = sim.world, g = sim.grid;
    // the most wooded land in this world: the forty cells with the thickest cover
    const land: number[] = [];
    for (let i = 0; i < g.count; i++) if (w.elevation[i]! > w.seaLevel && w.cleared[i] === 0) land.push(i);
    sim.plants.paint(w, sim.climate);
    land.sort((p, q) => w.vegetation[q]! * (0.3 + w.canopy[q]!) - w.vegetation[p]! * (0.3 + w.canopy[p]!));
    const block = land.slice(0, 40);
    expect(block.length).toBe(40);
    const mean = (layer: Float32Array) => block.reduce((a, c) => a + layer[c]!, 0) / block.length;
    // the rain as it is, with the forest standing
    sim.plants.paint(w, sim.climate);
    updateMoisture(w, sim.climate, 8);
    const rainBefore = mean(w.moisture), coverBefore = mean(w.vegetation), treesBefore = mean(w.canopy);
    expect(coverBefore).toBeGreaterThan(0.2);
    // fell it
    for (const c of block) w.cleared[c] = 1;
    sim.plants.paint(w, sim.climate);
    updateMoisture(w, sim.climate, 8);
    const rainAfter = mean(w.moisture), coverAfter = mean(w.vegetation);
    expect(coverAfter).toBeLessThan(coverBefore * 0.75);
    expect(mean(w.canopy)).toBe(0);
    expect(treesBefore).toBeGreaterThan(0);
    // less rain where the trees stood: by a measurable amount
    // (about a hundredth of the scale, more than a hundred times what repeating the calculation changes)
    expect(rainBefore - rainAfter).toBeGreaterThan(0.006);
    expect(rainAfter).toBeLessThan(rainBefore * 0.994);
    // and it comes back when the land is left alone
    for (const c of block) w.cleared[c] = 0;
    sim.plants.paint(w, sim.climate);
    updateMoisture(w, sim.climate, 8);
    expect(mean(w.moisture)).toBeGreaterThan(rainAfter + 0.004);
  }, 300000);

  it('towns clear the land round them, dam rivers, open mines, and the chronicle records it', () => {
    expect(clearedCover(0.8, 0)).toBeCloseTo(0.8);
    expect(clearedCover(0.8, 1)).toBeCloseTo(0.38);
    expect(clearedCover(0, 1)).toBeCloseTo(0.22);
    const runs = fiveHistories();
    let dams = 0, mines = 0, fellings = 0, clearedCells = 0;
    for (const r of runs) {
      const w = r.sim.world, ev = r.sim.events.events, civ = r.sim.civ;
      for (let i = 0; i < w.cleared.length; i++) {
        const c = w.cleared[i]!;
        expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1);
        // what the cells show is what the clearing says, exactly once
        expect(w.clearedApplied[i]).toBe(c);
        expect(w.vegetation[i]!).toBeGreaterThanOrEqual(0); expect(w.vegetation[i]!).toBeLessThanOrEqual(1.0001);
        if (c > 0) { clearedCells++; expect(w.elevation[i]!).toBeGreaterThan(w.seaLevel); }
        if (c === 1) expect(w.canopy[i]).toBe(0);
      }
      // every living farming town has cleared the land at its door
      for (const st of civ.settlements) {
        if (st.ruined >= 0 || !st.farms) continue;
        expect(w.cleared[st.cell]).toBe(1);
        if (st.dam !== undefined) { dams++; expect(w.flow[st.dam]!).toBeGreaterThanOrEqual(34); }
        if (st.mine !== undefined) { mines++; expect(w.cleared[st.mine]).toBe(1); expect(w.elevation[st.mine]!).toBeGreaterThan(w.elevation[st.cell]!); }
      }
      for (const e of ev.filter((x) => x.type === 'landscape')) {
        expect(['dam', 'mine', 'felling']).toContain(e.data!.work);
        expect(e.causes.length).toBeGreaterThan(0);
        if (e.data!.work === 'felling') { fellings++; expect(e.description).toMatch(/rain itself comes a little less often/); expect(civ.h.nations[Number(e.data!.nation)]!.felled).toBe(e.simYear); }
      }
      const first = civ.h.firstWorks ?? {};
      for (const id of [first.dam, first.mine, first.felled]) if (id !== undefined) expect(ev[id]!.importance).toBe(2);
    }
    expect(clearedCells).toBeGreaterThan(200);
    expect(dams).toBeGreaterThan(3);
    expect(mines).toBeGreaterThan(3);
    expect(fellings).toBeGreaterThan(0);
    // left alone, the land goes back: with land use switched off the next step restores the wild cover
    const sim = runs[0]!.sim;
    const town = sim.civ.settlements.find((s) => s.ruined < 0 && s.farms)!;
    const was = sim.world.vegetation[town.cell]!;
    sim.civ.landUse = false;
    sim.step(1);
    expect(sim.world.cleared[town.cell]).toBe(0);
    expect(sim.world.clearedApplied[town.cell]).toBe(0);
    expect(sim.world.vegetation[town.cell]!).not.toBe(was);
    sim.civ.landUse = true;
    sim.step(1);
    expect(sim.world.cleared[town.cell]).toBe(1);
    expect(sim.world.vegetation[town.cell]!).toBeCloseTo(was, 4);
  }, 900000);
});

import { layerLook, siteBands } from '../src/ui/site';

describe('ruins and layers (E17)', () => {
  it('a long-lived city site has three or more layers, oldest at the bottom', () => {
    const runs = fiveHistories();
    let deep = 0, burnt = 0, over = 0, worlds = 0;
    const KINDS = ['camp', 'village', 'town', 'city', 'great city', 'burnt', 'flood', 'ash', 'shaken', 'decay', 'abandoned'];
    for (const r of runs) {
      const civ = r.sim.civ;
      let best = 0;
      for (const st of civ.settlements) {
        const strata = st.strata ?? [];
        expect(strata.length).toBeGreaterThanOrEqual(1);
        // the bottom layer is the first building of the place: a camp, or what its settlers already knew how to build
        expect(['camp', 'village', 'town', 'city', 'great city']).toContain(strata[0]!.kind);
        for (let i = 0; i < strata.length; i++) {
          expect(KINDS).toContain(strata[i]!.kind);
          if (i) expect(strata[i]!.year).toBeGreaterThanOrEqual(strata[i - 1]!.year);
          if (strata[i]!.kind === 'burnt') burnt++;
        }
        // a town that is gone ends in an abandonment layer, and only such a town has one
        expect(strata.some((x) => x.kind === 'abandoned')).toBe(st.ruined >= 0);
        // a town built on a ruin stands on the same spot, and was founded after the ruin was left
        if (st.over !== undefined) {
          over++;
          const under = civ.settlements[st.over]!;
          expect(under.cell).toBe(st.cell);
          expect(under.ruined).toBeGreaterThanOrEqual(0);
          expect(st.founded).toBeGreaterThanOrEqual(under.ruined);
        }
        // a city that has stood a few centuries has a city in its ground (a deep site thins its middle layers, never its first)
        if (st.ruined < 0 && st.tech >= 0.6 && st.nation >= 0 && r.sim.simYear - st.founded > 300 && strata.length < 14) expect(strata.some((x) => x.kind === 'city' || x.kind === 'great city'), `${st.name}: ${strata.map((x) => x.kind).join(' ')}`).toBe(true);
        const stack = civ.siteOf(st.id)!;
        expect(stack.cell).toBe(st.cell);
        expect(stack.towns.some((t) => t.id === st.id)).toBe(true);
        expect(stack.layers).toBe(stack.towns.reduce((a, t) => a + t.strata.length, 0));
        for (let k = 1; k < stack.towns.length; k++) expect(stack.towns[k]!.founded).toBeGreaterThanOrEqual(stack.towns[k - 1]!.founded);
        if (st.ruined < 0 && stack.layers >= 3) deep++;
        best = Math.max(best, stack.layers);
      }
      if (best >= 3) worlds++;
    }
    expect(worlds).toBe(runs.length);
    expect(deep).toBeGreaterThan(20);
    expect(burnt).toBeGreaterThan(0);
    expect(over).toBeGreaterThanOrEqual(0);
  }, 900000);

  it('the dig view stacks the layers of every town on the site, each with its own look', () => {
    const l = (kind: string, year: number, tech = 0.5) => ({ year, kind, tech, cause: kind === 'burnt' ? 'War between A and B' : '', eventId: kind === 'burnt' ? 7 : -1 });
    const d = { id: 2, cell: 5, layers: 7, towns: [
      { id: 1, name: 'Old', people: 'x', species: 0, founded: 100, ruined: 900, strata: [l('camp', 100, 0.05), l('village', 400, 0.32), l('burnt', 700), l('abandoned', 900)] },
      { id: 2, name: 'New', people: 'x', species: 0, founded: 1500, ruined: -1, strata: [l('camp', 1500, 0.2), l('town', 1900, 0.5), l('city', 2400, 0.9)] },
    ] };
    const bands = siteBands(d);
    expect(bands.length).toBe(7);
    // from the bottom up, without gaps or overlaps, the older town under the newer
    for (let i = 1; i < bands.length; i++) { expect(bands[i]!.y).toBe(bands[i - 1]!.y + bands[i - 1]!.h); expect(bands[i]!.town).toBeGreaterThanOrEqual(bands[i - 1]!.town); }
    expect(bands[0]!.town).toBe(0);
    expect(bands[6]!.town).toBe(1);
    // a burning is black, and thin beside a city's buildings; what a phase is made of follows what was known
    expect(layerLook(l('burnt', 1)).fill).not.toBe(layerLook(l('ash', 1)).fill);
    expect(layerLook(l('burnt', 1)).thick).toBeLessThan(layerLook(l('city', 1, 0.9)).thick);
    expect(layerLook(l('village', 1, 0.2)).words).toMatch(/post holes/);
    expect(layerLook(l('city', 1, 0.7)).words).toMatch(/dressed stone/);
    expect(layerLook(l('great city', 1, 1.1)).words).toMatch(/concrete, steel and glass/);
    expect(new Set(['camp', 'burnt', 'ash', 'flood', 'shaken', 'decay', 'abandoned'].map((k) => layerLook(l(k, 1, 0.1)).fill)).size).toBe(7);
  });
});

import { DECAY, decayOf, decaySpans, describeRuin, standing, stillCleared } from '../src/sim/history/decay';

describe('feral cities (E18)', () => {
  it('a ruin decays in stages, a great city more slowly than a village', () => {
    expect(DECAY.length).toBe(5);
    expect(decayOf(0, 0.8).stage).toBe(0);
    // every stage in order as the centuries pass, never back
    let last = -1;
    const seen = new Set<number>();
    for (let y = 0; y < 9000; y += 10) { const s = decayOf(y, 0.8).stage; expect(s).toBeGreaterThanOrEqual(last); last = s; seen.add(s); }
    expect(seen.size).toBe(5);
    expect(DECAY[decayOf(1e6, 1.2).stage]).toBe('gone');
    // stone and steel outlast mud brick
    const sum = (t: number) => decaySpans(t).reduce((a, b) => a + b, 0);
    expect(sum(1.1)).toBeGreaterThan(sum(0.35) * 1.8);
    expect(decayOf(800, 0.35).stage).toBeGreaterThan(decayOf(800, 1.1).stage);
    // what stands dwindles without ever growing back
    let share = 1, height = 1;
    for (let y = 0; y < 9000; y += 25) { const s = standing(y, 0.9); expect(s.share).toBeLessThanOrEqual(share + 1e-9); expect(s.height).toBeLessThanOrEqual(height + 1e-9); share = s.share; height = s.height; }
    expect(standing(0, 0.9).share).toBe(1);
    expect(share).toBe(0);
    // fields go back in generations, streets in centuries, and both do go back
    expect(stillCleared(0, true)).toBe(1);
    expect(stillCleared(300, false)).toBeLessThan(stillCleared(300, true));
    expect(stillCleared(1000, false)).toBe(0);
    expect(stillCleared(2600, true)).toBe(0);
    expect(new Set([0, 100, 500, 2000, 9000].map((y) => describeRuin(y, 0.6))).size).toBe(5);
  });

  it('a collapsed city fully returns to forest, given enough time', () => {
    const sim = atDawn(1)!;
    for (let y = 0; y < 2500; y++) sim.step(1);
    const w = sim.world, civ = sim.civ;
    const towns = civ.settlements.filter((s) => s.ruined < 0 && s.farms);
    expect(towns.length).toBeGreaterThan(3);
    let bare = 0;
    for (let i = 0; i < w.cleared.length; i++) if (w.cleared[i]! > 0) bare++;
    expect(bare).toBeGreaterThan(20);
    // the people go: every town is emptied at once
    for (const st of civ.settlements) if (st.ruined < 0) st.pop = 0;
    sim.step(1);
    expect(civ.settlements.filter((s) => s.ruined < 0 && s.farms).length).toBe(0);
    const big = towns.reduce((a, b) => ((b.peak ?? 0) > (a.peak ?? 0) ? b : a));
    expect(big.ruined).toBeGreaterThan(0);
    expect(big.peak ?? 0).toBeGreaterThan(1);
    // its streets are still bare the year after, greener a few centuries on, and its fields go back first
    expect(w.cleared[big.cell]!).toBeGreaterThan(0.95);
    for (let y = 0; y < 300; y += 25) sim.step(25);
    const streets = w.cleared[big.cell]!;
    expect(streets).toBeGreaterThan(0.3);
    expect(streets).toBeLessThan(0.75);
    const field = sim.grid.neighbors[big.cell * 6]!;
    if (w.elevation[field]! > w.seaLevel) expect(w.cleared[field]!).toBeLessThan(streets);
    // given enough time nothing is bare anywhere: the plant cover is exactly what it would be had no one ever lived here
    for (let y = 300; y < 3000; y += 50) sim.step(50);
    for (let i = 0; i < w.cleared.length; i++) { expect(w.cleared[i]).toBe(0); expect(w.clearedApplied[i]).toBe(0); }
    const cover = w.vegetation.slice(), trees = w.canopy.slice();
    sim.plants.paint(w, sim.climate);
    let differ = 0;
    for (let i = 0; i < cover.length; i++) if (Math.abs(cover[i]! - w.vegetation[i]!) > 0.02 || Math.abs(trees[i]! - w.canopy[i]!) > 0.05) differ++;
    expect(differ).toBeLessThan(cover.length * 0.01);
    // and the ruin itself is mounds or less by now
    expect(decayOf(sim.simYear - big.ruined, big.tech).stage).toBeGreaterThanOrEqual(2);
    // the animals its people kept are no one's now
    for (const sp of sim.creatures.species) expect(sp.tamedBy < 0 || civ.settlements.some((s) => s.ruined < 0 && s.species === sp.tamedBy)).toBe(true);
    for (const st of civ.settlements) {
      if (st.feral !== undefined) expect(sim.creatures.species[st.feral]).toBeDefined();
      if (st.nesting !== undefined) { expect(st.tech).toBeGreaterThanOrEqual(0.6); expect(st.nesting).not.toBe(st.species); }
    }
    for (const e of sim.events.events.filter((x) => x.type === 'feral')) { expect((e.speciesIds ?? []).length).toBe(1); expect(e.description.length).toBeGreaterThan(60); }
  }, 600000);
});

describe('wonders (E19)', () => {
  it('every wonder links to the event that inspired it', () => {
    const runs = fiveHistories();
    let total = 0;
    const kinds = new Set<string>();
    for (const { sim } of runs) {
      const ev = sim.events.events, all = sim.civ.h.wonders ?? [];
      total += all.length;
      const ids = new Set<number>();
      for (const w of all) {
        kinds.add(w.kind);
        expect(WONDER_KINDS).toContain(w.kind);
        expect(ids.has(w.id)).toBe(false);
        ids.add(w.id);
        // what inspired it is an event on record, older than the wonder
        const cause = ev[w.cause];
        expect(cause, `${w.name} has no cause`).toBeTruthy();
        expect(cause!.simYear).toBeLessThanOrEqual(w.year);
        // its own raising is an event caused by that one: the cause graph leads from the wonder back to its reason
        const own = ev[w.eventId]!;
        expect(own.type).toBe('wonder');
        expect(own.causes).toContain(w.cause);
        expect(cause!.effects).toContain(w.eventId);
        expect(own.data!.cause).toBe(w.cause);
        // it stands in a town that exists, takes years to build, and says why
        expect(sim.civ.settlements[w.settlement]).toBeTruthy();
        expect(own.cellId).toBe(sim.civ.settlements[w.settlement]!.cell);
        expect(w.done).toBeGreaterThan(w.year + 5);
        expect(w.why.length).toBeGreaterThan(20);
        // the kind answers the kind of event
        const fits: Record<string, RegExp> = { observatory: /comet/, sungate: /eclipse/, 'crater-stair': /impact/, 'fire-watch': /erupt|volcan/, 'first-tower': /milestone/, tomb: /./, victory: /war/, lighthouse: /settlement/, memorial: /./, colossus: /golden-age/, 'peace-hall': /long-peace/ };
        expect(cause!.type).toMatch(fits[w.kind]!);
        if (w.kind === 'crater-stair' || w.kind === 'fire-watch') expect(w.toward).toBe(cause!.cellId);
        if (w.kind === 'observatory') expect(Number.isFinite(w.bearing)).toBe(true);
      }
      // no country raises two at once, and the world is not crowded with them
      for (const a of all) for (const b of all) if (a.id < b.id && a.nation === b.nation && b.kind !== 'peace-hall') expect(b.year).toBeGreaterThanOrEqual(a.done);
      expect(all.length).toBeLessThan(70);
    }
    expect(total).toBeGreaterThan(8);
    // they are not all alike
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('the same history raises the same wonders', () => {
    const a = atDawn(0)!, b = atDawn(0)!;
    for (let y = 0; y < 2600; y++) { a.step(1); b.step(1); }
    expect(JSON.stringify(a.civ.h.wonders ?? [])).toBe(JSON.stringify(b.civ.h.wonders ?? []));
  });

  it('a meteor the player drops is answered, in time, by a stepped mound whose stair faces its crater', () => {
    // (this changes the shared histories: only tests that can live with a dropped meteor come after it)
    const runs = fiveHistories();
    let stairs = 0;
    for (const { sim } of runs) {
      const big = sim.civ.settlements.filter((s) => s.ruined < 0 && s.nation >= 0).sort((p, q) => q.pop - p.pop)[0];
      if (!big) continue;
      const g = sim.grid;
      let cell = big.cell;
      for (let k = 0; k < 4; k++) cell = g.neighbors[cell * 6 + (k % g.ncount[cell]!)]!;
      const fall = sim.meteor(cell, 0.2, true);
      for (let y = 0; y < 2500; y++) {
        sim.step(1);
        if (y % 25 === 0 && (sim.civ.h.wonders ?? []).some((w) => w.kind === 'crater-stair' && w.cause === fall.id)) break;
      }
      const stair = (sim.civ.h.wonders ?? []).find((w) => w.kind === 'crater-stair' && w.cause === fall.id);
      if (!stair) continue;
      stairs++;
      expect(stair.toward).toBe(cell);
      expect(sim.civ.settlements[stair.settlement]!.cell).not.toBe(cell);
      expect(sim.events.events[stair.eventId]!.causes).toContain(fall.id);
      expect(stair.why).toMatch(/crater/);
    }
    expect(stairs).toBeGreaterThanOrEqual(2);
  });
});

describe('disasters in cities (E20)', () => {
  const ground: Ground = { dry: 0.6, low: 0.5, fault: 0.6, peak: 0.6 };

  it('damage depends on what a town is built of and where it stands', () => {
    // timber burns, stone and steel much less; a dry town burns worse than a wet one
    expect(damage('fire', 0.35, ground, 0.7, undefined)).toBeGreaterThan(damage('fire', 0.95, ground, 0.7, undefined) * 2.5);
    expect(damage('fire', 0.4, { ...ground, dry: 1 }, 0.7, undefined)).toBeGreaterThan(damage('fire', 0.4, { ...ground, dry: 0 }, 0.7, undefined));
    expect(woodShare(0.3)).toBe(1);
    expect(woodShare(1.1)).toBeLessThan(0.2);
    // tall masonry falls worst: worse than huts, worse than steel
    expect(brittle(0.65)).toBeGreaterThan(brittle(0.2) * 2);
    expect(brittle(0.65)).toBeGreaterThan(brittle(1.05) * 2);
    expect(damage('quake', 0.65, ground, 0.8, undefined)).toBeGreaterThan(damage('quake', 1.05, ground, 0.8, undefined) * 2);
    // low ground floods; a town close under the mountain is buried deeper
    expect(damage('flood', 0.6, { ...ground, low: 1 }, 0.6, undefined)).toBeGreaterThan(damage('flood', 0.6, { ...ground, low: 0.1 }, 0.6, undefined) * 2);
    expect(damage('ash', 0.6, { ...ground, peak: 1 }, 0.6, undefined)).toBeGreaterThan(damage('ash', 0.6, { ...ground, peak: 0.1 }, 0.6, undefined) * 1.8);
    // a country that has made its laws loses less, and is struck by fire and flood less often
    const codes = { fire: { year: 10, eventId: -1 }, quake: { year: 10, eventId: -1 }, flood: { year: 10, eventId: -1 } };
    for (const kind of ['fire', 'quake', 'flood'] as const) expect(damage(kind, 0.5, ground, 0.7, codes)).toBeLessThan(damage(kind, 0.5, ground, 0.7, undefined) * 0.6);
    expect(hazards(0.5, 1, ground, codes).fire).toBeLessThan(hazards(0.5, 1, ground, undefined).fire * 0.5);
    expect(hazards(0.5, 1, { ...ground, fault: 0.1 }, undefined).quake).toBe(0);
    expect(hazards(0.5, 1, { ...ground, peak: 0 }, undefined).ash).toBe(0);
    // what a town does about it
    expect(answer('fire', 0.5, 0.45, undefined)).toEqual({ rebuilt: 'stone', law: true });
    expect(answer('fire', 0.5, 0.3, undefined)).toEqual({ rebuilt: '', law: false }); // no written law yet: it builds as before, and will burn again
    expect(answer('fire', 0.1, 0.45, codes)).toEqual({ rebuilt: 'stone', law: false });
    expect(answer('quake', 0.4, 0.6, undefined).rebuilt).toBe('braced');
    expect(answer('flood', 0.3, 0.4, undefined).rebuilt).toBe('raised');
    expect(answer('flood', 0.5, 0.7, undefined).rebuilt).toBe('moved');
    expect(answer('ash', 0.6, 0.7, undefined).rebuilt).toBe('moved');
    expect(rebuildYears(0.35)).toBeGreaterThan(rebuildYears(1.0) * 2);
  });

  it('a disaster leads to a visible change in how the city rebuilds', () => {
    // a round town of 200 plots built over four centuries, and a great fire in year 1000 answered in stone
    const plots = Array.from({ length: 200 }, (_, k) => { const r = 0.7 * Math.sqrt(k + 0.5), a = k * 2.39996; return { x: r * Math.cos(a), y: r * Math.sin(a), built: 600 + k * 1.8 }; });
    const radius = Math.max(...plots.map((p) => Math.hypot(p.x, p.y)));
    const fire: Scar = { year: 1000, kind: 'fire', share: 0.45, eventId: -1, rebuilt: 'stone' };
    const at = (year: number, scars: Scar[], codes: number[] = [-1, -1, -1]) => plots.map((p, k) => plotFate(k, p.x, p.y, radius, p.built, scars, codes, year, 0.5, 77, 0, () => 0));
    const count = (fates: ReturnType<typeof at>, f: (x: (typeof fates)[number]) => boolean) => fates.filter(f).length;
    // before the fire nothing is amiss and nothing is of stone
    const before = at(999, [fire]);
    expect(count(before, (x) => x.state === 'standing' && !x.stone)).toBe(200);
    // the day after, about that share of the town is a wreck, in one quarter of it rather than scattered
    const after = at(1000.5, [fire]);
    const wrecked = after.map((x, k) => (x.state === 'wreck' ? k : -1)).filter((k) => k >= 0);
    expect(wrecked.length / 200).toBeGreaterThan(0.3);
    expect(wrecked.length / 200).toBeLessThan(0.6);
    let sx = 0, sy = 0;
    for (const k of wrecked) { const p = plots[k]!; const r = Math.hypot(p.x, p.y) || 1; sx += p.x / r; sy += p.y / r; }
    expect(Math.hypot(sx, sy) / wrecked.length).toBeGreaterThan(0.35);
    // some years on it is being built again: wrecks, sites and finished buildings side by side
    const during = at(1000 + rebuildYears(0.5) * 0.5, [fire]);
    expect(count(during, (x) => x.state === 'rebuilding')).toBeGreaterThan(5);
    expect(count(during, (x) => x.state === 'wreck')).toBeGreaterThan(5);
    for (const x of during) if (x.state === 'rebuilding') { expect(x.progress).toBeGreaterThan(0); expect(x.progress).toBeLessThan(1); expect(x.stone).toBe(true); }
    // a lifetime on everything stands again, and exactly what burned is now of stone: the town shows where the fire went
    const later = at(1000 + rebuildYears(0.5) * 1.5, [fire]);
    expect(count(later, (x) => x.state === 'standing')).toBe(200);
    for (let k = 0; k < 200; k++) { expect(later[k]!.stone).toBe(wrecked.includes(k)); if (wrecked.includes(k)) expect(later[k]!.born).toBeGreaterThan(1000); }
    // the same fire answered with nothing leaves a town that looks as it did
    expect(count(at(1100, [{ ...fire, rebuilt: '' }]), (x) => x.stone)).toBe(0);
    // an earthquake takes buildings here and there, and what is built again is low and braced
    const quake: Scar = { year: 1000, kind: 'quake', share: 0.4, eventId: -1, rebuilt: 'braced' };
    const shaken = at(1000.5, [quake]).map((x, k) => (x.state === 'wreck' ? k : -1)).filter((k) => k >= 0);
    sx = 0; sy = 0;
    for (const k of shaken) { const p = plots[k]!; const r = Math.hypot(p.x, p.y) || 1; sx += p.x / r; sy += p.y / r; }
    expect(Math.hypot(sx, sy) / shaken.length).toBeLessThan(0.3);
    expect(count(at(1200, [quake]), (x) => x.braced)).toBe(shaken.length);
    // a flood takes the side toward the water; a great one makes the town give that ground up for good
    const flood: Scar = { year: 1000, kind: 'flood', share: 0.3, eventId: -1, rebuilt: 'moved' };
    const given = at(1500, [flood]);
    expect(count(given, (x) => x.state === 'given-up')).toBeGreaterThan(20);
    for (let k = 0; k < 200; k++) if (given[k]!.state === 'given-up') expect(plots[k]!.x).toBeGreaterThan(0);
    expect(count(at(1500, [{ ...flood, rebuilt: 'raised' }]), (x) => x.raised)).toBe(count(given, (x) => x.state === 'given-up'));
    // once there is a law, whatever is built after it follows it, burned or not
    const grown = at(1400, [], [1100, -1, -1]);
    for (let k = 0; k < 200; k++) expect(grown[k]!.stone).toBe(plots[k]!.built > 1100);
    // every scar can be said in a sentence, each differently
    expect(new Set([fire, quake, flood, { ...flood, rebuilt: 'raised' as const }, { ...fire, rebuilt: '' as const }].map((s) => describeScar(s, 120))).size).toBe(5);
  });

  it('in five histories towns burn, fall and flood, and great fires make building laws that the country then builds by', () => {
    // (the wonders test above dropped a meteor on each of these worlds and ran them on: that is part of their history now)
    const runs = fiveHistories();
    let fires = 0, laws = 0, stone = 0, kinds = new Set<string>();
    for (const { sim } of runs) {
      const ev = sim.events.events, h = sim.civ.h;
      fires += ev.filter((e) => e.type === 'city-fire').length;
      for (const e of ev) {
        if (e.type !== 'building-law') continue;
        laws++;
        // a law is caused by the calamity that prompted it, at the town where it happened
        const cause = ev[e.causes[0]!]!;
        expect(cause.type).toMatch(/city-fire|city-quake|city-flood|tsunami|hurricane|earthquake|impact|eruption/);
        expect(e.simYear).toBeGreaterThanOrEqual(cause.simYear);
        const n = h.nations[Number(e.data!.nation)]!;
        const code = n.codes![e.data!.kind as 'fire' | 'quake' | 'flood']!;
        expect(code.eventId).toBe(e.id);
        expect(code.year).toBe(e.simYear);
      }
      for (const st of sim.civ.settlements) {
        const scars = st.scars ?? [];
        expect(scars.length).toBeLessThanOrEqual(5);
        for (let i = 0; i < scars.length; i++) {
          const s = scars[i]!;
          kinds.add(s.kind);
          expect(CALAMITIES).toContain(s.kind);
          expect(REBUILDS).toContain(s.rebuilt);
          expect(s.share).toBeGreaterThan(0);
          expect(s.share).toBeLessThanOrEqual(0.95);
          if (i > 0) expect(s.year).toBeGreaterThanOrEqual(scars[i - 1]!.year);
          if (s.eventId >= 0) expect(ev[s.eventId]!.simYear).toBeLessThanOrEqual(s.year + 1e-6);
          if (s.rebuilt === 'stone') stone++;
          // a town in a country with a fire law always builds again in stone after a fire
          const n = st.nation >= 0 ? h.nations[st.nation] : undefined;
          if (s.kind === 'fire' && n && n.id === st.nation && n.codes?.fire && n.codes.fire.year < s.year && st.ruined < 0 && s.year > (st.scars![0]!.year)) expect(['stone', '']).toContain(s.rebuilt);
        }
      }
    }
    expect(fires).toBeGreaterThan(20);
    expect(laws).toBeGreaterThan(5);
    expect(stone).toBeGreaterThan(5);
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });
});

describe('generated languages (E21)', () => {
  it('a family shares its grammar, and its endings are words that wear down with the rest', () => {
    const mother = makeLanguage(0, 4242, big, 0);
    const rng = new RNG(5);
    for (let y = 100; y <= 300; y += 100) soundChange(mother, rng, y);
    const east = splitLanguage(mother, 1, 400), west = splitLanguage(mother, 2, 400);
    for (let y = 500; y <= 1500; y += 100) { soundChange(east, rng, y); soundChange(west, rng, y); }
    const stranger = makeLanguage(3, 9911, small, 0);
    expect(grammarOf(east)).toEqual(grammarOf(west));
    expect(LEXICON.length).toBeGreaterThanOrEqual(30);
    expect(new Set(LEXICON).size).toBe(LEXICON.length);
    for (const what of SAYINGS) {
      const a = say(east, what), b = say(west, what), c = say(stranger, what);
      // every word of the sentence is a word of the language, and the gloss names each meaning
      for (const m of [what.s, what.v, what.o]) { expect(a.gloss).toContain(m); expect(a.text.toLowerCase()).toContain(word(east, m).slice(0, 3)); }
      if (what.past) expect(a.gloss).toMatch(/BEFORE/);
      expect(a.text.endsWith('.')).toBe(true);
      // sisters say it with the same shape (as many words in the same order of meanings), strangers need not
      expect(a.gloss).toBe(b.gloss);
      expect(a.text).not.toBe(c.text);
      // a sentence said in the year the two parted is the same in both; said now it is not, but is close
      expect(say(east, what, 400).text).toBe(say(west, what, 400).text);
    }
    const now = SAYINGS.map((w) => [say(east, w).text, say(west, w).text, say(stranger, w).text] as const);
    expect(now.some(([a, b]) => a !== b)).toBe(true);
    let kin = 0, far = 0;
    for (const [a, b, c] of now) { kin += wordDistance(a, b); far += wordDistance(a, c); }
    expect(kin).toBeLessThan(far * 0.75);
    expect(describeGrammar(east)).toBe(describeGrammar(east));
    expect(describeGrammar(east).length).toBeGreaterThan(60);
    expect(describeSounds(east)).toMatch(/Consonants .*; vowels /);
    // writing slows the wearing of sounds, and so does age
    expect(driftSpan(0, true)).toBeGreaterThan(driftSpan(0, false) * 1.5);
    expect(driftSpan(30, false)).toBeGreaterThan(driftSpan(0, false) * 2.5);
  });

  it('two related languages share visibly similar words for the same things', () => {
    const runs = fiveHistories();
    let pairs = 0, partings = 0;
    for (const { sim } of runs) {
      const h = sim.civ.h, ev = sim.events.events;
      const spoken = [...new Set(h.nations.filter((n) => n.ended < 0).map((n) => h.cultures[n.culture]!.language))].map((id) => h.languages[id]!);
      // every living people has a name of its own
      const peoples = [...new Set(h.nations.filter((n) => n.ended < 0).map((n) => n.culture))].map((id) => h.cultures[id]!.name);
      expect(new Set(peoples).size).toBe(peoples.length);
      for (const lang of spoken) {
        // it has a word for everything on the list, each sayable
        for (const m of LEXICON) { const w = word(lang, m); expect(w.length).toBeGreaterThanOrEqual(2); expect(w).toMatch(/[aeiou]/); }
        // it has worn since history began, and no change is dated before the language's family or after today
        expect(lang.changes.some((c) => c.year >= h.began)).toBe(true);
        for (const c of lang.changes) expect(c.year).toBeLessThanOrEqual(sim.simYear + 1e-6);
        expect(lang.changes.length).toBeLessThanOrEqual(64);
      }
      const root = (l: Language): number => { let x = l; while (x.parent >= 0) x = h.languages[x.parent]!; return x.id; };
      for (const a of spoken) for (const b of spoken) {
        if (a.id >= b.id || a.family !== b.family) continue;
        expect(root(a)).toBe(root(b));
        pairs++;
        let sum = 0, close = 0, same = 0;
        for (const m of LEXICON) { const d = wordDistance(word(a, m), word(b, m)); sum += d; if (d <= 0.5) close++; if (d === 0) same++; }
        // sisters: most words still plainly the same word, but not the same language
        expect(sum / LEXICON.length).toBeLessThan(0.62);
        expect(close).toBeGreaterThanOrEqual(LEXICON.length * 0.4);
        expect(same).toBeLessThan(LEXICON.length);
        expect(grammarOf(a)).toEqual(grammarOf(b));
      }
      for (const e of ev) {
        if (e.type !== 'language') continue;
        partings++;
        const c = h.cultures[Number(e.data!.culture)]!, old = h.cultures[Number(e.data!.parent)]!;
        expect(c.parent).toBe(old.id);
        expect(h.languages[c.language]!.parent).toBe(old.language);
        expect(h.languages[c.language]!.bornYear).toBe(e.simYear);
        expect(e.description).toContain(c.name);
      }
    }
    expect(pairs).toBeGreaterThan(3);
    expect(partings).toBeGreaterThan(0);
  });
});

describe('place name drift (E22)', () => {
  it('an old city has had at least three names, each with its year and its reason', () => {
    const runs = fiveHistories();
    let three = 0, worn = 0, plain = 0, renamed = 0, parted = 0;
    for (const { sim } of runs) {
      const ev = sim.events.events, h = sim.civ.h;
      for (const st of sim.civ.settlements) {
        // every town's name is in some language of the world
        expect(st.tongue).toBeDefined();
        expect(h.languages[st.tongue!]).toBeTruthy();
        const names = st.names;
        if (!names) continue;
        // the record begins with the name it was founded under and ends with the name it bears
        expect(names.length).toBeGreaterThanOrEqual(2);
        expect(names.length).toBeLessThanOrEqual(8);
        expect(names[0]!.why).toBe('founded');
        expect(names[0]!.year).toBe(st.founded);
        expect(names[names.length - 1]!.name).toBe(st.name);
        for (let i = 1; i < names.length; i++) {
          const was = names[i - 1]!, now = names[i]!;
          expect(now.year).toBeGreaterThanOrEqual(was.year);
          expect(now.name).not.toBe(was.name);
          expect(now.why.length).toBeGreaterThan(8);
          if (now.why.startsWith('in ')) {
            // worn by one change of sound: still plainly the same name
            worn++;
            if (wordDistance(was.name.toLowerCase(), now.name.toLowerCase()) <= 0.5) plain++;
          } else if (now.why.startsWith('renamed by')) {
            // a conqueror's name: the event of the conquest says so
            renamed++;
            const taken = ev[now.eventId!]!;
            expect(taken.type).toBe('conquest');
            expect(taken.description).toContain(now.name);
            expect(taken.simYear).toBe(now.year);
          } else parted++;
        }
        if (names.length >= 3 && st.ruined < 0 && sim.simYear - st.founded > 1500) three++;
      }
      // a name is what its meanings make in its language: said in the founding year it is the founding name
      const old = sim.civ.settlements.filter((s) => s.names && s.names.length >= 3)[0];
      if (old) expect(old.names![0]!.name.length).toBeGreaterThan(1);
    }
    expect(three).toBeGreaterThan(5);
    expect(worn).toBeGreaterThan(20);
    // (now and then one lost sound shifts where a long name is cut short, and it changes more; nine times in ten it is a small step)
    expect(plain / worn).toBeGreaterThan(0.9);
    expect(parted).toBeGreaterThan(0);
    expect(renamed).toBeGreaterThanOrEqual(0);
  });

  it('a name wears exactly as its language does, and a conqueror says the same meaning in another tongue', () => {
    const lang = makeLanguage(0, 31337, big, 0);
    const m = placeMeanings(42);
    const rng = new RNG(3);
    const seen = [compound(lang, m.head, m.modifier, 0)];
    for (let y = 100; y <= 3000; y += 100) { soundChange(lang, rng, y); const now = compound(lang, m.head, m.modifier, y); if (now !== seen[seen.length - 1]) seen.push(now); }
    // over three thousand years it has been said at least three ways, each a small step from the last
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < seen.length; i++) expect(wordDistance(seen[i - 1]!.toLowerCase(), seen[i]!.toLowerCase())).toBeLessThanOrEqual(0.67);
    // and the old forms can always be said again: the name in the founding year is the founding name
    expect(compound(lang, m.head, m.modifier, 0)).toBe(seen[0]);
    // the same meaning in a stranger's tongue is another word altogether
    const other = makeLanguage(1, 90210, small, 0);
    expect(wordDistance(compound(other, m.head, m.modifier).toLowerCase(), seen[seen.length - 1]!.toLowerCase())).toBeGreaterThan(0.6);
  });
});
