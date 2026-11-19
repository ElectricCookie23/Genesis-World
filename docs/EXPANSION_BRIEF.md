# GENESIS: Expansion Brief (100 systems)

<role>
You are the lead engineer and designer on Genesis (repo: https://github.com/ElectricCookie23/Genesis-World). Work autonomously and don't ask questions. Pull the repo and read BRIEF.md, PROGRESS.md and DECISIONS.md first. This brief adds 100 new systems on top of the existing 150 features. Save it to the repo as EXPANSION.md, track every system in PROGRESS.md under a new "Expansion" section, commit and push after each working system, and never add a Co-Authored-By line.
</role>

<goal>
Turn Genesis from "a planet you watch" into "a world whose story you can't stop following." The user should be able to watch a civilization go from campfires to an invented industrial age to a strange far future, see cities being built in real time, walk the streets as a person at any point in history, and dig into why everything happened.

Three ideas run through every system:
1. **Everything is remembered.** Every system writes to the cause graph and to a per-cell history log, so any place can be viewed at any point in its past.
2. **Everything is seen by someone.** Civilizations have their own, often wrong, understanding of their world. The gap between what really happened and what they believe is part of the fun.
3. **Nothing is Earth.** The world is alien. Eras can be labelled "comparable to Earth around 1450" as an optional toggle, but names, cultures, buildings and technologies are all invented by the simulation.
</goal>

<rules>
- Never break Tier 1 of BRIEF.md to add an expansion system.
- Build the sections in order (1 to 10). Inside a section, build in numbered order.
- Every system must: write events to the cause graph, be deterministic from the seed, have a lower-cost fallback on mobile, and have at least one headless test.
- If a system is too heavy, build a simpler version, mark it "simplified" in PROGRESS.md, and explain why in DECISIONS.md.
</rules>

---

## ARCHITECTURE ADDITIONS (build these first)

- **Civilization model:** nations, settlements, cultures, religions, languages and notable people are entities in the worker. Ordinary citizens are not simulated individually. They are generated on demand from settlement statistics, using `hash(seed, settlementId, citizenIndex)`, so the same citizen always comes back with the same name, face and life.
- **Notable people:** rulers, founders, inventors, prophets, generals and artists are stored permanently with full biographies.
- **Per-cell history log:** every cell keeps a compact, compressed log of changes (biome, buildings, owner nation, population, events) so its state can be rebuilt for any year.
- **Snapshots:** a full world snapshot every major era, plus the existing rewind ring buffer, for counterfactuals and replays.
- **Era clock:** each civilization has its own tech level and era. Eras are not global: one nation can be industrial while another is still in its bronze-equivalent age.
- **Text generation:** all names, chronicles, newspapers and articles come from template grammars with large vocabularies fed by sim data. No external AI API, no keys.

---

## FORMAT OF EACH SYSTEM
Each system lists:
- **What:** the experience.
- **How:** how to build it and which systems it connects to.
- **You see:** what appears on screen.
- **Done when:** how to tell it works.

---

## SECTION 1: THE HISTORY ENGINE

**E1. The Tech Web**
- What: a procedural technology web of about 150 inventions that each civilization discovers in its own order.
- How: techs have prerequisites, plus environmental conditions (no metal ores means no metallurgy, so the civilization goes down a glass, bone or ceramics path instead). Discovery chance depends on population, trade contact, stability, curiosity genes and luck. Each tech gets an invented name from the culture's language.
- You see: a tech web panel per nation, with discovered techs lit and the moment of discovery logged in the chronicle.
- Done when: five seeds show five different discovery orders, and at least one seed has a civilization without metal that still advances.

**E2. Era Progression**
- What: civilizations move through invented eras (for example "Age of Kilns," "Age of Sails," "Age of Engines," "Age of Signals," "Age of Orbit").
- How: an era is a band of tech level. Each era changes architecture, clothing, lighting color, music, the look of art and what's on the night side.
- You see: an era banner when a nation crosses into a new one, and a toggle showing "comparable to Earth around [year]."
- Done when: a full run shows at least 6 distinct eras with visible changes in cities and lights.

**E3. Uneven History**
- What: different nations live in different eras at the same time.
- How: tech spreads through trade, war and migration at different speeds. Isolated islands stay behind. Conquest can spread tech or destroy it.
- You see: the night map shows fire-lit regions beside electric-lit ones.
- Done when: in at least 3 of 5 seeds, two nations are two or more eras apart at the same moment.

**E4. Rise and Fall**
- What: empires grow, peak and collapse.
- How: each nation tracks stability (driven by food, inequality, legitimacy, war fatigue, disasters, disease and religion splits). Low stability triggers civil war, secession or collapse into successor states.
- You see: borders fracturing on the map, capitals going dark, new nations with new names and colors.
- Done when: every run longer than 25 minutes has at least one empire collapse with a readable cause chain.

**E5. Dark Ages**
- What: civilizations can lose knowledge.
- How: a collapse, a library fire or a plague can drop techs. Lost techs leave artifacts (ruins with technology the current people can't make). Rediscovery is faster if ruins are nearby.
- You see: a "Lost knowledge" event, and ruins tagged "built with a forgotten technique."
- Done when: at least one tech is lost and later rediscovered in a long run.

**E6. Notable People**
- What: named rulers, inventors, prophets, generals, explorers and artists.
- How: generated when something big happens (a new tech, a battle, a religion). Each has traits, a lifespan, relationships and an outcome. Their choices affect the sim through small biases (an aggressive ruler raises war odds).
- You see: portrait cards generated from the species' body plan and the era's art style.
- Done when: every major event in the chronicle names the person tied to it.

**E7. Dynasties and Succession**
- What: ruling families with succession crises.
- How: monarchies pass power down a family tree. Disputed successions cause civil wars. Families can marry across nations to form alliances.
- You see: a family tree view for each dynasty with reigns, causes of death and wars started.
- Done when: a dynasty lasting 5+ generations appears in most runs.

**E8. Calendars and Eras of Their Own**
- What: each civilization dates history its own way.
- How: a calendar is founded on a real event (the comet's return, a ruler's crowning, the eclipse). Dates are shown in the user's sim years and in the local calendar.
- You see: "Year 412 of the Falling Light (sim year 3,104,882)."
- Done when: every nation has a calendar tied to a real event in the cause graph.

**E9. Migrations of Peoples**
- What: large movements of populations.
- How: famine, war, climate change and sea level shifts push people out. Migrants carry language, religion and tech, and mix with locals.
- You see: animated migration arrows on the history map, and new mixed cultures appearing.
- Done when: an ice age or sea level change triggers a recorded mass migration.

**E10. Golden Ages**
- What: periods where a culture flourishes.
- How: stability, wealth and trade contacts above thresholds start a golden age that speeds up tech, art and building.
- You see: a warm color grade over that nation, a burst of monuments, the chronicle naming the age.
- Done when: golden ages appear and end with recorded causes.

---

## SECTION 2: CITIES AND REAL-TIME GROWTH

**E11. Living City Growth**
- What: cities grow organically, building by building.
- How: agent-based urban growth. Roads grow from desire paths between important places, plots fill along roads, districts form (markets, temples, homes, workshops, docks), walls get built when there are threats, then sprawl past the walls.
- You see: a time-lapse of a village becoming a metropolis.
- Done when: two cities from the same seed look clearly different because of their terrain and history.

**E12. Watch It Being Built**
- What: construction happens on screen.
- How: each building has construction stages (foundation, frame, walls, roof, details) with scaffolding and workers at street level. Monuments take decades and you can watch them rise.
- You see: cranes appropriate to the era, scaffolding, and progress bars in the info card.
- Done when: at 1x speed in a city you can watch a building go up start to finish.

**E13. Architecture From Biology**
- What: buildings shaped by the species that builds them.
- How: architecture rules come from the genome. Tall species build tall doorways and narrow towers. Burrowers dig down. Fliers build high perches with no stairs. Aquatic species build half-submerged cities. Materials come from local geology and plants.
- You see: cities that could only have been built by that species.
- Done when: two intelligent species in different seeds produce clearly different architecture.

**E14. Architectural Styles Over Time**
- What: styles change by era and culture.
- How: each culture has a style grammar (roof shapes, ornament, window patterns, colors) that drifts over time and borrows from cultures it trades with.
- You see: old quarters in an old style next to new districts in a new one.
- Done when: a city's center and edge look visibly from different periods.

**E15. Infrastructure Networks**
- What: roads, canals, aqueducts, rails, power lines, pipelines, cables.
- How: networks are graphs built by cost (terrain, rivers, borders). Each era unlocks new network types. Networks connect to trade and war.
- You see: networks glowing on the night side and visible as structures on the ground.
- Done when: a full run shows at least 5 network types appear in sequence.

**E16. Farmland and Landscape Change**
- What: civilizations reshape the land.
- How: fields, terraces, irrigation, deforestation, drained swamps, dams and mines change cell biomes and feed back into climate and ecology.
- You see: patchwork fields from orbit, terraced hills up close, lakes behind dams.
- Done when: deforestation measurably changes local rainfall in a test.

**E17. Ruins and Layers**
- What: cities are built on top of older cities.
- How: when a city is destroyed or abandoned, ruins remain. New settlers build on top. The cross-section view shows the layers.
- You see: a slice through a hill with five cities stacked inside it.
- Done when: a long-lived city site has three or more layers.

**E18. Feral Cities**
- What: after collapse, nature and animals take cities back.
- How: abandoned buildings decay in stages, forests grow through streets, domesticated animals go feral and occupy ruins, and some species start nesting in towers.
- You see: overgrown skyscraper-equivalents full of wildlife.
- Done when: a collapsed city fully returns to forest given enough time.

**E19. Wonders**
- What: giant monuments tied to real events.
- How: observatories aligned to the comet's orbit, temples facing the crater from your meteor, a tower built where the first city stood. Each wonder records why it was built.
- You see: unique giant structures, visible from high altitude.
- Done when: every wonder links to the event that inspired it.

**E20. Disasters in Cities**
- What: earthquakes, floods, fires and eruptions hitting cities.
- How: damage depends on building tech and terrain. Rebuilding follows, sometimes in a new style or location. Great fires lead to new building laws (stone replaces wood).
- You see: destruction and rebuilding in time-lapse.
- Done when: a disaster leads to a visible change in how the city rebuilds.

---

## SECTION 3: CULTURE, LANGUAGE AND BELIEF

**E21. Generated Languages**
- What: each culture speaks its own language.
- How: phonology comes from the species' vocal anatomy (body size and calls). Build a lexicon, grammar rules and sound changes over time. Daughter languages split off when populations separate.
- You see: place and people names that sound consistent per culture, and a language family tree.
- Done when: two related languages share visibly similar words for the same things.

**E22. Place Name Drift**
- What: names change over centuries.
- How: names undergo the sound changes of their language. Conquerors rename places. Every place keeps its full name history.
- You see: "Velhassa (founded), later Velass, now Vass," with the reasons.
- Done when: an old city has at least 3 historical names.

**E23. Writing Systems**
- What: scripts that evolve from pictures to symbols.
- How: generate glyphs procedurally from strokes. Early glyphs are pictures of real species and objects in the sim. Over time they simplify into abstract script.
- You see: in-world text on signs, maps and documents, with a "Rosetta" toggle that translates to English.
- Done when: early and late glyphs for the same word are visibly related.

**E24. Religions**
- What: belief systems founded on real events.
- How: a religion has a founding event, deities or principles based on what the founders experienced (the comet, the volcano, an eclipse, your god tools), holy sites, rituals and taboos (a sacred animal species can't be hunted, which changes its survival). Religions spread, split into sects and fight.
- You see: a religion map overlay, temples, pilgrim routes.
- Done when: a religion's taboo measurably protects a species.

**E25. The Observer Faith**
- What: civilizations notice you.
- How: every god-tool use is a recorded "miracle." Heavy intervention leads to a religion centered on the Observer. Its scripture records your actions as they interpreted them, often wrongly.
- You see: a "Scripture" document generated in their voice, and temples facing the camera.
- Done when: the scripture lists real interventions with in-world interpretations.

**E26. Art Movements**
- What: generated paintings and art styles.
- How: a procedural 2D art engine paints real scenes from the sim (hunts, battles, rulers, the comet) in era styles: cave painting, flat iconic, perspective realism, impressionist-style brushwork, abstract. Styles spread and react against each other.
- You see: an in-world museum and a gallery panel.
- Done when: a painting of a real event exists for every era.

**E27. Music of the World**
- What: each culture has its own music.
- How: instruments come from body plans and materials (bone flutes, shell drums, glass harmonicas). Scales and rhythms are generated per culture and change over eras. Uses Tone.js.
- You see and hear: music playing in cities when you zoom in, changing with the era.
- Done when: two cultures sound clearly different.

**E28. Myths From Fossils**
- What: civilizations dig up the bones of species you watched go extinct.
- How: fossils found during mining or farming become myths (dragons, giants, sea serpents). Later scientists correctly identify them.
- You see: myth entries linked to the real extinct species, and museum displays.
- Done when: a myth links back to an actual species in the tree of life.

**E29. Their Map of the World**
- What: each civilization has its own, imperfect map.
- How: map knowledge grows through exploration. Unexplored areas are blank or invented. Real giant sea creatures they encountered appear as monsters drawn in the margins.
- You see: a toggle that switches between the true world and "the world as [nation] believes it to be," drawn in their map style.
- Done when: early maps are visibly wrong and improve over eras.

**E30. Holidays and Festivals**
- What: recurring celebrations tied to real cycles.
- How: festivals mark the comet return, eclipses, seasons and victories. Cities light up differently on those days.
- You see: special light patterns on the night side on festival nights.
- Done when: a festival is visible from orbit and linked to its origin event.

---

## SECTION 4: CONFLICT, POWER AND ECONOMY

**E31. Resources and Trade Goods**
- What: real economies based on geography.
- How: each region produces goods (grain, timber, ore, salt, dyes from local plants, glass, spices from local species). Scarcity creates value. Merchants follow profit.
- You see: trade routes colored by goods.
- Done when: a resource discovery shifts trade routes in a recorded way.

**E32. Markets and Crashes**
- What: booms, bubbles and crashes.
- How: prices respond to supply and demand. Speculation on rare goods can create bubbles that pop, causing recessions and unrest.
- You see: a price chart per good, and "panic" events in the chronicle.
- Done when: a market crash causes measurable instability.

**E33. Wars With Campaigns**
- What: wars fought as campaigns, not dice rolls.
- How: armies are units with size, tech, morale and supply. They march along roads, besiege cities and fight battles resolved by terrain, tech and leadership.
- You see: from orbit, armies as moving clusters of light. Up close, battles on the ground.
- Done when: a war can be followed battle by battle on the history map.

**E34. Diplomacy**
- What: treaties, alliances, betrayals.
- How: nations have relationships shaped by trade, religion, past wars and royal marriages. Treaties can be broken, and that is remembered for generations.
- You see: a diplomacy web of nations with colored relationship lines.
- Done when: a betrayal leads to a war decades later, linked in the cause graph.

**E35. Ideologies**
- What: political ideas with invented names.
- How: ideologies form from conditions (inequality, technology, religion) and spread. They can start revolutions and change governments.
- You see: an ideology overlay and revolution events.
- Done when: a revolution changes a nation's government type and flag.

**E36. Colonization and Independence**
- What: empires overseas, and their breakup.
- How: nations with ships and high population settle distant lands. Colonies develop their own identity over time and may break away.
- You see: new nations born from colonies, with mixed culture and a new flag.
- Done when: an independence war happens in a long run.

**E37. Plague Years**
- What: pandemics shaped by trade and cities.
- How: diseases evolve in the microbe layer (E83), jump to people, and travel along trade routes. Mortality reshapes economies and religions.
- You see: dark regions spreading on the night side, and quarantine walls.
- Done when: a plague's path matches the trade network.

**E38. Arms Races**
- What: rival nations push each other's tech forward.
- How: war or tension between peers speeds up military tech and gives a small boost to related civilian tech.
- You see: tech discovery bursts during wars.
- Done when: war measurably speeds up tech in tests.

**E39. Spies and Secrets**
- What: hidden events the public record doesn't know.
- How: assassinations, stolen technology and secret treaties go in the cause graph marked as hidden. The public record (E54) shows a different story.
- You see: "Truth" mode reveals hidden events with a different color.
- Done when: at least one hidden event changes the course of history in a long run.

**E40. World Wars**
- What: conflicts that pull in most of the planet.
- How: alliances chain together. If enough great powers join, it becomes a world war with huge tech jumps, destruction and new borders afterward.
- You see: the whole night side flickering, then a reshaped map.
- Done when: a world war, if it happens, produces a postwar order with new institutions.

---

## SECTION 5: IN-PERSON VIEWS

**E41. Citizen Mode**
- What: become any ordinary person.
- How: pick a spot in a city. A citizen is generated from settlement stats (name, family, job, beliefs, home). They follow a daily routine: home, work, market, temple, tavern-equivalent. Individuals are only fully simulated near the camera.
- You see: third-person or first-person view walking the streets with them, with their thoughts shown as short lines ("Bread is expensive since the floods.").
- Done when: you can follow one citizen through a full day.

**E42. Life Stories**
- What: every followed person has a biography.
- How: their life ties to real events (born in the plague year, lost a sibling in the war, apprenticed to a famous inventor). It's generated from history logs.
- You see: a life story card, updated as they live.
- Done when: a biography references at least 3 real events.

**E43. Street-Level Cities**
- What: walk through any city at any era.
- How: generate street detail from the city's data: buildings, markets with goods matching trade, signs in the local script, crowds, animals, carts or vehicles of the era.
- You see: busy, era-specific streets at ground level.
- Done when: the same street looks clearly different in two different eras.

**E44. Free Explorer**
- What: walk or fly anywhere in first person.
- How: WASD and mouse, or on-screen joysticks on mobile. Creatures and people react to you if the Observer is "visible" (a toggle).
- You see: the planet from ground level, anywhere, at any time.
- Done when: you can walk from a city into a forest without loading screens.

**E45. Anchor View**
- What: watch one spot across all of history.
- How: drop an anchor anywhere and scrub time. The view rebuilds from the per-cell history log: sea, then forest, then village, then city, then ruins, then forest again.
- You see: a fixed camera showing millions of years in seconds.
- Done when: an anchor scrub shows at least 5 distinct states of one place.

**E46. Eyewitness Cam**
- What: automatic ground-level views of big events.
- How: when an eruption, impact or battle happens, spawn a witness (a creature or citizen nearby) and offer a picture-in-picture from their view.
- You see: the meteor coming down as seen by someone standing in a field.
- Done when: every major event offers an eyewitness view.

**E47. Night Sky From the Ground**
- What: the real sky above any point.
- How: render the actual moon phase, rings, comets, constellations, auroras and satellites from the surface position and time.
- You see: the sky the in-world astronomers are looking at.
- Done when: a comet visible in the chronicle is visible from the ground at the right time.

**E48. Walk Into the Museum**
- What: museums the civilization builds.
- How: once a nation reaches a certain era, it builds a museum. Inside: fossils of real extinct species, paintings (E26), artifacts from fallen nations, maps (E29).
- You see: a walkable museum interior with labels in the local script (Rosetta toggle).
- Done when: the museum exhibits link to real things in the sim.

**E49. Battlefield View**
- What: be on the ground during a battle.
- How: spawn individual soldiers from army stats near the camera, with era-appropriate weapons and formations.
- You see: the battle from the ground, with the result matching the campaign sim.
- Done when: ground battles match the outcome on the history map.

**E50. Through Their Eyes**
- What: see like a species sees.
- How: each species' vision depends on its genes: color range, sight distance, echolocation, heat or electric sense. A post-process filter reproduces it.
- You see: the world in ultraviolet, in echolocation ripples or in heat shimmer.
- Done when: three species with different senses give three clearly different views.

---

## SECTION 6: TIME AND HISTORY TOOLS

**E51. The Chronoscope**
- What: view any place at any moment in the past.
- How: rebuild the state of any region for any year from snapshots and the per-cell logs. You can freely move the camera in that past moment.
- You see: a time dial. Turning it rewinds the selected region while the rest of the planet stays in the present.
- Done when: any city can be viewed at its founding.

**E52. The Archive**
- What: an auto-generated encyclopedia.
- How: an article for every species, nation, person, war, religion, invention, language and place, cross-linked, written by templates from sim data, with infoboxes and images captured from the renderer.
- You see: a wiki-style browser inside the app.
- Done when: every entity has an article with working links.

**E53. Historical Atlas**
- What: animated maps of history.
- How: a map for every century showing borders, routes, wars, religions and languages. Play it as an animation.
- You see: a map playback showing empires spread and break apart.
- Done when: the atlas plays a full run's history smoothly.

**E54. Truth vs Record**
- What: what really happened versus what historians wrote.
- How: in-world historians write accounts with bias toward their nation, religion and ruler. Some events are forgotten, some exaggerated, some made up. The true cause graph stays available.
- You see: a split view: on the left, the true history; on the right, their history book.
- Done when: at least one major event is recorded very differently by two nations.

**E55. Counterfactual Engine**
- What: "What if?"
- How: pick any past event and remove or change it (cancel the meteor, save a ruler, stop a plague). Fork from the nearest snapshot and run the alternate history in a second worker.
- You see: two planets side by side, with a list of what's different.
- Done when: undoing one major event produces a visibly different world.

**E56. Butterfly Tracker**
- What: watch a small change spread.
- How: after a fork, track how the difference spreads across cells and entities over time.
- You see: a heat map of divergence spreading across the planet.
- Done when: a tiny change (one creature saved) shows a spreading difference.

**E57. Ancestry to the Sea**
- What: trace any person's ancestry back to the first life.
- How: combine family lines, species lineages and the tree of life into one chain.
- You see: a scrolling line from a modern citizen back through ancestors, ancient species and the first sea creature, with key moments marked.
- Done when: any citizen's chain reaches the first life form.

**E58. The Braid**
- What: all of history in one picture.
- How: every nation is a lane on a timeline, and lanes split, merge, end and restart, like a subway map of history.
- You see: a scrollable braid with events as stations.
- Done when: the braid matches the atlas and the archive.

**E59. Documentary Maker**
- What: an automatic film of the planet's story.
- How: choose a length (1, 3 or 10 minutes). The system picks the most important events from the cause graph, plans camera shots, writes narration, picks music and renders a video (WebCodecs).
- You see: a playable and downloadable documentary.
- Done when: a 3-minute documentary covers life's beginning to the present with no dead time.

**E60. Prophecies**
- What: in-world prophets make predictions.
- How: predictions are generated from current trends ("the sky will fall again," "the river city will burn"). Track which come true.
- You see: a prophecy list with outcomes, and civilizations reacting when one comes true.
- Done when: some prophecies come true by chance and affect religion.

---

## SECTION 7: INDUSTRY TO THE NEAR FUTURE

**E61. Industrial Revolution**
- What: factories, smoke, railways.
- How: fuel comes from real coal deposits made from ancient swamp forests you watched grow. Smog forms over cities, acid rain hits forests, rails spread in time-lapse.
- You see: industrial haze from orbit, rail lines growing, smokestacks up close.
- Done when: the info card on a coal field names the ancient forest it came from.

**E62. Fossil Fuels From Your History**
- What: their energy comes from creatures you saw live.
- How: oil fields come from ancient sea life. The archive links each field to the era it formed in.
- You see: "This oil formed from the plankton seas of 41 million years ago."
- Done when: every fuel deposit links to its origin era.

**E63. Electrification**
- What: night lights change from fire to electric.
- How: power plants and grids spread across the network. Light color shifts and brightens.
- You see: a nation's night lights switching from amber to bright, city by city.
- Done when: the switch is visible in time-lapse.

**E64. Climate Change They Cause**
- What: their emissions warm the planet.
- How: the atmosphere system takes their emissions. Ice caps shrink, coasts flood, species migrate. They may respond.
- You see: rising seas eating coastal cities over decades.
- Done when: emissions measurably change global temperature.

**E65. The Radio Bubble**
- What: their signals leave the planet.
- How: from the first broadcast, a sphere expands at light speed. Zoom out to see it growing into the star system.
- You see: a faint expanding shell, labeled with the first message.
- Done when: the bubble size matches time since first broadcast.

**E66. Information Age**
- What: networks, data, cables.
- How: undersea cables, data centers and satellite networks are built. Data flow is visible as pulses along cables.
- You see: glowing undersea lines in cross-section, data pulses on the night side.
- Done when: the network connects all major cities.

**E67. Space Age**
- What: launches and orbit.
- How: launch sites near the equator, rockets with visible trails, satellites in orbit. Debris builds up and can cascade, making orbit unusable for a while.
- You see: launches from orbit and from the ground, and a ring of debris if it cascades.
- Done when: a debris cascade, if it happens, delays further launches.

**E68. Moon Bases**
- What: settlements on the moon.
- How: lights appear on the moon's dark side, then mining scars.
- You see: a lit moon at night.
- Done when: a lunar settlement shows up in the archive and on the moon.

**E69. Global Institutions**
- What: world councils, treaties, shared projects.
- How: after big wars or crises, nations may form a world body that changes how wars and climate are handled.
- You see: a world council entity with members and decisions.
- Done when: an institution changes a real outcome.

**E70. Asteroid Defense**
- What: they can fight back against your meteors.
- How: high-tech civilizations build tracking and deflection. Your god-tool meteor may get detected and pushed off course.
- You see: interceptor launches and a deflected meteor streaking past.
- Done when: a high-tech civilization deflects at least one meteor in tests.

---

## SECTION 8: BEYOND THE 21ST CENTURY

**E71. Space Elevators and Orbital Rings**
- What: megastructures linking ground and orbit.
- How: tethers from equatorial cities to stations, later a full orbital ring.
- You see: thin glowing lines rising from the planet, then a ring around it.
- Done when: the ring is visible from space and casts a thin shadow.

**E72. Arcologies and Sea Cities**
- What: giant self-contained cities.
- How: built in response to climate or crowding, on land, in oceans or under ice.
- You see: huge single structures with internal light.
- Done when: an arcology appears in a high-tech run.

**E73. Engineered Life**
- What: designed species.
- How: civilizations create new species with an "engineered" mark in the tree of life. Some escape and go feral, and evolve on their own.
- You see: odd new branches growing out of nowhere in the tree of life.
- Done when: an engineered species escapes and evolves further.

**E74. De-extinction**
- What: bringing back species you watched die.
- How: from fossils (E28), civilizations revive extinct species, with mixed results.
- You see: an extinct species reappearing in the tree with a resurrection marker.
- Done when: a revived species lives in the wild.

**E75. Uplift**
- What: a civilization raises another species to intelligence.
- How: picks a social species and boosts it. The uplifted species gets its own culture.
- You see: a second intelligent lineage with an "uplifted" origin.
- Done when: the uplifted species founds its own settlement.

**E76. Machine Minds**
- What: artificial intelligence as a new kind of life.
- How: a non-biological branch in the tree of life. Machine civilizations have their own architecture, energy needs and goals.
- You see: data center lights growing, then machine cities.
- Done when: machine minds appear as a lineage with their own history.

**E77. Upload and the Quiet Planet**
- What: a civilization moves into computers.
- How: population moves into data centers. Cities empty, nature returns, but the planet hums with energy use.
- You see: physical cities going dark while data centers blaze.
- Done when: the transition is visible and recorded.

**E78. Terraforming and Geoengineering**
- What: they try to fix or remake the planet.
- How: sun shades, atmospheric seeding, ocean fertilization, melting ice caps on purpose. Can backfire (recorded in the cause graph).
- You see: orbital mirrors, colored skies, glaciers retreating or growing.
- Done when: a geoengineering project changes the climate, sometimes badly.

**E79. Far-Future Endings**
- What: multiple possible destinies.
- How: endings depend on history: a planet-wide city, a rewilded world with a small civilization, a nanotech accident spreading silver across continents, departure to the stars, a slow collapse into the next dark age, or transcendence (lights vanish, monuments remain).
- You see: each ending has its own visual signature from orbit.
- Done when: five seeds produce at least three different endings.

**E80. Star Swarm**
- What: harvesting the star.
- How: a civilization builds solar collectors around the star. The sky dims slightly over centuries.
- You see: glittering arcs around the sun.
- Done when: the swarm grows and affects planetary light.

---

## SECTION 9: STRANGE WORLD SYSTEMS

**E81. Deep-Time Strata**
- What: rock layers that record history.
- How: every event leaves a layer: ash from eruptions, a metal-rich line from meteors, coal from swamps, plastic-equivalent from industry. Their geologists later find and read them.
- You see: banded strata in the cross-section, with each band linked to its event.
- Done when: a meteor layer exists worldwide after a big impact.

**E82. Magnetic Pole Flips**
- What: the magnetic field reverses.
- How: it happens on a long random cycle. Auroras shift, migrating animals get lost, early navigators get confused, and a weak field during the flip raises radiation and mutation rates.
- You see: auroras wandering across the globe during the flip.
- Done when: a flip causes recorded migration failures.

**E83. Microbe Layer**
- What: a microscopic world you can zoom into.
- How: a simplified microbial sim per cell. Diseases originate here, and microbes affect soil and the atmosphere.
- You see: a microscope mode with drifting cells and colonies.
- Done when: a disease's origin traces back to the microbe layer.

**E84. Continental Hive Mind**
- What: a colony organism spanning a continent.
- How: a social insect or fungal lineage can network together and grow an intelligence of its own, with no cities but huge structures and coordinated pulses of light.
- You see: rhythmic light pulses across a continent at night.
- Done when: a hive mind can cross the intelligence threshold in rare seeds.

**E85. Trance Blooms**
- What: plants that change behaviour.
- How: some plants evolve compounds that make creatures act strangely (calm, wandering, gathering in groups). Civilizations build rituals around them.
- You see: creatures behaving oddly near glowing flower fields, and temples built beside them.
- Done when: a religion forms around a trance bloom region.

**E86. Light and Noise Pollution**
- What: civilization disturbs nature.
- How: city light confuses nocturnal and glowing species. Noise from industry drives away creatures that rely on sound.
- You see: biodiversity holes around cities in the overlays.
- Done when: a species declines because of light pollution.

**E87. Mimic Architects**
- What: animals that copy buildings.
- How: after civilization collapses, some species start building nests shaped like the ruins around them.
- You see: animal nests that look like tiny towers.
- Done when: a mimic species appears after a collapse.

**E88. Predictable Catastrophe**
- What: a long cycle disaster that civilizations learn to predict.
- How: a recurring event (a comet storm, a supervolcano on a cycle). Early cultures turn it into myth, later ones into science, and the most advanced prepare for it.
- You see: preparation events in the chronicle as the cycle approaches.
- Done when: a civilization survives a cycle because it predicted it.

**E89. Ecological Memory**
- What: the planet remembers damage.
- How: overused land degrades for centuries. Extinct keystone species leave gaps that change ecosystems long after. Healing takes time.
- You see: scars on the land that slowly heal.
- Done when: degraded land takes centuries to recover in tests.

**E90. The Planet's Pulse**
- What: one global signal of the world's state.
- How: a combined index of biodiversity, stability, climate and population turned into a heartbeat sound and a pulsing glow.
- You see and hear: a calm slow pulse in good times, a fast one in crisis.
- Done when: the pulse reacts to every major global event.

---

## SECTION 10: OUT OF THIS WORLD

**E91. The Star System**
- What: zoom out to the whole system.
- How: other planets orbit the star: a barren rocky neighbor, a gas giant whose gravity sends comets inward, an icy world. Simple physics for orbits.
- You see: the full system with Genesis as one planet among several.
- Done when: comet timing on Genesis ties to the gas giant's orbit.

**E92. Panspermia**
- What: life spreads to a neighbor.
- How: a big impact can throw rocks carrying microbes to a neighbor planet, which then runs a simplified evolution sim.
- You see: a second, faint biosphere starting on the neighbor.
- Done when: the neighbor develops life after a recorded impact.

**E93. Rogue Planet Flyby**
- What: a wandering planet passes through the system.
- How: rare event. Gravity disturbs orbits, tides go wild, comets rain inward.
- You see: a dark world crossing the sky, then chaos.
- Done when: a flyby measurably changes the climate or orbit.

**E94. Gamma-Ray Burst**
- What: a distant cosmic explosion.
- How: very rare. Strips the ozone on one hemisphere, causing a mass extinction there.
- You see: a flash on one side of the planet and its effects spreading.
- Done when: a burst causes a hemisphere-specific extinction.

**E95. Red Giant**
- What: the star grows old.
- How: in the very far future the star swells. Oceans boil. Civilizations must leave or die.
- You see: the sun filling the sky, the planet browning.
- Done when: a long run reaches this phase.

**E96. Departure Fleets**
- What: civilizations leave for other stars.
- How: generation ships or probes depart. Track them on a star map as they travel.
- You see: lights leaving the system on the map.
- Done when: a departure is tracked on the star map.

**E97. Messages From Beyond**
- What: replies from probes.
- How: decades after launch, a probe sends back a report about another world, which is a thumbnail and summary generated from a different seed.
- You see: an incoming transmission with an image of an unknown world.
- Done when: the report shows a real different seed.

**E98. Neighbor Link**
- What: two planets that know about each other.
- How: paste another planet's seed code as a "neighbor." The two simulations exchange simple signals (light, radio, probes). Civilizations in each can detect the other.
- You see: a second planet in the sky and first-contact events.
- Done when: two linked seeds record contact with each other.

**E99. Messages to the Observer**
- What: civilizations talk to you.
- How: a civilization in the Observer Faith or a high-tech one arranges city lights, giant ground art or orbital structures into a message for you.
- You see: glyphs written across the night side in lights, with a Rosetta translation.
- Done when: a message appears and relates to your real past interventions.

**E100. The Last Archive**
- What: what remains when everything ends.
- How: before a civilization ends, it leaves an archive (a vault, an orbital monument or a buried record). Future species, or the user, can find and open it, which reveals that civilization's history in their own words.
- You see: a discoverable vault whose contents come from the archive (E52) and their record (E54).
- Done when: a later species finds the archive of an earlier one.

---

## PROCESS
1. Build the architecture additions, then sections 1 to 10 in order.
2. After each section, run the headless tests across 5 seeds for a full history, check stability and performance, and fix problems before moving on.
3. Take screenshots of each section's visible features and add them to `/docs/screenshots/expansion/`.
4. Commit and push after each working system with messages like `exp(E45): anchor view with history scrubbing`. Update PROGRESS.md in the same commit.
5. At the end, add an "Expansion" section to the README with a tour of the best systems.

## DONE WHEN
- A user can watch a civilization rise from campfires through an invented industrial age into a strange far future, in one run.
- Any place can be seen at any time in its history, from orbit or at street level.
- Every person, place and event can be traced through the cause graph, the archive and the true-vs-recorded history.
- Five seeds produce five different civilizations, five different histories and at least three different endings.
