// Syntax and lexicon of the generated languages (system E21).
// A language's sounds and words live in language.ts. This file adds what is needed to say a
// whole sentence: the order of words, where a describing word goes, how "many" and "before now"
// are marked. Nothing is stored. The grammar of a family comes from its seed, so sister languages
// share it, and its endings are themselves words of the language, worn down by the same sound
// changes as everything else: sisters have endings that are recognisably the same ending.
import { hash32 } from './hash';
import { capital, wordAt, type Language } from './language';

/** The meanings every language is asked for: the list shown side by side in the language panel. */
export const LEXICON = [
  'water', 'river', 'sea', 'hill', 'stone', 'sun', 'moon', 'star', 'fire', 'wind', 'forest', 'land',
  'people', 'town', 'king', 'herd', 'child', 'mother', 'hand', 'eye', 'tongue',
  'one', 'two', 'three', 'many', 'old', 'new', 'great', 'bright', 'red',
  'see', 'give', 'go', 'eat', 'cross', 'this',
] as const;

export type WordOrder = 'SOV' | 'SVO' | 'VSO';

export interface Grammar {
  /** The order of who does it, what is done, and to what. */
  order: WordOrder;
  /** Does a describing word follow the thing it describes? */
  adjAfter: boolean;
  /** How "more than one" is marked: an ending, a beginning, or saying the word twice. */
  plural: 'suffix' | 'prefix' | 'double';
  /** How "before now" is marked: an ending on the doing-word, or a small word before or after it. */
  past: 'suffix' | 'before' | 'after';
  /** Is there a word or ending for "the"? */
  article: 'none' | 'suffix' | 'word';
}

/** The grammar of a language: fixed by its family, so that sisters share it. */
export function grammarOf(lang: Language): Grammar {
  const h = hash32(lang.family, 0x67a3);
  return {
    order: (['SOV', 'SOV', 'SVO', 'SVO', 'VSO'] as const)[h % 5]!,
    adjAfter: lang.headFirst,
    plural: (['suffix', 'suffix', 'prefix', 'double'] as const)[(h >>> 4) % 4]!,
    past: (['suffix', 'suffix', 'before', 'after'] as const)[(h >>> 8) % 4]!,
    article: (['none', 'none', 'suffix', 'word'] as const)[(h >>> 12) % 4]!,
  };
}

const isVowel = (c: string | undefined): boolean => !!c && 'aeiou'.includes(c);

/** The first syllable of a word: what an ending wears down to. */
function stub(w: string): string {
  let i = 0;
  while (i < w.length && !isVowel(w[i])) i++;
  while (i < w.length && isVowel(w[i])) i++;
  return w.slice(0, Math.max(2, i)).slice(0, 3);
}

/** A sentence to say: who (with a describing word, maybe many), does what (maybe before now), to what. */
export interface Saying {
  s: string; sAdj?: string; sMany?: boolean;
  v: string; past?: boolean;
  o: string; oAdj?: string; oMany?: boolean;
  /** The same in English. */
  english: string;
}

/** Four plain things to say, the same in every language, so that languages can be laid side by side. */
export const SAYINGS: Saying[] = [
  { s: 'people', v: 'see', o: 'star', english: 'The people see the star.' },
  { s: 'king', sAdj: 'old', v: 'give', past: true, o: 'herd', english: 'The old king gave the herd.' },
  { s: 'child', sMany: true, v: 'cross', past: true, o: 'river', oAdj: 'great', english: 'The children crossed the great river.' },
  { s: 'fire', v: 'eat', o: 'forest', english: 'Fire eats the forest.' },
];

