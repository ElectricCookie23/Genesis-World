// Which made model stands in for which thing the game draws (the asset pass).
//
// Each role lists candidate files under `assets/`, best first; the first one that is there is used, and if none is,
// the game draws the shape it generates itself. So this table can name files that have not been added yet.
// Sources and licences of every file are in `public/assets/MANIFEST.json` and CREDITS.md (all CC0).
// Left out on purpose, by the owner's rules: anything that looks like a person, anything religious, and statues of
// Earth animals.
import type { Form } from './plantmesh';

/** Plants: the model gives the form, the species gives the colour (see `plantFromModel`). */
export const PLANT_MODELS: Partial<Record<Form, string[]>> = {
  broadleaf: ['kenney/nature-kit/tree_oak.glb', 'kenney/nature-kit/tree_detailed.glb', 'kenney/nature-kit/tree_default.glb'],
  conifer: ['kenney/nature-kit/tree_pineTallA.glb', 'kenney/nature-kit/tree_pineDefaultA.glb', 'kenney/nature-kit/tree_cone.glb'],
  palm: ['kenney/nature-kit/tree_palmTall.glb', 'kenney/nature-kit/tree_palm.glb'],
  mushroom: ['kenney/nature-kit/mushroom_redTall.glb', 'kenney/nature-kit/mushroom_red.glb'],
  column: ['kenney/nature-kit/cactus_tall.glb'],
  shrub: ['kenney/nature-kit/plant_bushLarge.glb', 'kenney/nature-kit/plant_bush.glb'],
};
