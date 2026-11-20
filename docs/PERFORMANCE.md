# Frame costs on a real GPU, and where to spend or save them

Measured 2026-11-21 on the live site, seed `amber-reef-101`. Observations and suggestions only; nothing under `src/` was changed and **none of the suggestions has been tried**.

## Summary

1. **The frame is paid for by pixels, not by models.** On WebGPU at High a frame is about 20 ms (50 fps). Its cost fits `about 8 to 9 ms fixed + about 3.2 to 4.3 ms per megapixel drawn`. Dropping the pixel ratio from 1.5 to 1 saves 5.6 to 8.8 ms in every view; nothing else comes close.
2. **Plants, grass, animals and buildings are nearly free.** Hiding all near plant models saves 1.0 to 1.7 ms, all far tree pictures 1.2 to 1.4 ms, all grass under 0.2 ms, all buildings (4,000 of them) nothing measurable, and **all animals 0.06 to 0.35 ms, even 252 animals totalling 553,000 triangles**. There is a great deal of room to make models rounder and richer.
3. **Clouds cost 0.15 to 0.28 ms per ray step**: about 5 ms from orbit and 2.7 ms at ground level at High's 18 steps, on top of a fixed part I could not isolate. Hiding the cloud mesh saves almost nothing because the half-resolution cloud pass keeps running.
4. **Turning anti-aliasing off makes the game slower, not faster**: by 1.3 to 13.7 ms on WebGPU and up to 7.4 ms on WebGL2. With temporal anti-aliasing off the scene pass falls back to multisampling (`src/render/postfx.ts`, `pass(scene, camera, o.taa ? { samples: 0 } : {})` with the renderer created `antialias: true`). The automatic step-downs turn anti-aliasing off as their last resort, and Medium ships with it off.
5. **Ambient occlusion costs 1.9 to 2.9 ms at ground level** and 0.3 ms from orbit. Bloom and the lens fringe cost under 0.5 ms each.
6. **The aurora costs 2.3 ms from orbit on the day side**, where it is not visible. The star field costs 2 ms from orbit.
7. **Motion is free.** A steadily moving camera changes the frame time by -0.9 to +0.5 ms (noise). Running the simulation at 1x or faster does not change the frame time; it adds about 3.5 ms of script work per frame, which fits in the slack.
8. **Presets with step-downs off (WebGPU):** Medium 61 to 74 fps, High 46 to 51, Ultra 17 to 20.
9. **Unexplained:** on WebGPU the script side of a frame takes 17 to 21 ms at ground level (3 ms from orbit; 2 to 3 ms in the same views on WebGL2). See "Open question".

## How it was measured

- MacBook Pro, Apple M3 Pro, macOS 27.0.1, Chrome 158, mains power, 120 Hz display, window 1600 x 913 CSS px. Step-downs off (`&noadapt`), remembered steps cleared.
- World: plain warp to the dawn of history, then `through: true` for 100,000 years (588 living towns on the WebGPU runs), paused.
- For each view the camera was parked for 6 s, then frames were counted with `requestAnimationFrame` for 1.8 to 2.5 s after a 0.65 s settle. **Frame time = 1000 / fps.** Every figure is below the 120 Hz cap except where noted.
- "Saved by hiding" = baseline frame time minus frame time with that part's meshes removed from the camera's layers (so nothing else changes). This **under-counts** anything done in a separate pass (clouds, effects) and anything shared; the parts do not add up to the frame.
- Baselines were measured at the start and end of each view; they agreed within 0.4 ms. Treat differences under 0.5 ms as noise.
- The site redeployed between runs, so the bundles differ: WebGPU High `index-CaPGQbcN.js`, WebGL2 High `index-h9kwcS4w.js`, Medium and Ultra `index-C8xtQ58C.js`. The WebGL2 world also differs (it reached the dawn at 74 My with 384 towns), so compare its shape, not its exact numbers.
- Limits: one machine; still frames, never video; no GPU timer queries, so costs are inferred from frame rate; each figure is one sample.

## What the frame is made of (WebGPU, High)

Frame time against pixels drawn, from the pixel-ratio rows (1.46 megapixels at ratio 1):

