// The ideas map (system E35): six made-up countries on a fresh world, some governed by an idea their people
// rose for, some with one gaining ground.
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
    for (let c = 0; c < elev.length; c += 5) { const [u, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && elev[c] < sea + 0.7 && Math.abs(v - 0.5) < 0.32 && land.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.05)) land.push(c); }
    const towns = land.slice(0, 18).map((cell, i) => ({ id: i, name: 'T' + i, cell, species: 0, pop: 200, tech: 0.7, founded: now - 500, lore: -1, eventId: -1, ruined: -1, nation: i % 6 }));
    const idea = (kind, name, own, share) => ({ kind, name, own, share, eventId: -1 });
    const creed = (kind, name, own) => ({ kind, name, own, since: now - 80 });
    const extra = [
      { government: 'republic', creed: creed('levelling', 'the Common Land', 'Falab'), flag: 1 },
      { government: 'kingdom', idea: idea('commons', 'the Open Road', 'Dodamokro', 0.55) },
      { government: 'council of merchants', creed: creed('commons', 'the Open Road', 'Dodamokro'), idea: idea('reason', 'the Clear Sight', 'Nakfimi', 0.2), flag: 1 },
      { government: 'kingdom', idea: idea('order', 'the Strong Hand', 'Nakat', 0.8) },
      { government: 'the old law', creed: creed('custom', 'the Old Law', 'Kubanat'), flag: 2 },
      { government: 'kingdom' },
    ];
    const realms = extra.map((x, i) => ({ id: i, name: ['Kekaka', 'Farahot', 'Gekonro', 'Mokro', 'Nalemat', 'Gikaniii'][i], species: 0, capital: i, founded: now - 900, ended: -1, parent: -1, stability: 0.7, tech: 0.7, era: 5, eraName: 'Age of Presses', eraOwn: '', earth: '', hue: i / 6, pop: 300, towns: 3, culture: 'x', language: 'x', ruler: '', rulerSince: -1, house: '', houseReigns: 0, houseId: -1, networks: [], cultureId: 0, fashionFrom: -1, fashionShare: 0, golden: '', goldenSince: -1, goldenWorks: 0, ...x }));
    g.update({ hintStep: 9, panel: 'map', settlements: towns, realms, mapOf: -4 });
  });
  await h.page.waitForTimeout(2500);
  await h.page.mouse.move(40, 600);
  await h.page.screenshot({ path: `${out}/e35-ideas-map.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log(await h.page.evaluate(() => __genesis.state.mapNote));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
