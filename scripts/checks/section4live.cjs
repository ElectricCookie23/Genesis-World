// Section 4 on the real page, with real data (no made-up state): skip a world to the Age of Sails, let it run
// at the pace of history, then open every view sections 3 and 4 added and report what each holds and whether
// anything went wrong in the console. Slow on a software renderer (ten minutes or more).
// Usage: node section4live.cjs <out dir> [seed] [seconds at History speed]
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2], seed = process.argv[3] || 'quiet-harbor-7', watch = Number(process.argv[4] || 150);
  const h = await open('webgl', `&seed=${seed}&noadapt&dsize=128&esize=128&eiter=60`, [1000, 760]);
  const stat = () => h.page.evaluate(() => { const s = __genesis.state.stats; return s ? { year: Math.round(s.simYear), topEra: s.topEra ?? -1, skipTo: s.skipTo ?? null, towns: __genesis.state.settlements.length, realms: __genesis.state.realms.filter((r) => r.ended < 0).length } : null; });
  await h.page.waitForTimeout(9000);
  await h.page.evaluate(() => __genesis.actions.skipTo(4));
  const t0 = Date.now();
  for (;;) {
    await h.page.waitForTimeout(10000);
    const s = await stat();
    if (s && s.topEra >= 4 && s.skipTo === null) { console.log('arrived', JSON.stringify(s), `${Math.round((Date.now() - t0) / 1000)} s`); break; }
    if (Date.now() - t0 > 20 * 60000) { console.log('gave up waiting for the skip', JSON.stringify(s)); break; }
  }
  await h.page.evaluate(() => { __genesis.update({ hintStep: 9 }); __genesis.actions.setSpeed(3); });
  // (while it runs: how many countries, towns and events there are, and how much memory the page's own thread holds)
  for (let t = 0; t < watch; t += 30) {
    await h.page.waitForTimeout(30000);
    console.log('  watching', JSON.stringify(await h.page.evaluate(() => { const s = __genesis.state; return { year: Math.round(s.stats.simYear), realms: s.realms.filter((r) => r.ended < 0).length, towns: s.settlements.length, events: s.events.length, chronicle: s.chronicle.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1 }; })));
  }
  console.log('after watching', JSON.stringify(await stat()));
  await h.page.evaluate(() => __genesis.actions.setSpeed(0));
  // how long the page's own thread takes over one list of towns and countries, and how large that list is
  console.log('page work', JSON.stringify(await h.page.evaluate(() => {
    const g = __genesis, s = g.state;
    const t0 = performance.now(); g.scene.setSettlements(s.settlements, s.realms); const t1 = performance.now(); g.update({ settlements: s.settlements.slice() }); const t2 = performance.now();
    return { setSettlementsMs: Math.round(t1 - t0), updateMs: Math.round(t2 - t1), settlementsKB: Math.round(JSON.stringify(s.settlements).length / 1000), realmsKB: Math.round(JSON.stringify(s.realms).length / 1000) };
  })));
  const shot = async (name) => { await h.page.mouse.move(40, 720); await h.page.waitForTimeout(400); await h.page.screenshot({ path: `${out}/live-${name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', name, String(e).slice(0, 60))); };
  const views = [
    ['wars', 'openWars', () => ({ wars: (__genesis.state.wars ?? []).length, battles: (__genesis.state.wars ?? []).reduce((a, w) => a + w.battles.length, 0) })],
    ['plagues', 'openPlagues', () => ({ plagues: (__genesis.state.plagues ?? []).length, towns: (__genesis.state.plagues ?? []).reduce((a, p) => a + p.steps.length, 0), ways: __genesis.state.plagueWays.length })],
    ['greatwars', 'openGreatWars', () => ({ great: (__genesis.state.greatWars ?? []).length, world: (__genesis.state.greatWars ?? []).filter((g) => g.world).length })],
    ['diplomacy', 'openDiplomacy', () => ({ ties: __genesis.state.diplomacy ? __genesis.state.diplomacy.ties.length : -1, secret: __genesis.state.diplomacy ? __genesis.state.diplomacy.secret.length : -1 })],
    ['market', 'openMarket', () => ({ years: __genesis.state.market ? __genesis.state.market.years.length : -1 })],
    // (and the views of sections 1 to 3, which were also only ever seen in small worlds)
    ['languages', 'openLanguages', () => ({ languages: (__genesis.state.languages ?? []).length })],
    ['gallery', 'openGallery', () => ({ paintings: __genesis.state.gallery ? __genesis.state.gallery.paintings.length : -1 })],
    ['legends', 'openLegends', () => ({ legends: (__genesis.state.legends ?? []).length })],
  ];
  for (const [name, action, read] of views) {
    await h.page.evaluate((a) => __genesis.actions[a](), action);
    await h.page.waitForTimeout(2500);
    console.log(name, JSON.stringify(await h.page.evaluate(read)));
    await shot(name);
  }
  for (const [name, mapOf] of [['trade', -2], ['ideas', -4], ['colonies', -5]]) {
    await h.page.evaluate((m) => __genesis.update({ panel: 'map', mapOf: m, mapNote: '' }), mapOf);
    await h.page.waitForTimeout(2500);
    console.log(name, await h.page.evaluate(() => __genesis.state.mapNote));
    await shot(name);
  }
  // the list of peoples, and the Night Map on the globe
  await h.page.evaluate(() => __genesis.update({ panel: 'peoples', whyEvent: -1 }));
  await h.page.waitForTimeout(2500);
  await shot('peoples');
  await h.page.evaluate(() => { __genesis.update({ panel: 'none' }); __genesis.actions.setOverlay('nations'); });
  await h.page.waitForTimeout(6000);
  await shot('nightmap');
  await h.page.evaluate(() => __genesis.actions.setOverlay('none'));
  // one country's page: the largest living one
  const realm = await h.page.evaluate(() => { const r = __genesis.state.realms.filter((x) => x.ended < 0).sort((a, b) => b.pop - a.pop)[0]; if (r) __genesis.actions.openNation(r.id); return r ? { name: r.name, government: r.government, era: r.eraName, idea: r.idea ? r.idea.name : null, race: r.race ? r.race.withName : null, colonies: (r.colonies ?? []).length, league: r.league ? r.league.name : null } : null; });
  await h.page.waitForTimeout(3000);
  console.log('nation', JSON.stringify(realm), 'races in detail', await h.page.evaluate(() => (__genesis.state.nationDetail ? __genesis.state.nationDetail.races.length : -1)));
  await shot('nation');
  // the chronicle with the Truth switch on
  await h.page.evaluate(() => __genesis.update({ panel: 'chronicle', truth: true, whyEvent: -1 }));
  await h.page.waitForTimeout(1500);
  const types = await h.page.evaluate(() => { const c = {}; for (const e of __genesis.state.events) if (e) c[e.type] = (c[e.type] ?? 0) + 1; return c; });
  const mine = ['ideology', 'idea-spreads', 'revolution', 'colony', 'independence-declared', 'independence', 'rising-crushed', 'plague', 'plague-ends', 'arms-race', 'arms-race-ends', 'theft', 'assassination', 'secret-treaty', 'craft-learned', 'ruler-death', 'plot-uncovered', 'secret-revealed', 'alliance-war', 'world-war', 'great-peace', 'institution', 'arbitration', 'order-fails', 'battle', 'peace', 'treaty', 'betrayal'];
  console.log('events', mine.filter((t) => types[t]).map((t) => `${t} ${types[t]}`).join(', '), '| hidden on the page', await h.page.evaluate(() => __genesis.state.hiddenIds.length));
  await shot('chronicle-truth');
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 12).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
