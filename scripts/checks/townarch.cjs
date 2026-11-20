// Made-up towns built by four kinds of body (system E13), on a fresh world: one picture each.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [720, 460]);
  await h.page.waitForTimeout(9000);
  const towns = await h.page.evaluate(() => {
    const g = __genesis, sc = g.scene;
    const elev = sc.planet.elevation, sea = g.state.stats.seaLevel;
    const genome = (set) => { const a = new Float32Array(64).fill(0.5); for (const [k, v] of Object.entries(set)) a[k] = v; return a; };
    // gene indices: Size 0, BodyRatio 1, Segments 2, LimbType 3, LimbPairs 4, LimbLength 5, Neck 6; Water and Burrow are found by name below
    const names = ['Size', 'BodyRatio', 'Segments', 'LimbType', 'LimbPairs', 'LimbLength', 'Neck', 'Tail', 'Head', 'Horn', 'Armor', 'Insulation', 'EyeCount', 'EyeSize', 'Sight', 'Hearing', 'Smell', 'Echo', 'Electric', 'Hue', 'Hue2', 'PatternType', 'PatternScale', 'Glow', 'GlowHue', 'Ornament', 'ColorChange', 'Diet', 'WarmBlood', 'Metabolism', 'Toxicity', 'ToxinResist', 'Venom', 'HeatTol', 'ColdTol', 'Lifespan', 'Maturity', 'Offspring', 'Care', 'Metamorphosis', 'Sociality', 'Aggression', 'Boldness', 'Curiosity', 'Nocturnal', 'Water', 'Burrow'];
    const G = Object.fromEntries(names.map((n, i) => [n, i]));
    const make = (o) => { const a = new Float32Array(64).fill(0.5); for (const [k, v] of Object.entries(o)) a[G[k]] = v; return a; };
    const bodies = {
      tall: make({ Neck: 0.9, LimbType: 0.6, LimbLength: 0.9, BodyRatio: 0.1, Burrow: 0.05, Water: 0.05, Ornament: 0.8, ColdTol: 0.9, HeatTol: 0.1 }),
      digger: make({ Neck: 0.1, LimbType: 0.6, LimbLength: 0.2, BodyRatio: 0.8, Burrow: 0.95, Water: 0.1, Ornament: 0.05, Aggression: 0.7, HeatTol: 0.9, ColdTol: 0.1 }),
      flier: make({ Neck: 0.4, LimbType: 0.95, LimbLength: 0.7, BodyRatio: 0.3, Burrow: 0.05, Water: 0.05, Curiosity: 0.9 }),
      swimmer: make({ Neck: 0.2, LimbType: 0.35, LimbLength: 0.4, BodyRatio: 0.7, Burrow: 0.1, Water: 0.95, Size: 0.8 }),
    };
    const species = new Map();
    Object.values(bodies).forEach((genes, i) => species.set(900 + i, { id: 900 + i, name: Object.keys(bodies)[i], genes }));
    sc.towns.species = species;
    // four land cells with the sea near (so the swimmer has shallows), spread along the temperate belt
    const cells = [];
    for (let c = 0; c < elev.length && cells.length < 4; c += 11) {
      const [u, v] = g.actions.mapPoint(c);
      if (elev[c] > sea + 0.15 && elev[c] < sea + 0.7 && Math.abs(v - 0.5) < 0.18 && cells.every((o) => Math.abs(g.actions.mapPoint(o)[0] - u) > 0.08)) cells.push(c);
    }
    const list = cells.map((cell, i) => ({ id: 10 + i, name: Object.keys(bodies)[i], cell, species: 900 + i, pop: 120, tech: 0.62, founded: 0, lore: -1, eventId: -1, ruined: -1, nation: -1, farms: true, monuments: 0, walls: i === 1 ? [20, 0.4] : undefined }));
    sc.setSettlements(list, []);
    g.state.settlements = list;
    return list.map((t) => ({ name: t.name, uv: g.actions.mapPoint(t.cell), how: sc.architecture(t) }));
  });
  await h.page.evaluate(() => { const g = __genesis; g.update({ uiHidden: true, hintStep: 9, panel: 'none' }); g.setSpeed(0); });
  for (const t of towns) {
    console.log(t.name + ': ' + t.how);
    await h.view(t.uv[0] * Math.PI * 2 - Math.PI, (0.5 - t.uv[1]) * Math.PI, 0.011, 0.5, 0.15);
    await new Promise((r) => setTimeout(r, 9000));
    await h.page.screenshot({ path: `${out}/e13-${t.name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  }
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n'));
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
