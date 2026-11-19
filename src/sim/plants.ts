// Plants: species with genomes competing for light and water in every region.
// Forests, grasslands and deserts form on their own from the competition.
import { PG, PLANT_GENES, mutatePlant, plantDistance } from './genetics';
import type { RNG } from './rng';
import type { Regions } from './regions';
import type { World } from './world';
import type { ClimateState } from './climate';

export const SLOTS = 4;
export const MAX_PLANT_SPECIES = 150;
const MAX_AQUATIC_SPECIES = 30;
/** A mutant closer than this to a living species counts as that species. */
const NOVELTY = 0.17;

export interface PlantSpecies {
  id: number;
  name: string;
  parent: number;
  genes: Float32Array;
  bornYear: number;
  extinctYear: number;
  /** Sum of cover over all regions (region equivalents). */
  cover: number;
  peakCover: number;
  regions: number;
  established: boolean;
  aquatic: boolean;
  eventId: number;
  /** Cached competition values. */
  weight: number;
  rate: number;
  palatability: number;
}

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function isAquatic(genes: Float32Array): boolean {
  return genes[PG.WaterNeed]! > 0.88;
}

/** Carrying capacity (max cover 0..1) of a plant in given conditions on land. */
export function landSuitability(genes: Float32Array, temp: number, moisture: number): number {
  const h = genes[PG.Height]!;
  // tall plants need far more water and a long warm season
  const need = genes[PG.WaterNeed]! * 0.55 + 0.42 * h;
  const sw = sat(1 - (need - moisture) * 3);
  const topt = 1 + 31 * genes[PG.Leaf]!;
  const width = 14 - 4 * genes[PG.Growth]!;
  const d = (temp - topt) / width;
  const cold = 1 - h * sat((7 - temp) / 12);
  return sw * Math.exp(-d * d) * cold;
}

export class Plants {
  species: PlantSpecies[] = [];
  living = 0;
  livingAquatic = 0;
  readonly slotSp: Int32Array;
  readonly slotCover: Float32Array;
  /** Edible plant energy per region on land, and in the sea. */
  readonly landFood: Float32Array;
  readonly seaFood: Float32Array;
  /** Food split into three layers by plant height (ground, shrub, canopy; or plankton, mats, kelp). */
  readonly landBins: Float32Array;
  readonly seaBins: Float32Array;
  /** Cover-weighted canopy height and toxicity on land, per region. */
  readonly canopy: Float32Array;
  readonly toxicity: Float32Array;
  readonly fruit: Float32Array;
  /** Set by the creature step: how many small flying plant-feeders visit each region's flowers, 0..1. */
  readonly pollinators: Float32Array;
  /** Set by the simulation: desert dust falling on each region's sea, 0..1. It feeds the plants of the open water. */
  readonly dust: Float32Array;
  readonly landCover: Float32Array;
  readonly seaCover: Float32Array;
  /** Set by the creature step: how hard each region's plants were grazed (0..1+). */
  readonly grazeLand: Float32Array;
  readonly grazeSea: Float32Array;
  /** Dominant land plant per region, -1 if none. */
  readonly dominant: Int32Array;
  /** Hue of the ground cover per region (for camouflage). */
  readonly groundHue: Float32Array;
  /** Oxygen level 0..1 (0.21 is today's Earth). Land is deadly until an ozone layer forms. */
  oxygen = 0.005;
  /** 0..1 damage to the ozone layer (after a supernova). Heals slowly. */
  ozoneHole = 0;
  /** Regions with hydrothermal vents: food that needs no sunlight. */
  vents = new Set<number>();
  /** How long each region has been continuously forested, in steps. */
  readonly forestAge: Float32Array;
  oldestForest = -1;
  totalLandCover = 0;
  totalSeaCover = 0;
  private scratch = new Float32Array(PLANT_GENES);
  /** Newly established or extinct species since last drain, for events. */
  established: PlantSpecies[] = [];
  extinct: PlantSpecies[] = [];
  /** Regions that burned this step. */
  burned: number[] = [];
  version = 0;

