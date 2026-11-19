// The tech web (expansion system E1).
//
// Knowledge is a web of about 110 needs ("slots"): a way to store grain, a hard cutting edge, a
// way to move loads, a source of power. Most needs can be met in one way; some in two or three,
// depending on what the land offers. A people with no ore never smelts metal: it meets the same
// needs with glass, bone and fired clay, and goes on. About 150 inventions in all.
//
// Each nation discovers at its own pace and in its own order: what it can discover is limited by
// what it already knows and by its land, and what it does discover next is a matter of its
// culture's leanings and of luck.
import type { RNG } from '../rng';

export type Field = 'food' | 'craft' | 'build' | 'war' | 'trade' | 'mind' | 'power' | 'life' | 'sea' | 'sky';

/** What a nation's land offers. */
export type Land = 'ore' | 'coast' | 'river' | 'forest' | 'beasts' | 'sand' | 'coal' | 'cold';

export interface Invention {
  id: string;
  /** Plain name. Each culture also has its own word for it (two meanings joined in its language). */
  name: string;
  /** What the land must offer, or '' for anywhere. */
  land: Land | '';
  /** Meanings the culture's own name is built from. */
  words: [string, string];
  /** Research needed, relative to an ordinary invention. Makeshift routes cost more. */
  cost: number;
}

export interface Slot {
  id: string;
  /** Where on the scale of knowledge (0.22 first fields .. 1.2) this need belongs. */
  level: number;
  field: Field;
  /** Slots that must be filled first. */
  needs: string[];
  /** The ways of meeting the need, best first. */
  ways: Invention[];
  /** A turning point: its first discovery anywhere is told in the chronicle. */
  key?: boolean;
}

type Way = [id: string, name: string, land: Land | '', words: [string, string], cost?: number];
const slot = (id: string, level: number, field: Field, needs: string[], ways: Way[], key = false): Slot => ({
  id, level, field, needs, key, ways: ways.map(([wid, name, land, words, cost]) => ({ id: wid, name, land, words, cost: cost ?? 1 })),
});

