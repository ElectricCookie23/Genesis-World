// The entities of history. All of them are plain data, so the whole of history saves, loads and
// rewinds with the rest of the simulation.
import type { Calendar } from './calendar';
import type { Language } from './language';
import type { Knowledge, Land } from './tech';

/** A way of life shared by one or more nations: a language, values and a look. */
export interface Culture {
  id: number;
  name: string;
  /** The species whose culture this is. */
  species: number;
  language: number;
  /** Parent culture it split from, or -1. */
  parent: number;
  born: number;
  /** What its people prize, each 0..1: these bias what nations of the culture do. */
  war: number;
  faith: number;
  trade: number;
  craft: number;
  /** Signature colour as a hue 0..1. */
  hue: number;
  /** For a people made of two: the culture of the newcomers it took in (system E9). */
  mixedWith?: number;
}

export type Role = 'ruler' | 'founder' | 'inventor' | 'prophet' | 'general' | 'explorer' | 'artist' | 'scholar' | 'consort' | 'claimant';

/** Someone history remembers. Ordinary people are never stored: see citizens.ts. */
export interface Person {
  id: number;
  name: string;
  role: Role;
  nation: number;
  culture: number;
  born: number;
  /** Year of death, or -1 while alive. */
  died: number;
  /** Family line, or -1. */
  dynasty: number;
  /** Parent among the notable people, or -1. */
  parent: number;
  /** Temperament, each 0..1: these bias what a ruler's nation does. */
  bold: number;
  wise: number;
  cruel: number;
  pious: number;
  /** Events in the cause graph this person is tied to. */
  events: number[];
  /** How the life ended, once it has. */
  fate: string;
  /** Years of rule, for rulers: from..to (to = -1 while reigning). */
  reignFrom: number;
  reignTo: number;
  /** The ruler they served or rose under, and a rival (the general on the other side, the claimant they fought), or -1. */
  patron: number;
  rival: number;
  /** The year they made their name. */
  rose: number;
  /** The age their nation was in when they rose (it sets the style of their portrait). */
  era: number;
  /** Generation in the family line, counted from the first of the house (a child is one more than its parent). */
  gen?: number;
  /** Husband or wife among the people on record, or -1. */
  spouse?: number;
  /** For a ruler married into another ruling house: the nation that house rules. */
  match?: number;
  /** A nation whose throne this person could claim through a parent, or -1. */
  claim?: number;
}

export interface Dynasty {
  id: number;
  name: string;
  nation: number;
  founder: number;
  founded: number;
  /** Year the line lost power, or -1. */
  ended: number;
  /** Rulers of the house who were recorded one by one (those who reigned while time ran at a human pace). */
  rulers: number[];
  /** How many reigns the house has had in all, recorded or not. */
  reigns: number;
  /** How many generations of the family have ruled. */
  generations?: number;
  /** The house this one is a branch of (a younger child who took a throne of their own), or undefined. */
  branchOf?: number;
}

/** Something built between two towns (system E15). Where it runs is not stored: it is worked out from the two towns. */
export interface Link {
  /** The two towns, lower id first. */
  a: number;
  b: number;
  /** An index into NETWORKS. */
  kind: number;
  year: number;
  /** The nation that built it. */
  nation: number;
}

/** The kinds of network, in the order a people comes to them: what each is called, the knowledge it needs, how often a nation adds a stretch (years), and how brightly it shows at night. */
export const NETWORKS = [
  { id: 'road', name: 'made road', plural: 'made roads', needs: 'road1', every: 45, glow: 0.05, sea: false },
  { id: 'aqueduct', name: 'aqueduct', plural: 'aqueducts', needs: 'aqueduct', every: 120, glow: 0, sea: false },
  { id: 'canal', name: 'barge canal', plural: 'canals', needs: 'canal', every: 90, glow: 0.04, sea: false },
  { id: 'rail', name: 'railway', plural: 'railways', needs: 'rail', every: 22, glow: 0.1, sea: false },
  { id: 'wire', name: 'telegraph line', plural: 'telegraph wires', needs: 'telegraph', every: 14, glow: 0, sea: true },
  { id: 'pipe', name: 'pipeline', plural: 'pipelines', needs: 'oil', every: 40, glow: 0, sea: false },
  { id: 'power', name: 'power line', plural: 'power lines', needs: 'grid', every: 12, glow: 0.2, sea: true },
] as const;

export type Government = 'band' | 'chiefdom' | 'kingdom' | 'republic' | 'empire' | 'council' | 'custom';

