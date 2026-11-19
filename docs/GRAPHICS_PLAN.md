# Graphics overhaul: working plan

The owner's brief is `docs/GRAPHICS_BRIEF.md`. This file is the plan for carrying it out, written before any graphics code changes. Update it as steps finish.

## Constraints to be honest about

- The build machine has no GPU. Chromium runs WebGL2 through software rendering at roughly one frame per second, and WebGPU is not available at all. So:
  - Anything that needs WebGPU compute (FFT ocean, compute-baked erosion, compute particles) cannot be run or seen here. It gets a WebGL2-compatible technique that can be checked, and the compute path is only built where it can share that code.
  - Frame rates on real hardware cannot be measured here. Presets are budgeted by shader cost and instance counts, not by measured fps.
- Screenshots are taken by stepping frames by hand and grabbing the canvas (`window.__genesis.grab()`), at about 800x500.
- This phase is graphics only. Simulation logic is not changed, except to expose data the renderer needs (star type, atmosphere tint, nation of each settlement).

## The eight fixed views

1. Space, day side
2. Space, night side
3. Terminator
4. Night map with a civilization present
5. Mid-altitude over a coast
6. Ground level in a forest
7. Ground level at night
8. Underwater

"Before" set goes to `docs/screenshots/before/`, final set to `docs/screenshots/after/`. Views 4, 6 and 7 need life and settlements, so they are taken from a saved state of seed `amber-reef-101` after a long run, or with test data where a run is too slow.

## Architecture change at the heart of it

Today the planet is one flat-shaded icosphere of 79,380 triangles with per-vertex colours, and every other layer reads per-vertex attributes. That is what gives the jagged silhouette and the low-poly look.

New approach:

1. **Bake cell data into cube-map textures** on the main thread whenever a snapshot arrives: height, albedo inputs (biome, vegetation, snow, ash, fields, reef), masks (lava, lights by nation, cloud cover, moisture). A one-time table maps every texel to three cells and weights, so a re-bake is a weighted sum and takes milliseconds.
2. **Draw the planet as a chunked cube-sphere quadtree**: one shared 32x32 grid patch, instanced, with per-patch face, offset and scale. The vertex shader projects to the sphere, samples the height cube map, adds procedural detail noise that grows with zoom, and displaces. Patches split as the camera approaches; skirts hide cracks. The silhouette is smooth at every zoom.
3. **Shade per pixel**: normals from height derivatives plus detail noise, materials blended by slope, height, moisture and temperature with triplanar procedural textures, physically based lighting with the star's colour, moonlight, airglow and a soft terminator.
4. Ocean, clouds, atmosphere and night lights read the same cube maps instead of vertex attributes.

## Order of work (from the brief)

| Step | What | Status |
|---|---|---|
| 0 | "Before" screenshots of the eight views; update BRIEF.md section 3 and DECISIONS.md with the new direction | not started |
| 1 | Alien art direction: star type per seed, sunlight and sky colour from it, plant pigments, ocean minerals, tinted moon; atmosphere driven by composition | not started |
| 2 | Planet geometry and materials: cube-map bake, quadtree cube-sphere, per-pixel materials | not started |
| 3 | Lighting and night side: moonlight, airglow, starlight fill, soft terminator, exposure | not started |
| 4 | Clouds: ray-marched volume with cloud types from the sim, shadows, lightning inside | not started |
| 5 | Ocean: layered wind-driven waves, foam, depth colour, reflections; underwater look | not started |
| 6 | Nations and the night map: light signature per nation, hierarchy, frayed city shapes, road and sea networks, borders, names, emblems | not started |
| 7 | Aurora: thin translucent curtains hugging the atmosphere | not started |
| 8 | Vegetation: richer geometry, translucency, wind, distance imposters | not started |
| 9 | Creatures: smoother, more detailed bodies and skin materials | not started |
| 10 | Effects: lava, ash, meteors, fire, weather | not started |
| 11 | Post-processing: tone mapping with auto exposure, restrained bloom, anti-aliasing, grain | not started |
| 12 | Performance tuning and presets; "after" screenshots; README before/after | not started |

After each step: retake the eight views, compare, fix, then commit as `gfx: ...` and push.

## What will probably stay short of the brief

Said up front so it is not a surprise later:

- True FFT ocean, GPU hydraulic erosion, tessellation and temporal anti-aliasing depend on WebGPU features that cannot be exercised here. They will be approximated (layered Gerstner waves and noise normals, procedural erosion-like noise, quadtree refinement, a spatial anti-aliasing pass).
- Fur shells, feathers, skeletal animation with full IK, footprints and wakes are large systems on their own. Creatures will get smoother meshes, better materials and secondary motion first.
- "Wallpaper quality" at ground level is a high bar for a procedural browser renderer built without a GPU to look at. The orbit and mid-altitude views are where the biggest gains will be.
