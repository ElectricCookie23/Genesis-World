// Writing systems (system E23): draw every sign of a script at five stages of wear, as an SVG sheet.
// Usage: npx vite-node scripts/glyphs.ts <out.svg> [scriptId] [hand 0|1]
import * as fs from 'fs';
import { LEXICON } from '../src/sim/history/syntax';
import { hashText, hash32 } from '../src/sim/history/hash';
import { glyphDistance, glyphPath, picture, wornGlyph, type Body } from '../src/sim/history/script';
const [out = 'glyphs.svg', id = '3', hand = '0'] = process.argv.slice(2);
const body: Body = { legs: 2, neck: 0.5, horn: 0.7, wings: 0, tail: 0.6 };
const stages = [0, 0.25, 0.5, 0.75, 0.95];
const C = 46, cols = 3, W = 70 + stages.length * C + 16;
const rows = Math.ceil(LEXICON.length / cols);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * W}" height="${rows * (C + 6) + 10}" style="background:#14161c"><g font-family="sans-serif" font-size="11" fill="#9a958a">`;
let traced = 0, quarter = 0, half = 0;
LEXICON.forEach((m, k) => {
  const x0 = (k % cols) * W + 8, y0 = Math.floor(k / cols) * (C + 6) + 6;
  svg += `<text x="${x0}" y="${y0 + C / 2 + 4}">${m}</text>`;
  const seed = hash32(Number(id), 0x5c1);
  stages.forEach((t, i) => {
    const g = wornGlyph(picture(m, body), t, seed, hashText(m));
    svg += `<g transform="translate(${x0 + 62 + i * C},${y0})"><path d="${glyphPath(g, C - 8, hand === '1' && t < 0.85)}" fill="none" stroke="${['#b9a48c', '#c9bda6', '#d8cdb8', '#e6dfd0', '#f2eee4'][i]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  });
  const late = wornGlyph(picture(m, body), 0.95, seed, hashText(m)), own = glyphDistance(picture(m, body), late);
  const others = LEXICON.filter((o) => o !== m).map((o) => glyphDistance(picture(o, body), late)).sort((a, b) => a - b);
  if (others.filter((d) => d < own).length <= 2) traced++;
  if (own < others[Math.floor(others.length / 4)]!) quarter++;
  if (own < others[Math.floor(others.length / 2)]!) half++;
});
svg += '</g></svg>';
fs.writeFileSync(out, svg);
console.log(`of ${LEXICON.length} worn signs: ${traced} are closest to their own picture (or all but two others), ${quarter} closer to it than to three quarters of the other pictures, ${half} closer than to half`);
