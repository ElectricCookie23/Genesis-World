// Music of the world (system E27): print the music of two made-up peoples and of one of them's daughter, with
// the notes of a phrase; with a file name, write the traditions for the page check.
// Usage: npx vite-node scripts/music.ts [json]
import * as fs from 'fs';
import { describeMusic, musicDistance, phrase, tradition, type Players } from '../src/sim/history/music';
const walkers: Players = { size: 0.75, water: 0.05, flight: 0, hearing: 0.4, harsh: 0.6, quick: 0.3, limbs: 0.5, land: ['beasts', 'forest', 'ore'] };
const fliers: Players = { size: 0.2, water: 0.1, flight: 0.9, hearing: 0.8, harsh: 0.2, quick: 0.8, limbs: 0.25, land: ['coast', 'river', 'sand'] };
const list = [
  { name: 'heavy walkers of the forest, Age of Kilns', t: tradition([1111], walkers, 2), era: 2 },
  { name: 'their daughter people', t: tradition([1111, 26], walkers, 2), era: 2 },
  { name: 'the walkers in their Age of Signals', t: tradition([1111], walkers, 7), era: 7 },
  { name: 'small fliers of the coast, Age of Sails', t: tradition([2222], fliers, 4), era: 4 },
];
for (const x of list) {
  const notes = phrase(x.t, 0, x.era).filter((n) => !x.t.instruments[n.instrument]!.beat).slice(0, 10).map((n) => Math.round(n.hz));
  console.log(`${x.name}:\n  ${describeMusic(x.t)}\n  scale (cents) ${x.t.scale.join(' ')}; home ${Math.round(x.t.home)} Hz; ${x.t.tempo} beats a minute in ${x.t.meter}; tune (Hz) ${notes.join(' ')}`);
}
console.log(`distances: mother and daughter ${musicDistance(list[0]!.t, list[1]!.t).toFixed(2)}, the same people five ages on ${musicDistance(list[0]!.t, list[2]!.t).toFixed(2)}, walkers and fliers ${musicDistance(list[0]!.t, list[3]!.t).toFixed(2)}`);
const json = process.argv[2];
if (json) fs.writeFileSync(json, JSON.stringify(list.map((x, i) => ({ id: i, era: x.era, music: { tradition: x.t, about: describeMusic(x.t) } }))));
