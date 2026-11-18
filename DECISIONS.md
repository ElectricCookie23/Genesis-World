# Decisions

Choices made where the brief was unclear or something had to change. Newest at the bottom.

1. **Commit messages** carry no Co-Authored-By line and no session link (owner's choice, matches the brief).
2. **GitHub Pages:** the workflow builds, tests and deploys on every push to `main`. The repo is currently private, and Pages on a free plan needs a public repo, so the deploy job is marked `continue-on-error` and will start working once the owner makes the repo public (or upgrades) and sets Settings > Pages > Source to "GitHub Actions". Repo visibility is the owner's call and was not changed.
3. **Speed labels are not literal multipliers.** 1x is one sim day per real second as the brief requires, but a literal 1000x would be under 3 years per second, leaving a 100,000-fold gap to Epoch. Speeds are: 1x = 1 day/s, 10x = 1 year/s, 100x = 5,000 years/s, 1000x = 50,000 years/s, Epoch = 300,000 years/s. A full history at Epoch is about 500 million sim years in 28 minutes.
4. **Planet grid:** icosphere at frequency 63 gives 39,692 cells (the nearest to 40,000). Cells are the icosphere vertices; the renderer draws the 79,380 triangles between them, flat shaded.
5. **Elevation is stored in km** relative to a fixed datum, and sea level is a separate number, so ice ages can move the coastline without touching terrain.
6. **`src/sim/simulation.ts` and `src/sim/noise.ts`** were added to the brief's file list: the first holds the whole sim so the worker and the Node tests share one code path, the second holds fbm helpers.
7. **Seasons at high speed:** when a tick is longer than about 0.2 years, the sim uses annual-mean temperature (seasons would only alias). The renderer shows a slow cosmetic day/night rotation at those speeds.
8. **Tests use Vitest** (Node environment, no browser) through `npm test`.
9. **Tick rate:** the worker runs 20 fixed ticks per second; the renderer interpolates.
10. **Auto-resume:** a scheduled task fires every 5 hours into the build session so work continues after a usage limit. HANDOFF.md is the note the next session reads first.
11. **Day and night are cosmetic.** At 1x one sim day lasts one real second, which would strobe the sun, so the visible day lasts 80 real seconds at every speed. Seasons (sun declination) follow the sim at 1x and 10x.
12. **Custom lighting instead of scene lights.** Every material computes its own sun, sky and night light in TSL from shared uniforms. It is cheaper than PBR lights and keeps terrain, ocean, clouds and atmosphere consistent. Real shadow maps for close-up creatures and trees come later.
13. **Scale:** planet radius is 1 scene unit and 1 km of elevation is 0.0056 units, so 8 km peaks read from space. Life is drawn far larger than true scale (snow-globe planet).
14. **Stars are drawn in the sky shader** (hashed cells) rather than as point sprites, so they look the same on WebGPU and WebGL2.
