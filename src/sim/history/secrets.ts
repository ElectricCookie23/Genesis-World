// Spies and secrets (system E39). Some of what decides a history is never written down by those it was done
// to. A country pressed by a rival pays for drawings carried out of the other's arsenal, and says its own
// smiths found the way. A ruler dies after a short illness, and the court physician is not asked what kind.
// Two countries with the same enemy sign a paper that is not read out. These things are in the cause graph
// like any other, marked as hidden: the public record has only the story that was told, and the "Truth"
// switch shows what lay behind it. Sometimes, generations later, a chest of letters is opened.
//
// The rules of when a country dares, whether it succeeds and when a secret comes out are here, pure.

export const SECRET_KINDS = ['theft', 'assassination', 'pact'] as const;
export type SecretKind = (typeof SECRET_KINDS)[number];

/** A secret as the history keeps it. */
export interface Secret {
  id: number;
  kind: SecretKind;
  year: number;
  /** Who did it and to whom (nation ids); for a pact, the two who signed. */
  by: number; against: number;
  /** The hidden event, and the public story told in its place (-1 where nothing was told). */
  eventId: number; cover: number;
  /** The year it came out (or -1), and the event of that. */
  known: number; knownEvent: number;
}

/** The types of event that are hidden when they happen. */
export const HIDDEN_TYPES = ['theft', 'assassination', 'secret-treaty'] as const;

const sat = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * How many secret undertakings a year a country attempts: none unless a rival presses it, more the harder
 * it is pressed and the colder or bolder its ruler (each 0..1).
 */
export function dares(pressed: number, cruel: number, bold: number): number {
  if (pressed < 0.2) return 0;
  return (sat(pressed) * (0.4 + 0.6 * sat(cruel) + 0.3 * sat(bold))) / 45;
}

/** What it tries, from what is possible: to steal what the rival knows, to strike at its ruler, or to find a secret friend. `luck` is 0..1. */
export function chooses(canSteal: boolean, canStrike: boolean, canBind: boolean, luck: number): SecretKind | null {
  const options: [SecretKind, number][] = [];
  if (canSteal) options.push(['theft', 0.55]);
  if (canStrike) options.push(['assassination', 0.3]);
  if (canBind) options.push(['pact', 0.15]);
  let total = 0;
  for (const [, w] of options) total += w;
  if (!total) return null;
  let x = luck * total;
  for (const [k, w] of options) { x -= w; if (x <= 0) return k; }
  return options[options.length - 1]![0];
}

/** The chance a blow at a ruler succeeds: less against a steady, well-guarded court. */
export function strikes(guard: number): number {
  return sat(0.6 - 0.35 * sat(guard));
}

/** The chance, in a year, that a secret of a given age comes out: none while those who kept it live, then a little every year. */
export function comesOut(age: number): number {
  return age < 60 ? 0 : 1 / 260;
}

/** The story told in place of a secret, in a few words. */
export function coverStory(kind: SecretKind): string {
  return kind === 'theft' ? 'its own smiths found the way' : kind === 'assassination' ? 'a short illness' : 'nothing was said';
}
