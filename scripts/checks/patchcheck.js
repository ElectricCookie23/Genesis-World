// How close do the terrain and sea quadtrees come to their patch budget, at the review's camera spots and around the globe?
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 913 } });
  p.on('pageerror', (e) => console.log('[pageerror] ' + String(e).slice(0, 300)));
  await p.goto('http://localhost:5199/?seed=amber-reef-101&skip&fresh&webgl&noadapt&dsize=64&esize=64&eiter=20', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet && window.__genesis.state.stats, null, { timeout: 300000 });
  const r = await p.evaluate(async () => {
    const g = window.__genesis, sc = g.scene; g.setSpeed(0); sc.daySpeed = 0; sc.cam.autoOrbit = 0;
    sc.renderer.setSize(64, 40, false);
    const out = []; let worst = { t: 0 }, worstSea = { s: 0 };
    const probe = (lon, lat, dist, tilt) => {
      sc.cam.tiltOffset = sc.cam.tTilt = tilt; sc.cam.setImmediate(lon, lat, dist); sc.frame(0.05);
      const t = sc.terrain.sphere, o = sc.ocean.sphere;
      return { lon: +lon.toFixed(2), lat: +lat.toFixed(2), dist, tilt, t: t.patchCount, tmax: t.max, tdeep: t.deepest, s: o.patchCount, smax: o.max, lvl: sc.terrain.maxLevel };
    };
    out.push(probe(2.86, 0.18, 0.06, -0.35));
    out.push(probe(2.86, 0.18, 0.02, -0.5));
    for (const dist of [0.3, 0.12, 0.06, 0.03, 0.02, 0.008]) for (const tilt of [0, -0.35, -0.6]) for (let lat = -1.2; lat <= 1.2; lat += 0.4) for (let lon = -3; lon < 3; lon += 0.75) {
      const q = probe(lon, lat, dist, tilt); if (q.t > worst.t) worst = q; if (q.s > worstSea.s) worstSea = q;
    }
    return { spots: out, worst, worstSea, quality: g.state.quality };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close().catch(() => {});
})();
