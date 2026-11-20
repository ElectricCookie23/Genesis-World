# Fix session handoff (GPU review follow-up)

Written 2026-11-19 at a pause the owner asked for, to save usage, and updated the same day when work resumed (see "Since the pause"). This is the note for the session that fixes what the real-GPU review found. It is separate from `HANDOFF.md`, which belongs to the session building the game on `main`. Read this first, then the top of `docs/GPU_REVIEW.md` (the re-test section) and the "GPU review: fixed and still open" part of `HANDOFF.md`.

## Who does what

- **This session (cloud, no GPU):** changes code, checks it in a software renderer, pushes. Branch `claude/sweet-keller-8gmglc`.
- **Mac session** `session_01A25QnAtsbJhBdvQg7yj2dn`, titled "GPU review of the Genesis renderer", on the owner's MacBook (Apple M3 Pro). The only place anything can be seen on a real GPU. It writes its findings into `docs/GPU_REVIEW.md` and pushes them to `main`. It is idle and waiting for the owner.
- **Build session** `session_01A25Qn7xdE4fjWCia9AhtHp`: builds the game on `main`, woken every five hours by the scheduled task "Genesis auto-resume". Its queue is now the expansion brief. Do not touch its scheduled task.

How the sessions talk:
- `send_message` from here to the Mac session works. Its replies cannot reach this session. Read what it did with `get_session` and `list_events` (kinds `result`), or from what it pushes.
- Scheduled check-ins from this session fail ("access denied") since it was limited to the owner's trusted devices. Do not rely on `send_later`; this session only wakes when the owner writes.
- The Mac session does not act on relayed instructions that need the owner's own say (opening a browser, pushing to `main`). It waits for the owner.

## Owner's standing rules

- Chrome on the Mac: **only the "stratcomm 314" profile**, and only when the owner says it is fine to open a window. The Mac session has been using a scratch profile for tests; the owner decides which, in that session.
- The second re-test is cleared: "the second re-test run can run and use scratch chrome". It was requested from the Mac session against `29ea8ad`.
- Commit messages are plain: no Co-Authored-By line, no session link.
- The owner said to do whatever is needed with git and pushing, and merged pull request 1 themselves. Pushing straight to `main` has been fine. Every push to `main` deploys the live site about six minutes later, after the tests pass, so do not push to `main` while the Mac session is in the middle of a test.
- Assets: **not now.** The owner's decision: the collected assets come later, "once the base game is done and the blackbox testing of it is essentially complete. the normal features need to work first." BRIEF.md allows CC0 or public domain only, each logged in `CREDITS.md`.
- The owner paused this work because of usage limits. Keep to work that matters, and do not start long speculative jobs.

## Latest state (end of 2026-11-20 UTC) — read this first

The owner's instruction now: "start creating all the features. go back to the briefs and check the list of the total 250 features. make sure all have been made and working. after that we will start with asset pass." And twice: "why is everything so low poly?"

**Done since the section below**
- Expansion Section 10 complete (E91 to E100): `sim/cosmos.ts`, `sim/legacy.ts`, `sim/link.ts`, `ui/system.tsx`, tests `cosmos`, `legacy`, `link`. The build session builds in order from Section 2; this session works backward from the end. Decisions of this session now go in `docs/DECISIONS_FIX.md` (F1...), at the build session's request.
- Independent audit of the original 150: `docs/FEATURE_AUDIT.md` (123 work, 25 partial, 2 unclear). Fixed from it: hunters (15, 17), sea level and invasions (31, 81), senses and signals (36, 66, 76, 77, 78), the shatter-moon button (100, 101), designer sliders (132, 134). See F2 to F7.
- GPU checks `retest8` and `retest9` read and acted on; performance study `docs/PERFORMANCE.md` acted on in part (F9, F10).
- Animals reshaped (F11); sheets in `docs/asset-previews/species-sheet-before.jpg` and `-after.jpg`.

**Owner's order of work (2026-11-21):** the older look list, then everything else on the queue, then animal sculpting last. With the sculpting: remove all religion and all "god" from the game, rename and group the tools, and keep animals invented and plausible, not Earth-like or realistic (`docs/DIRECTION_DRAFT.md`, the 2026-11-21 section). Done so far in that order: the look list (F12), the audit's remaining items (F13), expansion Section 9 (F14, F15).

