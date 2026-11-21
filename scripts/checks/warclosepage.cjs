// The same as warpage.cjs with the towns close together, as they are in a full-size world: the war is shown in a close-up box.
// A war on the map, battle by battle (system E33): one made-up war of six meetings on a fresh world, with the camp fires of its army on the night side.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 700]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel, now = g.state.stats.simYear;
    const land = [];
    for (let c = 0; c < elev.length; c += 5) { const [u, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && elev[c] < sea + 0.7 && Math.abs(v - 0.5) < 0.25 && land.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.012)) land.push(c); }
    const first = land[30], b0 = g.actions.mapPoint(first);
    const near = land.map((c) => ({ c, d: Math.hypot(g.actions.mapPoint(c)[0] - b0[0], g.actions.mapPoint(c)[1] - b0[1]) })).sort((x, y) => x.d - y.d).slice(0, 5).map((x) => x.c);
    const towns = near.map((cell, i) => ({ id: i, name: ['Ka', 'Linika', 'Na', 'Iiki', 'Likadapat'][i], cell, species: 0, pop: 200, tech: 0.6, founded: now - 500, lore: -1, eventId: -1, ruined: -1, nation: i === 0 ? 0 : 1 }));
    const realm = (id, name, capital) => ({ id, name, species: 0, capital, founded: now - 900, ended: -1, parent: -1, government: 'kingdom', stability: 0.7, tech: 0.6, era: 4, eraName: 'Age of Sails', eraOwn: '', earth: '', hue: id * 0.5, pop: 600, towns: 2, culture: 'x', language: 'x', ruler: '', rulerSince: -1, house: '', houseReigns: 0, houseId: -1, networks: [], cultureId: id, fashionFrom: -1, fashionShare: 0, golden: '', goldenSince: -1, goldenWorks: 0 });
    const battle = (i, town, kind, winner, taken, text) => ({ year: now - 6 + i, cell: towns[town].cell, town: towns[town].name, kind, winner, sizes: [20 - i, 8 - i], decided: 'numbers', taken, eventId: -1, text });
    const war = { id: 1, attacker: 'Gikaniii', defender: 'Gikadapat', year: now - 6, ended: now, outcome: 'attacker', eventId: -1, peaceEvent: -1, battles: [
      battle(0, 3, 'raid', 0, false, 'Gikaniii fell on Iiki with 20,000, and Gikaniii had the day: surprise decided it.'),
      battle(1, 1, 'field', 0, false, 'Gikaniii (19,000) met Gikadapat (7,000) in the field before Linika, and Gikaniii had the day: numbers decided it.'),
      battle(2, 1, 'storm', 1, false, 'Gikaniii stormed Linika with 18,000 against 6,000 on the walls, and Gikadapat had the day: the walls decided it.'),
      battle(3, 1, 'storm', 0, true, 'Gikaniii stormed Linika with 16,000 against 4,000 on the walls, and Gikaniii had the day: numbers decided it. Linika changed hands.'),
      battle(4, 2, 'storm', 0, true, 'Gikaniii stormed Na with 15,000 against 2,000 on the walls, and Gikaniii had the day: numbers decided it. Na changed hands.'),
      battle(5, 4, 'siege', 0, true, 'Gikaniii sat down before the walls of Likadapat with 15,000, and Likadapat opened its gates: full wagons decided it. Likadapat changed hands.'),
    ] };
    sc.setSettlements(towns, [realm(0, 'Gikaniii', 0), realm(1, 'Gikadapat', 4)]);
    sc.civ.setCamps([{ cell: towns[2].cell, size: 15 }]);
    g.update({ hintStep: 9, panel: 'map', settlements: towns, realms: [realm(0, 'Gikaniii', 0), realm(1, 'Gikadapat', 4)], wars: [war], warShown: 1, mapOf: -3 });
  });
  await h.page.waitForTimeout(2500);
  await h.page.mouse.move(40, 660);
  await h.page.screenshot({ path: `${out}/e33-war-close.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
