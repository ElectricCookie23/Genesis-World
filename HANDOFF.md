# Handoff

Read this first when resuming. Then BRIEF.md, PROGRESS.md, DECISIONS.md and `git log`.

## Standing instructions from the owner
- Work autonomously; the owner is away and has said yes to all decisions.
- Commit and push to `origin main` after every working step. Plain commit messages, no Co-Authored-By, no session link.
- Keep this file and PROGRESS.md current in the same commits.
- Stop and show the owner only at points that are worth showing.

## Where things stand
- The original brief is built through all three tiers. PROGRESS.md lists every feature as done or simplified (with what is missing). Nothing is "not started".
- Verified in a headless browser: opening, planet, plants, creatures, UI panels, particles, ring, city lights, music start, autosave and resume, crash recovery, save slots. All 11 tests pass.
- NOT verified: frame rate on a real GPU, mobile layout on a real phone, the live site (Pages is off).
- Deferred to the graphics overhaul: real shadow maps, ambient occlusion, LOD levels for plants and creatures.
- NEXT: the owner's graphics overhaul brief (alien art direction, high-fidelity rendering). Its text is in `docs/GRAPHICS_BRIEF.md`. Start with its PROCESS step 1 (eight "before" screenshots), then follow its order.

## What exists
- `src/sim`: rng, world (fine grid n=63), geology, climate, events (cause graph), regions (coarse eco grid n=21), plants, genetics, creatures (cohorts, food web, speciation), naming, names, simulation (orchestration), worker.
- `src/shared/protocol.ts`: messages (cells, stats, events, species, plants, herds), speed table.
- `src/render`: common (uniforms), lighting (shared light for small objects), planet, ocean, clouds, atmosphere (also sky and moon), effects (dust disc), vegetation, creatures, postfx, camera, opening, scene.
- `src/ui`: store, App (HUD), panels (Chronicle, Why, Tree, SpeciesCard, CreatureCard, Help, GodTools, Settings), format, CSS module. `src/main.ts` boots and wires everything.
- `tests/sim.test.ts`: grid, determinism, five 120 My histories on a small grid (about 5 minutes).
- `scripts/history.ts` (print a whole history), `scripts/probe.ts` (test selection on variants), `scripts/debug-*.ts`. Run with `npx vite-node scripts/history.ts <seed> <millionYears> <gridN>`; gridN 36 is 3x faster than 63.

## How to check visuals
- `npm run dev`, then open `/?seed=amber-reef-101&skip` (`skip` jumps past the opening; `&webgl` forces WebGL2).
- `window.__genesis` exposes `scene`, `state`, `setSpeed(i)`, `update(patch)`, `actions`, `send(msg)`, `skip()`, `opening()`.
- `__genesis.send({ type: 'warp', years: 120e6 })` fast-forwards the sim (about 4 minutes for 120 My on the full grid; the worker is blocked meanwhile).
- `__genesis.scene.creatures.debugSpawn(dir)` drops sample species at a unit direction, for checking creature bodies without a warp.
- Software rendering in the build container is slow: use a viewport around 860x540, pause the sim before screenshots, and shrink the canvas (`scene.renderer.setSize(64, 40, false)`) while warping. Editing files under `src` while a browser check runs triggers a Vite reload and ruins the run.
- TSL gotcha: with InstancedMesh, `positionLocal` inside `positionNode` is already instanced (world units). Creatures use their own instanced attributes and `positionGeometry` instead.

## How the life model works (read before touching it)
- A cohort is one species in one region with one genome and a head count. Each eco step: feed (six plant pools by layer, prey, carrion), breed or starve, thermal stress, predation, disperse, mutate. One eco step is 15,000 sim years (one tick at Epoch); slower speeds take fractional steps.
- Intake capacity comes from body (P.Forage); cost from body plus trait upkeep (P.Need). Never make claims proportional to need or costly traits become free.
- Speciation: a far-out population (genome distance from the species reference) that is isolated by geography or differs in way of life becomes a species. Soft cap 40 living species, hard cap 64.
- Things that broke it before: food layers in the sea, plant height arms race, prey energy too low for small hunters, spread thresholds, basin-locked dispersal. See git log.

## Next steps (in order)
1. Finish Tier 1: storms and lightning (#28), auroras (#37), generative music (#38), postcard mode camera (#39), river ribbons, saving and settings (BRIEF 7.5), README with screenshots.
2. Tuning: flight and predators should appear in most seeds; check five seeds with `scripts/history.ts`.
3. Performance and adaptive quality (BRIEF 2), mobile layout check.
4. Tier 2 in numbered order (41 onward), starting with intelligence threshold, campfires and settlements.

## Civilization (Tier 2 started)
- `src/sim/civilization.ts`: settlements (pop, tech, belief, ruin) founded by any species over the intelligence threshold (0.55, social, on land). Events come through `Simulation.civEvent`. `world.lights` paints night lights; the terrain shader shows them on the night side only.
- On `amber-reef-101` (grid 27) a mind awakens at about 248 My, then fire, village and city follow.
- Not done: settlement markers and cards in the UI, agriculture, roads, domestication, cave paintings, temples.

## Known issues
- Evolution reliability: after stopping gene-flow swamping (distinct lines no longer blend) and making flight widen feeding reach, `amber-reef-101` on a small grid reaches hunters, packs, gliding and about 20 land species by 300 My. Powered flight has not appeared in any run yet, and on cold seeds (`basalt-vale-202`) land animals appear but die out. Tune with `scripts/probe.ts`, `scripts/probe-fly.ts` and `scripts/history.ts`.
- The build container has been killed for memory when a headless browser check and a history script ran at the same time. Run them one at a time.
- A browser check that warps 120 My takes about 8 minutes in software rendering; run it in the background and do not edit `src` meanwhile.
- GitHub Pages cannot deploy while the repo is private on a free plan (see DECISIONS.md #2).
