// Civilization, abstracted: settlements are entities with population, technology and beliefs.
// They are not individual people. A lineage that crosses the intelligence threshold founds them.
import { G, GENE_COUNT, P, PHEN_COUNT, computePhenotype } from './genetics';
import { placeName } from './names';
import type { RNG } from './rng';
import type { Simulation } from './simulation';

export interface Settlement {
  id: number;
  name: string;
  cell: number;
  region: number;
  species: number;
  /** People, in thousands. */
  pop: number;
  /** 0 camp, 0.3 village, 0.6 city, 1 great city. */
  tech: number;
  founded: number;
  /** Event the people's beliefs are founded on, or -1. */
  belief: number;
  eventId: number;
  ruined: number; // year it was abandoned, or -1
  painted: boolean;
  temple: boolean;
  farms: boolean;
}

export const INTELLIGENCE_THRESHOLD = 0.57;

export class Civilization {
  settlements: Settlement[] = [];
  /** Species that have crossed the threshold. */
  sapient: number[] = [];
  living = 0;
  maxTech = 0;
  private occupied = new Map<number, number>(); // region -> settlement id

  step(sim: Simulation, rng: RNG, tau: number): void {
    const cr = sim.creatures, reg = sim.regions, w = sim.world;
    // a lineage crosses the threshold: clever, social, and numerous enough to keep what it learns
    for (const s of cr.species) {
      if (s.extinctYear >= 0 || this.sapient.includes(s.id) || !s.name) continue;
      if (s.ref[G.Intelligence]! > INTELLIGENCE_THRESHOLD && s.ref[G.Sociality]! > 0.35 && s.pop > 2000 && cr.speciesMean(s.id, P.LandUse, true) > 0.4) {
        this.sapient.push(s.id);
        sim.civEvent('threshold', s.id, reg.centre[s.home]!, -1);
      }
    }
    if (!this.sapient.length) return;
    // found the first camps where the people live
    for (const sid of this.sapient) {
      const s = cr.species[sid]!;
      if (s.extinctYear >= 0) continue;
      const mine = this.settlements.filter((x) => x.species === sid && x.ruined < 0).length;
      if (mine === 0 && !this.occupied.has(s.home) && reg.land[s.home]! > 0.3) this.found(sim, rng, sid, s.home, -1);
    }
    let living = 0, maxTech = 0;
    for (const st of this.settlements) {
      if (st.ruined >= 0) continue;
      const s = cr.species[st.species]!;
      const food = sim.plants.landFood[st.region]! + (1 - reg.land[st.region]!) * 0.15;
      const cold = reg.landTemp[st.region]! < -4 ? 0.3 : 1;
      // farming and tools raise how many people the land can feed
      const capacity = (2 + 60 * food) * (1 + 14 * st.tech * st.tech) * cold;
      st.pop += st.pop * 0.6 * (1 - st.pop / Math.max(0.5, capacity)) * Math.min(1, tau * 2);
      // knowledge grows with people and neighbours, slowly
      const neighbours = this.neighbourCount(sim, st);
      const before = st.tech;
      st.tech = Math.min(1.2, st.tech + tau * 0.0005 * (0.4 + Math.log10(1 + st.pop)) * (1 + 0.35 * neighbours) * (0.6 + s.ref[G.Intelligence]!));
      if (!st.painted && st.tech > 0.06) {
        st.painted = true;
        // cave paintings show the animals these people really live among
        const prey = this.neighbourSpecies(sim, st, true);
        if (prey >= 0) sim.civEvent('painting', st.species, st.cell, st.id, prey);
      }
      if (!st.farms && st.tech > 0.22) {
        st.farms = true;
        sim.civEvent('farms', st.species, st.cell, st.id);
        const tame = this.neighbourSpecies(sim, st, false);
        if (tame >= 0 && cr.species[tame]!.tamedBy < 0) {
          cr.species[tame]!.tamedBy = st.species;
          sim.civEvent('tamed', st.species, st.cell, st.id, tame);
        }
      }
      if (!st.temple && st.tech > 0.3 && sim.godEvents.length >= 3) {
        st.temple = true;
        sim.civEvent('temple', st.species, st.cell, st.id);
      }
      if (st.tech >= 0.3 && before < 0.3) sim.civEvent('village', st.species, st.cell, st.id);
      if (st.tech >= 0.6 && before < 0.6) sim.civEvent('city', st.species, st.cell, st.id);
      // people move on and found daughter settlements
      if (st.pop > capacity * 0.7 && rng.chance(Math.min(0.5, 0.05 * tau * (1 + st.tech * 3)))) {
        const nb = reg.grid.neighbors[st.region * 6 + rng.int(reg.grid.ncount[st.region]!)]!;
        if (!this.occupied.has(nb) && reg.land[nb]! > 0.3 && reg.ice[nb]! < 0.5) {
          const d = this.found(sim, rng, st.species, nb, st.id);
          if (d) { d.tech = st.tech * 0.6; d.belief = st.belief; st.pop *= 0.85; }
        }
      }
      // abandonment: the people died out, or the place can no longer feed anyone
      if (s.extinctYear >= 0 || st.pop < 0.05 || w.elevation[st.cell]! <= w.seaLevel) {
        st.ruined = sim.simYear;
        this.occupied.delete(st.region);
        sim.civEvent('ruin', st.species, st.cell, st.id);
        continue;
      }
      living++;
      if (st.tech > maxTech) maxTech = st.tech;
    }
    this.living = living;
    this.maxTech = maxTech;
    this.tend(sim, tau);
    this.paint(sim);
  }

