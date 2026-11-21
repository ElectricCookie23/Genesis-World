// Music of the world (system E27). Every people has a music of its own: a scale that is not anyone else's,
// a way of counting time, a pace, and instruments made of what their land gives and what their bodies can
// play. A daughter people keeps its mother's music with a note moved and an instrument changed, so related
// peoples sound related; and the music of one people changes with its ages (more voices, quicker, new
// instruments) without becoming another's.
//
// Nothing is stored. A tradition is a pure function of the culture's line of descent, its people's voice
// and its land, and the age; the notes of a phrase are a pure function of the tradition and the bar.
import { hash32 } from './hash';

/** What an instrument is, as far as playing it on the page needs: how its sound is made. */
export type Timbre = 'flute' | 'reed' | 'drum' | 'log' | 'pluck' | 'bow' | 'bell' | 'gong' | 'glass' | 'horn' | 'hum';

export interface Instrument {
  name: string;
  timbre: Timbre;
  /** Which octave it plays in, relative to the tradition's home note: -1 low, 0, 1 high. */
  register: number;
  /** Does it keep the beat (true) or carry the tune? */
  beat: boolean;
}

/** The music of a people in one of its ages. */
export interface Tradition {
  /** The notes of its scale, in cents above the home note, rising, the first 0. */
  scale: number[];
  /** The home note, in cycles a second. */
  home: number;
  /** Beats a minute, and beats in a bar. */
  tempo: number;
  meter: number;
  /** Which beats of the bar are struck hard (true) by whatever keeps the beat. */
  accents: boolean[];
  /** How the tune moves: 0 by steps, 1 by leaps. */
  leap: number;
  instruments: Instrument[];
  /** The tune it keeps coming back to: steps of the scale (0 the home note), one for each beat of a bar, -1 for a rest. */
  motif: number[];
}

/** What the players are like and what their land gives: each 0..1 but `land`, a list of what is to hand. */
export interface Players {
  /** Body size (big bodies make low music), life in water, flight (breath), hearing, harshness, how fast they live. */
  size: number; water: number; flight: number; hearing: number; harsh: number; quick: number;
  /** Pairs of limbs (more hands, more drums). */
  limbs: number;
  land: readonly string[];
}

const frac = (h: number): number => (h % 100000) / 100000;

/** The ways a scale can be built: a step repeated up the octave (and folded back into it), and how many notes are kept. */
const STACKS: [number, number][] = [[702, 5], [702, 7], [498, 6], [386, 5], [240, 5], [171.4, 7], [150, 8], [316, 6], [267, 5], [133.3, 9], [884, 5], [583, 6]];

function scaleFrom(seed: number): number[] {
  const [step, count] = STACKS[hash32(seed, 0x3a1) % STACKS.length]!;
  const notes = new Set<number>([0]);
  for (let k = 1; notes.size < count && k < 40; k++) notes.add(Math.round(((step * k) % 1200) * 10) / 10);
  return [...notes].sort((a, b) => a - b);
}

/**
 * The line a culture comes down by: the seed of its first ancestor, then one number for each parting since.
 * Everything a tradition has that is inherited is drawn from the first; each parting changes one thing.
 */
