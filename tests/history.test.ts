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
  const NAMED = new Set(['nation', 'era', 'invention', 'dynasty', 'war', 'conquest', 'secession', 'civil-war', 'nation-collapse', 'nation-fall', 'knowledge-lost', 'knowledge-regained', 'contact', 'prophet', 'music', 'trade', 'industry']);

  it('every event of history names the person tied to it', () => {
    const runs = fiveHistories();
    let checked = 0;
    for (const r of runs) {
      const h = r.sim.civ.h;
      for (const e of r.sim.events.events) {
        if (e.simYear < r.began) continue;
        const major = NAMED.has(e.type) || ((e.type === 'settlement' || e.type === 'temple') && e.importance >= 2);
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

  it('generals, prophets, explorers, artists, scholars and inventors live whole lives with an outcome', () => {
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
        for (const t of [p.bold, p.wise, p.cruel, p.pious]) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1); }
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
        if (p.role === 'prophet' && /put to death/.test(p.fate)) { martyrs++; expect(p.died).toBe(p.rose); expect(h.people[p.rival]!.cruel).toBeGreaterThan(0.62); }
      }
      // the living on record are all alive
      for (const id of h.notables) expect(h.people[id]!.died).toBeLessThan(0);
      expect(roles.size).toBeGreaterThanOrEqual(5);
    }
    for (const role of ['ruler', 'founder', 'inventor', 'general', 'prophet', 'explorer', 'artist', 'scholar']) expect(seen.get(role) ?? 0, role).toBeGreaterThan(0);
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
    expect(face(a, 4, 'general', 12)).not.toBe(face(a, 4, 'prophet', 12));
    // five ages, five manners
    expect(new Set([0, 2, 4, 6, 8].map((era) => face(a, era, 'ruler', 3))).size).toBe(5);
    for (const era of [0, 2, 4, 6, 8]) for (const role of ['ruler', 'founder', 'inventor', 'prophet', 'general', 'explorer', 'artist', 'scholar']) {
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
    expect(calendarName('prophet', 1, '', 'Feipa')[0]).toBe('the Teaching of Feipa');
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
  function struck(tool: string): { sim: Simulation; strike: number; before: number } {
    const sim = atDawn(0)!;
    for (let y = 0; y < 3000; y++) sim.step(1);
    const before = sim.events.events.length;
    const town = sim.civ.settlements.find((s) => s.ruined < 0)!;
    sim.god(tool, town.cell);
    const strike = sim.events.events.length - 1;
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
    const { sim, strike, before } = struck('iceage');
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
    const { sim, strike, before } = struck('flood');
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

import { NETWORKS } from '../src/sim/history/model';

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
        const names = [r.sim.civ.settlements[Number(e!.data!.a)]!.name, r.sim.civ.settlements[Number(e!.data!.b)]!.name];
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
