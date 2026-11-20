# Genesis: independent audit of the original 150 features

Audited at commit `4424753` (the head of the branch when the audit began). All file and line references are to that commit.
More commits landed on the branch while the audit ran (up to `73606bd` when this was written): the star-system and legacy expansions (E91 to E100) and a fix from a GPU check. They shift line numbers by up to a few dozen lines in `simulation.ts`, `scene.ts`, `main.ts`, `worker.ts` and `panels.tsx`, and they change how comets are timed and how the star brightens (features 97 and 103). I did not audit that new code. The god-tool list still has no entry for shattering the moon at `73606bd`.

## How the check was done

- Every feature was traced in the code from the simulation (`src/sim`) through the worker messages to the renderer (`src/render`), the interface (`src/ui`, `src/main.ts`) or the sound (`src/audio`). The status column of PROGRESS.md was not used as evidence.
- Six headless runs confirmed which simulation events really fire. All used the small test planet (`new Simulation(seed, 27)`), three seeds, 125 to 299 million years each. One run used an untouched export of commit `4424753`; the others ran the working tree, which the other session was editing at the time (its new events such as `fleet` and `panspermia` appear in those tallies).
- No browser was launched, so nothing visual was seen. A verdict of WORKS-LIKELY for a visual means the code path is complete and connected, not that the picture looks right.
- The full test suite was not run (about 4 minutes, and other jobs were using the machine). `npx tsc --noEmit -p .` passed when run on `3d3446a` near the end of the audit.

## Summary

| Verdict | Count |
|---|---|
| WORKS-LIKELY | 123 |
| PARTIAL | 25 |
| UNSURE | 2 |
| MISSING | 0 |

Nothing is missing outright: every feature has real code. The 25 partial features fall into five groups.

1. **Looks that depend on traits evolution never produces (11 features: 36, 66, 76, 77, 78, 109, 128, 132, 133, 134, 135).** The renderer has the special look, but it only appears when a species crosses a gene threshold. Across about 490 named species in three seeds, sampled every 1.5 million years, none crossed it: no glowing animals, no electric fish, no echolocators, no larvae, no ornaments, no gas-bladder drifters, no living islands, no walking forests, no cave dwellers, no mass hatchings, no giant mushrooms. Most of these genes cost energy and only pay off for a hunter (senses), or have no function in the simulation at all (metamorphosis), so selection keeps them low.
2. **True hunters almost never last (15, 17).** A species with diet above 0.6 was never present at any sample point in any seed. The "First hunter" title fired in one seed of three and the species did not persist. Without hunters there is no visible chase, no fleeing, and no pressure for eyes ("First eye" fired in one seed of three).
3. **Sea level barely moves (31, 81).** The sea stayed between -0.051 and +0.002 km in every run. The events for falling and rising seas need 0.08 km, so they never fired, land bridges never opened and the invasion event never fired.
4. **Half-built or unreachable (12, 46, 50, 62, 100, 101, 110, 129, 144).** Details in the table.
5. **Seed codes (40).** The same seed gives the same planet, but in the browser not the same history.

## Features that are not WORKS-LIKELY

