# Handoff

Read this first when resuming. Then PROGRESS.md, DECISIONS.md and `git log`.

## Standing instructions from the owner
- Work autonomously; the owner is away and has said yes to all decisions. Never wait for approval between steps.
- Commit and push to `origin main` after every working step. Plain commit messages: no Co-Authored-By line, no session link.
- Keep this file and PROGRESS.md current in the same commits. Log choices in DECISIONS.md.
- Stop and show the owner only at points that are worth showing.
- Graphics rules (owner): full techniques on WebGL2 (FFT ocean, GPU erosion, TAA with a history buffer), quadtree LOD terrain, WebGPU optional, screenshots here check correctness only, push every step.

## Where the "simplified" pass stands (work queue item 3, in progress)
Done so far in this pass: leg IK (11), temples (46), eclipse shadow (96), tornado and fire tornado funnels (113, 114), boats (123), borders (124), satellites (125), hurricane eye (60). Towns are now drawn up close as buildings (`gfx/buildings.ts`: huts, houses, halls, towers, domes, spires by technology, windows lit at night in the nation's colour).

Also done in this pass: drifting plates (51, 52, 54; `sim/tectonics.ts`, all 11 tests pass and a 300 My history still fills with life), GIF export (149), PDF history book (150), sketch cards in the field guide (84; not yet looked at in a browser).

Still to do, nothing started: rising light at departure (127), worn migration trails that roads follow (49, 63), hibernation (64), young beside nests (67), symbiosis and pollinators with real effects (69, 70), electric arcs (77), see-through fossil view (83), timeline strip with more rewind points (86), genetic diversity and oxygen overlays (90), positional sound (94), double shadows under two suns (105), cave mouths (109), hot spring pools (111), dust fertilising the sea (115), fog, rainbows and heat shimmer (117), fungal network view (128), mass hatching glow (135), better bone graveyards (136), two futures side by side (143), real ancestry in the family tree (144), canyon and delta erosion (55), atolls (58). Notes to bring up to date only: 49 (roads follow valleys, rivers, coasts), 132 to 134, 139.

Known small artifact: with the camera exactly over longitude 0 two short bright ticks appear above and below the centre of the planet from orbit. Not traced yet.

A card "Review Genesis live site on a real GPU" was left in the owner's desktop app. If they run it, its findings arrive as `docs/GPU_REVIEW.md` and `docs/screenshots/gpu/` on main: pull and tune from them.

## Work queue, in the owner's order
1. Original brief: built (every feature in PROGRESS.md is done or simplified).
2. **Graphics overhaul** (`docs/GRAPHICS_BRIEF.md`): all twelve steps have a first pass, see the table at the top of PROGRESS.md. What is still open is listed below under "Graphics: still open".
3. **Then complete every item marked "simplified" in PROGRESS.md.**
4. **Then the expansion brief** `docs/EXPANSION_BRIEF.md` (100 new systems: architecture additions first, then sections 1 to 10 in order, each writing to the cause graph, deterministic, with a mobile fallback and at least one headless test).

## The renderer now (src/render)
Everything reads the planet from cube-map textures baked from the simulation's cells on the main thread.
- `gfx/cubebake.ts`, `gfx/planetdata.ts`: the bake (height and climate, cover, life, extra, overlay). `gfx/civmap.ts` adds nation light colour, city glow, borders, war and plague.
- `gfx/quadsphere.ts`: chunked cube-sphere quadtree (instanced patches with skirts). Used by `gfx/terrain.ts` (ground) and `gfx/ocean.ts` (sea).
- `gfx/erosion.ts`: pipe-model hydraulic erosion in ping-pong targets, baked at load, used as triplanar detail at three scales. `gfx/ground.ts` repeats the terrain height on the CPU (reads the bake back) for animals and the camera; `groundRadiusNode` in `terrain.ts` is the same function for vertex shaders (plants, grass, creature feet).
- `gfx/linefield.ts`: thin lines as a vector distance field in a cube map. `gfx/rivermap.ts` (rivers), roads and sea lanes in `gfx/civmap.ts`.
- `gfx/fft.ts`: Tessendorf FFT, three cascades, butterfly passes. Verified against a CPU sum (scratch test, not in the repo's test suite).
- `gfx/volclouds.ts`: ray-marched clouds, cyclones, ash and smoke plumes, cloud shadows. `gfx/aurora.ts`: ray-marched curtains. `atmosphere.ts`: scattering, sky, moon, sibling planets.
- `gfx/nations.ts`: nations derived from settlements (names, colours, emblems, territory, roads). UI: Night Map overlay ("nations"), labels, Peoples panel.
- `gfx/plantmesh.ts`, `gfx/flora.ts`: plant models, imposter atlas baked at load, grass ring.
- `gfx/creaturemesh.ts`, `gfx/creatureskin.ts`: creature bodies and the shared skin material (leg IK, fur shells). `creatures.ts` still holds behaviour and placement.
- `gfx/weather.ts` (rain and snow), `gfx/satellites.ts`, `effects.ts` (particles, dust disc), `postfx.ts` (GTAO, TAA, auto exposure, bloom, AgX, sharpen, fringe, grain).
- `scene.ts`: `PRESETS` (Low, Medium, High, Ultra), `presetForBuild` (sizes fixed at load) and `presetLive`.
- Old modules no longer drawn but still imported in places: `planet.ts` (kept for the flat map colours and overlays), `ocean.ts`, `vegetation.ts`, `rivers.ts`, `aurora.ts`, most of `clouds.ts`. Safe to delete once nothing imports them.

## Graphics: still open
- Nothing has been seen on a real GPU. Frame rate, shader compile time and final look are unverified. The owner checks the deployed site; expect tuning of colours, exposure, cloud density, city light brightness and preset costs after that.
- Not built: screen-space reflections on water, parallax occlusion mapping, footprints, lens flare, ground fog, canopy texture on far terrain, glow cast on the ground by glowing plants, a WebGPU compute path (WebGL2-style passes run on both backends instead).
- The eight "after" screenshots are in `docs/screenshots/after/` (software rendering, 800x500).
- GitHub Pages is on (repo public, source GitHub Actions): every push to main deploys to https://electriccookie23.github.io/Genesis-World/ after the tests pass (about six minutes).

## How to check visuals here
- `npm run dev`, open `/?seed=amber-reef-101&skip&fresh`. Dev switches: `&dsize=128&esize=128&eiter=60` shrink the bake for speed; `&webgl` forces WebGL2.
- `window.__genesis` exposes `scene`, `state`, `setSpeed(i)`, `update(patch)`, `actions`, `send(msg)`, `grab()`.
- The build container renders in software at about one frame per second. Do not use page screenshots for the canvas: step frames by hand with `scene.frame(dt)` and read the canvas with `__genesis.grab()`.
- The worker keeps sending cell snapshots even when paused: after injecting test data with `scene.applyCells(c, true)`, set `scene.applyCells = () => {}` (and `scene.applyStats = () => {}`) or it is overwritten.
- Capture recipe: launch Playwright Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, viewport 800x500, open the dev URL, wait for `__genesis.scene.planet`, shrink the canvas (`scene.renderer.setSize(64, 40, false)`), `send({ type: 'warp', years: 150e6 })` and poll `state.stats.simYear`, then `setSpeed(0)`, `scene.resize()`, `scene.daySpeed = 0`, `cam.autoOrbit = 0`, hide the UI (`update({ uiHidden: true, hintStep: 9 })`). For each view set `cam.setImmediate(lon, lat, dist)` and `scene.dayAngle = lon + sunOffset`, step about 12 frames with `scene.frame(0.25)` and a 40 ms pause between them (auto exposure and TAA need them), then save `__genesis.grab()`. Views: orbit day (2.6, +0.5), orbit night (2.6, +2.8), terminator (2.6, +1.55), night map (1.9, +2.9, `actions.setOverlay('nations')`), coast (0.3, +0.6), forest ground (0.02, +0.6, tilt -0.5), ground night (0.02, +2.9), under water.
- `scene.creatures.debugSpawn(dir)` drops sample species; made-up settlements go in through `scene.setSettlements(list)` then `scene.civ.update(scene.lastCells, new Map(), performance.now(), 0.05, true)`.
- Never run a browser check and a history script at the same time (the container was killed for memory), and do not edit files under `src` while a browser check runs (Vite reloads the page).
- TSL notes: with InstancedMesh, `positionLocal` inside `positionNode` is already instanced, so custom instancing uses named instanced attributes and `positionGeometry`. `patch` is a reserved word in GLSL. Cube lookups go through `samplePlanet` (x is mirrored). Texture reads inside loops need `.level(0)`. Render-target read-backs come back flipped on WebGL2: probe the orientation (see `gfx/ground.ts`). Mixed `any` and typed nodes often need `(fn as any)(...)` casts.

## The simulation (src/sim), unchanged by the graphics work except for exposed data
- Worker-side only, no Three.js. Fine grid n=63 (39,692 cells), eco regions n=21. One eco step is 15,000 years.
- A cohort is one species in one region with one genome and a head count. Intake capacity comes from the body (P.Forage); cost from body plus trait upkeep (P.Need). Never make claims proportional to need or costly traits become free.
- Speciation thresholds are measured in average cohort sizes (see DECISIONS 40). Soft cap 40 living species, hard cap 64, four cohorts per region.
- Civilization: settlements founded after a lineage stays above intelligence 0.5 for 60 My; technology drives every stage.
- Stats now also carry `cyclones` (cells) and `solar`.
- Tests: `npm test` (11 tests, about five minutes). `scripts/history.ts <seed> <My> <gridN>` prints a whole history (`npx vite-node`).

## Known issues
- Powered flight is rare and cold seeds can lose their land animals; see git log for the tuning history.
- A long warp in the headless browser takes many minutes; run it in the background.
- The scheduled task "Genesis auto-resume" fires into the owner's session every five hours with instructions to read this file and continue.
