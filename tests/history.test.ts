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
