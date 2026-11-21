// The gallery (system E26) with the paintings of a real history (written by scripts/gallery.ts <seed> <years> <n> <file>).
const { open } = require('./h.cjs');
const fs = require('fs');
(async () => {
  const [data, out] = process.argv.slice(2);
  const d = JSON.parse(fs.readFileSync(data, 'utf8'));
  // one painting of each age first, so that every manner is on the first screen
  const seen = new Set(), lead = [];
  for (const p of [...d.paintings].sort((a, b) => a.era - b.era)) if (!seen.has(p.era)) { seen.add(p.era); lead.push(p); }
  d.paintings = [...lead, ...d.paintings.filter((p) => !lead.includes(p))];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1100, 900]);
  await h.page.waitForTimeout(7000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1000);
  const now = await h.page.evaluate(() => __genesis.state.stats.simYear);
  for (const p of d.paintings) p.year += now - d.year;
  for (const m of d.movements) m.born += now - d.year;
  await h.page.evaluate((d) => { const g = __genesis; g.update({ hintStep: 9, panel: 'gallery', gallery: { paintings: d.paintings, movements: d.movements }, painting: d.paintings[5].id }); }, d);
  await h.page.waitForTimeout(1500);
  await h.page.mouse.move(700, 300);
  await h.page.screenshot({ path: `${out}/e26-gallery.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  // each manner in turn, large: one painting of ages 0, 2, 4, 6 and 8 where there is one
  for (const era of [0, 2, 4, 6, 8]) {
    const p = lead.find((x) => x.era === era) || lead.find((x) => x.era === era + 1);
    if (!p) continue;
    await h.page.evaluate((id) => __genesis.update({ painting: id }), p.id);
    await h.page.waitForTimeout(500);
    await h.page.screenshot({ path: `${out}/e26-era${era}.png`, clip: { x: 372, y: 144, width: 352, height: 248 } }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  }
  console.log('ages on the first screen:', lead.map((p) => `${p.era}:${p.styleName}:${p.subject}`).join(' | '));
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n'));
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