/* eslint-disable prettier/prettier */
export const WEB: Slot[] = [
  // ---- Age of Fields
  slot('herd', 0.225, 'food', [], [['herding', 'herding', 'beasts', ['herd', 'hold']], ['fishweir', 'fish weirs', 'coast', ['sea', 'hold']], ['gardens', 'root gardens', '', ['green', 'field'], 1.2]]),
  slot('pots', 0.23, 'craft', [], [['pottery', 'pottery', '', ['fire', 'well']]], true),
  slot('cloth', 0.235, 'craft', [], [['weaving', 'weaving', '', ['long', 'green']], ['hidework', 'hide work', 'beasts', ['herd', 'warm']]]),
  slot('store', 0.24, 'food', ['pots'], [['granary', 'granaries', '', ['field', 'hold']]]),
  slot('sky1', 0.245, 'mind', [], [['daycount', 'the count of days', '', ['sun', 'moon']]]),
  slot('boat', 0.25, 'sea', [], [['rafts', 'rafts and dugouts', 'coast', ['sea', 'grove']], ['riverboats', 'reed boats', 'river', ['river', 'grove']]]),
  slot('walls1', 0.255, 'build', ['pots'], [['mudbrick', 'mud brick', 'river', ['river', 'rock']], ['timberhall', 'timber halls', 'forest', ['grove', 'hold']], ['drystone', 'dry stone', '', ['stone', 'hold'], 1.2]]),
  slot('brew', 0.26, 'food', ['store'], [['brewing', 'brewing', '', ['warm', 'well']]]),
  slot('tally', 0.265, 'mind', ['store'], [['tokens', 'tally tokens', '', ['stone', 'king']]]),
  slot('salt', 0.27, 'food', ['store'], [['saltpans', 'salt pans', 'coast', ['salt', 'field']], ['smoking', 'smoking and drying', '', ['fire', 'herd'], 1.1]]),
  slot('heal1', 0.275, 'life', [], [['herblore', 'herb lore', '', ['green', 'holy']]]),
  slot('rope', 0.28, 'craft', ['cloth'], [['cordage', 'rope and nets', '', ['long', 'hold']]]),
  // ---- Age of Kilns
  slot('kiln', 0.3, 'craft', ['pots'], [['kilns', 'the kiln', '', ['fire', 'rock']]], true),
  slot('edge', 0.31, 'craft', ['kiln'], [['copper', 'copper smelting', 'ore', ['red', 'stone']], ['glassblade', 'glass blades', 'sand', ['white', 'fire']], ['hardclay', 'fired ceramic tools', '', ['fire', 'stone'], 1.5]], true),
  slot('plough', 0.32, 'food', ['herd'], [['oxplough', 'the drawn plough', 'beasts', ['herd', 'field']], ['terraces', 'dug terraces', '', ['high', 'field'], 1.3]]),
  slot('water1', 0.33, 'food', ['store'], [['canals', 'irrigation canals', 'river', ['river', 'field']], ['cisterns', 'cisterns', '', ['stone', 'well'], 1.2]]),
  slot('haul', 0.34, 'trade', ['edge'], [['wheel', 'the wheel', 'beasts', ['long', 'cross']], ['sledges', 'runners and carrying frames', '', ['long', 'herd'], 1.4]], true),
  slot('write', 0.35, 'mind', ['tally'], [['writing', 'writing', '', ['stone', 'star']]], true),
  slot('sail', 0.36, 'sea', ['boat', 'cloth'], [['sails', 'the sail', '', ['wind', 'sea']]]),
  slot('alloy', 0.37, 'craft', ['edge'], [['bronze', 'bronze', 'ore', ['red', 'king']], ['glazed', 'glazed stoneware', '', ['white', 'rock'], 1.4]]),
  slot('monument', 0.38, 'build', ['walls1', 'tally'], [['monuments', 'great stoneworks', '', ['great', 'stone']]]),
  slot('law', 0.39, 'mind', ['write'], [['laws', 'written law', '', ['king', 'stone']]]),
  slot('road1', 0.4, 'trade', ['haul'], [['roads', 'made roads', '', ['long', 'rock']]]),
  slot('arms1', 0.41, 'war', ['edge'], [['spearwall', 'drilled spearmen', '', ['king', 'cross']]]),
  slot('measure', 0.42, 'mind', ['write'], [['weights', 'weights and measures', '', ['stone', 'cross']]]),
  slot('sky2', 0.43, 'mind', ['sky1', 'write'], [['starcharts', 'star charts', '', ['star', 'well']]]),
  slot('dye', 0.44, 'craft', ['cloth', 'kiln'], [['dyes', 'fast dyes', '', ['red', 'green']]]),
  // ---- Age of Walls
  slot('fort', 0.45, 'build', ['monument'], [['citywalls', 'city walls', '', ['great', 'hold']]], true),
  slot('hard', 0.46, 'craft', ['alloy'], [['iron', 'iron working', 'ore', ['black', 'stone']], ['bonecomp', 'bone and horn composites', 'beasts', ['herd', 'stone'], 1.4], ['sinter', 'sintered ceramics', '', ['white', 'stone'], 1.6]], true),
  slot('coin', 0.47, 'trade', ['measure', 'alloy'], [['coinage', 'coinage', 'ore', ['red', 'cross']], ['seals', 'sealed clay tokens', '', ['king', 'cross'], 1.1]]),
  slot('arch', 0.48, 'build', ['fort'], [['arches', 'the arch', '', ['high', 'rock']]]),
  slot('aqueduct', 0.49, 'build', ['arch', 'water1'], [['aqueducts', 'aqueducts', '', ['high', 'river']]]),
  slot('mill1', 0.5, 'power', ['haul'], [['watermill', 'the water mill', 'river', ['river', 'cross']], ['beastmill', 'the beast mill', 'beasts', ['herd', 'cross']], ['treadmill', 'tread wheels', '', ['long', 'cross'], 1.3]]),
  slot('siege', 0.51, 'war', ['arms1', 'fort'], [['siegecraft', 'siege engines', '', ['great', 'king']]]),
  slot('math', 0.52, 'mind', ['measure', 'sky2'], [['geometry', 'geometry', '', ['star', 'cross']]]),
  slot('heal2', 0.53, 'life', ['heal1', 'write'], [['physic', 'written medicine', '', ['holy', 'well']]]),
  slot('glass', 0.54, 'craft', ['kiln'], [['glasswork', 'blown glass', 'sand', ['white', 'wind']], ['mica', 'split horn and mica panes', '', ['white', 'herd'], 1.3]]),
  slot('ship1', 0.55, 'sea', ['sail', 'rope'], [['keel', 'keeled ships', 'forest', ['sea', 'king']], ['skinship', 'framed hide ships', 'beasts', ['sea', 'herd'], 1.2]]),
  slot('paper', 0.56, 'mind', ['write', 'cloth'], [['paper', 'paper', '', ['white', 'green']]]),
  slot('steelish', 0.57, 'craft', ['hard'], [['steel', 'steel', 'ore', ['black', 'king']], ['glassfibre', 'drawn glass fibre', 'sand', ['white', 'long'], 1.5], ['ceramet', 'layered ceramic plate', '', ['white', 'king'], 1.7]]),
  slot('school', 0.58, 'mind', ['law', 'paper'], [['academies', 'academies', '', ['old', 'star']]]),
  slot('cav', 0.59, 'war', ['arms1', 'herd'], [['riders', 'mounted soldiers', 'beasts', ['herd', 'king']], ['runners', 'relay runners and light foot', '', ['long', 'king'], 1.2]]),
  // ---- Age of Sails
  slot('compass', 0.6, 'sea', ['ship1', 'sky2'], [['lodestone', 'the compass', 'ore', ['star', 'stone']], ['sunstone', 'the sun stone and star tables', '', ['sun', 'stone'], 1.3]], true),
  slot('ship2', 0.61, 'sea', ['ship1', 'compass'], [['oceanship', 'ocean-going ships', '', ['great', 'sea']]], true),
  slot('bank', 0.62, 'trade', ['coin', 'paper'], [['banking', 'banking', '', ['red', 'hold']]]),
  slot('powder', 0.63, 'war', ['steelish', 'salt'], [['gunpowder', 'fire powder', '', ['fire', 'salt']]]),
  slot('clock', 0.64, 'craft', ['math', 'steelish'], [['clockwork', 'clockwork', '', ['sun', 'cross']]]),
  slot('lens', 0.65, 'sky', ['glass', 'math'], [['lenses', 'lenses', '', ['white', 'star']]], true),
  slot('map', 0.66, 'sea', ['compass', 'math'], [['charts', 'sea charts', '', ['sea', 'star']]]),
  slot('crop2', 0.67, 'food', ['plough', 'water1'], [['rotation', 'crop rotation', '', ['new', 'field']]]),
  slot('mill2', 0.68, 'power', ['mill1', 'ship1'], [['windmill', 'the wind mill', '', ['wind', 'cross']]]),
  slot('guns', 0.69, 'war', ['powder'], [['cannon', 'cannon', 'ore', ['fire', 'king']], ['rockets', 'war rockets', '', ['fire', 'star'], 1.3]]),
  slot('colony', 0.7, 'trade', ['ship2', 'bank'], [['companies', 'trading companies', '', ['sea', 'cross']]]),
  slot('anatomy', 0.71, 'life', ['heal2', 'lens'], [['anatomy', 'anatomy', '', ['holy', 'stone']]]),
  // ---- Age of Presses
  slot('press', 0.72, 'mind', ['paper', 'steelish'], [['printing', 'the printing press', '', ['new', 'stone']]], true),
  slot('method', 0.73, 'mind', ['school', 'lens'], [['method', 'the method of trial', '', ['new', 'star']]], true),
  slot('telescope', 0.74, 'sky', ['lens', 'sky2'], [['farseer', 'the far-seeing glass', '', ['star', 'white']]]),
  slot('calculus', 0.75, 'mind', ['math', 'method'], [['fluxions', 'the mathematics of change', '', ['long', 'star']]]),
  slot('news', 0.76, 'mind', ['press', 'road1'], [['gazettes', 'printed news', '', ['new', 'wind']]]),
  slot('chem', 0.77, 'craft', ['method', 'glass'], [['chemistry', 'chemistry', '', ['fire', 'white']]]),
  slot('canal', 0.78, 'trade', ['aqueduct', 'bank'], [['canals2', 'barge canals', 'river', ['long', 'river']], ['tollroads', 'paved toll roads', '', ['long', 'king'], 1.2]]),
  slot('vaccine', 0.79, 'life', ['anatomy', 'method'], [['inoculation', 'inoculation', '', ['holy', 'new']]]),
  slot('loom', 0.8, 'craft', ['clock', 'mill2'], [['powerloom', 'the powered loom', '', ['long', 'cross']]]),
  slot('census', 0.81, 'mind', ['press', 'law'], [['census', 'the census', '', ['king', 'well']]]),
  slot('pump', 0.82, 'power', ['clock', 'chem'], [['airpump', 'the air pump', '', ['wind', 'well']]]),
  slot('rifle', 0.83, 'war', ['guns', 'clock'], [['rifling', 'rifled guns', '', ['long', 'fire']]]),
  slot('farm3', 0.84, 'food', ['crop2', 'chem'], [['breeding', 'planned breeding', '', ['new', 'herd']]]),
  // ---- Age of Engines
  slot('engine', 0.85, 'power', ['pump', 'steelish'], [['steam', 'the steam engine', 'coal', ['fire', 'great']], ['turbine', 'the water turbine', 'river', ['river', 'great'], 1.3], ['sunboiler', 'mirror-fired boilers', '', ['sun', 'great'], 1.7]], true),
  slot('factory', 0.86, 'craft', ['engine', 'loom'], [['mills', 'the factory', '', ['great', 'cross']]], true),
  slot('rail', 0.87, 'trade', ['engine', 'road1'], [['railways', 'railways', 'ore', ['black', 'long']], ['cableway', 'cable ways and plank roads', '', ['long', 'high'], 1.4]], true),
  slot('steamship', 0.88, 'sea', ['engine', 'ship2'], [['steamships', 'engine ships', '', ['fire', 'sea']]]),
  slot('gaslight', 0.89, 'power', ['chem', 'engine'], [['gaslamps', 'gas light', 'coal', ['fire', 'wind']], ['oillamps', 'pressure oil lamps', '', ['fire', 'white'], 1.1]]),
  slot('telegraph', 0.9, 'mind', ['chem', 'clock'], [['wire', 'the telegraph', 'ore', ['long', 'star']], ['heliograph', 'mirror and shutter towers', '', ['sun', 'long'], 1.2]], true),
  slot('germ', 0.91, 'life', ['vaccine', 'lens'], [['germs', 'germ theory', '', ['white', 'holy']]], true),
  slot('fertil', 0.92, 'food', ['chem', 'farm3'], [['fertilizer', 'made fertilizer', '', ['green', 'salt']]]),
  slot('bigsteel', 0.93, 'build', ['factory', 'steelish'], [['girders', 'frame construction', '', ['high', 'king']]]),
  slot('sewer', 0.94, 'build', ['germ', 'aqueduct'], [['sewers', 'sewers and clean water', '', ['well', 'holy']]]),
  slot('photo', 0.95, 'mind', ['chem', 'lens'], [['photo', 'light pictures', '', ['sun', 'white']]]),
  slot('dynamo', 0.96, 'power', ['engine', 'telegraph'], [['dynamo', 'the dynamo', '', ['star', 'great']]], true),
  slot('oil', 0.97, 'power', ['chem', 'pump'], [['rockoil', 'rock oil', 'coal', ['black', 'well']], ['plantoil', 'pressed and brewed fuels', '', ['green', 'fire'], 1.3]]),
  slot('ironclad', 0.98, 'war', ['steamship', 'rifle'], [['ironclads', 'armoured ships', '', ['black', 'sea']]]),
  slot('motor', 0.99, 'trade', ['oil', 'factory'], [['motor', 'the motor carriage', '', ['fire', 'long']]]),
  // ---- Age of Signals
  slot('grid', 1.0, 'power', ['dynamo', 'bigsteel'], [['grid', 'the power grid', '', ['star', 'long']]], true),
  slot('radio', 1.01, 'mind', ['dynamo', 'telegraph'], [['radio', 'radio', '', ['wind', 'star']]], true),
  slot('flight', 1.02, 'sky', ['motor', 'calculus'], [['flight', 'powered flight', '', ['wind', 'high']]], true),
  slot('antibio', 1.03, 'life', ['germ', 'chem'], [['antibiotic', 'antibiotics', '', ['green', 'holy']]]),
  slot('assembly', 1.04, 'craft', ['factory', 'motor'], [['assembly', 'the moving line', '', ['long', 'great']]]),
  slot('plastics', 1.05, 'craft', ['oil', 'chem'], [['plastics', 'made materials', '', ['new', 'white']]]),
  slot('tank', 1.055, 'war', ['motor', 'ironclad'], [['armour', 'armoured engines', '', ['black', 'king']]]),
  slot('film', 1.06, 'mind', ['photo', 'grid'], [['film', 'moving pictures', '', ['sun', 'long']]]),
  slot('tv', 1.065, 'mind', ['radio', 'film'], [['television', 'far pictures', '', ['star', 'white']]]),
  slot('atom', 1.07, 'power', ['grid', 'calculus'], [['atom', 'the split atom', '', ['star', 'fire']]], true),
  slot('jet', 1.075, 'sky', ['flight', 'plastics'], [['jet', 'the jet engine', '', ['wind', 'fire']]]),
  slot('green2', 1.08, 'food', ['fertil', 'antibio'], [['harvests', 'the great harvests', '', ['great', 'field']]]),
  slot('computer', 1.085, 'mind', ['radio', 'calculus'], [['computer', 'the reckoning engine', '', ['star', 'cross']]], true),
  slot('rocket', 1.09, 'sky', ['jet', 'atom'], [['rocket', 'the great rocket', '', ['fire', 'star']]]),
  // ---- Age of Orbit
  slot('orbit', 1.1, 'sky', ['rocket', 'computer'], [['satellite', 'the made moon', '', ['new', 'moon']]], true),
  slot('chip', 1.11, 'mind', ['computer', 'plastics'], [['chip', 'the thinking grain', '', ['star', 'stone']]]),
  slot('net', 1.12, 'mind', ['chip', 'tv'], [['network', 'the web of voices', '', ['long', 'star']]], true),
  slot('gene', 1.13, 'life', ['antibio', 'computer'], [['genes', 'the reading of the seed', '', ['green', 'star']]]),
  slot('solar', 1.14, 'power', ['chip', 'grid'], [['sunpower', 'sun cells', '', ['sun', 'stone']]]),
  slot('moon', 1.15, 'sky', ['orbit'], [['moonwalk', 'the walk on the moon', '', ['moon', 'cross']]], true),
  slot('robot', 1.16, 'craft', ['chip', 'assembly'], [['robots', 'working machines', '', ['new', 'herd']]]),
  slot('fusion', 1.17, 'power', ['atom', 'chip'], [['fusion', 'the bottled star', '', ['star', 'well']]]),
  // ---- Age Beyond
  slot('mind2', 1.18, 'mind', ['net', 'robot'], [['machinemind', 'thinking machines', '', ['new', 'king']]], true),
  slot('weave', 1.185, 'life', ['gene', 'robot'], [['lifecraft', 'made life', '', ['new', 'green']]]),
  slot('station', 1.19, 'sky', ['moon', 'fusion'], [['skycity', 'cities in the sky', '', ['high', 'town']]]),
  slot('ark', 1.195, 'sky', ['station', 'mind2'], [['starship', 'the long ship', '', ['star', 'sea']]], true),
];
/* eslint-enable prettier/prettier */

