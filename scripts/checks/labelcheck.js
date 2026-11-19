// Night Map labels: made-up settlements close together, overlay on, page screenshot of the DOM labels.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 650 } });
  const errs = new Set();
  p.on('console', (m) => { if (m.type() === 'error') errs.add(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errs.add('[pageerror] ' + String(e).slice(0, 300)));
  await p.goto('http://localhost:5199/?seed=amber-reef-101&skip&fresh&webgl&noadapt&dsize=64&esize=64&eiter=20', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet && window.__genesis.state.stats, null, { timeout: 300000 });
  const info = await p.evaluate(async () => {
    const g = window.__genesis, sc = g.scene; g.setSpeed(0); sc.daySpeed = 0; sc.cam.autoOrbit = 0;
    const c = sc.vegetationCells(); const grid = sc.grid; const land = [];
    for (let i = 0; i < c.elevation.length && land.length < 4000; i++) if (c.elevation[i] > c.seaLevel + 0.05) land.push(i);
    // a cluster of capitals close together, plus a few scattered ones (one near the limb)
    const start = land[Math.floor(land.length / 2)]; const near = [start];
    for (let k = 0; k < grid.ncount[start] && near.length < 6; k++) { const nb = grid.neighbors[start * 6 + k]; if (c.elevation[nb] > c.seaLevel) { near.push(nb); for (let j = 0; j < grid.ncount[nb] && near.length < 9; j++) { const n2 = grid.neighbors[nb * 6 + j]; if (!near.includes(n2) && c.elevation[n2] > c.seaLevel) near.push(n2); } } }
    const far = [land[10], land[Math.floor(land.length * 0.9)], land[Math.floor(land.length * 0.25)]];
    const cells = [...near, ...far];
    const list = cells.map((cell, i) => ({ id: i + 1, name: ['Zohan', 'Soutan', 'Siamivo', 'Kreth', 'Aluma', 'Vendros', 'Ithaia', 'Morrow', 'Quell', 'Tarn', 'Oske', 'Phael'][i % 12], cell, species: 1000 + i, pop: 40 + i * 37, tech: 0.75, founded: 1e6 + i, belief: -1, eventId: -1, ruined: -1 }));
    sc.applyCells = () => {}; sc.applyStats = () => {};
    g.update({ settlements: list }); sc.setSettlements(list);
    sc.civ.update(sc.lastCells, new Map(), performance.now(), 0.05, true);
    if (sc.onNations) sc.onNations(sc.civ.nations);
    g.actions.setOverlay('nations');
    const P = grid.pos; const lon = Math.atan2(P[start * 3 + 2], P[start * 3]), lat = Math.asin(P[start * 3 + 1]);
    for (let i = 0; i < 6; i++) { sc.cam.setImmediate(lon, lat, 1.6); sc.dayAngle = lon + 2.9; sc.frame(0.25); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 600));
    const labels = [...document.querySelectorAll('div')].filter((d) => d.style && d.style.fontFamily && d.style.fontFamily.includes('Cormorant') && d.style.transform.includes('translate'));
    const shown = labels.filter((d) => Number(d.style.opacity) > 0.05).map((d) => { const r = d.getBoundingClientRect(); return { t: d.textContent, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
    let overlaps = 0; for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) { const a = shown[i], q = shown[j]; if (a.x < q.x + q.w && a.x + a.w > q.x && a.y < q.y + q.h && a.y + a.h > q.y) overlaps++; }
    return { nations: g.state.nations.length, labels: labels.length, shown: shown.length, overlaps, names: shown.map((s) => s.t) };
  });
  console.log(JSON.stringify(info));
  await p.screenshot({ path: 'labels.png' });
  for (const e of errs) console.log('ERR', e);
  await b.close().catch(() => {});
})();
