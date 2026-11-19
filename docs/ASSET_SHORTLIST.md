# Asset shortlist (first pass, 2026-11-20)

Candidate models for the game's fixed objects, picked by **looking at rendered preview sheets**, not by file name. The sheets are in `docs/asset-previews/`; each tile is numbered and labelled with the file name.

- The assets themselves are **not in this repo**. They are on the review Mac under `~/genesis-review/assets/` (about 20 GB so far), with `MANIFEST.md` there listing source page, author and licence for every item.
- Everything on this page is from **Kenney (kenney.nl), CC0**: each pack's own page states "License: Creative Commons CC0". No credit is required. Download from the pack page given.
- All are GLB, flat-shaded, coloured from one shared palette texture per pack (`Textures/colormap.png`). To tint them per world, replace the palette lookup with a tint; the geometry carries no vertex colours.
- Only five of the twelve sheets rendered so far were looked at: nature plants, fantasy town, watercraft, survival, mini forest. Rocks, castle, city, space and graveyard sheets exist but are unreviewed. KayKit packs have no GLB files (other formats), so they are not previewed yet.

## What the game draws now, and what could stand in

Plant forms come from `FORMS` in `src/render/gfx/plantmesh.ts`; buildings from `BUILDINGS` in `src/render/gfx/buildings.ts`.

### Plants (sheet: `kenney-nature-trees.jpg`, pack https://kenney.nl/assets/nature-kit, 16 to 720 triangles each)

| Game form | Candidates (tile numbers) | Fit |
|---|---|---|
| broadleaf | 57 to 59 `tree_default`, 60 to 62 `tree_detailed`, 66 to 68 `tree_oak`, 63 to 65 `tree_fat` | Good. Rounded faceted crowns with real volume, which is exactly what the current flat-disc leaves lack. `tree_oak` has a flared root base. Three colour variants each. |
| conifer | 75 to 96 `tree_pine*` and `tree_cone` 54 to 56 | Good. Stacked-cone pines in tall, short, round and detailed versions; read clearly at distance. |
| umbrella | none | Nothing with a flat layered crown. `tree_detailed` (60) with side clumps is the nearest. |
| palm | 69 to 74 `tree_palm*` | Good. Straight, bent, short and tall versions. |
| bottle | none | No swollen-trunk tree. `tree_fat` (63) is a fat crown, not a fat trunk. |
| fan (coral) | none | Nothing. |
| mushroom | 37 to 42 `mushroom_red*`, `mushroom_tan*` | Good shape for a giant mushroom when scaled up; single, tall and grouped. |
| column | 1, 2 `cactus_short`, `cactus_tall`; 7, 8 bamboo-like `crops` | Usable: cactus with arms, or segmented stalks. |
| shrub | 43 to 50 `plant_bush*`, `plant_flat*` | Good. Low spiky and leafy clumps. |
| fern | 20, 21 `crops` (broad curved leaves), 44 `plant` | Passable; no true frond. |
| tuft (grass) | 33 to 36 `grass`, `grass_large`, `grass_leafs` | Good. |
| flower | 24 to 32 `flower_purple/red/yellow A to C` | Good. Three shapes, three colours. |

Also useful from the same pack: crops and tilled-earth rows (3 to 19) for the farms that settlements already record (`farms: true`) but do not show.

A second, chunkier style: `kenney-mini-forest.jpg` (https://kenney.nl/assets/mini-forest): two pines (19, 20), basalt-column rock stacks (13 to 15), a tent (18), a rope bridge (1), grass and dirt patches (9, 10).

### Buildings and settlements

| Game kind | Candidates | Sheet, pack | Fit |
|---|---|---|---|
| hut | 57 to 59 `tent-canvas-half`, `tent-canvas`, `tent`; 48, 55, 56 `structure-canvas`, `structure-roof`, `structure`; mini-forest 18 `tent`, 3 `building-roof` | `kenney-survival.jpg`, https://kenney.nl/assets/survival-kit | Good for camps and earliest villages: A-frame tents and pole shelters. |
| house, hall | Roof pieces 56 to 77 (gabled, high, pointed, with windows) | `kenney-fantasy-town.jpg`, https://kenney.nl/assets/fantasy-town-kit | **Pieces, not buildings.** The pack is modular: roofs on the sheet, and the rest of its 167 files come after tile 96 alphabetically (walls, by name; not rendered or looked at). A house must be assembled from a wall block and a roof. `roof-high-point` (69) and `roof-point` (74) are complete roofs that sit on a box. |
| tower, dome, spire, temple | not reviewed | castle, city-commercial, space sheets | Unreviewed. |
| boat | 9, 10 `boat-row-large`, `boat-row-small` (early); 11, 12 `boat-sail-a/b`; 42, 46 `ship-large`, `ship-small` (sailing ships); 4 `boat-fishing-small`; 39 to 41 `ship-cargo-a/b/c`; 43, 44 `ship-ocean-liner*` (modern) | `kenney-watercraft.jpg`, https://kenney.nl/assets/watercraft-kit, 40 to 2,796 triangles | Very good, and covers every era from rowing boat to liner. No boats were identified in any review capture, so this is a clear gap these fill. |

Settlement dressing that the reviews found missing (bare ground between buildings, no hearths, no paths):

- **Hearths:** survival 14 `campfire-pit`, 15 `campfire-stand`, 13 `campfire-fishing-stand`.
- **Fences and plots:** survival 17 to 19; fantasy town 11 to 14.
- **Paths and paving:** fantasy town 40 to 48 `road-*` tiles (flat grey slabs with curbs).
- **Market and street:** fantasy town 92, 93 `stall-green`, `stall-red`; 6, 7 carts; 31 `lantern`; 21 to 24 fountains; 3, 4 banners.
- **Work:** survival 78 to 80 anvil, grindstone and workbench; 60 to 69 tools; 34 to 37 stacked planks, stone and wood.
- **Harbour:** watercraft 37, 38 `ramp` (jetty), 28, 29 buoys, 30 to 32 cargo containers (modern).
- **Rocks:** survival 38 to 45 (grey and sand-coloured), fantasy town 49 to 51.

## Caveats

- These are bright, toy-like and Earth-coloured. The game's worlds have their own pigments (the review world is violet), so they need the tint treatment above or they will clash.
- Scale is arbitrary per pack; heights in model units are in the `.json` beside each sheet on the Mac.
- A fixed mesh cannot vary by species the way the generated plants do. A sensible use is as the *shape* for a form, still tinted and scaled per species.
- Nothing here has been tried in the game.

## Sounds

`src/audio/music.ts` has `ambience(...)` and `thunder(...)`, both synthesised. Twenty generated loops (wind in three strengths, rain, shore waves, thunder, river, fire, lava, insects, birdsong, cave, underwater, earthquake, a music pad) are on the Mac in `assets/generated/ambience/` with the script that makes them (`tool/gen-ambience.mjs`), plus public-domain field recordings from the Internet Archive. **None has been listened to.**
