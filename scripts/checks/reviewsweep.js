// Review sweep: every panel and every tool, at three stages of a world, with console and page errors gathered by stage.
const { chromium } = require('playwright');
const fs = require('fs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const src = fs.readFileSync('src/ui/panels.tsx', 'utf8');
const region = src.slice(src.indexOf('const TOOL_GROUPS'), src.indexOf('];', src.indexOf('const TOOL_GROUPS')) + 2);
const tools = [...region.matchAll(/\['([a-z0-9-]+)', '[^']*(?:\\'[^']*)*', '/g)].map((m) => m[1]);
const panels = ['chronicle', 'tree', 'help', 'tools', 'settings', 'guide', 'peoples', 'graphs', 'designer', 'map', 'section', 'nation', 'dynasty', 'site', 'tongues', 'gallery', 'legends', 'market', 'diplomacy', 'goals', 'system', 'microscope', 'archive', 'ground'];
(async () => {
  const out = process.argv[2], assets = process.argv[3] !== 'noassets';
  console.log('tools', tools.join(' '));
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
  let stage = 'load'; const errs = {};
  const note = (t) => { if (!(errs[stage] && errs[stage].has(t))) console.log('  ! [' + stage + '] ' + t); (errs[stage] ||= new Map()).set(t, ((errs[stage].get(t)) || 0) + 1); };
  const within = (pr, ms, what) => Promise.race([pr, new Promise((res) => setTimeout(() => res('TIMED OUT after ' + ms / 1000 + ' s: ' + what), ms))]);
  p.on('console', (m) => { if (m.type() === 'error') note(m.text().slice(0, 260)); });
  p.on('pageerror', (e) => note('[pageerror] ' + String(e).slice(0, 300)));
  p.on('crash', () => note('PAGE CRASHED'));
  p.on('requestfailed', (r) => note('[request failed] ' + r.url().replace(/^.*5204/, '').slice(0, 120)));
  p.on('response', (r) => { if (r.status() >= 400) note('[' + r.status() + '] ' + r.url().replace(/^.*5204/, '').slice(0, 120)); });
  const t0 = Date.now();
  await p.goto('http://localhost:5204/?seed=amber-reef-101&skip&fresh&webgl&noadapt&dsize=128&esize=128&eiter=40' + (assets ? '' : '&noassets'), { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet && window.__genesis.state.stats, null, { timeout: 300000 });
  console.log('ready after', Date.now() - t0, 'ms');
  await p.evaluate(() => { const g = __genesis; g.scene.renderer.setSize(200, 128, false); g.update({ hintStep: 99, uiHidden: false }); g.setSpeed(0); });
  const sweepPanels = async (tag) => {
    for (const name of panels) {
      stage = tag + ' panel ' + name;
      const r = await within(p.evaluate(async (name) => { const g = __genesis; g.update({ panel: name, uiHidden: false }); await new Promise((r) => setTimeout(r, 1200)); const t = document.body.innerText.length; return t; }, name).catch((e) => 'EVAL FAILED ' + String(e).slice(0, 120)), 90000, 'opening the panel ' + name);
      if (typeof r === 'string' && r.startsWith('TIMED OUT')) { note(r); console.log('THE PAGE STOPPED ANSWERING at', stage); throw new Error(r); }
      if (typeof r !== 'number') note(String(r));
      // every tab or button row inside the panel that switches a view: click each once
      const tabs = await within(p.evaluate(async () => { const out = []; const bs = [...document.querySelectorAll('button')].filter((b) => b.offsetParent && /tab/i.test(b.className)); for (const b of bs.slice(0, 14)) { try { b.click(); out.push(b.textContent.slice(0, 16)); await new Promise((r) => setTimeout(r, 500)); } catch (e) { out.push('ERR ' + e); } } return out; }).catch((e) => ['EVAL FAILED ' + String(e).slice(0, 100)]), 120000, 'the tabs of ' + name);
      if (typeof tabs === 'string') { note(tabs); console.log('THE PAGE STOPPED ANSWERING at', stage); throw new Error(tabs); }
      if (tabs.length) console.log('   ', tag, name, 'tabs:', tabs.join(' | '));
    }
    await p.evaluate(() => __genesis.update({ panel: 'none' }));
    console.log('  panels done:', tag);
  };
  const sweepTools = async (tag) => {
    const cell = await p.evaluate(() => { const g = __genesis, sc = g.scene, G = sc.vegetation.grid; const elev = sc.planet.elevation, sea = g.state.stats.seaLevel; for (let i = 0; i < G.count; i += 11) if (elev[i] > sea + 0.3 && Math.abs(G.lat[i]) < 0.5) return i; return 0; });
    for (const tool of tools) {
      stage = tag + ' tool ' + tool;
      await p.evaluate(([tool, cell]) => { const g = __genesis; g.send({ type: 'tool', tool, cell }); g.setSpeed(2); }, [tool, cell]);
      await wait(2500);
    }
    await p.evaluate(() => __genesis.setSpeed(0));
    console.log('  tools done:', tag, await info());
  };
  const info = () => p.evaluate(() => { const g = __genesis, s = g.state.stats; const r = g.scene.renderer.info; return JSON.stringify({ year: Math.round(s.simYear / 1e6) + ' My', stage: s.stage, species: g.state.species.size, towns: (g.state.settlements || []).filter((t) => t.ruined < 0).length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, tris: r.render.triangles, calls: r.render.drawCalls || r.render.calls, geos: r.memory.geometries, tex: r.memory.textures }); });
  stage = 'barren'; await wait(3000); console.log('barren', await info());
  await sweepPanels('barren'); await sweepTools('barren');
  stage = 'warp to animals';
  await p.evaluate(() => { const g = __genesis; g.update({ uiHidden: true }); g.send({ type: 'warp', years: 70e6, through: true }); });
  await p.waitForFunction(() => { const s = __genesis.state; return s.stats.stage === 'animals' && [...s.species.values()].some((x) => x.extinctYear < 0 && x.land > 0.5 && x.pop > 2000); }, null, { timeout: 1500000 });
  await wait(5000); stage = 'animals'; console.log('animals', await info(), 'at', Math.round((Date.now() - t0) / 1000), 's');
  await p.evaluate(() => { const g = __genesis; const sp = [...g.state.species.values()].filter((x) => x.extinctYear < 0 && x.land > 0.5).sort((a, b) => b.pop - a.pop)[0]; g.update({ selectedSpecies: sp.id }); });
  await sweepPanels('animals'); await sweepTools('animals');
  // a close look at the greenest land: what is drawn there
  stage = 'forest view';
  await p.evaluate(() => { const g = __genesis, sc = g.scene, c = sc.vegetationCells(), G = sc.vegetation.grid; let best = 0, bv = -1; for (let i = 0; i < G.count; i++) { if (c.elevation[i] < c.seaLevel || Math.abs(G.lat[i]) > 0.5) continue; const v = c.canopy[i] + c.vegetation[i] * 0.2; if (v > bv) { bv = v; best = i; } } g.update({ panel: 'none', uiHidden: true, selectedSpecies: -1 }); sc.renderer.setSize(720, 460, false); sc.daySpeed = 0; sc.dayAngle = G.lon[best] - 0.5; sc.cam.autoOrbit = 0; sc.cam.setImmediate(G.lon[best], G.lat[best], 0.02); sc.cam.tiltTo(-0.5); });
  await wait(20000);
  console.log('forest view', await info(), await p.evaluate(() => JSON.stringify({ plants: [...__genesis.scene.vegetation.full.entries()].filter(([, s]) => s.n).map(([f, s]) => f + ' ' + s.n).join(', '), fps: (() => { const sc = __genesis.scene; return sc.fps || sc.frameMs || null; })() })));
  const frames = await p.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t > 8000) res(n / 8); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  console.log('forest frames per second in the software renderer:', frames.toFixed(2));
  await p.screenshot({ path: out + '/review-forest-' + (assets ? 'assets' : 'plain') + '.png', timeout: 240000 }).catch(() => {});
  console.log('---- errors by stage');
  for (const [st, m] of Object.entries(errs)) for (const [t, n] of m) console.log(`[${st}] x${n} ${t}`);
  console.log('total', Math.round((Date.now() - t0) / 1000), 's');
  await b.close().catch(() => {});
})().catch((e) => { console.log('SWEEP STOPPED', String(e).slice(0, 400)); process.exit(1); });
