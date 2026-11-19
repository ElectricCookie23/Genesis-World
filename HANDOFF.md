# Handoff

Read this first when resuming. Then PROGRESS.md, DECISIONS.md and `git log`.

## Standing instructions from the owner
- Work autonomously; the owner is away and has said yes to all decisions. Never wait for approval between steps.
- Commit and push to `origin main` after every working step. Plain commit messages: no Co-Authored-By line, no session link.
- Keep this file and PROGRESS.md current in the same commits. Log choices in DECISIONS.md.
- Stop and show the owner only at points that are worth showing.
- Graphics rules (owner): full techniques on WebGL2 (FFT ocean, GPU erosion, TAA with a history buffer), quadtree LOD terrain, WebGPU optional, screenshots here check correctness only, push every step.

## Where things stand
Work queue items 1 to 3 are finished: every feature row in PROGRESS.md is "done", and all twelve graphics steps have a first pass. **Next is item 4, the expansion brief** (`docs/EXPANSION_BRIEF.md`): architecture additions first, then sections 1 to 10 in order.

The last batch of the "simplified" pass: timeline strip with thinned rewind points (86), diversity and oxygen overlays (90), positional sound (94), two futures side by side (143), real ancestry in the family tree (144), ocean currents that remember (56). Trails, hibernation, pollinators and symbiosis were retuned against real histories so their events fire (DECISIONS 65). `scripts/systems.ts <seed> <My>` prints when each of these events first fires and the gene ranges behind them.

Checked in the headless browser: two futures run and cross over, young animals follow parents, the family tree links real herd-mates and young, the field guide shows sketch cards. Not yet seen in a browser frame: trails on the ground, the rainbow, the timeline strip, the GIF and PDF buttons (the UI hides itself after four seconds without input, which empties page screenshots).

The real-GPU review has been run (Apple M3 Pro, Chrome, WebGPU and WebGL2): read `docs/GPU_REVIEW.md` with its screenshots in `docs/screenshots/gpu/`. **Two sessions have worked on its findings**: one on the owner's machine with the real GPU (it fixed and re-tested the undrawn models and the black surface, then a second batch), and this cloud session (half-resolution clouds, diagnostics, causeways, trails, colours, test tooling). Their work is merged; see "GPU review: fixed and still open" before touching any of it. **Finish what is still open there, then go on to item 4, the expansion brief.** Before pushing, always `git fetch` and merge: the other session may have pushed.

**Expansion status: the architecture additions are built** (see the Expansion section of PROGRESS.md and DECISIONS 79 to 85). `sim/civilization.ts` now has two clocks: prehistory per ecology step, history in yearly ticks (`advance`) with nations, cultures, languages, rulers, houses and eras; `sim/history/` holds languages, text templates, citizens on demand, the era table and the per-cell history log; the worker holds time at the new History speed (25 years a second) and keeps a snapshot per era. `scripts/chronicle.ts <seed> <years> [gridN] [step]` prints a history. E1 (the tech web) is done: `sim/history/tech.ts`, the nation panel in `ui/panels.tsx`, `requestNation` in the worker. **Next: E2 era progression**, then onward in order. History under a fast-forward is summarised, not recorded (DECISIONS 86): to see a full history in a script, step one year at a time (`scripts/chronicle.ts`). Speed indices moved: History is 3, 100x is 4, 1000x is 5, Epoch is 6. Minds are now likely by about 130 My (DECISIONS 78), so settlements, roads, city lights and the Night Map can finally be reviewed: a 150 My warp is no longer enough to guarantee them, 200 My usually is.

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

