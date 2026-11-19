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
| 19 | Flight evolves gradually, starting with gliding. | done | legs to gliding membrane to wings; powered flight has now appeared in a test run (not yet in every seed) |
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
| 51 | Plate tectonics with drifting continents. | not started | |
| 52 | Mountain building at plate collisions, creating rain-shadow deserts. | simplified | land rises slowly where plates collide and erosion wears it down; rain shadows come from the moisture model; plates themselves do not drift |
| 53 | Earthquakes and tsunamis. | done | earthquakes at plate boundaries; undersea ones raise tsunamis that scour coasts and are witnessed |
| 54 | Hotspots that build island chains. | simplified | hotspots shift cell by cell over time, so repeated eruptions leave island chains |
| 55 | Erosion that carves canyons and grows deltas. | simplified | peaks erode and glaciers carve coastal valleys; no canyon or delta modelling |
| 56 | Ocean currents that carry heat. | not started | |
| 57 | Rafting: creatures ride storm debris to colonize islands. | done | storms occasionally raft shore animals to a far coast, where they found new populations |
| 58 | Coral reefs and atolls, with bleaching in heat waves. | not started | |
| 59 | Plankton blooms visible from orbit, and bioluminescent waves at night. | not started | |
| 60 | Hurricanes with a visible eye. | simplified | strong storms over warm sea become hurricanes with a clear eye in the cloud field and damage at landfall |
| 61 | Snow that builds up and melts, feeding the rivers. | not started | |
| 62 | Oxygen level tracked, with a giant-insect era when it spikes. | done | oxygen tracked, limits body size and activity; an age of giants is declared when it passes 30% |
| 63 | Seasonal migrations that wear trails into the land. | not started | |
| 64 | Hibernation, and day versus night species. | not started | |
| 65 | Camouflage evolving to match each biome. | done | prey whose hue matches the ground cover of its region is harder for hunters to detect, so colour is under selection |
| 66 | Sexual selection: mating displays and ornaments. | done | ornaments raise breeding success but cost energy and concealment |
| 67 | Nests and parental care. | not started | |
| 68 | Disease outbreaks spreading through herds. | done | plagues strike crowded, sociable species and spread to neighbouring regions |
| 69 | Symbiosis pairs. | not started | |
| 70 | Flowers co-evolving with pollinators. | simplified | fruiting plants spread faster where animals eat them; no dedicated pollinator trait |
| 71 | Toxin versus resistance arms races, shown on a chart. | done | mean plant toxicity and mean animal toxin resistance are tracked and charted |
| 72 | Convergent evolution detector ("Two unrelated lineages have both evolved into crab-like forms"). | done | detector for unrelated lineages with the same body plan |
| 73 | Island dwarfism and gigantism. | done | isolated island populations that shrink or grow are flagged as dwarfs or giants |
| 74 | Flight lost on predator-free islands. | done | a winged lineage whose descendants lose their wings is recorded |
| 75 | Land species returning to the sea as ocean giants. | done | land lineages that return to the sea are recorded with a milestone |
| 76 | Echolocation shown as ripples. | not started | |
| 77 | Electric fish with visible arcs. | not started | |
| 78 | Metamorphosis, with larval and adult forms that look completely different. | not started | |
| 79 | Hive species with growing mounds. | not started | |
| 80 | Keystone species whose loss collapses an ecosystem. | done | when a widespread species dies and three more follow within 1.5 My, an ecosystem collapse is logged |
| 81 | Invasive species crossing land bridges. | done | land species that surge across new land bridges when the seas fall are logged as invasions |
| 82 | Living fossils flagged when a species stays unchanged for eons. | done | species unchanged for 60 My are flagged |
| 83 | Fossil layer: see-through ground showing bones where extinct species died. | not started | |
| 84 | Auto-generated field guide with a sketch-style card for every species. | simplified | field guide lists every living species with a description; no sketch cards yet |
| 85 | Extinction memorial. | done | memorial section lists extinct species; click one for why it died |
| 86 | Rewind timeline with snapshots and major events marked. | simplified | up to six rewind points at milestone events, listed in settings |
| 87 | God tools: ice age, heat wave, raise mountains, flood, plague, lightning. | done | meteor, lightning, plague, raise mountains, flood, ice age, heat wave |
| 88 | Custom species designer. | done | designer panel with 18 gene sliders; click the planet to release the species |
| 89 | A monolith that speeds up intelligence nearby. | done | monolith god tool raises intelligence and curiosity of animals living beside it |
| 90 | Overlays: temperature, rain, population, genetic diversity, oxygen. | simplified | temperature, rain, life and people overlays with a colour-blind safe ramp; genetic diversity and oxygen overlays not built |
| 91 | Graphs of population, biomass and atmosphere over time. | done | graphs of temperature, oxygen, plant cover, species count and population |
| 92 | First-person creature view. | not started | |
| 93 | Creature calls generated from body size. | done | selecting a creature plays a call pitched by its body size |
| 94 | Spatial sound: wind, rain, thunder, waves, lava. | simplified | ambient wind, surf and rain layers follow altitude, coast and storm cloud; thunder under storms; not positional |
| 95 | Documentary director: an auto-camera that cuts to whatever is most interesting right now. | done | optional director flies the camera to notable events; always on in postcard mode |
| 96 | Solar eclipses that make creatures go quiet. | simplified | eclipses happen as events that peoples witness; no shadow on the planet yet |
| 97 | Comets that return on a long cycle and become myths. | done | a seeded comet returns on a fixed period, each return linked to the last, and becomes myth |
| 98 | Meteor showers that trigger mutation bursts. | done | meteor showers raise mutation rates for a while |
| 99 | A rare captured second moon. | not started | |
| 100 | Shattering the moon into a ring system. | not started | |
| 101 | Ring shadow creating a cold stripe biome. | not started | |
| 102 | A nearby supernova with a radiation spike. | done | rare supernova: radiation kill on land and a mutation burst; peoples take it as an omen |
| 103 | The sun brightening over the far future. | done | after 380 My the star slowly brightens and warms the world |
| 104 | Constellations named after extinct species. | done | villages name constellations after extinct species whose bones they find |
| 105 | Binary-sun seeds with double shadows. | not started | |
| 106 | The supercontinent cycle. | not started | |
| 107 | Supervolcano ash winters. | not started | |
| 108 | Glaciers carving fjords. | simplified | ice near the coast carves valleys below sea level, which flood as fjords when it melts |
| 109 | Cave networks with blind, pale species. | not started | |
| 110 | Hydrothermal vent ecosystems. | not started | |
| 111 | Geysers and hot springs. | not started | |
| 112 | Salt flats where inland seas dry. | not started | |
| 113 | Tornadoes. | not started | |
| 114 | Fire tornadoes in big wildfires. | not started | |
| 115 | Dust storms that fertilize the ocean. | not started | |
| 116 | Acid rain after eruptions. | done | large eruptions bring acid rain that thins plant cover downwind |
| 117 | Valley fog, rainbows and heat shimmer. | not started | |
| 118 | The ozone layer, and what happens when it's stripped. | not started | |
| 119 | A snowball-planet event. | done | snowball event when ice covers more than 55% of the planet |
| 120 | Permafrost thaw speeding up warming. | done | thawing at the end of an ice age adds greenhouse forcing |
| 121 | Civilizations burning ancient swamp coal and warming the planet. | done | cities past a technology level add greenhouse forcing in proportion to their number |
| 122 | Plagues traveling along trade routes. | done | plagues strike large towns and spread to neighbouring settlements |
| 123 | Trade boats crossing the seas. | not started | |
| 124 | Tribal wars and borders. | simplified | neighbouring settlements of different peoples or faiths go to war and lose people and knowledge; no drawn borders |
| 125 | A space age with satellites and a radio signal. | simplified | space age milestone with satellites and radio in the narration; no satellite models |
| 126 | Possible nuclear winter. | done | after the space age a war can become nuclear: winter, dieback, most people and knowledge lost |
| 127 | Departure: a civilization leaves the planet as a light rising into space. | simplified | after 25 My of space age the people depart (milestone); no rising light effect yet |
| 128 | Giant mushrooms and glowing fungal networks, shown in an x-ray view. | not started | |
| 129 | Carnivorous plants in poor soil. | not started | |
| 130 | Autumn colors. | not started | |
| 131 | A marker on the oldest living tree. | not started | |
| 132 | Gas-bladder creatures drifting like blimps. | not started | |
| 133 | Living islands: sea giants with forests on their backs. | not started | |
| 134 | Walking forests. | not started | |
| 135 | Mass hatchings that light up the ocean. | not started | |
| 136 | Bone graveyards. | not started | |
| 137 | A rare golden mutant. | done | about 1 in 700 individuals is drawn golden and noted on its card |
| 138 | An eternal storm sitting over one spot. | done | one storm per world never ends |
| 139 | A full underwater exploration view. | not started | |
| 140 | Cross-section slice showing rock layers, caves and roots. | not started | |
| 141 | Flat map view. | done | M opens a flat map; click to fly there; overlays and settlements show on it |
| 142 | Photo mode with film filters. | done | five photo filters and save-as-PNG |
| 143 | Timeline fork that runs two futures side by side. | not started | |
| 144 | Full family tree of any individual creature. | not started | |
| 145 | Intelligent species developing their own music. | not started | |
| 146 | Near silence after a mass extinction. | not started | |
| 147 | More god tools: gene ray, shield dome, summon comet, tilt axis, rain of life. | done | gene ray, shield dome, summon comet, tilt axis, rain of life |
| 148 | Hands-off mode that locks all god tools. | done | hands-off mode locks every god tool |
| 149 | GIF and video recording. | simplified | records the 3D view to a WebM video; no GIF |
| 150 | Export a planet's history as an illustrated PDF book. | simplified | opens an illustrated history (planet image plus major events) ready to print or save as PDF |
