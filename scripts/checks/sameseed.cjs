// Is one seed one world? Open the same seed twice, leave each at the speed the page starts with for a different
// number of seconds (as two visitors would), then press Epoch speed in both, and compare everything the chronicle
// holds up to a little before a given year. Before the worker stepped prehistory on fixed boundaries the two came
// out different every time.
// Usage: node sameseed.cjs [seed] [million years to run] [seconds before Epoch in the first run] [in the second]
const { open } = require('./h.cjs');
const run = async (seed, until, delay) => {
  const h = await open('webgl', '&noadapt&dsize=128&esize=128&eiter=60', [640, 400]);
  const t0 = Date.now();
  await h.page.waitForTimeout(delay * 1000);
  await h.page.evaluate(() => __genesis.actions.setSpeed(6));
  for (;;) {
    await h.page.waitForTimeout(3000);
    const y = await h.page.evaluate(() => (__genesis.state.stats ? __genesis.state.stats.simYear : 0));
    if (y >= until * 1e6 || Date.now() - t0 > 15 * 60000) break;
  }
  const out = await h.page.evaluate((cut) => {
    const list = __genesis.state.events.filter((e) => e && e.simYear <= cut).map((e) => `${Math.round(e.simYear)} ${e.type} ${e.title}`);
    let hash = 0;
    for (const s of list) for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
    return { events: list.length, hash, last: list.slice(-3) };
  }, (until - 0.1) * 1e6);
  await h.browser.close();
  return { ...out, seconds: Math.round((Date.now() - t0) / 1000) };
};
(async () => {
  const seed = process.argv[2] || 'amber-reef-101', until = Number(process.argv[3] || 12);
  const a = await run(seed, until, Number(process.argv[4] || 4)), b = await run(seed, until, Number(process.argv[5] || 11));
  console.log('first ', JSON.stringify(a));
  console.log('second', JSON.stringify(b));
  console.log(a.hash === b.hash && a.events === b.events ? 'THE SAME: one seed, one world' : 'DIFFERENT: the same seed gave two worlds');
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