**Queue, in order**
1. A GPU check of what the Mac has not seen: hunters and the chase, the reshaped animals, the day-side exposure fix, FXAA on Medium, the new designer sliders, the Shatter button. Ask the owner first (standing rule).
2. Rest of the audit's partials: 46 temples facing the viewer, 50 ruins drawn, 62 giants from high oxygen, 109 caves, 110 vents, 128, 129, 133, 135; 12 and 144 need individual animals in the simulation (large); 40 needs deterministic stepping in the worker (build session's file).
3. Expansion Section 9 (E81 to E90), then Section 8 backward, until the two sessions meet.
4. More of `docs/CREATURE_SCULPTING.md` (blended joints, feet, ears and jaws) and section B of `docs/PERFORMANCE.md` (contact shadows, leaf volume), then section A (temporal upscaling, cheaper clouds).
5. Asset pass, when the owner says.

**Easy to forget**
- Any change to the rules of life changes every history: run `scripts/checks/traitsweep.ts` (hunters, traits, sea) and check when history begins on five seeds before pushing. Tests that need a history must not depend on one seed being early.
- `history.test.ts` alone takes 6 minutes; the whole suite 5 to 7. CI gates the deploy on it.
- Mac session id ends `...Qg7yj2dn` (prefix `session_01A25QnAtsbJhBdv`); I mistyped it twice.

## Earlier: where things were

The sections below this one are older background.