export interface Nation {
  id: number;
  name: string;
  culture: number;
  species: number;
  /** Settlement id of the capital. */
  capital: number;
  founded: number;
  /** Year it ceased to exist, or -1. */
  ended: number;
  /** Nation it broke away from or succeeded, or -1. */
  parent: number;
  government: Government;
  ruler: number;
  dynasty: number;
  /** How well it holds together, 0..1. */
  stability: number;
  /** Overall level of knowledge, on the same 0..1.2 scale settlements use. */
  tech: number;
  /** Index into the eras (see eras.ts). */
  era: number;
  /** Signature colour as a hue 0..1. */
  hue: number;
  /** Event that founded it. */
  eventId: number;
  /** People, in thousands, summed over its settlements at the last tick. */
  pop: number;
  /** How many living settlements it had at the last tick. */
  towns: number;
  /** What it has discovered (the tech web, system E1). `tech` above is the level this amounts to. */
  know: Knowledge;
  /** What its land offers, refreshed now and then. */
  land: Land[];
  /** Year the land was last surveyed. */
  surveyed: number;
  /** Nations it is in touch with, by land or by sea (system E3): knowledge passes along these. */
  contacts: number[];
  /** How many things it has learned from others rather than discovered. */
  borrowed?: number;
  /** How far wealth has gathered in few hands, 0..1 (system E4): it creeps up in good times and is reset by upheaval. */
  inequality: number;
  /** Weariness of war, 0..1: each war adds to it and peace wears it away. */
  fatigue: number;
  /** Recent blows to the nation (wars, plagues, disasters, a fallen house), newest last: what a collapse is blamed on. */
  woes: { kind: string; eventId: number; year: number }[];
  /** Its golden age, while it lasts (system E10): when it began, the event that announced it, what its people call it, and the great works raised in it. */
  golden?: { since: number; eventId: number; own: string; works: number };
  /** The year its last golden age ended. */
  goldenEnded?: number;
  /** The year its forests were recorded as cut (system E16). */
  felled?: number;
  /** The year of its last great migration (system E9). */
  moved?: number;
  /** The count of years it keeps (an index into the history's calendars). */
  calendar?: number;
  /** Every nation this one has ever met. */
  met?: number[];
  /** Nations it will not fight while a marriage between the ruling houses is remembered. */
  allies?: { nation: number; until: number; eventId: number }[];
  /** The year it was at its greatest extent, and how many towns it then held. */
  peakYear: number;
  peakTowns: number;
}

/** Everything the history engine keeps, in one saveable object. */
export interface HistoryState {
  cultures: Culture[];
  languages: Language[];
  nations: Nation[];
  people: Person[];
  dynasties: Dynasty[];
  /** Years of history not yet turned into ticks. */
  pending: number;
  /** The year history began (the first fields), or -1 before that. */
  began: number;
  /** Highest era any nation has reached. */
  topEra: number;
  /** The highest age ever reached in this history, which a great ruin does not lower. */
  peakEra?: number;
  /** The year the long peace began (nations and towns live on, history is no longer made), or -1. */
  peace?: number;
  /** The most people alive at once during the long peace: losing most of them breaks it. */
  peacePop?: number;
  /** The year the leading nation reached the top of knowledge, or -1. */
  topSince?: number;
  /** The first dam, the first mine and the first felling of a nation's forests anywhere (system E16): the events that recorded them. */
  firstWorks?: { dam?: number; mine?: number; felled?: number };
  /** What has been built between towns (system E15): roads, aqueducts, canals, railways, wires, pipelines, power lines. */
  links?: Link[];
  /** The first of each kind of network anywhere: the event that recorded it, or undefined. */
  firstLinks?: number[];
  /** The counts of years peoples have kept (system E8). */
  calendars?: Calendar[];
  /** The first event of this history: the last resort for what a count of years is tied to. */
  dawnEvent?: number;
  /** The small comet of the human clock: how often it returns, when it is next due, and the event of its last return. */
  visitor?: { period: number; next: number; last: number };
  /** The latest sight in the sky anyone recorded: its event, its year and its kind. */
  sign?: { eventId: number; year: number; kind: 'comet' | 'eclipse' };
  /** The year of the last war fought with the weapons of the Age of Orbit, if there has been one. */
  lastWar?: number;
  /** The year history resumed after a broken peace, or -1. */
  since?: number;
  /** For each slot of the tech web, whether anyone has yet discovered it (1) in this history. */
  firsts: number[];
  /** People on record who are not rulers and are still alive: their lives are followed to their end (system E6). */
  notables: number[];
}

export function emptyHistory(): HistoryState {
  return { cultures: [], languages: [], nations: [], people: [], dynasties: [], pending: 0, began: -1, topEra: 0, firsts: [], notables: [] };
}
