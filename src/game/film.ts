// The documentary maker's plan (expansion E59): which events to show, in what order, and for how long.
//
// A film of a given length has room for a fixed number of shots. The record is cut into that many stretches, by the
// order things happened in and not by the calendar (a world's first three billion years hold fewer events than its
// last three thousand), and the weightiest event of each stretch is taken: by its importance first, then by how much
// followed from it in the cause graph. The film always opens on the first life and closes on the latest thing of note,
// and every second of it belongs to a shot: there is no dead time to fill.
import type { SimEvent } from '../sim/events';

export interface Shot {
  eventId: number;
  year: number;
  title: string;
  /** What the narrator says. */
  text: string;
  /** Where to look, or -1 for the whole planet. */
  cell: number;
  /** When it starts, and how long it is held (seconds). */
  at: number;
  seconds: number;
}

/** Seconds a shot is given before the lengths are fitted: long enough to read it aloud. */
const reading = (e: SimEvent) => Math.max(6, Math.min(16, 3.5 + (e.title.length + e.description.length) / 17));

export function planFilm(events: SimEvent[], minutes: number): Shot[] {
  const total = minutes * 60;
  const all = events.filter((e): e is SimEvent => !!e && e.importance >= 1 && e.description.length > 0).sort((a, b) => a.simYear - b.simYear || a.id - b.id);
  if (!all.length) return [];
  const weight = (e: SimEvent) => e.importance * 100 + Math.min(60, e.effects.length * 4) + (e.type === 'milestone' ? 30 : 0);
  const want = Math.max(1, Math.min(all.length, Math.round(total / 9)));
  const chosen: SimEvent[] = [];
  for (let k = 0; k < want; k++) {
    const from = Math.floor((k * all.length) / want), to = Math.max(from + 1, Math.floor(((k + 1) * all.length) / want));
    let best = all[from]!;
    for (let i = from; i < to; i++) if (weight(all[i]!) > weight(best)) best = all[i]!;
    chosen.push(best);
  }
  // it begins with the beginning of life, and ends with the present
  const life = all.find((e) => e.type === 'milestone' && e.data?.key === 'first-life');
  if (life && !chosen.includes(life)) chosen[0] = life;
  const latest = all[all.length - 1]!;
  if (chosen.length > 1 && !chosen.includes(latest)) chosen[chosen.length - 1] = latest;
  chosen.sort((a, b) => a.simYear - b.simYear || a.id - b.id);
  // fit the lengths to the film exactly
  const raw = chosen.map(reading);
  const scale = total / raw.reduce((a, b) => a + b, 0);
  let at = 0;
  return chosen.map((e, i) => {
    const seconds = i === chosen.length - 1 ? total - at : raw[i]! * scale;
    const shot: Shot = { eventId: e.id, year: e.simYear, title: e.title, text: e.description, cell: e.cellId, at, seconds };
    at += seconds;
    return shot;
  });
}

/** Which shot is on screen a given number of seconds in, or -1 when the film is over. */
export function shotAt(shots: Shot[], seconds: number): number {
  for (let i = 0; i < shots.length; i++) if (seconds < shots[i]!.at + shots[i]!.seconds) return i;
  return -1;
}
