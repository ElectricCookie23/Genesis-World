// Stories told about old bones (system E28). People who dig (for ore, for a canal, for a well) find the bones
// of animals that died out long before there were people. They explain them as well as they can: a people of
// giants, a beast from the sea found on a hilltop, the grandmothers of the herd. The story is wrong about what
// the animal was and right that it was real: every story is about one actual species in the tree of life.
// Ages later, a people that has learned anatomy lays the bones out in order and says what the animal was.
//
// (The game has no religion, by the owner's decision: these are stories that explain, not faiths.)
import { G, sizeMetres } from '../genetics';
import { hash32 } from './hash';

export const LEGEND_KINDS = ['giant', 'sea-beast', 'sky-beast', 'horned', 'many-legged', 'old-kin'] as const;
export type LegendKind = (typeof LEGEND_KINDS)[number];

/** A story about bones, as the history keeps it. */
export interface Legend {
  id: number;
  year: number;
  nation: number;
  settlement: number;
  /** The species whose bones they are: extinct, and in the tree of life. */
  species: number;
  kind: LegendKind;
  /** What the story calls the creature, in the tellers' tongue, and what that means. */
  own: string; means: string;
  /** Where the bones turned up, and the story told about them. */
  found: string;
  tale: string;
  eventId: number;
  /** Once someone has worked out what the animal really was: when, by which country, in what words, and the event. */
  known?: { year: number; nation: number; text: string; eventId: number };
}

/** What kind of story a creature's bones give rise to: by what is most striking about the skeleton. */
export function legendKind(g: ArrayLike<number>): LegendKind {
  const limb = g[G.LimbType]!;
  if (g[G.Water]! > 0.6 || (limb >= 0.25 && limb < 0.5)) return 'sea-beast';
  if (limb >= 0.75) return 'sky-beast';
  if (g[G.Size]! > 0.68) return 'giant';
  if (g[G.Horn]! > 0.6) return 'horned';
  if (g[G.LimbPairs]! > 0.7 || g[G.Segments]! > 0.75) return 'many-legged';
  return 'old-kin';
}

/** What a story may call its creature: for each kind, a few names, each two meanings (for the tellers' tongue) and plain words. */
const NAMES: Record<LegendKind, [string, string, string][]> = {
  giant: [['great', 'old', 'the Old Great Ones'], ['hill', 'great', 'the Hill Makers'], ['stone', 'great', 'the Heavy Ones'], ['land', 'old', 'the First Walkers']],
  'sea-beast': [['sea', 'old', 'the Old Ones of the Sea'], ['salt', 'herd', 'the Salt Herd'], ['river', 'great', 'the River Climbers'], ['sea', 'stone', 'the Stone Swimmers']],
  'sky-beast': [['wind', 'great', 'the Great Ones of the Wind'], ['star', 'herd', 'the Herd of the Sky'], ['wind', 'old', 'the Old Fliers']],
  horned: [['stone', 'herd', 'the Stone Herd'], ['hill', 'herd', 'the Horned Ones of the Hill'], ['red', 'herd', 'the Red Herd']],
  'many-legged': [['long', 'herd', 'the Long Herd'], ['long', 'old', 'the Long Old Ones'], ['stone', 'long', 'the Stone Walkers']],
  'old-kin': [['old', 'herd', 'the Old Herd'], ['herd', 'mother', 'the Mothers of the Herd'], ['old', 'child', 'the Old Children']],
};

/** The two meanings the creature's name is built from, and the name in plain words: `pick` chooses among those its kind allows. */
export function legendName(kind: LegendKind, pick = 0): [string, string, string] {
  const list = NAMES[kind];
  return list[((pick % list.length) + list.length) % list.length]!;
}

/** How long the animal was, in words a digger would use. */
function span(g: ArrayLike<number>): string {
  const m = sizeMetres(g[G.Size]!) * (1 + g[G.Neck]! * 0.5 + g[G.Tail]! * 0.5);
  return m >= 12 ? 'longer than a hall' : m >= 5 ? 'as long as a boat' : m >= 2 ? 'longer than anyone is tall' : m >= 0.6 ? 'the size of a child' : 'small enough to hold';
}

