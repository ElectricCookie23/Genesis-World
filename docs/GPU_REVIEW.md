# Genesis on a real GPU: review

Observations only. Nothing under `src/` was changed. Screenshots are in `docs/screenshots/gpu/`.

**Read this first: limits of this review**

- The laptop was **on battery the whole time** and reached 12% near the end. Chrome's battery saver caps pages at 30 fps on low battery, and the Low and Medium numbers below show exactly that cap (readings of 30.0). Treat the Low and Medium rows as *not trustworthy*; High and Ultra were below the cap and the High rows were taken earlier, but all numbers are battery numbers and should be re-taken on mains power.
- The run was cut short by the battery. About 180 screenshots were captured; **only the ones named in the findings below were looked at by the reviewer.** The rest are raw captures listed at the end so the next session can look at them. Where a finding rests on a file I did not open, it says so.
- Nations, settlements and anything built: **none exist** in this world at 150 My (stage "animals", `settlements: 0`, `nations: 0`), in any of the five worlds grown during the review. Nothing built could be reviewed.
- The eight required views are WebGPU, High preset. `8-underwater.png` comes from a second world of the same seed (the first attempt did not get below the surface).

## Machine

| | |
|---|---|
| Machine | MacBook Pro, Apple M3 Pro (18-core GPU), macOS 27.0.1 (26A434), built-in Liquid Retina XDR 3024 x 1964 |
| Browser | Google Chrome 158.0.8127.37, headed window, scratch profile |
| `chrome://gpu` | WebGL: Hardware accelerated. WebGPU: Hardware accelerated. `GL_RENDERER`: `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Version 27.0.1 (Build 26A434))`, display type `ANGLE_METAL` |
| WebGL unmasked renderer | `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)` |
| WebGPU adapter | vendor `apple`, architecture `metal-3`, `isFallbackAdapter: false` |
| Window | 1600 x 913 CSS px inner, devicePixelRatio 2, canvas 3200 x 1826 |
| Backends | Default URL reports `webgpu` in the HUD. `&webgl` reports `webgl2`. |
| Power | Battery, discharging (see above) |

URL: `https://electriccookie23.github.io/Genesis-World/?seed=amber-reef-101&skip&fresh` (plus `&webgl`).

## Loading

- Page `load` event 1.9 s cold, 0.1 s warm. Planet on screen and `state.stats` present 4.7 s cold, 0.9 to 3.9 s warm (Ultra slowest).
- The planet does appear on both backends.
- `warp` of 150 My took 106 to 120 s on Low/Medium/High and 186 s on Ultra. The UI is blocked meanwhile.
- After the warp a **backlog of milestone titles** ("First eye", "The Kreagerun extinction", "First steps on land", each with its old year) keeps playing over the centre of the screen for minutes, covering the planet. The HUD panels auto-hide but the titles do not. Seen in every capture taken with the UI visible (`4-night-map.png`).

## Console errors and warnings (verbatim, with counts)

Counts are per page load. WebGL2 logs only the first two lines.

| Count | Backend | Message |
|---|---|---|
| 2 | both | `[warning] THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.` |
| 1 | both | `[error] Failed to load resource: the server responded with a status of 404 ()` (the URL was not captured) |
| 1 each | WebGPU | `[error] THREE.WebGPURenderer: Render pipeline creation failed (renderPipeline_MeshBasicNodeMaterial_60): Vertex buffer count (10) exceeds the maximum number of vertex buffers (8).` `- While validating vertex state.` `- While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""renderPipeline_MeshBasicNodeMaterial_60""]).` Same text for `_65` (10; 11 on Ultra), `_79` (10), and on Ultra `_57` (10), `_67` (10). |
| 1 each (2 each on Ultra) | WebGPU | Same error with `Vertex buffer count (9)` for `renderPipeline_MeshBasicNodeMaterial_84`, `_85`, `_86`. |
| 1 | WebGPU, Ultra | Same error with `Vertex buffer count (14)` for `renderPipeline_MeshBasicNodeMaterial_90`. |
| 1 + 1 | WebGPU, Low | `[error] THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: Binding size for [Buffer "bindingBufferundefined_UniformBuffer_32_(vertex)"] is zero.` `- While validating entries[5] against { binding: 5, visibility: ShaderStage::Vertex, buffer: {type: BufferBindingType::Uniform, minBindingSize: 0, hasDynamicOffset: 0} }.` `- While validating [BindGroupDescriptor ""bindGroup_object""] against [BindGroupLayout (unlabeled)]` `- While calling [Device].CreateBindGroup(...)` and the same text again as a `[warning]`. |
| 11 to 23 per few minutes | WebGPU | `Max polyphony exceeded. Note dropped.` (audio) |

