// The great wars on the map (system E40): a made-up world war on a fresh world, its two sides town by town, the
// seat of the peace, and what the peace set up.
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
    for (let c = 0; c < elev.length; c += 5) { const [u, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && elev[c] < sea + 0.7 && Math.abs(v - 0.5) < 0.32 && land.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.04)) land.push(c); }
    const cells = land.slice(0, 24);
    const towns = cells.map((cell, i) => ({ id: i, name: 'T' + i, cell, species: 0, pop: 200, tech: 0.9, founded: now - 500, lore: -1, eventId: -1, ruined: -1, nation: i % 6 }));
    const side = (ids) => ({ names: ids.map((i) => ['Falmale', 'Falyamaf', 'Vazmeme', 'Falkoab', 'Farpa', 'Fawafe'][i]), cells: towns.filter((t) => ids.includes(t.nation)).map((t) => t.cell) });
    const inst = (kind, name, own) => ({ kind, name, own, cell: cells[3], eventId: -1 });
    g.update({ hintStep: 9, panel: 'map', settlements: towns, realms: [], mapOf: -7, greatShown: 1, greatWars: [{ id: 1, name: 'the Great War', own: 'Nakfimi', began: now - 46, ended: now - 43, world: true, eventId: -1, endEvent: -1,
      text: 'Falmale, Falyamaf and Vazmeme against Falkoab, Farpa and Fawafe: 9 wars in 3 years, and 4 towns under a new flag at the end of it. Falkoab, Farpa and Fawafe had the better of it.',
      sides: [side([0, 1, 2]), side([3, 4, 5])], taken: [0, 7, 14].map((i) => ({ cell: cells[i], town: 'T' + i })), institutions: [inst('league', 'the League of Nawema', 'Ampa'), inst('court', 'the Court of Nawema', 'Dhimat'), inst('fund', 'the Common Fund of Nawema', 'Nakfimi')], holds: true }] });
  });
  await h.page.waitForTimeout(2500);
  await h.page.mouse.move(40, 720);
  await h.page.screenshot({ path: `${out}/e40-great-war.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
