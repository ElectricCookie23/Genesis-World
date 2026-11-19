// WebGL2 (software) check: load, drop sample animals at a land spot, step frames, save a frame, list console errors.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || 'creatures';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const msgs = new Map();
  const log = (k) => msgs.set(k, (msgs.get(k) || 0) + 1);
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  p.on('pageerror', (e) => log(`[pageerror] ${String(e).slice(0, 300)}`));
  await p.goto('http://localhost:5199/?seed=amber-reef-101&skip&fresh&webgl&dsize=128&esize=128&eiter=60', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet, null, { timeout: 300000 });
  const info = await p.evaluate(async (LIMIT) => {
    const g = window.__genesis, sc = g.scene;
    g.setSpeed(0); sc.daySpeed = 0; sc.cam.autoOrbit = 0; g.update({ uiHidden: true, hintStep: 9 });
    sc.applyCells = () => {}; sc.applyStats = () => {};
    const gl = sc.renderer.backend.gl; const caps = sc.renderer.backend.capabilities;
    window.__limits = { ubo: gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE), attribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS) };
    if (LIMIT) { caps.maxUniformBlockSize = LIMIT; }

    const c = sc.vegetationCells();
    let spot = null;
    for (let lat = -0.9; lat <= 0.9 && !spot; lat += 0.05) for (let lon = -3.1; lon < 3.1; lon += 0.05) {
      const cl = Math.cos(lat); const cell = sc.cellAt(cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon));
      const e = c.elevation[cell] - c.seaLevel;
      if (e > 0.15 && e < 0.6 && c.snow[cell] < 0.05) { spot = [lon, lat, e]; break; }
    }
    return { backend: g.state.backend, spot, limits: window.__limits };
  }, Number(process.env.UBO_LIMIT || 0));
  console.log(JSON.stringify(info));
  const [lon, lat] = info.spot;
  const shot = async (name, dist, tilt, spawn) => {
    const r = await p.evaluate(async ([lon, lat, dist, tilt, spawn]) => {
      const g = window.__genesis, sc = g.scene;
      sc.cam.setImmediate(lon, lat, dist); sc.dayAngle = lon + 0.5; sc.cam.tiltOffset = sc.cam.tTilt = tilt;
      const V = sc.cam.camera.position.constructor;
      if (spawn) sc.creatures.debugSpawn(sc.cam.focusDir(new V()));
      for (let i = 0; i < 14; i++) { sc.cam.setImmediate(lon, lat, dist); sc.frame(0.25); await new Promise((r) => setTimeout(r, 40)); }
      let n = 0, inst = 0; for (const s of sc.creatures.slots.values()) { n++; inst += s.mesh.count; }
      return { url: g.grab(), slots: n, inst };
    }, [lon, lat, dist, tilt, spawn]);
    fs.writeFileSync(`${out}-${name}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(name, 'slots', r.slots, 'instances', r.inst);
  };
  await shot('ground', 0.02, -0.5, true);
  await shot('close', 0.008, -0.3, false);
  const audit = await p.evaluate(() => {
    const sc = window.__genesis.scene; const rows = []; const roots = Object.values(sc).filter((v) => v && v.isScene);
    const seen = new Set();
    for (const root of roots) root.traverse((o) => {
      if (!o.isMesh || !o.geometry || seen.has(o)) return; seen.add(o);
      const attrs = Object.entries(o.geometry.attributes); const bufs = new Set(attrs.map(([, a]) => a.isInterleavedBufferAttribute ? a.data : a));
      let nb = bufs.size, na = attrs.length; const inst = !!o.isInstancedMesh; let cap = inst ? o.instanceMatrix.count : (o.count ?? 1);
      // what three adds for an InstancedMesh: a uniform buffer while it fits, else one buffer and four attributes
      const overUbo = (lim) => inst && Math.max(cap, 1) * 64 > lim;
      rows.push({ name: (o.name || o.geometry.type) + '/' + o.material.type, inst, cap, na, nb, gpu: nb + (overUbo(65536) ? 1 : 0), gpuA: na + (overUbo(65536) ? 4 : 0), gl16A: na + (overUbo(16384) ? 4 : 0), empty: inst && cap === 0 });
    });
    rows.sort((a, b) => Math.max(b.gpu, b.gl16A / 2) - Math.max(a.gpu, a.gl16A / 2));
    return { meshes: rows.length, worst: rows.slice(0, 12), bad: rows.filter((r) => r.gpu > 8 || r.gpuA > 16 || r.gl16A > 16 || r.empty) };
  });
  console.log('AUDIT meshes', audit.meshes, 'over a limit:', JSON.stringify(audit.bad));
  for (const r of audit.worst) console.log('  ', JSON.stringify(r));
  for (const [k, v] of msgs) console.log(`x${v} ${k.replace(/\n/g, ' ')}`);
  await b.close().catch(() => {});
})();