The first load of the session logged only `_60` and `_65`; later loads logged the longer list. No shader compile warnings were seen on either backend.

## Frame rate

How these were measured: the camera is parked, then the preset is re-applied (which resets the automatic step-downs) and frames are counted with `requestAnimationFrame` for 1 s. That is the **full preset** column. The **settled** column is the HUD figure after 12 to 16 s parked, once the automatic step-downs (`main.ts`, "adaptive quality", target 50 fps) have finished, with the pixel ratio they ended on.

Camera: orbit `cam.setImmediate(-1.46, 0.1, 2.6)`, coast `(2.58, 0.62, 0.3)`, forest ground `(0.94, 0.74, 0.02)` with `tiltOffset = tTilt = -0.5`; sun `dayAngle = lon + 0.5`.

| Preset, backend | Orbit full | Orbit settled | Coast (mid) full | Coast settled | Forest ground full | Ground settled |
|---|---|---|---|---|---|---|
| High, WebGPU | 22 fps (pr 2) | 48 to 52 (pr 1) | 19 to 21 (pr 2) | 51 to 54 (pr 1) | 20 to 22 (pr 2) | 52 to 54 (pr 1) |
| High, WebGL2 | 25 to 30 (pr 2) | 58 to 60 (pr 2) | 18 (pr 2) | 50 (pr 2) | 22 to 24 (pr 2) | 53 (pr 2) |
| Ultra, WebGPU | 14 (pr 2) | 13 (pr 2) | 13.5 (pr 2) | 12 (pr 2) | 13 (pr 2) | 12 (pr 2) |
| Medium, WebGPU *(battery cap, unreliable)* | 34 to 45 (pr 1.5) | 46 to 107 (pr 0.75) | 30 (pr 1.5) | 30 (pr 0.75) | 30 (pr 1.5) | 30 (pr 0.75) |
| Low, WebGPU *(battery cap, unreliable)* | 31 (pr 1) | 30 (pr 0.75) | 30 (pr 1) | 30 (pr 0.75) | 97 (pr 1) | 105 to 121 (pr 0.75) |

What the numbers say:

1. **High does not hold its own settings on an M3 Pro.** At full High the frame rate is about 20 fps everywhere. Within 8 s the step-downs turn off bloom, ambient occlusion and anti-aliasing, halve the instance counts and drop the pixel ratio from 2 to 1 (WebGPU). Every player on this class of machine is really looking at the stepped-down picture, at half resolution, with no anti-aliasing. All eight required screenshots were taken in the 1.5 s after re-applying High, so they show the intended look, not what a player sees after 8 s.
2. **Ultra is 12 to 14 fps** and never recovers: the step-downs stop at pixel ratio 2 (Ultra asks for 3, the renderer reports 2).
3. **Clouds are over half the frame.** From orbit at full High, hiding `scene.clouds.mesh` takes WebGPU from 21.9 to 49.6 fps and WebGL2 from 29.7 to 47.3. On Ultra, 13.8 to 30.3.
4. WebGL2 was a little faster than WebGPU at orbit and settled without dropping the pixel ratio.
5. Even on Low the page settled at pixel ratio 0.75, but that row is contaminated by the battery cap.

## Critical problems (things not drawn at all)

### C1. WebGPU draws no close-up plant models