| # | Feature | Verdict | Evidence | What is missing compared with BRIEF.md |
|---|---|---|---|---|
| 12 | Energy, hunger, reproduction, aging and death | PARTIAL | `src/sim/creatures.ts:404-428` (births, starvation, death per cohort); `src/render/creatures.ts:147-219` and `:454-459` (individuals and their ages are made up in the renderer) | Only populations live and die. No individual animal has energy, an age, a birth or a death, and nothing on screen ever eats, breeds or dies. See the in-progress notes. |
| 15 | Herbivores, predators and scavengers in a live food web | PARTIAL | `src/sim/creatures.ts:342-402` (predation), `:318,330-341` (carrion); three seeds: no species with diet > 0.6 at any of about 540 sample points | Grazers, omnivores that take some prey, and scavenging all work. Dedicated predators appeared in one seed of three and did not last, so most worlds have no hunters. |
| 17 | Pack hunting, and prey that flee | PARTIAL | `src/render/creatures.ts:192,203-215,327-333` (chase and flight need a species with diet > 0.6 in the same region); `src/sim/simulation.ts:1386` ("first-pack" fired in one seed of three) | The chase and the bolt are drawn only when a hunter species is present, which evolution rarely provides. A hunter made in the species designer would show it. |
| 31 | Sea level rises and falls, opening and closing land bridges | PARTIAL | `src/sim/simulation.ts:234-237` (sea follows ice), `:378-395` (events at ±0.08 km); measured range -0.051 to +0.002 km in four histories | The swing is too small. No sea-fall or sea-rise event fired in any run, so no land bridge opened or closed. See the in-progress notes. |
| 36 | Night side: bioluminescent plants and creatures | PARTIAL | `src/render/gfx/flora.ts:182` (plants glow at night); `src/render/gfx/creaturemesh.ts:160` (animals glow only with the glow gene > 0.5); glow plants in two seeds of three, glowing animals in none (highest glow gene seen 0.34) | Plants glow. No animal reached the glow threshold in any run, so the creature half is not seen. |
| 40 | Seed codes: a shared code replays the same world exactly | PARTIAL | `src/main.ts:46-51,148-154` (seed in the address, copy link); `src/sim/worker.ts:135,331` (time slows around big events by wall clock, which changes the step sizes); `docs/GPU_REVIEW.md:11` ("Worlds grown from the same seed are not identical run to run") | The planet (continents, climate, names of places) is the same. The history is not: step sizes depend on real-time timing and on speed changes, and every random draw depends on the step size. Only the headless test is exactly repeatable (`tests/sim.test.ts:49`). |
| 46 | Temples facing the camera after many interventions | PARTIAL | `src/sim/civilization.ts:357` (temple after 3 god-tool uses); `src/render/gfx/buildings.ts:127,476` (drawn with heading `hash(st.id * 31) * 6.28`); 232 temples raised in a 12,000-year test after 3 interventions | Temples are built and drawn. They have a fixed random heading; nothing turns them toward the viewer. |
| 50 | Ruins that forests overgrow, later found by a second species | PARTIAL | `src/sim/civilization.ts:1883-1889,1995-1996`; `src/ui/panels.tsx:849-857` (ruins listed); `src/render/gfx/buildings.ts:444` (ruined towns are skipped) | Ruins are a list entry and an event; nothing is drawn where a town stood, so there is nothing for the forest to overgrow and "visit the ruins" flies to bare ground. The rediscovery event works but fired 431 times in one history (each at importance 2, which slows time and fills the timeline) and never in the other two seeds. |
| 62 | Oxygen tracked, with a giant-insect era when it spikes | PARTIAL | `src/sim/plants.ts:329-333`; `src/sim/creatures.ts:252,283-284` (the size limit saturates at 12% oxygen); `src/sim/simulation.ts:901-903` (text-only event above 30%) | Oxygen is tracked, graphed and limits large bodies while the air is thin. Above 12% it changes nothing, so a spike does not produce giants. The "age of giants" is only a line of text and needs 30%, which was not reached (24 and 25% at the end of the two runs where it was recorded). |
| 66 | Sexual selection: mating displays and ornaments | PARTIAL | `src/sim/genetics.ts:122,144,154-156` (ornaments raise breeding, cost energy and concealment); `src/render/gfx/creaturemesh.ts:392-393` (back sail drawn above 0.4) | The trade-off is in the simulation, but the ornament gene stayed low in every run (no species above 0.5; highest recorded 0.33), so no ornament was drawn. There is no display behaviour. |
| 76 | Echolocation shown as ripples | PARTIAL | `src/render/creatures.ts:192,441-446`; `src/render/scene.ts:825`; `src/render/effects.ts:127-130` | Wired end to end, but needs the echolocation gene above 0.6. No species reached it (highest seen 0.57). Cannot be forced with the designer (no slider for it). |
| 77 | Electric fish with visible arcs | PARTIAL | `src/render/creatures.ts:93,397`; `src/render/effects.ts:117-125` | Wired end to end, but needs the electric gene above 0.6 in a sea animal. None in any run (highest seen 0.34). No designer slider. |
| 78 | Metamorphosis, with larval and adult forms | PARTIAL | `src/render/creatures.ts:126-132,191`; `src/sim/genetics.ts:38` (the only use of the gene in the simulation: it mutates slowly) | The grub body is drawn for species with the gene above 0.6, but the gene does nothing in the simulation and starts below 0.3, so it only drifts. Highest seen 0.24; no larva in any run. |
| 81 | Invasive species crossing land bridges | PARTIAL | `src/sim/simulation.ts:793-801` (requires the seas to have fallen) | The event can only fire after a sea-fall event, which never happens (see 31). Never fired. |
| 100 | Shattering the moon into a ring system | PARTIAL | `src/sim/simulation.ts:680-687` (tool `shatter`); `src/render/scene.ts:267-277,749` (ring mesh); `src/ui/panels.tsx:299-313` (tool list has no shatter entry) | The simulation and the ring are built, but there is no button: `shatter` is not in the god-tool list, so a player cannot do it. No commit ever added a button for it (the tool arrived in `fdb718c` in the simulation only). |
| 101 | Ring shadow creating a cold stripe biome | PARTIAL | `src/sim/climate.ts:222`; `src/render/gfx/terrain.ts:201` | Works in code, but only after the moon is shattered, which cannot be triggered (see 100). |
| 109 | Cave networks with blind, pale species | PARTIAL | `src/render/gfx/landmarks.ts:54` (cave mouths on steep slopes); `src/sim/simulation.ts:843-846` (cave-dweller event) | Cave mouths are scenery. There is no cave habitat in the simulation, the species event never fired in any run (it needs burrowing > 0.62, nocturnal > 0.55 and no eyes together), and nothing makes such a species pale. |
| 110 | Hydrothermal vent ecosystems | PARTIAL | `src/sim/simulation.ts:153,847-850`; `src/sim/plants.ts:318-322`; `src/sim/geology.ts:218` (other volcano sites are only placed above -0.5 km) | Vents are fixed at world creation and need a volcano deeper than 0.5 km, which only a hotspot can be. Three of five test seeds have none on the small planet; on the full planet `amber-reef-101` has none and `coral-dune-303` has one region of 4,412. Where one exists it adds a little sea food and one event. Nothing is drawn. |
| 128 | Giant mushrooms and glowing fungal networks in an x-ray view | PARTIAL | `src/render/gfx/flora.ts:484` (mushroom form for glow > 0.5 and water need > 0.55); `src/render/scene.ts:624-637`; `src/render/gfx/terrain.ts:337` (fungal view) | The fungal view works and shows threads wherever glowing plants grow. No plant met the mushroom rule in any run (10 glowing plant species in two seeds, none thirsty enough), so no giant mushrooms were drawn. |
| 129 | Carnivorous plants in poor soil | PARTIAL | `src/sim/simulation.ts:893-899` | Only a line of text for a thorny, toxic, slow plant. Soil is not checked, the plant does not feed on anything, nothing is drawn, and the rule never matched in any run. |
| 132 | Gas-bladder creatures drifting like blimps | PARTIAL | `src/render/gfx/creaturemesh.ts:407-410` | The float is drawn for a winged species with size > 0.45 and metabolism < 0.3. No such species in any run (16 powered fliers were seen, none qualified). The designer cannot make one (it has no metabolism slider and the default 0.3 fails the test). |
| 133 | Living islands: sea giants with forests on their backs | PARTIAL | `src/render/gfx/creaturemesh.ts:411-418` | The grove is drawn for sea animals with size > 0.85 and armour > 0.25. None evolved in any run. A player can force one with the designer (size, water and armour sliders). |
| 134 | Walking forests | PARTIAL | `src/render/gfx/creaturemesh.ts:411-418` | Needs a land giant with the colour-change gene above 0.6. None in any run, and the designer has no slider for it. |
| 135 | Mass hatchings that light up the ocean | PARTIAL | `src/sim/simulation.ts:863-866`; `src/main.ts:620`; `src/render/scene.ts:616-621`; `src/render/gfx/ocean.ts:241-244` | Wired from event to glow in the sea, but the event needs a sea species with glow > 0.4 and many offspring. It never fired in any run. |
| 144 | Full family tree of any individual creature | PARTIAL | `src/main.ts:312-332`; `src/ui/panels.tsx:599-619` | The tree is shown, but parents and grandparents are names generated from a herd number. Siblings and young are other animals on screen. There is no real ancestry because the simulation has no individuals. The species lineage under it is real. |
| 54 | Hotspots that build island chains | UNSURE | `src/sim/geology.ts:171-216` (4 to 7 fixed hotspot sites); `src/sim/simulation.ts:517-523` (eruptions at fixed cells); `src/sim/tectonics.ts:26` (crust moves over them) | The mechanism is there: sites stay put and the crust slides over them. Whether visible chains form before erosion and sinking remove the islands could not be told from the code. There is no event and no test for it. |
| 114 | Fire tornadoes in big wildfires | UNSURE | `src/render/scene.ts:542` (`fire: cells.lava[s] > 0.3`); `src/render/gfx/tornado.ts:14-16`; `src/sim/simulation.ts:490-503` (fire is put out under storm cells) | A funnel turns orange only when the storm cell that carries it sits on ground with fire heat above 0.3. It does not depend on the size of a fire, and the simulation extinguishes fire under storms, so it needs a storm drifting onto ground that is still hot. I could not tell how often that happens. |

