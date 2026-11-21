// The languages panel (system E21) with the languages of a real history (written by scripts/languages.ts <seed> <years> <n> <file>).
const { open } = require('./h.cjs');
const fs = require('fs');
(async () => {
  const [data, out] = process.argv.slice(2);
  const d = JSON.parse(fs.readFileSync(data, 'utf8'));
  // (the fresh page has its own clock: the languages' years are moved onto it)
  const shift = (now) => { for (const l of d.list) { l.born += now - d.year; for (const c of l.changes) c.year += now - d.year; if (l.script) l.script.born += now - d.year; } d.year = now; };
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1100, 760]);
  await h.page.waitForTimeout(7000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  shift(await h.page.evaluate(() => __genesis.state.stats.simYear));
  await h.page.evaluate((d) => { const g = __genesis; g.update({ hintStep: 9, panel: 'tongues', languages: { lexicon: d.lexicon, sayings: d.sayings, list: d.list }, tongue: -1, stats: { ...g.state.stats, simYear: d.year } }); }, d);
  await h.page.waitForTimeout(1500);
  await h.page.mouse.move(700, 300);
  const info = await h.page.evaluate(() => { const p = [...document.querySelectorAll('h2')].find((x) => x.textContent === 'Languages'); const panel = p && p.parentElement.parentElement; return panel ? { text: panel.innerText.slice(0, 600), rows: panel.querySelectorAll('button').length, w: panel.getBoundingClientRect().width } : null; });
  console.log(JSON.stringify(info).slice(0, 900));
  await h.page.screenshot({ path: `${out}/e21-languages.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  // the writing is at the foot of the panel: scroll to it, and take it with the Rosetta on and off
  const down = () => h.page.evaluate(() => { const p = [...document.querySelectorAll('h2')].find((x) => x.textContent === 'Languages'); const sc = p.parentElement.parentElement.querySelector('div:nth-child(2)'); sc.scrollTop = sc.scrollHeight; });
  await down();
  await h.page.waitForTimeout(600);
  await h.page.screenshot({ path: `${out}/e23-writing.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  await h.page.evaluate(() => __genesis.update({ rosetta: false }));
  await h.page.waitForTimeout(400);
  await down();
  await h.page.waitForTimeout(400);
  await h.page.screenshot({ path: `${out}/e23-writing-plain.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log([...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n'));
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
