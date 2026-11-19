# GENESIS: Build Brief

<role>
You are the sole engineer, technical artist and designer on this project. You work autonomously from start to finish. Do not ask questions. When something is unclear, make the decision a great senior game/graphics engineer would make, write it down in DECISIONS.md, and keep going.
</role>

<goal>
Build "Genesis," a 3D web experience of a small planet where geology, climate, life and eventually civilization evolve on their own in real time. It is a living simulation you watch and poke at, not a game with goals or a win state.

The magic comes from three things working together:
1. It looks beautiful at every moment, like a museum diorama that is alive.
2. Nothing is scripted. Every species, extinction and city emerges from the simulation.
3. Everything connects. Every event records what caused it, so the user can click anything and trace the story back to its root.
</goal>

<success_criteria>
The project is done when:
- A first-time visitor sees something gorgeous within 3 seconds of the page loading.
- Leaving it running for 10 minutes at high speed produces a visibly different planet with named species, at least one extinction and readable cause chains.
- Five different seeds produce five clearly different histories.
- It holds 60fps on a mid-range laptop and 30fps on a recent phone.
- Every feature from Tier 1 works well. Tier 2 and Tier 3 work as far as time allows, without breaking Tier 1.
</success_criteria>

---

## 1. TECH STACK

Use exactly this unless something is impossible, in which case note the swap in DECISIONS.md:

- **Build:** Vite + TypeScript (strict mode)
- **3D:** Three.js, using the WebGPU renderer with automatic WebGL2 fallback. Write shaders in TSL (Three Shading Language) so they work on both.
- **UI overlay:** Preact with plain CSS modules. Keep it light, because the 3D canvas is the star.
- **Simulation:** runs in a Web Worker. Use a simple entity-component structure built on typed arrays (structure of arrays) for creatures and plants.
- **Audio:** Tone.js for generative music and Web Audio for spatial sound.
- **Noise:** the `simplex-noise` package with a seeded PRNG (write a small mulberry32 or sfc32).
- **Storage:** IndexedDB (through `idb-keyval`) for saved planets and snapshots.
- **Fonts:** bundle them with `@fontsource` packages, with no external font CDN.
- **Assets:** CC0 or public domain only. Log every asset in CREDITS.md with its source URL and license. Prefer generating textures and sounds procedurally over downloading them.

---

## 2. ARCHITECTURE

### Folder structure
```
/src
  /sim        simulation (runs in the worker; no Three.js imports allowed here)
    world.ts        planet grid and cell data
    climate.ts      temperature, moisture, wind, weather, seasons
    geology.ts      tectonics, volcanoes, erosion, sea level
    plants.ts
    creatures.ts    bodies, behaviour, energy, reproduction
    genetics.ts     genome, mutation, speciation
    civilization.ts
    events.ts       event log and cause graph
    rng.ts          seeded PRNG
    worker.ts       entry point and fixed-timestep loop
  /render     everything visual
    planet.ts  ocean.ts  atmosphere.ts  clouds.ts  vegetation.ts
    creatures.ts  effects.ts  postfx.ts  camera.ts
  /ui         Preact components
  /audio
  /shared     types and message protocol between worker and main thread
/tests        headless simulation tests (Node, no browser)
```

### Core rules
- **The simulation is deterministic.** The same seed plus the same god-tool actions at the same sim times must give the same history. All randomness goes through the seeded PRNG. No `Math.random()` in /sim.
- **Sim and render are separate.** The worker owns all world state and runs a fixed timestep. Every frame it posts a compact snapshot (typed arrays, transferred, not copied) to the main thread. The renderer interpolates between snapshots.
- **Planet grid:** a subdivided icosphere of about 40,000 cells. Each cell stores elevation, plate id, temperature, moisture, biome, soil fertility, vegetation density, snow depth and water depth.
- **Time:** sim time is measured in years. One tick equals a variable number of years depending on the speed setting. Fast geological processes (tectonics) update on a slow schedule, while fast ones (creature movement) update every tick at 1x speed and are summarized statistically at high speeds.
- **Level of detail for life:** at high time speed, or when the camera is far away, simulate populations per cell statistically. Simulate individual creatures fully only near the camera or in follow mode. Switching between the two must be seamless.
- **Spatial hash** for creature neighbor queries.

