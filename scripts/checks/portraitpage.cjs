// The portraits (system E6), after the owner's rule that nothing human-looking is drawn: twelve people of one
// made-up country, in the manners of four ages. Each should be a head and neck of the species' own kind, with
// nothing worn, and no two alike.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 900]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  await h.page.evaluate((variant) => {
    const g = __genesis, now = g.state.stats.simYear;
    // a body of its own: a long muzzle, a crest, horns, good hearing
    let x = 12345 + variant * 977;
    const r = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
    const genes = new Float32Array(64).map(() => r());
    g.state.species.set(900, { id: 900, name: 'Testus pictus', genes, metres: 1.4, land: 1, fly: 0, pop: 1000, bornYear: 0, extinctYear: -1, parent: -1 });
    const roles = ['ruler', 'founder', 'general', 'scholar', 'inventor', 'artist', 'explorer', 'teller', 'reformer', 'consort', 'claimant', 'ruler'];
    const people = roles.map((role, i) => ({ id: 40 + i * 7, name: ['Lakra', 'Mabpa', 'Tame', 'Noge', 'Thoeim', 'Khakh', 'Mula', 'Dala', 'Vata', 'Kubma', 'Lalug', 'Hhumat'][i], role, born: now - 300 + i * 20, died: now - 250 + i * 20, fate: 'died old', bold: (i * 37 % 10) / 10, wise: 0.5, cruel: (i * 53 % 10) / 10, open: 0.5, era: [2, 2, 2, 4, 4, 4, 6, 6, 6, 8, 8, 8][i], patron: '', rival: '', house: '', houseId: -1, deed: '', eventId: -1 }));
    const realm = { id: 0, name: 'Kekaka', species: 900, capital: 0, founded: now - 900, ended: -1, parent: -1, government: 'kingdom', stability: 0.7, tech: 0.7, era: 4, eraName: 'Age of Sails', eraOwn: 'Dodamokro', earth: '', hue: 0.1, pop: 300, towns: 4, culture: 'Mokro', language: 'Mokro', ruler: '', rulerSince: -1, house: '', houseReigns: 0, houseId: -1, networks: [], cultureId: 0, fashionFrom: -1, fashionShare: 0, golden: '', goldenSince: -1, goldenWorks: 0 };
    g.update({ hintStep: 9, panel: 'nation', realms: [realm], nationDetail: { id: 0, name: 'Kekaka', land: ['coast'], species: 900, people, tech: [], rulers: [], houses: [], races: [] } });
  }, Number(process.argv[3] || 0));
  await h.page.waitForTimeout(1500);
  await h.page.mouse.move(40, 860);
  await h.page.screenshot({ path: `${out}/portraits-${process.argv[3] || 0}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