## The eight rows marked "in progress"

### 3. Day/night cycle and seasons (verdict: WORKS-LIKELY, with open points)

Done:
- Day and night: the renderer turns the sun once every 80 real seconds at every time speed (`src/render/scene.ts:771-774`).
- Tilt is set per seed, 14 to 30 degrees (`src/sim/climate.ts:58`), and the Tilt god tool changes it (`src/sim/simulation.ts:690`).
- Seasons in the simulation: active when a step is shorter than 0.2 years, which means at 1x and 10x (`src/sim/simulation.ts:224,231`). Land swings by up to 15 °C and sea by 5 °C with latitude (`src/sim/climate.ts:186,194`); snow follows (`:269-283`); biomes use the annual mean (`:226`).
- Seasons on screen: the sun's declination follows the year when time runs at 1 year per second or slower (`src/render/scene.ts:736-738`). It drives autumn colours (`src/render/gfx/flora.ts:584-586`), herds shifting toward the summer hemisphere (`src/render/creatures.ts:326`) and hibernators going underground (`:356`).

Remains:
1. Above 10x the declination simply stops updating (`scene.ts:736`). It is not eased back to zero, so the sun, the autumn colours and the hidden hibernators stay frozen in whatever season was showing when the speed changed.
2. At 10x one year lasts one real second, so the declination (up to 30 degrees each way), the autumn colours and the seasonal temperature all swing once a second, and cell data arrives only four times a second. This probably flickers. It needs a look in a browser; showing seasons only at 1x, or slowing the visual year, would fix it.
3. The day is cosmetic and not tied to simulated time (BRIEF 7.2 puts 1x at one sim day per second).
4. Leaves change colour but do not drop in winter (BRIEF section 3).
5. No test covers seasons.

### 7. Orbiting moon whose tides move the coastline (verdict: WORKS-LIKELY for what the brief asks; visual only)

Done:
- The moon orbits once every 140 real seconds (`src/render/scene.ts:772-782`) and casts eclipse shadows (`src/render/gfx/eclipse.ts`).
- The sea surface carries a tidal bulge that follows the moon: about 35 m between high and low water (`src/render/gfx/ocean.ts:64,95`; `uTideKm = 0.035` in `src/render/common.ts:19`).

Remains:
1. Nothing in the simulation knows about tides. `simulation.ts:223` computes a moon angle that the worker sends (`worker.ts:236`) and the renderer ignores; the renderer keeps its own moon clock.
2. The tide strength is a constant. It does not change when a second moon is captured (`scene.ts:783-787` only places the second moon) and it does not stop when the moon is shattered.
3. Animals and boats use the sea level without the tide (`src/render/creatures.ts:347,382`; `src/render/gfx/buildings.ts:224`), so the water rises and falls past them.
4. Whether a 35 m swing visibly moves a coastline was not confirmed; HANDOFF.md does not list it as seen in a browser either.

