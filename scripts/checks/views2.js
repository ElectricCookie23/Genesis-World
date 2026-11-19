// usage: node views.js prefix  -> saves terminator, orbit night, orbit day and ground night frames (software WebGL2)
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || 'v';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 456 } });
  const msgs = new Map();
  p.on('console', (m) => { if (m.type() === 'error') msgs.set(m.text().slice(0, 300), 1); });
  p.on('pageerror', (e) => msgs.set('[pageerror] ' + String(e).slice(0, 300), 1));
  await p.goto('http://localhost:5199/?seed=amber-reef-101&skip&fresh&webgl&dsize=128&esize=128&eiter=60', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet && window.__genesis.state.stats, null, { timeout: 300000 });
  const shot = async (name, lon, lat, dist, off, tilt) => {
    const r = await p.evaluate(async ([lon, lat, dist, off, tilt]) => {
      const g = window.__genesis, sc = g.scene; g.setSpeed(0); sc.daySpeed = 0; sc.cam.autoOrbit = 0; g.update({ uiHidden: true, hintStep: 9 });
      sc.cam.tiltOffset = sc.cam.tTilt = tilt;
      for (let i = 0; i < 16; i++) { sc.cam.setImmediate(lon, lat, dist); sc.dayAngle = lon + off; sc.frame(0.25); await new Promise((r) => setTimeout(r, 50)); }
      return { url: g.grab(), measured: sc.post.measured };
    }, [lon, lat, dist, off, tilt]);
    fs.writeFileSync(`${out}-${name}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(name, 'luminance', r.measured.toFixed(3));
  };
  await shot('groundday', 0.94, 0.74, 0.02, 0.5, -0.5);
  await shot('coast', 2.58, 0.62, 0.3, 0.5, 0);

  await shot('day', -1.46, 0.1, 2.6, 0.5, 0);
  await shot('groundnight', 0.94, 0.74, 0.02, 2.8, -0.5);
  for (const k of msgs.keys()) console.log('ERR', k);
  await b.close().catch(() => {});
})();
