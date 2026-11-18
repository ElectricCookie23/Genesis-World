# Decisions

Choices made where the brief was unclear or something had to change. Newest at the bottom.

1. **Commit messages** carry no Co-Authored-By line and no session link (owner's choice, matches the brief).
2. **GitHub Pages:** the workflow builds, tests and deploys on every push to `main`. The repo is currently private, and Pages on a free plan needs a public repo, so the deploy job is marked `continue-on-error` and will start working once the owner makes the repo public (or upgrades) and sets Settings > Pages > Source to "GitHub Actions". Repo visibility is the owner's call and was not changed.
3. **Speed labels are not literal multipliers.** 1x is one sim day per real second as the brief requires, but a literal 1000x would be under 3 years per second, leaving a 100,000-fold gap to Epoch. Speeds are: 1x = 1 day/s, 10x = 1 year/s, 100x = 30,000 years/s, 1000x = 100,000 years/s, Epoch = 300,000 years/s (100x was raised from 5,000 so that the first life appears within about half a minute of the opening). A full history at Epoch is about 500 million sim years in 28 minutes.
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
15. **Life is simulated as populations, not individuals.** A "cohort" is one species in one region sharing one genome. This is the statistical layer the brief asks for at high speed, and it is always the source of truth. Individual creatures near the camera will be drawn from the cohorts.
16. **Ecology runs on a coarser grid** (icosphere n=21, 4,412 regions) laid over the 39,692-cell planet grid. Terrain and climate stay per cell; vegetation is painted back onto cells.
17. **One ecological step is 15,000 sim years** (one tick at Epoch). Slower speeds take fractional steps, so history unfolds at the same pace in sim years at every speed. At 1x and 10x populations are effectively frozen, which is right for a day or a year.
18. **Determinism** holds for the same seed and the same sequence of time steps. A seed code replays the same world; changing speed mid-run changes how the steps fall and so can change details of the history.
19. **Oxygen gates the land.** Sea plants slowly oxygenate the air; land is sterile until an ozone layer forms. This is what places land plants around 50 My and land animals after them, without scripting either.
20. **Soft cap of 40 living animal species** (hard cap 64), and 150 plant species, so the tree of life stays readable and the sim stays fast. Big changes in way of life can still found species above the soft cap.
21. **Origin of life is seeded** (first microbes, first alga, first animal at seeded times). Everything after that emerges.
22. **Headless life tests use a small planet** (n=27) and 120 My so that five seeds finish in about five minutes.
