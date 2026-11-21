// The Truth switch (system E39): a made-up ruler's death, asked about with the switch off (the public story,
// and nothing behind it) and on (the poisoning behind it, in violet, and the arms race behind that).
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 760]);
  await h.page.waitForTimeout(8000);
  await h.page.evaluate(() => __genesis.setSpeed(0));
  await h.page.waitForTimeout(1200);
  const setUp = (truth) => h.page.evaluate((truth) => {
    const g = __genesis, now = g.state.stats.simYear;
    const base = g.state.events.length + 5;
    const ev = (i, type, ago, title, description, causes, extra) => ({ id: base + i, type, simYear: now - ago, cellId: -1, title, description, causes: causes.map((c) => base + c), causeWeights: causes.map(() => 1), effects: [], importance: 1, ...extra });
    const list = [
      ev(0, 'war', 120, 'War between Thutath and Levak', 'Farpa and Fartsar are not the same kind of people, and the land between them is not enough for both. They fight.', []),
      ev(1, 'arms-race', 110, 'Farpa and Fartsar arm against each other', 'Since "War between Thutath and Levak" neither Farpa nor Fartsar has stood its soldiers down. Each watches what the other\'s smiths are making, and orders the same, and better.', [0]),
      ev(2, 'assassination', 60, 'Lakra of Fartsar is poisoned', 'A cup is carried to Lakra at the court of Petsar by a servant who has been in the pay of Farpa for a year. By morning Lakra is dead.', [1], { hidden: true, importance: 0 }),
      ev(3, 'ruler-death', 60, 'Lakra of Fartsar is dead', 'Lakra, who ruled Fartsar for 32 years, has died after a short illness. The court is in mourning.', [2]),
      ev(4, 'civil-war', 60, 'Civil war in Fartsar', 'Lakra died after a short illness, and two children of the House of Petsar both claim Petsar. Mabpa is crowned there.', [3, 2]),
      ev(5, 'theft', 40, 'Fartsar steals the secret of barge canals', 'A clerk in the archive at Ahpa is paid more by Fartsar than Farpa pays him. What Farpa knows of barge canals leaves the country in a bale of cloth.', [1], { hidden: true, importance: 0 }),
      ev(6, 'craft-learned', 40, 'Barge canals in Fartsar', 'Barge canals are known in Petsar now, and practised. In Fartsar it is said that their own scholars found the way.', [5]),
    ];
    const events = g.state.events.slice();
    for (const e of list) events[e.id] = e;
    g.update({ hintStep: 9, events, chronicle: list.filter((e) => !e.hidden).map((e) => e.id), hiddenIds: list.filter((e) => e.hidden).map((e) => e.id), revealed: [], truth, panel: 'chronicle', whyEvent: base + 4 });
  }, truth);
  await setUp(false);
  await h.page.waitForTimeout(1200);
  await h.page.mouse.move(500, 20);
  await h.page.screenshot({ path: `${out}/e39-truth-off.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  await setUp(true);
  await h.page.waitForTimeout(1200);
  await h.page.screenshot({ path: `${out}/e39-truth-on.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
