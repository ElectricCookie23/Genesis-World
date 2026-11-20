# Genesis on a real GPU: review

Observations only. Nothing under `src/` was changed. Screenshots are in `docs/screenshots/gpu/`.

This is the second version. The first was cut short by a flat battery; this one adds frame rates on mains power, a clean WebGL2 pass, a proper look at creatures, and corrects the first version's account of the black ground (C3).

**Read this first: limits**

- The live site was reviewed as deployed. A fix for the vertex-buffer problem (C1, C2) is reported to exist on branch `claude/sweet-keller-8gmglc` but was not on the live site, so it was not seen.
- **No nations, settlements or buildings exist** in any of the ten worlds grown from this seed (all reach stage "animals" at 150 My with `settlements: 0`). The night map and anything built could not be reviewed.
- Worlds grown from the same seed are **not identical** run to run (23 to 41 living species, different plant colours and cover at the same spot), so screenshots from different sessions do not match exactly.
- The surface turns black part-way through a session (C3). Many close-ups were taken after that had happened; where it matters the text says so.
- Roughly 60 of about 230 captures were looked at. Each finding names the files it rests on; the rest are listed at the end.
- For part of the second run the machine's owner was also using the same browser window, so the Genesis tab may have been in the background at times. The frame-rate table was finished before that; the creature captures after it were checked to be in a visible tab.

## Check of commit f958025 (2026-11-21)

Newest green deploy when testing began: game code `f958025` (it contains `996a702`; `b91e127` on top is docs only). The page served `assets/index-C8xtQ58C.js` throughout. WebGPU, High, seed `amber-reef-101`, mains power. Plain warp to the dawn (stopped at **69.53 My** this time; 59.03 My on the previous build), `through: true` for 100,000 years (367 living towns, 42 realms), then on to 200 My (931 towns, 67 realms). A second short run used `&neighbor=basalt-vale-202`. Files start `retest9-`. Seven files are cited and all seven were looked at; about 20 were captured. Console, main run: `x2 Failed to load resource: the server responded with a status of 404 ()`, `x23 Max polyphony exceeded. Note dropped.` Linked run: one 404.

**A. Fixes from the last check**

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Day side from orbit | **Not fixed.** After 10 s and after 30 s the cloud belt is still flat white with a white glow round the whole disc (scene luminance 0.108 and 0.106, exposure target 1.86). Land and sea outside the belt are readable. | `retest9-webgpu-orbit-day-30s.jpg`, `setImmediate(-1.46, 0.1, 2.6)`, sun +0.5 |
| 2 | Shoreline foam | **Not judged.** "Kimanarap" does not exist in this world. The only island town found shows a short pale rim round a tiny islet, too small to judge. | `retest9-webgpu-island-town-0.006.jpg` |
| 3 | Nest mounds against their builders | **Fixed by the numbers** (largest mound 0.00071, its builder 0.00078, so about the same size; it was many times larger). My picture of it was taken from inside a tree crown and shows nothing, so this is not confirmed by eye. | logs |
| 4 | Night Map | On the side looked at: **11 names**, none overlapping another. One ("Shezaros") starts outside the planet's left edge with its flag off the disc. The other two sides were captured, not looked at. | `retest9-webgpu-night-map-0.jpg` |
| 5 | Paved strips into the sea | None seen at the island town, and no pale rectangles under water there. | `retest9-webgpu-island-town-0.006.jpg` |

**B. New features**