- **What:** on WebGPU every tree and shrub is the far imposter at every distance. The twelve near-model meshes in `scene.vegetation.meshes` have 10 vertex attributes each (`position, normal, color, card, wind, iDir, iQuat, iData, iTint, iTint2`), one buffer per attribute, and WebGPU allows 8. These are the pipelines that fail with "Vertex buffer count (10)". The meshes do get instances (for example 81, 62 and 13 instances at `dist 0.008`) but nothing is drawn.
- **Under `&webgl` they do appear:** real 3D conifers with separate fronds and a tapered trunk, and flower-like shrubs.
- **Evidence:** WebGPU `6-forest-ground.png`, `plants-woodland-near.jpg` against WebGL2 `webgl-6-forest-ground.jpg`, `webgl-plants-woodland-near.jpg`. Same camera: `setImmediate(0.94, 0.74, 0.02)` and `(0.94, 0.74, 0.004)`, tilt -0.5 / -0.7, sun +0.5, High.
- **Source:** `src/render/vegetation.ts` (near-model instancing), `src/render/gfx/plantmesh.ts`.
- The imposter mesh has 7 attributes and the grass mesh has 8, so both draw.

### C2. Creatures are not visible on either backend

- **What:** no animal was seen in any close-up. `scene.creatures.individuals` held 160 evolved individuals near the reef and 256 after `debugSpawn`, and the seven creature meshes had instance counts (35, 28, 41, 49, 33, 47, 23), but the camera, parked on an individual's `pos` at 4x its `size`, shows empty ground or empty water.
- Creature meshes have **14 vertex attributes** (`position, normal, color, rig, rig2, skin, emissive, iPos, iQuat, iData, iTint, iSkinA, iSkinB, iSkinC`). On WebGPU this is over the limit of 8 (the "(14)" and probably the "(9)" errors), so they cannot draw there.
- **On WebGL2 they were still not recognisable.** The only thing at the followed position is a soft-edged cream disc with no features, partly hidden by the hillside (`webgl-model-debug-sp0-near-a.jpg`, `webgl-model-debug-sp5-near-b.jpg`). I could not tell whether that disc is the creature drawn badly and blurred, or one of the nest mounds out of focus. The WebGL2 creature captures were also taken in a world whose ground was black (see C3), which made this harder to judge. **Legs, fur, proportions, animation and shading could not be assessed at all.** This needs a clean WebGL2 pass on mains power.
- **Evidence:** WebGPU `model-debug-sp0-near-a.jpg`, `creatures-debug-ground.jpg`, `model-evolved-sp309-near-a.jpg`, `model-evolved-sp255-near-a.jpg`; WebGL2 files with the `webgl-` prefix. Sample species 0 to 6 are the seven archetypes of `debugSpawn`. Evolved species captured: 255 *Eriorax magnus* (1.39 m, sea), 243 *Bryantherium grandis* (7.35 m, sea), 32 *Queriichthys velox* (0.07 m, sea), 309 *Xanella fossor* (0.95 m, land), 302 *Xanella altus*, 260 *Xanella sapiens*, 172 *Xanella terrestris*.
- **Source:** `src/render/creatures.ts`, `src/render/gfx/creaturemesh.ts`, `src/render/gfx/creatureskin.ts`.
- Note for whoever repeats this: `debugSpawn` is overwritten within a second by the worker's next herd message. The captures here stubbed `creatures.setHerds` and `setSpecies` in the page after calling it.

### C3. Loading a saved planet leaves the land and sea black

- **What:** after `actions.saveSlot('gpu-review')` and a reload with `?seed=amber-reef-101&skip&slot=0`, terrain and ocean render pure black on both backends. Only the atmosphere haze, clouds, plants and mounds have colour, so from orbit the planet is a featureless lilac ball and at mid altitude the plants float over flat purple. Hiding `scene.atmosphere` shows the black directly. Three loads out of three (WebGL2 High, WebGPU High twice). Running the sim again at 1x for 6 s did not bring the surface back.
- A fresh world warped again draws normally (`fresh-webgpu-high-warped-coast.jpg`).
- **Evidence:** `diag-webgpu-slot-coast.jpg`, `probe-no-atmosphere.jpg`, `webgl-5-coast.jpg`, `webgl-1-space-day.jpg`; compare `5-coast.png`. Camera `(2.58, 0.62, 0.3)`, sun +0.5.
- **Source to read:** the `load` path in `src/main.ts` (`pendingLoad`, `actions.loadSlot`) and `GenesisScene.applyCells` / `PlanetData.update` in `src/render/scene.ts`, `src/render/gfx/planetdata.ts`.
- **Seen once without a reload:** in the first WebGPU session the ground also went black part-way through (between the plant close-ups and `model-evolved-sp309-near-a.jpg`). I could not reproduce that: diving under water and `actions.flyToCell` did not trigger it in a later session. Cause unknown.
- **Consequence for this review:** every `webgl-*` screenshot was taken in a slot-loaded world, so their black ground and missing sea are C3, not a WebGL2 difference.

