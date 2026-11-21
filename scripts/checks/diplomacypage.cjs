// The web of diplomacy (system E34): seven made-up countries and every kind of tie between them.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 760]);
  await h.page.waitForTimeout(7000);
  await h.page.evaluate(() => {
    const g = __genesis; g.setSpeed(0);
    const now = g.state.stats.simYear;
    const names = ['Kekaka', 'Farahot', 'Gekonro', 'Mokro', 'Nalemat', 'Gikaniii', 'Gikadapat'];
    const nations = names.map((name, i) => ({ id: i, name, hue: i / 7, u: 0.2 + 0.6 * ((i * 0.37) % 1), v: 0.25 + 0.5 * ((i * 0.61) % 1), pop: 200 + i * 150 }));
    const tie = (a, b, kind, label) => ({ a, b, kind, since: now - 40, eventId: -1, label });
    g.update({ hintStep: 9, panel: 'diplomacy', diplomacy: { nations, ties: [
      tie(5, 6, 'war', 'Gikaniii is at war with Gikadapat.'), tie(1, 3, 'grudge', 'Mokro has not forgotten what Farahot did.'), tie(0, 1, 'alliance', 'Kekaka and Farahot are allies.'),
      tie(2, 4, 'marriage', 'The ruling houses of Gekonro and Nalemat are joined by marriage.'), tie(3, 4, 'peace', 'Mokro and Nalemat have sworn peace.'), tie(0, 2, 'trade-pact', 'Kekaka and Gekonro have a pact of trade.'),
      tie(4, 5, 'trade', 'Nalemat sells to Gikaniii.'), tie(0, 6, 'contact', 'Kekaka and Gikadapat are in touch.'), tie(2, 3, 'contact', 'Gekonro and Mokro are in touch.'),
    ], betrayals: [{ by: 'Farahot', against: 'Mokro', year: now - 60, eventId: -1, avenged: -1 }] } });
  });
  await h.page.waitForTimeout(1200);
  await h.page.mouse.move(40, 720);
  await h.page.screenshot({ path: `${out}/e34-diplomacy.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
