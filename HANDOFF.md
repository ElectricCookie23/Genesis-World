# Handoff

Read this first when resuming. Then BRIEF.md, PROGRESS.md, DECISIONS.md and `git log`.

## Standing instructions from the owner
- Work autonomously; the owner is away and has said yes to all decisions.
- Commit and push to `origin main` after every working step. Plain commit messages, no Co-Authored-By, no session link.
- Keep this file and PROGRESS.md current in the same commits.
- Stop and show the owner only at points that are worth showing.

## Where things stand
- Stage 1 (setup, sim core, worker, protocol, tests, CI) is done.
- Stage 2 (rendering and the opening sequence) is next.

## What exists
- `src/sim`: rng, world grid (icosphere n=63), geology (plates, terrain, drainage), climate (temperature, wind, moisture, snow, biomes, long cycles), events (cause graph), simulation (step loop), worker.
- `src/shared/protocol.ts`: worker messages and the speed table.
- `tests/sim.test.ts`: grid, determinism, bounds for 5 seeds.

## Next steps
1. Renderer: planet mesh, ocean, atmosphere, clouds, stars, moon, post-processing, camera.
2. Opening sequence (BRIEF 7.1).
3. Then stage 3 (weather, seasons, tides) and onward in build order.

## Known issues
- GitHub Pages cannot deploy while the repo is private on a free plan (see DECISIONS.md #2).