### 12. Energy, hunger, reproduction, aging and death (verdict: PARTIAL)

Done, at the level of populations:
- Each cohort (one species in one region) has an energy need and an intake (`src/sim/genetics.ts:127-128`; `src/sim/creatures.ts:286-336`).
- Hunger kills (`creatures.ts:413`), well-fed cohorts breed (`:412`), every cohort has a death rate lowered by the lifespan gene (`:417`; `genetics.ts:157`), and prey is eaten (`:381-402`).
- The losses are tallied per species and used to explain extinctions (`src/sim/simulation.ts:1299-1310`).
- The info card says "searching for food" when the cohort is underfed (`src/render/creatures.ts:465`).

Remains:
1. There are no individuals in the simulation. The animals on screen are created in the renderer from cohort head counts (`src/render/creatures.ts:147-219`). Their age is a hash of their key (`:457-459`). They never eat, breed, grow old or die.
2. BRIEF section 2 asks for full individual simulation near the camera with a seamless switch to statistics, and a spatial hash. Neither exists.
3. There is no aging in the populations either: no age classes, only a constant death rate.
4. At 1x and 10x the ecology step hardly ever runs. It needs 300 simulated years to accumulate (`simulation.ts:272-277`): about 30 real hours at 1x and 5 minutes at 10x. While watching animals up close, no population changes at all.

### 25. Tree of life (verdict: WORKS-LIKELY; the status looks stale)

Done:
- Live tree drawn as SVG, time left to right, one glowing branch per species in its own hue, extinct branches dimmed (`src/ui/panels.tsx:215-280`), fed by the worker's species list (`src/sim/worker.ts:357-359`; `src/main.ts:695-700`).
- Clicking a branch opens the species card and flies the camera to the heart of its range (`panels.tsx:268`; `main.ts:117-121`). Key T opens it (`main.ts:830`).

Remains:
1. The flight stops at a distance of up to 1.4 planet radii (`main.ts:120`), and "fly there" on the card stops at 0.5 (`panels.tsx:169`). Animals are only drawn below 0.16 (`src/render/creatures.ts:341`), so the user arrives above the range without seeing the species. To finish: descend to about 0.1 and select or follow one individual of that species.
2. Clicking an extinct branch opens the card but does not move the camera.
3. No test.

### 31. Sea level and land bridges (verdict: PARTIAL)

Done:
- Sea level follows ice volume, clamped to -0.3 and +0.2 km, plus the Flood tool's bias (`src/sim/simulation.ts:234-237,668`).
- Everything downstream reads it: the renderer (`src/render/scene.ts:347`), the land share of each region (`src/sim/regions.ts:60-88`), drowned towns (`src/sim/civilization.ts:1880`).
- Events for falling and rising seas with climate causes (`simulation.ts:378-395`), a link from the sea event to speciation by isolation (`:1259`) and to extinction by loss of habitat (`:1310`), and the invasion event (`:793-801`).

Measured (three seeds, four histories of 125 to 299 My, one of them on the untouched base commit; two of the seeds had 6 to 10 ice ages, the third none):
- Sea level stayed between -0.051 and +0.002 km.
- `sea-fall`, `sea-rise` and `invasion` never fired.

Remains:
1. The amplitude. Ice volume times 0.035 gives a fall of 35 to 51 m; the events need 80 m. Either raise the factor two or three times or lower the thresholds.
2. The sea never rose above its starting level in any run, so "rise" only happens through the Flood tool.
3. Nothing verifies that a fall joins two lands or that animals cross. A headless test should assert at least one sea-fall, one region changing from sea to land, and one crossing in 150 My.
4. Feature 81 depends on all of this.

### 37. Auroras over the poles (verdict: WORKS-LIKELY; "solar events" remain)

Done:
- Ray-marched curtains around both magnetic poles (`src/render/gfx/aurora.ts:26`; `src/render/scene.ts:324,877`).
- Strength is a slow pulse multiplied by the star's brightness and the amount of air (`scene.ts:880`).
- The PROGRESS note ("ribbon curtains") is out of date: the ribbon module `src/render/aurora.ts` is no longer imported.

Remains:
1. There are no solar events. In the audited commit the star's brightness is exactly 1 until 380 My (`src/sim/simulation.ts:370-371`), so the aurora only follows its fixed pulse. To finish: a flare or solar-storm event in the simulation that raises the aurora for a while and enters the chronicle.
2. Delete the dead ribbon module.

### 38. Generative ambient music (verdict: WORKS-LIKELY; the status looks stale)

Done:
- Tone.js loads on the first click or key (`src/main.ts:218-220`; `src/audio/music.ts:50-56`).
- Slow chords and bell notes from a scale chosen by the stage of life and the climate era (`music.ts:13-21,197-220`); more voices as living species increase (`:203,212`).
- Near silence for 45 seconds after a mass extinction (`main.ts:625,690`; `music.ts:201`), and a people's own melody once they have music (`music.ts:113-143`).
- Music volume setting (`main.ts:195-200`).

Remains: nothing the feature line asks for. Possible polish under stage 9: no response to single events such as an impact, an abrupt change between scales, and nobody has listened to it in this audit.

### Build stage 9: audio polish, performance pass, final QA (in progress)

Done:
- Four quality presets (`src/render/scene.ts:62-73`) and automatic step-downs with a remembered setting (`src/main.ts:159-180,885-907`).
- Real-GPU reviews are on record (`docs/GPU_REVIEW.md`); HANDOFF.md line 76 reports High holding about 50 fps on an Apple M3 Pro.
- Separate music and sound volumes; CI runs the type-check, the tests and the build (`.github/workflows/ci.yml`); the type-check passes.