  /** A species living beside a settlement: its main prey (largest other animal) or a grazer worth taming. */
  private neighbourSpecies(sim: Simulation, st: Settlement, anyDiet: boolean): number {
    const cr = sim.creatures;
    let best = -1, bb = 0;
    for (let c = 0; c < cr.high; c++) {
      if (!cr.alive[c] || cr.region[c] !== st.region || cr.sp[c] === st.species) continue;
      const g = c * GENE_COUNT, p = c * PHEN_COUNT;
      if (cr.phen[p + P.LandUse]! < 0.4) continue;
      if (!anyDiet && (cr.genome[g + G.Diet]! > 0.35 || cr.genome[g + G.Size]! < 0.25)) continue;
      const b = cr.count[c]! * cr.phen[p + P.Mass]!;
      if (b > bb && cr.species[cr.sp[c]!]!.name) { bb = b; best = cr.sp[c]!; }
    }
    return best;
  }

  /** Tamed herds near settlements are fed and bred: calmer, more sociable, a little smaller each generation. */
  private tend(sim: Simulation, tau: number): void {
    const cr = sim.creatures;
    for (let c = 0; c < cr.high; c++) {
      if (!cr.alive[c]) continue;
      const sp = cr.species[cr.sp[c]!]!;
      if (sp.tamedBy < 0 || !this.occupied.has(cr.region[c]!)) continue;
      const g = c * GENE_COUNT;
      const k = Math.min(0.05, 0.004 * tau);
      cr.genome[g + G.Aggression] = cr.genome[g + G.Aggression]! * (1 - k);
      cr.genome[g + G.Sociality] = cr.genome[g + G.Sociality]! + (1 - cr.genome[g + G.Sociality]!) * k;
      cr.genome[g + G.Boldness] = cr.genome[g + G.Boldness]! + (0.8 - cr.genome[g + G.Boldness]!) * k;
      computePhenotype(cr.genome, g, cr.phen, c * PHEN_COUNT);
      cr.count[c] = cr.count[c]! * (1 + Math.min(0.2, 0.08 * tau));
    }
  }

  /** A sight in the sky that every young culture sees: some will build a faith on it. */
  omen(sim: Simulation, eventId: number, rng: RNG): void {
    for (const st of this.settlements) {
      if (st.ruined >= 0 || st.belief >= 0 || st.tech > 0.7 || !rng.chance(0.5)) continue;
      st.belief = eventId;
      sim.civEvent('belief', st.species, st.cell, st.id, eventId);
    }
  }

  private neighbourCount(sim: Simulation, st: Settlement): number {
    const reg = sim.regions;
    let n = 0;
    for (let j = 0; j < reg.grid.ncount[st.region]!; j++) if (this.occupied.has(reg.grid.neighbors[st.region * 6 + j]!)) n++;
    return n;
  }

