// Made-up ruins of two ages (system E18), on a fresh world: one picture each.
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
    for (let c = 0; c < elev.length && cells.length < 2; c += 11) {
      const [u, v] = g.actions.mapPoint(c);
      if (elev[c] > sea + 0.25 && elev[c] < sea + 0.9 && Math.abs(v - 0.5) < 0.18 && cells.every((o) => Math.abs(g.actions.mapPoint(o)[0] - u) > 0.08)) cells.push(c);
    }
    const ages = [90, 900];
    const list = cells.map((cell, i) => ({ id: 10 + i, name: 'ruin' + ages[i], cell, species: 0, pop: 0.01, peak: 400, tech: 0.95, founded: 0, lore: -1, eventId: -1, ruined: now - ages[i], nation: -1, farms: true, monuments: 1, walls: [40, 0.5, 300, 0.9] }));
    sc.setSettlements(list, []);
    return list.map((t) => ({ name: t.name, uv: g.actions.mapPoint(t.cell) }));
  });
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(0); });
  for (const t of towns) {
    await h.view(t.uv[0] * Math.PI * 2 - Math.PI, (0.5 - t.uv[1]) * Math.PI, 0.016, 0.5, 0.35);
    await new Promise((r) => setTimeout(r, 9000));
    await h.page.screenshot({ path: `${out}/e18-${t.name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
    console.log(t.name, await h.page.evaluate(() => { const s = __genesis.scene.towns.slots; return ['house', 'tower', 'dome', 'road', 'wall'].map((k) => k + ' ' + s.get(k).n).join(', '); }));
  }
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n'));
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