export const SLOT_INDEX = new Map(WEB.map((s, i) => [s.id, i]));
/** Number of inventions (ways) in the whole web. */
export const INVENTIONS = WEB.reduce((n, s) => n + s.ways.length, 0);

/** What one nation knows: for each slot, the index of the way it found (-1 unknown), and when. */
export interface Knowledge {
  way: Int8Array;
  year: Float64Array;
  /** Research saved up toward the next discovery. */
  saved: number;
  /** For each slot, the year it was last lost (0 if it never was) and the event of that loss (-1 if none): system E5. */
  lost: Float64Array;
  lostEvent: Int32Array;
}

export function newKnowledge(): Knowledge {
  return { way: new Int8Array(WEB.length).fill(-1), year: new Float64Array(WEB.length), saved: 0, lost: new Float64Array(WEB.length), lostEvent: new Int32Array(WEB.length).fill(-1) };
}

/** Copy what one nation knows (and remembers having lost) into another's record. */
export function copyKnowledge(from: Knowledge, to: Knowledge): void {
  to.way.set(from.way); to.year.set(from.year); to.lost.set(from.lost); to.lostEvent.set(from.lostEvent);
}

/**
 * Knowledge is lost (system E5): the newest things go first, so nothing that is still known ever rests
 * on something forgotten. Returns the slots that were lost, newest first.
 */
