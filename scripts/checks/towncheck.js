// Made-up settlements of three sizes on a coast; day and night frames from low and from the ground.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || 'town';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 456 } });
  const errs = new Set();
  p.on('console', (m) => { if (m.type() === 'error') errs.add(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.add('[pageerror] ' + String(e).slice(0, 300)));
  await p.goto('http://localhost:5199/?seed=amber-reef-101&skip&fresh&webgl&noadapt&dsize=128&esize=128&eiter=60', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet && window.__genesis.state.stats, null, { timeout: 300000 });
  const spot = await p.evaluate(async () => {
    const g = window.__genesis, sc = g.scene; g.setSpeed(0); sc.daySpeed = 0; sc.cam.autoOrbit = 0; g.update({ uiHidden: true, hintStep: 9 });
    const c = sc.vegetationCells(); const grid = sc.grid;
    // a coastal land cell: land with a sea neighbour, not snowy
    let cell = -1;
    for (let i = 0; i < c.elevation.length && cell < 0; i++) { if (c.elevation[i] < c.seaLevel + 0.05 || c.elevation[i] > c.seaLevel + 0.8 || c.snow[i] > 0.05) continue; for (let k = 0; k < grid.ncount[i]; k++) if (c.elevation[grid.neighbors[i * 6 + k]] < c.seaLevel) { cell = i; break; } }
    const nb = grid.neighbors[cell * 6]; const nb2 = grid.neighbors[cell * 6 + 2];
    const list = [
      { id: 1, name: 'Zohan', cell, species: 1, pop: 500, tech: 1.0, founded: 1e6, belief: -1, eventId: -1, ruined: -1 },
      { id: 2, name: 'Small', cell: nb2, species: 1, pop: 4, tech: 1.0, founded: 2e6, belief: -1, eventId: -1, ruined: -1 },
    ];
    sc.applyCells = () => {}; sc.applyStats = () => {};
    g.update({ settlements: list }); sc.setSettlements(list);
    const P = grid.pos; return { lon: Math.atan2(P[cell * 3 + 2], P[cell * 3]), lat: Math.asin(P[cell * 3 + 1]), lon2: Math.atan2(P[nb2 * 3 + 2], P[nb2 * 3]), lat2: Math.asin(P[nb2 * 3 + 1]) };
  });
  const shot = async (name, lon, lat, dist, off, tilt) => {
    const r = await p.evaluate(async ([lon, lat, dist, off, tilt]) => {
      const g = window.__genesis, sc = g.scene; sc.cam.tiltOffset = sc.cam.tTilt = tilt;
      for (let i = 0; i < 18; i++) { sc.cam.setImmediate(lon, lat, dist); sc.dayAngle = lon + off; sc.frame(0.25); await new Promise((r) => setTimeout(r, 60)); }
      let n = 0; if (sc.towns && sc.towns.meshes) for (const m of sc.towns.meshes) n += m.count;
      return { url: g.grab(), buildings: n, lum: sc.post.measured };
    }, [lon, lat, dist, off, tilt]);
    fs.writeFileSync(`${out}-${name}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(name, 'buildings', r.buildings, 'luminance', r.lum.toFixed(3));
  };
  await shot('big-day-low', spot.lon, spot.lat, 0.06, 0.5, -0.4);
  await shot('big-day-ground', spot.lon, spot.lat, 0.02, 0.5, -0.5);
  await shot('big-night-low', spot.lon, spot.lat, 0.08, 2.8, -0.3);
  await shot('big-night-ground', spot.lon, spot.lat, 0.02, 2.8, -0.5);
  await shot('small-day-ground', spot.lon2, spot.lat2, 0.02, 0.5, -0.5);
  for (const e of errs) console.log('ERR', e);
  await b.close().catch(() => {});
})();