## GPU review: fixed and still open
Fixed (commits "plants and animals share vertex buffers", "plain counted meshes", "land and sea no longer go black"):
- **WebGPU allows 8 vertex buffers per draw.** Every separate `BufferAttribute` is one buffer, so plants (10), animals (14) and buildings (9) were never drawn there. Per-vertex extras and per-copy data are now packed into shared buffers with `packAttributes` (`gfx/packed.ts`); plants and animals bind 4, buildings 5. `tests/render.test.ts` holds the limit for every plant form and many animal shapes. **Any new model must stay within 8 buffers and 16 attributes: pack its attributes the same way.**
- **Self-placed copies are `Copies`, not `InstancedMesh`** (`gfx/packed.ts`): a plain mesh with a `count`. `InstancedMesh` adds a matrix per copy, which three sends as a uniform buffer or, past the uniform limit, as four more attributes. With a 16 KB uniform limit that pushed animals to 18 attributes and their shader failed to compile on WebGL2 (reproduced here by forcing the limit); a group with room for no copies asked WebGPU for an empty buffer (the Low preset error). The quadtree patches, mounds, monoliths and bones still use `InstancedMesh`.
- **The surface was black on real GPUs whenever no meteor strike was under way** (review C3). `uImpact.w` is -1 then, and the ring took its square root: not a number, which multiplying by zero does not clear. The software renderer here hides this. The age is now clamped first, in `gfx/terrain.ts` and `gfx/ocean.ts`. The young-world screenshots in the review (a featureless lilac ball) are this bug, and so is part of the "washed out" day side. **Never take a root, a logarithm or a power of something that can be negative in a shader, even behind a `step` mask; write squares as `pow2()`.**

**Verified on the owner's GPU** (re-test of 5bbe93a, at the top of `docs/GPU_REVIEW.md`): no console errors on either backend at Low or High, near plant models and animals draw on both backends, the surface stays lit in a young world, parked for seven minutes after a warp, and after a slot load. WebGL2 there reports a 16 KB uniform block limit and 16 attributes, which is what the `Copies` change was for.

Second batch, from the first review and the re-test's list of new problems. Checked here in software only, **not yet seen on a GPU**:
- Step-downs (`applyQuality` in `main.ts`): thinner cloud and aurora march first, then half a step of resolution, then counts, then bloom and ambient occlusion, and anti-aliasing with the lens fringe last; they start from the screen's real pixel ratio, so Ultra on a 2x display can step down at all.
- Only the latest three milestone titles play after a fast-forward.
- Sibling planets are measured by the sine of the angle from their direction (`createSky`): the cosine test and a power of 60000 drew two blown-out white discs a degree wide (the review took them for moons).
- Aurora: gone in daylight, lower top, and a soft shoulder on its brightness so long sight lines keep their rays.
- Imposters: the atlas orientation is taken from a camera render of a white card, not a full-screen pass. On WebGPU the old test baked every imposter upside down (trunks above crowns, C5).
- Nest mounds are sized from their builders and never placed on water. Wake rings and sound ripples lie flat instead of standing up as hoops.
- Daytime sky from inside the air is lifted to hold its own against sunlit ground, and stars fade behind it (it read as night at noon once the ground was lit).
- Animals are drawn smaller and tall trees taller (`ANIMAL_BASE`/`ANIMAL_SPAN` in `creatures.ts`, tree size in `flora.ts`); finer fur, softer highlights; sea glint held back from orbit; rock strata bent and their bright band faded (they read as contour lines); umbrella tree given a domed crown.
- Powers and roots of values that rounding can push below zero are clamped throughout the shaders.

