# Genesis: direction (draft for the owner to edit)

Status: a draft written from a conversation with the owner on 2026-11-20. It is **not agreed yet** and changes nothing until the owner says so. It sits on the fix session's branch, not on `main`, so that it does not steer the build before then.

## In one line

You run a living planet: shape it, seed it, set yourself something hard to pull off, and find out why it worked or why it all went wrong.

## Who it is for

Teenagers, college students and adults. It should be fun first. Whatever it teaches should come from playing, never from being told.

## What it should feel like

A hybrid of two games the owner named:

- **SimEarth:** the whole planet is yours. You change the air, the seas, the land and the life, and everything is connected, so one change ripples through the rest.
- **Kerbal Space Program:** you set out to do something difficult, it fails in ways that are funny and instructive, you work out why, and you try again with a better plan. Real science sits underneath, and nobody lectures you about it.

## What changes

The first brief says Genesis is "a living simulation you watch and poke at, not a game with goals or a win state". That line goes. The sandbox stays, and a game is built on top of it.

## Four pillars

1. **You act, the planet answers.** A proper set of planet tools: raise and sink land, steer climate, seed and move life, nudge a species, strike with a meteor, found or spare a people. Each has a cost and a visible consequence.
2. **Missions with stakes.** Short, optional goals with a clear win and many ways to fail: get something to fly, bring life back after an impact, carry a civilization through an ice age, reach the space age on a world with no metal. A handful to start, more later, and a free sandbox for those who want none.
3. **Why did that happen?** After a success or a collapse, the game shows the chain of causes it already records for every extinction, new species and war, in plain words, with a note on where the same thing happened on Earth. Then it offers to rewind and try again. Rewind and "what if" forks already exist.
4. **Make it and share it.** A creature you designed, a world you shaped, a mission you beat, a disaster worth showing: each can be shared as a link that opens the same world, or as a picture or clip. Seed links, postcards and GIF export already exist.

## What stays as it is

The simulation, the renderer and its fixes, the cause graph, rewind and forks, seed links, the Night Map and nations, the field guide, the tests. Nothing is thrown away.

## Platform

The browser, because a link is the most shareable thing there is and it runs on any laptop. A downloadable desktop version can wrap the same code later for stores. A rebuild in a native engine is not planned: it would cost months, the link, and most of what is built, to buy realism this game does not need.

## Look

Stylised and clean rather than realistic, and readable at a glance. What it lacks today is surface detail, shadows and better models, not a different engine. The collected CC0 assets on the owner's machine are the raw material. The owner's earlier decision stands until changed: assets come after the base game works.

## The expansion brief

`docs/EXPANSION_BRIEF.md` lists 100 systems written for the "no goals" design. Under this direction each one should earn its place by giving the player something to do, to aim for, or to understand. Suggested: finish the section in progress, then stop and re-order the rest against the four pillars before building more.

## First steps, in order

1. A mission framework and five starter missions, each with a win condition, failure messages and a debrief.
2. The planet tools gathered into one clear toolbar, with costs.
3. The debrief panel: the chain of causes for the last big event, and "rewind to here".
4. A simple creature designer: set a few traits, release it, follow its descendants.
5. A look pass on plants, ground and buildings.

## Questions still open

1. Should tools cost something (an energy or influence budget, as SimEarth had), or stay free in sandbox and limited only inside missions?
2. Is progression wanted (unlocking tools and missions as you go, like Kerbal's career mode), or everything open from the start?
3. Should the build session pause the expansion brief now, or finish its current section first?
4. Does the "assets later" decision still stand, given that the look is one of the main complaints?
