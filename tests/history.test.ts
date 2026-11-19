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
