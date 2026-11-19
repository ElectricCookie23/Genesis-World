# Fix session handoff (GPU review follow-up)

Written 2026-11-19 at a pause the owner asked for, to save usage. This is the note for the session that fixes what the real-GPU review found. It is separate from `HANDOFF.md`, which belongs to the session building the game on `main`. Read this first, then the top of `docs/GPU_REVIEW.md` (the re-test section) and the "GPU review: fixed and still open" part of `HANDOFF.md`.

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
- **The second re-test is on hold** ("we are holding back on it for a bit right now"). Do not ask the Mac session to run it until the owner says so.
- Commit messages are plain: no Co-Authored-By line, no session link.
- The owner said to do whatever is needed with git and pushing, and merged pull request 1 themselves. Pushing straight to `main` has been fine. Every push to `main` deploys the live site about six minutes later, after the tests pass, so do not push to `main` while the Mac session is in the middle of a test.
- Assets: BRIEF.md allows CC0 or public domain only, each logged in `CREDITS.md`. Nothing from the collected assets goes into the game until the owner decides.
- The owner paused this work because of usage limits. Keep to work that matters, and do not start long speculative jobs.

## State of the code

`main` is at `f284319` and deployed. The working branch is ahead of it by:
- `66595dc` civilization tuning (see task 2). **The full test suite has not been run on it.**
- the commit that adds this file and `scripts/checks/`.

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
2. **Civilization tuning (`66595dc`, on the branch only).** In `src/sim/civilization.ts` the count toward a thinking lineage now starts above 0.47 and is lost only below 0.41, over 100 My. Evidence, nine seeds on the small planet (grid 21): before, three minds in 600 My and one inside the brief's window; after, five in 480 My (at 178, 187, 204, 359 and 439 My). The brief asks for roughly 60 percent of seeds between 234 and 360 My at Epoch speed. Still to do: run `npm test`; run one or two seeds on the full-size planet (grid 63, about 15 minutes each for 330 My) because the small planet may not behave the same; add a line to `DECISIONS.md` (it corrects decision 41) and to `HANDOFF.md`; then put it on `main`.
3. **When the owner allows the second re-test,** remind the Mac session of the brief I sent it (re-test of `f284319`, ten points, plus Medium, High and Ultra frame rates). Read its section at the top of `docs/GPU_REVIEW.md` and fix what it finds. The imposter orientation is the one most in need of eyes.
4. **Frame rate.** Clouds are over half the frame above Low. The presets and step-downs were changed blind from the first review's numbers; the re-test will say whether High now settles near 50 fps with anti-aliasing still on. If not, the real fix is a half-resolution cloud pass (clouds drawn into their own target at half size and composited), which needs care because the atmosphere is drawn over the clouds. WebGPU also measured 2 to 4 fps slower at coast and ground after the first fixes; cause not looked for.
5. **Animals.** From the re-test: a pale see-through leg on a walking animal (probably a ghost from temporal anti-aliasing, which has no motion vectors for animated meshes), an occasional loose foot, fins lying apart from an aquatic body, feet hovering on rough ground, shading still toy-like. Check with evolved animals, not only `debugSpawn`, whether land animals stand on water.
6. **No meat-eaters.** In a 900 My small-planet history of the default seed no species ever had a diet gene above 0.6, although extinction notes say animals were hunted. The renderer's chase behaviour needs that gene above 0.6, so it never happens. Check on the full-size planet before concluding; this is sim tuning and overlaps the build session.
7. **Determinism.** The same seed gives different worlds from run to run in the browser (23 to 41 living species at 150 My), because the worker steps the sim by wall-clock ticks at the current speed. BRIEF.md requires the same seed and actions to give the same history. This belongs with the build session; it is noted in `HANDOFF.md`.
8. **Smaller look items still open:** flat single-colour leaves on most plant forms, the empty sea bed, hard polygonal coastlines, rivers as thin even lines, exposure taking a second or two to settle after a preset change, the white haze patch at ground level, depth of field blurring half the coast view (not reproduced).
9. **Using the collected assets,** if the owner wants it (question 2 below).

## The collected assets

On the Mac at `~/genesis-review/assets/`, with `MANIFEST.md`: 1,121 packs and assets, 7.3 GB, all CC0. Kenney (60 packs: all 50 of its 3D kits and 10 audio packs), Poly Haven (517 models at 1k textures, 268 sky HDRIs), ambientCG (276 material sets at 1K). The Mac session has not opened any of the files; they are sorted by name and tags only. Nothing is in the repo and this session cannot see them.
- Best fit for trees: Kenney's Nature Kit (329 low-poly models) and Mini Forest. Poly Haven trees are 150,000 to over a million triangles each and cannot be used as they are.
- Nothing usable was found for coral, kelp, shells, fossils, temples, classical or far-future buildings, trains, aircraft, model planets, or natural sounds.
- Animals cannot be swapped in: their bodies are built from each species' genome.
- If used: the Mac session would have to commit a chosen set into the repo (for example under `public/assets/`), with the licence files and rows in `CREDITS.md`, and the game would need a loader that gives the models the attributes its shaders expect (part, wind weight, tint).

## Questions for the owner

1. May the second re-test run now, and in which Chrome profile?
2. Should the collected assets be used in the game, and for what first? My suggestion is to start with one contained thing, buildings and boats from Kenney's kits, since those are fixed objects and the game's own are plain; and to leave plants generated in code unless the result still looks poor after the re-test, because Kenney's trees are faceted and would change the look of every forest.
3. Should the civilization tuning go to `main` once its tests pass?