  constructor(private reg: Regions) {
    const R = reg.count;
    this.slotSp = new Int32Array(R * SLOTS).fill(-1);
    this.slotCover = new Float32Array(R * SLOTS);
    this.landFood = new Float32Array(R);
    this.seaFood = new Float32Array(R);
    this.landBins = new Float32Array(R * 3);
    this.seaBins = new Float32Array(R * 3);
    this.canopy = new Float32Array(R);
    this.toxicity = new Float32Array(R);
    this.fruit = new Float32Array(R);
    this.pollinators = new Float32Array(R);
    this.dust = new Float32Array(R);
    this.landCover = new Float32Array(R);
    this.seaCover = new Float32Array(R);
    this.grazeLand = new Float32Array(R);
    this.grazeSea = new Float32Array(R);
    this.dominant = new Int32Array(R).fill(-1);
    this.groundHue = new Float32Array(R).fill(0.09);
    this.forestAge = new Float32Array(R);
  }

  addSpecies(genes: Float32Array, parent: number, year: number): PlantSpecies {
    const g = genes.slice();
    const sp: PlantSpecies = {
      id: this.species.length, name: '', parent, genes: g, bornYear: year, extinctYear: -1, cover: 0, peakCover: 0, regions: 0,
      established: false, aquatic: isAquatic(g), eventId: -1,
      // height wins light on land; in water it gives no edge
      weight: isAquatic(g) ? 1 : (0.6 + g[PG.Height]!) * (1 + 0.2 * (1 - g[PG.Growth]!)),
      rate: (0.25 + 0.9 * g[PG.Growth]!) * (1 - 0.6 * g[PG.Height]!) * (1 - 0.3 * (g[PG.Thorns]! + g[PG.Toxicity]! + g[PG.FireResist]! + g[PG.Glow]!) / 4),
      palatability: (1 - 0.7 * g[PG.Toxicity]!) * (1 - 0.5 * g[PG.Thorns]!) * (0.7 + 0.6 * g[PG.Fruit]!),
    };
    this.species.push(sp);
    this.living++;
    if (sp.aquatic) this.livingAquatic++;
    this.version++;
    return sp;
  }

  /**
   * The species a mutant (in this.scratch) belongs to: the parent if it barely differs, an existing
   * species if one is close, otherwise a new species.
   */
  private variant(parent: PlantSpecies, year: number): PlantSpecies {
    const g = this.scratch;
    let best = parent, bd = plantDistance(g, parent.genes);
    if (bd < NOVELTY * 0.5) return parent;
    for (const sp of this.species) {
      if (sp.extinctYear >= 0 || sp === parent) continue;
      const d = plantDistance(g, sp.genes);
      if (d < bd) { bd = d; best = sp; }
    }
    if (bd < NOVELTY) return best;
    if (this.living >= MAX_PLANT_SPECIES) return parent;
    if (isAquatic(g) && this.livingAquatic >= MAX_AQUATIC_SPECIES) return parent;
    return this.addSpecies(g, parent.id, year);
  }

  /** Put a species into a region. Returns false if there was no room. */
  seed(region: number, sp: number, cover: number): boolean {
    const base = region * SLOTS;
    let empty = -1, weakest = -1, weakCover = 0.012;
    for (let s = 0; s < SLOTS; s++) {
      const cur = this.slotSp[base + s]!;
      if (cur === sp) return false;
      if (cur < 0) { if (empty < 0) empty = s; }
      else if (this.slotCover[base + s]! < weakCover) { weakest = s; weakCover = this.slotCover[base + s]!; }
    }
    const slot = empty >= 0 ? empty : weakest;
    if (slot < 0) return false;
    this.slotSp[base + slot] = sp;
    this.slotCover[base + slot] = cover;
    return true;
  }

  private capacity(sp: PlantSpecies, r: number): number {
    const reg = this.reg;
    if (sp.aquatic) {
      const sea = 1 - reg.land[r]!;
      if (sea <= 0) return 0;
      const t = reg.temp[r]!;
      const d = (t - (4 + 24 * sp.genes[PG.Leaf]!)) / 16;
      return sea * (0.3 + 0.7 * reg.shallow[r]! / Math.max(0.05, sea)) * Math.exp(-d * d) * (t < -2.5 ? 0.1 : 1);
    }
    const land = reg.land[r]!;
    if (land <= 0) return 0;
    // without an ozone layer the land surface is sterilised by ultraviolet light
    const uv = sat((this.oxygen - 0.06) / 0.05) * (1 - this.ozoneHole * 0.8);
    return land * (1 - reg.ice[r]!) * (0.55 + 0.45 * reg.fertility[r]!) * landSuitability(sp.genes, reg.landTemp[r]!, reg.moisture[r]!) * uv;
  }

