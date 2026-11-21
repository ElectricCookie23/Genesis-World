// The colonies map (system E36): made-up countries on a fresh world, one holding two colonies, one fighting
// to be free of its mother country, one long since a country.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 640]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel, now = g.state.stats.simYear;
    const land = [];
    for (let c = 0; c < elev.length; c += 7) { const [u, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && elev[c] < sea + 0.7 && Math.abs(v - 0.5) < 0.32 && land.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.11)) land.push(c); }
    const towns = land.slice(0, 8).map((cell, i) => ({ id: i, name: 'T' + i, cell, species: 0, pop: 200, tech: 0.7, founded: now - 500, lore: -1, eventId: -1, ruined: -1, nation: [0, 1, 0, 0, 2, 3, 1, 1][i] }));
    const extra = [
      { capital: 0, colonies: [{ id: 0, seat: 2, name: 'T2', founded: now - 220, towns: 2, identity: 0.9, note: '', eventId: -1 }, { id: 1, seat: 3, name: 'T3', founded: now - 60, towns: 1, identity: 0.15, note: '', eventId: -1 }] },
      { capital: 1 },
      { capital: 4, colonyOf: { mother: 1, motherName: 'Farahot', founded: now - 400, declared: now - 180, freed: now - 176, warEvent: -1 } },
      { capital: 5, colonyOf: { mother: 0, motherName: 'Kekaka', founded: now - 300, declared: now - 2, freed: -1, warEvent: -1 } },
    ];
    const realms = extra.map((x, i) => ({ id: i, name: ['Kekaka', 'Farahot', 'Gekonro', 'Mokro'][i], species: 0, founded: now - 900, ended: -1, parent: -1, government: 'kingdom', stability: 0.7, tech: 0.7, era: 5, eraName: 'Age of Presses', eraOwn: '', earth: '', hue: i / 4, pop: 300, towns: 2, culture: 'x', language: 'x', ruler: '', rulerSince: -1, house: '', houseReigns: 0, houseId: -1, networks: [], cultureId: 0, fashionFrom: -1, fashionShare: 0, golden: '', goldenSince: -1, goldenWorks: 0, ...x }));
    g.update({ hintStep: 9, panel: 'map', settlements: towns, realms, mapOf: -5 });
  });
  await h.page.waitForTimeout(2500);
  await h.page.mouse.move(40, 600);
  await h.page.screenshot({ path: `${out}/e36-colonies-map.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log(await h.page.evaluate(() => __genesis.state.mapNote));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
