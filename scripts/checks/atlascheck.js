// Dumps the baked imposter atlas (all twelve plant forms from three angles) as a picture, to look at plant shapes without growing a world.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 456 } });
  const errs = new Set();
  p.on('console', (m) => { if (m.type() === 'error') errs.add(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.add('[pageerror] ' + String(e).slice(0, 300)));
  await p.goto('http://localhost:5199/?seed=amber-reef-101&skip&fresh&webgl&noadapt&dsize=64&esize=64&eiter=20', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.vegetation && window.__genesis.scene.vegetation.atlasData, null, { timeout: 300000 });
  const r = await p.evaluate(() => {
    const v = window.__genesis.scene.vegetation; const a = v.atlasData; const tile = v.tile; const W = tile * 12, H = tile * 3;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const img = x.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) { const s = ((H - 1 - y) * W + i) * 4, d = (y * W + i) * 4; const al = a[s + 3] / 255; const sh = a[s]; const leaf = a[s + 1] / 255;
      // shade as grey, leaves tinted green, bark brown, on a mid-grey backdrop
      img.data[d] = (sh * (leaf > 0.5 ? 0.45 : 0.75)) * al + 70 * (1 - al); img.data[d + 1] = (sh * (leaf > 0.5 ? 0.85 : 0.55)) * al + 70 * (1 - al); img.data[d + 2] = (sh * (leaf > 0.5 ? 0.5 : 0.4)) * al + 80 * (1 - al); img.data[d + 3] = 255; }
    x.putImageData(img, 0, 0);
    return { url: c.toDataURL('image/png'), tile, W, H };
  });
  fs.writeFileSync(process.argv[2] || 'atlas.png', Buffer.from(r.url.split(',')[1], 'base64'));
  console.log('tile', r.tile, r.W + 'x' + r.H);
  for (const e of errs) console.log('ERR', e);
  await b.close().catch(() => {});
})();