  /** One ecological step. tau is the step size (1 = a full step at Epoch speed). */
  step(world: World, climate: ClimateState, rng: RNG, year: number, tau: number): void {
    const reg = this.reg;
    const R = reg.count;
    const { slotSp, slotCover, species } = this;
    for (const sp of species) { sp.cover = 0; sp.regions = 0; }
    let landTotal = 0, seaTotal = 0;
    const K = new Float32Array(SLOTS);
    this.burned.length = 0;
    for (let r = 0; r < R; r++) {
      const base = r * SLOTS;
      let any = false;
      for (let s = 0; s < SLOTS; s++) {
        const id = slotSp[base + s]!;
        if (id >= 0) { any = true; K[s] = this.capacity(species[id]!, r); }
      }
      const b3 = r * 3;
      this.landBins[b3] = 0; this.landBins[b3 + 1] = 0; this.landBins[b3 + 2] = 0;
      this.seaBins[b3] = 0; this.seaBins[b3 + 1] = 0; this.seaBins[b3 + 2] = 0;
      if (!any) {
        this.landFood[r] = 0; this.seaFood[r] = 0; this.landCover[r] = 0; this.seaCover[r] = 0; this.dominant[r] = -1;
        continue;
      }
      const grazeL = Math.min(1.5, this.grazeLand[r]!), grazeS = Math.min(1.5, this.grazeSea[r]!);
      // fire: dry, well-covered regions burn now and then (lightning)
      let fire = false;
      const dry = sat(0.75 - reg.moisture[r]!) * sat((reg.landTemp[r]! - 4) / 14);
      if (this.landCover[r]! > 0.3 && rng.chance(Math.min(0.5, 0.05 * tau * dry * this.landCover[r]! * 4))) {
        fire = true;
        this.burned.push(r);
      }
      // Lotka-Volterra competition: taller plants shade shorter ones, fast growers fill gaps first
      let landCover = 0, seaCover = 0, landFood = 0, seaFood = 0, canopy = 0, tox = 0, fruit = 0, best = -1, bestCover = 0;
      for (let s = 0; s < SLOTS; s++) {
        const id = slotSp[base + s]!;
        if (id < 0) continue;
        const sp = species[id]!;
        let c = slotCover[base + s]!;
        const k = K[s]!;
        if (k < 0.004) c *= Math.exp(-1.2 * tau);
        else {
          let crowd = 0;
          for (let j = 0; j < SLOTS; j++) {
            const oj = slotSp[base + j]!;
            if (oj < 0) continue;
            const o = species[oj]!;
            if (o.aquatic !== sp.aquatic) continue;
            // taller neighbours shade this plant; shorter ones barely do, so an understorey survives under a canopy
            const ratio = o.weight / sp.weight;
            crowd += slotCover[base + j]! * (j === s ? 1 : ratio > 1 ? Math.min(1.5, ratio) : ratio * ratio * 0.6);
          }
          // flowers pay where something comes to them: with pollinators a flowering plant sets more seed
          const bloom = sp.aquatic ? 1 + 0.45 * this.dust[r]! : 1 + sp.genes[PG.Fruit]! * 0.3 * this.pollinators[r]!;
          const growth = sp.rate * bloom * tau * 1.6 * (1 - crowd / (k * (sp.aquatic ? 1 + 0.3 * this.dust[r]! : 1)));
          c *= Math.exp(Math.max(-1.5, Math.min(1.2, growth)));
        }
        // grazing and fire
        const graze = sp.aquatic ? grazeS : grazeL;
        if (graze > 0) c *= 1 - Math.min(0.55, graze * sp.palatability * 0.4) * Math.min(1, tau * 4);
        if (fire && !sp.aquatic) c *= 1 - 0.85 * (1 - sp.genes[PG.FireResist]! * 0.9);
        if (c < 0.0015) {
          slotSp[base + s] = -1;
          slotCover[base + s] = 0;
          continue;
        }
        if (c > 1) c = 1;
        slotCover[base + s] = c;
        sp.cover += c;
        sp.regions++;
        // which feeding layer this plant belongs to, by height (soft split between two layers)
        const hpos = Math.min(1.999, sp.genes[PG.Height]! * 2.4);
        const lo = Math.floor(hpos), fr = hpos - lo;
        const bins = sp.aquatic ? this.seaBins : this.landBins;
        bins[b3 + lo] = bins[b3 + lo]! + c * sp.palatability * (1 - fr);
        bins[b3 + lo + 1 > b3 + 2 ? b3 + 2 : b3 + lo + 1] = bins[b3 + lo + 1 > b3 + 2 ? b3 + 2 : b3 + lo + 1]! + c * sp.palatability * fr;
        if (sp.aquatic) {
          seaCover += c;
          seaFood += c * sp.palatability;
        } else {
          landCover += c;
          landFood += c * sp.palatability;
          canopy += c * sp.genes[PG.Height]!;
          tox += c * sp.genes[PG.Toxicity]!;
          fruit += c * sp.genes[PG.Fruit]!;
          if (c > bestCover) { bestCover = c; best = id; }
        }
        // spread to a neighbouring region, sometimes as a mutant
        const disp = sp.genes[PG.Dispersal]!;
        // fruiting plants spread faster where animals eat them and carry the seeds
        const carried = sp.aquatic ? 0 : 0.35 * sp.genes[PG.Fruit]! * Math.min(1, grazeL) + 0.3 * sp.genes[PG.Fruit]! * this.pollinators[r]!;
        if (c > 0.012 && rng.chance(Math.min(0.9, (0.2 + 0.5 * disp + carried) * tau * 2))) {
          let nb = reg.grid.neighbors[r * 6 + rng.int(reg.grid.ncount[r]!)]!;
          // wind-blown and animal-carried seeds can jump further
          if (disp > 0.3 && rng.chance(0.4)) nb = reg.grid.neighbors[nb * 6 + rng.int(reg.grid.ncount[nb]!)]!;
          // now and then a spore or seed drifts far on a current or a storm
          if (rng.chance(sp.aquatic ? 0.03 : 0.02)) nb = rng.int(R);
          let colonist = sp;
          if (rng.chance(0.012)) {
            mutatePlant(sp.genes, this.scratch, rng, 1.6);
            colonist = this.variant(sp, year);
          }
          if (this.capacity(colonist, nb) > 0.03) this.seed(nb, colonist.id, 0.01);
        }
        // mutation in place
        if (c > 0.1 && rng.chance(0.0015 * Math.min(1, tau * 4))) {
          mutatePlant(sp.genes, this.scratch, rng, 1.8);
          const m = this.variant(sp, year);
          if (m !== sp && this.capacity(m, r) > 0.03) this.seed(r, m.id, 0.01);
        }
      }
      this.landCover[r] = landCover;
      this.seaCover[r] = seaCover;
      this.landFood[r] = landFood;
      this.seaFood[r] = seaFood;
      if (landCover > 0.45 && landCover > 0 && canopy / landCover > 0.5 && !fire) this.forestAge[r] = this.forestAge[r]! + tau;
      else this.forestAge[r] = 0;
      this.canopy[r] = landCover > 0 ? canopy / landCover : 0;
      this.toxicity[r] = landCover > 0 ? tox / landCover : 0;
      this.fruit[r] = landCover > 0 ? fruit / landCover : 0;
      this.dominant[r] = best;
      // bare ground is tan; a leafy region takes the hue of its main plant
      this.groundHue[r] = best >= 0 ? 0.09 + (0.2 + species[best]!.genes[PG.LeafHue]! * 0.22 - 0.09) * Math.min(1, landCover * 1.5) : 0.09;
      landTotal += landCover;
      seaTotal += seaCover;
    }
    // vents on the deep sea floor feed a little life that needs no sun at all
    for (const v of this.vents) {
      this.seaFood[v] = this.seaFood[v]! + 0.06;
      this.seaBins[v * 3] = this.seaBins[v * 3]! + 0.06;
    }
    this.ozoneHole *= Math.exp(-0.01 * tau);
    let oldest = -1, age = 60;
    for (let r = 0; r < R; r++) if (this.forestAge[r]! > age) { age = this.forestAge[r]!; oldest = r; }
    this.oldestForest = oldest;
    this.totalLandCover = landTotal;
    this.totalSeaCover = seaTotal;
    // photosynthesis fills the air with oxygen; rock weathering and fire slowly remove it
    const production = (seaTotal * 0.55 + landTotal * 0.9) / R;
    this.oxygen += (production * 1.3 - this.oxygen) * tau * 3.6e-4;
    if (this.oxygen < 0.001) this.oxygen = 0.001;
    if (this.oxygen > 0.36) this.oxygen = 0.36;
    for (const sp of species) {
      if (sp.extinctYear >= 0) continue;
      if (sp.cover > sp.peakCover) sp.peakCover = sp.cover;
      if (!sp.established && sp.cover > Math.max(3, reg.count * 0.004) && sp.regions >= 10) {
        sp.established = true;
        this.established.push(sp);
        this.version++;
      }
      if (sp.cover <= 0 && year > sp.bornYear) {
        sp.extinctYear = year;
        this.living--;
        if (sp.aquatic) this.livingAquatic--;
        if (sp.established) { this.extinct.push(sp); this.version++; }
      }
    }
  }

