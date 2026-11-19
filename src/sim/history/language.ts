// Generated languages.
// A language is a set of sounds, a way of building syllables, and a list of sound changes that have
// happened to it. Words are not stored: the word for a meaning is built from the language family's
// seed and then run through every sound change in order. Daughter languages copy their parent's
// changes and add their own, so related languages keep recognisably related words.
import { RNG } from '../rng';
import { hash32, hashText } from './hash';

/** What the speakers' bodies are like: this shapes which sounds they make. All 0..1. */
export interface Voice {
  /** Body size: big bodies favour low, back, voiced sounds; small ones high, front, sharp sounds. */
  size: number;
  /** Life in water favours liquids, nasals and long vowels. */
  water: number;
  /** Fliers favour hisses, trills and whistled sounds. */
  flight: number;
  /** Hearing and echolocation favour sharp stops and clicks. */
  hearing: number;
  /** Aggression favours harsh throat sounds. */
  harsh: number;
}

export type Where = 'any' | 'initial' | 'final' | 'between' | 'beforeFront';

export interface SoundChange {
  year: number;
  from: string;
  to: string;
  where: Where;
  /** A plain description for the language's history. */
  note: string;
}

export interface Language {
  id: number;
  /** Parent language, or -1 for the first of a family. */
  parent: number;
  /** All languages of a family share this seed: it fixes the ancestral form of every word. */
  family: number;
  name: string;
  bornYear: number;
  consonants: string[];
  vowels: string[];
  /** Chance that a syllable starts with a consonant, ends with one, and starts with two. */
  onset: number;
  coda: number;
  cluster: number;
  /** Shortest and longest root, in syllables. */
  minSyl: number;
  maxSyl: number;
  changes: SoundChange[];
  /** Which pattern place names follow: 0 head last ("river-town"), 1 head first ("town-river"). */
  headFirst: boolean;
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const FRONT = new Set(['e', 'i']);
const isVowel = (c: string | undefined): boolean => !!c && VOWELS.has(c);

interface Sound { s: string; w: (v: Voice) => number }
const CONSONANTS: Sound[] = [
  { s: 'p', w: () => 1 }, { s: 't', w: (v) => 1.2 + v.hearing * 0.6 - v.size * 0.3 }, { s: 'k', w: (v) => 1.2 + v.hearing * 0.6 },
  { s: 'b', w: (v) => 0.5 + v.size }, { s: 'd', w: (v) => 0.6 + v.size * 0.8 }, { s: 'g', w: (v) => 0.4 + v.size * 0.9 + v.harsh * 0.4 },
  { s: 'f', w: (v) => 0.6 + v.flight * 0.5 }, { s: 's', w: (v) => 1 + v.flight * 0.9 - v.size * 0.3 }, { s: 'sh', w: (v) => 0.5 + v.flight * 0.9 },
  { s: 'th', w: (v) => 0.4 + v.flight * 0.3 }, { s: 'h', w: (v) => 0.7 + v.harsh * 0.4 }, { s: 'z', w: (v) => 0.3 + v.flight * 0.5 + v.size * 0.2 },
  { s: 'v', w: (v) => 0.5 + v.water * 0.4 }, { s: 'kh', w: (v) => 0.15 + v.harsh * 1.1 + v.size * 0.3 },
  { s: 'm', w: (v) => 1 + v.water * 0.8 + v.size * 0.3 }, { s: 'n', w: (v) => 1.2 + v.water * 0.5 }, { s: 'ng', w: (v) => 0.2 + v.size * 0.5 + v.water * 0.3 },
  { s: 'l', w: (v) => 1 + v.water * 1.1 }, { s: 'r', w: (v) => 1 + v.flight * 0.5 + v.harsh * 0.5 },
  { s: 'w', w: (v) => 0.4 + v.water * 0.9 }, { s: 'y', w: (v) => 0.5 + (1 - v.size) * 0.4 },
  { s: 'ch', w: (v) => 0.4 + (1 - v.size) * 0.6 + v.flight * 0.3 }, { s: 'ts', w: (v) => 0.2 + (1 - v.size) * 0.5 + v.hearing * 0.6 },
  { s: 'q', w: (v) => 0.1 + v.hearing * 0.8 + v.harsh * 0.3 }, { s: 'x', w: (v) => 0.1 + v.harsh * 0.6 }, { s: 'zh', w: (v) => 0.15 + v.flight * 0.4 + v.water * 0.3 },
  { s: 'tl', w: (v) => 0.1 + v.hearing * 0.5 }, { s: 'hl', w: (v) => 0.1 + v.water * 0.6 },
];
const VOWEL_SOUNDS: Sound[] = [
  { s: 'a', w: (v) => 1.5 + v.size * 0.4 }, { s: 'e', w: (v) => 1 + (1 - v.size) * 0.5 }, { s: 'i', w: (v) => 0.9 + (1 - v.size) * 0.9 },
  { s: 'o', w: (v) => 0.9 + v.size * 0.8 }, { s: 'u', w: (v) => 0.7 + v.size * 0.7 + v.water * 0.4 },
  { s: 'ae', w: () => 0.25 }, { s: 'ai', w: (v) => 0.3 + (1 - v.size) * 0.2 }, { s: 'au', w: (v) => 0.25 + v.size * 0.3 },
  { s: 'ei', w: () => 0.25 }, { s: 'ou', w: (v) => 0.25 + v.water * 0.3 }, { s: 'ia', w: () => 0.25 }, { s: 'ua', w: (v) => 0.2 + v.water * 0.3 },
];

/**
 * Draw `n` different sounds. Which ones get in is partly luck; the order they end up in is how much this
 * voice favours them, and words lean on the front of the list, so a people's commonest sounds are the ones
 * their bodies make most easily.
 */
function draw(pool: Sound[], voice: Voice, n: number, rng: RNG): string[] {
  const left = pool.map((p) => ({ s: p.s, w: Math.pow(Math.max(0.05, p.w(voice)), 2) }));
  const out: { s: string; w: number }[] = [];
  while (out.length < n && left.length) {
    let total = 0;
    for (const l of left) total += l.w;
    let r = rng.next() * total, k = 0;
    while (k < left.length - 1 && r > left[k]!.w) { r -= left[k]!.w; k++; }
    out.push(left[k]!);
    left.splice(k, 1);
  }
  return out.sort((a, b) => b.w * (0.75 + 0.5 * rng.next()) - a.w * (0.75 + 0.5 * rng.next())).map((x) => x.s);
}

/** A new language family for a people with this kind of voice. */
export function makeLanguage(id: number, seed: number, voice: Voice, year: number): Language {
  const rng = new RNG(hash32(seed, id, 0x1a96));
  const consonants = draw(CONSONANTS, voice, 8 + rng.int(6), rng);
  const vowels = draw(VOWEL_SOUNDS, voice, 3 + rng.int(4), rng);
  // plain vowels carry a language; at most two gliding ones, and never as the favourites
  const plain = vowels.filter((x) => x.length === 1), glides = vowels.filter((x) => x.length > 1).slice(0, 2);
  if (plain.length < 2) for (const x of ['a', 'i', 'u']) if (plain.length < 2 && !plain.includes(x)) plain.push(x);
  vowels.length = 0;
  vowels.push(...plain, ...glides);
  const lang: Language = {
    id, parent: -1, family: hash32(seed, id, 0xfa71), name: '', bornYear: year, consonants, vowels,
    onset: 0.7 + rng.next() * 0.28, coda: 0.12 + rng.next() * 0.5 * (1 - voice.water * 0.5), cluster: rng.next() < 0.45 ? 0.08 + rng.next() * 0.2 : 0,
    minSyl: 1, maxSyl: 2 + (rng.next() < 0.4 ? 1 : 0), changes: [], headFirst: rng.next() < 0.5,
  };
  lang.name = capital(word(lang, 'tongue')) ;
  return lang;
}

/** The ancestral form of a meaning in this family, before any sound change. */
function ancestral(lang: Language, meaning: string): string {
  const rng = new RNG(hash32(lang.family, hashText(meaning)));
  // sounds are picked with a strong lean toward the front of each list, so a language has favourite sounds
  const pick = (list: string[]): string => list[Math.min(list.length - 1, Math.floor(Math.pow(rng.next(), 1.6) * list.length))]!;
  const syl = lang.minSyl + rng.int(lang.maxSyl - lang.minSyl + 1);
  let out = '';
  for (let i = 0; i < syl; i++) {
    if (i > 0 || syl === 1 || rng.next() < lang.onset) {
      out += pick(lang.consonants);
      if (rng.next() < lang.cluster) { const second = pick(['r', 'l', 'w', 'y'].filter((c) => lang.consonants.includes(c)).concat('r')); if (!out.endsWith(second)) out += second; }
    }
    out += pick(lang.vowels);
    if (rng.next() < lang.coda * (i === syl - 1 ? 1 : 0.45)) out += pick(lang.consonants.filter((c) => c !== 'w' && c !== 'y' && c !== 'h' && c !== 'tl' && c !== 'hl'));
  }
  return out;
}

/** Apply one sound change to a word. */
export function applyChange(w: string, c: SoundChange): string {
  if (!w.includes(c.from)) return w;
  let out = '';
  for (let i = 0; i < w.length;) {
    if (w.startsWith(c.from, i)) {
      const before = w[i - 1], after = w[i + c.from.length];
      const ok = c.where === 'any'
        || (c.where === 'initial' && i === 0)
        || (c.where === 'final' && i + c.from.length === w.length)
        || (c.where === 'between' && isVowel(before) && isVowel(after))
        || (c.where === 'beforeFront' && !!after && FRONT.has(after));
      if (ok) { out += c.to; i += c.from.length; continue; }
    }
    out += w[i];
    i++;
  }
  // a change must never eat a whole word or leave it without a vowel
  if (out.length < 2 || ![...out].some((ch) => VOWELS.has(ch))) return w;
  return out;
}

/** The word for a meaning in this language, as it is spoken now. */
export function word(lang: Language, meaning: string): string {
  return wordAt(lang, meaning, Infinity);
}

/** The word as it was spoken in a given year (only changes up to then applied). */
export function wordAt(lang: Language, meaning: string, year: number): string {
  let w = ancestral(lang, meaning);
  for (const c of lang.changes) { if (c.year > year) break; w = applyChange(w, c); }
  return w;
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What each sound tends to turn into over the generations. An empty string means the sound is lost. */
const DRIFT: Record<string, string[]> = {
  p: ['f', 'b', 'h'], t: ['s', 'd', 'ts', 'th'], k: ['g', 'kh', 'ch', 'h'], b: ['v', 'p', 'm'], d: ['t', 'z', 'r', 'th'], g: ['k', 'y', 'kh'],
  f: ['h', 'v', 'p'], s: ['sh', 'z', 'h'], sh: ['s', 'ch', 'zh'], th: ['t', 's', 'f', 'd'], h: ['', 'kh'], z: ['s', 'r', 'zh'], v: ['w', 'f', 'b'],
  kh: ['h', 'k', 'x'], m: ['n', 'b'], n: ['m', 'l', 'ng'], ng: ['n', 'g'], l: ['r', 'w', 'y'], r: ['l', 'z', ''], w: ['v', 'u', ''], y: ['', 'zh'],
  ch: ['sh', 'ts', 'k'], ts: ['s', 'ch', 't'], q: ['k', ''], x: ['kh', 'sh', 's'], zh: ['z', 'y', 'sh'], tl: ['l', 't'], hl: ['l', 'sh'],
  a: ['e', 'o', ''], e: ['i', 'a', ''], i: ['e', 'ai'], o: ['u', 'a'], u: ['o', 'i', ''],
  ae: ['e', 'a'], ai: ['e', 'a'], au: ['o', 'a'], ei: ['i', 'e'], ou: ['u', 'o'], ia: ['a', 'e'], ua: ['o', 'a'],
};
const WHERE_TEXT: Record<Where, string> = { any: 'everywhere', initial: 'at the start of a word', final: 'at the end of a word', between: 'between vowels', beforeFront: 'before e and i' };
const SOUNDS = Object.keys(DRIFT);

/** The words a change is tested against: it only counts if it alters something people actually say. */
const PROBE = ['water', 'river', 'sea', 'hill', 'stone', 'sun', 'moon', 'fire', 'people', 'town', 'king', 'god', 'old', 'new', 'great', 'holy', 'tongue', 'land', 'star', 'forest'];

/**
 * One sound change happens to the language: some sound, in some position, turns into a neighbouring sound or
 * is lost. Which one is luck, so sister languages drift apart. Returns it, or null if nothing suitable was found.
 */
export function soundChange(lang: Language, rng: RNG, year: number): SoundChange | null {
  const words = PROBE.map((m) => word(lang, m));
  for (let attempt = 0; attempt < 60; attempt++) {
    const from = rng.pick(SOUNDS);
    const to = rng.pick(DRIFT[from]!);
    const vowel = isVowel(from[0]);
    // whole vowels are only lost at the end of a word; consonants soften between vowels more often than anywhere else
    const where: Where = to === '' && vowel ? 'final' : rng.pick(vowel ? ['any', 'final', 'initial', 'any'] as Where[] : ['any', 'between', 'between', 'initial', 'final', 'beforeFront'] as Where[]);
    const c: SoundChange = { year, from, to, where, note: to === '' ? `${from} was lost ${WHERE_TEXT[where]}` : `${from} became ${to} ${WHERE_TEXT[where]}` };
    let touched = 0;
    for (const w of words) if (applyChange(w, c) !== w) touched++;
    if (touched >= 2 && touched <= 12) { lang.changes.push(c); return c; }
  }
  return null;
}

/** A daughter language splits off: it starts identical and drifts apart from here on. */
export function splitLanguage(parent: Language, id: number, year: number): Language {
  const d: Language = { ...parent, id, parent: parent.id, bornYear: year, consonants: parent.consonants.slice(), vowels: parent.vowels.slice(), changes: parent.changes.map((c) => ({ ...c })) };
  d.name = capital(word(d, 'tongue'));
  return d;
}

/** The first `n` syllables of a word: names wear down to their beginnings. */
function clip(w: string, n: number): string {
  let groups = 0, i = 0;
  while (i < w.length) {
    if (isVowel(w[i])) { groups++; while (i < w.length && isVowel(w[i])) i++; if (groups === n) { if (i < w.length && !isVowel(w[i]) && (i + 1 >= w.length || !isVowel(w[i + 1]))) i++; return w.slice(0, i); } } else i++;
  }
  return w;
}

/** A name made of one or two meanings, in the language's own word order. */
export function compound(lang: Language, head: string, modifier?: string, year = Infinity): string {
  const h = clip(wordAt(lang, head, year), 2);
  if (!modifier) return capital(h);
  const m = clip(wordAt(lang, modifier, year), 2);
  const [a, b] = lang.headFirst ? [h, m] : [m, h];
  // a doubled sound at the join is said once
  const joined = a.endsWith(b[0]!) ? a + b.slice(1) : isVowel(a[a.length - 1]) && isVowel(b[0]) ? a + lang.consonants[0] + b : a + b;
  return capital(joined);
}

const PLACE_HEADS = ['town', 'ford', 'hill', 'haven', 'field', 'rock', 'well', 'hold', 'bridge', 'grove', 'mouth', 'cross'];
const PLACE_MODS = ['old', 'new', 'red', 'white', 'black', 'high', 'low', 'great', 'holy', 'cold', 'warm', 'long', 'stone', 'river', 'sea', 'star', 'sun', 'moon', 'wind', 'salt', 'king', 'herd', 'fire', 'green'];

/** The meanings behind a place name, chosen from an identifying number: keep these, and the name can be re-spoken in any year. */
export function placeMeanings(key: number): { head: string; modifier?: string } {
  const rng = new RNG(hash32(key, 0x91ace));
  const head = rng.pick(PLACE_HEADS);
  return rng.next() < 0.78 ? { head, modifier: rng.pick(PLACE_MODS) } : { head: rng.pick(PLACE_MODS) };
}

/** A personal name: a short invented word of the language, stable for its key. */
export function personName(lang: Language, key: number, year = Infinity): string {
  const h = hash32(key, 0x9e450);
  const a = clip(wordAt(lang, `name-${h % 97}`, year), 2), b = clip(wordAt(lang, `name-end-${(h >>> 8) % 61}`, year), 1);
  // two short parts, the way most given names are built; a long first part stands alone
  if (a.length >= 5) return capital(a);
  return capital(a.endsWith(b[0]!) ? a + b.slice(1) : a + b);
}

/** How far apart two words are: edit distance over the longer length (0 the same, 1 nothing shared). */
export function wordDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m || !n) return 1;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n]! / Math.max(m, n);
}