export function forget(k: Knowledge, count: number, year: number, eventId = -1): number[] {
  const known: number[] = [];
  for (let i = 0; i < WEB.length; i++) if (k.way[i]! >= 0) known.push(i);
  known.sort((a, b) => WEB[b]!.level - WEB[a]!.level);
  const gone = known.slice(0, Math.max(0, Math.min(known.length, Math.round(count))));
  for (const i of gone) { k.way[i] = -1; k.lost[i] = year; k.lostEvent[i] = eventId; }
  return gone;
}

/** The best way of meeting a need that this land allows, or -1 if the land allows none. */
export function wayFor(slotIndex: number, land: ReadonlySet<Land>): number {
  const ways = WEB[slotIndex]!.ways;
  // nobody learns seamanship without water to sail on
  if (WEB[slotIndex]!.field === 'sea' && !land.has('coast') && !land.has('river')) return -1;
  for (let k = 0; k < ways.length; k++) if (!ways[k]!.land || land.has(ways[k]!.land as Land)) return k;
  return -1;
}

/** Slots this nation could discover now: needs met, and its land allows some way. */
export function open(k: Knowledge, land: ReadonlySet<Land>): number[] {
  const out: number[] = [];
  for (let i = 0; i < WEB.length; i++) {
    if (k.way[i]! >= 0) continue;
    const s = WEB[i]!;
    let ok = true;
    // a need whose own prerequisite is impossible on this land is skipped over, not blocked for ever
    for (const need of s.needs) { const j = SLOT_INDEX.get(need)!; if (k.way[j]! < 0 && wayFor(j, land) >= 0) { ok = false; break; } }
    if (ok && wayFor(i, land) >= 0) out.push(i);
  }
  return out;
}