  private found(sim: Simulation, rng: RNG, species: number, region: number, parent: number): Settlement | null {
    const reg = sim.regions, w = sim.world;
    // a habitable land cell in the region, preferring low ground near water
    let cell = -1, best = -Infinity;
    for (let k = reg.cellStart[region]!; k < reg.cellStart[region + 1]!; k++) {
      const c = reg.cellList[k]!;
      const h = w.elevation[c]! - w.seaLevel;
      if (h <= 0.01) continue;
      const score = -h + w.flow[c]! * 0.1 + rng.next() * 0.3;
      if (score > best) { best = score; cell = c; }
    }
    if (cell < 0) return null;
    const st: Settlement = {
      id: this.settlements.length, name: placeName(rng), cell, region, species, pop: 0.2, tech: 0.03, founded: sim.simYear, belief: -1, eventId: -1, ruined: -1, painted: false, temple: false, farms: false,
    };
    this.settlements.push(st);
    this.occupied.set(region, st.id);
    sim.civEvent(parent < 0 ? 'camp' : 'daughter', species, cell, st.id);
    return st;
  }

  /** A disaster near settlements: people die, and young cultures build beliefs on what they saw. */
  witness(sim: Simulation, eventId: number, regions: number[], kill: number[]): void {
    for (let k = 0; k < regions.length; k++) {
      const id = this.occupied.get(regions[k]!);
      if (id === undefined) continue;
      const st = this.settlements[id]!;
      st.pop *= 1 - Math.min(0.9, kill[k]!);
      if (st.belief < 0 && st.tech < 0.7) {
        st.belief = eventId;
        sim.civEvent('belief', st.species, st.cell, st.id, eventId);
      }
    }
  }

  /** Paint night lights, farmland and roads onto the planet's cells. */
  private paint(sim: Simulation): void {
    const { lights, fields, elevation, seaLevel } = sim.world;
    lights.fill(0);
    fields.fill(0);
    const g = sim.grid, reg = sim.regions;
    for (const st of this.settlements) {
      if (st.ruined >= 0) continue;
      const glow = Math.min(1, 0.12 + st.tech * 0.9);
      lights[st.cell] = Math.max(lights[st.cell]!, glow);
      for (let j = 0; j < g.ncount[st.cell]!; j++) {
        const nb = g.neighbors[st.cell * 6 + j]!;
        if (elevation[nb]! <= seaLevel) continue;
        if (st.tech > 0.45) lights[nb] = Math.max(lights[nb]!, glow * (st.tech - 0.4) * 0.9);
        if (st.farms) {
          fields[nb] = Math.max(fields[nb]!, Math.min(1, st.tech * 1.4));
          // big cities are ringed by a second belt of farms
          if (st.tech > 0.7) for (let k = 0; k < g.ncount[nb]!; k++) {
            const n2 = g.neighbors[nb * 6 + k]!;
            if (elevation[n2]! > seaLevel) fields[n2] = Math.max(fields[n2]!, 0.6);
          }
        }
      }
      // roads: lit ways between neighbouring towns
      if (st.tech > 0.55) {
        for (let j = 0; j < reg.grid.ncount[st.region]!; j++) {
          const other = this.occupied.get(reg.grid.neighbors[st.region * 6 + j]!);
          if (other === undefined || other >= st.id) continue;
          const target = this.settlements[other]!.cell;
          const tx = g.pos[target * 3]!, ty = g.pos[target * 3 + 1]!, tz = g.pos[target * 3 + 2]!;
          let cur = st.cell;
          for (let step = 0; step < 14 && cur !== target; step++) {
            let best = cur, bd = g.pos[cur * 3]! * tx + g.pos[cur * 3 + 1]! * ty + g.pos[cur * 3 + 2]! * tz;
            for (let k = 0; k < g.ncount[cur]!; k++) {
              const nb = g.neighbors[cur * 6 + k]!;
              const d = g.pos[nb * 3]! * tx + g.pos[nb * 3 + 1]! * ty + g.pos[nb * 3 + 2]! * tz;
              if (d > bd) { bd = d; best = nb; }
            }
            if (best === cur) break;
            cur = best;
            if (elevation[cur]! > seaLevel) lights[cur] = Math.max(lights[cur]!, 0.16);
          }
        }
      }
    }
  }
}
