// Neighbor Link (expansion E98): two planets that know about each other. A second world, grown from another seed,
// runs year for year beside this one. When a people on either has the means, it sees the other's lights, then hears
// its voice, then sends something across. Each world records what it learned of the other in its own cause graph.
//
// The second world is a whole simulation on a small grid, stepped in the same worker, so the pair is as repeatable
// from its two seeds as one world is from one.
import type { Simulation } from './simulation';

/** What the page is told about the linked world. */
export interface LinkInfo {
  seed: string;
  year: number;
  stage: string;
  species: number;
  towns: number;
  maxTech: number;
  /** What the two have learned of each other so far, oldest first. */
  contact: { year: number; title: string }[];
}

const LIGHTS = 'neighbour-lights', VOICE = 'first-contact', VISIT = 'neighbour-probe';

/** One side noticing the other. `a` records; `b` is the world being noticed. */
function notice(a: Simulation, b: Simulation): void {
  const mine = a.civ, theirs = b.civ;
  if (mine.living === 0) return;
  const noted = a.linkNoted;
  // their cities at night, through the first good lenses
  if (noted[LIGHTS] === undefined && mine.maxTech >= 0.5 && theirs.living > 0 && theirs.maxTech >= 0.6) {
    noted[LIGHTS] = a.emit({
      type: LIGHTS, title: `Lights on the neighbouring world`,
      description: `Someone turns a lens on the bright wanderer in the evening sky and sees, on its dark side, points of light that are not fire and do not move. They are in rows. The world next to this one is lived on.`,
      importance: 3, data: { seed: b.seed },
    }).id;
  }
}

/**
 * Let two linked worlds learn of each other. Called once per step by the world the player is watching, after both
 * have been stepped.
 */
export function exchange(a: Simulation, b: Simulation): void {
  notice(a, b); notice(b, a);
  const both = a.civ.living > 0 && b.civ.living > 0;
  // radio: both must be able to speak and to listen, and it happens to both at once
  if (both && a.linkNoted[VOICE] === undefined && a.civ.maxTech >= 1.0 && b.civ.maxTech >= 1.0) {
    for (const [self, other] of [[a, b], [b, a]] as const) {
      self.linkNoted[VOICE] = self.emit({
        type: VOICE, title: 'First contact',
        description: `A signal that repeats, from the neighbouring world, and it is not noise: it counts. An answer is sent the same night. It takes minutes to cross. For the first time, two peoples who share nothing but a star are talking.`,
        causes: [self.linkNoted[LIGHTS] ?? -1, self.milestones.get('space-age') ?? -1].filter((x) => x >= 0), importance: 3, data: { seed: other.seed },
      }).id;
    }
  }
  // a machine sent across, by whichever side can first
  for (const [self, other] of [[a, b], [b, a]] as const) {
    if (self.linkNoted[VISIT] !== undefined || self.civ.living === 0 || !self.milestones.has('space-age')) continue;
    const sent = self.emit({
      type: VISIT, title: 'A machine is sent to the neighbouring world',
      description: other.civ.living > 0
        ? `It crosses in a season and lands outside one of their cities. Pictures come back of faces at the fence.`
        : `It crosses in a season and lands on a world with no one on it. Pictures come back of ${other.stage === 'barren' ? 'bare rock and empty sea' : other.stage === 'animals' ? 'things that move, and watch it' : 'coloured water and nothing else'}.`,
      causes: [self.linkNoted[VOICE] ?? -1, self.milestones.get('space-age') ?? -1].filter((x) => x >= 0), importance: 2, data: { seed: other.seed },
    });
    self.linkNoted[VISIT] = sent.id;
    if (other.linkNoted['visited'] === undefined) {
      other.linkNoted['visited'] = other.emit({
        type: 'neighbour-visitor', title: 'Something lands from the neighbouring world',
        description: other.civ.living > 0 ? 'A thing of metal comes down on a pillar of fire. It was made, and not here.' : 'A thing of metal comes down on a pillar of fire. Nothing here knows what it is.',
        causes: [other.linkNoted[VOICE] ?? -1].filter((x) => x >= 0), importance: other.civ.living > 0 ? 3 : 1, data: { seed: self.seed },
      }).id;
    }
  }
}

export function linkInfo(a: Simulation, b: Simulation): LinkInfo {
  const ids = Object.values(a.linkNoted).sort((x, y) => x - y);
  return {
    seed: b.seed, year: b.simYear, stage: b.stage, species: b.creatures.livingSpecies, towns: b.civ.living, maxTech: b.civ.maxTech,
    contact: ids.map((id) => a.events.events[id]!).filter(Boolean).map((e) => ({ year: e.simYear, title: e.title })),
  };
}
