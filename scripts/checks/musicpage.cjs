// The town music (system E27) through the page's audio engine: play each made-up people for a few seconds and report errors.
const { open } = require('./h.cjs');
const fs = require('fs');
(async () => {
  const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [720, 460]);
  await h.page.waitForTimeout(7000);
  await h.page.mouse.click(360, 200);
  await h.page.evaluate((d) => { const g = __genesis; g.setSpeed(0); g.update({ hintStep: 9, realms: d }); }, d);
  for (const r of d) {
    await h.page.evaluate((id) => __genesis.actions.listen(id), r.id);
    await h.page.waitForTimeout(5000);
    console.log('played', r.id, r.music.about.slice(0, 70));
  }
  const state = await h.page.evaluate(() => { const A = window.AudioContext || window.webkitAudioContext; return typeof A; });
  console.log('audio context:', state);
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels')).slice(0, 8).join('\n') || 'no errors or warnings');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
