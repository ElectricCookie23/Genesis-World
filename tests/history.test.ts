// The history engine: languages, text, people, nations and their records.
import { describe, expect, it } from 'vitest';
import { RNG } from '../src/sim/rng';
import { hash32, unit } from '../src/sim/history/hash';
import { applyChange, compound, makeLanguage, personName, placeMeanings, soundChange, splitLanguage, word, wordAt, wordDistance, type Voice } from '../src/sim/history/language';
import { count, listing, ordinal, write } from '../src/sim/history/grammar';

const big: Voice = { size: 0.9, water: 0.1, flight: 0, hearing: 0.3, harsh: 0.7 };
const small: Voice = { size: 0.1, water: 0.1, flight: 0.9, hearing: 0.8, harsh: 0.1 };
const MEANINGS = ['water', 'river', 'sea', 'hill', 'stone', 'sun', 'moon', 'fire', 'people', 'town', 'king', 'god', 'old', 'new', 'great', 'holy', 'land', 'star', 'forest', 'wind'];

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
    expect(kin / MEANINGS.length).toBeLessThan(0.45);
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
    const s = worldWithHistory('coral-dune-303');
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
    const firsts = s!.events.events.filter((e) => e.type === 'era' && e.importance >= 2);
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
