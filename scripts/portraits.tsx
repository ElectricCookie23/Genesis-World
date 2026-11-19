// Draw a sheet of portraits (system E6) for a seed's first thinking species, or for random genomes,
// one row per manner of portrait and one column per calling. Writes an HTML file to look at.
// Usage: npx vite-node scripts/portraits.tsx <out.html> [seed number]
import { h, type VNode } from 'preact';
import { writeFileSync } from 'node:fs';
import { Portrait, ART_NAMES } from '../src/ui/portrait';
import { GENE_COUNT } from '../src/sim/genetics';
import { RNG } from '../src/sim/rng';
/** Just enough of a renderer to turn the portrait's elements into SVG text. */
function render(node: unknown): string {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (Array.isArray(node)) return node.map(render).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const v = node as VNode<Record<string, unknown>>;
  if (typeof v.type === 'function') return render((v.type as (p: unknown) => unknown)(v.props));
  let attrs = '', inner = '';
  for (const [k, val] of Object.entries(v.props)) {
    if (k === 'children') inner = render(val);
    else if (k === 'dangerouslySetInnerHTML') inner = (val as { __html: string }).__html;
    else if (k === 'style' && val && typeof val === 'object') attrs += ` style="${Object.entries(val).map(([a, b]) => `${a.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${b}`).join(';')}"`;
    else if (val !== undefined && val !== null && val !== false && typeof val !== 'function') attrs += ` ${k}="${String(val).replace(/"/g, '&quot;')}"`;
  }
  return `<${v.type}${attrs}>${inner}</${v.type}>`;
}

const [out = 'portraits.html', seedArg = '7'] = process.argv.slice(2);
const rng = new RNG(Number(seedArg));
const ROLES = ['ruler', 'founder', 'general', 'prophet', 'explorer', 'artist', 'scholar', 'inventor'];
const rows: string[] = [];
for (let sp = 0; sp < 2; sp++) {
  const genes = new Float32Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) genes[i] = rng.next();
  for (let style = 0; style < 5; style++) {
    const cells = ROLES.map((role, k) => render(h(Portrait, { genes, era: style * 2, role, seed: sp * 1000 + style * 10 + k + 1, bold: rng.next(), cruel: rng.next(), width: 220 })));
    rows.push(`<div class="row"><span>${ART_NAMES[style]}</span>${cells.join('')}</div>`);
  }
}
writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>body{background:#14161a;color:#ccc;font:12px system-ui;margin:12px}.row{display:flex;gap:8px;align-items:center;margin:0 0 8px}.row span{width:90px}</style>${rows.join('\n')}`);
console.log('wrote', out);
