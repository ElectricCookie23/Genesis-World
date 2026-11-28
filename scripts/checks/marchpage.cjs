// Armies on the march (system E33, second pass) in the page: a streak of light is started between two places on a
// fresh world, should be drawn while it lasts and gone a few seconds later, with nothing in the console.
// Usage: node marchpage.cjs <out dir>
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [900, 600]);
  await h.page.waitForTimeout(9000);
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(0); });
  await h.page.waitForTimeout(2000);
  const spot = await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene, elev = sc.planet.elevation, sea = g.state.stats.seaLevel;
    const land = [];
    for (let c = 0; c < elev.length; c += 9) { const [u, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.05 && Math.abs(v - 0.5) < 0.3 && land.every((o) => Math.hypot(g.actions.mapPoint(o)[0] - u, g.actions.mapPoint(o)[1] - v) > 0.06)) land.push(c); }
    return { a: land[0], b: land[1], uv: g.actions.mapPoint(land[0]) };
  });
  await h.view(spot.uv[0] * Math.PI * 2 - Math.PI, (0.5 - spot.uv[1]) * Math.PI, 1.6, 0.5, 0);
  const start = () => h.page.evaluate(({ a, b }) => {
    const g = __genesis, sc = g.scene;
    const at = (cell) => { const [u, v] = g.actions.mapPoint(cell); const lon = u * Math.PI * 2 - Math.PI, lat = (0.5 - v) * Math.PI; return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]; };
    sc.marchArmy(at(a), at(b), 800);
    return sc.marchesShown;
  }, spot);
  const during = await start();
  await h.page.screenshot({ path: `${out}/e33-march.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  await h.page.waitForTimeout(6000);
  // (a frame must be drawn after the march is over for it to be cleared away)
  const after = await h.page.evaluate(() => __genesis.scene.marchesShown);
  console.log('marches drawn: just started', during, ', six seconds later', after, during === 1 && after === 0 ? 'AS EXPECTED' : 'NOT AS EXPECTED');
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n') || 'console clean');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
