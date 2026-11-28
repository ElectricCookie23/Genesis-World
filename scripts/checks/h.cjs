// Shared harness for the page checks in this folder (every *.cjs here begins with require('./h.cjs')): open the
// built page in a headless browser on WebGL2 or WebGPU (software), collect console output, step frames, grab pictures.
//
// To run a check: build the page and serve it on port 4173, then run the check from anywhere.
//   npx vite build --outDir /tmp/genesis-site --emptyOutDir
//   python3 -m http.server 4173 -d /tmp/genesis-site &
//   node scripts/checks/rewindpage.cjs
// PORT=<n> uses another port; SEED=<seed> opens another world than amber-reef-101 (a `&seed=` in a check's own
// query does nothing: the page takes the first); PROFILE=<dir> keeps the browser's storage between runs.
// A software renderer shows whether a thing is drawn and whether the console is clean, not how it looks.
const { chromium } = require('playwright');
const fs = require('fs');
exports.open = async (backend = 'webgl', query = '', size = [640, 400]) => {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  if (backend === 'webgpu') args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', ...(process.env.GPUFLAGS || '--disable-gpu-sandbox').split(' '));
  // PROFILE=<dir> keeps storage between runs and lifts the small storage quota of a throwaway context
  let browser, ctx;
  if (process.env.PROFILE) { ctx = await chromium.launchPersistentContext(process.env.PROFILE, { args, viewport: { width: size[0], height: size[1] } }); browser = ctx; }
  else { browser = await chromium.launch({ args }); ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] } }); }
  const page = await ctx.newPage();
  if (backend === 'webgpu') await page.addInitScript(() => {
    // headless software WebGPU cannot present to a canvas (the device is destroyed), so the page draws into an ordinary texture instead
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type !== 'webgpu') return orig.call(this, type, ...rest);
      const canvas = this;
      if (canvas.__fake) return canvas.__fake;
      let dev, fmt, tex;
      const ctx = {
        canvas,
        configure(o) { dev = o.device; fmt = o.format; tex = null; window.__gpuDevice = dev; },
        unconfigure() {},
        getConfiguration() { return { device: dev, format: fmt }; },
        getCurrentTexture() {
          if (!tex || tex.width !== canvas.width || tex.height !== canvas.height) {
            tex = dev.createTexture({ size: [Math.max(1, canvas.width), Math.max(1, canvas.height)], format: fmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
            window.__gpuTex = tex; window.__gpuFmt = fmt;
          }
          return tex;
        },
      };
      canvas.__fake = ctx;
      return ctx;
    };
    window.__gpuGrab = async () => {
      const d = window.__gpuDevice, t = window.__gpuTex; if (!d || !t) return '';
      const w = t.width, h = t.height, row = Math.ceil(w * 4 / 256) * 256;
      const buf = d.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const e = d.createCommandEncoder(); e.copyTextureToBuffer({ texture: t }, { buffer: buf, bytesPerRow: row }, [w, h]); d.queue.submit([e.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const img = g.createImageData(w, h);
      const bgra = String(window.__gpuFmt).startsWith('bgra');
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * row + x * 4, o = (y * w + x) * 4; img.data[o] = src[i + (bgra ? 2 : 0)]; img.data[o + 1] = src[i + 1]; img.data[o + 2] = src[i + (bgra ? 0 : 2)]; img.data[o + 3] = 255; }
      g.putImageData(img, 0, 0); buf.unmap(); buf.destroy();
      return c.toDataURL('image/jpeg', 0.9);
    };
  });
  const log = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => log.push('pageerror: ' + String(e.stack || e).slice(0, 500)));
  page.on('response', (r) => { if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url()}`); });
  // put a world grown by scripts/grow.ts into save slot 0, so `go('&slot=0')` opens it
  const inject = async (file) => {
    await page.route('**/__world.json', (r) => r.fulfill({ path: file, contentType: 'application/json' }));
    await page.route('**/__blank.html', (r) => r.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
    await page.goto('http://localhost:' + (process.env.PORT || 4173) + '/__blank.html');
    return page.evaluate(async () => {
      const decode = (v) => {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(decode);
        if (v.__n !== undefined) return Number(v.__n);
        if (v.__t) { const bin = atob(v.b); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const C = globalThis[v.__t]; return new C(u8.buffer, 0, u8.byteLength / C.BYTES_PER_ELEMENT); }
        if (v.__m) return new Map(v.__m.map(([k, x]) => [decode(k), decode(x)]));
        if (v.__s) return new Set(v.__s.map(decode));
        const o = {}; for (const k of Object.keys(v)) o[k] = decode(v[k]); return o;
      };
      const save = decode(await (await fetch('/__world.json')).json());
      await new Promise((res, rej) => {
        const r = indexedDB.open('keyval-store');
        r.onupgradeneeded = () => r.result.createObjectStore('keyval');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => { const tx = r.result.transaction('keyval', 'readwrite'); const st = tx.objectStore('keyval'); st.put(save, 'genesis:slot:0'); st.put([{ slot: 0, name: 'grown', seed: save.seed, simYear: save.simYear, savedAt: Date.now() }], 'genesis:slots'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); };
      });
      return { seed: save.seed, year: save.simYear };
    });
  };
  const go = async (q) => {
    await page.goto('http://localhost:' + (process.env.PORT || 4173) + '/?seed=' + (process.env.SEED || 'amber-reef-101') + '&skip' + (backend === 'webgl' ? '&webgl' : '') + q);
    await page.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet, null, { timeout: 300000 });
    await page.evaluate(() => { const g = __genesis; g.scene.cam.autoOrbit = 0; g.actions.setSlowOnEvents(false); });
  };
  if (query !== null) await go(query);
  const warp = async (my) => {
    await page.evaluate((my) => { const g = __genesis; g.setSpeed(1); g.scene.renderer.setSize(64, 40, false); g.send({ type: 'warp', years: my * 1e6 }); }, my);
    const t0 = Date.now();
    for (;;) { await page.waitForTimeout(4000); const y = await page.evaluate(() => __genesis.state.stats.simYear).catch(() => 0); if (y > my * 0.97e6 || Date.now() - t0 > 2400000) break; }
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const g = __genesis; g.setSpeed(0); g.scene.resize(); g.scene.daySpeed = 0; g.update({ uiHidden: true, hintStep: 9 }); });
  };
  const frames = (n = 10) => page.evaluate(async (k) => { for (let i = 0; i < k; i++) { __genesis.scene.frame(0.25); await new Promise((r) => setTimeout(r, 40)); } }, n);
  const grab = async (file, n = 10) => {
    await frames(n);
    const url = await page.evaluate(() => (window.__gpuGrab && __genesis.scene.renderer.backend.isWebGPUBackend ? window.__gpuGrab() : __genesis.grab()));
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  };
  const view = (lon, lat, dist, sun = 0.5, tilt = 0) => page.evaluate(([lon, lat, dist, sun, tilt]) => { const sc = __genesis.scene; sc.cam.setImmediate(lon, lat, dist); sc.cam.tiltOffset = tilt; sc.cam.tTilt = tilt; sc.dayAngle = lon + sun; }, [lon, lat, dist, sun, tilt]);
  return { browser, page, log, go, inject, warp, frames, grab, view, backendName: () => page.evaluate(() => __genesis.scene.renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2') };
};
