# Decisions of the fix session

Numbered F1, F2, ... so they never collide with `DECISIONS.md`, which the build session keeps. Earlier decisions of this session are in `DECISIONS.md` (the goals mode at 107, the star system and what follows at 121 to 128).

F1. **The linked world runs inside the first one's worker, in lockstep** (E98). Two workers exchanging messages would drift with the wall clock, and the pair would not repeat from its two seeds. So `sim.neighbor` is a whole simulation on a small grid, stepped with the same years, saved beside the first, and the exchange is a pure function of the two states. Linking costs one small world's worth of time, which is why it is something the player turns on. A world linked late is brought to the same age in long steps before the two are joined.
