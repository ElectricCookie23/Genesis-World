// A sheet of animals drawn straight from the model builder: each alone, from the side and from three-quarters, in
// plain shaded colour. For judging shapes (not skins or lighting) before and after a change to `creaturemesh.ts`.
// Usage: npx vite-node scripts/checks/speciessheet.ts <out.svg> [random]
import { writeFileSync } from 'node:fs';
import { buildCreatureModel } from '../../src/render/gfx/creaturemesh';
import { G } from '../../src/sim/genetics';
import { RNG } from '../../src/sim/rng';

const out = process.argv[2] ?? 'species-sheet.svg';
const random = process.argv[3] === 'random';
const rng = new RNG(12345);
const ARCH: [string, Partial<Record<number, number>>][] = [
  ['woolly grazer', { [G.Size]: 0.5, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.6, [G.Neck]: 0.2, [G.Tail]: 0.4, [G.Water]: 0.05, [G.Diet]: 0.1, [G.Insulation]: 0.9, [G.EyeCount]: 0.34 }],
  ['long-necked browser', { [G.Size]: 0.75, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.8, [G.Neck]: 0.95, [G.Tail]: 0.5, [G.Water]: 0.05, [G.Diet]: 0.05, [G.EyeCount]: 0.34 }],
  ['hunter', { [G.Size]: 0.45, [G.LimbType]: 0.6, [G.LimbPairs]: 0.5, [G.LimbLength]: 0.5, [G.Tail]: 0.7, [G.Water]: 0.05, [G.Diet]: 0.95, [G.Horn]: 0.1, [G.EyeCount]: 0.34, [G.Head]: 0.6 }],
  ['flier', { [G.Size]: 0.3, [G.LimbType]: 0.9, [G.LimbPairs]: 0.3, [G.LimbLength]: 0.7, [G.Tail]: 0.4, [G.Water]: 0.05, [G.Diet]: 0.4, [G.EyeCount]: 0.34, [G.Insulation]: 0.8 }],
  ['swimmer', { [G.Size]: 0.6, [G.LimbType]: 0.4, [G.LimbPairs]: 0.4, [G.LimbLength]: 0.5, [G.Tail]: 0.8, [G.Water]: 1, [G.Diet]: 0.3, [G.EyeCount]: 0.34 }],
  ['armoured crawler', { [G.Size]: 0.55, [G.LimbType]: 0.6, [G.LimbPairs]: 0.9, [G.LimbLength]: 0.2, [G.Armor]: 0.9, [G.Horn]: 0.7, [G.Tail]: 0.3, [G.Water]: 0.05, [G.Diet]: 0.1, [G.Segments]: 0.6, [G.EyeCount]: 0.7 }],
  ['young-world default', { [G.LimbPairs]: 0.3, [G.LimbType]: 0.6, [G.Water]: 0.2, [G.EyeCount]: 0.34 }],
  ['limbless swimmer', { [G.LimbPairs]: 0.05, [G.Water]: 0.9, [G.Tail]: 0.6, [G.EyeCount]: 0.34 }],
];
const genomes: [string, Float32Array][] = [];
for (let k = 0; k < (random ? 8 : ARCH.length); k++) {
  const genes = new Float32Array(G.COUNT as number);
  for (let i = 0; i < genes.length; i++) genes[i] = random ? rng.next() : 0.15 + rng.next() * 0.3;
  if (!random) { genes[G.Armor] = 0.1; genes[G.Horn] = 0.05; genes[G.Ornament] = 0.1; genes[G.Glow] = 0.1; for (const g in ARCH[k]![1]) genes[Number(g)] = ARCH[k]![1][Number(g)]!; }
  // each archetype in its own pair of colours, so that the two-tone skin can be judged
  if (!random) { genes[G.Hue] = (k * 0.137 + 0.05) % 1; genes[G.Hue2] = (k * 0.137 + 0.5) % 1; }
  genomes.push([random ? `random ${k + 1}` : ARCH[k]![0], genes]);
}

const CW = 420, CH = 300;
let svg = '';
genomes.forEach(([name, genes], row) => {
  const geo = buildCreatureModel(genes).geometry;
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal'), col = geo.getAttribute('color'), idx = geo.getIndex()!;
  // fur shells are copies of the skin pushed outward: leave them out (they carry a shell number in rig2.y)
  const rig2 = geo.getAttribute('rig2');
  for (let view = 0; view < 2; view++) {
    const yaw = view === 0 ? 0 : -0.65, pitch = view === 0 ? 0 : 0.28;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const tf = (x: number, y: number, z: number): [number, number, number] => { const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const P: [number, number, number][] = [], N: [number, number, number][] = [];
    for (let i = 0; i < pos.count; i++) {
      const p = tf(pos.getX(i), pos.getY(i), pos.getZ(i)); P.push(p); N.push(tf(nrm.getX(i), nrm.getY(i), nrm.getZ(i)));
      if (rig2.getY(i) > 0 && rig2.getY(i) <= 1 && rig2.getX(i) <= 1 && rig2.getZ(i) === 0 && rig2.getW(i) === 0 && false) continue;
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
    const scale = Math.min((CW - 40) / (maxX - minX), (CH - 50) / (maxY - minY));
    const ox = view * CW + CW / 2 - ((minX + maxX) / 2) * scale, oy = row * CH + CH / 2 + 10 + ((minY + maxY) / 2) * scale;
    const tris: { z: number; d: string }[] = [];
    const light = [0.35, 0.75, 0.56];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const pa = P[a]!, pb = P[b]!, pc = P[c]!;
      // facing the viewer only
      const cross = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
      const n = [(N[a]![0] + N[b]![0] + N[c]![0]) / 3, (N[a]![1] + N[b]![1] + N[c]![1]) / 3, (N[a]![2] + N[b]![2] + N[c]![2]) / 3];
      const shade = 0.35 + 0.75 * Math.max(0, n[0]! * light[0]! + n[1]! * light[1]! + n[2]! * light[2]!);
      const r = Math.round(255 * Math.min(1, Math.sqrt(((col.getX(a) + col.getX(b) + col.getX(c)) / 3) * shade)));
      const g = Math.round(255 * Math.min(1, Math.sqrt(((col.getY(a) + col.getY(b) + col.getY(c)) / 3) * shade)));
      const bl = Math.round(255 * Math.min(1, Math.sqrt(((col.getZ(a) + col.getZ(b) + col.getZ(c)) / 3) * shade)));
      void cross;
      tris.push({ z: (pa[2] + pb[2] + pc[2]) / 3, d: `<path d="M${(ox + pa[0] * scale).toFixed(1)} ${(oy - pa[1] * scale).toFixed(1)}L${(ox + pb[0] * scale).toFixed(1)} ${(oy - pb[1] * scale).toFixed(1)}L${(ox + pc[0] * scale).toFixed(1)} ${(oy - pc[1] * scale).toFixed(1)}Z" fill="rgb(${r},${g},${bl})" stroke="rgb(${r},${g},${bl})" stroke-width="0.6"/>` });
    }
    tris.sort((p, q) => p.z - q.z);
    svg += tris.map((t) => t.d).join('');
  }
  svg += `<text x="10" y="${row * CH + 18}" font-family="monospace" font-size="13" fill="#333">${name} (${Math.round(geo.getIndex()!.count / 3).toLocaleString('en-US')} triangles)</text>`;
});
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${CW * 2}" height="${CH * genomes.length}" viewBox="0 0 ${CW * 2} ${CH * genomes.length}"><rect width="100%" height="100%" fill="#d9d4c7"/>${svg}</svg>`);
console.log('wrote', out);