Remains:
1. The brief's budgets (60 fps on a mid-range laptop, 30 fps on a recent phone) are not demonstrated. HANDOFF.md line 72 says the frame rate has not been measured since the half-resolution cloud pass, and there is no phone measurement.
2. The brief's performance check at 1x and 1000x with full populations is not recorded anywhere.
3. HANDOFF.md line 17 lists things never seen in a browser: trails on the ground, the rainbow, the timeline strip, the GIF and PDF buttons.
4. Open visual defects are listed in HANDOFF.md lines 72 and 100 (loose animal parts, flat leaves, rivers draped over hills, and others).
5. Event floods found in this audit: 915 hurricane landfall events in 1,000 simulated years at the 10x step size on the test planet (`src/sim/simulation.ts:447-452`; hidden from the chronicle, but each one is stored by the page and cuts the population of any town it hits by 15%); "Lightning starts a fire" entering the chronicle about every three seconds at 10x (`:471-479`); 431 rediscovery events in one history.
6. Dead renderer modules are still in the tree (`src/render/ocean.ts`, `vegetation.ts`, `aurora.ts`), and the hidden river ribbons are still rebuilt on every snapshot (`scene.ts:296-299,345`).
7. `scene.cinematic` is set in postcard mode but never read (`main.ts:910`; `scene.ts:127`), so postcard mode has no depth of field unless a creature is followed, although PROGRESS says it does.
8. The controls list and the first-visit hint say keys "1 – 6" while there are seven speeds and key 7 works (`src/ui/panels.tsx:285`; `src/ui/App.tsx:14`; `main.ts:827`).
9. The 27 features in the table above.

## Build stages

| Stage | Status in PROGRESS.md | Finding |
|---|---|---|
| 1 Setup, CI, PRNG, worker loop, protocol | done | Confirmed: `src/sim/rng.ts:1,14` (mulberry32), `src/sim/worker.ts:309-379,494-500` (20 ticks a second), `src/shared/protocol.ts`, `.github/workflows/ci.yml`. No `Math.random` in `src/sim`. |
| 2 Planet, ocean, air, clouds, lighting, post, opening | done | Confirmed in code: `src/render/gfx/terrain.ts:44`, `ocean.ts:27`, `volclouds.ts:99`, `src/render/atmosphere.ts:27`, `postfx.ts`, `opening.ts` (16 seconds, skip, reduced motion). |
| 3 Climate, weather, seasons, moon tides | done | Confirmed, with the open points under features 3 and 7. |
| 4 Plants | done | Confirmed: `src/sim/plants.ts:194`, `src/render/gfx/flora.ts:88`. |
| 5 Creatures, genetics, behaviour, speciation | done | Done for populations only. No individual simulation and no spatial hash (see feature 12). |
| 6 Cause graph, chronicle, camera, core UI | done | Confirmed: `src/sim/events.ts:43-66`, `src/ui/panels.tsx:45-116`, `src/render/camera.ts`. |
| 7 Tier 2 | mostly done | 9 of 55 are partial or unsure (46, 50, 54, 62, 66, 76, 77, 78, 81). |
| 8 Tier 3 | mostly done | 12 of 55 are partial or unsure (100, 101, 109, 110, 114, 128, 129, 132, 133, 134, 135, 144). |
| 9 Audio polish, performance, final QA | in progress | See the notes above. |

Tier 1 has 6 partial features (12, 15, 17, 31, 36, 40).

## Features judged WORKS-LIKELY

"Text only" means the feature reaches the player as a chronicle entry and a simulation effect, with nothing drawn for it in 3D. "Fired" refers to the headless runs described at the end.

### Tier 1

