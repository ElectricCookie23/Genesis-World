// Their map of the world (system E29): the map panel for one made-up country at three stages of knowledge
// (a people with boats, a people with sails and a compass, a people in orbit), on a fresh world.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 640]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  const stages = [
    ['boats', { reach: 0.05, sea: 0.05, skill: 0 }],
    ['sails', { reach: 0.08, sea: 0.32, skill: 0.42 }],
    ['clocks', { reach: 0.17, sea: 0.9, skill: 0.8 }],
    ['orbit', { reach: 4, sea: 4, skill: 1 }],
  ];
  for (const [name, charting] of stages) {
    await h.page.evaluate(({ charting }) => {
      const g = __genesis, sc = g.scene;
      const elev = sc.planet.elevation, sea = g.state.stats.seaLevel, now = g.state.stats.simYear;
      // six towns of our own on a coast, four of a neighbour further along it
      const land = [];
      for (let c = 0; c < elev.length && land.length < 400; c += 7) { const [, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && elev[c] < sea + 0.6 && Math.abs(v - 0.5) < 0.22) land.push(c); }
      const first = land[40], near = land.filter((c) => { const a = g.actions.mapPoint(c), b = g.actions.mapPoint(first); return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05; }).slice(0, 6);
      const other = land.filter((c) => { const a = g.actions.mapPoint(c), b = g.actions.mapPoint(first); const d = Math.hypot(a[0] - b[0], a[1] - b[1]); return d > 0.07 && d < 0.12; }).slice(0, 4);
      const town = (id, cell, nation) => ({ id, name: 'T' + id, cell, species: 0, pop: 50, tech: 0.5, founded: now - 500, lore: -1, eventId: -1, ruined: -1, nation });
      const towns = [...near.map((c, i) => town(i, c, 0)), ...other.map((c, i) => town(20 + i, c, 1))];
      const realm = (id, name, capital, extra) => ({ id, name, species: 0, capital, founded: now - 900, ended: -1, parent: -1, government: 'kingdom', stability: 0.7, tech: 0.5, era: 4, eraName: 'Age of Sails', eraOwn: '', earth: '', hue: 0.1, pop: 300, towns: 6, culture: 'x', language: 'x', ruler: '', rulerSince: -1, house: '', houseReigns: 0, houseId: -1, networks: [], cultureId: 0, fashionFrom: -1, fashionShare: 0, golden: '', goldenSince: -1, goldenWorks: 0, ...extra });
      // (second pass: the map-makers write; their own name goes under the title in their signs, and their neighbour's beside its chief town)
      const script = { id: 3, parent: -1, parentName: '', name: 'the Kekaka signs', born: g.state.stats.simYear - 600, from: 0, hand: 1, body: { legs: 2, neck: 0.4, horn: 0.2, wings: 0, tail: 0.5 }, about: '' };
      g.update({ hintStep: 9, panel: 'map', settlements: towns, realms: [realm(0, 'Kekaka', 0, { charting, contacts: [1], script, signs: ['river', 'great', 'hold'], monsters: [{ species: 1, name: 'Neoaus ingens', cell: land[0], size: 0.8 }] }), realm(1, 'Farahot', 20, { charting, contacts: [0], signs: ['sun', 'stone'] })], mapOf: 0 });
    }, { charting });
    await h.page.waitForTimeout(2500);
    await h.page.mouse.move(40, 600);
    await h.page.screenshot({ path: `${out}/e29-${name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
    console.log(name, await h.page.evaluate(() => __genesis.state.mapNote));
  }
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
