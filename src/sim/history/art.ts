// Art movements (system E26). Painters paint things that happened: a hunt, a battle, a crowning, the comet,
// the fire that took half the town. How they paint it belongs to their age (ochre on rock, flat figures in a
// border, a scene with depth, dabs of colour, pure shapes) and to the movement they follow, which spreads
// from country to country and is, sooner or later, turned against.
//
// A painting is stored as what it shows and how (a dozen numbers); the picture is composed on demand, by a
// pure function, into a list of things at places. The page draws that list in the painting's manner.
import { hash32 } from './hash';

/** The five manners of painting, by age. */
export const ART_STYLES = ['ochre on rock', 'flat and bordered', 'in depth', 'in dabs of colour', 'in pure shapes'] as const;

/** The manner of an age: 0 ochre on rock, 1 flat figures in a border, 2 a scene with depth, 3 dabs of colour, 4 pure shapes. */
export function styleOfEra(era: number): number {
  return era <= 1 ? 0 : era <= 3 ? 1 : era <= 5 ? 2 : era <= 7 ? 3 : 4;
}

export const SUBJECTS = ['hunt', 'battle', 'ruler', 'sky', 'fire', 'flood', 'quake', 'ash', 'wonder', 'town', 'voyage', 'plague', 'harvest'] as const;
export type Subject = (typeof SUBJECTS)[number];

/** What kind of picture an event makes, or null if no one would paint it. */
export function subjectOf(type: string): Subject | null {
  if (/^(war|conquest|civil-war|nuclear-war)$/.test(type)) return 'battle';
  if (/^(dynasty|marriage|nation|union)$/.test(type)) return 'ruler';
  if (/^(comet|eclipse|impact|supernova|aurora)$/.test(type)) return 'sky';
  if (/city-fire|wildfire/.test(type)) return 'fire';
  if (/city-flood|tsunami|hurricane|flood/.test(type)) return 'flood';
  if (/quake/.test(type)) return 'quake';
  if (/erupt|volcan/.test(type)) return 'ash';
  if (/^(wonder|monument)$/.test(type)) return 'wonder';
  if (/^(settlement|era|network|building-law|script|calendar|language)$/.test(type)) return 'town';
  if (/^(migration|trade|contact)$/.test(type)) return 'voyage';
  if (/plague/.test(type)) return 'plague';
  if (/^(golden-age|landscape|invention|tamed)$/.test(type)) return 'harvest';
  if (/^(story|music|painting)$/.test(type)) return 'hunt';
  return null;
}

/** A painting as the history keeps it. */
export interface Painting {
  id: number;
  year: number;
  /** The country it was painted in (-1 before there were countries), the species of its makers, and the town. */
  nation: number;
  species: number;
  settlement: number;
  /** The event it shows. */
  eventId: number;
  subject: Subject;
  /** The age of its makers when it was painted, and the manner it is painted in. */
  era: number;
  style: number;
  /** The movement its painter followed, or -1. */
  movement: number;
  title: string;
  /** The painter's name, if anyone kept it. */
  painter: string;
  /** Is it the first painting its country made in a new age? (Those are kept when the gallery is thinned.) */
  first?: boolean;
  seed: number;
  /** The colours of its makers and, in a battle, of their enemy (hues 0..1). */
  hueA: number; hueB: number;
  /** Was it night, and what is in the sky or on the ground that the subject needs said (a wonder's kind, "comet", "eclipse"). */
  night: boolean;
  detail: string;
}

/** A movement in painting: a way of using a manner, begun somewhere, followed elsewhere, and in time turned against. */
export interface Movement {
  id: number;
  name: string;
  /** Its name in the tongue of those who began it. */
  own: string;
  style: number;
  /** How it uses colour: a turn of every hue (-0.5..0.5), and how strong (0 muted, 1 loud). */
  turn: number; loud: number;
  born: number;
  nation: number;
  /** The movement it came out of, and the one it was begun against (-1 for none). */
  parent: number; against: number;
  eventId: number;
}

