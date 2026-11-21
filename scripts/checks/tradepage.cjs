// The trade map (system E31): five made-up countries on a fresh world, each selling something to another.
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
    for (let c = 0; c < elev.length; c += 9) { const [u, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && elev[c] < sea + 0.7 && Math.abs(v - 0.5) < 0.3 && land.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.12)) land.push(c); }
    const caps = land.slice(0, 5);
    const goods = ['ore', 'timber', 'glass', 'grain', 'spice'];
    const towns = caps.map((cell, i) => ({ id: i, name: 'T' + i, cell, species: 0, pop: 200, tech: 0.6, founded: now - 500, lore: -1, eventId: -1, ruined: -1, nation: i }));
    const realms = caps.map((_, i) => ({ id: i, name: ['Kekaka', 'Farahot', 'Gekonro', 'Mokro', 'Nalemat'][i], species: 0, capital: i, founded: now - 900, ended: -1, parent: -1, government: 'kingdom', stability: 0.7, tech: 0.6, era: 4, eraName: 'Age of Sails', eraOwn: '', earth: '', hue: i / 5, pop: 300, towns: 1, culture: 'x', language: 'x', ruler: '', rulerSince: -1, house: '', houseReigns: 0, houseId: -1, networks: [], cultureId: 0, fashionFrom: -1, fashionShare: 0, golden: '', goldenSince: -1, goldenWorks: 0, trade: { good: goods[i], to: (i + 1) % caps.length, toName: '', since: now - 50, eventId: -1 } }));
    g.update({ hintStep: 9, panel: 'map', settlements: towns, realms, mapOf: -2 });
  });
  await h.page.waitForTimeout(2500);
  await h.page.mouse.move(40, 600);
  await h.page.screenshot({ path: `${out}/e31-trade-map.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log(await h.page.evaluate(() => __genesis.state.mapNote));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
