// Each candidate plant model as the game would turn it into a plant: wood as painted, foliage tinted by a species colour.
const { chromium } = require('playwright');
const list = JSON.parse(process.argv[3]);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
  p.on('pageerror', (e) => console.log('[pageerror] ' + String(e).slice(0, 300)));
  await p.goto('http://localhost:5204/?seed=amber-reef-101&skip&fresh&webgl&noadapt&dsize=128&esize=128&eiter=40&noassets', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.plantPreview, null, { timeout: 300000 });
  await p.evaluate(() => { const g = __genesis; g.scene.renderer.setSize(16, 10, false); g.setSpeed(0); });
  const info = await p.evaluate(async (list) => {
    const W = 200, H = 240, cols = Math.min(6, list.length), rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = W * cols; cv.height = H * rows; cv.id = 'sheet';
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#cfd8dc';
    document.body.appendChild(cv);
    const cx = cv.getContext('2d'); cx.fillStyle = '#cfd8dc'; cx.fillRect(0, 0, cv.width, cv.height);
    const out = [];
    for (let k = 0; k < list.length; k++) {
      const it = list[k];
      const m = await __genesis.plantPreview(it.file, it.form, it.how);
      const ox = (k % cols) * W, oy = Math.floor(k / cols) * H;
      cx.fillStyle = '#000'; cx.font = '10px sans-serif';
      cx.fillText(it.form + ' ' + it.file.split('/').pop().replace('.glb', '').slice(0, 30), ox + 4, oy + 12);
      if (!m) { cx.fillText('missing', ox + 4, oy + 30); out.push(it.file + ' missing'); continue; }
      const n = m.pos.length / 3; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      const a = 0.6, ca = Math.cos(a), sa = Math.sin(a);
      const P = [];
      for (let i = 0; i < n; i++) { const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2]; const X = x * ca + z * sa, Z = -x * sa + z * ca; const Y = y * 0.97 + Z * 0.22, D = Z * 0.97 - y * 0.22; P.push([X, Y, D]); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
      const s = Math.min((W - 20) / (x1 - x0), (H - 40) / (y1 - y0));
      const tint = it.tint || [0.25, 0.55, 0.3], tint2 = [0.95, 0.85, 0.3];
      const tris = []; let wood = 0, fol = 0;
      for (let t = 0; t < m.idx.length; t += 3) {
        const i = m.idx[t], j = m.idx[t + 1], l = m.idx[t + 2];
        const A = P[i], B = P[j], C = P[l];
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const lit = 0.45 + 0.55 * Math.abs(nx * 0.4 + ny * 0.75 + nz * -0.5);
        const part = Math.round(m.part[i]);
        let c = [m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]];
        if (part === 9) { c = c.map((v, q) => Math.min(1, v * tint[q] * 2.2)); fol++; } else if (part === 8 || part === 7) { c = tint2; fol++; } else wood++;
        tris.push([(A[2] + B[2] + C[2]) / 3, A, B, C, c.map((v) => Math.round(255 * Math.pow(Math.max(0, v * lit), 1 / 2.2))), part]);
      }
      tris.sort((p, q) => q[0] - p[0]);
      const mx = (v) => ox + W / 2 + (v[0] - (x0 + x1) / 2) * s, my = (v) => oy + H - 14 - (v[1] - y0) * s;
      for (const t of tris) { cx.fillStyle = `rgb(${t[4][0]},${t[4][1]},${t[4][2]})`; cx.strokeStyle = cx.fillStyle; cx.beginPath(); cx.moveTo(mx(t[1]), my(t[1])); cx.lineTo(mx(t[2]), my(t[2])); cx.lineTo(mx(t[3]), my(t[3])); cx.closePath(); cx.fill(); cx.stroke(); }
      const parts = {}; for (let i = 0; i < n; i++) parts[Math.round(m.part[i])] = (parts[Math.round(m.part[i])] || 0) + 1;
      cx.fillStyle = '#000'; cx.fillText(m.triangles + ' tris  wood ' + wood + ' leaf ' + fol, ox + 4, oy + 24);
      out.push(it.file + ' tris ' + m.triangles + ' parts ' + JSON.stringify(parts) + ' size ' + (x1 - x0).toFixed(2) + 'x' + (y1 - y0).toFixed(2));
    }
    return { out, w: cv.width, h: cv.height };
  }, list);
  for (const l of info.out) console.log(l);
  await p.setViewportSize({ width: Math.max(400, info.w), height: Math.max(300, info.h) });
  await p.locator('#sheet').screenshot({ path: process.argv[2], timeout: 120000 });
  await b.close().catch(() => {});
})();
