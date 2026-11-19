// WebGL2 (software): orbit day view, with no strike in progress and with one, to see the surface is lit in both.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const msgs = new Map();
  p.on('console', (m) => { if (m.type() === 'error') msgs.set(m.text().slice(0, 300), 1); });
  p.on('pageerror', (e) => msgs.set('[pageerror] ' + String(e).slice(0, 300), 1));
  await p.goto('http://localhost:5199/?seed=amber-reef-101&skip&fresh&webgl&dsize=128&esize=128&eiter=60', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet && window.__genesis.state.stats, null, { timeout: 300000 });
  const shot = async (name, pre) => {
    const r = await p.evaluate(async (pre) => {
      const g = window.__genesis, sc = g.scene; g.setSpeed(0);
      sc.daySpeed = 0; sc.cam.autoOrbit = 0; g.update({ uiHidden: true, hintStep: 9 });
      if (pre === 'impact') sc.impactAt(sc.cellAt(Math.cos(0.1) * Math.cos(-1.2), Math.sin(0.1), Math.cos(0.1) * Math.sin(-1.2)));
      for (let i = 0; i < 16; i++) { sc.cam.setImmediate(-1.46, 0.1, 2.6); sc.dayAngle = -1.46 + 0.5; sc.frame(0.25); await new Promise((r) => setTimeout(r, 60)); }
      return { url: g.grab(), measured: sc.post.measured };
    }, pre);
    fs.writeFileSync(`orbit-${name}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(name, 'luminance', r.measured);
  };
  await shot('quiet', '');
  await shot('strike', 'impact');
  for (const k of msgs.keys()) console.log('ERR', k);
  await b.close().catch(() => {});
})();
