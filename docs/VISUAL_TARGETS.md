# Visual targets (concept art, batch 1)

Sixteen concept images the owner generated with Midjourney on 2026-11-21 from prompts written by the Mac GPU session, to show what "sculpted" and "grounded" should mean for this game. They are **direction, not assets**: nothing here goes into the game, and they are more detailed and more realistic than the game should try to be. Images are in `docs/concepts/` (reduced to 1400 px); `contact-sheet.jpg` shows all sixteen.

They were judged from the contact sheet at thumbnail size, not one by one at full size.

The prompts asked for "smooth stylised 3D game models". Midjourney leaned realistic anyway, so read these for **shape, proportion and layout**, and ignore surface detail.

## Animals: what to take

| Image | What it shows that the game lacks (see `docs/CREATURE_SCULPTING.md`) |
|---|---|
| `01-grazer-a.jpg` | A four-legged body with a deep chest, a tucked waist and a clear hip. Legs leave the body through visible shoulder and haunch muscle, with a knee, a hock and a hoof. Three views. This is the single best reference for the body profile and the leg joins. |
| `02-runner-a.jpg` | A two-legged runner balanced by a long tail: heavy thigh, thin shin, three-toed foot, small forelimbs, head carried forward on a curved neck. The game's two-legged animals already have this posture; this shows the proportions to aim for (thigh several times thicker than shin, tail as long as the body). |
| `03-heads-a.jpg` | **Twelve heads, each a different skull**: long muzzles, beaks, wide jaws, crests and horns, with eyes set in sockets under brow ridges and a mouth line. The game's heads are currently cups or balls. A small library like this, with morphs, is step 4 of the sculpting proposal. |
| `04-armoured-a.jpg` | Armour as overlapping plates that follow the curve of the back and vary in size, with spikes growing from the plates, on pillar legs. The game draws a row of identical triangles. |
| `05-glider-a.jpg` | A gliding membrane as a stretched skin between limbs, shown spread in flight and folded when standing. The game draws a flat rectangle hanging under the body. |
| `06-sea-animal-a.jpg` | A swimmer with a tapered body, fins with visible rays, a dorsal crest and a row of glowing spots along the flank. The glow reads clearly against dark water, which the game's glowing sea animal did not. |
| `07-feet-a.jpg` | Nine lower legs and feet: hoof, paw, clawed and broad pillar feet, each with an ankle. The game has one foot pad. |

## Settlements: what to take

| Image | What it shows |
|---|---|
| `08-camp-a.jpg` | Eight domed huts in a rough ring on **bare trodden earth**, a fire near the middle, paths worn between huts, vegetation only at the edge. The game scatters huts at random on wild grass. |
| `09-farming-village-a.jpg` | Thatched houses in rows along a dirt lane, with **fenced plots and crop rows** beside them. Settlements already record `farms: true` and show nothing. |
| `10-market-town-a.jpg` | A walled town on a headland: houses packed along streets, one tall spire as the landmark, a harbour with boats. Note how density and a single tall building make it read as a town from far away; the game's towns read as scattered pins. |
| `11-industrial-city-a.jpg` | Chimneys with smoke, long factory sheds, an iron bridge, ships at a dock. Smoke and a river do most of the work. |
| `12-future-city-a.jpg` | Slender towers and large domes on the water, with landing pads. Close to what the game's dome and spire buildings are reaching for. |
| `13-town-night-a.jpg` | **Night lighting done by many small warm windows and lamps**, reflected in the harbour, under an aurora and two moons, with the ground itself dark. This is the target for the night-town findings: points of light, no lit ground patches. |

## Plants and the planet

| Image | What it shows |
|---|---|
| `14-plant-forms-a.jpg` | The game's twelve plant forms in one consistent style with **real volume in the crowns**: rounded broadleaf, conifer, flat umbrella tree, palm, bottle trunk, branching fan, giant mushroom, columns, shrub, fern, grass tuft, flower. In violet and teal, like the test world. The most directly useful image for `src/render/gfx/plantmesh.ts`. |
| `15-forest-interior-a.jpg` | Inside a broadleaf forest: thick tapered trunks with flared roots, a layered canopy with light coming through the leaves, shade on the ground. Three things the game's forests lack: translucent leaves, shadows, and ground cover. |
| `16-planet-orbit-a.jpg` | The planet from orbit with cloud that has depth and shadow, a thin bright atmosphere at the limb, and two small moons. A fair target for the orbit view's exposure and cloud shading. |

## Cautions

- These are Earth-like in places (the grazer is close to a deer or greyhound, the armoured animal to an ankylosaur, the market town to medieval Europe). The game's animals come from genes and its cultures are invented, so copy the structure, not the species or the architecture.
- The detail level is far beyond what the game should draw in the thousands. The lesson is silhouette and proportion.
- One image per prompt was chosen by the owner; other variants were not kept.
