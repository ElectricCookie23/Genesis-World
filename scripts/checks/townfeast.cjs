// A made-up town of a made-up country on a fresh world, on an ordinary night and then keeping each kind of festival
// (system E30): from close by its windows should burn brighter and in the festival's colour, or hardly at all on the
// night of no lamps. Prints the mean brightness of the picture each way and takes the pictures. Nothing should be in
// the console.
// Usage: node townfeast.cjs <out dir>
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [900, 600]);
  await h.page.waitForTimeout(9000);
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(0); });
  await h.page.waitForTimeout(2500);
  const town = await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel;
    let cell = -1;
    for (let c = 0; c < elev.length && cell < 0; c += 7) { const [, v] = g.actions.mapPoint(c); if (elev[c] > sea + 0.25 && elev[c] < sea + 1.2 && Math.abs(v - 0.5) < 0.2) cell = c; }
    const year = Math.max(g.state.stats.simYear, sc.simYearShown);
    const st = { id: 1, name: 'Testopolis', cell, species: 0, pop: 900, tech: 0.7, founded: year - 900, lore: -1, eventId: -1, ruined: -1, nation: 5, farms: true, monuments: 1, walls: [300, 0.6] };
    sc.setSettlements([st], []);
    g.state.settlements = [st];
    return { cell, uv: g.actions.mapPoint(cell) };
  });
  const lon = town.uv[0] * Math.PI * 2 - Math.PI, lat = (0.5 - town.uv[1]) * Math.PI;
  await h.view(lon, lat, 0.02, 0.5, 0.2);
  const feasts = { none: null, lanterns: { glow: 1.9, spread: 2.4, flicker: 0, dark: 0, colour: [0.45, 1, 0.56] }, bonfires: { glow: 1.6, spread: 2.8, flicker: 0.8, dark: 0, colour: [1.0, 0.26, 0.04] }, 'lights-out': { glow: 0.12, spread: 1, flicker: 0, dark: 1, colour: null } };
  for (const [name, feast] of Object.entries(feasts)) {
    await h.page.evaluate((f) => { __genesis.scene.towns.setFeasts(new Map(f ? [[5, f]] : [])); }, feast);
    await new Promise((r) => setTimeout(r, 5000));
    const n = await h.page.evaluate(() => { const t = __genesis.scene.towns; const of = (k) => (t.slots.get(k) ? t.slots.get(k).n : -1); return { house: of('house'), hall: of('hall'), tower: of('tower') }; });
    console.log(name.padEnd(11), JSON.stringify(n));
    await h.page.screenshot({ path: `${out}/e30-town-${name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  }
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n') || 'console clean');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
