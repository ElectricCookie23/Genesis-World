// WebGL2 (software): save a planet to a slot, reload from the slot, compare brightness and uniforms.
const { chromium } = require('playwright');
const fs = require('fs');
const PORT = process.env.PORT || 5199;
const WARP = Number(process.env.WARP || 0);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 400 } });
  const p = await ctx.newPage();
  const msgs = new Map();
  p.on('console', (m) => { if (m.type() === 'error') msgs.set(m.text().slice(0, 200), 1); });
  p.on('pageerror', (e) => msgs.set('[pageerror] ' + String(e).slice(0, 200), 1));
  const ready = () => p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet && window.__genesis.state.stats, null, { timeout: 300000 });
  const probe = async (name) => {
    const r = await p.evaluate(async () => {
      const g = window.__genesis, sc = g.scene;
      sc.daySpeed = 0; sc.cam.autoOrbit = 0; g.update({ uiHidden: true, hintStep: 9 });
      for (let i = 0; i < 14; i++) { sc.cam.setImmediate(1.6, -0.8, 0.5); sc.dayAngle = 1.6 + 0.5; sc.frame(0.25); await new Promise((r) => setTimeout(r, 60)); }
      const u = (k) => { try { const v = sc.constructor && null; } catch (e) {} return null; };
      return { url: g.grab(), measured: sc.post && sc.post.measured, simYear: g.state.stats.simYear, speed: g.state.speedIndex, slots: g.state.slots.length };
    });
    fs.writeFileSync(`slot-${name}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(name, JSON.stringify({ measured: r.measured, simYear: r.simYear, speed: r.speed, slots: r.slots }));
  };
  const q = 'seed=amber-reef-101&skip&webgl&dsize=128&esize=128&eiter=60';
  await p.goto(`http://localhost:${PORT}/?${q}&fresh`, { timeout: 120000 }); await ready();
  if (WARP) {
    await p.evaluate((y) => { const g = window.__genesis; g.scene.renderer.setSize(64, 40, false); g.send({ type: 'warp', years: y }); }, WARP);
    await p.waitForFunction((y) => window.__genesis.state.stats.simYear > y * 0.97, WARP, { timeout: 1500000, polling: 5000 });
    await p.evaluate(() => { window.__genesis.setSpeed(0); window.__genesis.scene.resize(); });
  }
  await probe('before');
  const saved = await p.evaluate(async () => {
    window.__genesis.actions.saveSlot('t');
    const has = () => new Promise((res) => { const o = indexedDB.open('keyval-store'); o.onsuccess = () => { const rq = o.result.transaction('keyval').objectStore('keyval').getAllKeys(); rq.onsuccess = () => res(rq.result.includes('genesis:slot:0') && rq.result.includes('genesis:slots')); }; });
    for (let i = 0; i < 60; i++) { if (await has()) return i; await new Promise((r) => setTimeout(r, 1000)); }
    return -1;
  });
  console.log('saved after s:', saved);
  await p.goto(`http://localhost:${PORT}/?${q}&slot=0`, { timeout: 120000 }); await ready();
  await p.waitForTimeout(6000);
  await probe('after-load');
  for (const k of msgs.keys()) console.log('ERR', k);
  await b.close().catch(() => {});
})();
