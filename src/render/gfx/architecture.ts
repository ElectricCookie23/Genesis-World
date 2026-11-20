// Architecture from biology (system E13). What a people builds follows from the body that builds it
// and from what its land gives it to build with. A tall people builds tall and narrow, with tall
// doorways; burrowers dig down and leave low mounds above ground; fliers build high perches on posts,
// with no way up for anything that walks; a people of the water builds out into the shallows, half
// under the surface. Walls are timber where there is forest, mud brick where it is dry, stone in the
// hills, reed in the marshes, packed snow in the cold, coral and shell on a warm shore.
import { G, Limb, limbKind } from '../../sim/genetics';

export interface Architecture {
  /** How tall the builders stand and how well they fly, burrow and swim, each 0..1: what the rest follows from. */
  tall: number;
  flier: number;
  burrower: number;
  swimmer: number;
  /** Height of what they build, as a multiple of the plain model (0.55 .. 1.9), and its width likewise. */
  rise: number;
  girth: number;
  /** How far the floor is lifted on posts (positive, in model units) or what share of the building is sunk into the ground (negative, at most half). */
  lift: number;
  /** How willingly they build in the water: 0 never, 1 out into the shallows. */
  wade: number;
  /** 0 square and gabled .. 1 round and domed. */
  round: number;
  /** How steep their roofs are, as a multiple of the plain model (0.6 nearly flat .. 2.2 spires): showy, horned and cold-furred peoples build steep. */
  pitch: number;
  /** How many windows they cut, as a multiple (0.6 few and large .. 1.8 many and small): a people of many eyes wants many. */
  windows: number;
  /** How much they decorate: bands of their colour round every floor (0 none .. 1 every surface). */
  ornament: number;
  /** How closely they build (0.8 packed like a hive .. 1.2 spread out), and how large (0.8 .. 1.25). */
  spacing: number;
  scale: number;
}

const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The way a species builds, from its reference genome. */
export function architectureOf(genes: Float32Array): Architecture {
  const g = genes;
  const legs = limbKind(g[G.LimbType]!) === Limb.Legs || limbKind(g[G.LimbType]!) === Limb.Wings;
  const flier = g[G.LimbPairs]! > 0.12 ? sat((g[G.LimbType]! - 0.72) * 5) : 0;
  const burrower = sat((g[G.Burrow]! - 0.25) * 2.2);
  const swimmer = sat((g[G.Water]! - 0.25) * 2.2);
  // a tall body: a long neck, long legs under it, a short deep trunk rather than a long low one
  const tall = sat(0.5 * g[G.Neck]! + (legs ? 0.45 : 0.15) * g[G.LimbLength]! + 0.3 * (1 - g[G.BodyRatio]!) - 0.1);
  const rise = Math.max(0.55, Math.min(1.9, 0.78 + 1.0 * tall + 0.25 * flier - 0.45 * burrower));
  // (the warlike build thick)
  const girth = Math.max(0.7, Math.min(1.5, Math.pow(rise, -0.45) * (1 + 0.3 * burrower) * (0.92 + 0.16 * g[G.Size]!) * (1 + 0.2 * g[G.Aggression]!)));
  // fliers lift their floors on posts; burrowers sink theirs; swimmers stand theirs on short piles over the water
  const lift = flier > 0.4 ? (0.5 + 0.9 * flier) * (1 - burrower) : burrower > 0.25 ? -0.5 * burrower : swimmer > 0.6 ? 0.25 : 0;
  const round = sat(0.3 + 0.55 * burrower + 0.3 * swimmer - 0.35 * tall + 0.15 * (g[G.Segments]! - 0.5));
  // Roofs: a people made for the cold builds steep, to shed snow, and one made for heat builds flat; the showy and
  // the horned add height for its own sake, burrowers and the warlike keep theirs low.
  const pitch = Math.max(0.6, Math.min(2.2, 1.0 + 1.1 * (g[G.ColdTol]! - g[G.HeatTol]!) + 1.1 * g[G.Ornament]! + 0.5 * g[G.Horn]! - 0.5 * burrower - 0.4 * g[G.Aggression]!));
  // Windows: those who see well by day want many; a people of the night wants few.
  const windows = 0.6 + 1.2 * sat(0.45 * g[G.EyeCount]! + 0.45 * g[G.Sight]! + 0.35 * (1 - g[G.Nocturnal]!) - 0.2);
  // Ornament: the showy decorate, and so do the curious; the warlike do not.
  const ornament = sat(0.9 * g[G.Ornament]! + 0.9 * g[G.Curiosity]! - 0.3 * g[G.Aggression]!);
  return {
    tall, flier, burrower, swimmer, rise, girth, lift, wade: sat((swimmer - 0.3) * 1.6), round, pitch, windows, ornament,
    spacing: 1.2 - 0.4 * g[G.Sociality]!, scale: 0.8 + 0.45 * g[G.Size]!,
  };
}

