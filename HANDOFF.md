# Handoff

Read this first when resuming. Then PROGRESS.md, DECISIONS.md and `git log`.

## Standing instructions from the owner
- Work autonomously; the owner is away and has said yes to all decisions. Never wait for approval between steps.
- Commit and push to `origin main` after every working step. Plain commit messages: no Co-Authored-By line, no session link.
- Keep this file and PROGRESS.md current in the same commits. Log choices in DECISIONS.md.
- Stop and show the owner only at points that are worth showing.
- Graphics rules (owner): full techniques on WebGL2 (FFT ocean, GPU erosion, TAA with a history buffer), quadtree LOD terrain, WebGPU optional, screenshots here check correctness only, push every step.

## Where things stand
Work queue items 1 to 3 are finished (every feature row in PROGRESS.md is "done"; all twelve graphics steps have a first pass). **The owner's real-GPU review arrived: `docs/GPU_REVIEW.md` with screenshots in `docs/screenshots/gpu/`. Fixing what it found comes before the expansion brief.** Tick items off here as they are fixed and pushed.

### GPU review fix list (in order)
Critical:
- [x] C1/C2 WebGPU allows 8 vertex buffers: near plants (10), creatures (14) and buildings (9) were not drawn. Per-vertex attributes are now packed into one interleaved buffer (`packAttributes` in `gfx/gpu.ts`). Checked on software WebGPU: see "Checking WebGPU here" below.
- [ ] C3 land and sea black after loading a save (also once mid-session): **not reproduced** here in software rendering on either backend. Ruled out: the load path, save fidelity (a reloaded sim matches the original step for step), every shared uniform (identical before and after). What is left is a non-finite number reaching the land and sea shaders on Metal. Hardened: planet textures never receive non-finite values, uniforms are checked every frame and reset with a console warning (`render/diagnose.ts`), exposure is guarded, the impact ring no longer takes the square root of a negative age. **Shift+D saves a diagnostic file** (`__genesis.diagnose()`): if it happens again, that file names the bad input.
- [x] C4 white glare on WebGL2 and flat white discs: these were the system's other planets drawn about twenty times too large (a vec4 was normalised and dotted whole, so its size component leaked into the direction). Fixed in `atmosphere.ts`.
- [x] C2 creatures on WebGL2: they do draw (seen in captures). They were as tall as trees; halved. Their look still needs a pass of its own (smooth single-colour bodies).
- [x] WebGPU Low "binding size is zero": the grass mesh had zero capacity on Low; never zero now.
Frame rate:
- [x] clouds are marched at half resolution in their own pass and drawn back at full resolution with the occlusion test done per full-resolution pixel (`gfx/volclouds.ts`, DECISIONS 70). In software this alone made frames about five times faster.
- [x] step-downs reordered: resolution first, then counts and cloud steps, then AO and fringe, then bloom, anti-aliasing last. High now asks for pixel ratio 1.5, Ultra 2, Medium 1.25.
- [ ] not measured on a real GPU yet.
Look:
- [x] milestone titles after a warp: only the latest is shown, stale ones are dropped
- [x] depth of field only while following an animal, and gentle
- [x] aurora: thinner sheets, lower, night only, soft-capped so it cannot pile up into a wall, held back as exposure opens
- [x] white hoops in the sky: they were the echolocation "sound ripples". Now faint and only from close by.
- [x] atmosphere: thinner shell (fine rim from orbit), brighter sky from inside, exposure capped from orbit, the star's wide haze cut down
- [x] nest mounds: small rounded heaps, upright, on dry ground only, only from near
- [x] ground under plants is earthy (litter under trees, patchy meadow in the open) so plants stand out; bark is dark; leaves shade from inside to tip
- [x] conifer trunks no longer poke out of the crown; imposter tiles 192 px (were 128); crossfade band narrowed
- [x] animals are drawn only from near (they were specks all over land, ice and sea from far off); plants stay off deep snow
- [x] green lines on the sea: rivers were building causeways across the ocean (delta mud piling up cell after cell). Deltas now fill only shallow water and waves take unfed mud away.
- [x] trails were drawn as a cell-wide band; now thin braided threads, and a path is harder to wear the more worn it is
- [ ] under water is flat and empty (no caustics, shafts, fog gradient, plants or animals)
- [ ] coastline is a hard polygon; rivers read as a drawn line of even width; foam is lilac
- [ ] grass blades are wide ribbons; plants take no terrain shadow
- [ ] creature look: bodies are smooth and single-coloured, patterns and fur not visible
- [ ] lens fringe after step-downs (now turned off with AO); audio "Max polyphony exceeded"; a 404; `toNonIndexed` warnings
- [ ] no civilization arose in five worlds by 150 My: nothing built could be reviewed (matters for the expansion)

### Checking visuals here (new, fast)
- `scripts/grow.ts <seed> <My> <out.json>` grows a world in Node (150 My in about seven minutes) and writes it as a save. A harness puts that file into save slot 0 of the page (IndexedDB `keyval-store`/`keyval`, key `genesis:slot:0`) and opens `?slot=0`, so a check starts from an old world in seconds. The harness and scripts live in the session scratchpad (`h.cjs`, `views.cjs`, `gpucheck.cjs`); if they are gone, rebuild them from this description.
- Test against a built copy served statically (`npm run build`, copy `dist`, `python3 -m http.server`), not the dev server: then editing `src` cannot reload the page under a running check.
- `&noadapt` in the URL turns the automatic step-downs off (software rendering is always "too slow" and would otherwise drop to the lowest settings within seconds).
- A throwaway browser context has a small storage quota and silently fails to save big worlds: use a persistent profile for save and load checks.
- Checking WebGPU here: headless Chromium has a software WebGPU adapter (`--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --enable-features=Vulkan`, page on `http://localhost`). It cannot present to a canvas (the device is destroyed), so the harness replaces `canvas.getContext('webgpu')` with a stand-in whose `getCurrentTexture()` is an ordinary texture, and reads that back. It is very slow (tens of seconds a frame) but it reports pipeline validation errors, which WebGL2 never will.

After the review fixes: item 4, the expansion brief (`docs/EXPANSION_BRIEF.md`): architecture additions first, then sections 1 to 10 in order. Design note already settled: history needs human-scale time (a yearly civilisation tick, a "History" speed of about 20 years a second that the sim drops to when farming starts, coarser ticks under warp).

The last batch of the "simplified" pass: timeline strip with thinned rewind points (86), diversity and oxygen overlays (90), positional sound (94), two futures side by side (143), real ancestry in the family tree (144), ocean currents that remember (56). Trails, hibernation, pollinators and symbiosis were retuned against real histories so their events fire (DECISIONS 65). `scripts/systems.ts <seed> <My>` prints when each of these events first fires; `scripts/floor.ts <seed>` prints how often a seed falls under the test's species floor.

## Work queue, in the owner's order
1. Original brief: built (every feature in PROGRESS.md is done or simplified).
2. **Graphics overhaul** (`docs/GRAPHICS_BRIEF.md`): all twelve steps have a first pass, see the table at the top of PROGRESS.md. What is still open is listed below under "Graphics: still open".
3. Complete every item marked "simplified" in PROGRESS.md: done.
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
- Tests: `npm test` (19 tests, about six minutes). `scripts/history.ts <seed> <My> <gridN>` prints a whole history (`npx vite-node`).

## Known issues
- Powered flight is rare and cold seeds can lose their land animals; see git log for the tuning history.
- A long warp in the headless browser takes many minutes; run it in the background.
- The scheduled task "Genesis auto-resume" fires into the owner's session every five hours with instructions to read this file and continue.
