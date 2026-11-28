// Through their eyes (expansion E50): what a species' senses, read from its genes, make of the world.
// Kept apart from the rest of Section 5 so that the page can use it without the simulation.
import { G, senseParts } from './genetics';

export interface Vision {
  /** The sense the animal mostly finds its way by. */
  mode: 'sight' | 'echo' | 'heat' | 'electric';
  /** How sharp its sight is, 0 (light and dark only) .. 1. */
  acuity: number;
  /** How much colour it sees, 0 (none) .. 1 (more than we do: into the ultraviolet). */
  colour: number;
  /** How well it sees in the dark, 0..1. */
  night: number;
  /** How much of the world around it it takes in at once, 0 (straight ahead) .. 1 (all round). */
  field: number;
  /** In a sentence. */
  text: string;
}

/** What a species' senses make of the world, read from its genes. The picture filter is driven by these numbers. */
export function vision(g: ArrayLike<number>): Vision {
  const eyes = g[G.EyeCount]! > 0.1 ? Math.round(g[G.EyeCount]! * 6) : 0;
  const acuity = eyes ? Math.min(1, g[G.EyeSize]! * 0.5 + g[G.Sight]! * 0.7) : 0;
  const night = Math.min(1, g[G.Nocturnal]! * 0.8 + g[G.EyeSize]! * 0.4);
  // (which sense it lives by is read the way the simulation reads it, from what each sense is worth to this animal:
  // the electric sense only works in water, a gene left over from a life in the sea is not a sense on land, and a
  // cold-blooded night hunter with poor eyes finds warm things by their warmth)
  const parts = senseParts(g);
  const mode: Vision['mode'] = parts.byEcho > 0.15 && parts.byEcho >= parts.sight && parts.byEcho >= parts.byField && parts.byEcho >= parts.byHeat ? 'echo'
    : parts.byField > 0.15 && parts.byField > parts.sight && parts.byField >= parts.byHeat ? 'electric'
      : parts.byHeat > 0.12 && parts.byHeat > parts.sight ? 'heat' : 'sight';
  // colour needs daylight eyes: night animals trade it for sensitivity; four or more eyes and sharp sight reach past violet
  const colour = eyes ? Math.max(0, Math.min(1, g[G.Sight]! * 0.9 - g[G.Nocturnal]! * 0.5 + (eyes >= 4 ? 0.25 : 0))) : 0;
  const field = eyes ? Math.min(1, 0.3 + eyes * 0.12 + (g[G.Diet]! < 0.35 ? 0.25 : 0)) : 0;
  const text = mode === 'echo' ? 'It calls and listens. The world is the shape of the echoes: near things bright, far things faint, and nothing has a colour.'
    : mode === 'electric' ? 'It feels the faint current every living body makes. Rock and water are dark to it; anything alive glows.'
      : mode === 'heat' ? 'It sees warmth. A warm body stands out against cold ground like a lamp.'
        : !eyes ? 'It has no eyes. It knows light from dark through its skin, and nothing more.'
          : `${acuity > 0.7 ? 'Sharp sight' : acuity > 0.4 ? 'Fair sight' : 'Poor sight: shapes and movement'}, ${colour > 0.8 ? 'with more colours than we have names for, into the ultraviolet' : colour > 0.45 ? 'in colour' : colour > 0.15 ? 'in a few dull colours' : 'without colour'}${night > 0.6 ? ', and good eyes for the dark' : ''}${field > 0.75 ? ', seeing almost all the way round' : ''}.`;
  return { mode, acuity, colour, night, field, text };
}

