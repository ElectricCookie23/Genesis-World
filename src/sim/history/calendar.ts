// Calendars (system E8): each people counts its years from something that really happened to it,
// an event in the cause graph: the planting of its first fields, a comet's return, an eclipse, a
// disaster it lived through, the crowning of a house, the teaching of a prophet.
import { hash32 } from './hash';

export type CalendarKind = 'founding' | 'comet' | 'eclipse' | 'disaster' | 'crown' | 'prophet';

export interface Calendar {
  id: number;
  /** What the years are counted from, in plain words: "the Falling Light". */
  name: string;
  /** The same in the language of the people who set the count. */
  own: string;
  /** The sim year that is Year 1. */
  epoch: number;
  /** The event in the cause graph the count is tied to. */
  eventId: number;
  kind: CalendarKind;
  /** The nation that set it. */
  nation: number;
  /** The sim year it was set (a count can be set long after the event it remembers). */
  set: number;
}

/** A year of the world in a people's own count. Year 1 is the year of the event; before it, years are counted back. */
export function localYear(cal: Pick<Calendar, 'epoch'>, simYear: number): number {
  const d = Math.floor(simYear) - Math.floor(cal.epoch);
  return d >= 0 ? d + 1 : d;
}

/** "Year 412 of the Falling Light", or "the 30th year before the Falling Light". */
export function dateIn(cal: Pick<Calendar, 'name' | 'epoch'>, simYear: number): string {
  const y = localYear(cal, simYear);
  return y > 0 ? `Year ${y.toLocaleString('en-US')} of ${cal.name}` : `${(-y).toLocaleString('en-US')} ${y === -1 ? 'year' : 'years'} before ${cal.name}`;
}

const SKY: Record<string, [string, string, string][]> = {
  comet: [['the Falling Light', 'star', 'fire'], ['the Long-Tailed Star', 'star', 'great'], ['the Returning Star', 'star', 'old'], ['the Feather in the Sky', 'star', 'wind'], ['the Pale Guest', 'star', 'moon'], ['the Evening Torch', 'fire', 'moon'], ['the Bright Wanderer', 'star', 'new']],
  eclipse: [['the Swallowed Sun', 'sun', 'moon'], ['the Dark Noon', 'sun', 'old'], ['the Black Sun', 'sun', 'stone'], ['the Night at Midday', 'sun', 'star'], ['the Ring of Fire', 'sun', 'fire']],
};

/**
 * What a count of years is called, and the two meanings its name is built from in the people's own tongue.
 * `title` is the title of the event remembered, `who` a name that belongs in it (a house, a prophet, a fallen country).
 */
export function calendarName(kind: CalendarKind, seed: number, detail: string, who: string): [string, string, string] {
  const pick = <T>(list: T[]): T => list[hash32(seed, 0xca1) % list.length]!;
  if (kind === 'comet' || kind === 'eclipse') return pick(SKY[kind]!);
  if (kind === 'crown') return [`the ${who}`, 'king', 'new'];
  if (kind === 'prophet') return [`the Teaching of ${who}`, 'god', 'new'];
  if (kind === 'disaster') {
    const t = detail.toLowerCase();
    if (/impact|meteor|asteroid|falls|strike/.test(t)) return ['the Burning Sky', 'fire', 'star'];
    if (/erupt|volcan|ash/.test(t)) return ['the Ash', 'fire', 'hill'];
    if (/wave|tsunami|flood|sea/.test(t)) return ['the Great Wave', 'sea', 'great'];
    if (/quake|shak/.test(t)) return ['the Shaking', 'stone', 'great'];
    if (/plague|sick/.test(t)) return ['the Great Dying', 'people', 'old'];
    if (/star|supernova/.test(t)) return ['the New Star', 'star', 'new'];
    return ['the Ruin', 'stone', 'old'];
  }
  // founding: detail says how the country began
  if (detail === 'dawn') return ['the First Fields', 'land', 'new'];
  if (detail === 'sea') return ['the Landing', 'sea', 'land'];
  if (detail === 'breakaway') return ['the Parting', 'people', 'new'];
  if (detail === 'successor') return [`the Fall of ${who}`, 'land', 'old'];
  return ['the Settling', 'land', 'people'];
}
