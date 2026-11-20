// Made-up towns after calamities (system E20), on a fresh world: one picture each.
//   a great fire five years ago (wrecks and building sites), the same fire sixty years ago (the burned quarter now of stone),
//   an earthquake eighty years ago (rebuilt low and braced), a flood whose low ground was given up.
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
    for (let c = 0; c < elev.length && cells.length < 4; c += 11) {
      const [u, v] = g.actions.mapPoint(c);
      if (elev[c] > sea + 0.25 && elev[c] < sea + 0.9 && Math.abs(v - 0.5) < 0.2 && cells.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.05)) cells.push(c);
    }
    // scars as the page receives them: year, kind (fire, quake, flood, ash), share, how rebuilt (as before, stone, braced, raised, moved), cell it came from
    const scars = [[now - 5, 0, 0.45, 1, -1], [now - 60, 0, 0.45, 1, -1], [now - 80, 1, 0.5, 2, -1], [now - 200, 2, 0.35, 4, -1]];
    const names = ['burning', 'stone', 'braced', 'moved'];
    const list = cells.map((cell, i) => ({ id: 10 + i, name: names[i], cell, species: 0, pop: 300, peak: 300, tech: 0.5, founded: now - 900, lore: -1, eventId: -1, ruined: -1, nation: -1, farms: true, monuments: 0, scars: scars[i], codes: i === 1 ? [now - 60, -1, -1] : undefined }));
    sc.setSettlements(list, []);
    return list.map((t) => ({ name: t.name, uv: g.actions.mapPoint(t.cell) }));
  });
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(0); });
  for (const t of towns.filter((x) => !process.argv[3] || process.argv[3].split(',').includes(x.name))) {
    await h.view(t.uv[0] * Math.PI * 2 - Math.PI, (0.5 - t.uv[1]) * Math.PI, Number(process.argv[4] || 0.026), 0.5, 0.45);
    await new Promise((r) => setTimeout(r, 9000));
    await h.page.screenshot({ path: `${out}/e20-${t.name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
    console.log(t.name, await h.page.evaluate(() => { const s = __genesis.scene.towns.slots; return ['house', 'hall', 'tower', 'scaffold', 'hoist'].map((k) => k + ' ' + s.get(k).mesh.count).join(', ') + ' | sites ' + JSON.stringify([...__genesis.scene.towns.sites.values()].flat().slice(0, 2)); }));
  }
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n'));
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