- 1 Planet, oceans, continents, mountains, rivers, polar caps: `src/sim/geology.ts:131`, `src/render/gfx/terrain.ts:44`, `src/render/gfx/rivermap.ts:11`.
- 2 Biomes from temperature and moisture: `src/sim/climate.ts:286-318`.
- 3 Day/night and seasons: `src/render/scene.ts:771-774,736`; in-progress notes above.
- 4 Atmospheric scattering: `src/render/atmosphere.ts:27,63`.
- 5 Clouds with wind and shadows: `src/render/gfx/volclouds.ts:126-169,197`; storms drift downwind in `src/sim/simulation.ts:419-434`. The cloud noise turns as one sky, not in wind bands as PROGRESS says.
- 6 Ocean with depth colour, glint, foam: `src/render/gfx/ocean.ts:152-201`.
- 7 Moon and tides: `src/render/gfx/ocean.ts:64`; in-progress notes above.
- 8 Plants spread by biome, light and rain: `src/sim/plants.ts:42-52,224-248,279-295`.
- 9 Plants evolve: `src/sim/genetics.ts:182-199`, `src/render/gfx/flora.ts:472-488`.
- 10 Creatures built from genomes: `src/render/gfx/creaturemesh.ts:131`.
- 11 Walking with planted feet: `src/render/gfx/creatureskin.ts:38-68`.
- 13 Mutation and natural selection: `src/sim/genetics.ts:50-66`, `src/sim/creatures.ts:404-428,560-574`. No fitness score anywhere.
- 14 Speciation with Latin-style names: `src/sim/creatures.ts:644-728`, `src/sim/naming.ts:14-20,46`. 152 to 176 speciations per run.
- 16 Herds, flocks, schools: `src/render/creatures.ts:312-335`.
- 18 Life from sea to land: `src/sim/simulation.ts:1110-1162,1389-1392`. First steps on land in all three seeds (at 58 and 62 My in the two where the date was recorded).
- 19 Flight from gliding: `src/sim/genetics.ts:102-103`, `src/sim/simulation.ts:1393-1398`. Gliding then flight in two seeds of three; none in `amber-reef-101` by 266 My.
- 20 Cause graph: `src/sim/events.ts:43-66`.
- 21 "Why did this happen?": `src/ui/panels.tsx:69-116`.
- 22 Continuous zoom: `src/render/camera.ts:12-13,175-210`.
- 23 Follow mode and info card: `src/main.ts:789-799`, `src/ui/panels.tsx:177-212`, `src/render/scene.ts:826-834`.
- 24 Time controls: `src/shared/protocol.ts:4-13`, `src/main.ts:102-110,826-827`, `src/sim/worker.ts:133-136`.
- 25 Tree of life: `src/ui/panels.tsx:215-280`; in-progress notes above.
- 26 Chronicle and narration: `src/ui/panels.tsx:45-66`, `src/ui/App.tsx:103-106`, `src/sim/simulation.ts:187-192`.
- 27 Milestone pop-ups: `src/sim/simulation.ts:207-211,1379-1398`, `src/main.ts:551-562`. "First fire" and "First city" fired in all three seeds, "First flight" in two, "First eye" in one.
- 28 Storms, lightning, rain and growth: `src/sim/simulation.ts:401-482`, `src/render/scene.ts:799-813`. 325 storm events in 1,000 years at the 10x step.
- 29 Lightning fires and regrowth: `src/sim/simulation.ts:466-511`, `src/sim/plants.ts:217-223,252`. 325 lightning fires in the same test.
- 30 Ice ages and warm eras: `src/sim/simulation.ts:305-361`. 8 to 14 warm eras per run, and 6 to 10 ice ages in two seeds; `jade-fjord-505` had no ice age in 299 My.
- 32 Eruptions with lava, ash, fertile ground: `src/sim/simulation.ts:548-593`, `src/sim/geology.ts:338-362`, `src/render/gfx/terrain.ts:255-256`.
- 33 Meteor tool: `src/sim/simulation.ts:934-964`, `src/main.ts:623`, `src/render/scene.ts:521-526`.
- 34 Mass extinctions with causes: `src/sim/simulation.ts:1341-1359`. 1 to 5 per run.
- 35 Adaptive radiation: `src/sim/creatures.ts:667-670`, `src/sim/simulation.ts:1360-1367`.
- 37 Auroras: `src/render/gfx/aurora.ts:26`; in-progress notes above.
- 38 Generative music: `src/audio/music.ts:197-220`; in-progress notes above.
- 39 Postcard mode: `src/main.ts:834,908-915`. No depth of field (the `cinematic` flag is never read).

### Tier 2

