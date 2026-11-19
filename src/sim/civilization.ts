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
  stars: boolean;
}

export const INTELLIGENCE_THRESHOLD = 0.5;
/** A lineage must stay clever this long (years) before it starts keeping what it learns. */
export const MIND_YEARS = 60e6;

export class Civilization {
  settlements: Settlement[] = [];
  /** Species that have crossed the threshold. */
  sapient: number[] = [];
  living = 0;
  maxTech = 0;
  spaceAgeYear = -1;
  departed = false;
  hasMusic = false;
  private ships = false;
  private industrial = false;
  private occupied = new Map<number, number>(); // region -> settlement id
  private cleverSince = new Map<number, number>();

  step(sim: Simulation, rng: RNG, tau: number): void {
    const cr = sim.creatures, reg = sim.regions, w = sim.world;
    // a lineage crosses the threshold: clever, social, and numerous enough to keep what it learns
    for (const s of cr.species) {
      if (s.extinctYear >= 0 || this.sapient.includes(s.id) || !s.name) continue;
      const clever = s.ref[G.Intelligence]! > INTELLIGENCE_THRESHOLD && s.ref[G.Sociality]! > 0.35 && s.pop > 2000 && cr.speciesMean(s.id, P.LandUse, true) > 0.4;
      // cleverness is inherited down a lineage: a daughter species keeps its parent's head start
      if (!clever) { this.cleverSince.delete(s.id); continue; }
      if (!this.cleverSince.has(s.id)) this.cleverSince.set(s.id, this.cleverSince.get(s.parent) ?? sim.simYear);
      if (sim.simYear - this.cleverSince.get(s.id)! > MIND_YEARS) {
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
      st.tech = Math.min(1.2, st.tech + tau * 0.00007 * (0.4 + Math.log10(1 + st.pop)) * (1 + 0.35 * neighbours) * (0.6 + s.ref[G.Intelligence]!));
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
      if (!this.hasMusic && st.tech > 0.35) { this.hasMusic = true; sim.civEvent('music', st.species, st.cell, st.id); }
      // star lore: villagers name a constellation after a vanished animal whose bones they find
      if (!st.stars && st.tech > 0.4) {
        st.stars = true;
        const gone = cr.species.filter((x) => x.extinctYear >= 0 && x.peakRegions >= 10 && x.name);
        if (gone.length && rng.chance(0.12)) sim.civEvent('constellation', st.species, st.cell, st.id, rng.pick(gone).id);
      }
      // war: neighbours of another kind, or of another faith, sometimes fight
      if (st.tech > 0.3 && rng.chance(Math.min(0.2, 0.012 * tau))) {
        for (let j = 0; j < reg.grid.ncount[st.region]!; j++) {
          const oid = this.occupied.get(reg.grid.neighbors[st.region * 6 + j]!);
          if (oid === undefined) continue;
          const o = this.settlements[oid]!;
          if (o.species === st.species && (o.belief === st.belief || o.belief < 0 || st.belief < 0)) continue;
          st.pop *= 0.7; o.pop *= 0.65; st.tech = Math.max(0.03, st.tech - 0.02); o.tech = Math.max(0.03, o.tech - 0.02);
          sim.civEvent('war', st.species, st.cell, st.id, o.id);
          // with the atom in hand, a war can end the age
          if (this.spaceAgeYear >= 0 && rng.chance(0.04)) sim.civEvent('nuclear', st.species, st.cell, st.id);
          break;
        }
      }
      // sickness travels the roads between crowded towns
      if (st.tech > 0.5 && st.pop > 20 && rng.chance(Math.min(0.2, 0.0012 * tau))) {
        st.pop *= 0.5;
        sim.civEvent('city-plague', st.species, st.cell, st.id);
        for (let j = 0; j < reg.grid.ncount[st.region]!; j++) {
          const oid = this.occupied.get(reg.grid.neighbors[st.region * 6 + j]!);
          if (oid !== undefined) this.settlements[oid]!.pop *= 0.7;
        }
      }
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
    // industry: burning the buried forests of older ages warms the whole world
    if (maxTech > 0.85) {
      if (!this.industrial) { this.industrial = true; sim.civEvent('industry', this.sapient[0]!, -1, -1); }
      sim.climate.greenhouse = Math.min(9, sim.climate.greenhouse + 0.00006 * tau * living);
    }
    if (this.spaceAgeYear < 0 && maxTech >= 1.1 && living >= 12) {
      this.spaceAgeYear = sim.simYear;
      sim.civEvent('space', this.sapient[0]!, -1, -1);
    }
    // departure: a people that has held the sky for a long age finally leaves
    if (!this.departed && this.spaceAgeYear >= 0 && sim.simYear - this.spaceAgeYear > 25e6 && living >= 12) {
      this.departed = true;
      sim.civEvent('departure', this.sapient[0]!, -1, -1);
    }
    // monoliths: animals living beside one grow cleverer, generation by generation
    if (sim.monoliths.length) {
      for (let c = 0; c < cr.high; c++) {
        if (!cr.alive[c] || !sim.monoliths.includes(cr.region[c]!)) continue;
        const g = c * GENE_COUNT;
        cr.genome[g + G.Intelligence] = Math.min(1, cr.genome[g + G.Intelligence]! + 0.01 * Math.min(1, tau * 4));
        cr.genome[g + G.Curiosity] = Math.min(1, cr.genome[g + G.Curiosity]! + 0.01 * Math.min(1, tau * 4));
        computePhenotype(cr.genome, g, cr.phen, c * PHEN_COUNT);
      }
    }
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

  /** The worst war: most people die and much knowledge is lost. */
  devastate(): void {
    for (const st of this.settlements) {
      if (st.ruined >= 0) continue;
      st.pop *= 0.25;
      st.tech *= 0.55;
    }
    this.spaceAgeYear = -1;
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
      id: this.settlements.length, name: placeName(rng), cell, region, species, pop: 0.2, tech: 0.03, founded: sim.simYear, belief: -1, eventId: -1, ruined: -1, painted: false, temple: false, farms: false, stars: false,
    };
    this.settlements.push(st);
    this.occupied.set(region, st.id);
    // a later people building where an older, different people once lived find what was left behind
    const ruin = this.settlements.find((x) => x.region === region && x.ruined >= 0 && x.species !== species && x.tech > 0.25);
    if (ruin) sim.civEvent('rediscover', species, cell, st.id, ruin.id);
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
      // sea trade: lamp-lit ships between cities that face the same water
      if (st.tech > 0.7 && this.settlements.length > 3) {
        const other = this.settlements[(st.id * 7 + 3) % this.settlements.length]!;
        const ax = g.pos[st.cell * 3]!, ay = g.pos[st.cell * 3 + 1]!, az = g.pos[st.cell * 3 + 2]!;
        const tx = g.pos[other.cell * 3]!, ty = g.pos[other.cell * 3 + 1]!, tz = g.pos[other.cell * 3 + 2]!;
        if (other.ruined < 0 && other.id !== st.id && other.tech > 0.5 && ax * tx + ay * ty + az * tz > 0.8) {
          let cur = st.cell, wet = 0;
          for (let step = 0; step < 40 && cur !== other.cell; step++) {
            let best = cur, bd = g.pos[cur * 3]! * tx + g.pos[cur * 3 + 1]! * ty + g.pos[cur * 3 + 2]! * tz;
            for (let k = 0; k < g.ncount[cur]!; k++) {
              const nb = g.neighbors[cur * 6 + k]!;
              const d = g.pos[nb * 3]! * tx + g.pos[nb * 3 + 1]! * ty + g.pos[nb * 3 + 2]! * tz;
              if (d > bd) { bd = d; best = nb; }
            }
            if (best === cur) break;
            cur = best;
            if (elevation[cur]! <= seaLevel) { lights[cur] = Math.max(lights[cur]!, 0.14); wet++; }
          }
          if (wet > 2 && !this.ships) { this.ships = true; sim.civEvent('trade', st.species, st.cell, st.id); }
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