export function tradition(line: readonly number[], players: Players, era: number): Tradition {
  const root = line[0] ?? 1;
  let scale = scaleFrom(root);
  let meter = [3, 4, 4, 5, 6, 7, 7, 8, 9, 5][hash32(root, 0x3a2) % 10]!;
  let leap = frac(hash32(root, 0x3a3));
  let pace = 0.8 + 0.5 * frac(hash32(root, 0x3a4));
  let swap = 0;
  // each parting of peoples moves a note, and changes one other thing: the count of time, how the tune leaps, the pace, what is played
  for (let i = 1; i < line.length; i++) {
    const h = hash32(line[i]!, 0x3a5);
    const what = h % 5;
    // (a note always drifts a little, a third of a semitone, so that no daughter sings quite in her mother's scale)
    if (scale.length > 2) { const k = 1 + ((h >>> 4) % (scale.length - 1)); scale = scale.slice(); scale[k] = Math.max(40, Math.min(1160, scale[k]! + (((h >>> 8) % 2) ? 35 : -35) * (what === 0 ? 2 : 1))); scale.sort((a, b) => a - b); }
    if (what === 1) meter = Math.max(3, Math.min(9, meter + (((h >>> 4) % 2) ? 1 : -1)));
    else if (what === 2) leap = Math.max(0, Math.min(1, leap + (frac(h >>> 3) - 0.5) * 0.5));
    else if (what === 3) pace *= 0.85 + 0.3 * frac(h >>> 3);
    else swap += 1 + ((h >>> 4) % 3);
  }
  // ---- the home note and the pace come from the players' bodies: big and slow-lived is low and slow
  const home = 82 * Math.pow(2, 2.2 * (1 - players.size) + 0.3 * players.flight) * (1 + 0.06 * (frac(hash32(root, 0x3a6)) - 0.5));
  const tempo = Math.round((52 + 70 * players.quick + 26 * (1 - players.size)) * pace * (1 + 0.035 * era));
  // ---- which beats are struck: the first always, then a pattern that belongs to the people
  const accents = Array.from({ length: meter }, (_, i) => i === 0 || (hash32(root, 0x3a7, i) % 3 === 0 && i !== meter - 1));
  // ---- instruments: what the land gives, what the body can play, and what the age has learned to make
  const has = (x: string): boolean => players.land.includes(x);
  const tunes: Instrument[] = [], beats: Instrument[] = [];
  if (players.flight > 0.3 || players.size < 0.5) tunes.push({ name: has('beasts') ? 'bone flute' : has('river') ? 'reed flute' : 'clay whistle', timbre: 'flute', register: 1, beat: false });
  if (has('river') || has('coast')) tunes.push({ name: has('coast') ? 'shell horn' : 'reed pipe', timbre: has('coast') ? 'horn' : 'reed', register: 0, beat: false });
  if (has('beasts') && era >= 2) tunes.push({ name: 'gut-strung harp', timbre: 'pluck', register: 0, beat: false });
  if (has('forest') && era >= 3) tunes.push({ name: 'bowed box', timbre: 'bow', register: 0, beat: false });
  if (has('ore') && era >= 3) tunes.push({ name: 'bronze bells', timbre: 'bell', register: 1, beat: false });
  if (has('sand') && era >= 5) tunes.push({ name: 'glass bowls', timbre: 'glass', register: 1, beat: false });
  if (players.size > 0.55 || players.water > 0.5 || !tunes.length) tunes.push({ name: players.water > 0.5 ? 'water-song' : 'deep humming', timbre: 'hum', register: -1, beat: false });
  if (has('beasts')) beats.push({ name: 'hide drum', timbre: 'drum', register: -1, beat: true });
  if (has('forest')) beats.push({ name: 'slit log', timbre: 'log', register: 0, beat: true });
  if (has('coast')) beats.push({ name: 'shell rattle', timbre: 'log', register: 1, beat: true });
  if (has('ore') && era >= 2) beats.push({ name: 'gong', timbre: 'gong', register: -1, beat: true });
  if (!beats.length) beats.push({ name: players.limbs > 0.5 ? 'stamping and clapping' : 'struck stones', timbre: 'log', register: 0, beat: true });
  // (a people uses two or three of what it could: which ones is its own choice, changed now and then at a parting)
  const turn = (list: Instrument[], k: number): Instrument[] => list.map((_, i) => list[(i + k) % list.length]!);
  const pick = hash32(root, 0x3a8) + swap;
  const voices = Math.min(tunes.length, 1 + (era >= 4 ? 1 : 0) + (era >= 7 ? 1 : 0));
  const instruments = [...turn(tunes, pick % tunes.length).slice(0, voices), ...turn(beats, pick % beats.length).slice(0, era >= 5 ? 2 : 1)];
  // ---- the tune it keeps coming back to
  const motif: number[] = [];
  let at = 0;
  for (let i = 0; i < meter; i++) {
    const h = hash32(root, 0x3a9, i);
    if (i > 0 && h % 7 === 0) { motif.push(-1); continue; }
    const far = frac(h >>> 3) < leap ? 2 + ((h >>> 9) % 3) : 1;
    at = i === 0 ? 0 : Math.max(0, Math.min(scale.length + 2, at + (((h >>> 12) % 2) ? far : -far)));
    motif.push(at);
  }
  return { scale, home, tempo, meter, accents, leap, instruments, motif };
}

/** One note to be played: when (in beats from the start of the phrase), for how long, how high (cycles a second), how hard, on what. */
export interface Note { at: number; beats: number; hz: number; hard: number; instrument: number }

/** The pitch of a step of the scale (steps past the top of the scale go into the next octave). */
export function pitch(t: Tradition, step: number, register: number): number {
  const n = t.scale.length, octave = Math.floor(step / n), k = ((step % n) + n) % n;
  return t.home * Math.pow(2, register + octave + t.scale[k]! / 1200);
}

/**
 * One phrase of a tradition: two bars. The beat-keepers strike the people's pattern; the first tune-carrier
 * plays the motif and then answers it (turned over in later ages); others double it a few steps away or hold
 * the home note. `bar` moves the answer about so that no two phrases are quite the same.
 */
