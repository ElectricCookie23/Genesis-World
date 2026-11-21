// The markets panel (system E32) with the price history of a real history (written by scripts/market.ts <seed> <years> <n> <file>).
const { open } = require('./h.cjs');
const fs = require('fs');
(async () => {
  const [data, out] = process.argv.slice(2);
  const d = JSON.parse(fs.readFileSync(data, 'utf8'));
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1040, 760]);
  await h.page.waitForTimeout(7000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1000);
  const now = await h.page.evaluate(() => __genesis.state.stats.simYear);
  d.market.years = d.market.years.map((y) => y + now - d.year);
  for (const p of d.market.panics) p.year += now - d.year;
  await h.page.evaluate((m) => __genesis.update({ hintStep: 9, panel: 'market', market: m }), d.market);
  await h.page.waitForTimeout(1200);
  await h.page.mouse.move(40, 700);
  await h.page.screenshot({ path: `${out}/e32-markets.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
