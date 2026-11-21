// Festival nights from orbit (system E30): a made-up country of a dozen towns on the night side of a fresh world,
// on an ordinary night and on the nights of each kind of festival.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [720, 460]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  const where = await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel, now = g.state.stats.simYear;
    const land = [];
    for (let c = 0; c < elev.length; c += 5) { const [, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && elev[c] < sea + 0.7 && Math.abs(v - 0.5) < 0.2) land.push(c); }
    const first = land[60], b = g.actions.mapPoint(first);
    const near = land.filter((c) => { const a = g.actions.mapPoint(c); return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.06; }).filter((_, i) => i % 3 === 0).slice(0, 12);
    const towns = near.map((cell, i) => ({ id: i, name: 'T' + i, cell, species: 0, pop: 120 + 40 * (i % 4), tech: 0.7, founded: now - 500, lore: -1, eventId: -1, ruined: -1, nation: 0 }));
    const fest = (id, kind, light, days) => ({ id, kind, own: kind, name: kind, eventId: -1, since: now - 100, day: 0.99, every: 1, days, light });
    const realm = { id: 0, name: 'Kekaka', species: 0, capital: 0, founded: now - 900, ended: -1, parent: -1, government: 'kingdom', stability: 0.7, tech: 0.7, era: 5, eraName: 'Age of Presses', eraOwn: '', earth: '', hue: 0.6, pop: 900, towns: 12, culture: 'x', language: 'x', ruler: '', rulerSince: -1, house: '', houseReigns: 0, houseId: -1, networks: [], cultureId: 0, fashionFrom: -1, fashionShare: 0, golden: '', goldenSince: -1, goldenWorks: 0,
      festivals: [fest(1, 'founding', 'lanterns', 3), fest(2, 'harvest', 'bonfires', 5), fest(3, 'remembrance', 'lights-out', 1), fest(4, 'comet', 'floating', 365)] };
    sc.setSettlements(towns, [realm]);
    g.update({ hintStep: 9, uiHidden: true, panel: 'none', settlements: towns, realms: [realm] });
    return g.actions.mapPoint(first);
  });
  const lon = where[0] * Math.PI * 2 - Math.PI, lat = (0.5 - where[1]) * Math.PI;
  const shot = async (name) => {
    await h.view(lon, lat, 0.9, Math.PI, 0);
    await new Promise((r) => setTimeout(r, 7000));
    await h.page.screenshot({ path: `${out}/e30-${name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  };
  await shot('ordinary');
  for (const [id, name] of [[1, 'lanterns'], [2, 'bonfires'], [3, 'lights-out'], [4, 'floating']]) {
    // (show its lights without flying anywhere: the same thing the panel's button asks for)
    await h.page.evaluate((id) => { const g = __genesis; g.actions.showFestival(0, id); }, id);
    await shot(name);
  }
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