- 41 Intelligence threshold: `src/sim/civilization.ts:128-141`. Crossed in all three seeds (122 to 137 My in two of them).
- 42 Campfires: `src/sim/simulation.ts:1413-1415`, `src/render/gfx/terrain.ts:305`.
- 43 Villages and city lights: `src/sim/simulation.ts:1419-1424`, `src/render/gfx/terrain.ts:308`, `src/render/gfx/civmap.ts:14`.
- 44 Cave paintings of real species: `src/sim/civilization.ts:160-164`, `src/sim/simulation.ts:1460-1463`. Text only.
- 45 Religions founded on real events: `src/sim/civilization.ts:1952-1959,2002-2015`, `src/ui/panels.tsx:841`.
- 47 Domestication: `src/sim/civilization.ts:1720-1724,1913-1927`.
- 48 Farmland: `src/sim/civilization.ts:2033-2038`, `src/render/gfx/terrain.ts:162`.
- 49 Roads along migration trails: `src/render/gfx/nations.ts:343-344`.
- 51 Plate tectonics: `src/sim/tectonics.ts:26`, `src/sim/simulation.ts:251-258`, `tests/world.test.ts:12`.
- 52 Mountain building and rain shadows: `src/sim/geology.ts:384`, `src/sim/climate.ts:249-254`.
- 53 Earthquakes and tsunamis: `src/sim/simulation.ts:595-622`. Text only, plus scoured coasts.
- 55 Canyons and deltas: `src/sim/landforms.ts:22`, `src/sim/simulation.ts:714-724`. Both events fired in every run.
- 56 Ocean currents carrying heat: `src/sim/climate.ts:142-166,208-220`.
- 57 Rafting: `src/sim/creatures.ts:550-558`, `src/sim/simulation.ts:788-791`. 54 to 87 events per run.
- 58 Reefs, atolls, bleaching: `src/sim/plants.ts:380-381`, `src/sim/landforms.ts:71-81`, `src/render/gfx/terrain.ts:186-188`. Bleaching fired in two seeds of three.
- 59 Plankton blooms and glowing waves: `src/sim/plants.ts:377`, `src/render/gfx/ocean.ts:152,202-204`.
- 60 Hurricanes with an eye: `src/sim/simulation.ts:437-457`, `src/render/gfx/volclouds.ts:133-152`. The landfall event floods (stage 9, point 5).
- 61 Snow and meltwater: `src/sim/climate.ts:269-283`, `src/sim/geology.ts:307-308`.
- 63 Seasonal migrations and trails: `src/sim/creatures.ts:173-195`, `src/sim/simulation.ts:1072-1097`, `src/render/gfx/terrain.ts:165-167`. Trail event fired in every run.
- 64 Hibernation, day and night species: `src/sim/creatures.ts:276-277`, `src/render/creatures.ts:356,370-373`. Night species in one seed of three (21 species in `amber-reef-101`).
- 65 Camouflage: `src/sim/creatures.ts:368-372`, `src/sim/plants.ts:314`.
- 67 Nests and parental care: `src/render/creatures.ts:196-200,256-285`. One caring species in one seed of three.
- 68 Disease in herds: `src/sim/simulation.ts:626-652,752-755`. Text only.
- 69 Symbiosis pairs: `src/sim/simulation.ts:868-892`, `src/sim/creatures.ts:288-290`. Three pairs per run.
- 70 Flowers and pollinators: `src/sim/creatures.ts:291-293,339`, `src/sim/plants.ts:245,282`.
- 71 Toxin arms race chart: `src/sim/worker.ts:269-279`, `src/ui/panels.tsx:888-889`.
- 72 Convergent evolution detector: `src/sim/simulation.ts:914-930`. Fired in two seeds of three.
- 73 Island dwarfs and giants: `src/sim/simulation.ts:1289-1296`. 33 to 36 per run.
- 74 Flight lost: `src/sim/simulation.ts:1284-1285`. Fired in one seed. The rule does not check for islands or predators.
- 75 Return to the sea: `src/sim/simulation.ts:1286-1288`. Fired in one seed.
- 79 Hive mounds: `src/render/creatures.ts:277-283`. Hive species in all three seeds.
- 80 Keystone collapse: `src/sim/simulation.ts:1331-1339`. 4 to 8 per run.
- 82 Living fossils: `src/sim/simulation.ts:907-913`.
- 83 Fossil layer: `src/main.ts:246,259`, `src/render/scene.ts:503-518`, `src/render/gfx/terrain.ts:340`.
- 84 Field guide with sketches: `src/ui/panels.tsx:473-496`, `src/ui/sketch.tsx:23`.
- 85 Extinction memorial: `src/ui/panels.tsx:477,497-507`.
- 86 Rewind timeline: `src/sim/worker.ts:30-51,334-341,452-468`, `src/ui/panels.tsx:622-646`. Twelve points, not the fifty of BRIEF 7.5.
- 87 God tools: `src/ui/panels.tsx:299-306`, `src/sim/simulation.ts:655-679`.
- 88 Species designer: `src/ui/panels.tsx:315-347`, `src/sim/simulation.ts:734-747`.
- 89 Monolith: `src/sim/civilization.ts:178-187`, `src/render/scene.ts:752-757`.
- 90 Overlays: `src/main.ts:253-260`, `src/render/scene.ts:591-606`, `src/sim/simulation.ts:1049-1069`.
- 91 Graphs: `src/main.ts:680-687`, `src/ui/panels.tsx:876-894`.
- 92 First-person view: `src/main.ts:838`, `src/render/scene.ts:838-849`.
- 93 Creature calls: `src/main.ts:796`, `src/audio/music.ts:149-157`.
- 94 Spatial sound: `src/render/scene.ts:552-587`, `src/main.ts:872-883`, `src/audio/music.ts:163-190`. Surf, rain and lava are panned; wind and thunder are not.
- 95 Documentary director: `src/main.ts:615`, `src/ui/panels.tsx:935`.

### Tier 3

