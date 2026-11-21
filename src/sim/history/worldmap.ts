// Their map of the world (system E29). Every country has a picture of the world, and early on it is mostly
// wrong: it knows the ground round its own towns, has heard of the lands of those it trades with, has seen
// the coasts its ships can reach, and can measure none of it well. As it learns to measure, to sail and to
// keep time, the picture grows and straightens, until from orbit there is nothing left to get wrong.
//
// Nothing is stored. What a country knows of a place, and where its map puts it, are pure functions of where
// its towns and its neighbours' towns are and of what it knows how to do.

/** What a country's mapmakers have to go on: how far from a town they have walked (radians of the globe), how far their ships go, and how well they measure (0..1). */
export interface Charting { reach: number; sea: number; skill: number }

/** The charting of a country that knows these things. `knows` answers for a slot of the tech web. */
export function chartingOf(knows: (slot: string) => boolean, tech: number): Charting {
  // from orbit, everything is seen and nothing is guessed
  if (tech >= 1.1) return { reach: 4, sea: 4, skill: 1 };
  const has = (slot: string, v: number): number => (knows(slot) ? v : 0);
  const reach = 0.05 + has('road1', 0.03) + has('cav', 0.04) + has('map', 0.05) + has('rail', 0.25) + (tech >= 1 ? 3 : 0);
  const sea = Math.max(has('boat', 0.05), has('sail', 0.14), has('ship1', 0.32), has('ship2', 0.9), has('steamship', 3.3));
  const skill = Math.min(0.97, has('measure', 0.1) + has('sky2', 0.08) + has('math', 0.1) + has('compass', 0.14) + has('clock', 0.16) + has('map', 0.12) + has('telescope', 0.1) + has('photo', 0.12) + (tech >= 1 ? 0.2 : 0));
  return { reach, sea, skill };
}

const ramp = (d: number, full: number, none: number): number => (d <= full ? 1 : d >= none ? 0 : 1 - (d - full) / (none - full));

/**
 * How well a country knows a place, 0 (never heard of) to 1 (walked over): from how far the place is from its
 * nearest own town, from its nearest own harbour, and from the nearest town of a people it is in touch with
 * (all in radians; Infinity for none). Its own ground it knows; coasts its ships reach it has seen from the
 * water; its neighbours' lands it has heard described.
 */
export function knownAt(dHome: number, dPort: number, dNear: number, c: Charting): number {
  const walked = ramp(dHome, c.reach, c.reach * 2.2);
  const sailed = 0.8 * ramp(dPort, c.sea, c.sea * 1.5);
  const heard = 0.55 * ramp(dNear, c.reach * 0.8, c.reach * 2);
  return Math.max(walked, sailed, heard);
}

/** How far wrong their map may put a place they know this well (radians): little near home, more where they only have hearsay, less the better they measure. */
export function mapError(known: number, c: Charting): number {
  const rough = (1 - c.skill) * (1 - c.skill);
  return rough * (0.04 + 0.26 * (1 - known));
}

/**
 * Where on the true world the features come from that their map draws at a spot (a unit vector). The map is
 * the true world seen through a warp that belongs to this country (`seed`) and is as strong as `mapError`
 * says: smooth, so coasts bend and islands slide rather than scatter.
 */
export function believedSpot(x: number, y: number, z: number, known: number, c: Charting, seed: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const e = mapError(known, c);
  if (e <= 1e-5) { out[0] = x; out[1] = y; out[2] = z; return out; }
  const s = (seed % 628) / 100;
  const a = Math.sin(3.1 * x + 2.3 * y - 1.7 * z + s) + 0.5 * Math.sin(6.3 * y - 5.1 * x + 2 * s);
  const b = Math.sin(2.7 * z - 3.3 * x + 1.9 * y + s * 1.7) + 0.5 * Math.sin(5.9 * z + 4.7 * y - s);
  const d = Math.sin(3.7 * y + 2.9 * z - 2.1 * x - s * 0.7) + 0.5 * Math.sin(6.7 * x - 4.3 * z + 3 * s);
  const X = x + e * a * 0.67, Y = y + e * b * 0.67, Z = z + e * d * 0.67;
  const l = Math.hypot(X, Y, Z) || 1;
  out[0] = X / l; out[1] = Y / l; out[2] = Z / l;
  return out;
}

/** A country's map in a sentence: how much of the world is on it and how far to trust it. */
export function describeMap(share: number, c: Charting): string {
  const much = share >= 0.97 ? 'The whole world is on it' : share >= 0.6 ? 'Most of the world is on it' : share >= 0.3 ? 'About a third of the world is on it' : share >= 0.1 ? 'A tenth of the world is on it, and the rest is blank' : 'It shows their own country and its neighbours, and nothing else';
  const trust = c.skill >= 0.97 ? 'and it is right' : c.skill >= 0.7 ? 'and what is on it is measured: a sailor can steer by it' : c.skill >= 0.4 ? 'and distances on it are fair near home and guesses far away' : c.skill >= 0.15 ? 'drawn from travellers\' reckonings: the shapes are roughly right and the sizes are not' : 'drawn from memory and from what travellers say: no distance on it can be trusted';
  return `${much}, ${trust}.`;
}
