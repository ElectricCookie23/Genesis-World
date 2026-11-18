# Handoff

Read this first when resuming. Then BRIEF.md, PROGRESS.md, DECISIONS.md and `git log`.

## Standing instructions from the owner
- Work autonomously; the owner is away and has said yes to all decisions.
- Commit and push to `origin main` after every working step. Plain commit messages, no Co-Authored-By, no session link.
- Keep this file and PROGRESS.md current in the same commits.
- Stop and show the owner only at points that are worth showing.

## Where things stand
- Stage 1 (setup, sim core, worker, protocol, tests, CI): done.
- Stage 2 (rendering, opening sequence): mostly done. Leftovers: river ribbons, auroras, real shadows, ambient occlusion, adaptive quality, mobile preset.
- Stages 3 to 5, simulation side: done and tuned headless. Eras, sea level, eruptions, impacts, fires, plants, creature populations, genetics, speciation, naming, extinctions with causes, mass extinctions, milestones.
- NOT done yet: nothing of life is drawn or shown. The worker does not send plant or creature data, and there is no chronicle, tree of life, follow mode or god tool UI.

## What exists
- `src/sim`: rng, world (fine grid n=63), geology, climate, events (cause graph), regions (coarse eco grid n=21), plants, genetics, creatures (cohorts, food web, speciation), naming, names, simulation (orchestration, eras, origin of life, events, milestones), worker.
- `src/shared/protocol.ts`: worker messages and the speed table.
- `src/render`: common (uniforms), planet, ocean, clouds, atmosphere (also sky and moon), effects (dust disc), postfx, camera, opening, scene.
- `src/ui`: Preact HUD (store, App, CSS module). `src/main.ts` boots everything.
- `tests/sim.test.ts`: grid, determinism, five 120 My histories on a small grid (takes about 5 minutes).
- `scripts/history.ts` (print a whole history), `scripts/probe.ts` (test selection on variants), `scripts/debug-*.ts`. Run with `npx vite-node scripts/history.ts <seed> <millionYears> <gridN>`; gridN 36 is 3x faster than 63.

## How the life model works (read before touching it)
- A cohort is one species in one region with one genome and a head count. Each eco step: feed (six plant pools by layer, prey, carrion), breed or starve, thermal stress, predation, disperse, mutate. One eco step is 15,000 sim years (one tick at Epoch); slower speeds take fractional steps.
- Intake capacity comes from body (P.Forage); cost from body plus trait upkeep (P.Need). Never make claims proportional to need or costly traits become free.
- Speciation: a far-out population (genome distance from the species reference) that is isolated by geography or differs in way of life becomes a species. Soft cap 40 living species, hard cap 64.
- Things that broke it before: food layers in the sea, plant height arms race, prey energy too low for small hunters, spread thresholds, basin-locked dispersal. See git log.

## Next steps
1. Protocol: send species table, plant table, and cohorts near the camera to the main thread.
2. Render life: vegetation instances from plant genes; creature meshes from genomes with procedural animation; individuals near the camera.
3. UI (stage 6): chronicle, "Why did this happen?" panel, milestones, tree of life, follow mode, time controls polish, god tools (meteor first), seed sharing, postcard mode, music.
4. Tuning still wanted: persistent predators, flight, intelligence; full-grid creature step is about 18 ms.
5. Stage 2 leftovers listed above.

## How to check visuals
- `npm run dev`, then open `/?seed=amber-reef-101&skip` (skip jumps past the opening; `&webgl` forces WebGL2).
- `window.__genesis` exposes `scene`, `state`, `setSpeed(i)`, `skip()`, `opening()` for scripted screenshots with Playwright.
- Software rendering in the build container is slow: use a viewport around 760x480.

## Known issues
- GitHub Pages cannot deploy while the repo is private on a free plan (see DECISIONS.md #2).
