// Two made-up towns joined by every kind of network (system E15), on a fresh world.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [720, 460]);
  await h.page.waitForTimeout(9000);
  const town = await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel;
    const grid = sc.towns.grid;
    // an inland cell with a dry neighbour two cells away
    let cell = -1, other = -1;
    for (let c = 0; c < elev.length && cell < 0; c += 5) {
      const [, v] = g.actions.mapPoint(c);
      if (elev[c] < sea + 0.3 || elev[c] > sea + 1.0 || Math.abs(v - 0.5) > 0.2) continue;
      let ok = true; const ring = [];
      for (let j = 0; j < grid.ncount[c]; j++) { const nb = grid.neighbors[c * 6 + j]; if (elev[nb] <= sea + 0.1) ok = false; ring.push(nb); }
      if (!ok) continue;
      for (const nb of ring) for (let j = 0; j < grid.ncount[nb]; j++) { const far = grid.neighbors[nb * 6 + j]; if (far !== c && !ring.includes(far) && elev[far] > sea + 0.2 && other < 0) other = far; }
      if (other >= 0) cell = c;
    }
    const base = { species: 0, founded: 0, lore: -1, eventId: -1, ruined: -1, nation: -1, farms: true, monuments: 0 };
    const a = { ...base, id: 1, name: 'Hub', cell, pop: 300, tech: 1.05, links: [2, 0, 2, 1, 2, 2, 2, 3, 2, 4, 2, 5, 2, 6] };
    const b = { ...base, id: 2, name: 'Far', cell: other, pop: 60, tech: 1.0, links: [1, 0, 1, 3, 1, 6] };
    sc.setSettlements([a, b], []);
    return { cell, other, uv: g.actions.mapPoint(cell), uv2: g.actions.mapPoint(other) };
  });
  console.log('towns', JSON.stringify(town));
  const lon = town.uv[0] * Math.PI * 2 - Math.PI, lat = (0.5 - town.uv[1]) * Math.PI;
  const lon2 = town.uv2[0] * Math.PI * 2 - Math.PI, lat2 = (0.5 - town.uv2[1]) * Math.PI;
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(0); });
  // look at the ground between the two, a third of the way out from the hub
  await h.view(lon + (lon2 - lon) * 0.22, lat + (lat2 - lat) * 0.22, 0.012, 0.5, 0.3);
  await new Promise((r) => setTimeout(r, 9000));
  await h.page.screenshot({ path: `${out}/e15-links.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log(await h.page.evaluate(() => { const t = __genesis.scene.towns; return ['road', 'rail', 'canal', 'arch', 'pole', 'pipe', 'pylon'].map((k) => k + ' ' + t.slots.get(k).n).join(', '); }));
  await h.view(lon + (lon2 - lon) * 0.2, lat + (lat2 - lat) * 0.2, 0.006, 0.5, 0.1);
  await new Promise((r) => setTimeout(r, 9000));
  await h.page.screenshot({ path: `${out}/e15-links-close.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n'));
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