Third batch, from the cloud session. Checked in software on WebGL2 and (for validity) on software WebGPU, **not yet seen on a GPU**:
- **Clouds are marched at half resolution** in their own pass before the scene (`VolumetricClouds.render`), then drawn back on the same shell at full resolution with a two-ring filter; occlusion by solid things is tested per full-resolution pixel at that point (DECISIONS 74). `cloudScale` in `PRESETS` sets the share (Low 0.4, Medium and High 0.5, Ultra 0.75). In software rendering this made whole frames about five times faster. Rays that only graze the layer from space fade out, so the limb is a clean curve. The step jitter shrinks when there is no temporal anti-aliasing to average it.
- **Non-finite guard and black-box report** (`render/diagnose.ts`): planet textures never receive non-finite values, shared uniforms are checked every frame and reset with a console warning, exposure is guarded. **Shift+D saves `genesis-<seed>-diagnostic.json`** (`__genesis.diagnose()`) with every renderer input: ask for it with any report of a wrong picture.
- Rivers no longer build causeways across the ocean (the green lines on the sea in the review): delta mud settles only in shallow water and waves take unfed mud away (`sim/landforms.ts`). Trails show as soft trampled patches along a route (as thin lines they followed the detail noise and read as contour stripes on every shore), and a path wears slower the more worn it is. Drawing them as real paths with a line field, like roads, is the proper fix and is not done.
- Ground under plants is earthy (dark litter under trees, patchy meadow in the open) so plants stand out from it; bark is dark; leaves shade from inside to tip; conifers have boughs to the top and a leading shoot so the trunk never pokes out; imposter tiles are 192 px; the model-to-imposter crossfade band is narrower.
- Animals are drawn only from near (`dist < 0.16`) and grow little with distance; plants stay off deep snow; depth of field only while following an animal, and gentle; exposure cannot open far from orbit (`PostFX.maxExposure`); the atmosphere shell is thinner (a fine rim from orbit, same air overhead); the star's wide haze is cut down; sound ripples are faint and only from close by.
- Under water (key U, then zoom in over sea at least 0.3 km deep): everything fades into the water's colour with distance (`uWaterFog`, applied in `postfx.ts` from scene depth), caustics reach deeper, corals grow on living reef and weed in the shallows (planted by `Flora` on sea-bed triangles when the camera is near), and raising the tilt lifts the gaze toward the surface (`OrbitCamera.lookUp`). Still plain: no light shafts seen, few animals, and the camera cannot dive where the sea is shallower than about 0.27 km.
- `&noadapt` in the address turns the automatic step-downs off, for checks.

Still open, nothing started: frame rate has not been measured since the half-resolution cloud pass (WebGPU measured 2 to 4 fps slower than WebGL2 at coast and ground before it), animals with loose or floating parts (a stray foot, fins apart from the body, a pale see-through leg) and feet hovering on uneven ground, sample land animals standing on water (may be `debugSpawn` only), flat single-colour leaves on most plant forms, the white haze patch at ground level, the empty sea bed, hard polygonal coastlines and rivers as thin even lines, exposure taking a second or two to settle after a preset change (dim frames with a heavy vignette), no nations by 150 My in ten worlds of this seed, and **the same seed giving different worlds from run to run** (23 to 41 living species at 150 My): the worker steps the sim by wall-clock ticks at the current speed, so the history depends on how long the page ran at which speed before a warp.

A collection of CC0 models, textures and sounds is being gathered on the owner's machine under `~/genesis-review/assets` with a manifest (owner's request). Nothing from it is in the repo; BRIEF.md's rule (CC0 or public domain, logged in CREDITS.md) applies if any is used.

**Second real-GPU re-test (of 29ea8ad) is at the top of `docs/GPU_REVIEW.md`.** It confirms on the GPU: clean consoles on both backends, upright conifer imposters, no white discs, aurora, sea glint, proportions, mounds, flat rings, depth of field, milestone titles, and High holding about 50 fps with anti-aliasing, bloom and ambient occlusion on (clouds now cost 19 fps at High, was 24 to 30). Settlements were seen for the first time, and the Night Map works.

**Fixed by the fix session after that re-test** (checked in software on WebGL2, not yet seen on a GPU):
- Step-downs no longer count frames while the erosion bake runs or for five seconds after it (Ultra used to start already stepped down, and remember it).
- Daytime sky at altitude: the lift grows with how thin the air is at the camera (`thinHere` in `createAtmosphere`), because terrain heights are exaggerated and the air's scale height is not; stars are fully hidden by day from inside the air.
- Painted city glow on the ground steps back further from low altitude and is held back by the exposure (it was large hard white patches at night from low over a town).
- Sea patches are dropped only where the neighbouring cells are high too (`keepSeaPatch`): the sea was missing in squares beside small islands, showing bare sea bed with straight edges.
- Imposter pictures are baked per preset (`imposter` in `PRESETS`: 160, 224, 352, 480 texels) and real models take over from further out (`lod`: 0.02 to 0.055), so far trees no longer read as pixel art at mid distance.
- What a town builds follows its population as well as its technology (`era` in `buildings.ts`).