**Done since the second pause**
- The build session fixed both blockers (`6dddd2d`): civilization lasts, and `warp` takes `through: true`.
- The Mac session checked `6dddd2d` on the GPU (top of `docs/GPU_REVIEW.md`, `retest6-`). Batches four and five are mostly confirmed: night towns, village fires, building spacing, no huts in the surf, labels not overlapping, waders. The summary and what is left is in `HANDOFF.md`, "Check of 6dddd2d on the GPU".
- Holes in the land: not reproduced on the GPU or here. Closed until seen again.
- **Goals mode built** (owner's request): `src/game/goals.ts`, `src/ui/goals.tsx`, hook in `main.ts`, `tests/goals.test.ts`, `scripts/checks/goalsweep.ts`. See `HANDOFF.md`, "Goals", and DECISIONS 104.

**Owner said (2026-11-21):** "i am going away from keyboard please queue everything for yourself to do". So: keep working down the list below without waiting; the usage limit is still the constraint.

**Queue, in order**
1. ~~From the `6dddd2d` check~~ Done as the sixth batch (see `HANDOFF.md`): plants clear of towns, taller towers, Night Map names, lightning from orbit, shoreline foam, fewer lit windows. Software-checked only.
2. Not yet checked on a GPU: the sixth batch, sky at altitude on WebGL2, the small-island sea patch, broadleaf trunks and bark from inside a forest, how a wading animal looks, the goals panel. Ask the owner before the next GPU check (standing rule).
3. Goals, next steps: a short debrief when a goal is reached (the chain of causes in plain words, not only the link), more goals as the build session's systems land (dynasties, first meetings), and the owner's open question on progression (default: all open).
4. The older look items in `HANDOFF.md` ("Still open, for whoever gets to it").
5. ~~Side panels over the stats box~~ Done: the stats box steps aside while a side panel is open, and the followed goal is its own small box beside the title. On a phone the sheets are now nearly solid, so the time bar no longer reads through them.
6. Later, only when the owner says: the look pass with the shortlisted assets.

**Practical notes**
- This container has 4 cores: a software-rendered warp, a headless sweep and a page screenshot at once make screenshots time out. Shrink the 3D view first (`scene.renderer.setSize(160, 100, false)`) when only the interface is being looked at.
- Preact 11 drops bare numbers in styles (`marginTop: 4` does nothing): write the unit (DECISIONS 103).
- I cannot wake myself (scheduled messages are refused for this session). Work happens only inside a turn.
- The Mac session is waiting on the owner for a contact address for Wikimedia Commons sounds, or "skip".

## Earlier: where I stopped (second pause, 2026-11-20 about 2:10 am Qatar time, for usage)

Read this section first; the older sections below are background.

**State.** `main` and this branch were level at `945a395` plus the Mac session's write-up `13a9402` (merged here). Five batches of fixes are on `main`. On the GPU, batches one to three are confirmed (see the re-tests in `docs/GPU_REVIEW.md`); batch four and five are software-checked only, because the last GPU check could not be completed.

**Why the last GPU check failed** ("Check of commit 6249d6c: not completed", top of `docs/GPU_REVIEW.md`). Not because of the fixes: the build session's expansion commits (E1 to E5) changed how the game behaves under a fast-forward.
1. A scripted `warp` now stops at each milestone (the build session made warps stop "at the dawn of history" on purpose) and must be re-sent; `stats.simYear` reads 0.01 My for about a minute while a warp runs.
2. Civilization appears at about 59 My and is entirely gone by 90 My (698 settlement records, none live; 5,359 at 200 My, none live), where the day before the same seed had 468 live settlements at 200 My. Either a regression in the history model or the fields changed meaning (`settlement.ruined`, `stats.maxTech`, `state.nations`). **This belongs to the build session and it has not been told**: my message to it did not go through. Tell it, or write it under "GPU review" in `HANDOFF.md`.
3. "The land has holes through it" (`docs/screenshots/gpu/retest5-webgpu-broadleaf-0.06.jpg`): a ridge hanging over the sea with arch-shaped openings under it, and pink, white and green polylines crossing the sea. I took this one. What I ruled out: the quadtree is not running short (terrain 842 of 1,200 patches at worst, sea 575 of 1,000, measured with `scripts/checks/patchcheck.js` if I saved it, otherwise re-create: sweep camera spots and read `scene.terrain.sphere.patchCount` and `.max`); and no renderer file that shapes terrain changed since `6766d4a`, which checked out well. So suspect the world's data in the new sim (very steep coasts from the newer landform and tectonics code opening cracks between patches of different detail, with the skirts too short to cover them), or sea level. The coloured lines are probably roads, borders and trails drawn across water. Next step: reproduce in software by growing the seed to 200 My on the current build (re-send the warp after each milestone stop), go to `setImmediate(2.86, 0.18, 0.06)`, tilt -0.35, and look; also ask the Mac session for a Shift+D diagnostic dump at that view.

**What the Mac check was meant to cover and still has not:** towns and a village at night from 0.08 and 0.02, worked ground in towns, Night Map labels, broadleaf trunks, bark and crossed leaves, land animals wading, the gliding flap, building spacing, the night side from orbit, the sky at altitude on WebGL2, a small island for the missing-sea squares, huts in the surf. To review towns now: stop soon after civilization begins (about 60 My on this seed) and step forward in small warps while watching the count of live settlements.

**Owner's decisions since the first pause** (also in `docs/DIRECTION_DRAFT.md`):
- The game should have a goals mode as a feature, but mostly be relaxed sandbox play, with no energy or budget on tools.
- Audience teenagers to adults; fun first; a Kerbal Space Program and SimEarth hybrid in feel; download acceptable if it stays shareable; no native-engine rebuild planned.
- Assets stay for later, after the base game works. The Mac session keeps collecting and has a reviewed shortlist in `docs/ASSET_SHORTLIST.md` (about 20 GB on the Mac).
- GPU checks were allowed in the scratch Chrome each time I asked. Ask again before each one.
- "you can do whatever you want, however you want whenever you want": proceed on judgment, but usage is the constraint, so spend it on what matters.
- Give times in Qatar time (UTC+3).

**Task list, in order, for when work resumes**
1. Tell the build session about findings 1 and 2 above (message it, or write in `HANDOFF.md`). Ask for a way to make a scripted warp run through milestones, so check scripts work again.
2. Reproduce and fix the holes in the land (finding 3).
3. When civilization survives again, ask the owner for a GPU check of batches four and five (list above), and fix what it finds.
4. Start on the direction: with the owner's go, the first step in `docs/DIRECTION_DRAFT.md` is a mission framework with a handful of optional missions and a debrief, then one clear toolbar of free planet tools. Agree with the build session who builds it before starting, since it is still working through the old expansion list.
5. Remaining look items from the reviews, in `HANDOFF.md` under "Still open, for whoever gets to it".
6. Later, when the owner says: the look pass with the shortlisted assets.

**Check scripts** are in `scripts/checks/` (see below for what each does; newer ones: `towncheck.js` made-up towns, `labelcheck.js` Night Map labels, `atlascheck.js` all plant forms). They need the dev server on port 5199 and may need `&noadapt` and a re-sent warp on the current build.

## Since the pause

- The build session resumed and pushed three commits (`ce6771a`, `c81a310`, `29ea8ad`). It merged its own review fixes with mine, keeping my verified versions where both touched the same thing, and added a third batch: clouds marched at half resolution, a non-finite guard with a diagnostic report (Shift+D), no river causeways on the sea, trails as trampled patches, ground and plant colours, conifers reshaped, animals drawn only from near, depth of field only while following, exposure capped from orbit, thinner atmosphere shell, `&noadapt`. Its notes are in `HANDOFF.md`.
- It also did its own civilization tuning (`29ea8ad`): social animals pay less for a big brain and the wait is 15 My, so first camps come around 130 My in most seeds. **My tuning (`66595dc`) is dropped as superseded**; it changed the same constants a different way and never reached `main`. Note for the owner: 130 My is earlier than the brief's timeline (a mind between 234 and 360 My in roughly 60 percent of seeds).
- The build session found that WebGPU can be checked in the container after all, with a stand-in canvas context (see "How to check visuals here" in `HANDOFF.md`). It reports pipeline validation errors; it still hides not-a-number faults.
- This branch was restarted from `29ea8ad`. It carries only this file and `scripts/checks/`.

- Second re-test (of `29ea8ad`) and a third pass (of `a42b083`) are at the top of `docs/GPU_REVIEW.md`. They confirm most of the second batch on the GPU and give High about 50 fps with all effects on. I fixed what they found that was contained (commit `6766d4a` on `main`, software-checked only): step-downs during loading, sky brightness at altitude, city glow from low altitude at night, sea dropped in squares beside islands, imposter size and hand-over distance per preset, building mix by population, buildings in the surf. What I did not take is listed in `HANDOFF.md` under "Still open from the second re-test"; the third pass adds flat looking-down view under water, plain-tube reef plants, thick straight trunks and bare ground under trees, a diamond-grid pattern on the sea from 0.3, a white fog smudge, and huts scattered without paths.
- A check of `6766d4a` came back (sky, far trees, Ultra fixed; night glow from low and unlit villages not). A fourth batch followed: see `HANDOFF.md`, "Fourth batch from the fix session".
- **Next for this session:** when the owner allows another GPU look, ask for the fourth batch to be checked (a town and a village at night from 0.08 and 0.02, Night Map labels, a broadleaf forest for trunks and bark, a shore for wading animals); then take the next contained items from the open list in `HANDOFF.md` if the build session has not.

## State of the code

`main` is at `6766d4a`. Always `git fetch` and merge before pushing: the build session pushes to `main` too.

Verified on the owner's GPU (re-test of `5bbe93a`, both backends):
- Plants, animals and buildings draw (vertex buffers packed, `Copies` instead of `InstancedMesh`). No console errors at Low or High.
- Land and sea stay lit (the strike age is clamped before its square root).

On `main`, checked in software only, **not yet seen on a GPU** (this is what the second re-test is for):
- Imposters baked the right way up on WebGPU.
- Sibling planets no longer two blown-out white discs.
- Aurora off in daylight, lower, no longer saturating.
- Daytime sky from the ground lifted; stars hidden by day.
- Sea glint held back from orbit.
- Animals smaller and tall trees taller; finer fur; softer highlights; umbrella tree with a domed crown.
- Nest mounds sized from their builders, none on water; wake rings and sound ripples flat.
- Rock strata bent and faded.
- Presets cheaper (High 1.5x and 18 cloud steps, Medium 1.25x and 12, Ultra 2x and 32); step-downs reordered; settled step remembered per preset in `localStorage` under `genesis:steps:<preset>`; one cautious step back up.
- Only the latest three milestone titles after a fast-forward.
- Powers and roots clamped throughout the shaders.

## What I learned that is easy to forget

- **The software renderer here hides real-GPU failures.** It tolerates the square root of a negative number, powers of slightly negative values, more than 8 vertex buffers and more than 16 attributes. Anything of that kind must be reasoned about, guarded, and then confirmed on the Mac.
- **WebGPU cannot be run here.** The software adapter loses its device at once. Only WebGL2 can be checked in this container.
- **The Mac's WebGL2 reports a 16 KB uniform block limit** and 16 vertex attributes. `scripts/checks/glcheck.js` can force that limit (`UBO_LIMIT=16384`) and it audits every mesh against the buffer and attribute limits.
- Sample animals come from `scene.creatures.debugSpawn(dir)`; the worker overwrites them within a second unless `applyCells` and `applyStats` are stubbed (the check scripts do this).
- Do not edit files under `src` while a browser check is running against the dev server: Vite reloads the page. For long checks, build to a scratch folder and serve that on another port.
- Do not run two browser checks at once.
- The brown arch seen in several screenshots is a cave mouth, not an animal.
- The two "white moons" in the first review were the sibling planets. The "upside-down jungle slabs" and "trunks above the crowns" were imposters baked upside down.

## Check scripts

In `scripts/checks/`, copied from the scratch folder so they survive. They expect the dev server on port 5199 (`npx vite --port 5199 --strictPort`) and the pre-installed Playwright (`require('playwright')` works from any directory). They write JPEGs next to where they are run.
- `glcheck.js <prefix>`: sample animals at ground level, plus the mesh audit. `UBO_LIMIT=16384` forces the Mac's limit.
- `views.js <prefix>` and `views2.js <prefix>`: terminator, orbit night and day, ground day and night, coast.
- `plantcheck.js <prefix>`: grows a world to 150 My (about four minutes), then forest views at four distances. Edit the port inside it; it was last pointed at a built copy on 5202.
- `orbitcheck.js`: orbit view with and without a meteor strike.
- `slotcheck.js`: save a slot, reload from it, compare brightness. `WARP=150000000` grows the world first.
- `civsweep.ts <millionYears> <gridN> <seed...>`: when a thinking species and a settlement first appear. Run with `npx vite-node scripts/checks/civsweep.ts 480 21 amber-reef-101 jade-moon-7 ...`.

## Task list, in order

1. **Ask the owner** the three open questions at the end of this file before doing anything that depends on them.
2. ~~Civilization tuning~~ Done by the build session in `29ea8ad`; mine is dropped. Worth checking once: `npx vite-node scripts/minds.ts <seed> <My>` on a few seeds, against the brief's timeline.
3. **Second re-test, requested.** The Mac session was asked to test the live site at `29ea8ad` (my ten points, plus the third batch: half-resolution clouds, frame rates with `&noadapt`, settlements and the Night Map after a 200 My warp, diagnostics). Its section will be at the top of `docs/GPU_REVIEW.md` with `retest2-` screenshots. Read it and fix what it finds, coordinating with the build session through `HANDOFF.md`.
4. **Frame rate.** The half-resolution cloud pass now exists (build session). The re-test will say whether High settles near 50 fps with anti-aliasing still on. WebGPU also measured 2 to 4 fps slower at coast and ground after the first fixes; cause not looked for.
5. **Animals.** From the re-test: a pale see-through leg on a walking animal (probably a ghost from temporal anti-aliasing, which has no motion vectors for animated meshes), an occasional loose foot, fins lying apart from an aquatic body, feet hovering on rough ground, shading still toy-like. Check with evolved animals, not only `debugSpawn`, whether land animals stand on water.
6. **No meat-eaters.** In a 900 My small-planet history of the default seed no species ever had a diet gene above 0.6, although extinction notes say animals were hunted. The renderer's chase behaviour needs that gene above 0.6, so it never happens. Check on the full-size planet before concluding; this is sim tuning and overlaps the build session.
7. **Determinism.** The same seed gives different worlds from run to run in the browser (23 to 41 living species at 150 My), because the worker steps the sim by wall-clock ticks at the current speed. BRIEF.md requires the same seed and actions to give the same history. This belongs with the build session; it is noted in `HANDOFF.md`.
8. **Smaller look items still open:** flat single-colour leaves on most plant forms, the empty sea bed, hard polygonal coastlines, rivers as thin even lines, exposure taking a second or two to settle after a preset change, the white haze patch at ground level, depth of field blurring half the coast view (not reproduced).
9. **Using the collected assets:** deferred by the owner until the base game is done and tested.

## The collected assets

On the Mac at `~/genesis-review/assets/`, with `MANIFEST.md`: 1,121 packs and assets, 7.3 GB, all CC0. Kenney (60 packs: all 50 of its 3D kits and 10 audio packs), Poly Haven (517 models at 1k textures, 268 sky HDRIs), ambientCG (276 material sets at 1K). The Mac session has not opened any of the files; they are sorted by name and tags only. Nothing is in the repo and this session cannot see them.
- Best fit for trees: Kenney's Nature Kit (329 low-poly models) and Mini Forest. Poly Haven trees are 150,000 to over a million triangles each and cannot be used as they are.
- Nothing usable was found for coral, kelp, shells, fossils, temples, classical or far-future buildings, trains, aircraft, model planets, or natural sounds.
- Animals cannot be swapped in: their bodies are built from each species' genome.
- If used: the Mac session would have to commit a chosen set into the repo (for example under `public/assets/`), with the licence files and rows in `CREDITS.md`, and the game would need a loader that gives the models the attributes its shaders expect (part, wind weight, tint).

## Questions for the owner

None open. Answered on 2026-11-19: the re-test may run in the scratch Chrome; assets later; civilization tuning to `main` (it is there, in the build session's version).
