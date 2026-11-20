// How the thinking species of several worlds build (system E13): grow each world to its dawn on a small
// grid and print the architecture that follows from the builders' bodies.
// Usage: npx vite-node scripts/architecture.ts <gridN> <seed...>
import { Simulation } from '../src/sim/simulation';
import { architectureOf, describeArchitecture, architectureDistance } from '../src/render/gfx/architecture';
import { G } from '../src/sim/genetics';
const [n = '17', ...seeds] = process.argv.slice(2);
const list = seeds.length ? seeds : ['amber-reef-101', 'coral-dune-303', 'ember-moss-404', 'slate-iris-707', 'jade-fjord-505'];
const found: { seed: string; a: ReturnType<typeof architectureOf> }[] = [];
for (const seed of list) {
  const sim = new Simulation(seed, Number(n));
  for (let t = 0; t < 300e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
  if (!sim.civ.historyActive) { console.log(seed, 'no history'); continue; }
  const sp = sim.creatures.species[sim.civ.h.nations[0]!.species]!;
  const a = architectureOf(sp.ref);
  found.push({ seed, a });
  const g = sp.ref;
  console.log(`${seed}: ${sp.name} | neck ${g[G.Neck]!.toFixed(2)} limbs ${g[G.LimbType]!.toFixed(2)}/${g[G.LimbLength]!.toFixed(2)} ratio ${g[G.BodyRatio]!.toFixed(2)} burrow ${g[G.Burrow]!.toFixed(2)} water ${g[G.Water]!.toFixed(2)} | rise ${a.rise.toFixed(2)} girth ${a.girth.toFixed(2)} lift ${a.lift.toFixed(2)} wade ${a.wade.toFixed(2)} round ${a.round.toFixed(2)}`);
  console.log('   ' + describeArchitecture(a, 'timber'));
  console.log(`   size ${g[G.Size]!.toFixed(2)} ornament ${g[G.Ornament]!.toFixed(2)} armor ${g[G.Armor]!.toFixed(2)} sociality ${g[G.Sociality]!.toFixed(2)} aggression ${g[G.Aggression]!.toFixed(2)} nocturnal ${g[G.Nocturnal]!.toFixed(2)} eyes ${g[G.EyeCount]!.toFixed(2)} segments ${g[G.Segments]!.toFixed(2)} insulation ${g[G.Insulation]!.toFixed(2)} horn ${g[G.Horn]!.toFixed(2)} curiosity ${g[G.Curiosity]!.toFixed(2)}`);
}
for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) console.log(`  ${found[i]!.seed} vs ${found[j]!.seed}: distance ${architectureDistance(found[i]!.a, found[j]!.a).toFixed(2)}`);
