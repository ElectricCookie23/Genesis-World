// The arms race in a nation's panel (system E38): a made-up country whose discoveries come in bursts during its
// two arms races, shown as bars by quarter-century with the races banded in red.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 760]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  await h.page.evaluate(() => {
    const g = __genesis, now = g.state.stats.simYear;
    const fields = ['craft', 'mind', 'food', 'trade', 'build', 'sea'];
    const tech = [];
    // quiet years: one thing a generation; the two races (540 to 480 and 150 years ago to now): several, many of them arms
    const add = (ago, field) => tech.push({ slot: 's' + tech.length, field, level: 0.5, era: 4, state: 1, name: field === 'war' ? 'matchlock guns' : 'a thing learned', own: 'Kubanat', year: now - ago, key: false });
    for (const ago of [590, 440, 400, 330, 290, 230, 190]) add(ago, fields[tech.length % fields.length]);
    for (const ago of [536, 530, 522, 515, 505, 498, 487]) add(ago, tech.length % 2 ? 'war' : 'craft');
    for (const ago of [146, 140, 133, 128, 118, 110, 101, 96, 84, 77, 66, 52, 44, 30, 21, 9]) add(ago, tech.length % 5 < 2 ? 'war' : fields[tech.length % fields.length]);
    const realm = { id: 0, name: 'Kekaka', species: 0, capital: 0, founded: now - 900, ended: -1, parent: -1, government: 'kingdom', stability: 0.7, tech: 0.7, era: 4, eraName: 'Age of Sails', eraOwn: 'Dodamokro', earth: '', hue: 0.1, pop: 300, towns: 4, culture: 'Mokro', language: 'Mokro', ruler: '', rulerSince: -1, house: '', houseReigns: 0, houseId: -1, networks: [], cultureId: 0, fashionFrom: -1, fashionShare: 0, golden: '', goldenSince: -1, goldenWorks: 0,
      race: { with: 1, withName: 'Farahot', since: now - 150, pressed: 0.8, found: 16, arms: 6, eventId: -1 } };
    g.update({ hintStep: 9, panel: 'nation', realms: [realm], nationDetail: { id: 0, name: 'Kekaka', land: ['ore', 'coast', 'river'], species: 0, people: [], tech, rulers: [], houses: [], races: [{ with: 'Gekonro', began: now - 540, ended: now - 480, eventId: -1 }, { with: 'Farahot', began: now - 150, ended: -1, eventId: -1 }] } });
  });
  await h.page.waitForTimeout(1500);
  await h.page.mouse.move(40, 720);
  await h.page.screenshot({ path: `${out}/e38-arms-race.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
