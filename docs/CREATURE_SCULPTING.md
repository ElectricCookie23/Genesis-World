# Making every generated animal look sculpted

Written 2026-11-21 by the Mac GPU session at the owner's request ("newly made species ... weird tubular, just bubbles and circles shaped bodies. how can we make them into properly sculpted animals every time?"). Proposals only: nothing here has been built or tested, and nothing under `src/` was changed. It is based on reading `src/render/gfx/creaturemesh.ts` and on the close-ups in `docs/GPU_REVIEW.md`.

## Why they look like tubes and bubbles today

The builder is better than "parts stuck together": the body is one skin lofted along a spine from tail to snout. The tube-and-bubble look comes from five specific choices in that file:

| What the code does | Where | What it looks like |
|---|---|---|
| Every cross-section of the body is an ellipse (`cos`, `sin` times `ry`, `rz`), with the belly flattened by 8%. 12 points around. | the loft loop, `const M = 12` | A sausage: no ribcage, no shoulders or hips, no spine ridge, no belly sag. |
| Body thickness along the spine is one smooth bump: `0.72 + 0.28 * sin(u * PI)`. | `taper` | A bean. Real animals are deep at the chest, narrow at the waist, wide at the hips. |
| The head is an egg: the same loft with one sine-based profile. No jaw, muzzle, brow, cheek, ear or eye socket. | "head: an egg" | A ball or bulb on the end of the neck. Eyes are spheres stuck on the surface. |
| Each leg is a separate straight tube of 6 rings with a mild thigh bulge, starting inside the body at a fixed height, ending in a squashed ball for a foot. | `m.tube(path, radii, 6, ...)`, `m.ball(...)` | Pipes pushed into a sausage. No shoulder or haunch muscle joining leg to body, no knee, hock, toes or hoof. |
| Fins, wings, sails and plates are separate thin pieces placed on the skin. | fins, wings, armour, ornament | Cards attached to the body. |

So the fix is not "more triangles". It is **anatomy in the profile, masses where limbs join, and a real head**, and the performance measurements say there is room: all animals in view cost 0.06 to 0.35 ms even at 553,000 triangles (`docs/PERFORMANCE.md`).

## The plan, cheapest first

Each step is independent and each one alone makes a visible difference. All of it runs once when a species is created, never per frame.

### 1. Give the skin an anatomical profile (small change, large effect)

Keep the lofted spine, but stop using plain ellipses.

- **Section shape per station.** Replace the ellipse with a profile that has separate controls for the back, the flank and the belly, for example a superellipse whose exponent and half-widths differ above and below the midline. A deep-chested runner gets a narrow keel-shaped chest; a grazer a round barrel; a swimmer a tall thin section; a crawler a wide flat one. Use 20 to 24 points around instead of 12.
- **Landmarks along the spine instead of one bump.** Drive depth and width from named stations: neck base, withers (shoulder top), deepest chest, waist, hip, tail root. Each is a number or two derived from existing genes (size, diet, limb type, limb length, water). A predator gets a deep chest and tucked waist, a herbivore a big gut, a burrower a uniform cylinder. Interpolate between landmarks with a smooth spline.
- **A spine line and a belly line.** Raise a low ridge along the back and let the belly sag slightly between the legs. This alone breaks the sausage silhouette.
- More stations: 24 to 32 along the torso instead of 12.

### 2. Join the limbs to the body with muscle (the biggest single improvement)

- **Shoulder and haunch masses.** Where each leg leaves the body, add a rounded mass to the body's own profile (bulge the sections near the limb station outward and down on that side) so the leg grows out of a shoulder instead of poking out of a tube.
- **Blend the joint.** Build the top of the leg and the nearby body skin as one surface. Two workable ways:
  - *Implicit blend (recommended):* describe body, shoulder masses and upper legs as rounded shapes, combine them with a smooth union, and extract one mesh from the result (marching cubes or dual contouring on a small grid, around 48 to 64 cells along the body). Smooth unions give the fleshy web at an armpit or groin for free. Do it once per species and cache it.
  - *Stitch:* cut a hole in the body loft where the leg meets it and bridge the two rings with a fillet. More fiddly, no grid needed.
- **Leg profiles with joints.** Thigh thick at the top and tapering, a distinct knee, a thin shin, a hock or ankle, then the foot. Different templates by posture: pillar legs for giants, slender spring legs for runners, sprawled short legs for crawlers. The current radius curve has one mild bump.
- **Real feet.** A small set by lifestyle: hoof, paw with toes, clawed three-toed foot, webbed foot, sucker pad. Choose from genes.

