# Progress

Status of all 150 features from BRIEF.md. Values: not started, in progress, done, simplified (with a note).

## Build stages

| Stage | What | Status |
|---|---|---|
| 1 | Project setup, repo, CI workflow, PRNG, worker loop, message protocol | done |
| 2 | Planet, terrain, ocean, atmosphere, clouds, lighting, post-processing, opening sequence | in progress |
| 3 | Climate, weather, seasons, moon tides | not started |
| 4 | Plants | not started |
| 5 | Creatures, genetics, behaviour, speciation | not started |
| 6 | Cause graph, chronicle, camera modes, core UI | not started |
| 7 | Tier 2 | not started |
| 8 | Tier 3 | not started |
| 9 | Audio polish, performance pass, final QA | not started |

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
| 11 | Procedural walking with feet planted on the terrain. | simplified | walk cycle in the vertex shader with feet placed on the exact terrain facet; no per-leg IK |
| 12 | Energy, hunger, reproduction, aging and death. | in progress | sim done at population level (energy, starvation, breeding, death) |
| 13 | Mutation, with natural selection emerging on its own. | done | mutation plus selection from food, predation and climate only; no fitness score |
| 14 | Speciation detection, with each new species given a generated Latin-style name. | done | lineage speciation with Latin-style names from trait and place roots |
| 15 | Herbivores, predators and scavengers in a live food web. | done | herbivores, hunters and scavengers share food pools per region; hunters and packs emerge but do not always persist |
| 16 | Herds, flocks and fish schools. | in progress | individuals move as herds, flocks and schools around a drifting centre (render side) |
| 17 | Pack hunting, and prey that flee. | in progress | pack hunting emerges (milestone seen); fleeing behaviour of individuals to come |
| 18 | Life starts in the sea and moves onto land over time. | done | life starts in the sea; oxygen opens the land; first land animals emerge around 85 My |
| 19 | Flight evolves gradually, starting with gliding. | in progress | gliding now evolves (legs to membrane); powered flight has not yet appeared in test runs |
| 20 | The cause graph: every event stores its causes and effects. | done | every event stores causes with weights and effects |
| 21 | "Why did this happen?" panel on any event. | done | panel walks the cause graph backward as a vertical story with a glyph thumbnail per step |
| 22 | One continuous camera zoom from deep space down to the ground. | done | one zoom from deep space to the ground, tilting to the horizon as it descends |
| 23 | Follow mode: click a creature and the camera tracks it, with an info card (name, species, age, genes, lineage, current action). | in progress | click selects a creature, double-click or F follows it; card shows name, species, age, action, genes, lineage. Depth of field to come |
| 24 | Time controls from paused to Epoch speed (see section 7.2). | done | pause, 1x, 10x, 100x, 1000x, Epoch; slows around big events |
| 25 | A live, glowing tree of life. Clicking a branch flies the camera to that species. | in progress | live glowing tree; click a branch to open the species and fly to its range |
| 26 | A chronicle narrated like a nature documentary. | done | chronicle panel and a narration line, calm documentary voice, no template repeats twice in a row |
| 27 | Milestone pop-ups: "First eye," "First flight," "First fire," "First city." | done | milestone pop-ups for first life, eye, hunter, steps on land, flight, forest and more |
| 28 | Storm cells with lightning, and rain that drives plant growth. | done | storm cells drift with the wind as dense grey cloud; lightning flickers inside them; rain (moisture) drives plant growth |
| 29 | Lightning starts wildfires, followed by regrowth (grass, then shrubs, then forest). | in progress | at 1x and 10x lightning starts fires that spread cell by cell and leave scorch that regrows; statistical at high speed; flame and smoke particles to come |
| 30 | Ice ages and warm eras, with biomes migrating as the climate changes. | done | long climate cycles drive ice ages and warm eras; biomes follow |
| 31 | Sea level rises and falls, opening and closing land bridges. | in progress | sea level follows ice volume; land-bridge effects on life to verify |
| 32 | Volcanic eruptions with lava, ash and fertile ground afterward. | in progress | eruptions build land, ash, fertility, cooling, lava glow; cones erode; ash plume particles to come |
| 33 | Meteor strike god tool: shockwave, crater, impact winter. | in progress | meteor god tool works (click to strike, flash, crater, impact winter); particle effects to come |
| 34 | Mass extinctions, each logged with its causes. | done | detected from extinction rate, logged with weighted causes |
| 35 | Adaptive radiation that refills empty niches after extinctions. | done | empty worlds speciate faster; radiation event after a mass extinction |
| 36 | Night side: bioluminescent plants and creatures. | done | glowing plants and creatures light up at night and bloom |
| 37 | Auroras over the poles. | in progress | ribbon curtains over both poles on the night side; solar events to come |
| 38 | Generative ambient music that shifts with the planet's state. | in progress | generative ambient music (Tone.js) that shifts with stage, era and life, near silence after a mass extinction |
| 39 | Postcard mode: UI hidden, slow cinematic camera. | in progress | P hides the UI and speeds the camera drift; depth of field to come |
| 40 | Seed codes: a shared code replays the same world exactly. | done | seed in the URL replays the world; copy-link button in the World panel |
| 41 | An intelligence threshold any lineage can cross. | not started | |
| 42 | Campfires appearing on the night side. | not started | |
| 43 | Villages, then city lights visible from orbit. | not started | |
| 44 | Cave paintings depicting the real species they hunted. | not started | |
| 45 | Religions founded on real events (the comet, the eclipse, the volcano). | not started | |
| 46 | If the user intervenes a lot, civilizations build temples facing the camera. | not started | |
| 47 | Domestication: tamed species start evolving in new directions. | not started | |
| 48 | Agriculture that turns land into fields. | not started | |
| 49 | Roads that follow ancient migration trails. | not started | |
| 50 | Ruins that forests overgrow, later found by a second intelligent species. | not started | |
| 51 | Plate tectonics with drifting continents. | not started | |
| 52 | Mountain building at plate collisions, creating rain-shadow deserts. | not started | |
| 53 | Earthquakes and tsunamis. | not started | |
| 54 | Hotspots that build island chains. | not started | |
| 55 | Erosion that carves canyons and grows deltas. | not started | |
| 56 | Ocean currents that carry heat. | not started | |
| 57 | Rafting: creatures ride storm debris to colonize islands. | not started | |
| 58 | Coral reefs and atolls, with bleaching in heat waves. | not started | |
| 59 | Plankton blooms visible from orbit, and bioluminescent waves at night. | not started | |
| 60 | Hurricanes with a visible eye. | not started | |
| 61 | Snow that builds up and melts, feeding the rivers. | not started | |
| 62 | Oxygen level tracked, with a giant-insect era when it spikes. | in progress | oxygen tracked; limits body size and activity |
| 63 | Seasonal migrations that wear trails into the land. | not started | |
| 64 | Hibernation, and day versus night species. | not started | |
| 65 | Camouflage evolving to match each biome. | not started | |
| 66 | Sexual selection: mating displays and ornaments. | not started | |
| 67 | Nests and parental care. | not started | |
| 68 | Disease outbreaks spreading through herds. | not started | |
| 69 | Symbiosis pairs. | not started | |
| 70 | Flowers co-evolving with pollinators. | not started | |
| 71 | Toxin versus resistance arms races, shown on a chart. | not started | |
| 72 | Convergent evolution detector ("Two unrelated lineages have both evolved into crab-like forms"). | not started | |
| 73 | Island dwarfism and gigantism. | not started | |
| 74 | Flight lost on predator-free islands. | not started | |
| 75 | Land species returning to the sea as ocean giants. | not started | |
| 76 | Echolocation shown as ripples. | not started | |
| 77 | Electric fish with visible arcs. | not started | |
| 78 | Metamorphosis, with larval and adult forms that look completely different. | not started | |
| 79 | Hive species with growing mounds. | not started | |
| 80 | Keystone species whose loss collapses an ecosystem. | not started | |
| 81 | Invasive species crossing land bridges. | not started | |
| 82 | Living fossils flagged when a species stays unchanged for eons. | not started | |
| 83 | Fossil layer: see-through ground showing bones where extinct species died. | not started | |
| 84 | Auto-generated field guide with a sketch-style card for every species. | not started | |
| 85 | Extinction memorial. | not started | |
| 86 | Rewind timeline with snapshots and major events marked. | not started | |
| 87 | God tools: ice age, heat wave, raise mountains, flood, plague, lightning. | not started | |
| 88 | Custom species designer. | not started | |
| 89 | A monolith that speeds up intelligence nearby. | not started | |
| 90 | Overlays: temperature, rain, population, genetic diversity, oxygen. | not started | |
| 91 | Graphs of population, biomass and atmosphere over time. | not started | |
| 92 | First-person creature view. | not started | |
| 93 | Creature calls generated from body size. | not started | |
| 94 | Spatial sound: wind, rain, thunder, waves, lava. | not started | |
| 95 | Documentary director: an auto-camera that cuts to whatever is most interesting right now. | not started | |
| 96 | Solar eclipses that make creatures go quiet. | not started | |
| 97 | Comets that return on a long cycle and become myths. | not started | |
| 98 | Meteor showers that trigger mutation bursts. | not started | |
| 99 | A rare captured second moon. | not started | |
| 100 | Shattering the moon into a ring system. | not started | |
| 101 | Ring shadow creating a cold stripe biome. | not started | |
| 102 | A nearby supernova with a radiation spike. | not started | |
| 103 | The sun brightening over the far future. | not started | |
| 104 | Constellations named after extinct species. | not started | |
| 105 | Binary-sun seeds with double shadows. | not started | |
| 106 | The supercontinent cycle. | not started | |
| 107 | Supervolcano ash winters. | not started | |
| 108 | Glaciers carving fjords. | not started | |
| 109 | Cave networks with blind, pale species. | not started | |
| 110 | Hydrothermal vent ecosystems. | not started | |
| 111 | Geysers and hot springs. | not started | |
| 112 | Salt flats where inland seas dry. | not started | |
| 113 | Tornadoes. | not started | |
| 114 | Fire tornadoes in big wildfires. | not started | |
| 115 | Dust storms that fertilize the ocean. | not started | |
| 116 | Acid rain after eruptions. | not started | |
| 117 | Valley fog, rainbows and heat shimmer. | not started | |
| 118 | The ozone layer, and what happens when it's stripped. | not started | |
| 119 | A snowball-planet event. | not started | |
| 120 | Permafrost thaw speeding up warming. | not started | |
| 121 | Civilizations burning ancient swamp coal and warming the planet. | not started | |
| 122 | Plagues traveling along trade routes. | not started | |
| 123 | Trade boats crossing the seas. | not started | |
| 124 | Tribal wars and borders. | not started | |
| 125 | A space age with satellites and a radio signal. | not started | |
| 126 | Possible nuclear winter. | not started | |
| 127 | Departure: a civilization leaves the planet as a light rising into space. | not started | |
| 128 | Giant mushrooms and glowing fungal networks, shown in an x-ray view. | not started | |
| 129 | Carnivorous plants in poor soil. | not started | |
| 130 | Autumn colors. | not started | |
| 131 | A marker on the oldest living tree. | not started | |
| 132 | Gas-bladder creatures drifting like blimps. | not started | |
| 133 | Living islands: sea giants with forests on their backs. | not started | |
| 134 | Walking forests. | not started | |
| 135 | Mass hatchings that light up the ocean. | not started | |
| 136 | Bone graveyards. | not started | |
| 137 | A rare golden mutant. | not started | |
| 138 | An eternal storm sitting over one spot. | not started | |
| 139 | A full underwater exploration view. | not started | |
| 140 | Cross-section slice showing rock layers, caves and roots. | not started | |
| 141 | Flat map view. | not started | |
| 142 | Photo mode with film filters. | not started | |
| 143 | Timeline fork that runs two futures side by side. | not started | |
| 144 | Full family tree of any individual creature. | not started | |
| 145 | Intelligent species developing their own music. | not started | |
| 146 | Near silence after a mass extinction. | not started | |
| 147 | More god tools: gene ray, shield dome, summon comet, tilt axis, rain of life. | not started | |
| 148 | Hands-off mode that locks all god tools. | not started | |
| 149 | GIF and video recording. | not started | |
| 150 | Export a planet's history as an illustrated PDF book. | not started | |
