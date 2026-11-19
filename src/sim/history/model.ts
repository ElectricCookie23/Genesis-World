// The entities of history. All of them are plain data, so the whole of history saves, loads and
// rewinds with the rest of the simulation.
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
}

export type Role = 'ruler' | 'founder' | 'inventor' | 'prophet' | 'general' | 'explorer' | 'artist';

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
}

export type Government = 'band' | 'chiefdom' | 'kingdom' | 'republic' | 'empire' | 'council';

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
  /** For each slot of the tech web, whether anyone has yet discovered it (1) in this history. */
  firsts: number[];
}

export function emptyHistory(): HistoryState {
  return { cultures: [], languages: [], nations: [], people: [], dynasties: [], pending: 0, began: -1, topEra: 0, firsts: [] };
}