### 3. A head that is a head

The head carries most of an animal's character and is currently the weakest part.

- **Build it from a skull plan, not an egg:** a braincase, a muzzle or beak whose length and depth come from diet and size, a lower jaw as its own shape with a visible mouth line, brow ridges over **eye sockets** so eyes sit in the head instead of on it, cheeks or jaw muscle for meat-eaters.
- **Add the small things that read as life:** ears or ear holes, nostrils, crests, frills, whiskers, a dewlap. Each can be a gene-driven option.
- Heads are small, so spend triangles here: a few thousand is nothing.
- If the implicit blend from step 2 is used, the head can be part of the same blended surface, which also fixes the neck-to-head join.

### 4. A library of hand-made parts that morph (the method Spore used)

Purely procedural shapes plateau. The proven way to get sculpted quality from generated creatures is a **small library of hand-modelled parts with built-in variation**, attached to a generated body: Spore's creature creator did exactly this (a generated spine and skin, plus parts such as mouths, eyes, feet and hands that an artist sculpted once, each with a few morph sliders).

- Model perhaps 6 heads, 6 feet, 4 hands or claws, 4 mouths, 6 horn and crest shapes, 4 tail ends. Each has 2 to 4 morph targets (longer, heavier, sharper).
- Genes pick the part and set the morph weights; the part is scaled, tinted and blended onto the generated body.
- This keeps evolution meaningful (genes still decide everything) while every part is something a person shaped.
- The parts could be made in a modelling tool, or adapted from CC0 models already collected (see `docs/ASSET_SHORTLIST.md`), since only shapes are needed.

### 5. Surface detail that follows the body

- **Bake soft shadowing into the vertices at build time** (under the belly, between the legs, under the jaw, inside ears). It costs nothing at run time and is the cheapest way to make a model look solid.
- **Relief from a shader, not geometry:** scales, wrinkles at joints, muscle definition and feather rows as a normal or bump pattern laid out in body coordinates (the skin already carries a uv along the spine and around it).
- **Colour that follows anatomy:** darker back and paler belly, stripes that follow the ribs and spine, spots sized to the body, darker feet and muzzle, a different colour inside the mouth and ears.
- **Fur and feathers with direction:** flow from head to tail and down the legs, longer on the neck and tail, drawn as shells only for nearby animals.

### 6. Make it right every time: rules, then tests

"Every time" needs guard rails, because random genes will otherwise produce nonsense.

- **Proportion rules (allometry).** Leg thickness grows faster than body length as animals get bigger; heads get relatively smaller; necks cannot be longer than the legs can balance. Clamp gene-derived dimensions through these rules before building.
- **Balance.** Compute the centre of mass from the built shape and place the feet under it; shift the tail or neck if it falls outside the feet.
- **Posture templates.** Pick one of a few whole-body poses first (erect four-legged, sprawling, two-legged with a counter-balancing tail, bird-like, serpentine, fish-like), then vary within it. Most ugly results come from a mix of features that no posture supports.
- **No intersections.** After building, check that limbs, horns and plates do not pass through the body or each other; nudge or drop the offender.
- **An automatic species sheet.** Generate a few hundred random genomes, build each, and render them on a grid from two angles. Anything ugly is visible at a glance, and the sheet becomes the regression test for every change above. The Mac GPU session can produce these sheets from the live site on request.

## Suggested order

1. Species sheet first, so there is a baseline picture of what random genomes look like today.
2. Step 1 (profiles and landmarks) and the baked soft shadowing from step 5: small, safe, visible.
3. Step 2 with the implicit blend, then step 3 (heads) on the same surface.
4. Step 6 rules as the failures show up on the sheet.
5. Step 4 (part library) once the generated base is good; it is the step that needs art.

## Cost

- Build time: an implicit blend at 64 cells along the body is a few milliseconds per species; species appear rarely.
- Run time: a blended animal of 5,000 to 15,000 triangles, against 1,000 to 4,400 today. At the measured cost of animals this stays far below a millisecond per frame for hundreds on screen. Far animals should keep a simpler mesh.
- Animation: the shader poses legs, tail, wings and head from per-vertex weights. A blended mesh needs those weights assigned from distance to each limb's axis, with smooth falloff across the joint; that is also what will stop joints from creasing.
