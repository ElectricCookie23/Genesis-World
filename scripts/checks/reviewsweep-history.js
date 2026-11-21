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
  if (assets) {
    stage = 'warp to history';
    await p.evaluate(() => { const g = __genesis; g.update({ uiHidden: true }); g.scene.renderer.setSize(200, 128, false); g.send({ type: 'warp', years: 260e6, through: true }); });
    // the fast-forward stops where history begins; from there the years are watched at the pace of history
    const dawn = await p.waitForFunction(() => (__genesis.state.settlements || []).filter((t) => t.ruined < 0).length >= 1, null, { timeout: 1500000 }).then(() => true).catch(() => false);
    console.log('first town', dawn, await info(), 'at', Math.round((Date.now() - t0) / 1000), 's');
    await p.evaluate(() => __genesis.setSpeed(3));
    const got = await p.waitForFunction(() => (__genesis.state.settlements || []).filter((t) => t.ruined < 0 && (t.nation ?? -1) >= 0).length >= 3, null, { timeout: 420000 }).then(() => true).catch(() => false);
    await wait(5000); stage = 'history'; console.log('history', got, await info(), 'at', Math.round((Date.now() - t0) / 1000), 's');
    await p.evaluate(() => { const g = __genesis; g.setSpeed(0); const st = (g.state.settlements || []).filter((t) => t.ruined < 0 && (t.nation ?? -1) >= 0).sort((a, b) => b.pop - a.pop)[0]; if (st) { g.update({ uiHidden: false, selectedNation: st.nation, nation: st.nation, selectedTown: st.id }); if (g.actions.openNation) g.actions.openNation(st.nation); } });
    await sweepPanels('history'); await sweepTools('history');
    stage = 'history after tools'; await wait(4000); console.log('after tools', await info());
    await p.evaluate(() => { const g = __genesis, sc = g.scene; const st = (g.state.settlements || []).filter((t) => t.ruined < 0).sort((a, b) => b.pop - a.pop)[0]; if (!st) return; const G = sc.vegetation.grid; g.update({ panel: 'none', uiHidden: true }); sc.renderer.setSize(720, 460, false); sc.daySpeed = 0; sc.dayAngle = G.lon[st.cell] - 0.5; sc.cam.autoOrbit = 0; sc.cam.setImmediate(G.lon[st.cell], G.lat[st.cell], 0.03); });
    await wait(20000); stage = 'town view';
    console.log('town view', await info(), await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(__genesis.scene.props.counts()).filter(([, n]) => n)))));
    await p.screenshot({ path: out + '/review-town.png', timeout: 240000 }).catch(() => {});
  }
  console.log('---- errors by stage');
  for (const [st, m] of Object.entries(errs)) for (const [t, n] of m) console.log(`[${st}] x${n} ${t}`);
  console.log('total', Math.round((Date.now() - t0) / 1000), 's');
  await b.close().catch(() => {});
})().catch((e) => { console.log('SWEEP STOPPED', String(e).slice(0, 400)); process.exit(1); });