### The cause graph (the most important system after the planet itself)
Every significant event is an object:
```ts
{ id, type, simYear, cellId, title, description, causes: EventId[], effects: EventId[], speciesIds? }
```
Systems must link causes whenever they create an event. Examples:
- A volcano eruption causes ash cover, which causes a regional cooling event, which causes the decline of a species.
- A species extinction lists every event that contributed, weighted.
- A civilization's religion lists the real event it was founded on.

The "Why did this happen?" panel walks this graph backward and shows it as a vertical story with a small thumbnail for each step.

### Performance budgets
- Desktop: up to 5,000 individually simulated creatures, 60,000 plant instances, 60fps.
- Mobile: 1,500 creatures, 15,000 plants, 30fps.
- Use instanced meshes for all plants and creatures. Use LOD (3 levels) for creatures and vegetation.
- Adaptive quality: if FPS drops below target for 2 seconds, step down shadow quality, then post-processing, then instance counts.

---

## 3. GRAPHICS AND ART DIRECTION

> **Superseded (owner's direction).** The art direction below (stylized low-poly diorama, Earth-like colours) has been replaced. The current direction is in `docs/GRAPHICS_BRIEF.md`:
> 1. **It is an alien world, not Earth.** Its own star, sky, seas, rocks, life and nations. Colours come from the simulation and the seed (star type, air composition, minerals, plant pigments), never from Earth defaults.
> 2. **High-fidelity, cinematic 3D** at every scale, not low-poly: smooth quadtree LOD terrain with per-pixel PBR materials and GPU-eroded detail, FFT ocean, volumetric clouds, multiple-scattering atmosphere, readable night side with nations as coloured networks of light, translucent aurora curtains, real plant and creature detail, TAA.
>
> Rules: full techniques on WebGL2 (ping-pong render targets, history buffer), quadtree LOD instead of tessellation, WebGPU optional, WebGL2 must match on High. The original text is kept below for reference only.

The look sets the tone for everything. Spend real effort here.

### Overall style
- **Stylized low-poly with high-end lighting.** Faceted terrain and creatures, but with soft physically based light, real shadows and atmosphere. Think of a handcrafted museum diorama, or a tiny planet in a snow globe.
- **Readable at every scale:** from space you see continents, clouds and city lights. On the ground you see individual creatures, grass and footprints.
- **A color grade that shifts with the era:** warm golds in greenhouse eras, cold blues in ice ages, a sickly haze during impact winters.

### Planet and terrain
- Flat-shaded faceted terrain colored by biome per vertex. Blend smoothly between biomes over 2 to 3 cells.
- Snow placed by elevation, slope and temperature. It builds up and melts with the seasons.
- Visible rivers as ribbon meshes that follow the water flow.
- Gentle height exaggeration so mountains read from space.

### Ocean
- Depth-based color from turquoise shallows to deep navy.
- Fresnel reflections and a sun glint.
- Foam lines on coasts and around islands.
- Animated waves whose strength follows the local wind and storms.
- Seen from inside: light rays, caustics on the seafloor, floating particles, kelp.

### Atmosphere and sky
- Physically based Rayleigh and Mie scattering, so sunsets turn orange and red at the day/night line and the planet's rim glows blue from space.
- Volumetric-looking clouds: a cloud shell with noise-driven density that moves with the simulated wind, casts shadows on the terrain, and thickens into storm cells.
- Lightning lights up clouds from inside.
- Space background: a procedural starfield and a faint nebula skybox, with the moon lit correctly by the sun.
- Auroras: animated ribbon shaders at the poles, stronger during solar events.

### Vegetation
- Instanced low-poly trees, bushes, grass tufts and flowers. Their shape and color come from plant genes.
- Vertex-shader wind sway that follows the simulated wind direction and strength.
- Seasonal color: leaves turn in autumn and drop in winter.
- Night: bioluminescent species glow softly.

### Creatures
- Procedural meshes generated from the genome: torso, limbs, neck, head, tail, horns, fins, wings, shells, patterns.
- Flat shading with a subtle rim light so they stand out from the terrain.
- Procedural animation: walk cycles with simple IK so feet land on the terrain, wing flaps, fin undulation, breathing, head turns toward targets.
- Patterns (stripes, spots, gradients) drawn in a shader from gene values.
- Emissive patches for glowing species.

### Effects
- Volcano: glowing lava flows, an ash plume particle system, darkened sky downwind.
- Meteor: a burning entry trail, a flash, a shockwave ring, flying debris, a crater, and a dust cloud spreading across the sky.
- Wildfire: spreading flame particles, smoke columns, scorched terrain that greens up again later.
- Rain, snow and dust as particles near the camera.
- City lights as emissive points on the night side that grow into networks.

### Post-processing
- ACES tone mapping, bloom (for lava, auroras, city lights, bioluminescence), ambient occlusion, a slight vignette, film grain at a low level.
- Depth of field only in follow mode and postcard mode.
- Color grading per era as described above.

### UI style
- Minimal, translucent dark panels with soft blur. The planet always stays the focus.
- Two typefaces: an elegant serif for species and place names (for example Cormorant or EB Garamond), and a clean monospace for data (for example JetBrains Mono).
- Every number animates when it changes. Panels slide in and out smoothly.
- The UI hides itself after 4 seconds of no mouse movement.

---

## 4. FEATURES (ranked by priority)

Build in this order. A lower number always beats a higher number when you have to choose. Tier 1 must be excellent before Tier 2 starts.

### TIER 1: The core wonder (1 to 40)
1. Procedural icosphere planet with oceans, continents, mountains, rivers and polar caps.
2. Biomes driven by temperature and moisture.
3. Day/night cycle, plus axial tilt that creates seasons.
4. Atmospheric scattering with blue rim glow and real sunsets.
5. Cloud shell that moves with simulated wind and casts shadows.
6. Glassy ocean with depth color, sun glint and coastal foam.
7. Orbiting moon whose tides visibly move the coastline.
8. Plants that spread by biome, light and rain, so forests and grasslands form on their own.
9. Plants evolve height, color, leaf type and fruit.
10. Creatures built entirely from genomes: legs, fins or wings, size, neck, horns, tail, color, pattern, glow.
11. Procedural walking with feet planted on the terrain.
12. Energy, hunger, reproduction, aging and death.
13. Mutation, with natural selection emerging on its own.
14. Speciation detection, with each new species given a generated Latin-style name.
15. Herbivores, predators and scavengers in a live food web.
16. Herds, flocks and fish schools.
17. Pack hunting, and prey that flee.
18. Life starts in the sea and moves onto land over time.
19. Flight evolves gradually, starting with gliding.
20. The cause graph: every event stores its causes and effects.
21. "Why did this happen?" panel on any event.
22. One continuous camera zoom from deep space down to the ground.
23. Follow mode: click a creature and the camera tracks it, with an info card (name, species, age, genes, lineage, current action).
24. Time controls from paused to Epoch speed (see section 7.2).
25. A live, glowing tree of life. Clicking a branch flies the camera to that species.
26. A chronicle narrated like a nature documentary.
27. Milestone pop-ups: "First eye," "First flight," "First fire," "First city."
28. Storm cells with lightning, and rain that drives plant growth.
29. Lightning starts wildfires, followed by regrowth (grass, then shrubs, then forest).
30. Ice ages and warm eras, with biomes migrating as the climate changes.
31. Sea level rises and falls, opening and closing land bridges.
32. Volcanic eruptions with lava, ash and fertile ground afterward.
33. Meteor strike god tool: shockwave, crater, impact winter.
34. Mass extinctions, each logged with its causes.
35. Adaptive radiation that refills empty niches after extinctions.
36. Night side: bioluminescent plants and creatures.
37. Auroras over the poles.
38. Generative ambient music that shifts with the planet's state.
39. Postcard mode: UI hidden, slow cinematic camera.
40. Seed codes: a shared code replays the same world exactly.

### TIER 2: The emergent stories (41 to 95)
41. An intelligence threshold any lineage can cross.
42. Campfires appearing on the night side.
43. Villages, then city lights visible from orbit.
44. Cave paintings depicting the real species they hunted.
45. Religions founded on real events (the comet, the eclipse, the volcano).
46. If the user intervenes a lot, civilizations build temples facing the camera.
47. Domestication: tamed species start evolving in new directions.
48. Agriculture that turns land into fields.
49. Roads that follow ancient migration trails.
50. Ruins that forests overgrow, later found by a second intelligent species.
51. Plate tectonics with drifting continents.
52. Mountain building at plate collisions, creating rain-shadow deserts.
53. Earthquakes and tsunamis.
54. Hotspots that build island chains.
55. Erosion that carves canyons and grows deltas.
56. Ocean currents that carry heat.
57. Rafting: creatures ride storm debris to colonize islands.
58. Coral reefs and atolls, with bleaching in heat waves.
59. Plankton blooms visible from orbit, and bioluminescent waves at night.
60. Hurricanes with a visible eye.
61. Snow that builds up and melts, feeding the rivers.
62. Oxygen level tracked, with a giant-insect era when it spikes.
63. Seasonal migrations that wear trails into the land.
64. Hibernation, and day versus night species.
65. Camouflage evolving to match each biome.
66. Sexual selection: mating displays and ornaments.
67. Nests and parental care.
68. Disease outbreaks spreading through herds.
69. Symbiosis pairs.
70. Flowers co-evolving with pollinators.
71. Toxin versus resistance arms races, shown on a chart.
72. Convergent evolution detector ("Two unrelated lineages have both evolved into crab-like forms").
73. Island dwarfism and gigantism.
74. Flight lost on predator-free islands.
75. Land species returning to the sea as ocean giants.
76. Echolocation shown as ripples.
77. Electric fish with visible arcs.
78. Metamorphosis, with larval and adult forms that look completely different.
79. Hive species with growing mounds.
80. Keystone species whose loss collapses an ecosystem.
81. Invasive species crossing land bridges.
82. Living fossils flagged when a species stays unchanged for eons.
83. Fossil layer: see-through ground showing bones where extinct species died.
84. Auto-generated field guide with a sketch-style card for every species.
85. Extinction memorial.
86. Rewind timeline with snapshots and major events marked.
87. God tools: ice age, heat wave, raise mountains, flood, plague, lightning.
88. Custom species designer.
89. A monolith that speeds up intelligence nearby.
90. Overlays: temperature, rain, population, genetic diversity, oxygen.
91. Graphs of population, biomass and atmosphere over time.
92. First-person creature view.
93. Creature calls generated from body size.
94. Spatial sound: wind, rain, thunder, waves, lava.
95. Documentary director: an auto-camera that cuts to whatever is most interesting right now.

### TIER 3: Depth and wonder (96 to 150)
96. Solar eclipses that make creatures go quiet.
97. Comets that return on a long cycle and become myths.
98. Meteor showers that trigger mutation bursts.
99. A rare captured second moon.
100. Shattering the moon into a ring system.
101. Ring shadow creating a cold stripe biome.
102. A nearby supernova with a radiation spike.
103. The sun brightening over the far future.
104. Constellations named after extinct species.
105. Binary-sun seeds with double shadows.
106. The supercontinent cycle.
107. Supervolcano ash winters.
108. Glaciers carving fjords.
109. Cave networks with blind, pale species.
110. Hydrothermal vent ecosystems.
111. Geysers and hot springs.
112. Salt flats where inland seas dry.
113. Tornadoes.
114. Fire tornadoes in big wildfires.
115. Dust storms that fertilize the ocean.
116. Acid rain after eruptions.
117. Valley fog, rainbows and heat shimmer.
118. The ozone layer, and what happens when it's stripped.
119. A snowball-planet event.
120. Permafrost thaw speeding up warming.
121. Civilizations burning ancient swamp coal and warming the planet.
122. Plagues traveling along trade routes.
123. Trade boats crossing the seas.
124. Tribal wars and borders.
125. A space age with satellites and a radio signal.
126. Possible nuclear winter.
127. Departure: a civilization leaves the planet as a light rising into space.
128. Giant mushrooms and glowing fungal networks, shown in an x-ray view.
129. Carnivorous plants in poor soil.
130. Autumn colors.
131. A marker on the oldest living tree.
132. Gas-bladder creatures drifting like blimps.
133. Living islands: sea giants with forests on their backs.
134. Walking forests.
135. Mass hatchings that light up the ocean.
136. Bone graveyards.
137. A rare golden mutant.
138. An eternal storm sitting over one spot.
139. A full underwater exploration view.
140. Cross-section slice showing rock layers, caves and roots.
141. Flat map view.
142. Photo mode with film filters.
143. Timeline fork that runs two futures side by side.
144. Full family tree of any individual creature.
145. Intelligent species developing their own music.
146. Near silence after a mass extinction.
147. More god tools: gene ray, shield dome, summon comet, tilt axis, rain of life.
148. Hands-off mode that locks all god tools.
149. GIF and video recording.
150. Export a planet's history as an illustrated PDF book.

---

## 5. SIMULATION RULES OF THUMB

- **Stability first.** Populations must self-regulate through food limits, predation and disease. No instant extinction at the start, and no population explosions.
- **Selection must be real.** Fitness comes from what actually happens to the creature (finding food, escaping, staying warm), never from a hand-written score.
- **Speciation:** cluster genomes regularly. When a group's average genetic distance from its parent passes a threshold, and it is geographically or behaviourally separated, it becomes a new species.
- **Names:** build Latin-style names from roots tied to traits (Velox for fast, Magnus for large, Umbra for dark, Lux for glowing, plus a biome or place root).
- **The chronicle** is generated from the cause graph using templates with variety. Each entry gives the sim year, what happened and why, in a calm documentary voice. Never repeat the same sentence template twice in a row.
- **Civilization** is abstracted: settlements are entities with population, technology level, beliefs and resources. They are not individual people.

---

## 6. WORK PROCESS

### Repository (all work lives here)
- Repo: https://github.com/ElectricCookie23/Genesis-World
- At the start of every session: clone it (or `git pull` if it's already cloned). If it's empty, initialize the project inside it on the `main` branch.
- Commit after every working stage, and after any feature that works on its own. Use clear messages like `feat(#23): follow mode with info card` or `fix: ocean foam flicker on mobile`. Do not add a Co-Authored-By line to commits.
- Push to `origin main` after every commit, so the repo is always up to date and nothing is lost if the session stops at a usage limit.
- Never commit node_modules, build output, .env files, API keys or other secrets. Set up a proper .gitignore in the first commit.
- Add a GitHub Actions workflow that runs `npm test` and the TypeScript check on every push, and deploys the built site to GitHub Pages from `main`. That way the live site updates automatically with every push. Put the Pages URL at the top of the README.
- If a push fails because of authentication or permissions, do not try workarounds. Keep committing locally, and say clearly in your final message that pushing failed and why.

### Progress tracking (important, because sessions may stop at usage limits)
- Keep PROGRESS.md in the repo as a checklist of all 150 features with status: not started, in progress, done, or simplified. Update it in the same commit as the work.
- If you are resuming, pull the repo, then read BRIEF.md (this document, saved in the repo in the first commit), PROGRESS.md, DECISIONS.md and the git log. Continue from where you stopped. Never restart from scratch.

### Build order
1. Project setup, repo, CI workflow, PRNG, worker loop, message protocol.
2. Planet, terrain, ocean, atmosphere, clouds, lighting, post-processing, and the opening sequence (section 7.1). Make it beautiful before any life exists.
3. Climate, weather, seasons, moon tides.
4. Plants.
5. Creatures, genetics, behaviour, speciation.
6. Cause graph, chronicle, camera modes, core UI. (Tier 1 complete.)
7. Tier 2 in numbered order.
8. Tier 3 in numbered order.
9. Audio polish, performance pass, final QA.

### Testing after every stage
- **Headless sim tests** in /tests (run with Node): run 5 seeds for at least 100,000 sim years each and check that:
  - there are always at least 5 living species after life begins
  - no population grows by more than 10x in a single sim century without a cause recorded in the graph
  - global temperature stays within survivable bounds unless an event caused otherwise
  - the same seed gives identical results twice
- **Visual checks:** if a headless browser is available, take screenshots from space, from mid-altitude, at ground level and on the night side, look at them critically, and fix anything that looks broken, flat or ugly.
- **Performance check:** measure FPS at 1x and 1000x with full populations. Fix anything below budget before moving on.
- Fix all TypeScript errors and console errors before every commit.

### When something is hard
- Simplify it rather than skip it, and record what you simplified in PROGRESS.md.
- Never break a lower-numbered feature to add a higher-numbered one.

---

## 7. EXPERIENCE SPEC

### 7.1 The opening sequence (first thing anyone sees)
1. The page loads to a black screen with a faint starfield and the word GENESIS in the serif font, which fades out as the scene starts. Never show a blank or white screen.
2. 0 to 4 seconds: a swirling disc of glowing dust and rock around a young sun. The camera drifts slowly toward it.
3. 4 to 8 seconds: the debris clumps together into a molten lava planet, glowing orange-red, with a bright flash when the moon-forming impact hits and the moon spins off into orbit.
4. 8 to 13 seconds: the surface cools and darkens into black rock, steam rises, the atmosphere fades in as a blue rim, and the first rain falls.
5. 13 to 16 seconds: oceans fill the low ground and the camera settles into a slow orbit. A single line of chronicle text appears: "Year 0. The world is quiet. The water is warm."
6. The UI fades in. The simulation starts at 100x.
- The planet that forms must be the actual seeded planet (same continents), not a generic animation.
- A "Skip" button appears after 2 seconds, and the opening never plays again for that saved planet.
- Respect the reduced-motion setting: if it's on, show a short fade instead.

### 7.2 Pacing and time speeds
Speed settings: Pause, 1x, 10x, 100x, 1000x, and Epoch.
- 1x is for watching creatures up close: one sim day per real second.
- Epoch is the maximum speed. Tune it so a full history takes 20 to 30 real minutes.

Target timeline at Epoch speed (tune the sim parameters to land near these, then let emergence vary them):
- 0 to 3 min: microbial life and simple sea creatures.
- 3 to 7 min: plants green the continents, and the first animals crawl onto land.
- 7 to 13 min: big radiations, the first flight, the megafauna era, at least one mass extinction.
- 13 to 20 min: a lineage may cross the intelligence threshold (in roughly 60% of seeds, not all of them).
- 20 to 28 min: civilization, if one emerged.
- After 28 min: the far future (sun brightening, departure, or a planet that slowly goes quiet). The sim keeps running for as long as the user wants.

At high speeds, automatically switch to statistical population simulation (see section 2) and slow down briefly when a milestone or major event happens, so the user doesn't miss it. Make this "slow down on big events" setting optional and on by default.

### 7.3 Controls
Desktop:
- Left-drag: orbit. Scroll: zoom (one continuous range from deep space to the ground). Right-drag: pan and tilt when close to the surface.
- Click: select a creature, plant, settlement or event marker. Double-click: follow it.
- Space: pause/play. 1 to 6: speed settings. F: follow the selection. Esc: leave follow mode or close the panel.
- P: postcard mode. H: hide/show the UI. T: tree of life. C: chronicle. G: god tools. M: flat map. O: overlays. ?: controls help.

Touch:
- One finger: orbit. Pinch: zoom. Two-finger drag: pan and tilt.
- Tap: select. Double-tap: follow. Long-press on the planet: open the god tools at that spot.

Show a small hint of the main controls the first time, and keep a "?" button for the full list.

### 7.4 The genome
Every creature has these genes. Store each as a float from 0 to 1 and map it to the ranges below. Each trait has an energy cost, so no creature can max everything.

Body: size (5 cm to 8 m), body length-to-height ratio, segment count (1 to 12), limb type (none, fins, legs, wings), limb pairs (0 to 4), limb length, neck length, tail length, head size, horn size, shell/armor thickness, insulation (none, fur or feathers).
Senses: eye count (0 to 6), eye size, sight range, hearing, smell, echolocation (switches on above a threshold), electric sense.
Looks: base hue, secondary hue, pattern type (solid, stripes, spots, gradient), pattern scale, glow strength, glow hue, ornament/display size, color-change ability.
Metabolism: diet (0 = plants, 1 = meat, with omnivores in between), warm- or cold-blooded, metabolic rate, toxicity (being poisonous), toxin resistance, venom, heat tolerance, cold tolerance.
Life history: lifespan, age at maturity, offspring per birth, parental care, metamorphosis (switches on above a threshold).
Behaviour: sociality (herding), aggression, boldness, curiosity, nocturnality, water affinity, burrowing, migration drive, territoriality, intelligence.

Mutation: each gene mutates with a small Gaussian change at birth. 1% of births get one large jump in a single gene, which creates sudden novelties. Discrete genes (limb type, pattern type) change rarely.

Plants have a smaller genome: height, leaf type, leaf hue, flower hue, fruit size, thorns, toxicity, growth rate, seed dispersal method, water need, glow, fire resistance.

### 7.5 Everything else
- **Loading screen:** the black starfield with GENESIS and a thin progress line. No spinners.
- **No WebGPU:** fall back to WebGL2 silently. If neither works, show a clear, good-looking message explaining which browsers to use.
- **Mobile layout:** panels become bottom sheets, the main toolbar sits within thumb reach at the bottom, and touch targets are at least 44px. Mobile starts on the lower quality preset.
- **Saving:** autosave every 2 minutes to IndexedDB. Up to 10 named save slots. Rewind snapshots go in a ring buffer (the last 50 major points in history).
- **Settings panel:** quality preset (low, medium, high, ultra), music volume, sound volume, reduced motion, colorblind-safe overlay palettes, "slow down on big events" toggle.
- **First visit:** three short hints only (how to move, how to follow a creature, how to change speed). No long tutorial.
- **Errors:** if the worker crashes, recover from the last autosave and show a small notice. Never leave the user staring at a frozen planet.

---

## 8. DELIVERABLES
- The complete project pushed to https://github.com/ElectricCookie23/Genesis-World, building with `npm run build` as a static site.
- A live site on GitHub Pages, deployed automatically by GitHub Actions on every push to `main`.
- README.md: the live site link at the top, what Genesis is, how to run it locally, controls, a short tour of the best features, and screenshots.
- BRIEF.md (this document), PROGRESS.md, DECISIONS.md, CREDITS.md.
- A `npm test` command that runs the headless simulation tests.
