// Made-up towns with every kind of wonder (system E19), on a fresh world: a picture of each town from close by,
// and one from high up to see that the wonders show from there.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [720, 460]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1500);
  const towns = await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel, now = g.state.stats.simYear;
    const cells = [];
    for (let c = 0; c < elev.length && cells.length < 5; c += 11) {
      const [u, v] = g.actions.mapPoint(c);
      if (elev[c] > sea + 0.25 && elev[c] < sea + 0.9 && Math.abs(v - 0.5) < 0.2 && cells.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.05)) cells.push(c);
    }
    const kinds = ['observatory', 'sungate', 'crater-temple', 'first-tower', 'tomb', 'victory', 'lighthouse', 'memorial', 'colossus', 'peace-hall'];
    let id = 1;
    const list = cells.map((cell, i) => ({
      id: 10 + i, name: 'town' + i, cell, species: 0, pop: 300, peak: 300, tech: 0.75, founded: now - 2000, belief: -1, eventId: -1, ruined: i === 4 ? now - 2400 : -1, nation: -1, temple: false, farms: true, monuments: 0,
      // (the last pair is half built; the fifth town is a ruin twenty-four centuries old: the town is mounds, its wonders stand)
      wonders: [kinds[i * 2], kinds[i * 2 + 1]].map((kind, k) => ({ id: id++, kind, name: kind, what: kind, why: '', builder: 'them', year: now - (i === 3 && k === 1 ? 40 : i === 4 ? 2600 : 900), done: now - (i === 3 && k === 1 ? -40 : i === 4 ? 2500 : 800), eventId: -1, cause: -1, causeTitle: '', toward: kind === 'crater-temple' ? cells[(i + 1) % cells.length] : -1, bearing: kind === 'observatory' ? 0.6 : NaN })),
    }));
    sc.setSettlements(list, []);
    return list.map((t) => ({ name: t.name, uv: g.actions.mapPoint(t.cell), kinds: t.wonders.map((w) => w.kind).join('+') }));
  });
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(0); });
  const count = () => h.page.evaluate(() => { const s = __genesis.scene.towns.slots; return ['observatory', 'sungate', 'ziggurat', 'greatspire', 'pyramid', 'column', 'beacon', 'obelisk', 'colossus', 'greatdome', 'house', 'tower', 'crane'].map((k) => k + ' ' + s.get(k).mesh.count).join(', '); });
  for (const t of towns.filter((x) => !process.argv[3] || process.argv[3].includes(x.name.slice(-1)))) {
    await h.view(t.uv[0] * Math.PI * 2 - Math.PI, (0.5 - t.uv[1]) * Math.PI, 0.03, 0.5, 0.5);
    await new Promise((r) => setTimeout(r, 9000));
    await h.page.screenshot({ path: `${out}/e19-${t.name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
    console.log(t.name, t.kinds, '|', await count());
  }
  const t = towns[2];
  await h.view(t.uv[0] * Math.PI * 2 - Math.PI, (0.5 - t.uv[1]) * Math.PI, 1.3, 0.5, 0);
  await new Promise((r) => setTimeout(r, 7000));
  await h.page.screenshot({ path: `${out}/e19-high.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('high', await count());
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n'));
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
