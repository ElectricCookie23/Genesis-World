// The plague map (system E37): a made-up plague on a fresh world, carried from town to town over the ways trade travels.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 760]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel, now = g.state.stats.simYear;
    const land = [];
    for (let c = 0; c < elev.length; c += 5) { const [u, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && elev[c] < sea + 0.7 && Math.abs(v - 0.5) < 0.32 && land.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.045)) land.push(c); }
    const cells = land.slice(0, 16);
    const towns = cells.map((cell, i) => ({ id: i, name: ['Thutath', 'Levak', 'Ma', 'Nalemat', 'Agayab', 'Mi', 'Kuab', 'Pepoyow', 'Chono', 'Wonono', 'Uda', 'Nub', 'Lepet', 'Doda', 'Bum', 'Lela'][i], cell, species: 0, pop: 200, tech: 0.7, founded: now - 500, lore: -1, eventId: -1, ruined: -1, nation: 0 }));
    // the ways of trade: a chain of made roads, two branches, and one sea route
    const ways = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [3, 8], [8, 9], [10, 11], [11, 12]].map(([a, b]) => ({ a: cells[a], b: cells[b], via: 'road' })).concat([{ a: cells[4], b: cells[10], via: 'sea' }]);
    const step = (i, from, year, via, dead, shut) => ({ cell: cells[i], from: from < 0 ? -1 : cells[from], town: towns[i].name, year: now - 40 + year, via, dead, shut, eventId: -1 });
    const steps = [step(0, -1, 0, 'origin', 0.5, false), step(1, 0, 1, 'road', 0.3, false), step(2, 1, 2, 'road', 0.28, false), step(5, 1, 2, 'road', 0.33, false), step(3, 2, 3, 'road', 0.12, true), step(6, 5, 4, 'road', 0.3, false), step(13, 5, 4, 'foot', 0.25, false), step(4, 3, 5, 'road', 0.14, true), step(8, 3, 5, 'road', 0.27, false), step(10, 4, 7, 'sea', 0.3, false), step(11, 10, 8, 'road', 0.24, false), step(9, 8, 7, 'road', 0.2, false)];
    g.update({ hintStep: 9, panel: 'map', settlements: towns, realms: [], mapOf: -6, plagues: [{ id: 1, name: 'the Red Fever', own: 'Gubalak', began: now - 40, ended: now - 31, eventId: -1, text: 'the Red Fever ran for 9 years and reached 12 of 16 towns; about 26 in a hundred died where it came. 91 in a hundred of the towns it reached, it reached along a way that trade travels.', steps }], plagueWays: ways, plagueShown: 1 });
  });
  await h.page.waitForTimeout(2500);
  await h.page.mouse.move(40, 720);
  await h.page.screenshot({ path: `${out}/e37-plague-map.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
