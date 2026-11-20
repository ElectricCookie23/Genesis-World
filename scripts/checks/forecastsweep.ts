// How forecasts fare over a history: how many are made, of which kind, and how many of each basis come true.
// npx vite-node scripts/checks/forecastsweep.ts [seed] [years]
import { Simulation } from '../../src/sim/simulation';
const seed = process.argv[2] ?? 'amber-reef-101';
const years = Number(process.argv[3] ?? 8000);
const sim = new Simulation(seed, 21);
for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
const began = sim.simYear;
let y = 0;
for (; y < years && sim.civ.historyLive; y += 2) sim.step(2);
const info = sim.forecast.info(), all = sim.forecast.list;
console.log(seed, 'history from', Math.round(began / 1e6), 'My, ran', y, 'years; live', sim.civ.historyLive);
console.log('forecasts', all.length, '| reckoned kept/failed', info.reckoned.join('/'), '| guessed kept/failed', info.guessed.join('/'), '| open', all.filter((f) => f.outcome === 'open').length);
const kinds: Record<string, number[]> = {};
for (const f of all) { const k = (kinds[f.kind] ??= [0, 0, 0]); k[f.outcome === 'kept' ? 0 : f.outcome === 'failed' ? 1 : 2]!++; }
console.log(Object.entries(kinds).map(([k, v]) => `${k} ${v.join('/')}`).join(' | '));
for (const f of all.slice(0, 3).concat(all.slice(-3))) console.log(' ', Math.round(f.year - began), f.basis, f.outcome, '|', f.by, ':', f.text, f.from ? `(${f.from})` : '');
const e = sim.events.events.filter((x) => x.type === 'forecast-kept').pop();
if (e) console.log('\n', e.title, '\n', e.description);
