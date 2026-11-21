// One seed, one dawn of history? Open the same seed twice, wait a different number of seconds in each, then skip to
// the dawn of history, and compare the year it begins, the first country and the species alive. (Before the worker
// stepped prehistory on fixed boundaries, six runs of one seed gave dawns between 83 and 144 million years.)
// Usage: node samedawn.cjs [seconds before the skip in the first run] [in the second]
const { open } = require('./h.cjs');
const run = async (delay) => {
  const h = await open('webgl', '&noadapt&dsize=128&esize=128&eiter=60', [640, 400]);
  const t0 = Date.now();
  await h.page.waitForTimeout(delay * 1000);
  await h.page.evaluate(() => __genesis.actions.skipTo(0));
  for (;;) {
    await h.page.waitForTimeout(5000);
    const done = await h.page.evaluate(() => { const s = __genesis.state.stats; return !!s && s.skipTo == null && __genesis.state.realms.length > 0; });
    if (done || Date.now() - t0 > 18 * 60000) break;
  }
  const out = await h.page.evaluate(() => { const g = __genesis.state; const dawn = g.events.find((e) => e && e.type === 'nation'); /* (the year history began, not the clock now: the page runs on after a skip) */ return { year: dawn ? Math.round(dawn.simYear) : -1, first: g.realms[0] ? g.realms[0].name : '', species: g.species.size, before: g.events.filter((e) => e && dawn && e.simYear <= dawn.simYear).length }; });
  await h.browser.close();
  return { ...out, seconds: Math.round((Date.now() - t0) / 1000) };
};
(async () => {
  const a = await run(Number(process.argv[2] || 3)), b = await run(Number(process.argv[3] || 10));
  console.log('first ', JSON.stringify(a));
  console.log('second', JSON.stringify(b));
  console.log(a.year === b.year && a.first === b.first && a.before === b.before ? 'THE SAME DAWN' : 'DIFFERENT');
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