- 96 Eclipses that quiet animals: `src/render/gfx/eclipse.ts:27`, `src/render/creatures.ts:372-373`. The chronicle's eclipse events (`src/sim/simulation.ts:756-763`) are random and not tied to the drawn shadow.
- 97 Returning comet and myths: `src/sim/simulation.ts:764-773`. Text only; no comet in the sky.
- 98 Meteor showers and mutation: `src/sim/simulation.ts:774-778`, `src/sim/creatures.ts:560`. Text only.
- 99 Captured second moon: `src/sim/simulation.ts:805-809`, `src/render/scene.ts:748,783-787`. Not rare: it happened in every run (at 39 and 144 My in the two where the date was recorded).
- 102 Supernova: `src/sim/simulation.ts:779-787`. Text only. One to four per run.
- 103 Sun brightening: `src/sim/simulation.ts:370-375`, `src/sim/climate.ts:183`. Starts at 380 My, which no run of mine reached; rewritten by the later commit.
- 104 Constellations named after extinct species: `src/sim/civilization.ts:362-367`, `src/sim/simulation.ts:1429-1432`. Text only. 19 in the 12,000-year test.
- 105 Binary suns and double shadows: `src/sim/simulation.ts:151`, `src/render/gfx/terrain.ts:239-243`, `src/render/atmosphere.ts:150-151`. Two of the five test seeds are binary.
- 106 Supercontinent cycle: `src/sim/simulation.ts:259-268`, `src/sim/geology.ts:451`.
- 107 Supervolcano winters: `src/sim/simulation.ts:522,584-592`.
- 108 Fjords: `src/sim/geology.ts:393-403`, `src/sim/simulation.ts:708`. No event; the shape of the result was not seen.
- 111 Geysers and hot springs: `src/render/effects.ts:174-176`, `src/render/gfx/terrain.ts:170`.
- 112 Salt flats: `src/sim/climate.ts:310,316`, `src/render/gfx/terrain.ts:144-148`. A biome of hot dry lowland; drying seas are not modelled.
- 113 Tornadoes: `src/render/scene.ts:529-546`, `src/render/gfx/tornado.ts:16`.
- 115 Dust storms feeding the sea: `src/sim/landforms.ts:104`, `src/sim/plants.ts:245-246`, `src/render/effects.ts:177-179`.
- 116 Acid rain: `src/sim/simulation.ts:580-582`. Text only.
- 117 Fog, rainbows, heat shimmer: `src/render/scene.ts:688-697`, `src/render/atmosphere.ts:63,89-94`, `src/render/postfx.ts:161`.
- 118 Ozone layer: `src/sim/plants.ts:189,323`, `src/sim/simulation.ts:781`.
- 119 Snowball planet: `src/sim/simulation.ts:365-368`. Needs 55% ice. It never fired; the one run where ice cover was tracked peaked at 31%.
- 120 Permafrost thaw: `src/sim/simulation.ts:343-345`.
- 121 Coal burning warms the planet: `src/sim/civilization.ts:309-311`.
- 122 Plagues between towns: `src/sim/civilization.ts:418-430`, `src/main.ts:616`. 136 in the 12,000-year test.
- 123 Trade boats: `src/render/gfx/nations.ts:369`, `src/render/gfx/buildings.ts:132-143,531-532`, `src/render/gfx/ocean.ts:214-231`.
- 124 Wars and borders: `src/sim/civilization.ts:368-394`, `src/render/gfx/nations.ts:214`, `src/render/gfx/civmap.ts:53`. 176 wars in the 12,000-year test.
- 125 Space age, satellites, radio: `src/sim/civilization.ts:313-315`, `src/render/scene.ts:743`, `src/render/gfx/satellites.ts:12`. The radio signal is text. Satellites appear at technology 0.9, before the space-age title at 1.1.
- 126 Nuclear winter: `src/sim/civilization.ts:414`, `src/sim/simulation.ts:1447-1453`. Fired once in the 12,000-year test.
- 127 Departure: `src/sim/civilization.ts:318-320`, `src/main.ts:622`, `src/render/effects.ts:113,208-216`. It comes 1,500 years after the space age, not the 25 My in PROGRESS.
- 130 Autumn colours: `src/render/gfx/flora.ts:584-586`.
- 131 Oldest tree marker: `src/sim/plants.ts:307,324-326`, `src/render/scene.ts:758-765`.
- 136 Bone graveyards: `src/render/scene.ts:503-518`, `src/render/gfx/landmarks.ts:21`.
- 137 Golden mutant: `src/render/creatures.ts:46-48,393,468`.
- 138 Eternal storm: `src/sim/simulation.ts:411-412`. It drifts with the wind rather than sitting over one spot.
- 139 Underwater view: `src/main.ts:837`, `src/render/scene.ts:851-860`, `src/render/postfx.ts:120,145`.
- 140 Cross-section: `src/main.ts:341-381`.
- 141 Flat map: `src/main.ts:388-431`, `src/ui/panels.tsx:419-441`.
- 142 Photo mode and filters: `src/main.ts:434-446`.
- 143 Timeline fork with two futures: `src/main.ts:262-304`, `src/ui/panels.tsx:649-676`. Desktop only.
- 145 A people's own music: `src/sim/civilization.ts:361`, `src/audio/music.ts:113-143`.
- 146 Silence after a mass extinction: `src/main.ts:625,690`.
- 147 More god tools: `src/ui/panels.tsx:307-312`, `src/sim/simulation.ts:688-698`.
- 148 Hands-off mode: `src/ui/panels.tsx:450-453`, `src/main.ts:801`.
- 149 GIF and video: `src/main.ts:447-484`, `src/util/gif.ts:67`.
- 150 PDF book: `src/main.ts:486-548`, `src/util/pdf.ts:58`.

## Headless evidence

| Run | Code | Seed | Reached | What it showed |
|---|---|---|---|---|
| 1 | working tree | amber-reef-101 | 266 My | Event tally. No sea-fall, sea-rise, invasion, hunter, eye, glide or flight. |
| 2 | working tree | amber-reef-101 | 125 My, then 12,000 years at 1-year steps | Sea range -0.038 to -0.001 km; highest diet gene 0.32. In 1,000 years at the 10x step: 325 storms, 325 lightning fires, 915 hurricane landfalls. After three god-tool uses: 232 temples, 176 wars, 136 town plagues, 19 constellations, 1 nuclear war, space age and departure. |
| 3 | working tree | jade-fjord-505 | 299 My | Sea range -0.035 to -0.002 km. Glide, flight, flight lost, return to the sea, first hunter (158 My), bleaching, 433 rediscoveries. |
| 4 | working tree | coral-dune-303 | 283 My | Species looks sampled: none of the special looks; first eye; vent event. Sea range -0.051 to +0.002 km. |
| 5 | working tree | jade-fjord-505 | 296 My | Species looks sampled: 44 gliders, 14 fliers, 26 hive species, 8 glowing plants; none of the special looks. |
| 6 | commit 4424753 | amber-reef-101 | 258 My | Same picture on the audited commit: sea range -0.038 to +0.001 km; 21 night species, 1 caring species; none of the special looks. |

Scripts and raw output are in the same folder as this report (`tally.ts`, `probe2.ts`, `probe3.ts`, `probe4.ts`, `run1.txt` to `run6.txt`).

## What I could not verify

- Anything visual. Shaders and meshes were read, not seen.
- The full-size planet. All long runs used the small grid; counts that use fixed thresholds (reef bleaching, for example) may behave differently at full size.
- Histories past 300 My, so the sun brightening (103) was not observed.
- Sound.
- The whole test suite.
