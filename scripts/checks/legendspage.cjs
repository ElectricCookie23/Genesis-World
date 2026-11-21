// The old-bones panel (system E28) with two made-up stories, one of them worked out.
const { open } = require('./h.cjs');
(async () => {
  const out = process.argv[2];
  const h = await open('webgl', '&fresh&noadapt&dsize=128&esize=128&eiter=60', [1000, 700]);
  await h.page.waitForTimeout(7000);
  await h.page.evaluate(() => {
    const g = __genesis; g.setSpeed(0);
    const now = g.state.stats.simYear;
    g.update({ hintStep: 9, panel: 'legends', legends: [
      { id: 1, year: now - 300, nation: 'Kekaka', town: 'Ka', cell: 100, species: 3, speciesName: 'Sarortherium ingens', extinctYear: now - 9e7, kind: 'sea-beast', own: 'Nanatka', means: 'the Stone Swimmers', found: 'the mine at Ka', tale: 'The diggers at the mine at Ka break into a bed of bones as long as a boat, heavy as rock. They are plainly a swimmer\'s, and the sea is days away. So the story is that Nanatka, the Stone Swimmers, came up the rivers in a year when the sea stood higher than the hills, and were left behind when it went home.', eventId: 1 },
      { id: 0, year: now - 3600, nation: 'Kekananat', town: 'Lukananat', cell: 200, species: 5, speciesName: 'Neoaus lux', extinctYear: now - 9.1e7, kind: 'giant', own: 'Kogeiyra', means: 'the Old Great Ones', found: 'a well being sunk at Lukananat', tale: 'Digging at a well being sunk at Lukananat, they come on bones longer than a hall, turned to stone. They are taken for the bones of Kogeiyra, the Old Great Ones, a people too large for houses, who are said to have piled up the hills for somewhere to sit and to have been too heavy to outlast one hard winter.', eventId: 2, known: { year: now - 200, nation: 'Kekamats', text: 'It was not what the story says: it was an animal, a walker on 4 legs, about 14 metres long, that ate plants. Nothing like it is alive; its nearest living kin, a long way off, is Arcana venenatus.', eventId: 3 } },
    ] });
  });
  await h.page.waitForTimeout(1200);
  await h.page.mouse.move(700, 300);
  await h.page.screenshot({ path: `${out}/e28-old-bones.png`, timeout: 120000 }).catch((e) => console.log('shot failed', String(e).slice(0, 60)));
  console.log('console:', [...new Set(h.log)].filter((x) => !x.includes('ReadPixels') && !x.includes('MANIFEST') && !x.includes('404')).slice(0, 6).join('\n') || 'no errors');
  await h.browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
