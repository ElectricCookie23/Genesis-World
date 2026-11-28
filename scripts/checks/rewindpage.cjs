// Going back in the real page: skip a world to the Age of Sails, go back to the kept copy of an earlier age, and
// skip forward again. The world must come back as it was (the same year, then the same arrival: a skip takes the
// same steps from the same copy), with nothing in the console. This is the check on how kept copies are stored
// (`packSave` in sim/snapshot.ts: unused rows dropped, unchanged pieces shared between copies).
// Usage: node rewindpage.cjs [age to skip to, default 4]
const { open } = require('./h.cjs');
(async () => {
  const era = Number(process.argv[2] || 4);
  const h = await open('webgl', '&noadapt&dsize=128&esize=128&eiter=60', [900, 640]);
  const stat = () => h.page.evaluate(() => { const g = __genesis, s = g.state.stats; return s ? { year: Math.round(s.simYear), topEra: s.topEra ?? -1, skipTo: s.skipTo ?? null, towns: g.state.settlements.length, events: g.state.events.length, points: g.state.timeline.length } : null; });
  const arrive = async (label) => {
    const t0 = Date.now();
    for (;;) {
      await h.page.waitForTimeout(5000);
      const s = await stat();
      if (s && s.topEra >= era && s.skipTo === null) { console.log(label, JSON.stringify(s), `${Math.round((Date.now() - t0) / 1000)} s`); return s; }
      if (Date.now() - t0 > 20 * 60000) { console.log(label, 'gave up waiting', JSON.stringify(s)); return s; }
    }
  };
  await h.page.waitForTimeout(9000);
  await h.page.evaluate(() => { __genesis.update({ hintStep: 9 }); __genesis.actions.setSpeed(0); });
  await h.page.evaluate((e) => __genesis.actions.skipTo(e), era);
  const first = await arrive('arrived');
  await h.page.evaluate(() => __genesis.actions.setSpeed(0));
  await h.page.waitForTimeout(3000);
  const points = await h.page.evaluate(() => __genesis.state.timeline.map((p) => ({ index: p.index, year: Math.round(p.simYear), title: p.title })));
  console.log('kept copies', points.length, JSON.stringify(points.slice(-6)));
  // the copy two ages back (the start of an age is always kept)
  const back = points[Math.max(0, points.length - 3)];
  await h.page.evaluate((i) => __genesis.actions.rewind(i), back.index);
  await h.page.waitForTimeout(8000);
  const there = await stat();
  console.log('went back to', JSON.stringify(back), '->', JSON.stringify(there), there && there.year === back.year ? 'SAME YEAR' : 'DIFFERENT YEAR');
  await h.page.evaluate((e) => __genesis.actions.skipTo(e), era);
  const second = await arrive('arrived again');
  console.log(first && second && first.year === second.year && first.towns === second.towns ? 'SAME ARRIVAL' : 'DIFFERENT ARRIVAL', JSON.stringify({ first, second }));
  console.log('console:', h.log.length ? h.log.join('\n') : 'clean');
  await h.browser.close();
})();
