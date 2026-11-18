# Handoff

Read this first when resuming. Then BRIEF.md, PROGRESS.md, DECISIONS.md and `git log`.

## Standing instructions from the owner
- Work autonomously; the owner is away and has said yes to all decisions.
- Commit and push to `origin main` after every working step. Plain commit messages, no Co-Authored-By, no session link.
- Keep this file and PROGRESS.md current in the same commits.
- Stop and show the owner only at points that are worth showing.

## Where things stand
- Stage 1 (setup, sim core, worker, protocol, tests, CI) is done.
- Stage 2 is mostly done: terrain, ocean, atmosphere, clouds, sky, moon, post-processing, camera and the opening sequence all render and were checked in headless screenshots.
- Stage 2 leftovers: river ribbons, auroras, real shadows and ambient occlusion, adaptive quality, mobile preset.

## What exists
- `src/sim`: rng, world grid (icosphere n=63), geology (plates, terrain, drainage), climate (temperature, wind, moisture, snow, biomes, long cycles), events (cause graph), simulation (step loop), worker.
- `src/shared/protocol.ts`: worker messages and the speed table.
- `src/render`: common (uniforms), planet, ocean, clouds, atmosphere (also sky and moon), effects (dust disc), postfx, camera, opening, scene (orchestrator).
- `src/ui`: Preact HUD (store, App, CSS module). `src/main.ts` boots everything.
- `tests/sim.test.ts`: grid, determinism, bounds for 5 seeds.

## Next steps
1. Stage 3: weather (storm cells, lightning, rain), ice ages and sea level, volcanoes.
2. Stage 4 plants, stage 5 creatures and genetics, stage 6 cause graph UI, chronicle, tree of life, follow mode.
3. Stage 2 leftovers listed above.

## How to check visuals
- `npm run dev`, then open `/?seed=amber-reef-101&skip` (skip jumps past the opening; `&webgl` forces WebGL2).
- `window.__genesis` exposes `scene`, `state`, `setSpeed(i)`, `skip()`, `opening()` for scripted screenshots with Playwright.
- Software rendering in the build container is slow: use a viewport around 760x480.

## Known issues
- GitHub Pages cannot deploy while the repo is private on a free plan (see DECISIONS.md #2).