| # | Item | Result | Evidence |
|---|---|---|---|
| 6 | System panel (S) | **Reads well.** Title "Shiashiakraesh and its worlds"; an orrery with the star, four orbit rings and planets on them, plus a dotted tilted ellipse (a comet's path); a line on the star's age; three planets listed with distance, year length and notes; "A linked world"; then, scrolled down, a star map, probes and arks sent, "Left behind" archives with "open it", and "Word from beyond" with small map thumbnails of other worlds and "open this world" links. Nothing overlaps or is cut off; the panel scrolls. **Whether the planets move was not judged** (two captures 3 s apart were taken with the sim paused and not compared). The stats box is hidden while it is open. | `retest9-webgpu-system-top.jpg`, `-system-bottom.jpg` |
| 7a | Gamma-ray burst | Chronicle entry "The burning sky" appears. `scene.flashLevel` rose to 0.25 and faded within a second, but scene luminance did not change (0.114 throughout), so the flash is barely visible. The capture during it was not looked at. Triggered with `send({ type: 'god', tool: 'burst', cell })`, the message the panel sends. | logs |
| 7b | Shatter the moon | **Works.** `stats.moons` 0, `stats.ring` true, chronicle "The moon is broken", and a broad banded ring circles the planet; it looks good. No darker band along the equator is visible in the capture. **"Shatter the moon" is not in the sky-tools list in this build's code** (`GOD_TOOLS` in `src/ui/panels.tsx` has no such entry), so it was triggered with `tool: 'shatter'` directly. | `retest9-webgpu-after-shatter-wide.jpg`, `setImmediate(-1.46, 0.5, 3.4)` |
| 7c | Rogue planet | Chronicle entry "A dark world passes" appears. What the System panel then says about the orbit was not captured (my text reader returned only the title). | logs |
| 8 | Linked world | **Works.** After a 5 My warp the System panel shows "A linked world, basalt-vale-202: Running beside this one, year for year: green seas, nothing that moves. Neither world knows the other is there yet..." with "open that world on its own". No console errors beyond the usual 404. | `retest9-webgpu-linked-system-bottom.jpg` |
| 9 | Hunters | **Not seen.** At the home cells of the ten most numerous land species, no individual had `hunter` set, so there was no chase to watch. Species cards were not opened. | logs |
| 10 | Designer sliders | **Skipped.** The designer in this build's code (`DESIGN_GENES` in `src/ui/panels.tsx`) has no ornaments, colour change, echolocation, electric sense, larval stage, metabolism, day-or-night or burrowing sliders. | |

The sky-tools panel itself was not captured: my key press did not open it.

**C. New or worse**

1. **A town drawn as one tower on stilts.** "Rari" (`pop` 179, `tech` 0.96, `(-0.224, 0.636)`), on a cell almost surrounded by sea, appears as a single tower block standing on three thin poles on a tiny mound in open water, with the real island behind it empty (`retest9-webgpu-island-town-0.006.jpg`).
2. The dawn of history moved from 59.03 My to 69.53 My on the same seed and backend, so worlds are not repeatable across builds.
3. A bright streak with a glowing head (a comet or a launch) shows on the Night Map side looked at.

## Check of commit 4424753 (2026-11-21)

Newest green deploy when testing began was `4424753` (it contains `b93d708`); the page served `assets/index-u3vNpV0q.js` throughout. WebGPU, High, seed `amber-reef-101`, mains power. Plain warp to the dawn (stopped at 59.03 My), `through: true` for 100,000 years (588 living towns, 104 realms; town, coast and Night Map captures), then on to 200 My (1,023 living towns, 70 realms, `maxTech` 0.23; everything else). Files start **`retest8-`** (`retest7-` was already used by the follow-up below). Ten files are cited and all ten were looked at; about 25 were captured. Console: `x2 Failed to load resource: the server responded with a status of 404 ()`, `x17 Max polyphony exceeded. Note dropped.` WebGL2 console on the same bundle is in the follow-up below (one 404, nothing else).

"Mounpoke" exists again but is a different town in this build: `pop` 38.4, `tech` 0.76, on a small island at `(-1.315, -0.125)`. The largest town was "Du" (`pop` 597), not captured.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Ground between buildings | **Fixed.** The island town's ground is bare brown earth with no grass or tufts, and no trees left on it. It reads as worked earth, helped by pale grey paved strips between the houses. | `retest8-webgpu-town-day-0.006.jpg`, `setImmediate(-1.315, -0.125, 0.006)`, tilt -0.6 |
| 2 | Taller towers | Three tower blocks stand about twice the height of the houses and dominate the skyline. No trees or large animals in this frame to compare against. **From `dist 0.08` the capture is unusable**: the camera was inside cloud and the frame is blank grey-white. | same; `retest8-webgpu-town-day-0.08.jpg` |
| 3 | Night windows | **Fixed.** From `dist 0.02` roughly half the windows are lit, the halo is small, and the town reads clearly as a lit settlement with its lights glittering on the sea around it. 0.006, 0.08 and 0.3 were captured but not looked at. | `retest8-webgpu-town-night-0.02.jpg`, sun +2.8 |
| 4 | Night Map | From the one side looked at: **2 names** ("Nonadari", "Momeratar") for 104 realms, no overlap, both inside the disc. The other two sides were captured, not looked at. My script's label count found nothing, so there is no count for them. | `retest8-webgpu-night-map-0.jpg` |
| 5 | Lightning from orbit | **No white ball** over a storm cell in the frame looked at; `scene.flashLevel` read 0 in all five frames across 25 s, so no flash happened to be caught and a flicker was not seen either. A small dark dot sits on the cloud belt. | `retest8-webgpu-lightning-2.jpg` |
| 6 | Shoreline foam | **Not fixed.** At "Kimanarap" the hard straight white rim still runs the full width of the frame at the water's edge. The island town shows the same thing worse: its foam outline is a polygon with sharp corners around the whole island. | `retest8-webgpu-coast-0.006.jpg`, `(2.848, -0.246, 0.006)`; `-town-day-0.006.jpg` |
| 7 | Animal feet | **Fixed on the animal seen.** A purple two-legged animal stands on flat oval pads resting on the ground; they do not look like balls and do not hover. It has a flat pale skirt-like flap under the body between the legs. Only one animal's feet were looked at. | `retest8-webgpu-forest-0.004.jpg` (right side) |
| 8 | Goals | Panel opens on J and reads well: title, a line of explanation, "8 of 11 reached", each goal with a tick, progress bar, current figure, and "a hint / why did this happen? / share this world" links. **8 of 11 reached** at 200 My ("Giants" not: largest land animal 4.4 m of 5; "A crowded world" not: 40 of 50). The stats box at top right is hidden while the panel is open and back when it closes. Pressing "follow" puts a small box ("A green world", bar, "15% of the land is green") beside the title at top left; with a species card open it sits above the card and does not overlap it. "why did this happen?" set `whyEvent` and closed the goals panel; that screen was captured (`-goals-why.jpg`) but not looked at. | `retest8-webgpu-goals-panel.jpg`, `-goal-box-with-card.jpg` |
| 9 | Broadleaf forest from inside | **Seen.** Thick dark trunks, plain and untextured, one with a square-cut branch stub; no visible flare at the ground and no bark grooves at this distance. Crowns are full masses of rosettes made of crossed cards, with no edge-on spikes. Leaves are still flat, single-colour ovals. | `retest8-webgpu-feet-0.jpg`, in a forest at dist about 0.008 |
| 9 | Other carried-over items (sky at 5 km on WebGL2, small island, wader) | Done in the follow-up section below. In this run the species-card capture also shows purple animals at the water's edge with foam rings round their legs, which looks right. | `-goal-box-with-card.jpg` |
| 10 | Worse than before | See 1 to 3 below. | |

**New or worse**

1. **Square slabs in the sea are back.** Around the island town, flat pale translucent rectangles with straight edges and right-angle corners extend from the shore out over the water, and the foam line follows their corners (`retest8-webgpu-town-day-0.006.jpg`). Some of the grey "paving" strips on the land run straight off the shore into the sea.
2. **The day side from orbit is blown out** in the Goals capture: the cloud belt and much of the disc are flat white with a wide white glow round the planet, and a soft dark blotch sits on the belt (`retest8-webgpu-goals-panel.jpg`, `setImmediate(-1.46, 0.1, 2.6)`, sun +0.5). Earlier checks showed the same view correctly exposed.
3. **A nest mound close up is a huge plain tan cone** filling the centre of the screen, far larger than the animals beside it (`-goal-box-with-card.jpg`).
4. In the forest, a large animal's legs are blue and green striped columns as thick as the tree trunks (`-feet-0.jpg`).
5. Houses are large barrack-like blocks with three rows of windows; the smallest are still two storeys.
6. One or two stars are visible in the daytime sky near sea level in the town view.

No holes in the land or lines across the sea were seen, so no diagnostic was saved.

## Follow-up on WebGL2: sky at altitude, a wader, an island (2026-11-21)

The items the check below left open. WebGL2, High, seed `amber-reef-101`, bundle `assets/index-u3vNpV0q.js` (newer than the `DySXvzft` of the check below; I did not record its commit). Plain warp to the dawn, then `through: true` for 100,000 years. Files start `retest7-`; 4 of 9 were looked at. Console: `x1 Failed to load resource: the server responded with a status of 404 ()`.

**Worlds differ by backend or build:** here the plain warp stopped at 81.70 My, against 59.03 My on WebGPU in the check below.

| Item | Result | Evidence |
|---|---|---|
| Daytime sky at altitude, WebGL2, sun +0.3, camera toward the horizon (`dist 0.055`, tilt -0.35) | **Fixed at 3 km**: an even lavender sky, no stars (`(-2.74, 1.04)`, 2.92 km). **Nearly fixed at 5 km**: lavender at the horizon darkening to deep violet overhead, with one or two faint stars still visible near the top of the frame (`(1.66, -1.08)`, 4.91 km). The 1.7 km capture was not looked at. | `retest7-webgl-sky-3km.jpg`, `-sky-5km.jpg` |
| A wading animal close up | **Looks wrong.** A two-legged evolved animal (species 187, in water 0.36 units deep, 0.36 below the surface by its recorded position) is drawn **standing on top of the sea**: both legs and feet are fully visible down to the toes, with no waterline across the legs and no splash or ripple. The numbers say it is on the bottom; the picture says it is walking on water. The water here is clear turquoise shallows, so the legs may simply be showing through an untinted surface. | `retest7-webgl-wader-close.jpg` (camera held on individual 5832780 at 5x its size, tilt -0.15, sun +0.4) |
| Same animal | Body is a smooth blue-grey shape with a fine scale pattern, a bulbous two-lobed head with no visible eye from this side, wing-like flaps folded along the back, thin legs with small feet. Reads as an animal. | same |
| A small island | **No missing-sea squares.** A snow-covered islet (`(1.361, 0.998)`, 0.35 km) with sea right up to its shore on all sides and a soft pale shallows ring; the mainland shore behind is also clean. | `retest7-webgl-island-0.05.jpg` |
| Broadleaf forest from inside | **Not done.** No warm, fully inland, dense forest cell existed in this world. | |

At 5 km the snow terrain is a harsh dark-and-white speckle that reads as gravel rather than snow (`-sky-5km.jpg`).

## Check of commit 6dddd2d (2026-11-21)

Deploy run for `6dddd2d` green before testing; the page served `assets/index-DySXvzft.js` from start to end (a docs-only push of mine redeployed the site during the run; the open page kept its bundle). WebGPU, High, seed `amber-reef-101`, mains power. One world: a plain warp to the dawn of history, `through: true` for 100,000 years (town captures), then `through: true` on to 200 My (everything else). Files start `retest6-`; 10 of about 30 were looked at. Console over the run: `x2 Failed to load resource: the server responded with a status of 404 ()`, `x42 Max polyphony exceeded. Note dropped.`

**Both blockers are fixed.** The plain warp stopped by itself at 59.03 My (3 towns, 1 realm). After 100,000 more years: 1,001 living towns, 95 realms, `tech` 0.06 to 1.2. At 200 My: 1,287 living towns of 1,587 records, 87 realms, `tech` 0.44 to 0.72. `through: true` ran without stopping and `simYear` advanced during the warp. The 141 My leg took about 12 minutes with a live civilization (it was about 2 minutes on a dead world).

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Large town at night ("Mounpoke", `pop` 613, `tech` 1.17, `(0.767, -0.466)`) | **Fixed.** From `dist 0.08` and `0.02` there are no painted patches and no glowing ribbon; lit windows carry the scene, and the town reads clearly from 0.08 as clusters of warm points. From the ground each lit tower has a wide pink-white halo and the air between them glows red, so it is on the bright side, but it reads as a city at night. From 0.3 and orbit: captured, not looked at. | `retest6-webgpu-large-night-0.08.jpg`, `-large-night-0.02.jpg`, sun +2.8 |
| 2 | Early village at night ("Chattactewa", `pop` 13.3, `tech` 0.06, `(0.668, -0.138, 0.006)`) | **Fixed for fires.** Three small flame-shaped lights sit on the ground among the trees and light nothing around them. No hut is recognisable in the frame (dark, under a broadleaf canopy), so "a fire by each hut" was not confirmed. Houses with lit windows: captured (`-houses-night-0.02.jpg`), not looked at. | `-early-night-0.006.jpg` |
| 3a | Worked earth between buildings | **Not fixed, as far as this view shows.** In the large town by day the ground between domes and towers is the same hummocky terrain thick with tall purple grass tufts, right up to the walls. No bare or trodden ground is visible. | `-large-day-0.006.jpg` |
| 3b | Buildings overlapping | **Fixed** in the frames seen: buildings stand apart. | `-large-day-0.006.jpg`, `-wader-close.jpg` |
| 3c | Huts in the surf | **Fixed** at the coastal town checked ("Kimanarap", 0.01 km above sea): houses sit on the hilltop, none at the waterline. | `-coastal-day-0.006.jpg`, `(2.848, -0.246)` |
| 4 | Night Map labels | **Overlap fixed.** Five labels shown, none overlapping. Two of them ("Momarori", "Momakesri") sit outside the planet's left edge, pointing at territory on the limb. Only 5 names for 95 realms. | `-night-map.jpg` |
| 5 | Broadleaf forest from inside | **Partly seen.** My forest pick landed on a bay, so there is no inside view. The broadleaf crowns in the foreground of the holes view are full, rounded masses of rosettes with no edge-on spikes, clearly better than before. Trunks, boughs and bark were not seen. | `-holes-view.jpg` |
| 6 | Land animals on the sea | **Fixed by the numbers.** Across five land species near their home cells, 1,543 individuals, 767 of them land walkers: 8 were over water, all in the shallows (water 0.06 to 0.54 units deep), none over deep water, **none standing on the surface** (feet 0.06 to 0.54 below it). The close-up meant to show a wader shows a shoreline with towers and no animal identifiable, so how a wading animal *looks* is not judged. | logs; `-wader-close.jpg` |
| 7 | Night side from orbit | **A little better.** Land shows as dark red-brown patches near the lights and the cloud belt is clear, but away from settlements land and sea are still the same near-black. City lights are plentiful and attractive. A hard white dot sits on the cloud belt. | `-night-orbit.jpg` |
| 8 | Sky at altitude on WebGL2; small island | **Not done** in this run. | |
| 9 | **Holes in the land** at `setImmediate(2.86, 0.18, 0.06)`, tilt -0.35, sun +0.5, 200 My | **Not reproduced.** The view is a solid forested hill: dense conifers, broadleaf crowns in front, a strip of water and a bare hill behind. No openings, no coloured lines. With `scene.ocean.sphere.mesh.visible = false` the luminance barely changed (0.216 to 0.221). Recorded there: terrain `patchCount` 413 of `max` 1200, ocean `patchCount` 187 of `max` 1000, `stats.seaLevel` 0.0204, focus cell 8851 at 3.571 km above sea with neighbours 3.472, 3.183, 2.001, 1.596, 3.099, 1.474, camera radius 1.03281. A diagnostic dump was saved as `retest6-webgpu-holes-view-diagnose.json` for comparison. In the broken capture this cell was coast or sea, so the two worlds differ at this spot; the earlier world came from bundle `Btwbmnw6`. | `-holes-view.jpg`, `-holes-view-no-ocean.jpg` (not looked at), `-holes-view-diagnose.json` |
| 10 | Anything worse | Nothing worse seen. | |

**New observations**

1. In the coastal view a **hard straight foam line runs the full width of the frame** between a strip of land and the sea in front of it, where turquoise shallows meet the shore in a step rather than a shoreline (`-coastal-day-0.006.jpg`).
2. Large-town buildings are still plain white boxes with window grids and pink roofs; the two spired towers and red domes read well from a distance.
3. Large animals are visible walking the skyline behind the town at about the height of a tower block (`-large-day-0.006.jpg`, top left).
4. Rain streaks show over the forest in the holes view.

## Check of commit 6249d6c: not completed (2026-11-20)

**None of the nine requested items could be judged.** The builds that were live during this check behave differently under a fast-forward, and by the time the worlds reached the usual test age there was no living civilization to look at. What follows is what happened, as findings in their own right. WebGPU, High, seed `amber-reef-101`, mains power. Files start `retest5-`; one was looked at.

The site redeployed during the session. Three bundles were seen: `index-fbVPCIsX.js` (first two runs), then `index-Btwbmnw6.js` (last two runs, after `945a395` was pushed). I did not record which commit each bundle belongs to.

| Run | Bundle | What was asked | What happened |
|---|---|---|---|
| 1 | `fbVPCIsX` | `send({ type: 'warp', years: 200e6 })` | **The warp stopped at 82.4 My** with the milestone "The dawn of history", 4 settlements, `maxTech` 0.221, speed 0. It did not resume in 90 s. Earlier builds ran straight to 200 My. `state.stats.simYear` also reads 0.01 My for about 60 s while a warp is running, then jumps. |
| 2 | `fbVPCIsX` | (my script queued ten warps by mistake) | Reached 282.4 My: era "winter", last milestone "The last war", 23,007 settlement records of which **2 live**, largest `pop` 1.8, `tech` 0.03, 2 nations. Console: `music unavailable TypeError: Failed to fetch dynamically imported module: https://electriccookie23.github.io/Genesis-World/assets/esm-BgEymAd-.js` (the redeploy removed a chunk the open page still needed). Captures from this world were not reviewed. |
| 3 | `Btwbmnw6` | warp to 200 My, resumed after each stop | Stopped once at 58.63 My ("First tamed animal", 3 settlements, `maxTech` 0.22), then ran to 200 My. **At 200 My: 5,359 settlement records, none live (`ruined < 0` matched nothing), `stats.maxTech` 0, 0 nations.** No living species with `land > 0.5` either, so the shoreline check had nothing to follow. `stats.stage` still "animals". |
| 4 | `Btwbmnw6` | warp to 90 My | Stopped once at 59.03 My ("First farms", 3 settlements), then ran to 90 My. **At 90 My: 698 settlement records, none live, `maxTech` 0, 0 nations.** |

So on `Btwbmnw6` civilization appears at about 59 My and is entirely gone by 90 My, in both runs. On the build checked the day before (`DEGcW2rY`, commit `6766d4a`) the same seed had 468 live settlements and 15 nations at 200 My. Either civilizations now die out within about 30 My, or the fields I read (`settlement.ruined`, `stats.maxTech`, `state.nations`) changed meaning; I did not open the Peoples panel to tell which.

**New visual problem** (run 3, `Btwbmnw6`, 200 My, `setImmediate(2.86, 0.18, 0.06)`, tilt -0.35, sun +0.5; `retest5-webgpu-broadleaf-0.06.jpg`):

1. **The land has holes through it.** A ridge of bare brown terrain hangs over the sea with three arch-shaped openings along its lower edge; the sea surface shows through them as if the land were a hollow shell lifted off the water.
2. **Straight coloured lines cross the sea under and beside the land**: a pink polyline, a white double line and a pale green line, with sharp corners, like a wireframe or the "causeway" lines reported earlier.
3. No plants at all at a site that was dense broadleaf forest in the previous build's world (the worlds differ, so this may simply be a different place now).

No diagnostic dump was saved for this view.

**For whoever repeats this:** a scripted warp must now be re-sent after each milestone stop, and the script must wait for `simYear` to move before deciding the warp has stopped. To review towns, stop soon after civilization begins (about 60 My on this seed) and step forward in small warps while watching the count of live settlements.

## Check of commit 6766d4a (2026-11-20)

Deploy run for `6766d4a` green before testing; the site served `assets/index-DEGcW2rY.js` throughout. WebGPU, High (Ultra for item 4), 200 My warp, mains power. Files start `retest4-`; 10 of about 45 were looked at. Console over the run: `x1 Failed to load resource: the server responded with a status of 404 ()` only.

**Correction to earlier sections:** `pop` is in thousands. "Zohan, population 503" is about half a million people, not 500 farmers, so its tower blocks are less out of scale than I wrote. The world had 468 live settlements, median `pop` 21.3.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Daytime sky at altitude | **Fixed on WebGPU where the sky was in frame.** Lavender day sky with clouds and no stars at 1.7 km (`setImmediate(-2.6, -0.3, 0.055)`, tilt -0.35) and at 3.6 km (`(2.78, 0.18, 0.055)`); a strip of lavender sky, no stars, at 5.03 km (`(0.5, 1.02, 0.02)`, sun +0.3). **WebGL2 not verified:** my dedicated sky captures on both backends were framed at the ground (tilt +0.25 at `dist 0.02` looks steeply down), so the WebGL2 frames show only snow. | `retest4-webgpu-forest0-0.055.jpg`, `-forest1-0.055.jpg`, `-sky-5km.jpg` |
| 2 | Far trees at mid distance | **Fixed.** At `dist 0.055` the conifers are real models with clean frond edges, no stair-stepping; forest 1 had 314 near models and 640 far pictures in view (was 0 near at this distance). | `-forest0-0.055.jpg`, `-forest1-0.055.jpg` |
| 2b | Zoom 0.049 to 0.012 | **Smaller change.** Near models are already present at 0.049 (28, 68, 12 across three plant meshes) and far pictures fall from 64 to 25; before, near models rose from 7 to 24 while far pictures fell from 115 to 63. Frames `-zoom-0..6.jpg` were not looked at. | logs |
| 3a | Large town at night, from the ground | **Much better.** The scene is lit by the buildings' own windows, glowing pink-white in grids, with a soft pink halo; domes show a lit band of windows. No blown-out ground. The halo is strong enough that every tower looks wrapped in neon. | `-large-night-ground.jpg`, `(1.844, 0.648, 0.02)`, sun +2.8 |
| 3b | Large town at night, from low | **Not fixed.** From `dist 0.08` there are still large pale pink patches on the ground with hard ragged edges, around the town and in four other places, though dimmer than before (luminance 0.007, was 0.022). Lit windows now show as points inside the patch. | `-large-night-low.jpg` |
| 3c | Village at night | **Not fixed.** Huts are unlit dark boxes on a pink-lit patch of ground, and a bright pink ribbon (a road or stream) runs across the dark terrain like a painted stripe. Nothing is lit by windows or fires. The aurora behind is thin rays, which looks right. | `-village-night-ground.jpg`, `(1.929, 0.874, 0.02)` |
| 4 | Ultra on a fresh load | **Fixed.** `clouds.steps` 32, `genesis:steps:ultra` absent, pixel ratio 2, all effects on, from first ready through 36 s. It did not step down at all in the young world's default view (63 to 71 fps there); where it settles in a warped world was not re-measured. | logs |
| 5 | Square slab of sand on the island | **Not checkable.** `(-1.1, -0.66)` is open sea in this world (cell 2.17 km below sea level). | `-island-0.05.jpg` (not looked at) |
| 6 | Huts in the surf | **Not confirmed either way.** The lowest-lying small village (`pop` 0.5, 0.22 km above sea) had no huts in frame from `(2.609, 0.212, 0.02)`; the view was of the sea and a hillside. | `-coastal-day-ground.jpg` |
| 7 | Middling town ("Gebemiath", `pop` 27.6, `tech` 0.28) | **Looks right for its size and era**: dozens of small pale huts with pitched or conical roofs spread over a hillside, no towers. Huts are plain untextured beige boxes, some tilted with the slope and several overlapping each other. | `-mid-day-ground.jpg`, `(0.964, 0.586, 0.02)` |

**New or still wrong**

1. **A land animal stands on the sea** in the coastal view: a striped two-legged animal upright on the water well offshore, with others walking the hill behind (`retest4-webgpu-coastal-day-ground.jpg`, right side). This is an evolved animal, not a sample one.
2. Small red-brown blobs float on the sea surface in the same frame (heads of swimmers, or debris; not identified).
3. Broadleaf trees over the middling town: thick dark trunks and flat rosette leaves, some leaf cards hanging edge-on as thin spikes (`-mid-day-ground.jpg`).
4. At 5 km the terrain is a harsh high-contrast speckle of white snow and black shadow, and a crater's far wall is evenly lit with no shading (`-sky-5km.jpg`).
5. The fog smudge over part of a tree line is still there (`-forest0-0.055.jpg`, left).

**Nothing looked worse** than in the last pass in the frames reviewed.

## Third pass: under water, more forests, zoom, a village (2026-11-20)

Live site at `a42b083` plus docs-only commits; bundle `assets/index-BsLmvyFQ.js`. High preset, 200 My warp, mains power. Files start `retest3-`; 14 of about 55 were looked at. This fills the "not re-tested" gaps of the section below. Console over the whole WebGPU run: `x2 Failed to load resource: the server responded with a status of 404 ()`, `x8 Max polyphony exceeded. Note dropped.`, nothing else.

**Under water** (WebGPU, `scene.underwater = true`, `setImmediate(-0.48, -0.62, 0.0012)`, camera 1.45 m-units below the surface; diagnostic dump `retest3-webgpu-8-underwater-diagnose.json`)

1. **Looking up now works.** A rippling bright surface seen from below, blue-green water, and branching coral-like plants with pale tips. `retest3-webgpu-8b-underwater-up.jpg` (tilt +0.4). Before the fixes this view was a blank seabed.
2. **Looking down is still flat**: one uniform grey-green ripple texture filling the frame, no caustics, no depth fog, no light shafts. `retest3-webgpu-8-underwater.jpg` (tilt -0.25).
3. **Reef plants are plain tubes**: straight untextured cylinders in a V-branching pattern with square white caps on the tips; one tube crosses the corner of the downward view as a bare faceted stick.
4. No animals seen under water in either frame.

**Forests** (WebGPU; five forests with different dominant plants were visited)

1. **Broadleaf forest, new and it holds together.** Dark branching trunks with rosette leaves forming a canopy; reads as a wood from inside. Leaves are still flat discs with no thickness, and all one flat violet. `retest3-webgpu-forest3-mid.jpg`, `setImmediate(2.86, 0.18, 0.06)`, tilt -0.35; `-forest1-ground.jpg`, `(-3.14, -0.2, 0.02)`.
2. **Trunks are untextured and far too thick and straight** for the crowns, with square-cut branch stubs sticking out (`-forest3-mid.jpg`).
3. **Conifer imposters are upright and match**, confirmed again at three more sites; still stair-stepped (`-forest0-mid.jpg`, `-forest4-mid.jpg`).
4. **Ground under the trees is bare rock-brown** with sparse grass tufts: no litter, undergrowth or shadow, so trees look placed on a model railway (`-forest1-ground.jpg`).
5. **Daytime sky is dark violet** in every forest frame, with stars visible at 5 km (`-forest4-mid.jpg`, elevation 4.98) and not at 1.7 km. Same finding as before: the sky darkens with altitude far too fast.
6. A soft white fog patch sits over part of the tree line in two frames (`-forest0-mid.jpg`, `-zoom-0.jpg`); it reads as a smudge on the lens rather than mist.

**Zooming in (popping).** A steady zoom from `dist 0.049` to `0.012` at forest 0, one frame every 250 ms. Near models rose from 7 to 24 while imposters fell from 115 to 63 and grass from 1,853 to 1,179. In the frames looked at, the same trees are blocky imposters at 0.049 and sharp flat-card models at 0.017, a clear change in look, but the positions and colours agree. Whether individual trees snap on a given frame was not judged from stills. `retest3-webgpu-zoom-0.jpg`, `-zoom-3.jpg`.

**Coast from 0.3** (`setImmediate(1.68, -1.08, 0.3)`): the sea has a visible fine diamond-grid pattern across its whole surface, and a broad white sun glare top-left. The frame is otherwise sharp. `retest3-webgpu-5-coast.jpg`.

**An early village on WebGL2** ("Zeavohu", population 38, `tech` 0.41, `setImmediate(-0.137, -0.201, 0.02)`, 2 nations in that world)

1. **Era-appropriate this time**: about thirty small huts with pitched yellow-green roofs scattered under umbrella trees on a beach. So building style does follow `tech`; the tower blocks reported below belong to towns at tech 1.0 and over, which is still far too modern-looking for 500 farmers. `retest3-webgl-town-ground.jpg`.
2. **Umbrella trees seen at last**: flat-topped layered crowns on tall trunks. The near one has a dark curved trunk; the ones behind have pale straight trunks and blockier crowns, so the near/far mismatch remains for this form.
3. **Huts are scattered at random** with no paths, hearths, plots or boats; **two sit in the surf**, half under water.
4. **At night the whole hillside glows warm white** as one large patch with a bright line across it; huts are dark boxes on it and show no lit windows. Less harsh than the pink blow-out at the large WebGPU town, but still a floodlit ground rather than points of firelight. `retest3-webgl-town-night-ground.jpg`, sun +2.8.
5. Under water on WebGL2 was captured (`retest3-webgl-8-underwater.jpg`, `-8b-underwater-up.jpg`) but not looked at.

**Reproducibility.** The WebGPU world in this pass matched the previous one exactly (same largest town, "Zohan", population 503), so worlds on one backend now repeat. The WebGL2 world from the same seed was different (2 nations instead of 15).

**Still not covered:** roads and boats (none identified in any capture), trails, popping judged in motion, Medium and Ultra on WebGL2, Firefox and Safari.

## Re-test of commit 29ea8ad (2026-11-19)

Same machine, browser and window as below; cache disabled; the site served `assets/index-C5rnxzCy.js` for the whole run (the deploy for `29ea8ad` was the latest green run when testing began; no redeploy was noticed). The laptop was charging, 55% rising to 62%, so not on the battery-saver cap. Files start `retest2-`; 20 of about 60 were looked at. Worlds differ run to run, so each backend's captures come from its own world.

**Fixed / not fixed / new**

| Item | Result | Evidence |
|---|---|---|
| Console, WebGPU Medium/Ultra/High and WebGL2 High (fresh load, warp, visual pass, slot load) | **Clean.** Only `x1 Failed to load resource: the server responded with a status of 404 ()` on two WebGPU loads and `x2 Max polyphony exceeded. Note dropped.` No pipeline errors, no non-finite warnings, and the `toNonIndexed` warnings are gone. | logs |
| Black surface | **Fixed, still.** Coast luminance 0.454 at 238 s parked and 0.459 after a slot reload (WebGPU); 0.444 and 0.443 (WebGL2). | logs |
| Imposters upright and matching near models (WebGPU) | **Fixed for conifers.** Far conifers are upright, trunk inside the crown, same shape and colour as the near models. They are still visibly stair-stepped at mid distance. | `retest2-webgpu-forest-mid.jpg` `(-1.1, -0.66, 0.05)` |
| Upside-down jungle slabs (C5) | **Not verified.** The old jungle spot was open sea in this world. | `retest2-webgpu-jungle-ground.jpg` |
| Umbrella tree: domed crown, imposter match | **Not seen**; neither world's densest forest had that form. | |
| White discs / limb glare (sibling planets) | **Fixed.** Day orbit shows one shaded moon, no white disc or halo. | `retest2-webgpu-orbit-day.jpg` |
| Aurora | **Fixed.** No pink crown by day; thin fringes at both poles at night; thin rays from the ground at night. | `-orbit-day.jpg`, `-orbit-night.jpg`, `-civ-town-night-low.jpg` |
| Daytime sky from the ground | **Partly fixed.** Lavender day sky at 0.3 km (WebGPU). **At 3 km it is still dark indigo with stars showing** at sun +0.3 (WebGL2 forest, `(3.06, -0.24)`). | `-webgpu-sample-animals-mid.jpg`; `retest2-webgl-forest-mid.jpg`, `-forest-sky-sun0.3.jpg` |
| Sea glint from orbit | **Fixed.** No blown-out patch. | `-orbit-day.jpg` |
| Animal and tree proportions | **Better.** Sample animals are now below tree height; the long-necked one is about half a conifer. | `-webgpu-sample-animals-mid.jpg` |
| Nest mounds | **Improved.** Small smooth cones; far fewer; none seen on water. | `-webgpu-sample-animals-mid.jpg`, `-coast.jpg` |
| "Hoops in the sky" | **Fixed.** Rings now lie flat on the sea. | `-webgpu-forest-night.jpg` |
| Contour stripes on hills | **Not seen** at the coast this time. | `-webgpu-coast.jpg` |
| Depth of field when not following | **Fixed.** Coast is sharp edge to edge. | `-webgpu-coast.jpg` |
| Milestone titles after a warp | **Fixed.** One title in 40 s ("The last war") on both backends. | logs |
| Green causeway lines on the sea | **Not fixed, or changed.** On the Night Map, thin dotted lines run straight across open sea between coasts. They may be shipping lanes by design. | `-civ-night-map.jpg` |
| Presets and step-downs | See the table below. High now holds about 50 fps at orbit and coast. | logs |

**Frame rate** ("full" = within 1.5 s of re-applying the preset, remembered step cleared; "settled" = after 12 to 16 s; pr = pixel ratio)

| Preset, backend | Orbit full / settled | Coast full / settled | Ground full / settled | Settles at | Orbit: clouds shown to hidden |
|---|---|---|---|---|---|
| Medium, WebGPU (asks pr 1.25, 12 cloud steps) | 74 / 81 | 61 / 63 | 54 / 55 | step 0: nothing stepped down; bloom on, anti-aliasing and ambient occlusion off by preset | 73.5 to 90.9 |
| High, WebGPU (pr 1.5, 18 steps) | 50 / 52 | 46 / 51 | 34 to 36 / 65 | orbit: step 1, pr 1.5, clouds 12, anti-aliasing, bloom, ambient occlusion all on. Ground: step 2, pr 1, clouds 12, all three still on | 50.7 to 69.9 |
| Ultra, WebGPU (pr 2) | 21 to 25 / 46 to 67 | 17 to 18 / 63 | 14 to 15 / 54 to 57 | orbit: step 4, pr 1.5, clouds 14, anti-aliasing on, bloom and ambient occlusion off. Ground: step 5, pr 1, all three off | 20.4 to 46.9 |
| High, WebGL2 (pr 1.5, 18 steps) | 60 / 95 to 97 | 46 to 48 / 82 | 38 to 39 / 71 to 74 | step 0: nothing stepped down | 57.9 to 77.3 |

- High is now usable on this machine: about 50 fps from orbit and the coast at its own settings, and it keeps anti-aliasing, bloom and ambient occlusion when it steps down at ground level.
- Ultra still starts at 14 to 25 fps and ends up at High-or-lower settings (step 4 to 5).
- Clouds cost less than before: hiding them gains 19 fps at High (was 24 to 30) and 17 at Medium.
- **Ultra's cloud steps read 21 on a fresh load, not 32**, and `genesis:steps:ultra` was already "1" straight after I cleared the remembered steps and reloaded; it stepped down during loading.
- `&noadapt` figures: High on WebGPU with step-downs off held pr 1.5, 18 cloud steps and all effects on, at 47 to 49 fps orbit, 43 to 44 coast, 34 ground; clouds shown to hidden 49 to 68. These agree with the "full" column. Medium and Ultra were not run with `&noadapt`.

**Civilization, seen for the first time** (WebGPU, High, 200 My warp: 15 nations, largest town "Zohan", population 503, `tech` 1.035, at `setImmediate(1.844, 0.648, ...)`; diagnostic dump `retest2-webgpu-civ-town-low-diagnose.json`). Note the 150 My worlds in this run also had settlements (6,390 to 8,456 entries in `state.settlements`) while `stats.stage` still read "animals".

1. **Buildings do not match their era.** A town of 503 people at tech 1.0 with farms is drawn as white tower blocks with regular dark window grids, spired towers and large pink domes: a modern skyline. `retest2-webgpu-civ-town-ground.jpg` (dist 0.02), `-town-near.jpg` (0.008).
2. **Buildings stand in wild grass with nothing between them**: no streets, plots, fields or cleared ground, although the settlement has `farms: true`. Grass blades as tall as house doors grow against the walls.
3. **Buildings sit on rough terrain without foundations**; several are half-sunk or perched on bumps, all perfectly vertical.
4. **A river runs up and over the hills through the town** as a flat teal band draped on the terrain, crossing ridges rather than lying in a valley (`-town-near.jpg`, centre).
5. Building shading is flat: plain white walls, uniform pink roofs, no shadows cast on the ground.
6. From low altitude the town is a scatter of white specks; the tower blocks read as pins (`-civ-town-low.jpg`, dist 0.08).
7. **At night the lit ground around towns is blown out**: large hard-edged white-pink patches with ragged borders, far brighter than anything else, with buildings as dark silhouettes inside them. More patches follow what look like roads. `-civ-town-night-low.jpg`, sun +2.8.
8. **Night Map works.** Fifteen nations with names, flags, glowing borders and settlement lights; readable and attractive (`-civ-night-map.jpg`). Problems: borders are hexagon-edged and step along cell boundaries; several labels overlap ("Soutan Union" over "United Siamivolia"); labels are drawn for nations on the far limb.
9. City lights show from orbit on the night side as orange and green points (`retest2-webgpu-after-warp-ui.jpg`).
10. **Roads and boats were not identified** in any capture. Satellites not looked for.

**Other new observations**

1. **A square-cornered slab of sand juts into the sea** from the island at `(-1.1, -0.66)`: straight edges and right angles, like a terrain patch drawn at the wrong level (`retest2-webgpu-forest-mid.jpg`, `-sample-animals-mid.jpg`).
2. **Conifer fronds are flat cut-out cards with hard zig-zag edges**; inside the forest the view is a mass of overlapping flat shards in one flat colour, with a speckled noise on them (`retest2-webgpu-forest-ground.jpg`, `retest2-webgl-forest-ground.jpg`). No leaf has thickness or shading.
3. **Evolved animal close up** (*Helolornis sagax*, 0.09 m): scaled body, thin legs ending in ball feet that hover just above the ground, and a **flat pink rectangle sticking out of its side** (`retest2-webgpu-evolved-close.jpg`).
4. **Evolved land animals over water:** 6 of 99 land-walking individuals near one home cell were over water on WebGPU, 5 of 174 on WebGL2. Not looked at in a picture.
5. Sample animals still stand in the sea at the shore, and one flier is inside a tree (`-webgpu-sample-animals-mid.jpg`); that is the sample tool placing them everywhere.
6. The night side from orbit is very dark; land is barely distinguishable from sea apart from the lights (`-orbit-night.jpg`).
7. High snowfields are a uniform grey-white speckle to the horizon (`retest2-webgpu-highground-sky.jpg`).
8. Half-resolution clouds: no halos or blockiness seen at the limb from orbit or against the tree line in the captures looked at. Cloud edges against mountains were not checked.

**Not re-tested:** under water; the eight views as a set; popping during movement; trails; `&noadapt` at Medium and Ultra; WebGL2 at Medium and Ultra; civilization on WebGL2; a second world for settlements.

## Re-test of commit 5bbe93a (2026-11-19)

Same machine, browser and window as below, on mains power, cache disabled. The deploy run for `5bbe93a` was green before testing and the page served `assets/index-BrT09p0l.js`. Everything below this section describes the site *before* that commit. Files for this section start `retest-`; about 20 of roughly 90 were looked at.

**What is fixed**

| Check | WebGPU | WebGL2 |
|---|---|---|
| Console, Low, fresh load | `x4 THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.` and `x1 Failed to load resource: the server responded with a status of 404 ()`. Nothing else: no "Vertex buffer count", no "Binding size ... is zero". | `x2 THREE.BufferGeometry.toNonIndexed(): ...` only |
| Console, High, fresh load | `x2 THREE.BufferGeometry.toNonIndexed(): ...` only | same |
| Console, High, during warp, plant close-ups, slot load, sample animals | none (the two `toNonIndexed` warnings again on the slot load) | same |
| Young world from orbit straight after load | Blue sea and pink-tan land visible (`retest-webgpu-high-young-orbit.jpg`); coast luminance 0.36 | Same (`retest-webgl-high-young-orbit.jpg`); coast luminance 0.38 |
| Warped world parked with the sim paused | Coast luminance 0.444 to 0.447 at every 30 s sample from 127 s to 400 s. **Stayed lit.** `state.notice` empty throughout. | 0.378 to 0.380 through 425 s. **Stayed lit.** |
| Save a slot, reload with `&slot=0` | **Lit**: orbit 0.114, coast 0.444, ground 0.544 (`retest-webgpu-slot-coast.jpg`) | **Lit**: 0.114, 0.396, 0.548 |
| Near plant models | **Draw now.** At the densest clear-sky forest in that world, `setImmediate(2.44, 0.36, 0.02)`: 35 near models, 292 imposters, 1579 grass blades; at `0.008`: 70 near, 201 imposters, 4048 blades (`retest-webgpu-forest-ground.jpg`, `-near.jpg`) | Drew before; 1 to 2 near models at the old forest spot |
| Sample animals (`debugSpawn` with the stub) | **Draw as animals**: bodies, necks, heads with eyes, horns, back plates, jointed legs with feet, tails, stripes and spots, fur on the furry one (`retest-webgpu-creature-sp0-c-mid.jpg`, `-sp5-a-side.jpg`, `-sp6-b-above.jpg`) | Same (`retest-webgl-creature-sp1-c-mid.jpg`, `-sp0-a-side.jpg`) |
| Sky panels from creature meshes | Gone | Gone |

WebGL2 limits: `MAX_UNIFORM_BLOCK_SIZE` 16384, `MAX_VERTEX_ATTRIBS` 16, `MAX_VERTEX_UNIFORM_VECTORS` 1024.

**Frame rate at High after the fix** (full settings, then settled; pr = pixel ratio)

| Backend | Orbit | Coast | Ground (0.94, 0.74) | Orbit: clouds shown to hidden |
|---|---|---|---|---|
| WebGPU | 20 fps (pr 2), settled 48 (pr 1) | 16 to 17, settled 44 (pr 1) | 14 to 15, settled 40 (pr 1) | 21.3 to 51.7 |
| WebGL2 | 25 to 30 (pr 2), settled 62 to 80 (pr 2) | 18, settled 56 to 57 (pr 2) | 17.5 to 18, settled 55 to 58 (pr 2) | 26.7 to 46.5 |

WebGPU is 2 to 4 fps slower than before at coast and ground (was 21 and 17), and its settled figure at ground level (40) is further under the 50 fps target. WebGL2 is unchanged. The ground spot was bare snow in these worlds, so this is not the cost of plants.

**Correction to C2 below.** The "plain brown faceted arch" that the first review took for sample species 1 was not the animal. The same arch stands in `retest-webgpu-forest-ground.jpg` with no sample animals spawned, and sample species 1 now draws as a tall tan long-necked animal. The arch is some other object (a burrow or nest); what it is was not identified.

**New problems, visible now that things draw**

1. **Tree imposters do not match their near models (umbrella-style tree).** Near: dark branching trunks with flat blue-violet leaf rosettes. Far, in the same frame: pale tan rectangular posts with rows of thin horizontal dashes. The change in shape and colour is abrupt. `retest-webgpu-forest-ground.jpg`, `setImmediate(2.44, 0.36, 0.02)`, tilt -0.5, sun +0.5.
2. **Leaves are flat single-colour discs**, all horizontal, with no shading or thickness; close up one rosette fills the screen as a flat purple shape (`retest-webgpu-forest-near.jpg`, dist 0.008).
3. **Daytime sky at ground level is night-dark with stars and aurora while the ground is in full sun.** Every ground capture in the re-test, at sun +0.3 and +0.5, on both backends (`retest-webgpu-forest-ground.jpg`, `retest-webgl-creature-sp1-c-mid.jpg`). Before the fix the same sun angles gave a lilac day sky (`6-forest-ground.png`). The earlier captures were lower ground; these are 2 to 3 km up, so it may be altitude, but it reads as night.
4. **Land animals stand on the sea, and sea animals lie on land.** Sample land animals over water stand on the surface in a group (`retest-webgpu-creature-sp4-c-mid.jpg`); the aquatic sample animal lies on a snowfield (`retest-webgl-creature-sp0-a-side.jpg`). `debugSpawn` puts every sample species in every neighbouring region, so this may be the test tool rather than the game; not checked with evolved animals.
5. **Animals are very large against the terrain.** The long-necked sample animal is as tall as the cliff behind it and many times a tree's height; the fliers are of similar size. Size on screen comes from `ind.size * boost` in `src/render/creatures.ts`.
6. **Fur is a coarse blocky speckle** around the body with visible square steps, not hair (`retest-webgl-creature-sp0-a-side.jpg`, upper left; `retest-webgpu-creature-sp0-a-side.jpg`).
7. **Detached or floating parts.** A small loose foot-shaped piece sits under the striped animal away from any leg (`retest-webgpu-creature-sp0-a-side.jpg`, centre). The aquatic animal's fins are flat paddles lying apart from the body. One leg of the long-necked animal is paler and see-through (`retest-webgpu-creature-sp1-a-side.jpg`).
8. **Feet mostly meet the ground**, with some hovering slightly above uneven snow (`retest-webgpu-creature-sp5-a-side.jpg`, right-hand animal).
9. **Shading on animals is flat with hard white streak highlights**; colours are saturated and toy-like.
10. **Hillsides and shores show evenly spaced pale contour stripes**, like terraces (`retest-webgpu-creature-sp4-c-mid.jpg`, `retest-webgpu-slot-coast.jpg`).
11. **WebGPU, young world from orbit: a large blown-out white patch on the open sea** left of centre, and a white body with a wide halo at the right limb (`retest-webgpu-high-young-orbit.jpg`). The halo is the WebGL2 glare of C4, now on WebGPU too.
12. **Several captures are dim with a heavy dark vignette** (`retest-webgpu-plants-0.02.jpg`, `-slot-coast.jpg`, `-creature-sp1-a-side.jpg`). They were taken about 1.3 s after re-applying the preset, so this may be exposure still settling.
13. **Nest mounds are now four-sided pyramids**, still tall against everything else and numerous (`retest-webgpu-slot-coast.jpg`, `-plants-0.02.jpg`).
14. A patch of white haze covers the left of `retest-webgpu-forest-ground.jpg` at ground level.

**Seen for the first time and looking right:** evolved animals in the wild (small green lizard-like and yellow two-legged animals on the snow in `retest-webgpu-plants-0.02.jpg`), sea animals as pale shapes in a bay from mid altitude (`retest-webgpu-slot-coast.jpg`), flocks of fliers in the air.

**Not re-tested:** Medium and Ultra; the eight views as a set; under water; C5 (the upside-down jungle imposters); hand-over popping during movement; evolved animals close up; legs and gait in motion (stills only).

## Machine

| | |
|---|---|
| Machine | MacBook Pro, Apple M3 Pro (18-core GPU), macOS 27.0.1 (26A434), built-in Liquid Retina XDR 3024 x 1964, 120 Hz |
| Browser | Google Chrome 158.0.8127.37, headed window, scratch profile |
| `chrome://gpu` | WebGL: Hardware accelerated. WebGPU: Hardware accelerated. `GL_RENDERER`: `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Version 27.0.1 (Build 26A434))`, display type `ANGLE_METAL` |
| WebGL unmasked renderer | `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)` |
| WebGPU adapter | vendor `apple`, architecture `metal-3`, `isFallbackAdapter: false` |
| Window | 1600 x 913 CSS px inner, devicePixelRatio 2, canvas 3200 x 1826 |
| Backends | Default URL reports `webgpu` in the HUD. `&webgl` reports `webgl2`. |

URL: `https://electriccookie23.github.io/Genesis-World/?seed=amber-reef-101&skip&fresh` (plus `&webgl`).

## Loading

- Page `load` event 1.9 s cold, 0.1 s warm. Planet on screen 4.7 s cold, 0.8 to 4.1 s warm.
- The planet appears on both backends.
- `warp` of 150 My took 106 to 139 s (186 s once on Ultra on battery). The UI is blocked meanwhile.
- After the warp a **backlog of milestone titles** ("First eye", "The Kreagerun extinction", "First steps on land", each with its old year) plays over the centre of the screen for minutes, covering the planet (`4-night-map.png`).

## Console errors and warnings (verbatim, with counts per page load)

| Count | Backend | Message |
|---|---|---|
| 2 | both | `[warning] THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.` |
| 0 or 1 | both | `[error] Failed to load resource: the server responded with a status of 404 ()` (URL not captured; absent on some loads) |
| 1 each | WebGPU | `[error] THREE.WebGPURenderer: Render pipeline creation failed (renderPipeline_MeshBasicNodeMaterial_60): Vertex buffer count (10) exceeds the maximum number of vertex buffers (8).` `- While validating vertex state.` `- While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""renderPipeline_MeshBasicNodeMaterial_60""]).` Same text for `_65` and `_79` (10). |
| 1 each | WebGPU | Same error with `Vertex buffer count (9)` for `_84`, `_85`, `_86`. |
| once, Ultra on battery | WebGPU | Same error with `(14)` for `_90`, `(11)` for `_65`, `(10)` for `_57` and `_67`. |
| 1 + 1 | WebGPU, Low | `[error] THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: Binding size for [Buffer "bindingBufferundefined_UniformBuffer_32_(vertex)"] is zero.` `- While validating entries[5] against { binding: 5, visibility: ShaderStage::Vertex, buffer: {type: BufferBindingType::Uniform, minBindingSize: 0, hasDynamicOffset: 0} }.` `- While validating [BindGroupDescriptor ""bindGroup_object""] against [BindGroupLayout (unlabeled)]` `- While calling [Device].CreateBindGroup(...)`, then the same text as a `[warning]`. Seen on both Low loads. |
| 11 to 23 per few minutes | WebGPU | `Max polyphony exceeded. Note dropped.` (audio) |

WebGL2 is clean apart from the first two lines. No shader compile warnings on either backend.

## Frame rate

Method: the camera is parked, the preset is re-applied (which resets the automatic step-downs) and frames are counted with `requestAnimationFrame` for 1 s: the **full** column. **Settled** is the HUD figure after 12 to 16 s parked, once the step-downs (`src/main.ts`, "adaptive quality", target 50 fps) have finished. "pr" is the renderer pixel ratio.

Camera: orbit `cam.setImmediate(-1.46, 0.1, 2.6)`, coast `(2.58, 0.62, 0.3)`, forest ground `(0.94, 0.74, 0.02)` with `tiltOffset = tTilt = -0.5`; sun `dayAngle = lon + 0.5`.

**On mains power** (one freshly warped world per row):

| Preset, backend | Orbit full | Orbit settled | Coast full | Coast settled | Ground full | Ground settled | Orbit: clouds shown to hidden |
|---|---|---|---|---|---|---|---|
| Low, WebGPU | 99 to 120 fps (pr 1) | 121 (pr 1) | 93 (pr 1) | 101 (pr 1) | 88 (pr 1) | 98 (pr 1) | 121 to 121 |
| Medium, WebGPU | 41 to 44 (pr 1.5) | 80 (pr 1) | 31 to 33 (pr 1.5) | 58 (pr 1) | 28 to 29 (pr 1.5) | 52 (pr 1) | 43.5 to 74.2 |
| High, WebGPU | 22 (pr 2) | 52 (pr 1) | 21 (pr 2) | 54 (pr 1) | 17 (pr 2) | 43 (pr 1) | 21.8 to 45.8 |
| Ultra, WebGPU | 13 (pr 2) | 12 (pr 2) | 11 to 12 (pr 2) | 10 (pr 2) | 11 (pr 2) | 10 (pr 2) | 12.8 to 41.6 |
| High, WebGL2 | 25 (pr 2) | 63 to 73 (pr 2) | 19 to 21 (pr 2) | 50 to 57 (pr 2) | 18 (pr 2) | 51 to 67 (pr 2) | 25.4 to 46.7 |

On battery (first run) High and Ultra gave the same figures. Low and Medium read exactly 30 fps on battery; that was Chrome's battery saver, not the renderer.

1. **Only Low holds its own settings on an M3 Pro.** Medium runs at 28 to 44 fps at full settings and High at 17 to 22. Within 8 s the step-downs turn off bloom, ambient occlusion and anti-aliasing, halve the instance counts and drop the pixel ratio (Medium 1.5 to 1, High 2 to 1). On High at ground level they bottom out at 43 fps, still under the 50 fps target. A player who picks High on this machine is looking at half resolution with no anti-aliasing. The eight required screenshots were taken within 1.5 s of re-applying High, so they show the intended look, not what a player sees after 8 s.
2. **Ultra is 10 to 13 fps** and never recovers: the step-downs stop at pixel ratio 2 (Ultra asks for 3; the renderer reports 2).
3. **Clouds are the main cost.** Hiding `scene.clouds.mesh` from orbit takes Medium from 43.5 to 74.2 fps, High from 21.8 to 45.8, Ultra from 12.8 to 41.6. On Low they cost nothing measurable.
4. WebGL2 is slightly faster than WebGPU at orbit and settles without dropping the pixel ratio.
5. Panning at ground level on High: 22 fps WebGPU, 21 fps WebGL2.

## Critical problems

### C1. WebGPU draws no close-up plant models

- On WebGPU every tree and shrub is the far imposter at every distance. The twelve near-model meshes in `scene.vegetation.meshes` carry 10 vertex attributes (`position, normal, color, card, wind, iDir, iQuat, iData, iTint, iTint2`), one buffer each; WebGPU allows 8. These are the "(10)" pipeline errors. The meshes do receive instances (81, 62 and 13 at `dist 0.008`) but nothing is drawn.
- **Under `&webgl` they appear:** conifers with separate fronds and a tapered trunk, flower-like shrubs, thick columns with slab caps in the jungle.
- Evidence: WebGPU `6-forest-ground.png`, `plants-woodland-near.jpg`, `plants-jungle-near.jpg`; WebGL2 `webgl-creature-sp1-b-above.jpg` (lit ground), `webgl-plants-woodland-near.jpg`, `webgl-plants-jungle-near.jpg` (black ground, see C3). Camera `setImmediate(0.94, 0.74, 0.02)` and `(.., 0.004)`, jungle `(-1.46, -0.1, 0.004)`; sun +0.5; High.
- Source: `src/render/vegetation.ts`, `src/render/gfx/plantmesh.ts`. The imposter mesh has 7 attributes and the grass mesh 8, so both draw.

### C2. Creatures: absent on WebGPU, broken on WebGL2

Creature meshes carry **14 vertex attributes** (`position, normal, color, rig, rig2, skin, emissive, iPos, iQuat, iData, iTint, iSkinA, iSkinB, iSkinC`).

- **WebGPU:** nothing is drawn. 256 sample individuals (`debugSpawn`) and 160 evolved ones were present with instance counts on all seven meshes; the camera parked on them shows empty ground or water (`model-debug-sp0-near-a.jpg`, `creatures-debug-ground.jpg`, `model-evolved-sp309-near-a.jpg`, `model-evolved-sp255-near-a.jpg`).
- **WebGL2:** they draw, wrongly. The camera was held on each sample animal with the animal confirmed at screen centre (projected position 0, 0) at 3x its `size`, sun +0.3.
  1. **Huge dark translucent panels cross the sky** whenever creature meshes are visible, and vanish when they are hidden. Compare `webgl-creature-sp0-a-side.jpg` with `webgl-creature-sp0-a-side-HIDDEN.jpg` (same camera, creature meshes `visible = false`); also `webgl-creature-sp1-c-mid.jpg`, `webgl-creature-sp2-a-side.jpg`. They are straight-edged parallelograms many times the size of the landscape: creature triangles stretched across the scene.
  2. **Sample species 1** (the long-necked four-legged archetype) is a **plain brown faceted arch**: a curved band with a dark hole under it, no head, neck, tail or separate legs, flat-shaded in one colour, half sunk into the snow (`webgl-creature-sp1-a-side.jpg`, `webgl-creature-sp1-b-above.jpg`). It is about a third of a tree's height. At 4x the distance it is a small pale arch (`webgl-creature-sp1-c-mid.jpg`).
  3. **Sample species 0** (the furry herd archetype) shows only as a faint pale smudge on the snow at the animal's position; no body can be made out (`webgl-creature-sp0-a-side.jpg`, `webgl-creature-sp0-b-above.jpg`).
  4. Sample species 2, 3, 5 and 6 were captured after the ground had gone black (C3); nothing of the animal can be seen in `webgl-creature-sp2-a-side.jpg`, `-sp5-a-side.jpg`, `-sp6-a-side.jpg`, `-sp3-c-mid.jpg`. Species 4 (aquatic) not reviewed.
  5. Legs, fur, gait and the near/far hand-over for creatures **could not be judged**: no animal rendered as an animal.
- Mesh facts logged on WebGL2: 1048 to 4392 triangles each, geometry bounding radius 0.86 to 1.89 (model units), `side: DoubleSide`, `transparent: false`, `frustumCulled: false`.
- Source: `src/render/creatures.ts`, `src/render/gfx/creaturemesh.ts`, `src/render/gfx/creatureskin.ts`.
- To repeat: `debugSpawn` is overwritten within a second by the worker's next herd message. These captures stubbed `creatures.setHerds` and `setSpecies` in the page straight after calling it. The follow loop is in the review tooling, not the repo: read `creatures.byKey(key).pos`, convert to lon/lat, `cam.setImmediate(lon, lat, 3 * size)`.

### C3. Land and sea turn black

- **What:** terrain and ocean render black. Atmosphere haze, clouds, plants, grass and mounds keep their colour, so from orbit the planet is a featureless lilac ball, at mid altitude plants float over flat purple, and on the ground bright plants stand on black. Hiding `scene.atmosphere` shows the black directly (`probe-no-atmosphere.jpg`). Scene luminance (`scene.post.measured`) drops from about 0.2 to 0.5 down to about 0.02 to 0.05.
- **When:**
  - Immediately and every time after loading a saved planet: `actions.saveSlot(...)`, then reload with `?seed=amber-reef-101&skip&slot=0`. Three loads out of three, both backends.
  - **Also in freshly warped worlds, after several minutes with the sim paused**, on both backends. In the last WebGL2 session it happened between two captures two seconds apart (`webgl-creature-sp1-b-above.jpg` lit, `webgl-creature-sp1-c-mid.jpg` black) about eight minutes after the warp. Once it happens it stays.
- **Ruled out by test** (luminance did not change): moving the moon through a full circle against a fixed sun; hiding the cloud mesh; running the sim again at 1x; re-applying the preset and watching through the step-downs; sun angle (+1.0, +0.5, 0, -0.5); the place (lit and black captures came from the same cell); cloud cover there (0.16 to 0.2); diving under water; `actions.flyToCell`.
- Cause not found. The first version of this review called it a save-load bug only; that was too narrow.
- Evidence: `diag-webgpu-slot-coast.jpg`, `probe-no-atmosphere.jpg`, `diag-ground-sun0.jpg`; compare `5-coast.png` and `fresh-webgpu-high-warped-coast.jpg`. Camera `(2.58, 0.62, 0.3)`, sun +0.5.
- Source to read: `GenesisScene.applyCells` in `src/render/scene.ts`, `src/render/gfx/planetdata.ts`, `src/render/gfx/terrain.ts`, and the `load` path in `src/main.ts`.
- **Plants ignore it.** They are lit by `surfaceLight` in `src/render/lighting.ts`, which takes only the sun direction.

**State recorded while the surface was black** (added after the review, in answer to a question from the fixing session; nothing new was captured for this):

- **No notice text was recorded.** The UI layer was hidden for almost every capture and `state.notice` was never logged, so I cannot say whether "The simulation stumbled. Restored from the last autosave." appeared. Not checked, rather than checked and absent.
- **The cell snapshot was older than the sim clock.** In a slot-loaded WebGPU world, paused: `state.stats.simYear` 150375825 but `scene.vegetationCells().simYear` 150369825 (6,000 years behind). After running at 1x for 6 s both read 150375825.017, and the surface was still black.
- `scene` fields in that state (WebGPU, High, slot load, coast camera): `time` 30.76, `dayAngle` 3.08, `moonAngle` 2.355, `declination` 0, `tilt` 0.4195, `daySpeed` 0, `eraWarmth` 0.0444, `eraHaze` 0, `eraHazeTarget` 0, `flashLevel` 0, `solar` 1, `moons` 2, `moonDistance` 5.5, `underwater` false, `overlayOn` false, `erosionPerFrame` 6, `shadowSteps` 8, `dataSize` 256, `erosionSize` 512, `erosionIterations` 320, `builtWith` "high", `lastCell` 1537, `seaCell` 1603, `weatherCell` 11519.
- `scene.post`: `autoExposure` true, `target` 3.6, `measured` 0.051, `lumBusy` true, `first` false, `dofEnabled` false, `allowDof` false; options `{ taa: false, ao: false, bloom: false, fringe: true }` (step-downs had run).
- `scene.look`: star "yellow", `starSize` 1, sky "lavender (thin nitrogen-argon air)", `airDensity` 0.602, ocean "milk turquoise", pigment "indigo to magenta", moon "rust".
- `stats`: `oxygen` 0.1746, `meanTemp` 14.81, `iceFraction` 0.182, `seaLevel` 0.0303, `oceanFraction` 0.684, `stage` "animals", `era` "warm", `plantToxin` 0.143.
- Visibility flags: `sky`, `atmosphere`, `ocean.sphere`, `terrain.sphere` all visible; `planet.mesh.visible` false (it was also false in a healthy fresh world, so that is normal).
- In the WebGL2 session where it happened mid-capture: `scene.time` was about 440 s, High, `pr` 2, with all of taa/ao/bloom on, `shadowSteps` 8, `clouds.steps` 22, `cloudLightSteps` 4, luminance 0.018 before and after re-applying the preset.
- Shader uniform values (`uSunDir`, `uSeaKm`, `uOverlay`, `uOceanFill`, `uAtmo` and so on) were **not** read. `gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE)` on WebGL2 was not read either; it needs a browser session.

### C4. WebGL2: white glare at the planet's limb

- A blown-out white body with a wide halo sits at the right limb in the orbit day view. In one world it covered about a third of the frame and hid half the planet (`diag-webgl-fresh-orbit.jpg`, young world); in the clean warped world it is smaller but still the brightest thing on screen (`webgl-1-space-day.jpg`). WebGPU from the same camera shows a small hard-edged white half-disc there with no halo (`1-space-day.png`). Camera `(-1.46, 0.1, 2.6)`, sun +0.5, High.

### C5. WebGPU: jungle tree imposters are upside-down slabs

- At the densest vegetation on the planet, `setImmediate(-1.46, -0.1, 0.004)` and `(.., 0.02)`, the tree imposters are tall purple rectangles with pointed bottom ends, hanging above the horizon like an inverted skyline, some as faint see-through rectangles (`plants-jungle-near.jpg`, `plants-jungle-ground.jpg`). On WebGL2 the near models at the same place are thick faceted columns with slab caps (`webgl-plants-jungle-near.jpg`), so this is that plant form's imposter drawn wrong, not a different plant.
- At `dist 0.07` the same spot is inside cloud: the whole frame is flat grey with faint blocky tree outlines (`plants-jungle-mid.jpg`).

## The eight views (WebGPU, High)

Sun offsets: day +0.5, night +2.8, terminator +1.55.

### 1. Orbit, day side: `1-space-day.png`, `setImmediate(-1.46, 0.1, 2.6)`

1. **Washed out.** The disc is milky lavender; sea and cloud are close in brightness and there is no deep blue.
2. **Aurora draws on the day side as pink comb-like fringes** past the limb at both poles.
3. A hard pure-white half-disc pokes out of the right limb with no shading. The moon on the left is brown and shaded correctly.
4. The atmosphere rim is a thick, even lilac band with a sharp inner edge, like a glass shell.
5. A faint straight green line with a right-angle corner crosses the upper ocean. Not identified.
6. The cloud belt is one solid band with little internal shading; smaller clouds are crisp hard-edged blobs.
7. No sparkle or tiling on the sea from orbit.

### 2. Orbit, night side: `2-space-night.png`, sun +2.8

1. Readable, not washed out. That works.
2. **The aurora is a solid pink wall** at both poles, standing well above the atmosphere, with vertical streaks and flat cut-off ends.
3. The sun is a flat white disc whose grey haze lifts the whole left third of the sky.
4. Night-side sea is flat dark blue-grey with blotchy noise; land is nearly invisible.

### 3. Terminator: `3-terminator.png`, sun +1.55

1. **Two pure-white featureless discs** at upper left and upper right, one overlapping the limb. `stats.moons` is 2.
2. The day-to-night transition across the cloud belt is smooth, with a believable warm tint.
3. The night half of the cloud belt is a flat slate colour.
4. Aurora fringes at both poles.

### 4. Night map: `4-night-map.png`, sun +2.8, overlay "nations"

1. No nations exist, so the overlay shows nothing.
2. The milestone title backlog covers the planet.
3. A small white glowing dot with a dark centre sits on the cloud belt, the brightest thing on the night side.

### 5. Mid-altitude coast: `5-coast.png`, `setImmediate(2.58, 0.62, 0.3)`

1. **Nest mounds are huge and everywhere.** Tan faceted cones (`layoutMounds`, a 7-sided `ConeGeometry` in `src/render/creatures.ts`) many times the size of the trees, flat-shaded and tilted, one over the sea. The WebGL2 capture of the same place has more than twenty in frame (`webgl-5-coast.jpg`).
2. **Half the frame is out of focus** with round bokeh discs, although nothing is being followed.
3. Vegetation is a flat purple carpet; the land ends up two flat colours.
4. The coastline is hard straight segments. The turquoise shallows look good.
5. The river is a thin teal line of even width.
6. No mountain shadows.

### 6. Ground level in the forest: `6-forest-ground.png`, `setImmediate(0.94, 0.74, 0.02)`, tilt -0.5

1. **Trees are low-resolution imposters with stair-stepped edges** (C1).
2. **Every trunk sticks out of the top of its crown.**
3. **Everything is one colour**: ground, grass and trees are the same lilac, hazy, with no shadows under the trees.
4. Shrubs are a round skirt with a few stalks.
5. Terrain silhouette is smooth; no cracks between patches.

### 7. Ground level at night: `7-ground-night.png`, sun +2.8

1. **The aurora is a solid pink wall filling the sky** at latitude 0.74 rad (42 degrees).
2. The ground stays readable. Exposure is sensible.
3. A bright white smear on the horizon at the left.

### 8. Under water: `8-underwater.png`, `scene.underwater = true`, `setImmediate(2.85, -0.43, 0.0012)`, tilt -0.25

1. **Flat and empty.** A uniform teal seabed with one small repeating ripple texture. No caustics, light shafts, depth fog, plants or animals, in a cell with `reef` = 1.
2. **Looking up shows the same thing**: no water surface from below (`8b-underwater-up.jpg`, tilt +0.4).
3. Deeper water is a plain dark-blue gradient (`model-evolved-sp32-near-a.jpg`).
4. Camera was 0.001 planet radii below the surface.

## Specific checks

**Volumetric clouds.** The main frame cost. From the ground they are soft blobs with a blocky grain. **Cyclones seen from below are stacked glowing hoops** in the sky (`ocean-surface-close.jpg`, `model-evolved-sp309-near-a.jpg`, `motion-pan-ground.jpg`). Rain shows as long thin white streaks (`plants-jungle-near.jpg`).

**Ocean.** Close up the waves have a believable shape and scale and the shallows are see-through turquoise (`ocean-surface-close.jpg`, `(2.85, -0.43, 0.004)`, tilt -0.5). Foam is a pale lilac smear. A patch of hard white specks sits bottom-left. No tiling from orbit.

**Terrain.** Smooth silhouette, no cracks, detail holds at ground level (snow and rock in `webgl-creature-sp0-a-side.jpg`). Rivers are a thin line. Mountain shadows not seen.

**Night side and exposure.** Readable from orbit and on the ground; exposure adapts sensibly.

**Aurora.** Fails: a solid wall, visible in daylight from orbit and at mid latitudes at night. `src/render/gfx/aurora.ts`.

**Plant hand-over and grass ring.** WebGPU has no hand-over (C1): `handover-0.025.jpg` and `handover-0.012.jpg` show the same imposters at both distances, with the grass ring ending in a visible edge and shrubs on snow reading as floating pompoms. On WebGL2, near models and imposters stand side by side with an obvious jump in sharpness (`webgl-6-forest-ground.jpg`). Whether they pop during movement was not assessed.

**Temporal anti-aliasing.** No strong ghosting or smearing in frames captured mid-pan at ground level or mid-spin at orbit (`motion-pan-ground.jpg`, `motion-spin-orbit.jpg`). Red/blue colour fringes on high-contrast edges are the lens fringe effect, which stays on after the step-downs turn anti-aliasing off.

## 3D models

| Model | Backend | Seen? | Problems | Screenshot |
|---|---|---|---|---|
| Conifer, near model | WebGL2 | Yes | Fronds are flat paper cut-outs with a zig-zag edge, one colour, no shadow on the ground; plain tapered trunk spiking out of the top | `webgl-creature-sp1-b-above.jpg`, `webgl-6-forest-ground.jpg` |
| Conifer, near model | WebGPU | **No** (C1) | Not drawn | `6-forest-ground.png` |
| Conifer imposter | both | Yes | Stair-stepped, low resolution; trunk above the crown | `6-forest-ground.png` |
| Jungle column tree, near model | WebGL2 | Yes | Thick faceted columns with slab caps, untextured, flat-shaded, very large against the grass | `webgl-plants-jungle-near.jpg` |
| Jungle tree imposter | WebGPU | Yes | Upside-down slabs floating above the ground (C5) | `plants-jungle-near.jpg` |
| Shrub, near model | WebGL2 | Yes | Flat flower-shaped cards on thin stalks | `webgl-plants-woodland-near.jpg` |
| Shrub imposter | both | Yes | Blurry round skirt with stalks | `6-forest-ground.png` |
| Grass ring | both | Yes | Wide flat ribbons; hard outer edge | `plants-woodland-near.jpg` |
| Nest / hive mound | both | Yes | Far too large; flat-shaded cone; tilted; blurred cream disc when out of focus | `5-coast.png`, `webgl-5-coast.jpg` |
| Sample creature 1 | WebGL2 | Yes | A brown faceted arch, no head or limbs, half buried | `webgl-creature-sp1-b-above.jpg` |
| Sample creature 0 | WebGL2 | Barely | Faint pale smudge | `webgl-creature-sp0-a-side.jpg` |
| Creature meshes in general | WebGL2 | Yes | Giant translucent panels across the sky (C2) | `webgl-creature-sp0-a-side.jpg` |
| All creatures | WebGPU | **No** (C2) | Not drawn | `creatures-debug-ground.jpg` |
| Aquatic plants, reef | WebGPU | No | Nothing on the seabed | `8-underwater.png` |
| Moons | both | Yes | One shaded correctly; others are flat white discs (WebGPU) or a glare (WebGL2) | `3-terminator.png`, `webgl-1-space-day.jpg` |
| Settlements, structures | - | None exist | - | - |

## WebGPU against WebGL2

| | WebGPU | WebGL2 |
|---|---|---|
| Near plant models | Not drawn | Drawn |
| Creatures | Not drawn | Drawn wrongly (arch, smudge, sky panels) |
| Console | Pipeline errors on every load | Clean |
| Orbit, day | Small white half-disc at the limb | White glare with a wide halo |
| Full High frame rate | 17 to 22 fps | 18 to 25 fps |
| Step-downs end at | Pixel ratio 1 | Pixel ratio 2 |
| Black surface (C3) | Yes | Yes |

The clean WebGL2 set of the eight views is `webgl-1-space-day.jpg` to `webgl-8-underwater.jpg`. Only 1 and 5 were reviewed.

## Files captured but not reviewed

- `mains-*` (orbit, coast, ground for each preset and backend on mains power), `preset-*` (the battery run)
- `webgl-2`, `-3`, `-4`, `-7`, `-8`; `webgl-motion-*`, `webgl-handover-*`
- `webgl-creature-sp*` other than those named above (per species: `a-side`, `a-side-HIDDEN`, `b-above`, `c-mid`, `d-far`)
- `model-evolved-sp*`, `model-debug-sp*`, `webgl-model-*` (first run; the `webgl-model-*` set has black ground)
- `plants-woodland-ground/mid/far`, `plants-jungle-far`, and `webgl-plants-*` other than those named
- `diag-*`, `probe-*`, `unpause-*`, `dive-*`, `fresh-*` (small diagnostic frames)

## Not done

- The cause of C3.
- Creatures on a build where they render: legs, fur, gait, hand-over.
- Popping during movement.
- Anything built (no civilization arose).
- Firefox or Safari.