/** A movement begun against another uses colour the other way: the opposite turn, and loud where that was muted. */
export function against(old: Movement | undefined, seed: number): { turn: number; loud: number } {
  if (!old) return { turn: ((hash32(seed, 0xa27) % 1000) / 1000 - 0.5) * 0.5, loud: 0.3 + ((hash32(seed, 0xa28) % 1000) / 1000) * 0.5 };
  return { turn: old.turn > 0 ? old.turn - 0.5 : old.turn + 0.5, loud: old.loud > 0.5 ? old.loud - 0.45 : old.loud + 0.45 };
}

/** One thing in a picture: what, where its foot stands (x 0..1 across, depth 0 far to 1 near), how big, which side's colour. */
export interface Actor {
  kind: 'person' | 'beast' | 'boat' | 'hut' | 'tower' | 'flame' | 'wave' | 'mountain' | 'plume' | 'crack' | 'tree' | 'field' | 'sun' | 'moon' | 'comet' | 'dark-sun' | 'star' | 'wonder' | 'standard' | 'bier';
  x: number; depth: number; size: number;
  /** 0 the makers' colour, 1 the enemy's, 2 no side (earth, water, fire). */
  side: number;
  flip: boolean;
}

/**
 * Compose a picture: the same list of things for a painting whatever manner it is painted in. A battle is two
 * hosts meeting under their standards; a hunt is hunters behind a herd; a crowning is one figure larger than
 * the rest before a hall; a fire is a town with flames in it.
 */
