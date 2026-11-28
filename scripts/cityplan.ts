// Draw town plans (system E11) as SVG, to look at: the same generator the renderer uses.
// Usage: npx vite-node scripts/cityplan.ts <out.html>
import { writeFileSync } from 'node:fs';
import { planCity, planShape, type CitySite, type CityPlan } from '../src/render/gfx/cityplan';
const [out = 'cityplan.html'] = process.argv.slice(2);
const COLOUR = { market: '#f2c14e', school: '#c9a0ff', homes: '#d8d2c4', workshops: '#d9825b', docks: '#6fb8d8' } as const;
function draw(site: CitySite, plan: CityPlan, n: number, title: string): string {
  const S = 9, C = 260;
  const P = (x: number, y: number) => `${(C + x * S).toFixed(1)},${(C - y * S).toFixed(1)}`;
  let svg = `<svg width="520" height="520" viewBox="0 0 520 520" style="background:#5d7a4a">`;
  if (Number.isFinite(site.shore)) {
    // water beyond the shore
    const cx = Math.cos(site.coast), cy = Math.sin(site.coast);
    const pts: string[] = [];
    for (let t = -40; t <= 40; t += 1) { const d = site.shore + 0.6 * Math.sin(t * 0.45 + site.seed % 7); pts.push(P(cx * d - cy * t, cy * d + cx * t)); }
    pts.push(P(cx * 80 - cy * 40, cy * 80 + cx * 40), P(cx * 80 + cy * 40, cy * 80 - cx * 40));
    svg += `<polygon points="${pts.join(' ')}" fill="#2f6f9a"/>`;
  }
  for (const s of plan.streets) if (s.order <= n) svg += `<polyline points="${s.points.map((p) => P(p[0], p[1])).join(' ')}" fill="none" stroke="#c9b48a" stroke-width="${s.rank === 0 ? 4 : s.rank === 1 ? 2.6 : 1.6}" stroke-linecap="round"/>`;
  for (const w of plan.walls) if (w.order <= n) {
    let run: string[] = [];
    const flush = () => { if (run.length > 1) svg += `<polyline points="${run.join(' ')}" fill="none" stroke="#3a3530" stroke-width="3"/>`; run = []; };
    for (const p of w.points) { if (Number.isNaN(p[0])) flush(); else run.push(P(p[0], p[1])); }
    flush();
    for (const g of w.gates) svg += `<circle cx="${C + g[0] * S}" cy="${C - g[1] * S}" r="4" fill="#efe6d2" stroke="#3a3530"/>`;
  }
  plan.plots.slice(0, n).forEach((p) => { svg += `<rect x="${-3.2}" y="${-3.2}" width="6.4" height="6.4" fill="${COLOUR[p.district]}" stroke="#2b2620" stroke-width="0.6" transform="translate(${C + p.x * S} ${C - p.y * S}) rotate(${(-p.yaw * 180) / Math.PI})"/>`; });
  if (plan.school && site.school) svg += `<circle cx="${C + plan.school[0] * S}" cy="${C - plan.school[1] * S}" r="7" fill="#c9a0ff" stroke="#2b2620"/>`;
  svg += `<text x="10" y="20" fill="#fff" font-family="system-ui" font-size="13">${title} (${n} plots)</text></svg>`;
  return svg;
}
const sites: [string, CitySite][] = [
  ['Inland crossroads, a capital, never attacked', { seed: 11, roads: [0.3, 2.2, 3.9, 5.2], coast: 0, shore: Infinity, uphill: 1.2, slope: 0.05, school: false, port: false, capital: true, walls: [] }],
  ['Harbour town under a hill, a school, walled twice', { seed: 23, roads: [2.6, 4.4], coast: 0.4, shore: 5, uphill: 3.3, slope: 0.5, school: true, port: true, capital: false, walls: [30, 140] }],
  ['Valley town on a steep slope, one road through', { seed: 37, roads: [1.0, 4.1], coast: 0, shore: Infinity, uphill: 2.6, slope: 0.9, school: true, port: false, capital: false, walls: [60] }],
  // (system E36) the same harbour site, planted as a colony: surveyed before anyone lived there
  ['The same harbour, planted as a colony: ruled streets square to the shore', { seed: 23, roads: [2.6, 4.4], coast: 0.4, shore: 5, uphill: 3.3, slope: 0.5, school: true, port: true, capital: false, walls: [30, 140], planted: true }],
];
let html = `<!doctype html><meta charset="utf-8"><body style="background:#14161a;color:#ccc;font:12px system-ui;margin:10px"><div style="display:flex;flex-wrap:wrap;gap:8px">`;
for (const [title, site] of sites) {
  const plan = planCity(site);
  for (const n of [12, 60, 320]) html += draw(site, plan, Math.min(n, plan.plots.length), title);
  const sh = planShape(plan);
  console.log(`${title}: ${plan.plots.length} plots, ${plan.streets.length} streets, walls ${plan.walls.length}, stretch ${sh.stretch.toFixed(2)}, lean ${sh.lean.map((v) => v.toFixed(1)).join(',')}, ${Object.entries(sh.share).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' ')}`);
}
writeFileSync(out, html + '</div>');
console.log('wrote', out);