### C4. WebGL2: a white glare covers a third of the screen from orbit

- `webgl-1-space-day.jpg`, and `diag-webgl-fresh-orbit.jpg` (a fresh world, so this is not C3). A blown-out white bloom centred off the planet's right limb spreads across roughly a third of the frame and hides half the planet. WebGPU from the same camera shows a small hard-edged white disc in that position instead (`1-space-day.png`). Camera `(-1.46, 0.1, 2.6)`, sun +0.5, High.

## The eight views (WebGPU, High)

Sun offsets: day +0.5, night +2.8, terminator +1.55.

### 1. Orbit, day side: `1-space-day.png`, `setImmediate(-1.46, 0.1, 2.6)`

1. **Washed out.** The whole disc is milky lavender; sea and cloud are close in brightness and there is no deep blue anywhere. Land is two tiny rust specks.
2. **Aurora draws on the day side as pink comb-like fringes** sticking out past the limb at both poles. They look like a solid ragged crown, not curtains.
3. **A hard white half-disc pokes out of the right limb**, pure white, no shading (a moon or the second star body, clipped by the planet). Compare the brown, properly shaded moon on the left.
4. The atmosphere rim is a thick, even lilac band with a sharp inner edge, like a glass shell.
5. A faint straight green line with a right-angle corner crosses the upper ocean (centre, above the cloud belt). Not identified.
6. The cloud belt is one solid equatorial band with little internal shading from here; the smaller clouds are crisp blobs with hard edges.
7. No sparkle or visible tiling on the sea from orbit.

### 2. Orbit, night side: `2-space-night.png`, same camera, sun +2.8

1. Readable, not washed out: clouds are a clear slate grey and the limb is lit. That part works.
2. **The aurora is a solid pink wall** at both poles, standing well above the atmosphere, with vertical streaks and flat cut-off ends. Not thin curtains.
3. The sun is a flat white disc with a large grey haze that lifts the whole left third of the sky to grey.
4. The night-side sea is flat dark blue-grey with visible blotchy noise; land is nearly invisible.
5. No city lights (there is no civilization).

### 3. Terminator: `3-terminator.png`, same camera, sun +1.55

1. **Two pure-white featureless discs** sit at the upper left and upper right, one overlapping the limb. They read as holes in the picture. `stats.moons` is 2.
2. The day-to-night transition across the cloud belt is smooth and the warm tint on the lit clouds looks right.
3. The night half of the cloud belt goes to a flat slate colour with no depth.
4. Aurora fringes as in view 1, at both poles.

### 4. Night map: `4-night-map.png`, sun +2.8, overlay "nations"

1. **No nations exist**, so the overlay shows nothing; the picture is the same as view 2.
2. The milestone title backlog covers the planet (see Loading).
3. A small white glowing dot with a dark centre appears on the cloud belt (a cyclone eye or lightning flash); it is the brightest thing on the night side.

### 5. Mid-altitude coast: `5-coast.png`, `setImmediate(2.58, 0.62, 0.3)`

1. **Nest mounds are huge.** Tan faceted cones (`layoutMounds`, a 7-sided `ConeGeometry` in `src/render/creatures.ts`) sit on the land many times the size of the trees around them, flat-shaded and tilted. There is one floating over the sea.
2. **Half the frame is out of focus.** The left side (sea) is heavily blurred with round bokeh discs, although nothing is being followed.
3. Vegetation is a flat purple carpet; individual imposters only read at the edges. The pigment is "indigo to magenta" by design, but the land ends up two flat colours, purple and sand.
4. The coastline is a hard polygonal edge with straight segments; the shallows are a clean turquoise band (this looks good) but its outer edge is a soft straight line.
5. The river shows as a thin teal line of even width. It reads as a drawn line, not water.
6. Snow at the top is plain white with imposters dotted on it.
7. No mountain shadows visible here.

