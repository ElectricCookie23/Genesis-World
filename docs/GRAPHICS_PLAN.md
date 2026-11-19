# Graphics overhaul: working plan

The owner's brief is `docs/GRAPHICS_BRIEF.md`. This file is the plan for carrying it out, written before any graphics code changes. Update it as steps finish.

## Rules for this phase (owner's direction)

- **No downgraded targets.** FFT ocean, GPU hydraulic erosion and TAA are built in full on WebGL2: render-to-texture ping-pong for the FFT and the erosion, a history buffer for TAA.
- **Quadtree LOD terrain replaces tessellation.**
- **WebGPU is optional**, behind feature detection, only where it adds quality. WebGL2 must look the same on the High preset.
- **Screenshots here check correctness, not final look.** The build machine renders in software (about one frame per second, no WebGPU). The owner checks the look on a real GPU from the deployed site, so every step is pushed once it is correct.
- **Graphics only.** Simulation logic is not changed, except to expose data the renderer needs.
- Screenshots are taken by stepping frames by hand and grabbing the canvas (`window.__genesis.grab()`), at about 800x500.

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

The status of every step is kept in the table at the top of PROGRESS.md.

After each step: retake the eight views, compare, fix, then commit as `gfx: ...` and push.

## How the WebGL2 versions are built

- **Render-to-texture passes** use three's `RenderTarget` and `QuadMesh` with node materials, which run on both the WebGL2 and WebGPU backends, so there is one code path.
- **FFT ocean:** a Phillips-type spectrum driven by the sim's wind, animated in time, inverse-transformed with butterfly passes (log2 N horizontal plus log2 N vertical) between two float targets. Height in one complex channel pair, horizontal displacement (x + i z) in the other, so one RGBA target carries everything. Normals and foam (Jacobian) from a final pass. Tiled over the sphere with triplanar blending, in several cascades.
- **Hydraulic erosion:** a pipe-model shallow-water simulation (water, sediment, flux, velocity) run for a few hundred iterations in ping-pong targets on a tileable height field seeded per planet, baked once at load. The result is the terrain's detail height and normal, applied with triplanar mapping so it never stretches or seams.
- **TAA:** jittered projection, velocity buffer, history buffer with neighbourhood clamping (three's TRAA node), then sharpening.
