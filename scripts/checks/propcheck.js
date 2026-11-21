// Props on a fresh world: four made-up towns on a coast (a camp, a farming town, a modern port, a dead port).
const { chromium } = require('playwright');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 720, height: 460 } });
  const errs = new Set();
  p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.add(m.text().slice(0, 240)); });
  p.on('crash', () => console.log('PAGE CRASHED'));
  b.on('disconnected', () => console.log('BROWSER GONE'));
  p.on('pageerror', (e) => errs.add('[pageerror] ' + String(e).slice(0, 300)));
  await p.goto('http://localhost:5204/?seed=amber-reef-101&skip&fresh&webgl&noadapt&dsize=128&esize=128&eiter=40', { timeout: 120000 });
  await p.waitForFunction(() => window.__genesis && window.__genesis.scene && window.__genesis.scene.planet && window.__genesis.state.stats, null, { timeout: 300000 });
  await wait(9000);
  const spots = await p.evaluate(() => {
    const g = __genesis, sc = g.scene, G = sc.vegetation.grid;
    g.update({ hintStep: 99, uiHidden: true, panel: 'none' }); g.setSpeed(0);
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel;
    const coast = [];
    for (let i = 0; i < G.count && coast.length < 4; i += 13) {
      if (elev[i] < sea + 0.1 || elev[i] > sea + 0.9 || Math.abs(G.lat[i]) > 0.6) continue;
      let wet = 0; for (let k = 0; k < 6; k++) { const j = G.neighbors[i * 6 + k]; if (j >= 0 && elev[j] < sea) wet++; }
      if (wet >= 2 && wet <= 3 && !coast.some((c) => Math.abs(G.lon[c] - G.lon[i]) + Math.abs(G.lat[c] - G.lat[i]) < 0.3)) coast.push(i);
    }
    const mk = (id, cell, pop, tech, extra) => Object.assign({ id, name: 'Test ' + id, cell, species: 0, pop, tech, founded: 0, lore: -1, eventId: -1, ruined: -1, nation: -1 }, extra);
    const list = [mk(9001, coast[0], 0.3, 0.05, {}), mk(9002, coast[1], 40, 0.5, { farms: true, nation: 1 }), mk(9003, coast[2], 300, 0.9, { farms: true, nation: 1 }), mk(9004, coast[3], 0.5, 0.6, { ruined: 1000, peak: 30, nation: 1 })];
    sc.setSettlements(list, []); g.state.settlements = list;
    window.__hold = setInterval(() => { try { sc.props.setTowns(list); } catch (e) {} }, 800);
    return coast.map((i) => [G.lon[i], G.lat[i]]);
  });
  console.log(JSON.stringify(spots));
  const look = async (lon, lat, dist, name, tilt, night) => {
    await p.evaluate(([lon, lat, dist, tilt, night]) => { const sc = __genesis.scene; sc.daySpeed = 0; sc.dayAngle = lon - (night ? 3.3 : 0.5); sc.cam.autoOrbit = 0; sc.cam.setImmediate(lon, lat, dist); if (tilt !== null) sc.cam.tiltTo(tilt); }, [lon, lat, dist, tilt, night]);
    await wait(14000);
    console.log(name, 'mem', await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1), await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(__genesis.scene.props.counts()).filter(([, n]) => n)))));
    await p.screenshot({ path: out + '/' + name + '.png', timeout: 240000 }).catch((e) => console.log('shot failed', String(e).slice(0, 80)));
  };
  const names = ['camp', 'farm', 'port', 'deadport'];
  await look(spots[1][0], spots[1][1], 0.05, 'q-farm', null, false);
  await look(spots[1][0], spots[1][1], 0.022, 'q-farm-near', -0.2, false);
  await look(spots[3][0], spots[3][1], 0.014, 'q-deadport', -0.3, false);
  for (const e of errs) console.log('ERR', e);
  await b.close().catch(() => {});
})();