/**
 * The story a people tells about the bones: what they found, what they take it for, and the detail they get wrong.
 * `seed` picks among tellings; `where` is the place of the find ("the mine at X").
 */
export function tale(kind: LegendKind, g: ArrayLike<number>, own: string, means: string, where: string, seed: number): string {
  const pick = <T>(list: T[], k: number): T => list[hash32(seed, k, 0x1e9) % list.length]!;
  const long = span(g);
  const open = pick([`Digging at ${where}, they come on bones ${long}, turned to stone.`, `The diggers at ${where} break into a bed of bones ${long}, heavy as rock.`, `At ${where} the ground gives up bones ${long}, and no one alive has seen the animal they belong to.`], 1);
  const body = kind === 'giant'
    ? pick([`They are taken for the bones of ${own}, ${means}, a people too large for houses, who are said to have piled up the hills for somewhere to sit and to have been too heavy to outlast one hard winter.`, `The story is that ${own}, ${means}, walked here before anyone, and that a river runs wherever one of them dragged a foot. A thigh bone is stood up in the square and children are measured against it.`], 2)
    : kind === 'sea-beast'
      ? pick([`They are plainly a swimmer's, and the sea is days away. So the story is that ${own}, ${means}, came up the rivers in a year when the sea stood higher than the hills, and were left behind when it went home.`, `Fins, and a tail like an oar. They are called ${own}, ${means}, and it is said the sea once covered this country, which, as it happens, is true.`], 2)
      : kind === 'sky-beast'
        ? pick([`The long thin bones of the arm are taken for a wing, rightly. The story makes ${own}, ${means}, large enough to carry off a herd animal, which the bones do not say.`, `They are called ${own}, ${means}, and are said to have nested on the mountain and to come back in storms. The hollow bones are prized for flutes.`], 2)
        : kind === 'horned'
          ? pick([`A skull with a horn core as long as an arm. They are ${own}, ${means}: animals of stone that the first herders are said to have tried to tame and could not.`, `The horn is taken for a tooth and the animal stood on its head in every drawing made of it. It is called one of ${own}, ${means}.`], 2)
          : kind === 'many-legged'
            ? pick([`There are more legs than anyone can make sense of, and the bones of three animals are put together as one. The story is of ${own}, ${means}, which walked in a line head to tail and never turned round.`, `A back of a hundred joints. They are called ${own}, ${means}, and are said to have dug the caves.`], 2)
            : pick([`They are very like the bones of the animals in the fields, and not the same. So the story is that these are ${own}, ${means}: the grandmothers of everything now alive, turned to stone so as not to be forgotten.`, `Nobody thinks them strange until the teeth are counted. They are called ${own}, ${means}, and herders say their own animals came down from them, which is nearer the truth than they know.`], 2);
  return `${open} ${body}`;
}

/** What the animal really was, in the plain words of someone who has laid its bones out in order. */
export function trueAnimal(g: ArrayLike<number>): string {
  const limb = g[G.LimbType]!, pairs = 1 + Math.round(g[G.LimbPairs]! * 2);
  const moved = limb < 0.25 ? 'a limbless crawler' : limb < 0.5 ? 'a swimmer with fins' : limb < 0.75 ? `a walker on ${pairs * 2} legs` : `a flier with ${pairs > 1 ? 'two pairs of wings' : 'one pair of wings'}`;
  const m = sizeMetres(g[G.Size]!);
  const size = m >= 1 ? `about ${Math.round(m)} ${Math.round(m) === 1 ? 'metre' : 'metres'} long` : `about ${Math.max(1, Math.round(m * 100))} centimetres long`;
  const ate = g[G.Diet]! < 0.35 ? 'that ate plants' : g[G.Diet]! > 0.65 ? 'that ate other animals' : 'that ate whatever there was';
  const extra = g[G.Horn]! > 0.6 ? ', with a horn' : g[G.Armor]! > 0.6 ? ', armoured' : g[G.Neck]! > 0.7 ? ', long in the neck' : '';
  return `${moved}, ${size}${extra}, ${ate}`;
}
