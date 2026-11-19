# GENESIS: Graphics Overhaul

<role>
You are the lead technical artist and graphics engineer on Genesis (repo: https://github.com/ElectricCookie23/Genesis-World). Work autonomously and don't ask questions. Pull the repo first and read BRIEF.md, PROGRESS.md and DECISIONS.md. This session is graphics only: do not change simulation logic, except to expose data the renderer needs.
</role>

<new_direction>
Two big changes to the art direction. Update section 3 of BRIEF.md to match before you start, and log both in DECISIONS.md.

1. **It is an alien world, not Earth.** It's a planet in its own system, maybe a neighbor of ours, with its own geography, its own colors, its own life and its own nations. Nothing should look like a copy of Earth: no Earth-shaped continents, no Earth-green defaults, no Earth-style city lights. It should still feel believable, as if a real space probe photographed it.
2. **Drop the low-poly diorama look.** The target is now high-fidelity, cinematic HD 3D with rich detail at every scale: from orbit, from mid-altitude and on the ground. Think of the quality of a modern AAA space game or a feature-film planet shot, running in the browser.
</new_direction>

<problem>
The attached screenshot shows the current night side from space. It reads as a prototype:

1. The night side is almost pure black. Continents, oceans and clouds can't be read, and the terminator is barely visible.
2. City lights look like confetti: identical star-shaped sprites, evenly scattered, over-bloomed. They make the planet look like a toy.
3. The aurora is a solid, opaque wall standing off the planet like a crown, with a blob at the south pole.
4. The silhouette is jagged, with polygon steps and boxy chunks sticking out.
5. Clouds are flat gray patches with no volume, and they don't block the lights below.
6. Land and ocean look the same at night.
7. The atmosphere glow is uniform all the way round.
8. The image is muddy overall: crushed blacks, wrong bloom, low detail.
</problem>

---

## 1. ALIEN ART DIRECTION

All colors come from the simulation, not hard-coded Earth values:
- **Star type per seed** (yellow, orange or white-blue star). It sets the sunlight color, the sky color and what pigments plants evolve. Under an orange star, vegetation tends toward deep reds, purples and near-black. Under a blue-white star, it trends toward teal, gold or silver.
- **Sky color** comes from the simulated atmosphere composition, so it can be teal, amber, lavender or pale green depending on the seed and era.
- **Ocean color** comes from depth, dissolved minerals and plankton blooms: from glassy jade to ink-violet to deep cobalt.
- **Landforms** feel alien but plausible: tall eroded mesas, salt-crust basins, crystal-banded cliffs, spiral river deltas, terraced volcanic shields, polar ice with visible blue fracture lines.
- **Moon:** keep the single moon from the brief, but make it distinctive, with its own color (pale ochre, rust or bone-white) and visible craters and maria. Moonlight takes on its tint.
- Every seed should look like a different world from orbit, not the same planet recolored.

## 2. NATIONS AND THE NIGHT MAP

When a civilization rises, the night side becomes a map of its world:
- **Each civilization or nation has its own light signature.** The color comes from the species' biology and technology, for example cyan bioluminescent lighting, amber fire-light or magenta plasma light. The night side shows political divisions by color, not just brightness.
- **Hierarchy:** capitals are the brightest, then cities, towns and faint villages. Use a log scale on population so big cities don't blow out.
- **Shape:** each city has a dense core that frays outward along roads in irregular noise patterns. No circles, no sprites, no stars.
- **Networks:** glowing threads of roads, rail and trade routes connect settlements, hugging coasts, rivers and valleys. Ports glow at river mouths. Faint lines of ships cross the seas. In later eras, offshore platforms and a sparse ring of satellites glint in orbit.
- **Borders:** a toggleable "Night Map" overlay draws national borders as fine luminous lines, with invented country names in the serif font and generated emblems (simple geometric flags built from each nation's colors and values).
- **History shows in the lights:** war zones flicker and dim, plague regions go dark, and a collapsed nation's lights fade out over decades. Clouds dim the lights beneath them by 60 to 90%.
- **Bloom on cities is subtle:** small radius, high threshold, a soft glow and never a flare.

## 3. HIGH-FIDELITY RENDERING

### Planet surface
- Chunked quadtree LOD on a cube-sphere, with geometry refining smoothly as the camera approaches. The silhouette must be perfectly smooth at every zoom.
- High-detail procedural terrain: multi-octave ridged and eroded noise for heights, plus GPU hydraulic erosion detail baked per chunk where affordable.
- **Materials:** full PBR (albedo, normal, roughness, AO, height) for rock, sand, soil, ice, snow, salt crust, volcanic glass, mud and vegetation ground cover. Blend them by slope, height, moisture and temperature from the sim, using triplanar mapping on cliffs so nothing stretches.
- Detail normal maps and parallax occlusion mapping up close, plus tessellated displacement within about 200 m of the camera.
- Dynamic surface states: wet and darker after rain, snow cover building up on upward-facing slopes, scorched ground after fires, ash after eruptions.
- Generate textures procedurally on the GPU at high resolution (2K to 4K equivalent detail), or source CC0 PBR texture sets (such as ambientCG or Poly Haven) recolored to the alien palette. Credit everything in CREDITS.md.

### Ocean
- FFT-based wave simulation (Tessendorf style) driven by the sim's wind, with big swells in storms and calm in still air.
- Foam on crests and along coasts, subsurface glow in wave tips, depth-based color, refraction in the shallows.
- Sun and moon glints, reflections of the sky (screen-space reflections close up, an environment map from far away).
- Underwater: caustics, light shafts, suspended particles, color absorption with depth.

### Atmosphere
- Precomputed multiple-scattering atmosphere (Bruneton style or similar) driven by the sim's atmosphere composition and the star color.
- A colored rim on the day side, a vivid band of sunset color at the terminator, a faint dark rim on the night side.
- Aerial perspective: distant terrain fades into the atmosphere color. Volumetric light shafts through gaps in the clouds.

### Clouds
- Raymarched volumetric clouds with multiple-scattering approximation, silver lining on sunlit edges, dark storm bases and moonlit night edges.
- Cloud types driven by the sim: thin high wisps, puffy cumulus, towering storm cells with anvil tops, polar stratus, cyclones with a visible eye.
- Clouds cast shadows on the terrain and ocean. Lightning lights them from inside.
- Smooth fly-through when the camera descends.

### Night side and lighting
- Moonlight tinted by the moon's color, at about 3 to 6% of sunlight, so continents, oceans and clouds are readable at night.
- A faint airglow layer high in the atmosphere, plus a very low starlight fill, so nothing is pure black except deep ocean.
- The terminator is a soft, visible gradient.
- Cascaded shadow maps for the sun and moon, contact shadows close up, ground-truth ambient occlusion (GTAO).

### Aurora
- Thin translucent curtains of vertical rays, additive and soft-edged, in a ring at about 65° to 75° from each magnetic pole, hugging the planet just above the atmosphere.
- Colors follow the atmosphere composition (green-violet on oxygen-rich worlds, red or pink on others). Brightest near the lower edge.
- Slow folding and rippling, with brightness pulses travelling along it. Strength follows solar activity in the sim.

### Vegetation
- Real geometry for trees and plants built from plant genes, with alpha-tested leaves, leaf translucency when backlit, and wind animation across trunk, branches and leaves.
- Imposters (billboards baked from the real models) at distance, with seamless LOD transitions.
- Dense grass and ground cover within about 60 m, with GPU instancing.
- Bioluminescent species glow at night and light the ground around them.

### Creatures
- High-detail procedural meshes from the genome, with proper skin materials: scales, plates, chitin, leathery hide, fur (shell rendering), feathers, glowing patches.
- Subsurface scattering on thin skin, wet sheen on aquatic species, iridescence where the genes call for it.
- Smooth skeletal animation with IK foot placement, secondary motion (tails, ears, fur) and eyes that track targets.
- Footprints, dust kicked up, splashes and wakes in water.

### Effects
- Volcanoes: glowing lava with crust that cools and cracks, ash plumes with volumetric shading, falling ash.
- Meteors: a burning entry streak, a flash, an expanding shockwave ring in the atmosphere, debris, a crater with glowing ejecta.
- Wildfires: flame fronts, embers, smoke columns that drift with the wind.
- Rain streaks, snowfall, dust storms and fog as volumetric or particle effects.

### Space background
- A deep, dark background with a very faint, low-contrast nebula that never competes with the planet.
- Stars with varied brightness and slight color variation. The local star as a bright disc with physically based glare and subtle lens flare.
- Other planets of the system visible as distant points or small discs.

### Post-processing
- AgX or ACES tone mapping with auto exposure that adapts between day side, night side and ground level. No crushed blacks.
- Physically based bloom with a high threshold. Only the star, lava, lightning, auroras and cities should bloom.
- TAA with sharpening, so thin features (roads, aurora rays, grass) don't shimmer.
- Depth of field in follow mode, photo mode and postcard mode only.
- Subtle film grain, chromatic aberration only at the very edges, light vignette.
- Color grade per era, driven by the sim (as in BRIEF.md).
- Render at native device resolution on the high and ultra presets, with dynamic resolution scaling to hold the frame rate.

---

## PERFORMANCE
- New quality presets: Low, Medium, High, Ultra. Ultra is allowed to need a strong desktop GPU. High must hold 60fps on a good laptop with a dedicated or recent integrated GPU. Low must hold 30fps on a recent phone.
- Every expensive effect (volumetric clouds, FFT ocean, tessellation, GTAO, SSR, fur) needs a cheaper fallback for lower presets.
- Use WebGPU compute for terrain chunks, ocean FFT and particles. Keep a WebGL2 fallback path working at reduced quality.
- Stream terrain chunks and textures in the background so zooming never hitches.

## PROCESS
1. **Before you change anything:** take screenshots of the current build from 8 fixed views: space day side, space night side, terminator, the night map with a civilization present, mid-altitude over a coast, ground level in a forest, ground level at night, and underwater. Save them to `/docs/screenshots/before/`.
2. Work in this order: alien art direction and atmosphere, planet geometry and materials, lighting and night side, clouds, ocean, nations and night map, aurora, vegetation, creatures, effects, post-processing, performance tuning.
3. After each step, retake all 8 views, compare them critically with the previous version, and keep iterating until each problem listed above is clearly solved. Be your own harshest art director. If something looks like a tech demo or like Earth, it isn't done.
4. Commit and push after each step with clear messages like `gfx: FFT ocean with wind-driven swells`. Do not add a Co-Authored-By line. Update PROGRESS.md as you go.
5. At the end, save the final 8 views to `/docs/screenshots/after/`, add a before/after section to the README, and log every major graphics decision in DECISIONS.md.

## DONE WHEN
- From orbit, the planet looks like a real, unfamiliar world photographed by a probe, and different seeds look like different worlds.
- The night side is readable, with nations visible as distinct, connected networks of colored light.
- The aurora looks like light, not geometry. No jagged silhouette, no floating chunks, no muddy blacks, no over-bloomed lights.
- Ground level holds up close: detailed terrain, real plants, convincing creatures.
- All 8 views look good enough to use as wallpapers.
- Performance targets are met on each preset.