  /** A fraction of a region's land burned (cell-by-cell fire at low time speeds). */
  burn(region: number, fraction: number): void {
    const base = region * SLOTS;
    for (let s = 0; s < SLOTS; s++) {
      const id = this.slotSp[base + s]!;
      if (id < 0 || this.species[id]!.aquatic) continue;
      this.slotCover[base + s] = this.slotCover[base + s]! * (1 - fraction * 0.85 * (1 - this.species[id]!.genes[PG.FireResist]! * 0.9));
    }
  }

  /** Paint fine-cell vegetation, canopy height and dominant flora from the regional plant communities. */
  paint(world: World, climate: ClimateState): void {
    const reg = this.reg;
    const { vegetation, elevation, seaLevel, moisture, ash } = world;
    const { slotSp, slotCover, species } = this;
    const meanT = climate.meanT;
    const canopy = world.canopy;
    const flora = world.flora;
    for (let i = 0; i < world.grid.count; i++) {
      if (elevation[i]! <= seaLevel) {
        vegetation[i] = 0; canopy[i] = 0; flora[i] = -1;
        // sea life: plankton everywhere it grows, coral in warm clear shallows (bleached white by heat)
        const rs = reg.regionOf[i]!;
        const sea = Math.max(0.2, 1 - reg.land[rs]!);
        const cover = this.seaCover[rs]! / sea;
        const patch = 0.55 + 0.45 * Math.sin(i * 12.9898 + rs * 4.1);
        world.bloom[i] = Math.min(1, cover * 1.6 * patch);
        const depth = seaLevel - elevation[i]!;
        const t = meanT[i]!;
        const coral = depth < 0.3 && cover > 0.05 ? sat((t - 19) / 4) * sat(cover * 4) : 0;
        world.reef[i] = t > 30.5 ? -coral : coral;
        continue;
      }
      world.bloom[i] = 0; world.reef[i] = 0;
      const r = reg.regionOf[i]!;
      const base = r * SLOTS;
      const land = Math.max(0.15, reg.land[r]!);
      let v = 0, h = 0, best = -1, bestV = 0;
      for (let s = 0; s < SLOTS; s++) {
        const id = slotSp[base + s]!;
        if (id < 0) continue;
        const sp = species[id]!;
        if (sp.aquatic) continue;
        // regional cover, redistributed toward the cells that suit this plant best
        const local = landSuitability(sp.genes, meanT[i]!, moisture[i]!);
        const regional = Math.max(0.06, landSuitability(sp.genes, reg.landTemp[r]!, reg.moisture[r]!));
        const c = (slotCover[base + s]! / land) * Math.min(1.8, local / regional);
        v += c;
        h += c * sp.genes[PG.Height]!;
        if (c > bestV) { bestV = c; best = id; }
      }
      const scorch = 1 - Math.min(1, ash[i]! * 1.2);
      const target = Math.min(1, v) * scorch;
      vegetation[i] = target;
      // after a fire, low growth returns before the canopy does
      canopy[i] = v > 0 ? (h / v) * scorch * scorch : 0;
      flora[i] = best;
    }
  }
}