export function compose(p: Pick<Painting, 'subject' | 'seed' | 'night' | 'detail'>): Actor[] {
  const r = (k: number): number => (hash32(p.seed, k, 0xa47) % 10000) / 10000;
  const out: Actor[] = [];
  const add = (kind: Actor['kind'], x: number, depth: number, size: number, side = 2, flip = false): void => { out.push({ kind, x, depth, size, side, flip }); };
  const crowd = (n: number, x0: number, x1: number, side: number, flip: boolean, kind: Actor['kind'] = 'person', k0 = 0): void => {
    for (let i = 0; i < n; i++) add(kind, x0 + (x1 - x0) * ((i + 0.5) / n) + (r(k0 + i) - 0.5) * 0.04, 0.45 + 0.5 * r(k0 + 40 + i), 0.8 + 0.4 * r(k0 + 80 + i), side, flip);
  };
  // the sky first
  if (p.subject === 'sky') add(p.detail === 'eclipse' ? 'dark-sun' : p.detail === 'comet' ? 'comet' : 'star', 0.3 + 0.4 * r(1), 0, 1.4);
  else if (p.night) add('moon', 0.15 + 0.7 * r(1), 0, 1);
  else add('sun', 0.15 + 0.7 * r(1), 0, 1);
  switch (p.subject) {
    case 'hunt': crowd(4 + Math.floor(r(2) * 3), 0.5, 0.92, 2, false, 'beast', 100); crowd(3 + Math.floor(r(3) * 2), 0.06, 0.4, 0, false, 'person', 200); add('tree', 0.08 + 0.1 * r(4), 0.3, 1.2); break;
    case 'battle': crowd(4 + Math.floor(r(2) * 3), 0.05, 0.44, 0, false, 'person', 100); crowd(4 + Math.floor(r(3) * 3), 0.56, 0.95, 1, true, 'person', 200); add('standard', 0.2, 0.6, 1.3, 0); add('standard', 0.8, 0.6, 1.3, 1, true); break;
    case 'ruler': add('tower', 0.5, 0.25, 1.6); add('person', 0.5, 0.9, 2.1, 0); crowd(3, 0.08, 0.36, 0, false, 'person', 100); crowd(3, 0.64, 0.92, 0, true, 'person', 200); add('standard', 0.36, 0.7, 1.2, 0); break;
    case 'sky': for (let i = 0; i < 3; i++) add('hut', 0.2 + 0.3 * i + 0.05 * r(10 + i), 0.35, 1); crowd(4, 0.2, 0.8, 0, r(5) > 0.5, 'person', 100); break;
    case 'fire': for (let i = 0; i < 4; i++) { const x = 0.14 + 0.24 * i + 0.04 * r(10 + i); add(i === 1 ? 'tower' : 'hut', x, 0.4, 1.1); if (i !== 3) add('flame', x + 0.02, 0.42, 1.2 + r(20 + i)); } crowd(3, 0.5, 0.95, 0, false, 'person', 100); break;
    case 'flood': for (let i = 0; i < 3; i++) add('hut', 0.2 + 0.28 * i, 0.35, 1); for (let i = 0; i < 4; i++) add('wave', 0.12 + 0.25 * i, 0.5 + 0.12 * (i % 2), 1.3); add('boat', 0.62, 0.8, 1.1, 0); break;
    case 'quake': for (let i = 0; i < 4; i++) add(i % 2 ? 'tower' : 'hut', 0.14 + 0.24 * i, 0.4, 1.1, 2, i % 2 === 0); add('crack', 0.5, 0.75, 1.6); crowd(3, 0.1, 0.9, 0, r(5) > 0.5, 'person', 100); break;
    case 'ash': add('mountain', 0.68, 0.2, 2.2); add('plume', 0.68, 0.2, 2); for (let i = 0; i < 3; i++) add('hut', 0.12 + 0.16 * i, 0.5, 1); crowd(4, 0.05, 0.5, 0, true, 'person', 100); break;
    case 'wonder': add('wonder', 0.56, 0.35, 2.4); crowd(5, 0.06, 0.94, 0, false, 'person', 100); add('hut', 0.14, 0.4, 0.9); break;
    case 'town': for (let i = 0; i < 5; i++) add(i === 2 ? 'tower' : 'hut', 0.1 + 0.2 * i + 0.03 * r(10 + i), 0.35 + 0.1 * (i % 2), 1); add('field', 0.3, 0.8, 1.4); crowd(3, 0.5, 0.92, 0, false, 'person', 100); break;
    case 'voyage': for (let i = 0; i < 5; i++) add('wave', 0.1 + 0.2 * i, 0.45 + 0.15 * (i % 2), 1.2); add('boat', 0.3, 0.6, 1.5, 0); add('boat', 0.68, 0.8, 1.2, 0); add('mountain', 0.86, 0.15, 1.1); break;
    case 'plague': for (let i = 0; i < 3; i++) add('hut', 0.16 + 0.3 * i, 0.35, 1); add('bier', 0.5, 0.75, 1.3); crowd(4, 0.1, 0.9, 0, false, 'person', 100); break;
    case 'harvest': add('field', 0.3, 0.6, 1.6); add('field', 0.72, 0.8, 1.4); add('tree', 0.9, 0.3, 1.2); crowd(4, 0.1, 0.9, 0, r(5) > 0.5, 'person', 100); add('beast', 0.6, 0.55, 1); add('hut', 0.1, 0.3, 0.9); break;
  }
  return out;
}

/** A painting's caption: what it is of, in a few words. */
export function describePainting(p: Pick<Painting, 'subject' | 'style'>): string {
  const what: Record<Subject, string> = {
    hunt: 'hunters and their quarry', battle: 'two hosts meeting', ruler: 'a ruler before the hall', sky: 'a town under a strange sky', fire: 'a town burning', flood: 'a town under water',
    quake: 'a town thrown down', ash: 'a mountain burying a town', wonder: 'a great work and its builders', town: 'a town at work', voyage: 'ships at sea', plague: 'a town in mourning', harvest: 'a good year in the fields',
  };
  return `${what[p.subject].charAt(0).toUpperCase()}${what[p.subject].slice(1)}, ${ART_STYLES[p.style]}.`;
}