export function phrase(t: Tradition, bar: number, era: number): Note[] {
  const out: Note[] = [];
  const tunes = t.instruments.map((x, i) => ({ x, i })).filter((v) => !v.x.beat), beats = t.instruments.map((x, i) => ({ x, i })).filter((v) => v.x.beat);
  for (let b = 0; b < 2; b++) {
    for (let k = 0; k < t.meter; k++) {
      const when = b * t.meter + k;
      beats.forEach(({ x, i }, n) => {
        if (n === 0 ? t.accents[k] : !t.accents[k] && (k + n) % 2 === 0) out.push({ at: when, beats: 0.5, hz: pitch(t, 0, x.register), hard: k === 0 ? 0.9 : 0.6, instrument: i });
        // later ages fill the gaps between beats
        if (era >= 6 && n === 0 && hash32(bar, k, 0x3b1) % 3 === 0) out.push({ at: when + 0.5, beats: 0.25, hz: pitch(t, 0, x.register), hard: 0.35, instrument: i });
      });
      const step = t.motif[k]!;
      if (step < 0 || !tunes.length) continue;
      // the second bar answers the first: moved by a step or two, and from the middle ages on turned upside down
      const answer = b === 0 ? step : era >= 4 ? Math.max(0, t.scale.length - step + (hash32(bar, 0x3b2) % 2)) : step + 1 + (hash32(bar, 0x3b2) % 2);
      const lead = tunes[0]!;
      out.push({ at: when, beats: t.motif[k + 1] === -1 ? 1.9 : 0.92, hz: pitch(t, answer, lead.x.register), hard: k === 0 ? 0.8 : 0.6, instrument: lead.i });
      if (tunes[1] && k % 2 === 0) out.push({ at: when, beats: 1.8, hz: pitch(t, answer + 2, tunes[1].x.register), hard: 0.4, instrument: tunes[1].i });
      if (tunes[2] && k === 0) out.push({ at: when, beats: t.meter * 0.95, hz: pitch(t, 0, tunes[2].x.register), hard: 0.35, instrument: tunes[2].i });
    }
  }
  return out;
}

/** How unlike two traditions are, 0 the same to 1 nothing shared: their scales, their counting of time, their pace, their pitch and what they play. */
export function musicDistance(a: Tradition, b: Tradition): number {
  // scales: each note of one against the nearest of the other, a quarter-tone (50 cents) counting as fully different
  const near = (x: number[], y: number[]): number => x.reduce((s, c) => s + Math.min(1, Math.min(...y.map((d) => Math.min(Math.abs(c - d), 1200 - Math.abs(c - d)))) / 50), 0) / x.length;
  const scale = (near(a.scale, b.scale) + near(b.scale, a.scale)) / 2 * 0.7 + (a.scale.length === b.scale.length ? 0 : 0.3);
  const meter = a.meter === b.meter ? 0 : Math.abs(a.meter - b.meter) === 1 ? 0.6 : 1;
  const tempo = Math.min(1, Math.abs(Math.log2(a.tempo / b.tempo)) * 2);
  const home = Math.min(1, Math.abs(Math.log2(a.home / b.home)));
  const names = new Set(a.instruments.map((i) => i.name)), other = new Set(b.instruments.map((i) => i.name));
  let shared = 0;
  for (const n of names) if (other.has(n)) shared++;
  const played = 1 - shared / Math.max(names.size, other.size);
  return 0.3 * scale + 0.2 * meter + 0.15 * tempo + 0.15 * home + 0.2 * played;
}

/** A tradition in a sentence or two. */
export function describeMusic(t: Tradition): string {
  const count = ['', '', '', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines'][t.meter] ?? `${t.meter}s`;
  const widest = Math.max(...t.scale.map((c, i) => (i ? c - t.scale[i - 1]! : 0)), 1200 - t.scale[t.scale.length - 1]!);
  const kind = t.scale.length <= 5 ? (widest > 330 ? 'a scale of five notes with wide gaps' : 'a scale of five even notes') : t.scale.length === 6 ? 'a scale of six notes' : t.scale.length === 7 ? 'a scale of seven notes' : `a scale of ${t.scale.length} close-set notes`;
  const pace = t.tempo < 70 ? 'slow' : t.tempo < 100 ? 'at a walking pace' : t.tempo < 135 ? 'quick' : 'very fast';
  const pitchWord = t.home < 120 ? 'low' : t.home < 240 ? 'in the middle of the voice' : 'high';
  const names = t.instruments.map((i) => i.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'the voice';
  return `Counted in ${count}, ${pace} and ${pitchWord}, on ${kind}; a tune that moves ${t.leap > 0.6 ? 'in leaps' : t.leap < 0.3 ? 'by steps' : 'by steps and leaps'}. Played on ${list}.`;
}

/**
 * The line a culture comes down by, for `tradition`: its family first, then every culture between the first of
 * its line and itself. `cultures` is the history's list (each with its parent and its language's family).
 */
export function lineOf(cultures: readonly { id: number; parent: number }[], family: number, culture: number): number[] {
  const chain: number[] = [];
  for (let c = cultures[culture]; c && c.parent >= 0 && chain.length < 64; c = cultures[c.parent]) chain.push(c.id + 1);
  return [family, ...chain.reverse()];
}
