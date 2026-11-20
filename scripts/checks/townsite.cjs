// A made-up town on a fresh world: watch its building sites at 1x, with pictures and the info card.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [720, 460]);
  await h.page.waitForTimeout(9000);
  const town = await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel;
    let cell = -1;
    for (let c = 0; c < elev.length && cell < 0; c += 7) { const [u, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.25 && elev[c] < sea + 1.2 && Math.abs(v - 0.5) < 0.2) cell = c; }
    const st = { id: 1, name: 'Testopolis', cell, species: 0, pop: 600, tech: 1.0, founded: 0, belief: -1, eventId: -1, ruined: -1, nation: -1, temple: true, farms: true, monuments: 2, walls: [40, 0.5, 300, 0.9] };
    sc.setSettlements([st], []);
    g.state.settlements = [st];
    return { cell, uv: g.actions.mapPoint(cell) };
  });
  const lon = town.uv[0] * Math.PI * 2 - Math.PI, lat = (0.5 - town.uv[1]) * Math.PI;
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(1); });
  await h.view(lon, lat, 0.016, 0.5, 0.35);
  const sites = () => h.page.evaluate(() => JSON.stringify(__genesis.scene.construction(1).map((j) => `${j.what}: ${j.stage} ${(j.progress * 100).toFixed(0)}% of ${j.years} y`)));
  for (let k = 1; k <= 1; k++) {
    await new Promise((r) => setTimeout(r, k === 1 ? 8000 : 20000));
    console.log('after', k === 1 ? 8 : 8 + (k - 1) * 20, 's at 1x:', await sites());
    await h.page.screenshot({ path: `${out}/e12-site${k}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  }
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: false, panel: 'peoples', settlements: g.state.settlements }); });
  await h.page.mouse.move(300, 200);
  await new Promise((r) => setTimeout(r, 5000));
  await h.page.screenshot({ path: `${out}/e12-card.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('card text:', await h.page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => /^Building /.test(d.textContent || '') && d.children.length <= 4).map((d) => d.textContent).slice(0, 4).join(' | ')));
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n'));
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