Not bugs, for the record: `stats.stage` stays "animals" by design once life is complex (the UI takes the age of fires, villages and cities from the settlement stats), and the "town of 503" in the re-test is 503 thousand people (`pop` is in thousands). But `civ.settlements` held 6,000 to 8,000 entries at 150 My, ruins included, and the whole list is posted to the page every 700 ms: worth thinning on the sim side.

Still open from the second re-test, for whoever gets to it: conifer fronds as flat cards, the river draped over hills through a town, no streets or cleared ground in towns and buildings half-sunk on rough ground, Night Map label overlap and labels on the far limb, hexagon-stepped borders, evolved land animals over water (5 to 6 in 100 to 170), ball feet hovering and a flat pink rectangle on an evolved animal, a very dark night side from orbit, Ultra at 14 to 25 fps before it steps down, and whether the dotted lines across the sea on the Night Map are shipping lanes.

## Graphics: still open
- The first real-GPU review is in (see above). Colours, exposure, cloud cost, aurora and preset costs still need tuning from it.
- Not built: screen-space reflections on water, parallax occlusion mapping, footprints, lens flare, ground fog, canopy texture on far terrain, glow cast on the ground by glowing plants, a WebGPU compute path (WebGL2-style passes run on both backends instead).
- The eight "after" screenshots are in `docs/screenshots/after/` (software rendering, 800x500).
- GitHub Pages is on (repo public, source GitHub Actions): every push to main deploys to https://electriccookie23.github.io/Genesis-World/ after the tests pass (about six minutes).

## How to check visuals here
Fast path, used for the third batch:
- `scripts/grow.ts <seed> <My> <out.json>` grows a world in Node (150 My in about seven minutes) and writes it as a save. A small harness puts that file into save slot 0 of the page (IndexedDB database `keyval-store`, store `keyval`, key `genesis:slot:0`, plus a `genesis:slots` list) and opens `?slot=0&noadapt`, so a check starts from an old world in seconds. The harness lives in the session scratchpad (`h.cjs`, `views.cjs`, `gpucheck.cjs`); if it is gone, rebuild it from this description.
- Test against a built copy served statically (`npm run build`, copy `dist`, `python3 -m http.server`), not the dev server: then editing `src` cannot reload the page under a running check.
- A throwaway browser context has a small storage quota and silently fails to save big worlds: use a persistent profile for save and load checks.
- **WebGPU can be checked here.** Headless Chromium has a software adapter: `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --enable-features=Vulkan`, page on `http://localhost` (WebGPU needs a secure context). It cannot present to a canvas (the device is destroyed), so the harness replaces `canvas.getContext('webgpu')` before the page loads with a stand-in whose `getCurrentTexture()` returns an ordinary texture, and reads that back. It is very slow (tens of seconds a frame) but it reports pipeline validation errors, which WebGL2 never will. It does not show not-a-number faults: like the WebGL2 software renderer, it hides them.

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
- Civilization: settlements founded after a lineage stays above intelligence 0.5 for 15 My; social animals pay less for a big brain, so this now happens around 120 to 140 My in most seeds (DECISIONS 78; `scripts/minds.ts <seed> <My> [gridN]` prints how close a world comes). At most two living sapient species. Technology drives every stage.
- Stats now also carry `cyclones` (cells) and `solar`.
- Tests: `npm test` (about six minutes). `scripts/history.ts <seed> <My> <gridN>` prints a whole history (`npx vite-node`).

## Known issues
- Powered flight is rare and cold seeds can lose their land animals; see git log for the tuning history.
- A long warp in the headless browser takes many minutes; run it in the background.
- The scheduled task "Genesis auto-resume" fires into the owner's session every five hours with instructions to read this file and continue.
