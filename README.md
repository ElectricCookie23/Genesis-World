# Genesis

**Live site:** https://electriccookie23.github.io/Genesis-World/ (works once GitHub Pages is switched on for this repo; see DECISIONS.md #2)

Genesis is a 3D web experience of a small planet where geology, climate, life and eventually civilization evolve on their own in real time. It is a living simulation you watch and poke at, not a game with goals.

Nothing is scripted. Every species, extinction and forest emerges from the simulation, and every event records what caused it, so you can click anything in the chronicle and trace its story back to the root.

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Then open the address Vite prints. Other commands:

- `npm test` runs the headless simulation tests (about five minutes: five whole histories)
- `npm run typecheck` checks the TypeScript
- `npm run build` builds the static site into `dist/`

Useful URL options: `?seed=amber-reef-101` picks the world, `&skip` skips the opening, `&webgl` forces WebGL2.

## Controls

| Input | Action |
|---|---|
| Drag | Orbit the planet |
| Scroll or pinch | Zoom, in one range from deep space to the ground |
| Right-drag or two-finger drag | Turn and tilt near the surface |
| Click a creature | Select it. Double-click or F follows it |
| Space | Pause or play |
| 1 to 6 | Speed: pause, 1x, 10x, 100x, 1000x, Epoch |
| C | Chronicle |
| T | Tree of life |
| G | God tools (meteor) |
| P | Postcard mode |
| H | Hide or show the interface |
| Esc | Close panels, stop following |
| ? | Controls list |

## A short tour

- **The opening.** A dust disc collapses into a molten planet, the moon is struck off, the crust cools, rain falls and the seas fill. The planet that forms is the real seeded one.
- **Epoch speed (key 6).** A whole history, about 500 million years, in roughly half an hour. Life starts in the sea, oxygen builds, plants take the land, animals follow.
- **The chronicle (C).** A calm documentary voice narrates what happens. Click any line to open "Why did this happen?" and walk the chain of causes backward.
- **The tree of life (T).** Every named species as a glowing branch. Click one to meet it and fly to where it lives.
- **Down on the ground.** Zoom in on a green coast. Trees, shrubs and grass grow from the genes of the local plant species; creatures are built from their genomes, with legs, fins, wings, necks, horns, shells and patterns. Click one to see its name, age and what it is doing.
- **The meteor (G).** Aim, click, and watch an impact winter change the tree of life.
- **Seeds.** The World panel copies a link that replays this exact world.

## How it works

- `src/sim` is the simulation. It runs in a Web Worker and never imports Three.js. The planet is an icosphere of 39,692 cells holding elevation, temperature, moisture, biome, vegetation and more. Life is simulated as populations with real genomes on a coarser grid of regions: they eat, are eaten, starve, freeze, breed, wander and mutate. There is no fitness score; selection is whatever happens to them.
- `src/render` draws it with Three.js (WebGPU with automatic WebGL2 fallback), shaders written in TSL: faceted terrain, a depth-coloured ocean with sun glint and foam, ray-marched atmospheric scattering, a drifting cloud shell that casts shadows, a procedural starfield and moon, instanced plants and creatures, bloom and ACES tone mapping.
- `src/ui` is a light Preact overlay.
- `tests` runs whole histories headless in Node and checks stability, determinism and that every extinction and new species records a cause.

## Project documents

- BRIEF.md: the full build brief
- PROGRESS.md: status of all 150 features
- DECISIONS.md: choices made along the way
- HANDOFF.md: where the work stands, for resuming
- CREDITS.md: assets and licenses
