# Progress

Status of all 150 features from BRIEF.md. Values: not started, in progress, done, simplified (with a note).

## Build stages

| Stage | What | Status |
|---|---|---|
| 1 | Project setup, repo, CI workflow, PRNG, worker loop, message protocol | done |
| 2 | Planet, terrain, ocean, atmosphere, clouds, lighting, post-processing, opening sequence | done |
| 3 | Climate, weather, seasons, moon tides | done |
| 4 | Plants | done |
| 5 | Creatures, genetics, behaviour, speciation | done |
| 6 | Cause graph, chronicle, camera modes, core UI | done |
| 7 | Tier 2 | mostly done; see feature table |
| 8 | Tier 3 | mostly done; see feature table |
| 9 | Audio polish, performance pass, final QA | in progress |

## Graphics overhaul (docs/GRAPHICS_BRIEF.md)

Rules for this phase (owner's direction): full techniques on WebGL2, not simplified equivalents; quadtree LOD instead of tessellation; WebGPU only as an optional extra behind feature detection; WebGL2 must match on the High preset; screenshots from the build machine check correctness only; push after every step.

| Step | What | Status | Notes |
|---|---|---|---|
| 0 | "Before" screenshots of the eight fixed views | done | `docs/screenshots/before/`, seed amber-reef-101 at 150 My; night map uses test lights (no settlements yet at that age) |
| 1 | Alien art direction: star type per seed, sky and sunlight from it, plant pigments, ocean minerals, tinted moon | done (first pass) | `gfx/look.ts`: star type, air, seas, rocks, pigments, moon and aurora colours all derive from the seed and drive the atmosphere, star disc, ocean, terrain, plants, moon and aurora. Not yet shown in the UI or tied to eras |
| 2 | Planet: cube-map bake of sim data, quadtree cube-sphere LOD, GPU hydraulic erosion (ping-pong), per-pixel PBR materials with triplanar mapping | done (first pass) | Sim data baked to cube maps, quadtree cube-sphere (smooth silhouette), pipe-model erosion bake in ping-pong targets used as triplanar detail at three scales, per-pixel materials (strata rock, sand, soil, salt crust, plant cover, farmland, ash, sea bed and coral, snow and fractured ice). Rivers are drawn in the ground from a vector distance field cube map (`gfx/rivermap.ts`). Plants, creatures and the camera stand on the real displaced ground through a CPU sampler that reads the erosion bake back (`gfx/ground.ts`). Still to do: parallax up close |
| 3 | Lighting and night side: moonlight, airglow, starlight fill, soft terminator, shadows, GTAO | done (first pass) | Tinted moonlight, airglow, soft terminator, mountain shadows marched through the height map toward the star, ambient occlusion from the height field plus screen-space GTAO near the camera, auto exposure so the night side from orbit and the ground at night are readable |
| 4 | Clouds: ray-marched volumetric clouds, types from the sim, shadows, lightning | done (first pass) | `gfx/volclouds.ts`: ray march through a cloud layer with tileable 3D Perlin-Worley noise, cover and storms from the sim, towering storm cells with anvils, polar stratus, high cirrus streaks, cyclones with spiral arms and a clear eye (sim now exposes cyclone centres), self-shadowing toward the star, dusk and moonlit colours, lightning glow inside, shadows on ground and sea, depth-aware so mountains, trees and animals occlude correctly. Checked in software rendering only; step counts per preset come in step 12 |
| 5 | Ocean: FFT waves (ping-pong) driven by sim wind, foam, subsurface glow, reflections, underwater | done (first pass) | `gfx/fft.ts` + `gfx/ocean.ts`: Tessendorf FFT in three cascades (1400 m, 260 m, 46 m tiles) run as ping-pong butterfly passes; the GPU result was checked against a direct CPU sum (0.1% error). Quadtree cube-sphere sea surface displaced by the waves, wave strength from the sim's wind and storms, calmer in shallows. Water colour from the real distance through the water to the sea bed behind it (scene depth), with the bed refracted by the waves, foam where waves fold and along the shore, light through wave tops, Cox-Munk glitter from orbit, moon glint, glowing plankton, fractured sea ice, caustics on the shallow sea bed, Snell's window from below. Not yet: screen-space reflections of the shore |
| 6 | Nations and night map: light signature per nation, hierarchy, frayed city shapes, networks, borders, names, emblems | done (first pass) | `gfx/nations.ts`, `gfx/civmap.ts`, `gfx/linefield.ts`: settlements are grouped into nations (oldest city nearby is the capital; shared faith reaches further), each with a generated name, a light colour that starts from its people's biology (firelight until technology brings electric light), and a geometric emblem. Territory by cost-distance over land, borders as fine lines, city light sized by people on a log scale with a dense core fraying into blocks and threads along roads, roads routed along valleys, rivers and coasts, sea lanes with moving ship lamps, offshore platforms, war flicker and plague darkness from the event stream, cities glowing up into cloud above them. Night Map overlay (O, or the Peoples panel) shows borders, names in the serif face and emblems. Data overlays (temperature, rain, life, people) ported to the new surface. Checked with made-up settlements in software rendering. Not yet: satellites |
| 7 | Aurora: thin translucent curtains hugging the atmosphere | done (first pass) | `gfx/aurora.ts`: ray march through a thin shell above the clouds around each magnetic pole (tilted from the spin axis). Three thin sheets along a wandering, folding oval at about 70 degrees magnetic latitude, vertical rays, bright lower border fading upward, patches and travelling pulses, additive, washed out by daylight, hidden correctly by ground and (from below) by cloud. Colours from the world's air; strength follows the star's activity. Replaces the ribbon meshes |
| 8 | Vegetation: real plant geometry, translucency, wind, imposters, dense ground cover | done (first pass) | `gfx/plantmesh.ts` builds twelve growth forms as real branching geometry (broadleaf, conifer, umbrella tree, frond palm, bottle tree, glowing coral fan, giant mushroom, ribbed column, shrub, fern, grass tuft, flower) with cut-out leaf cards, baked occlusion and wind weights. `gfx/flora.ts` picks the form from plant genes, draws real models near the camera (leaves lit from both sides, light through leaves when backlit, three-level wind, cloud shadow), bakes every model from three angles into an imposter atlas at load and draws all far plants as imposters in one draw call with a dithered hand-over, and keeps a dense ring of grass underfoot. Everything stands on the ground by evaluating the terrain height in the vertex shader. The atmosphere now stops at solid things, so trunks against the sky are not fogged. Not yet: canopy texture on far terrain, glow cast on the ground |
| 9 | Creatures: detailed meshes, skin materials, skeletal animation with IK | done (first pass) | `gfx/creaturemesh.ts`: one continuous skin lofted along a spine from tail tip to snout (segments pinch in, bellies flatten), jointed legs with feet, membrane wings on an arm, fins and flukes, curved horns, round eyes, back plates, sails, gas bladders, and four shells of fur for insulated species. `gfx/creatureskin.ts`: one shared material; two-bone leg IK in the vertex shader with a stance and swing cycle and feet set on the real ground height, spine and tail waves with lag, wing beats, head motion; skin from the genes (stripes, spots, countershading; scales, fur, feathers, chitin or hide), wet sheen on water animals, iridescence, light through membranes, glowing markings, golden individuals, and eyes whose pupils turn toward the viewer. Colours are muted from the raw gene hues. Not yet: footprints, dust, splashes and wakes (effects step) |
| 10 | Effects: lava, ash plumes, meteors, wildfire, weather | done (first pass) | Lava as a dark crust split by glowing cracks that widen with heat (fire burns through plants the same way); ash columns and wood smoke fed into the cloud volume from the hottest eruptions and fires (lean with the sim's wind, spread into an anvil, glow from below, darken the cloud); meteor strike with a ring of fire racing over land and sea, glowing crater and rayed ejecta, on top of the existing streak, flash and debris; rain and snow as thousands of GPU streaks around the camera driven by the cloud, storms, temperature and wind overhead; dust at walkers' feet, splashes and wake rings from swimmers; smoke, steam and dust now lit by the sky instead of glowing at night; satellites once a civilization reaches orbit; sibling planets in the sky. Not yet: footprints, lens flare, ground fog |
| 11 | Post-processing: AgX or ACES with auto exposure, physically based bloom, TAA (history buffer), depth of field, grain | done (first pass) | `postfx.ts` rewritten: GTAO at half resolution (normals from depth, fades out with distance), temporal anti-aliasing with a history buffer (three's TRAA node fed a velocity texture computed from the depth buffer and the previous camera, so transparent layers cannot corrupt it), dithers that change every frame under TAA, depth of field in follow and postcard modes, auto exposure (brightness measured on a 16x16 grid every few frames and read back; eases toward the target, faster to bright than to dark; empty space is ignored and the sky and star glare are compensated so the background stays dark), bloom above white only, AgX tone mapping with a little colour restored, sharpening after TAA, chromatic aberration only toward the corners, vignette, grain. Render targets now get real mip chains (fixes sparkle on far sea and terrain). Checked in every quality mode in software rendering |
| 12 | Performance tuning, presets, "after" screenshots, README before/after | done (first pass) | Four presets (Low, Medium, High, Ultra) in `scene.ts` `PRESETS`: texture and buffer sizes fixed when the planet is built (data cube maps, erosion bake, FFT resolution, cloud noise, line fields), and live settings (cloud and aurora march steps, quadtree depth, plant, grass, animal and rain counts, TAA, GTAO, bloom, fringe). The frame-rate watchdog still steps down bloom, counts and resolution. Sea patches wholly inland are culled; clear air is skipped in the cloud march. "After" screenshots of the eight views are in `docs/screenshots/after/` and the README has the before and after table. NOT measured on a real GPU: the frame-rate targets are unverified until the owner tries the deployed site |

## Features

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Procedural icosphere planet with oceans, continents, mountains, rivers and polar caps. | done | planet, oceans, continents, mountains, polar caps and river ribbons that follow the drainage |
| 2 | Biomes driven by temperature and moisture. | done |  |
| 3 | Day/night cycle, plus axial tilt that creates seasons. | in progress | day/night done (cosmetic 80 s day); seasons shown at 1x and 10x |
| 4 | Atmospheric scattering with blue rim glow and real sunsets. | done | ray-marched Rayleigh + Mie shell |
| 5 | Cloud shell that moves with simulated wind and casts shadows. | done | noise shell drifting in wind bands, shadows on land and sea; cover from sim humidity |
| 6 | Glassy ocean with depth color, sun glint and coastal foam. | done |  |
| 7 | Orbiting moon whose tides visibly move the coastline. | in progress | moon orbits and raises a visible tidal bulge; sim-side tide effects to come |
| 8 | Plants that spread by biome, light and rain, so forests and grasslands form on their own. | done | plant species compete per region; instanced trees, shrubs and grass appear near the camera |
| 9 | Plants evolve height, color, leaf type and fruit. | done | 12 plant genes evolve; height, leaf type, hue, fruit and glow drive the 3D plants |
| 10 | Creatures built entirely from genomes: legs, fins or wings, size, neck, horns, tail, color, pattern, glow. | done | bodies generated from the genome: segments, legs, fins, wings, glide membrane, neck, head, eyes, horns, tail, shell, crest, colour, pattern, glow |
| 11 | Procedural walking with feet planted on the terrain. | done | two-bone leg IK in the vertex shader with a stance and swing cycle; each foot is set on the terrain height sampled under it |
| 12 | Energy, hunger, reproduction, aging and death. | in progress | sim done at population level (energy, starvation, breeding, death) |
| 13 | Mutation, with natural selection emerging on its own. | done | mutation plus selection from food, predation and climate only; no fitness score |
| 14 | Speciation detection, with each new species given a generated Latin-style name. | done | lineage speciation with Latin-style names from trait and place roots |
| 15 | Herbivores, predators and scavengers in a live food web. | done | herbivores, hunters and scavengers share food pools per region; hunters and packs emerge but do not always persist |
| 16 | Herds, flocks and fish schools. | done | individuals move as herds, flocks and schools around a drifting centre |
| 17 | Pack hunting, and prey that flee. | done | hunters and prey sharing a region are paired: hunters close in, the prey herd bolts, and cards say chasing or fleeing; pack hunting emerges in the sim |
| 18 | Life starts in the sea and moves onto land over time. | done | life starts in the sea; oxygen opens the land; first land animals emerge around 85 My |
| 19 | Flight evolves gradually, starting with gliding. | done | legs to gliding membrane to wings; powered flight has now appeared in a test run (not yet in every seed) |
| 20 | The cause graph: every event stores its causes and effects. | done | every event stores causes with weights and effects |
| 21 | "Why did this happen?" panel on any event. | done | panel walks the cause graph backward as a vertical story with a glyph thumbnail per step |
| 22 | One continuous camera zoom from deep space down to the ground. | done | one zoom from deep space to the ground, tilting to the horizon as it descends |
| 23 | Follow mode: click a creature and the camera tracks it, with an info card (name, species, age, genes, lineage, current action). | done | click selects, double-click or F follows; card with name, species, age, action, genes, family, lineage; depth of field while following |
| 24 | Time controls from paused to Epoch speed (see section 7.2). | done | pause, 1x, 10x, 100x, 1000x, Epoch; slows around big events |
| 25 | A live, glowing tree of life. Clicking a branch flies the camera to that species. | in progress | live glowing tree; click a branch to open the species and fly to its range |
| 26 | A chronicle narrated like a nature documentary. | done | chronicle panel and a narration line, calm documentary voice, no template repeats twice in a row |
| 27 | Milestone pop-ups: "First eye," "First flight," "First fire," "First city." | done | milestone pop-ups for first life, eye, hunter, steps on land, flight, forest and more |
| 28 | Storm cells with lightning, and rain that drives plant growth. | done | storm cells drift with the wind as dense grey cloud; lightning flickers inside them; rain (moisture) drives plant growth |
| 29 | Lightning starts wildfires, followed by regrowth (grass, then shrubs, then forest). | done | lightning fires spread cell by cell at low speed with smoke and embers; scorch regrows grass first, then canopy |
| 30 | Ice ages and warm eras, with biomes migrating as the climate changes. | done | long climate cycles drive ice ages and warm eras; biomes follow |
| 31 | Sea level rises and falls, opening and closing land bridges. | in progress | sea level follows ice volume; land-bridge effects on life to verify |
| 32 | Volcanic eruptions with lava, ash and fertile ground afterward. | done | eruptions build land, ash, fertility, cooling, lava glow, smoke and embers; cones erode |
| 33 | Meteor strike god tool: shockwave, crater, impact winter. | done | meteor tool: entry streak, flash, debris, crater, impact winter |
| 34 | Mass extinctions, each logged with its causes. | done | detected from extinction rate, logged with weighted causes |
| 35 | Adaptive radiation that refills empty niches after extinctions. | done | empty worlds speciate faster; radiation event after a mass extinction |
| 36 | Night side: bioluminescent plants and creatures. | done | glowing plants and creatures light up at night and bloom |
| 37 | Auroras over the poles. | in progress | ribbon curtains over both poles on the night side; solar events to come |
| 38 | Generative ambient music that shifts with the planet's state. | in progress | generative ambient music (Tone.js) that shifts with stage, era and life, near silence after a mass extinction |
| 39 | Postcard mode: UI hidden, slow cinematic camera. | done | P hides the UI; the camera drifts and breathes in and out with depth of field up close |
| 40 | Seed codes: a shared code replays the same world exactly. | done | seed in the URL replays the world; copy-link button in the World panel |
| 41 | An intelligence threshold any lineage can cross. | done | any lineage that is clever, social, numerous and on land crosses the threshold; intelligence now pays its way in social species |
| 42 | Campfires appearing on the night side. | done | camps show as faint firelight on the night side; First fire milestone |
| 43 | Villages, then city lights visible from orbit. | done | camps grow into villages and cities whose lights show from orbit and spread into networks |
| 44 | Cave paintings depicting the real species they hunted. | done | early camps paint the real species that live beside them (cause-linked event) |
| 45 | Religions founded on real events (the comet, the eclipse, the volcano). | done | faiths are founded on real eruptions, impacts, tsunamis, eclipses, comets and god-tool events |
| 46 | If the user intervenes a lot, civilizations build temples facing the camera. | simplified | after three or more god-tool uses, villages raise temples that face the sky (event; no temple model yet) |
| 47 | Domestication: tamed species start evolving in new directions. | done | farming peoples tame a real grazer; tamed herds grow calmer, more sociable and more numerous each generation |
| 48 | Agriculture that turns land into fields. | done | settlements with farming paint field patchwork around them |
| 49 | Roads that follow ancient migration trails. | simplified | lit roads join neighbouring towns by the direct route, not along old migration trails |
| 50 | Ruins that forests overgrow, later found by a second intelligent species. | done | ruins are logged and listed; a later, different people building on the same ground rediscover them (event) |
| 51 | Plate tectonics with drifting continents. | simplified | plate outlines stay fixed and the crust slides across them every 2 My, carrying continents; new sea floor forms where plates part |
| 52 | Mountain building at plate collisions, creating rain-shadow deserts. | simplified | land rises slowly where plates collide and erosion wears it down; rain shadows come from the moisture model; plates themselves do not drift |
| 53 | Earthquakes and tsunamis. | done | earthquakes at plate boundaries; undersea ones raise tsunamis that scour coasts and are witnessed |
| 54 | Hotspots that build island chains. | simplified | hotspots shift cell by cell over time, so repeated eruptions leave island chains |
| 55 | Erosion that carves canyons and grows deltas. | simplified | peaks erode and glaciers carve coastal valleys; no canyon or delta modelling |
| 56 | Ocean currents that carry heat. | simplified | sea temperature is carried along the wind-driven surface flow |
| 57 | Rafting: creatures ride storm debris to colonize islands. | done | storms occasionally raft shore animals to a far coast, where they found new populations |
| 58 | Coral reefs and atolls, with bleaching in heat waves. | simplified | warm shallow water with sea plants grows coral that tints the shallows; it bleaches white above 30.5 C (event) |
| 59 | Plankton blooms visible from orbit, and bioluminescent waves at night. | done | plankton stains the sea green by sea-plant cover and glows blue at night where waves stir it |
| 60 | Hurricanes with a visible eye. | done | strong storms over warm sea become hurricanes; the cloud volume draws them as spiral bands around a clear eye, with damage at landfall |
| 61 | Snow that builds up and melts, feeding the rivers. | done | snow builds and melts with temperature, and meltwater adds to river flow |
| 62 | Oxygen level tracked, with a giant-insect era when it spikes. | done | oxygen tracked, limits body size and activity; an age of giants is declared when it passes 30% |
| 63 | Seasonal migrations that wear trails into the land. | simplified | at 1x and 10x wandering herds shift toward the summer hemisphere; no worn trails |
| 64 | Hibernation, and day versus night species. | simplified | night animals lie low by day and day animals by night (drawn individuals); no hibernation |
| 65 | Camouflage evolving to match each biome. | done | prey whose hue matches the ground cover of its region is harder for hunters to detect, so colour is under selection |
| 66 | Sexual selection: mating displays and ornaments. | done | ornaments raise breeding success but cost energy and concealment |
| 67 | Nests and parental care. | simplified | species with strong parental care get a small nest mound at each group's home |
| 68 | Disease outbreaks spreading through herds. | done | plagues strike crowded, sociable species and spread to neighbouring regions |
| 69 | Symbiosis pairs. | simplified | a large and a small species sharing a home are recorded as a pair (event); no fitness effect |
| 70 | Flowers co-evolving with pollinators. | simplified | fruiting plants spread faster where animals eat them; no dedicated pollinator trait |
| 71 | Toxin versus resistance arms races, shown on a chart. | done | mean plant toxicity and mean animal toxin resistance are tracked and charted |
| 72 | Convergent evolution detector ("Two unrelated lineages have both evolved into crab-like forms"). | done | detector for unrelated lineages with the same body plan |
| 73 | Island dwarfism and gigantism. | done | isolated island populations that shrink or grow are flagged as dwarfs or giants |
| 74 | Flight lost on predator-free islands. | done | a winged lineage whose descendants lose their wings is recorded |
| 75 | Land species returning to the sea as ocean giants. | done | land lineages that return to the sea are recorded with a milestone |
| 76 | Echolocation shown as ripples. | done | echolocating animals near the camera send out expanding ripples |
| 77 | Electric fish with visible arcs. | simplified | electric sea species carry glowing patches; no arc effect |
| 78 | Metamorphosis, with larval and adult forms that look completely different. | done | young of metamorphosing species are drawn as limbless grubs unlike the adults |
| 79 | Hive species with growing mounds. | done | small, highly social species raise tall mounds at each colony |
| 80 | Keystone species whose loss collapses an ecosystem. | done | when a widespread species dies and three more follow within 1.5 My, an ecosystem collapse is logged |
| 81 | Invasive species crossing land bridges. | done | land species that surge across new land bridges when the seas fall are logged as invasions |
| 82 | Living fossils flagged when a species stays unchanged for eons. | done | species unchanged for 60 My are flagged |
| 83 | Fossil layer: see-through ground showing bones where extinct species died. | simplified | fossils overlay shows large bone markers where extinct species last lived; no see-through ground |
| 84 | Auto-generated field guide with a sketch-style card for every species. | simplified | field guide lists every living species with a description; no sketch cards yet |
| 85 | Extinction memorial. | done | memorial section lists extinct species; click one for why it died |
| 86 | Rewind timeline with snapshots and major events marked. | simplified | up to six rewind points at milestone events, listed in settings |
| 87 | God tools: ice age, heat wave, raise mountains, flood, plague, lightning. | done | meteor, lightning, plague, raise mountains, flood, ice age, heat wave |
| 88 | Custom species designer. | done | designer panel with 18 gene sliders; click the planet to release the species |
| 89 | A monolith that speeds up intelligence nearby. | done | monolith god tool raises intelligence and curiosity of animals living beside it |
| 90 | Overlays: temperature, rain, population, genetic diversity, oxygen. | simplified | temperature, rain, life and people overlays with a colour-blind safe ramp; genetic diversity and oxygen overlays not built |
| 91 | Graphs of population, biomass and atmosphere over time. | done | graphs of temperature, oxygen, plant cover, species count and population |
| 92 | First-person creature view. | done | V looks out from the followed creature |
| 93 | Creature calls generated from body size. | done | selecting a creature plays a call pitched by its body size |
| 94 | Spatial sound: wind, rain, thunder, waves, lava. | simplified | ambient wind, surf and rain layers follow altitude, coast and storm cloud; thunder under storms; not positional |
| 95 | Documentary director: an auto-camera that cuts to whatever is most interesting right now. | done | optional director flies the camera to notable events; always on in postcard mode |
| 96 | Solar eclipses that make creatures go quiet. | simplified | eclipses happen as events that peoples witness; no shadow on the planet yet |
| 97 | Comets that return on a long cycle and become myths. | done | a seeded comet returns on a fixed period, each return linked to the last, and becomes myth |
| 98 | Meteor showers that trigger mutation bursts. | done | meteor showers raise mutation rates for a while |
| 99 | A rare captured second moon. | done | rare capture of a second, smaller moon (event, omen, drawn in the sky) |
| 100 | Shattering the moon into a ring system. | done | shatter god tool breaks the moon into a ring |
| 101 | Ring shadow creating a cold stripe biome. | done | the ring cools and darkens a band along the equator |
| 102 | A nearby supernova with a radiation spike. | done | rare supernova: radiation kill on land and a mutation burst; peoples take it as an omen |
| 103 | The sun brightening over the far future. | done | after 380 My the star slowly brightens and warms the world |
| 104 | Constellations named after extinct species. | done | villages name constellations after extinct species whose bones they find |
| 105 | Binary-sun seeds with double shadows. | simplified | 14% of seeds have a second sun in the sky that adds its own light; no double shadows |
| 106 | The supercontinent cycle. | done | continent count is tracked as plates drift; supercontinent formation and break-up are logged |
| 107 | Supervolcano ash winters. | done | super-eruptions bring a volcanic winter with global dieback |
| 108 | Glaciers carving fjords. | simplified | ice near the coast carves valleys below sea level, which flood as fjords when it melts |
| 109 | Cave networks with blind, pale species. | simplified | blind, pale burrowers of the dark are recorded as cave dwellers; no cave models |
| 110 | Hydrothermal vent ecosystems. | done | undersea volcanic sites feed life without sunlight; vent dwellers are recorded |
| 111 | Geysers and hot springs. | simplified | scattered land cells puff steam in bursts |
| 112 | Salt flats where inland seas dry. | done | hot dry lowlands become white salt flats (biome) |
| 113 | Tornadoes. | simplified | a rope of debris hangs under storm cells over land when viewed up close |
| 114 | Fire tornadoes in big wildfires. | simplified | the same funnel burns orange over fire |
| 115 | Dust storms that fertilize the ocean. | simplified | strong wind lifts dust from deserts and salt flats; no ocean fertilising |
| 116 | Acid rain after eruptions. | done | large eruptions bring acid rain that thins plant cover downwind |
| 117 | Valley fog, rainbows and heat shimmer. | simplified | low damp ground near the dawn line lies under mist; no rainbows or heat shimmer |
| 118 | The ozone layer, and what happens when it's stripped. | done | a supernova strips the ozone layer; land plants suffer until it heals |
| 119 | A snowball-planet event. | done | snowball event when ice covers more than 55% of the planet |
| 120 | Permafrost thaw speeding up warming. | done | thawing at the end of an ice age adds greenhouse forcing |
| 121 | Civilizations burning ancient swamp coal and warming the planet. | done | cities past a technology level add greenhouse forcing in proportion to their number |
| 122 | Plagues traveling along trade routes. | done | plagues strike large towns and spread to neighbouring settlements |
| 123 | Trade boats crossing the seas. | simplified | lamp-lit sea lanes between cities facing the same water, and a first-ships event; no boat models |
| 124 | Tribal wars and borders. | done | neighbouring settlements of different peoples or faiths go to war; nations, their territories and borders are drawn on the Night Map, and war makes the lights flicker |
| 125 | A space age with satellites and a radio signal. | done | space age milestone; satellites circle the planet as points of light once technology passes 0.9, and the narration mentions the radio signal |
| 126 | Possible nuclear winter. | done | after the space age a war can become nuclear: winter, dieback, most people and knowledge lost |
| 127 | Departure: a civilization leaves the planet as a light rising into space. | simplified | after 25 My of space age the people depart (milestone); no rising light effect yet |
| 128 | Giant mushrooms and glowing fungal networks, shown in an x-ray view. | simplified | glowing water-loving plants grow as giant mushrooms; no fungal network view |
| 129 | Carnivorous plants in poor soil. | done | thorny, toxic, slow plants are recorded as meat-eaters |
| 130 | Autumn colors. | done | broadleaf trees turn gold, red and brown where the cold season is coming (1x and 10x) |
| 131 | A marker on the oldest living tree. | done | the longest-standing forest is tracked and its oldest tree drawn tall and golden |
| 132 | Gas-bladder creatures drifting like blimps. | simplified | slow, large winged species carry a great pale float |
| 133 | Living islands: sea giants with forests on their backs. | simplified | armoured sea giants carry a grove on their backs |
| 134 | Walking forests. | simplified | colour-shifting land giants carry a grove on their backs |
| 135 | Mass hatchings that light up the ocean. | simplified | glowing, prolific sea species are recorded as mass hatchers (event); no light pulse |
| 136 | Bone graveyards. | simplified | small bones lie where species died out |
| 137 | A rare golden mutant. | done | about 1 in 700 individuals is drawn golden and noted on its card |
| 138 | An eternal storm sitting over one spot. | done | one storm per world never ends |
| 139 | A full underwater exploration view. | simplified | U lets the camera dive below the sea surface with a blue-green tint; no caustics or light shafts |
| 140 | Cross-section slice showing rock layers, caves and roots. | done | X draws a west-to-east slice under the view: strata, caves, sea, soil, roots, plants, ice, lava |
| 141 | Flat map view. | done | M opens a flat map; click to fly there; overlays and settlements show on it |
| 142 | Photo mode with film filters. | done | five photo filters and save-as-PNG |
| 143 | Timeline fork that runs two futures side by side. | simplified | fork saves this moment as a rewind point; futures are not run side by side |
| 144 | Full family tree of any individual creature. | simplified | creature card shows an invented family; no real pedigree |
| 145 | Intelligent species developing their own music. | done | a people that reaches music adds its own melody to the score (and an event) |
| 146 | Near silence after a mass extinction. | done | music falls near silent for 45 seconds after a mass extinction |
| 147 | More god tools: gene ray, shield dome, summon comet, tilt axis, rain of life. | done | gene ray, shield dome, summon comet, tilt axis, rain of life |
| 148 | Hands-off mode that locks all god tools. | done | hands-off mode locks every god tool |
| 149 | GIF and video recording. | simplified | records the 3D view to a WebM video; no GIF |
| 150 | Export a planet's history as an illustrated PDF book. | simplified | opens an illustrated history (planet image plus major events) ready to print or save as PDF |
