// A fire seen burning (system E20, second pass): a made-up town on a fresh world with a fire a year old. Told the
// fire is burning, its burnt quarter should be drawn standing and in flames for a few seconds, then as the black
// stumps the fire leaves, with nothing in the console. Prints how many towns are in flames before, during and
// after, how bright the middle of the picture is each time, and takes the pictures.
// Usage: node townburning.cjs <out dir>
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
    const now = Math.max(g.state.stats.simYear, sc.simYearShown);
    // scars as the page receives them: year, kind (0 fire), share, how rebuilt, cell it came from
    const st = { id: 1, name: 'Testopolis', cell, species: 0, pop: 600, peak: 600, tech: 0.6, founded: now - 900, lore: -1, eventId: -1, ruined: -1, nation: -1, farms: true, monuments: 0, scars: [now - 1, 0, 0.5, 1, -1] };
    sc.setSettlements([st], []);
    g.state.settlements = [st];
    return { cell, uv: g.actions.mapPoint(cell) };
  });
  const lon = town.uv[0] * Math.PI * 2 - Math.PI, lat = (0.5 - town.uv[1]) * Math.PI;
  // (by night, so that the only light in the picture is the town's own)
  await h.view(lon, lat, 0.016, Math.PI, 0.3);
  await h.page.waitForTimeout(5000);
  const bright = async (name) => {
    const file = `${out}/e20-${name}.png`;
    await h.page.screenshot({ path: file, timeout: 120000 });
    return h.page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(img.width * 0.2, img.height * 0.2, img.width * 0.6, img.height * 0.6).data; let red = 0, blue = 0;
      for (let i = 0; i < d.length; i += 4) { red += d[i]; blue += d[i + 2]; }
      return { red: Math.round(red / (d.length / 4)), blue: Math.round(blue / (d.length / 4)) };
    }, require('fs').readFileSync(file).toString('base64'));
  };
  const count = () => h.page.evaluate(() => __genesis.scene.towns.ablaze);
  const before = { ablaze: await count(), ...(await bright('before')) };
  await h.page.evaluate((cell) => __genesis.scene.towns.burn(cell, 40), town.cell);
  await h.page.waitForTimeout(6000);
  const during = { ablaze: await count(), ...(await bright('burning')) };
  await h.page.evaluate((cell) => __genesis.scene.towns.burn(cell, 0), town.cell);
  await h.page.waitForTimeout(6000);
  const after = { ablaze: await count(), ...(await bright('after')) };
  console.log('before', JSON.stringify(before), 'burning', JSON.stringify(during), 'after', JSON.stringify(after));
  console.log(during.ablaze === 1 && before.ablaze === 0 && after.ablaze === 0 && during.red > before.red + 3 && during.red > after.red + 3 ? 'SEEN BURNING, THEN OUT' : 'NOT AS EXPECTED');
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n') || 'console clean');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