### 6. Ground level in the forest: `6-forest-ground.png`, `setImmediate(0.94, 0.74, 0.02)`, tilt -0.5

1. **Trees are low-resolution imposters with stair-stepped, blocky edges** (C1). At this distance they look like pixel art.
2. **Every trunk sticks out of the top of its crown** as a tan stick.
3. **Everything is one colour.** Ground, grass and trees are the same lilac; the scene is low-contrast and hazy, with no shadows under the trees.
4. Small shrubs look like a round skirt with a few stalks.
5. The terrain silhouette is smooth; no cracks between patches seen. Ground texture is a fine speckle that holds up reasonably.
6. Sky clouds are soft blurred blobs with visible blockiness.

### 7. Ground level at night: `7-ground-night.png`, same camera, sun +2.8

1. **The aurora is a solid pink wall filling the sky** at latitude 0.74 rad (42 degrees), brighter than anything else in the frame.
2. The ground stays readable (dark purple, texture visible). Exposure is sensible.
3. Tree imposters have the same blocky edges, now dark on bright.
4. A bright white smear sits on the horizon at the left.

### 8. Under water: `8-underwater.png`, `scene.underwater = true`, `setImmediate(2.85, -0.43, 0.0012)`, tilt -0.25

1. **Flat and empty.** A uniform teal seabed with one small repeating ripple texture fills the frame. No caustics, no light shafts, no fog gradient, no plants, no animals, although this cell has `reef` = 1.
2. Camera was 0.001 planet radii below the surface (`camR 0.99917`, sea `1.00017`).
3. The first attempt at `(2.84, -0.4, 0.004)` stayed above water on a sandbar; from there the water's edge against the sand is a hard straight polygon edge with a saw-tooth notch.
4. `8b-underwater-up.jpg` (looking up, tilt +0.4) was captured but not reviewed.

## Specific checks

**Volumetric clouds.** Heavy: more than half the frame (see frame rate). From the ground they are soft blobs with a visible blocky grain. From below, **cyclones show as stacked, glowing concentric arcs or hoops in the sky** (`model-evolved-sp309-near-a.jpg`, `ocean-surface-close.jpg`, `webgl-model-debug-sp4-near-a.jpg`); at night they glow white. No banding seen from orbit.

**Ocean.** Close up (`ocean-surface-close.jpg`, `(2.85, -0.43, 0.004)`, tilt -0.5) the waves have a believable shape and scale, and the shallows are see-through turquoise fading to blue. Foam is a pale lilac smear rather than white. A patch of hard white specks sits bottom-left. No tiling or sparkle from orbit.

**Terrain.** Silhouette smooth; no cracks between patches in any view looked at. Detail holds at ground level. Rivers show only as a thin line (view 5). Mountain shadows: not seen in any view.

**Night side and exposure.** Readable and not washed out from orbit and on the ground. Exposure settled sensibly between day, night and ground (auto-exposure target 3.6).

**Aurora.** Fails the check: a solid wall, visible in daylight from orbit and filling the night sky at mid latitudes. `src/render/gfx/aurora.ts`.

**Plants: near model to imposter hand-over, and the grass ring.** On WebGPU there is no hand-over because near models never draw (C1). Grass does draw on both backends; its ring ends in an abrupt edge a few metres out (`plants-woodland-near.jpg`), and on WebGL2 the blades are bright lilac on black ground (C3 again). Instance counts while descending at the forest: imposters 956 at `dist 0.06`, grass starts at 0.035 (20 blades), 227 at 0.025, 1716 at 0.012, 3752 at 0.008; near models start at 0.035. `uLod` 0.02, `uGrassR` 0.009. The `handover-*.jpg` frames were captured but not reviewed, so popping is **not assessed**.

**Plants ignore the ground's darkness.** Whenever the ground was black (C3), trees, grass and mounds stayed fully lit. They are lit by `surfaceLight` in `src/render/lighting.ts`, which has no shadow term.

**Creatures.** Not assessable (C2).