/** Say it in a language as it was spoken in `year`: the words, and under each what it means. */
export function say(lang: Language, what: Saying, year = Infinity): { text: string; gloss: string } {
  const g = grammarOf(lang);
  const w = (m: string): string => wordAt(lang, m, year);
  const many = stub(w('many')), before = stub(w('old')), the = stub(w('this'));
  const noun = (m: string, adj: string | undefined, plural: boolean | undefined): [string, string] => {
    let word = w(m), gloss = m;
    if (plural) {
      if (g.plural === 'suffix') { word = `${word}${many}`; gloss = `${m}-MANY`; }
      else if (g.plural === 'prefix') { word = `${many}${word}`; gloss = `MANY-${m}`; }
      else { word = `${word}-${word}`; gloss = `${m}-${m}`; }
    }
    if (g.article === 'suffix') { word = `${word}${isVowel(word[word.length - 1]) && isVowel(the[0]) ? the.slice(1) || the : the}`; gloss = `${gloss}-THE`; }
    let words = [word], glosses = [gloss];
    if (adj) { if (g.adjAfter) { words.push(w(adj)); glosses.push(adj); } else { words.unshift(w(adj)); glosses.unshift(adj); } }
    if (g.article === 'word') { words.unshift(the); glosses.unshift('THE'); }
    return [words.join(' '), glosses.join(' ')];
  };
  const [s, sg] = noun(what.s, what.sAdj, what.sMany), [o, og] = noun(what.o, what.oAdj, what.oMany);
  let v = w(what.v), vg = what.v;
  if (what.past) {
    if (g.past === 'suffix') { v = `${v}${before}`; vg = `${vg}-BEFORE`; }
    else if (g.past === 'before') { v = `${before} ${v}`; vg = `BEFORE ${vg}`; }
    else { v = `${v} ${before}`; vg = `${vg} BEFORE`; }
  }
  const parts: [string, string][] = g.order === 'SOV' ? [[s, sg], [o, og], [v, vg]] : g.order === 'SVO' ? [[s, sg], [v, vg], [o, og]] : [[v, vg], [s, sg], [o, og]];
  return { text: `${capital(parts.map((p) => p[0]).join(' '))}.`, gloss: parts.map((p) => p[1]).join('  ') };
}

/** A language's grammar in a sentence or two of plain words. */
export function describeGrammar(lang: Language): string {
  const g = grammarOf(lang);
  const order = g.order === 'SOV' ? 'The one who acts comes first and the doing-word last' : g.order === 'SVO' ? 'The one who acts comes first, then the doing-word, then what it is done to' : 'The doing-word comes first';
  const adj = g.adjAfter ? 'a describing word follows what it describes' : 'a describing word comes before what it describes';
  const plural = g.plural === 'suffix' ? `more than one is marked with the ending -${stub(wordAt(lang, 'many', Infinity))}` : g.plural === 'prefix' ? `more than one is marked by putting ${stub(wordAt(lang, 'many', Infinity))}- in front` : 'more than one is said by saying the word twice';
  const past = g.past === 'suffix' ? `what is over takes the ending -${stub(wordAt(lang, 'old', Infinity))}` : `what is over is marked with the small word ${stub(wordAt(lang, 'old', Infinity))} ${g.past === 'before' ? 'before' : 'after'} the doing-word`;
  const article = g.article === 'none' ? 'There is no word for "the".' : g.article === 'suffix' ? `"The" is an ending, -${stub(wordAt(lang, 'this', Infinity))}.` : `"The" is ${stub(wordAt(lang, 'this', Infinity))}.`;
  return `${order}; ${adj}; ${plural}; ${past}. ${article}`;
}

/** Its sounds in a line: which it uses, and how its syllables are built. */
export function describeSounds(lang: Language): string {
  const shape = lang.coda > 0.4 ? 'Syllables often end in a consonant' : lang.coda < 0.22 ? 'Almost every syllable ends in a vowel' : 'Some syllables end in a consonant';
  return `Consonants ${lang.consonants.join(' ')}; vowels ${lang.vowels.join(' ')}. ${shape}${lang.cluster > 0 ? ', and two consonants may begin one' : ''}.`;
}

/** How often a language changes a sound, in years: writing slows it, and an old language has less left to wear away. */
export function driftSpan(changes: number, written: boolean): number {
  return 240 * (written ? 1.7 : 1) * (1 + changes / 14);
}
