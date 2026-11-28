// A made-up town on a fresh world, first as a town that grew and then as one planted as a colony (system E36):
// the planted one should be drawn on ruled streets, with nothing in the console. Prints what is drawn each way
// and takes a picture of each from above.
// Usage: node townplanted.cjs <out dir>
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [900, 600]);
  await h.page.waitForTimeout(9000);
  // (time is stopped before the year is read: the page starts at 30,000 years a second)
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(0); });
  await h.page.waitForTimeout(2500);
  const town = await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel;
    let cell = -1;
    for (let c = 0; c < elev.length && cell < 0; c += 7) { const [, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.25 && elev[c] < sea + 1.2 && Math.abs(v - 0.5) < 0.2) cell = c; }
    return { cell, uv: g.actions.mapPoint(cell), year: Math.max(g.state.stats.simYear, sc.simYearShown) };
  });
  const lon = town.uv[0] * Math.PI * 2 - Math.PI, lat = (0.5 - town.uv[1]) * Math.PI;
  for (const planted of [false, true]) {
    await h.page.evaluate(({ cell, year, planted }) => {
      const g = __genesis;
      const st = { id: 1, name: 'Testopolis', cell, species: 0, pop: 900, tech: 0.7, founded: year - 900, lore: -1, eventId: -1, ruined: -1, nation: -1, farms: true, monuments: 2, walls: [300, 0.6], planted: planted || undefined };
      g.scene.setSettlements([st], []);
      g.state.settlements = [st];
    }, { cell: town.cell, year: town.year, planted });
    await h.view(lon, lat, 0.03, 0.5, 0.05);
    await new Promise((r) => setTimeout(r, 6000));
    const n = await h.page.evaluate(() => { const t = __genesis.scene.towns; const of = (k) => (t.slots.get(k) ? t.slots.get(k).n : -1); return { road: of('road'), wall: of('wall'), gate: of('gate'), house: of('house'), hall: of('hall'), tower: of('tower') }; });
    console.log(planted ? 'planted:' : 'grown:', JSON.stringify(n));
    await h.page.screenshot({ path: `${out}/e36-town-${planted ? 'planted' : 'grown'}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  }
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n') || 'console clean');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