**Temporal anti-aliasing.** `motion-pan-ground.jpg` and `motion-spin-orbit.jpg` were captured during camera movement but not reviewed. Still frames show coloured fringes (red/blue) on high-contrast edges, most visible on grass and tree edges; that is the lens fringe effect, which stays on after the step-downs turn anti-aliasing off. Ghosting is **not assessed**.

## 3D models

| Model | Backend | Seen? | Problems | Screenshot |
|---|---|---|---|---|
| Conifer-like tree, near model | WebGL2 | Yes | Fronds are flat paper cut-outs with a zig-zag edge; no shading variation, no shadow on the ground; trunk is a plain tapered tan cylinder that spikes out of the top; one uniform lilac | `webgl-6-forest-ground.jpg`, `webgl-plants-woodland-near.jpg` |
| Conifer-like tree, near model | WebGPU | **No** (C1) | Not drawn | `6-forest-ground.png` |
| Tree imposter | both | Yes | Very low resolution, stair-stepped edges, visible at ground level; trunk shows as a stick above the crown; side by side with near models on WebGL2 the mismatch in sharpness is obvious | `6-forest-ground.png`, `webgl-creatures-debug-ground.jpg` |
| Shrub, near model | WebGL2 | Yes | Flat flower-shaped cards on thin stalks, single colour | `webgl-plants-woodland-near.jpg` |
| Shrub imposter | both | Yes | A blurry round skirt with stalks | `6-forest-ground.png` |
| Grass ring | both | Yes | Blades are wide flat ribbons, same colour as the ground on WebGPU; ring has a hard outer edge | `plants-woodland-near.jpg` |
| Nest / hive mound | both | Yes | Far too large against trees; flat-shaded 7-sided cone; tilted; one over open sea; shows as a blurred cream disc when out of focus | `5-coast.png`, `webgl-5-coast.jpg` |
| Evolved and sample creatures | both | **No** (C2) | Not visible | see C2 |
| Aquatic plants, reef | WebGPU | No | Nothing on the seabed in a reef cell | `8-underwater.png` |
| Moons | WebGPU | Yes | One is brown and shaded correctly; two bodies render as flat pure-white discs | `3-terminator.png` |
| Settlements, structures | - | None exist | - | - |

The jungle location `(-1.46, -0.1)` (the densest vegetation on the planet, canopy 0.44, under heavy cloud) was captured at four distances on both backends (`plants-jungle-*.jpg`) but not reviewed.

## WebGPU against WebGL2

| | WebGPU | WebGL2 |
|---|---|---|
| Near plant models | Not drawn | Drawn |
| Creatures | Not drawn | Not recognisable; unresolved |
| Console | Pipeline errors every load | Clean apart from the two shared lines |
| Orbit, day | Small white disc at the limb | Huge white glare over a third of the frame |
| Full High frame rate | 19 to 22 fps | 18 to 30 fps |
| Step-downs end at | Pixel ratio 1 | Pixel ratio 2 |
| Saved-planet load | Black land and sea | Black land and sea |

Other differences could not be separated from C3, because all the WebGL2 view captures came from a slot-loaded world.

## Files captured but not reviewed

All in `docs/screenshots/gpu/`, converted to 1600 px JPEG:

- `preset-low-*`, `preset-medium-*`, `preset-ultra-*` (orbit, coast, ground at each preset)
- `plants-woodland-ground/mid/far`, `plants-jungle-*`, and the `webgl-` versions
- `model-evolved-sp*` and `model-debug-sp*` other than those named above (each species: `near-a` heading 0 tilt -0.6, `near-b` heading 2.1 tilt -0.9, `mid` at 5x the distance)
- `webgl-2` to `webgl-4`, `webgl-7`, `webgl-8`
- `motion-*`, `handover-*`, `8b-underwater-up`, `creatures-debug-mid`
- `diag-*`, `probe-*`, `unpause-*`, `dive-*`, `fresh-*` (small diagnostic frames for C3)

## Not done

- Low and Medium frame rates on mains power.
- A clean WebGL2 pass in a freshly warped world (views, creatures, hand-over).
- Any look at creatures' legs, fur and animation.
- Ghosting and popping from the motion frames.
- Firefox or Safari.