export type Material = 'timber' | 'mud brick' | 'stone' | 'reed' | 'packed snow' | 'coral and shell';

export interface Place {
  /** Mean temperature in degrees. */
  temperature: number;
  /** 0 desert .. 1 soaked. */
  moisture: number;
  /** Tree cover 0..1. */
  canopy: number;
  /** Height above the sea in km. */
  height: number;
  /** On a shore. */
  coast: boolean;
  /** A river runs through (0..1). */
  river: number;
}

/** What the walls are made of in a place, and their colour. A people of the water builds with what the sea gives. */
export function materialOf(place: Place, swimmer = 0): { name: Material; wall: [number, number, number] } {
  if (place.temperature < -3) return { name: 'packed snow', wall: [0.78, 0.84, 0.9] };
  if (swimmer > 0.5 && place.coast && place.temperature > 14) return { name: 'coral and shell', wall: [0.86, 0.72, 0.66] };
  if (place.canopy > 0.35) return { name: 'timber', wall: [0.42, 0.29, 0.18] };
  if (place.moisture < 0.25) return { name: 'mud brick', wall: [0.66, 0.5, 0.33] };
  if (place.height > 1.4 || (place.canopy < 0.12 && place.moisture < 0.5)) return { name: 'stone', wall: [0.52, 0.51, 0.49] };
  if (place.river > 0.35 || place.moisture > 0.7) return { name: 'reed', wall: [0.6, 0.56, 0.3] };
  return { name: 'timber', wall: [0.46, 0.33, 0.2] };
}

/** The way a people builds, in a sentence. */
export function describeArchitecture(a: Architecture, material: Material): string {
  const shape = a.rise > 1.35 ? 'tall and narrow' : a.rise < 0.8 ? 'low and broad' : a.round > 0.6 ? 'round' : 'plain and square';
  const habit = a.lift > 0.6 ? 'on high posts, with no stairs: they fly up' : a.lift > 0.1 ? 'on piles over the water' : a.lift < -0.2 ? 'sunk into the ground, with mounds above and rooms below' : '';
  const water = a.wade > 0.5 ? ' Their towns run out into the shallows, half under the surface.' : '';
  const doors = a.tall > 0.6 ? ' Their doorways are tall.' : '';
  const roofs = a.pitch > 1.5 ? ' Their roofs are steep.' : a.pitch < 0.85 ? ' Their roofs are nearly flat.' : '';
  const look = a.ornament > 0.6 ? ' Every floor is banded in their colour.' : a.windows > 1.4 ? ' Their walls are full of small windows.' : a.windows < 0.85 ? ' Their walls have few windows.' : '';
  const close = a.spacing < 0.95 ? ' They build packed close together.' : a.spacing > 1.1 ? ' They build well apart.' : '';
  return `They build ${shape}${habit ? `, ${habit}` : ''}, in ${material}.${doors}${roofs}${look}${close}${water}`;
}

/** How unlike two ways of building are: 0 the same, about 1 nothing in common. */
export function architectureDistance(a: Architecture, b: Architecture): number {
  return Math.abs(a.rise - b.rise) / 1.35 + Math.abs(a.lift - b.lift) / 1.95 + Math.abs(a.wade - b.wade) * 0.5 + Math.abs(a.round - b.round) * 0.5 + Math.abs(a.girth - b.girth) / 0.8 * 0.3
    + Math.abs(a.pitch - b.pitch) / 1.6 * 0.6 + Math.abs(a.windows - b.windows) / 1.2 * 0.3 + Math.abs(a.ornament - b.ornament) * 0.4 + Math.abs(a.spacing - b.spacing) / 0.4 * 0.3 + Math.abs(a.scale - b.scale) / 0.45 * 0.3;
}