/**
 * The level of knowledge (the scale settlements and eras use) that a set of discoveries amounts to:
 * the share of the needs this land can meet at all that have been met, from first fields to the top.
 */
export function levelOf(k: Knowledge, land: ReadonlySet<Land>, from = 0.22, to = 1.2): number {
  let have = 0, all = 0;
  for (let i = 0; i < WEB.length; i++) {
    if (k.way[i]! >= 0) { have++; all++; } else if (wayFor(i, land) >= 0) all++;
  }
  return from + (to - from) * (all ? have / all : 0);
}

/** How much a culture leans toward each field of knowledge (1 = no lean). */
export type Leaning = Partial<Record<Field, number>>;

/**
 * Choose what is discovered next: nearer needs are likelier than far ones, a culture's leanings
 * count, and the rest is luck. Returns the slot index, or -1 if nothing is open.
 */
export function chooseNext(k: Knowledge, land: ReadonlySet<Land>, lean: Leaning, rng: RNG): number {
  const options = open(k, land);
  if (!options.length) return -1;
  let lowest = Infinity;
  for (const i of options) lowest = Math.min(lowest, WEB[i]!.level);
  let total = 0;
  const weights = options.map((i) => {
    const s = WEB[i]!;
    const w = Math.exp(-(s.level - lowest) * 22) * (lean[s.field] ?? 1);
    total += w;
    return w;
  });
  let r = rng.next() * total;
  for (let j = 0; j < options.length; j++) { r -= weights[j]!; if (r <= 0) return options[j]!; }
  return options[options.length - 1]!;
}

/**
 * What one nation could learn from another it is in contact with (system E3): the earliest need the
 * other has met that is open to this one. Returns the slot index, or -1 if there is nothing to learn.
 * The need is then met in whatever way the learner's own land allows.
 */
export function borrowable(mine: Knowledge, theirs: Knowledge, land: ReadonlySet<Land>): number {
  let best = -1;
  for (const i of open(mine, land)) if (theirs.way[i]! >= 0 && (best < 0 || WEB[i]!.level < WEB[best]!.level)) best = i;
  return best;
}

