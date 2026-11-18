import { Simulation } from '../src/sim/simulation';
import { SLOTS } from '../src/sim/plants';
const sim = new Simulation('amber-reef-101', 36);
for (let y = 0; y < 30e6; y += 15000) sim.step(15000);
const reg = sim.regions, p = sim.plants;
let seaRegions = 0, occupied = 0, kSum = 0, shallowSum = 0;
const hist = new Array(8).fill(0);
for (let r = 0; r < reg.count; r++) {
  const sea = 1 - reg.land[r]!;
  if (sea < 0.5) continue;
  seaRegions++;
  shallowSum += reg.shallow[r]!;
  let c = 0;
  for (let s = 0; s < SLOTS; s++) if (p.slotSp[r * SLOTS + s]! >= 0) c += p.slotCover[r * SLOTS + s]!;
  if (c > 0) occupied++;
  kSum += c;
  hist[Math.min(7, Math.floor((reg.temp[r]! + 5) / 5))]++;
}
console.log({ regions: reg.count, seaRegions, occupied, cover: kSum.toFixed(1), meanShallow: (shallowSum / seaRegions).toFixed(3), tempHist: hist.join(','), living: p.living });
const sp = p.species.filter((s) => s.extinctYear < 0).slice(0, 5);
for (const s of sp) console.log(s.id, 'cover', s.cover.toFixed(1), 'regions', s.regions, 'leaf', s.genes[1]!.toFixed(2), 'water', s.genes[9]!.toFixed(2), 'height', s.genes[0]!.toFixed(2), 'rate', s.rate.toFixed(2));
// capacity stats for the widest species
const top = p.species.filter((s) => s.extinctYear < 0).sort((a, b) => b.cover - a.cover)[0]!;
let ok = 0, okEmpty = 0, kTot = 0;
const cap = (p as any).capacity.bind(p);
for (let r = 0; r < reg.count; r++) {
  const k = cap(top, r);
  if (k > 0.03) {
    ok++; kTot += k;
    let any = false;
    for (let s = 0; s < SLOTS; s++) if (p.slotSp[r * SLOTS + s]! >= 0) any = true;
    if (!any) okEmpty++;
  }
}
console.log('top species', top.id, 'cover', top.cover.toFixed(1), 'regions', top.regions, 'habitable regions', ok, 'of which empty', okEmpty, 'K total', kTot.toFixed(1), 'disp', top.genes[8]!.toFixed(2), 'growth', top.genes[7]!.toFixed(2));
let calls = 0, okc = 0;
const orig = p.seed.bind(p);
p.seed = (r: number, s: number, c: number) => { calls++; const res = orig(r, s, c); if (res) okc++; return res; };
const before = occupied;
for (let k = 0; k < 20; k++) sim.step(15000);
let occ2 = 0;
for (let r = 0; r < reg.count; r++) { let any = false; for (let s = 0; s < SLOTS; s++) if (p.slotSp[r * SLOTS + s]! >= 0) any = true; if (any) occ2++; }
console.log('seed calls', calls, 'succeeded', okc, 'occupied before', before, 'after(all regions)', occ2);
// adjacency: empty habitable neighbours of occupied regions
let frontier = 0;
for (let r = 0; r < reg.count; r++) {
  let any = false; for (let s = 0; s < SLOTS; s++) if (p.slotSp[r * SLOTS + s]! >= 0) any = true;
  if (!any) continue;
  for (let j = 0; j < reg.grid.ncount[r]!; j++) {
    const nb = reg.grid.neighbors[r * 6 + j]!;
    let anyN = false; for (let s = 0; s < SLOTS; s++) if (p.slotSp[nb * SLOTS + s]! >= 0) anyN = true;
    if (!anyN && cap(top, nb) > 0.03) frontier++;
  }
}
console.log('empty habitable neighbours of occupied regions', frontier);
let shown2 = 0;
for (let r = 0; r < reg.count && shown2 < 3; r++) {
  let any = false; for (let s = 0; s < SLOTS; s++) if (p.slotSp[r * SLOTS + s]! >= 0) any = true;
  if (!any) continue;
  shown2++;
  console.log(`region ${r} land ${reg.land[r]!.toFixed(2)} shallow ${reg.shallow[r]!.toFixed(2)} T ${reg.temp[r]!.toFixed(1)} K ${cap(top, r).toFixed(3)} slots ${[0,1,2,3].map((s) => p.slotSp[r*SLOTS+s] + ':' + p.slotCover[r*SLOTS+s]!.toFixed(3)).join(' ')}`);
  for (let j = 0; j < reg.grid.ncount[r]!; j++) {
    const nb = reg.grid.neighbors[r * 6 + j]!;
    console.log(`   nb ${nb} land ${reg.land[nb]!.toFixed(2)} shallow ${reg.shallow[nb]!.toFixed(2)} T ${reg.temp[nb]!.toFixed(1)} K ${cap(top, nb).toFixed(3)} slots ${[0,1,2,3].map((s) => p.slotSp[nb*SLOTS+s]).join(',')}`);
  }
}
console.log('top leaf', top.genes[1]!.toFixed(2));