| Pixel ratio | Megapixels | Orbit | Mid altitude | Above canopy | Forest ground | Town |
|---|---|---|---|---|---|---|
| 0.75 | 0.82 | 11.4 ms | 11.4 | 11.9 | 11.1 | 11.0 |
| 1 | 1.46 | 14.1 | 14.2 | 15.1 | 13.8 | 13.3 |
| 1.5 (High) | 3.29 | 19.7 | 21.5 | 24.0 | 21.7 | 20.4 |
| 2 (Ultra's) | 5.84 | 27.5 | 31.4 | 36.1 | 32.7 | 30.2 |

A straight line through these gives about 8.8 ms + 3.2 ms per megapixel from orbit and 7.6 ms + 4.3 ms per megapixel at ground level. So at High roughly 11 to 14 ms of each 20 to 24 ms frame scales with resolution: the cloud march, the atmosphere, the terrain and ocean shading, ambient occlusion and the other full-screen passes.

The target for 60 fps is 16.7 ms. High is 3 to 7 ms over it.

## The measurements

### WebGPU, High: baseline per view

Bundle `index-CaPGQbcN.js`, canvas 2400 x 1369, pixel ratio 1.5, 18 cloud steps, effects taa, ao, bloom, fringe.

| View | Camera | fps | Frame time | Draw calls | Triangles |
|---|---|---|---|---|---|
| orbit, day side | `(-1.46, 0.1, 2.6)` tilt 0, sun +0.5 | 50.8 | 19.69 ms | 88 | 0.14 M |
| orbit, night side | `(-1.46, 0.1, 2.6)` tilt 0, sun +2.8 | 50.4 | 19.86 ms | 88 | 0.14 M |
| mid altitude over the densest forest (dist 0.3) | `(1.619, 0.414, 0.3)` tilt 0, sun +0.5 | 46.5 | 21.49 ms | 101 | 1.19 M |
| forest from above the canopy (dist 0.05) | `(1.619, 0.414, 0.05)` tilt -0.35, sun +0.5 | 41.7 | 23.96 ms | 104 | 2.56 M |
| forest, ground level (dist 0.02) | `(1.619, 0.414, 0.02)` tilt -0.5, sun +0.5 | 46 | 21.74 ms | 103 | 2.72 M |
| largest town "Du", ground level by day (dist 0.02) | `(-2.777, -0.704, 0.02)` tilt -0.5, sun +0.5 | 49 | 20.42 ms | 107 | 2.70 M |
| same town at night (dist 0.02) | `(-2.777, -0.704, 0.02)` tilt -0.5, sun +2.8 | 49.7 | 20.12 ms | 107 | 2.70 M |

### WebGPU, High: frame time saved by hiding each part (ms)

Positive means the frame got faster with that part hidden. Differences under about 0.5 ms are within the noise (repeat baselines differed by up to 0.4 ms).

| Part | orbit, day side | orbit, night side | mid altitude over forest | above the canopy | forest, ground | town, ground, day | town, night |
|---|---|---|---|---|---|---|---|
| clouds | 0.4 | 0.1 | 0.5 | 0.4 | 0.6 | 0.5 | 0.6 |
| ocean | 0.9 | 0.8 | 1.4 | 0.5 | 0.3 | 0.6 | 0.5 |
| terrain | 0.6 | 0.4 | 1.4 | 1.1 | 1.0 | 3.5 | 3.3 |
| atmosphere shell | 0.7 | 0.5 | 1.7 | 1.5 | 1.6 | 1.6 | 1.7 |
| sky and stars | 2.0 | 2.0 | -0.1 | 0.1 | 1.3 | 0.6 | 0.6 |
| aurora | 2.4 | 2.3 | 0.8 | 0.2 | 0.0 | 0.4 | 0.4 |
| moons | 0.1 | -0.1 | -0.2 | 0.1 | -0.1 | -0.0 | 0.1 |
| satellites | 0.1 | -0.0 | -0.3 | -0.1 | -0.3 | -0.0 | 0.1 |
| other instanced [position,uv] | 0.1 | 0.0 | 0.0 | -0.1 | 0.2 | 0.0 | 0.1 |
| plants: far pictures (imposters) | – | – | -0.2 | 1.4 | 1.2 | 0.1 | 0.1 |
| other [position,normal,uv] | – | – | 0.0 | -0.0 | 0.1 | 0.0 | 0.2 |
| buildings | – | – | 0.0 | -0.0 | 0.0 | -0.8 | -0.6 |
| other instanced [position,normal,dark,iDir,iQuat,iData] | – | – | -0.2 | 0.0 | 0.0 | 0.1 | 0.1 |
| plants: near models | – | – | – | 1.7 | 1.0 | 0.1 | 0.1 |
| grass blades | – | – | – | -0.2 | 0.2 | 0.1 | 0.1 |
| animals | – | – | – | 0.1 | 0.3 | -0.0 | 0.1 |
| other instanced [position,normal] | – | – | – | 0.1 | 0.1 | -0.0 | 0.1 |

### WebGPU, High: settings and motion (frame time in ms; baseline first)

| Change | orbit, day side | orbit, night side | mid altitude over forest | above the canopy | forest, ground | town, ground, day | town, night |
|---|---|---|---|---|---|---|---|
| baseline | 19.69 | 19.86 | 21.49 | 23.96 | 21.74 | 20.42 | 20.12 |
| effect off: taa | 33.43 | 21.16 | 23.75 | 28.69 | 25.13 | 25.03 | 24.24 |
| effect off: ao | 19.37 | 19.63 | 20.75 | 21.03 | 19.29 | 18.49 | 18.24 |
| effect off: bloom | 19.24 | 19.62 | 20.96 | 23.71 | 21.3 | 20.1 | 20.02 |
| effect off: fringe | 19.51 | 19.86 | 21.31 | 23.81 | 21.56 | 20.24 | 20.05 |
| all four effects off | 19.86 | 20.33 | 22.26 | 22.13 | 20.49 | 20.61 | 20.2 |
| pixel ratio 0.75 (was 1.5) | 11.41 | 11.38 | 11.42 | 11.89 | 11.13 | 11 | 10.96 |
| pixel ratio 1 (was 1.5) | 14.05 | 14.06 | 14.19 | 15.12 | 13.75 | 13.34 | 13.28 |
| pixel ratio 2 (was 1.5) | 27.5 | 28.32 | 31.37 | 36.06 | 32.73 | 30.17 | 29.36 |
| cloud steps 8 (was 18) | 17.18 | 17.19 | 19.51 | 22.29 | 19.9 | 18.87 | 18.67 |
| cloud steps 12 (was 18) | 18.23 | 18.37 | 20.24 | 23.03 | 20.73 | 19.46 | 19.27 |
| cloud steps 24 (was 18) | 21.57 | 21.59 | 22.14 | 25 | 22.53 | 21.16 | 20.76 |
| cloud steps 32 (was 18) | 23.88 | 24.22 | 23.36 | 26.2 | 23.48 | 22.14 | 21.69 |
| simulation running at 1x (was paused) | 19.72 | 19.76 | 21.51 | 24.33 | 21.39 | 20.17 | 20.08 |
| simulation running at speed 3 | 19.76 | 20.28 | 21.44 | 24.29 | 21.78 | 20.34 | 20.52 |
| camera moving steadily | 20.56 | 20.14 | 21.04 | 25.18 | 21.97 | 20.01 | 20.19 |

### WebGPU, High: what was on screen (instances / triangles submitted)

| Part | mid altitude over forest | above the canopy | forest, ground | town, ground, day | town, night |
|---|---|---|---|---|---|
| ocean | 111 / 284k | 163 / 417k | 174 / 445k | 153 / 392k | 153 / 392k |
| terrain | 179 / 458k | 448 / 1147k | 457 / 1170k | 561 / 1436k | 561 / 1436k |
| other instanced [position,uv] | 3000 / 6k | 3000 / 6k | 3000 / 6k | 3000 / 6k | 3000 / 6k |
| plants: far pictures (imposters) | 8367 / 17k | 920 / 2k | 356 / 1k | 272 / 1k | 272 / 1k |
| buildings | 8545 / 134k | 1649 / 22k | 1536 / 20k | 4000 / 66k | 4003 / 66k |
| other instanced [position,normal,dark,iDir,iQuat,iData] | 25 / 3k | 25 / 3k | 25 / 3k | 14 / 2k | 14 / 2k |
| plants: near models | – | 456 / 220k | 427 / 215k | 449 / 67k | 449 / 67k |
| grass blades | – | 701 / 32k | 3382 / 152k | 3563 / 160k | 3563 / 160k |
| animals | – | 234 / 197k | 199 / 167k | 114 / 86k | 114 / 86k |
| other instanced [position,normal] | – | 166 / 91k | 166 / 91k | 166 / 91k | 166 / 91k |

With 256 sample animals added at the forest ground view: baseline 45.8 fps (21.83 ms); hiding all animals (252 instances, 553k triangles) saved 0.3 ms.

Console during the run: `x1 Failed to load resource: the server responded with a status of 404 ()`.

### WebGL2, High: baseline per view

Bundle `index-h9kwcS4w.js`, canvas 2400 x 1369, pixel ratio 1.5, 18 cloud steps, effects taa, ao, bloom, fringe.

| View | Camera | fps | Frame time | Draw calls | Triangles |
|---|---|---|---|---|---|
| orbit, day side | `(-1.46, 0.1, 2.6)` tilt 0, sun +0.5 | 57.5 | 17.39 ms | 89 | 0.14 M |
| orbit, night side | `(-1.46, 0.1, 2.6)` tilt 0, sun +2.8 | 60.3 | 16.59 ms | 88 | 0.14 M |
| mid altitude over the densest forest (dist 0.3) | `(-0.813, -0.43, 0.3)` tilt 0, sun +0.5 | 44.8 | 22.32 ms | 101 | 1.20 M |
| forest from above the canopy (dist 0.05) | `(-0.813, -0.43, 0.05)` tilt -0.35, sun +0.5 | 46.5 | 21.5 ms | 108 | 3.64 M |
| forest, ground level (dist 0.02) | `(-0.813, -0.43, 0.02)` tilt -0.5, sun +0.5 | 40.3 | 24.84 ms | 113 | 4.20 M |
| largest town "Nemigitim", ground level by day (dist 0.02) | `(-2.744, 0.683, 0.02)` tilt -0.5, sun +0.5 | 48.4 | 20.66 ms | 111 | 4.11 M |
| same town at night (dist 0.02) | `(-2.744, 0.683, 0.02)` tilt -0.5, sun +2.8 | 47.7 | 20.97 ms | 112 | 4.11 M |

### WebGL2, High: frame time saved by hiding each part (ms)

Positive means the frame got faster with that part hidden. Differences under about 0.5 ms are within the noise (repeat baselines differed by up to 0.9 ms).

| Part | orbit, day side | orbit, night side | mid altitude over forest | above the canopy | forest, ground | town, ground, day | town, night |
|---|---|---|---|---|---|---|---|
| clouds | 0.4 | 0.6 | 0.8 | 0.5 | 1.4 | 0.4 | 0.5 |
| ocean | 1.8 | 1.3 | 2.6 | 1.4 | 1.1 | 1.8 | 1.7 |
| terrain | 1.4 | 0.6 | 2.7 | 2.7 | 4.3 | 2.6 | 2.9 |
| atmosphere shell | 1.0 | 0.4 | 1.1 | 2.3 | 1.4 | 1.5 | 1.6 |
| sky and stars | 2.0 | 1.1 | -0.7 | 1.5 | 1.0 | 1.1 | 0.9 |
| aurora | 1.5 | 1.1 | 1.6 | 1.2 | 1.7 | 0.2 | 0.9 |
| moons | -0.1 | -0.3 | -0.3 | -0.2 | 0.0 | 0.4 | 0.6 |
| satellites | 0.1 | -0.1 | 0.1 | 0.5 | 0.5 | -0.4 | -0.3 |
| other instanced [position,uv] | 0.2 | -0.1 | 0.5 | 0.3 | -0.5 | -0.5 | -0.4 |
| plants: far pictures (imposters) | – | – | 0.4 | -1.3 | -0.4 | -0.9 | -0.4 |
| other [position,normal,uv] | – | – | 0.1 | 0.5 | -0.4 | -0.6 | -0.3 |
| buildings | – | – | 0.1 | 0.4 | 0.5 | -0.8 | -1.1 |
| other instanced [position,normal,dark,iDir,iQuat,iData] | – | – | 0.6 | 0.3 | -0.6 | -0.4 | 0.3 |
| plants: near models | – | – | – | 1.4 | 1.7 | -0.5 | -0.1 |
| animals | – | – | – | 0.5 | -0.3 | -0.1 | 0.1 |
| other instanced [position,normal] | – | – | – | 0.6 | 0.3 | -0.4 | 0.4 |
| grass blades | – | – | – | – | -0.3 | -0.8 | -0.2 |

### WebGL2, High: settings and motion (frame time in ms; baseline first)

| Change | orbit, day side | orbit, night side | mid altitude over forest | above the canopy | forest, ground | town, ground, day | town, night |
|---|---|---|---|---|---|---|---|
| baseline | 17.39 | 16.59 | 22.32 | 21.5 | 24.84 | 20.66 | 20.97 |
| effect off: taa | 17.89 | 18.41 | 29.71 | 25.76 | 30.18 | 25.53 | 25.7 |
| effect off: ao | 16.74 | 16.38 | 21.46 | 20.28 | 22.27 | 19.24 | 19.22 |
| effect off: bloom | 16.11 | 15.9 | 21.3 | 20.96 | 24.24 | 19.94 | 19.93 |
| effect off: fringe | 16.83 | 16.07 | 21.51 | 20.73 | 24.37 | 19.92 | 20.25 |
| all four effects off | 16.6 | 16.13 | 27.8 | 23.17 | 26.53 | 22.17 | 22.52 |
| pixel ratio 0.75 (was 1.5) | 8.31 | 8.35 | 8.31 | 8.32 | 9.93 | 8.33 | 8.34 |
| pixel ratio 1 (was 1.5) | 9.26 | 9.2 | 12.09 | 11.7 | 13.91 | 11.26 | 11.23 |
| pixel ratio 2 (was 1.5) | 26.12 | 26.93 | 36.52 | 34.72 | 38.92 | 32.84 | 33.84 |
| cloud steps 8 (was 18) | 15.33 | 15.44 | 21.3 | 19.44 | 23.15 | 19.36 | 18.95 |
| cloud steps 12 (was 18) | 16.05 | 16.05 | 21.51 | 20.43 | 23.94 | 20.04 | 20.17 |
| cloud steps 24 (was 18) | 18.1 | 17.49 | 23.84 | 22.44 | 26.23 | 22.26 | 21.75 |
| cloud steps 32 (was 18) | 19.32 | 18.97 | 24.91 | 23.45 | 26.61 | 22.94 | 22.14 |
| simulation running at 1x (was paused) | 17.19 | 17.19 | 22.77 | 21.31 | 24.82 | 21.13 | 20.7 |
| simulation running at speed 3 | 17 | 17.19 | 22.33 | 21.39 | 24.57 | 21.31 | 20.7 |
| camera moving steadily | 17.53 | 17.06 | 22.47 | 22.95 | 24.29 | 20.88 | 21.03 |

### WebGL2, High: what was on screen (instances / triangles submitted)

| Part | mid altitude over forest | above the canopy | forest, ground | town, ground, day | town, night |
|---|---|---|---|---|---|
| ocean | 128 / 328k | 337 / 863k | 351 / 899k | 397 / 1016k | 397 / 1016k |
| terrain | 180 / 461k | 537 / 1375k | 557 / 1426k | 608 / 1556k | 608 / 1556k |
| other instanced [position,uv] | 3000 / 6k | 3000 / 6k | 3000 / 6k | 3000 / 6k | 3000 / 6k |
| plants: far pictures (imposters) | 1318 / 3k | 718 / 1k | 331 / 1k | 248 / 0k | 248 / 0k |
| buildings | 4624 / 66k | 2450 / 42k | 1639 / 28k | 2473 / 41k | 2456 / 40k |
| other instanced [position,normal,dark,iDir,iQuat,iData] | 10 / 1k | 10 / 1k | 10 / 1k | 21 / 3k | 21 / 3k |
| plants: near models | – | 145 / 126k | 410 / 329k | 330 / 65k | 330 / 65k |
| animals | – | 327 / 240k | 302 / 222k | 259 / 205k | 259 / 205k |
| other instanced [position,normal] | – | 212 / 116k | 212 / 116k | 212 / 116k | 212 / 116k |
| grass blades | – | – | 6000 / 270k | 1751 / 79k | 1751 / 79k |

With 256 sample animals added at the forest ground view: baseline 40.6 fps (24.66 ms); hiding all animals (244 instances, 522k triangles) saved -0.1 ms.

Console during the run: nothing.

### Presets on WebGPU with step-downs off

| Preset | Asks for | Orbit | Mid altitude over forest | Forest ground |
|---|---|---|---|---|
| Medium | pixel ratio 1.25, canvas 2000 x 1141, 12 cloud steps, bloom | 73.5 fps (13.61 ms) | 60.7 fps (16.48 ms) | 62.4 fps (16.02 ms) |
| High | pixel ratio 1.5, canvas 2400 x 1369, 18 cloud steps, taa+ao+bloom+fringe | 50.8 fps (19.69 ms) | 46.5 fps (21.49 ms) | 46 fps (21.74 ms) |
| Ultra | pixel ratio 2, canvas 3200 x 1826, 32 cloud steps, taa+ao+bloom+fringe | 20.3 fps (49.23 ms) | 17.4 fps (57.47 ms) | 17.4 fps (57.57 ms) |


## Stutter and a 30-minute soak (added 2026-11-21)

Averages hide stutter, so this measures every frame. WebGPU, High, bundle `index-C8xtQ58C.js`, dawn + 100,000 y, **simulation running at 1x**, step-downs on, mains power, 120 Hz display. Each row is every frame over the period; times are the gap between frames in ms.

| View | Period | Mean fps | Median frame | 95th | 99th | Longest | Frames over 50 ms |
|---|---|---|---|---|---|---|---|
| Orbit, parked | 45 s | 48.6 | 16.7 | 58.3 | 66.7 | 83 | 150 (3.3 per second) |
| Orbit, slow spin | 45 s | 47.9 | 16.7 | 58.3 | 66.7 | 83 | 155 |
| Forest ground, parked | 45 s | 41.6 | 25.0 | 66.7 | 83.3 | 100 | 160 |
| Forest ground, panning | 45 s | 45.1 | 24.3 | 58.4 | 75.0 | 100 | 150 |
| Town ground, parked | 45 s | 44.3 | 24.9 | 66.6 | 83.3 | 92 | 156 |
| Fly-down, orbit to ground | 20 s | 42.1 | 25.0 | 66.7 | 91.7 | 100 | 72 |
| Fly-up, ground to orbit | 20 s | 42.6 | 25.0 | 66.6 | 83.3 | 108 | 67 |

1. **The game hitches about three and a half times a second in every view.** The typical frame is 17 to 25 ms, but about 7% of frames take 50 to 100 ms. Frame gaps fall on multiples of 8.33 ms (the display's refresh), so each hitch is four to ten missed refreshes. A reported "45 fps" is really 60 fps with a visible stumble several times a second.
2. **Camera motion and flying in or out add nothing**: the same hitch rate parked, panning, spinning and during a fly-down. Nothing extra shows while new terrain and plants stream in.
3. **The cause is the running simulation.** A control at the same spot (orbit, after the soak, pixel ratio stepped down to 1, 25 s each):

   | Condition | Median | 95th | 99th | Frames over 45 ms |
   |---|---|---|---|---|
   | Simulation paused | 16.6 | 16.7 | 17.0 | **0** |
   | Simulation paused, UI layer removed | 16.6 | 16.7 | 16.8 | 0 |
   | Simulation at 1x | 8.4 | 17 to 25 | 41.6 | 4 to 7, one every 3 to 6 s |
   | Simulation at speed 3 | 8.4 | 25.0 | 41.7 | 11, one every 1.8 s |

   Paused, every frame is an even 16.7 ms. Running, frames alternate short and long (median 8.4 ms, 95th 25 ms) with a long one every few seconds, more often at higher speed. So the hitches are work arriving from the simulation on the display thread (most likely applying each world snapshot: `GenesisScene.applyCells` and what it uploads), and they bite hardest when the GPU is already near its budget, which is why the soak at pixel ratio 1.5 shows 3.5 per second and the control at ratio 1 shows one every few seconds. The UI layer is not the cause.
4. **No leak in 30 minutes.** Six five-minute blocks at forest ground level, 1x: mean 41.7 to 42.2 fps in every block, 1,035 to 1,048 frames over 50 ms in every block, script memory between 162 and 194 MB with no trend, renderer geometries 66 and textures 75 throughout, 234 animals throughout.

**Suggestions (untested):** spread a snapshot's work over several frames instead of one (update a slice of the planet's textures per frame, or only what changed); do the packing in the worker and hand over ready-to-upload buffers; skip updates for layers that are not on screen at the current zoom; and cap frame pacing to an even 60 or 40 so the remaining variation is not seen as stumble.

## Answer to the script-time question: 5 MB of vertex data is re-uploaded every frame (added 2026-11-21)

A JavaScript CPU profile and a count of every `GPUQueue.writeBuffer` call, on WebGPU, High, `&noadapt`, bundle `index-DP-gr_s8.js`, world at dawn + 100,000 y (681 towns), pixel ratio 1.5, simulation paused unless stated. Raw profiles are on the review Mac (`tool/out/trace-webgpu-*.cpuprofile`).

| View | Frame | Script share of the main thread | Time inside `writeBuffer` | `writeBuffer` calls per frame | Data uploaded per frame |
|---|---|---|---|---|---|
| Orbit | 17.7 ms (56 fps) | 89%, 15.8 ms per frame | 77.5% of the thread; 14.2 ms per frame | 217 | **4.99 MB** |
| Forest ground | 23.3 ms (43 fps) | 92%, 21.6 ms | 81.5%; 19.6 ms per frame | 224 | **5.14 MB** |
| Forest ground, sim at 1x | 23.0 ms | 92%, 21.3 ms | 65.0% | not counted | not counted |

1. **Every frame the page uploads about 5 MB in about 220 buffer writes, and the main thread spends 14 to 20 ms inside those calls.** That is the "script time" asked about below. It is the same from orbit, where no plant, animal or building is on screen.
2. **Whole buffers are written, at their full allocated size, every frame.** The largest per frame: 3 writes of 480,000 bytes, 2 of 432,000, 1 of 640,000, 2 of 216,000, 4 of 108,000, 6 of 54,000, 9 of 27,200. In every case the write size equals the buffer size. These are instance-attribute buffers sized for the preset's budgets (for example 40,000 plants at 12 bytes), uploaded in full whether 40,000 instances are in use or none.
3. **The call path** is the post-processing pipeline's render → scene render → each object's `updateBefore` → `updateAttributes` → `writeBuffer`: attributes flagged as changed on every frame.
4. The time is not spread evenly: one of the first large writes takes about 11 ms by itself (a 432 kB write from orbit, a 480 kB write on the ground) and the rest take fractions of a millisecond. So most of it is the first write of the frame waiting on the GPU, as guessed below; but it waits *because* there is a write to make, and the 5 MB is real work for the driver either way.
5. With the simulation running, two more costs appear on the same thread: `fill` (repacking world data into cube-map textures, `fill(e,t,n,r,i)` in the planet-data code) at 80 ms per second and `writeTexture` at 70 ms per second. Those are the hitches measured in the stutter section.

**What to change (untested, but each is standard):**

- Do not mark instance attributes as changed when nothing moved. From orbit, and whenever the camera and the instances are still, nothing needs uploading.
- When something did change, upload only the used range (three.js `addUpdateRange` on the attribute, or `count` times the stride) instead of the whole allocation. A forest view uses a few hundred to a few thousand instances of a 40,000-instance buffer.
- Skip the upload entirely for meshes whose instance count is zero.
- For the per-frame animated ones (animals), write one packed buffer per mesh, not one write per attribute.
- Move the cube-map repacking (`fill`) into the simulation worker and transfer the finished arrays, and spread texture uploads over several frames.

~~If the uploads go, the main thread at orbit drops from about 16 ms of script per frame to about 2, which should also remove most of the difference between WebGPU and WebGL2 seen in the tables above.~~ **Tested and wrong about frame rate; see the next section.**

### Measured: dropping the uploads does not speed up the frame (2026-11-21)

I tested the estimate above on the live page by discarding every `writeBuffer` call above a size threshold while the camera was parked and the simulation paused (same build, WebGPU, High, `&noadapt`, pixel ratio 1.5; 3 s per measurement, baseline repeated at the end).

| View | Baseline | Dropping writes over 20 kB (4.9 to 5.1 MB a frame, 37 to 41 calls) | Dropping writes over 2 kB (44 to 51 calls) | Baseline again | AO at 6 samples instead of 12 |
|---|---|---|---|---|---|
| Orbit | 17.73 ms | 17.83 ms | 17.77 ms | 17.70 ms | 17.67 ms |
| Forest ground | 22.78 ms | 22.81 ms | 22.91 ms | 22.75 ms | 21.31 ms |
| Town ground | 21.18 ms | 21.26 ms | 21.10 ms | 20.51 ms | 19.68 ms |

1. **Removing all 5 MB of uploads changes the frame time by nothing** (within 0.1 ms) in all three views. The frame is limited by the GPU, and the 14 to 20 ms the profile shows inside `writeBuffer` is the main thread waiting for the GPU to take the next frame, not work that delays it. My estimate above was wrong.
2. The picture is unchanged from orbit and at the town with the uploads dropped (mean pixel difference 1.2 and 2.2 out of 255, which is frame-to-frame noise), so those uploads were carrying nothing new. At the forest it differed (16.1), which I did not look into: wind or animal data that does change each frame is the likely reason.
3. So fixing the uploads is still correct housekeeping (less driver work, less battery, and it will matter on machines where the processor is the limit, and once the GPU cost comes down), but **it will not raise the frame rate on this machine today.** The GPU-side items in "Suggestions" section A are the ones that will.
4. **Halving ambient-occlusion samples from 12 to 6 saves 1.5 ms at the forest and about 0.8 to 1.5 ms at the town**, and nothing from orbit. Whether 6 samples looks worse was not compared.

## Open question: script time on WebGPU (answered above)

I timed `scene.frame()` itself. From orbit it takes about 3 ms on both backends. At ground level on WebGPU it takes 17 to 21 ms (out of a 20 to 24 ms frame), where WebGL2 takes 2 to 3 ms in the same views. On WebGPU it:

- grows with pixel ratio (7.6 ms at 0.75, 10.4 at 1, 18.6 at 1.5, 30 at 2, forest ground), which script work should not;
- drops to 2.6 ms when the far tree pictures are hidden, to 3 to 4 ms when buildings are hidden, and to 4 to 6 ms when grass is hidden, yet the frame rate does not change in any of those cases.

My reading, not confirmed: this is time spent blocked while handing work to a busy GPU, not script work, and the instanced meshes that are rewritten every frame are where the block shows up. It is worth a look with the browser's performance profiler, because if any of it is real script work it will become the limit as soon as the GPU cost comes down (at pixel ratio 0.75 the frame is 11 ms and this figure is 7.6 ms).

## Suggestions

Ordered by measured payoff. Each keeps the picture the same or better; none removes detail. "Saves" figures are my estimates from the measurements above, not results.

### A. Get the 3 to 7 ms back

1. **Shade fewer pixels and reconstruct the rest (temporal upscaling).** Render the scene at pixel ratio 1 to 1.25 with the sub-pixel jitter the game already uses for anti-aliasing, and let the temporal pass accumulate into a full-resolution (1.5 or 2) target, followed by the existing sharpen. This is how most current games hit their frame rate (the family is usually called TAAU; AMD's FSR 2 and Unreal's TSR are worked examples, and FSR 1 or contrast-adaptive sharpening is the simpler spatial fallback). Measured headroom: 5.6 to 8.8 ms between ratio 1.5 and 1. Text and UI stay at native resolution because they are DOM.
2. **Replace the step-down ladder with continuous dynamic resolution.** Once (1) exists, drive the internal ratio from the measured frame time in small steps (for example 0.05 at a time) instead of switching whole features off. The picture then degrades invisibly instead of visibly.
3. **Never fall back to multisampling.** Create the scene pass with `samples: 0` in every mode and, when the temporal pass is off, add a cheap edge filter (FXAA or SMAA) instead. Today, turning anti-aliasing off costs 1.3 to 13.7 ms. This would also speed up Medium, which has it off by design.
4. **Clouds: march a fraction of the pixels each frame.** Update one pixel of each 2x2 or 4x4 block per frame in a rotating pattern and reproject the previous result for the others (the method in Guerrilla's "Nubis" cloud talks for Horizon Zero Dawn, 2015 and 2017). With the per-step cost measured at 0.15 to 0.28 ms, a quarter-rate update would cut about 2 to 4 ms at the same step count, or allow more steps for the same cost. The existing per-pixel jitter and temporal pass already hide the noise.
5. **Clouds: spend steps only where there is cloud.** Skip empty space with large steps using the coarse coverage the game already has, switch to fine steps on first hit, and stop at about 99% opacity. Cheaper light sampling toward the sun (a few widening cone samples) keeps the shading. From orbit the cloud field changes slowly, so it could also be rendered into a texture wrapped on the sphere and refreshed a slice at a time.
6. **Clouds: upscale with depth awareness.** The half-resolution result should be blended back using the full-resolution depth (a bilateral or nearest-depth upsample) so mountain and tree edges stay crisp; then the cloud pass could drop below half resolution without visible loss.
7. **Ambient occlusion at half resolution with temporal accumulation.** 12 samples per pixel at full resolution costs 1.9 to 2.9 ms on the ground. Half resolution, 4 to 6 samples, a depth-aware blur and the temporal pass give the same look for about a quarter of the cost.
8. **Do not draw what cannot be seen.** The aurora (2.3 ms from orbit) can be skipped when the sun is up over it or its strength is zero. The star field (2 ms from orbit) can be baked once into a cube texture. Both are pure savings.
9. **Atmosphere from lookup tables.** The shell costs 0.5 to 1.7 ms and scales with pixels. Precomputed transmittance and sky-view tables (Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique", 2020) make the per-pixel cost a couple of texture reads, and fix the altitude-dependent sky colour more robustly.
10. **Terrain: cut overdraw and far triangles.** Terrain is the largest single mesh cost (1 to 3.5 ms on WebGPU, 2.6 to 4.6 on WebGL2, 1.1 to 1.4 million triangles at ground level). Draw it front to back or lay down depth first so its expensive shading runs once per pixel, and choose patch detail by projected screen error so distant patches use fewer triangles (CDLOD, Strugar 2010, is a good fit for a quad-tree sphere).
11. **Pace the frames.** A steady 60 (or a steady 40 on a 120 Hz screen) looks smoother than a rate drifting between 45 and 52. Once the average is above the target, cap to it.

### B. Spend some of it on rounder, richer models

Geometry is so cheap here that these are affordable today:

1. **Blend the body parts at creation time.** Animals are assembled from separate tubes, blobs and flaps that meet at hard joins. Build each species once as a smooth union of the same parts (signed-distance smooth-minimum, then mesh it with marching cubes or dual contouring, or run two rounds of Catmull-Clark subdivision over a welded cage) and reuse that mesh for every individual. The cost is paid once per species, not per frame. Animals measured 0.06 to 0.35 ms for up to 553,000 triangles, so four to ten times the triangles would still be well under a millisecond.
2. **Smooth normals across joins**, and give flat flaps a second surface and a little thickness so they stop reading as cards.
3. **Ground the models.** Nothing casts a shadow on the ground, which is the main reason trees, animals and buildings look placed on a model railway. Cheapest first: a soft dark blob under each animal and tree (one extra quad each); then screen-space contact shadows from the depth buffer; then one shadow map covering the near field. The terrain already ray-marches its own shadows.
4. **Light models the way the land is lit.** Plants and animals use a simple wrap light with no shadow term (`src/render/lighting.ts`). Adding sky-coloured ambient that varies with the normal, a soft rim from the sun side, and for leaves a little light passing through (two-sided translucency) removes the flat single-colour look without any new geometry.
5. **Leaves with volume.** Replace each flat rosette with a small cluster of curved leaf shapes, or keep the cards and give them a normal map bent outward from the crown centre so the crown shades like a rounded mass. Near trees measured 1.0 to 1.7 ms for about 220,000 triangles.
6. **Far trees that match near trees.** Bake colour, normal and depth into the far pictures from several directions (octahedral impostors, as popularised by Ryan Brucks' Unreal work) so they are lit by the same light as the real models and turn correctly with the camera.
7. **Hide the hand-over.** Cross-fade near model and far picture over a short distance with a per-pixel dither pattern; the temporal pass turns the dither into a smooth blend, so nothing pops.
8. **Fur as shells, close up only.** Draw furry animals near the camera as 8 to 16 thin offset layers with a noise mask (Lengyel's shell method, 2001). It reads as hair instead of speckle, and only a handful of animals are ever that close.
9. **Buildings: bevels and ground contact.** 4,000 buildings cost nothing measurable. Bevelled edges, a darker base where walls meet the ground, and a few larger shared textures for walls and roofs would lift towns a long way for free.

### C. Hygiene

- Look into the script-time question above before it becomes the limit.
- Compile shaders and pipelines ahead of first use (asynchronously, during loading) to avoid a hitch when a new kind of object first appears. Not measured here.
- Instanced meshes that are rewritten every frame could be culled on the GPU and drawn indirectly. Only worth doing if the script-time question turns out to be real work.

## What I did not measure

- Anything on a weaker GPU or a phone. The pixel-cost finding should hold there, only more so.
- Ocean wave simulation as a separate cost (hiding the ocean mesh saved 0.3 to 1.4 ms on WebGPU, but the wave update may run regardless).
- Rain and snow (none was falling in these views), under water, and the Night Map overlay.
- Hitches and stutter. These are averages over two seconds.
