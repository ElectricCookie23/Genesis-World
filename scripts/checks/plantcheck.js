// WebGL2 (software): grow the world until there are plants, then save ground-level frames in the densest forest.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || 'plants';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const msgs = new Map();
  const log = (k) => msgs.set(k, (msgs.get(k) || 0) + 1);
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  p.on('pageerror', (e) => log(`[pageerror] ${String(e).slice(0, 300)}`));
  await p.goto('http://localhost:5202/?seed=amber-reef-101&skip&fresh&webgl&dsize=128&esize=128&eiter=60', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet, null, { timeout: 300000 });
  await p.evaluate(() => { const g = window.__genesis; g.scene.renderer.setSize(64, 40, false); g.send({ type: 'warp', years: 150e6 }); });
  const t0 = Date.now();
  for (;;) {
    await p.waitForTimeout(15000);
    const y = await p.evaluate(() => window.__genesis.state.stats.simYear).catch(() => -1);
    console.log(((Date.now() - t0) / 1000).toFixed(0) + 's simYear', (y / 1e6).toFixed(1) + ' My');
    if (y > 145e6) break;
    if (Date.now() - t0 > 28 * 60000) { console.log('warp timeout'); break; }
  }
  const info = await p.evaluate(async () => {
    const g = window.__genesis, sc = g.scene;
    g.setSpeed(0); await new Promise((r) => setTimeout(r, 3000));
    sc.resize(); sc.daySpeed = 0; sc.cam.autoOrbit = 0; g.update({ uiHidden: true, hintStep: 9 });
    const c = sc.vegetationCells();
    let spot = null, best = -1;
    for (let lat = -1.1; lat <= 1.1; lat += 0.03) for (let lon = -3.14; lon < 3.14; lon += 0.03) {
      const cl = Math.cos(lat); const cell = sc.cellAt(cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon));
      const e = c.elevation[cell] - c.seaLevel; const s = c.canopy[cell] + c.vegetation[cell];
      if (e > 0.02 && c.snow[cell] < 0.05 && s > best) { best = s; spot = [lon, lat, c.canopy[cell], c.vegetation[cell]]; }
    }
    return { backend: g.state.backend, spot, plants: g.state.plants && g.state.plants.size, species: g.state.species && g.state.species.size };
  });
  console.log(JSON.stringify(info));
  const [lon, lat] = info.spot;
  const shot = async (name, dist, tilt) => {
    const r = await p.evaluate(async ([lon, lat, dist, tilt]) => {
      const g = window.__genesis, sc = g.scene;
      sc.cam.tiltOffset = sc.cam.tTilt = tilt;
      for (let i = 0; i < 16; i++) { sc.cam.setImmediate(lon, lat, dist); sc.dayAngle = lon + 0.5; sc.frame(0.25); await new Promise((r) => setTimeout(r, 40)); }
      const fl = Object.values(sc).find((v) => v && v.full instanceof Map && v.far); let full = 0; const per = {};
      if (fl && fl.full) for (const [k, s] of fl.full) { full += s.mesh.count; if (s.mesh.count) per[k] = s.mesh.count; }
      return { url: g.grab(), full, per, far: fl && fl.far && fl.far.mesh.count, grass: fl && fl.grass && fl.grass.mesh.count };
    }, [lon, lat, dist, tilt]);
    fs.writeFileSync(`${out}-${name}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(name, JSON.stringify({ full: r.full, per: r.per, far: r.far, grass: r.grass }));
  };
  await shot('forest', 0.02, -0.5);
  await shot('forest-close', 0.008, -0.4);
  await shot('forest-mid', 0.06, -0.55);
  await shot('forest-far', 0.15, -0.3);
  for (const [k, v] of msgs) console.log(`x${v} ${k.replace(/\n/g, ' ')}`);
  await b.close().catch(() => {});
})();
