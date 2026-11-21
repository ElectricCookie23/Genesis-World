// Which made model stands in for which thing the game draws (the asset pass).
//
// Each role lists candidates, best first; the first one whose file has been added is used, and if none has, the
// game draws the shape it generates itself. Sources, authors and licences of every file are in
// `public/assets/MANIFEST.json` and CREDITS.md (all CC0).
// Left out on purpose, by the owner's rules: anything that looks like a person, anything religious, and statues of
// Earth animals.
import type { Form } from './plantmesh';
import type { Prop } from './props';

export interface PlantModel {
  file: string;
  /** Which of the model's colours are wood (kept as painted); the rest is foliage, tinted by the species. */
  wood?: 'brown' | 'purple' | 'dark' | 'none';
  /** `bulb` makes the foliage glowing globes in the species' second colour. */
  foliage?: 'mass' | 'bulb';
}

/**
 * Plants: the model gives the form, the species gives the colour (see `plantFromModel`). Chosen by eye from the
 * Mac's preview sheets and then in the game: fuller models first, since the owner finds the faceted ones too plain.
 */
export const PLANT_MODELS: Partial<Record<Form, PlantModel[]>> = {
  broadleaf: [{ file: 'polypizza/pp-trees-28-Tree.glb' }, { file: 'kenney/nature-kit/tree_oak.glb' }, { file: 'kenney/nature-kit/tree_detailed.glb' }],
  conifer: [{ file: 'polypizza/pp-pine-palm-9-Pine_Tree.glb' }, { file: 'kenney/nature-kit/tree_pineTallA_detailed.glb' }, { file: 'kenney/nature-kit/tree_pineTallA.glb' }],
  umbrella: [{ file: 'polypizza/pp-trees-16-Tree.glb' }],
  // (the leaning palm has a third of the triangles of the others and the better outline)
  palm: [{ file: 'polypizza/pp-pine-palm-5-Palm_Tree.glb' }, { file: 'polypizza/pp-pine-palm-4-Palm_Tree.glb' }, { file: 'kenney/nature-kit/tree_palmDetailedTall.glb' }],
  // no bottle tree was found; the curling stem with globes of light is the strangest tree collected, and this is the form for strange trees
  bottle: [{ file: 'polypizza/pp-trees-21-Tree_Light.glb', wood: 'purple', foliage: 'bulb' }],
  mushroom: [{ file: 'polypizza/pp-coral-kelp-mushroom-7-Mushroom.glb' }, { file: 'polypizza/pp-coral-kelp-mushroom-14-Mushroom.glb' }, { file: 'kenney/nature-kit/mushroom_redTall.glb' }],
  column: [{ file: 'kenney/nature-kit/cactus_tall.glb' }],
  shrub: [{ file: 'kenney/nature-kit/plant_bushLarge.glb' }, { file: 'kenney/nature-kit/plant_bushDetailed.glb' }],
  fern: [{ file: 'polypizza/pp-coral-kelp-mushroom-4-Fern.glb' }],
};

/**
 * Things drawn just as their makers painted them (see `props.ts`): a camp's fire and tents, crops and a mill by a
 * farming town, boats off a town on the coast, a wreck off a dead port, rocks, a stone pillar, old bones.
 *
 * Not used, on purpose: the long bones and the ribcage in the collected set (they read as a person's), the skulls,
 * skeletons, coffin and gravestones, the statue of a head, and the spacecraft (nothing in the game flies them yet).
 * The houses, towers and city blocks are left for the buildings layer, where each people's way of building decides
 * the shape of a house; see HANDOFF.md.
 */
export const PROP_MODELS: Record<Prop, string[]> = {
  fire: ['kenney/nature-kit/campfire_stones.glb', 'kenney/survival-kit/campfire-pit.glb'],
  tent: ['kenney/nature-kit/tent_detailedOpen.glb', 'kenney/survival-kit/tent-canvas.glb'],
  tentSmall: ['kenney/nature-kit/tent_smallOpen.glb', 'kenney/survival-kit/tent.glb'],
  cropLeaf: ['kenney/nature-kit/crops_leafsStageB.glb'],
  cropGrain: ['kenney/nature-kit/crops_wheatStageB.glb'],
  mill: ['kenney/fantasy-town-kit/windmill.glb'],
  rowboat: ['polypizza/pp-boats-3-Boat.glb', 'kenney/watercraft-kit/boat-row-small.glb'],
  sailboat: ['polypizza/pp-boats-10-Sail_Boat.glb', 'kenney/watercraft-kit/boat-sail-a.glb'],
  ship: ['polypizza/pp-boats-11-Sail_Ship.glb', 'polypizza/pp-boats-13-Small_Ship.glb'],
  steamer: ['kenney/watercraft-kit/ship-cargo-a.glb', 'polypizza/pp-boats-21-Cruise_Ship.glb'],
  wreck: ['polypizza/pp-boats-22-Ship_Wreck.glb'],
  rockA: ['polypizza/pp-rocks-bones-10-Rock.glb', 'kenney/nature-kit/rock_largeA.glb'],
  rockB: ['polypizza/pp-rocks-bones-16-Rock.glb', 'kenney/nature-kit/rock_largeC.glb'],
  rockC: ['polypizza/pp-rocks-bones-21-Rock.glb', 'kenney/nature-kit/rock_tallB.glb'],
  rockD: ['polypizza/pp-rocks-bones-12-Rock_Medium.glb', 'kenney/nature-kit/rock_smallFlatA.glb'],
  spire: ['polypizza/pp-rocks-bones-20-Rock_Formation.glb', 'kenney/nature-kit/rock_tallA.glb'],
  bones: ['polypizza/pp-rocks-bones-8-Large_Bone.glb'],
};
