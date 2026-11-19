// Creature populations ("cohorts"): groups of one species in one region sharing a genome.
// Cohorts eat, get eaten, starve, freeze, breed, wander and mutate. Selection is whatever happens to them.
import { G, GENE_COUNT, P, PHEN_COUNT, computePhenotype, geneDistance, mutateInto } from './genetics';
import type { RNG } from './rng';
import type { Regions } from './regions';
import type { Plants } from './plants';

export const MAX_COHORTS = 20000;
export const REGION_CAP = 6;
/** Plant energy per unit of regional cover per step. */
const FOOD_SCALE = 3e5;
/**
 * Energy a predator gains per prey animal, as a multiple of mass^0.75. Small animals breed fast,
 * so a population of them yields more food per kg than a population of giants.
 */
const E_PREY = 0.25;
const INTAKE_CAP = 2.4;
const LOG_QUARTER = Math.log(0.25);
const SPECIATION_DISTANCE = 0.46;
/** Above this many living species, only big changes in way of life create new ones. */
export const SOFT_SPECIES_CAP = 40;
export const HARD_SPECIES_CAP = 64;
/** Cohorts of one species in one region closer than this are one interbreeding population. */
const MERGE_DISTANCE = 0.09;

export interface Species {
  id: number;
  name: string;
  genus: string;
  genusRef: Float32Array;
  parent: number;
  bornYear: number;
  extinctYear: number;
  eventId: number;
  /** Reference genome: follows the population slowly. */
  ref: Float32Array;
  /** Genome at founding, never changes (for living-fossil and convergence checks). */
  origin: Float32Array;
  pop: number;
  biomass: number;
  cohorts: number;
  regions: number;
  peakPop: number;
  peakRegions: number;
  // decayed loss tallies, for explaining declines and extinctions
  lossStarve: number;
  lossThermal: number;
  lossPredation: number;
  lossHabitat: number;
  lossDisaster: number;
  topPredator: number;
  disasterEvent: number;
  /** Region holding most of the population. */
  home: number;
  children: number;
  /** Sapient species that domesticated this one, or -1. */
  tamedBy: number;
  /** Set once it has been noted as a living fossil. */
  fossilNoted: boolean;
  /** Year of the last time this species split or was born. */
  lastSplit: number;
}

export interface Disaster { regions: number[]; kill: number[]; eventId: number; }

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class Creatures {
  readonly alive = new Uint8Array(MAX_COHORTS);
  readonly sp = new Int32Array(MAX_COHORTS);
  readonly region = new Int32Array(MAX_COHORTS);
  readonly count = new Float64Array(MAX_COHORTS);
  readonly genome = new Float32Array(MAX_COHORTS * GENE_COUNT);
  readonly phen = new Float32Array(MAX_COHORTS * PHEN_COUNT);
  /** Last intake ratio (energy eaten / energy needed), for display and migration. */
  readonly fed = new Float32Array(MAX_COHORTS);
  high = 0; // one past the highest slot in use
  living = 0;
  private free: number[] = [];
  species: Species[] = [];
  livingSpecies = 0;
  readonly carrion: Float32Array;
  private regionStart: Int32Array;
  private regionList = new Int32Array(MAX_COHORTS);
  private regionFill: Int32Array;
  stepCount = 0;
  totalPop = 0;
  totalBiomass = 0;
  /** Filled during a step, drained by the simulation to create events. */
  newSpecies: { species: Species; reason: string; isolated: boolean }[] = [];
  extinctions: Species[] = [];
  version = 0;

  constructor(private reg: Regions, private plants: Plants) {
    const R = reg.count;
    this.carrion = new Float32Array(R);
    this.regionStart = new Int32Array(R + 1);
    this.regionFill = new Int32Array(R);
  }

  private alloc(): number {
    if (this.free.length) return this.free.pop()!;
    if (this.high < MAX_COHORTS) return this.high++;
    return -1;
  }

  private kill(c: number): void {
    if (!this.alive[c]) return;
    this.alive[c] = 0;
    this.count[c] = 0;
    this.free.push(c);
    this.living--;
  }

  addSpecies(ref: Float32Array, ro: number, parent: number, year: number, name: string, genus: string, genusRef: Float32Array): Species {
    const r = ref.slice(ro, ro + GENE_COUNT);
    const s: Species = {
      id: this.species.length, name, genus, genusRef, parent, bornYear: year, extinctYear: -1, eventId: -1, ref: r, origin: r.slice(),
      pop: 0, biomass: 0, cohorts: 0, regions: 0, peakPop: 0, peakRegions: 0,
      lossStarve: 0, lossThermal: 0, lossPredation: 0, lossHabitat: 0, lossDisaster: 0, topPredator: -1, disasterEvent: -1, home: 0, children: 0, tamedBy: -1, fossilNoted: false, lastSplit: year,
    };
    this.species.push(s);
    this.livingSpecies++;
    this.version++;
    if (parent >= 0) this.species[parent]!.children++;
    return s;
  }

  /** Create a cohort. Returns its index or -1 if there is no room. */
  spawn(species: number, region: number, n: number, src: Float32Array, so: number): number {
    const c = this.alloc();
    if (c < 0) return -1;
    this.alive[c] = 1;
    this.sp[c] = species;
    this.region[c] = region;
    this.count[c] = n;
    this.fed[c] = 1;
    const o = c * GENE_COUNT;
    for (let i = 0; i < GENE_COUNT; i++) this.genome[o + i] = src[so + i]!;
    computePhenotype(this.genome, o, this.phen, c * PHEN_COUNT);
    this.living++;
    return c;
  }

  private buildRegionLists(): void {
    const R = this.reg.count;
    const start = this.regionStart;
    start.fill(0);
    for (let c = 0; c < this.high; c++) if (this.alive[c]) start[this.region[c]! + 1] = start[this.region[c]! + 1]! + 1;
    for (let r = 0; r < R; r++) start[r + 1] = start[r + 1]! + start[r]!;
    const fill = this.regionFill;
    for (let r = 0; r < R; r++) fill[r] = start[r]!;
    for (let c = 0; c < this.high; c++) {
      if (!this.alive[c]) continue;
      const r = this.region[c]!;
      this.regionList[fill[r]!] = c;
      fill[r] = fill[r]! + 1;
    }
  }

  cohortsIn(region: number): Int32Array {
    return this.regionList.subarray(this.regionStart[region]!, this.regionStart[region + 1]!);
  }

  /** How well a body fits a region: [land fit, sea fit]. */
  private fitLand(c: number, land: number): number {
    const p = c * PHEN_COUNT;
    // wings add to getting around on top of legs
    const move = Math.min(1.4, this.phen[p + P.Walk]! + this.phen[p + P.Fly]! * 0.9);
    return land > 0.02 ? Math.sqrt(this.phen[p + P.LandUse]!) * (0.42 + 0.58 * move) * Math.min(1, land * 3) : 0;
  }

  private fitSea(c: number, sea: number): number {
    const p = c * PHEN_COUNT;
    return sea > 0.02 ? Math.sqrt(1 - this.phen[p + P.LandUse]!) * (0.5 + 0.5 * Math.min(1, this.phen[p + P.Swim]! * 1.2)) * Math.min(1, sea * 3) : 0;
  }

  /** Apply a sudden kill (eruption, impact, plague) to regions. */
  disaster(d: Disaster): void {
    this.buildRegionLists();
    for (let k = 0; k < d.regions.length; k++) {
      const list = this.cohortsIn(d.regions[k]!);
      for (let j = 0; j < list.length; j++) {
        const c = list[j]!;
        const lost = this.count[c]! * d.kill[k]!;
        this.count[c] = this.count[c]! - lost;
        const s = this.species[this.sp[c]!]!;
        s.lossDisaster += lost;
        s.disasterEvent = d.eventId;
        if (this.count[c]! < 2) this.kill(c);
      }
    }
  }

  /** One ecological step. tau = 1 is a full step. */
  step(rng: RNG, year: number, tau: number, oxygen: number): void {
    const reg = this.reg, plants = this.plants;
    const R = reg.count;
    const { phen, count, genome, alive, sp, fed } = this;
    this.stepCount++;
    this.buildRegionLists();
    this.consolidate();
    this.buildRegionLists();
    const decay = Math.exp(-0.12 * tau);
    for (const s of this.species) {
      if (s.extinctYear >= 0) continue;
      s.lossStarve *= decay; s.lossThermal *= decay; s.lossPredation *= decay; s.lossHabitat *= decay; s.lossDisaster *= decay;
    }
    const M = 24;
    const fl = new Float64Array(M), fs = new Float64Array(M), act = new Float64Array(M), stress = new Float64Array(M);
    const claim = new Float64Array(M * 6), binSum = new Float64Array(6), binShare = new Float64Array(6), claimC = new Float64Array(M), claimM = new Float64Array(M);
    const got = new Float64Array(M), eaten = new Float64Array(M), demand = new Float64Array(M), capacity = new Float64Array(M);
    const kappa = new Float64Array(M * M);
    // thin air limits big, active bodies; rich air allows giants
    const oxyLimit = sat(oxygen / 0.12);
    for (let r = 0; r < R; r++) {
      const a = this.regionStart[r]!, b = this.regionStart[r + 1]!;
      plants.grazeLand[r] = 0;
      plants.grazeSea[r] = 0;
      this.carrion[r] = this.carrion[r]! * Math.exp(-1.5 * tau);
      const n = Math.min(M, b - a);
      if (n === 0) continue;
      const land = reg.land[r]!, sea = 1 - land;
      const tL = reg.landTemp[r]!, tS = Math.max(-1.5, reg.temp[r]!);
      const ptox = plants.toxicity[r]!;
      const b3 = r * 3;
      let sumC = 0;
      binSum.fill(0);
      for (let i = 0; i < n; i++) {
        const c = this.regionList[a + i]!;
        const p = c * PHEN_COUNT, g = c * GENE_COUNT;
        const l = this.fitLand(c, land), s = this.fitSea(c, sea);
        fl[i] = l; fs[i] = s;
        const t = l + s > 0 ? (l * tL + s * tS) / (l + s) : land > 0.5 ? tL : tS;
        const st = Math.max(0, (phen[p + P.TMin]! - t) / 10, (t - phen[p + P.TMax]!) / 10);
        stress[i] = st;
        const warm = genome[g + G.WarmBlood]! > 0.5;
        let activity = warm ? 1 : 0.25 + 0.75 * sat((t + 1) / 19);
        // big or warm-blooded bodies need more oxygen
        const o2need = genome[g + G.Size]! * 0.6 + (warm ? 0.3 : 0) + phen[p + P.Fly]! * 0.3;
        activity *= sat(0.75 + oxyLimit * 0.6 - o2need * (1 - oxyLimit) * 1.5);
        act[i] = activity / (1 + st);
        demand[i] = count[c]! * phen[p + P.Need]!;
        const cap = count[c]! * phen[p + P.Forage]! * INTAKE_CAP * act[i]!;
        capacity[i] = cap;
        const herb = phen[p + P.HerbEff]!;
        const toxLoss = 1 - sat(Math.max(0, ptox - genome[g + G.ToxinResist]!) * 1.3);
        // six plant food pools: three layers on land, three in the sea.
        // An animal feeds where its body suits and food exists; a body that suits no stocked layer wastes effort.
        let wl = 0, ws = 0, ml = 0;
        for (let k = 0; k < 3; k++) {
          const feed = phen[p + P.Feed0 + k]!;
          // in water any plant can be reached by swimming, so body shape matters much less there
          const sfeed = 0.25 * feed + 0.25;
          const al = plants.landBins[b3 + k]!, as = plants.seaBins[b3 + k]!;
          wl += feed * al; ws += sfeed * as;
          if (al > 0.002) ml += feed;
        }
        for (let k = 0; k < 3; k++) {
          const feed = phen[p + P.Feed0 + k]!;
          const sfeed = 0.25 * feed + 0.25;
          const cl = wl > 0 ? cap * herb * l * toxLoss * (0.4 + 0.6 * ml) * (feed * plants.landBins[b3 + k]!) / wl : 0;
          const cs = ws > 0 ? cap * herb * s * (sfeed * plants.seaBins[b3 + k]!) / ws : 0;
          claim[i * 6 + k] = cl;
          claim[i * 6 + 3 + k] = cs;
          binSum[k] = binSum[k]! + cl;
          binSum[3 + k] = binSum[3 + k]! + cs;
        }
        claimC[i] = cap * Math.max(0, phen[p + P.ScavEff]!) * Math.max(l, s) * 0.6;
        sumC += claimC[i]!;
        got[i] = 0; eaten[i] = 0; claimM[i] = 0;
      }
      // each pool is shared in proportion to how hard each cohort can feed on it
      let grazedL = 0, grazedS = 0;
      for (let k = 0; k < 6; k++) {
        const avail = (k < 3 ? plants.landBins[b3 + k]! : plants.seaBins[b3 + k - 3]!) * FOOD_SCALE;
        const share = binSum[k]! > avail ? avail / Math.max(1e-9, binSum[k]!) : 1;
        binShare[k] = share;
        if (k < 3) grazedL += binSum[k]! * share; else grazedS += binSum[k]! * share;
      }
      const carr = this.carrion[r]!;
      const shareC = sumC > carr ? carr / Math.max(1e-9, sumC) : 1;
      for (let i = 0; i < n; i++) {
        let e = claimC[i]! * shareC;
        for (let k = 0; k < 6; k++) e += claim[i * 6 + k]! * binShare[k]!;
        got[i] = e;
      }
      const availL = plants.landFood[r]! * FOOD_SCALE, availS = plants.seaFood[r]! * FOOD_SCALE;
      if (availL > 0) plants.grazeLand[r] = grazedL / availL;
      if (availS > 0) plants.grazeSea[r] = grazedS / availS;
      this.carrion[r] = Math.max(0, carr - sumC * shareC);
      // predation: every predator cohort against every possible prey cohort here
      let anyPredator = false;
      for (let i = 0; i < n; i++) {
        const c = this.regionList[a + i]!;
        const p = c * PHEN_COUNT;
        const meat = phen[p + P.MeatEff]!;
        for (let j = 0; j < n; j++) kappa[i * M + j] = 0;
        if (meat < 0.04) continue;
        const cap = capacity[i]!;
        const plm = phen[p + P.LogPackMass]! + LOG_QUARTER;
        const pv = phen[p + P.Speed]! * act[i]!;
        const pFly = phen[p + P.Fly]!;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const q = this.regionList[a + j]!;
          const qp = q * PHEN_COUNT, qg = q * GENE_COUNT;
          const overlap = Math.min(fl[i]!, fl[j]!) + Math.min(fs[i]!, fs[j]!);
          if (overlap <= 0.01) continue;
          const lr = phen[qp + P.LogMass]! - plm;
          if (lr > 4.4 || lr < -4.4) continue;
          const sizeFit = Math.exp(-(lr * lr) / 4.5);
          // smooth step: faster hunters catch more
          const px = 1.75 * (pv / (phen[qp + P.Speed]! * act[j]! + 1e-3) - 0.85);
          let pursuit = 0.5 + (0.5 * px) / (1 + Math.abs(px));
          if (phen[qp + P.Fly]! > 0.3 && pFly < 0.3) pursuit *= 0.3;
          const night = Math.abs(phen[p + P.NightUse]! - phen[qp + P.NightUse]!);
          const detect = sat(0.7 + phen[p + P.Sense]! * 0.9 - phen[qp + P.Conceal]! * 0.6) * (1 - 0.5 * night);
          const def = 1 - phen[qp + P.Defense]! * 0.75 * (1 - phen[p + P.Attack]! * 0.6);
          const tox = 1 - sat(genome[qg + G.Toxicity]! - genome[c * GENE_COUNT + G.ToxinResist]!);
          const k = Math.min(1, overlap * 1.4) * sizeFit * pursuit * detect * def * tox * meat;
          kappa[i * M + j] = k;
          claimM[j] = claimM[j]! + cap * k;
          anyPredator = true;
        }
      }
      if (anyPredator) {
        for (let j = 0; j < n; j++) {
          if (claimM[j]! <= 0) continue;
          const q = this.regionList[a + j]!;
          const perPrey = phen[q * PHEN_COUNT + P.Mass75]! * E_PREY;
          const catchable = count[q]! * 0.35 * perPrey;
          const share = claimM[j]! > catchable ? catchable / claimM[j]! : 1;
          let takenEnergy = 0;
          for (let i = 0; i < n; i++) {
            const k = kappa[i * M + j]!;
            if (k <= 0) continue;
            const e = capacity[i]! * k * share;
            got[i] = got[i]! + e;
            takenEnergy += e;
            const ps = this.species[sp[this.regionList[a + i]!]!]!;
            const qs = this.species[sp[q]!]!;
            if (qs.topPredator < 0 || e > demand[i]! * 0.2) qs.topPredator = ps.id;
          }
          eaten[j] = takenEnergy / perPrey;
          this.carrion[r] = this.carrion[r]! + takenEnergy * 0.2;
        }
      }
      // births and deaths
      for (let i = 0; i < n; i++) {
        const c = this.regionList[a + i]!;
        const p = c * PHEN_COUNT;
        const s = this.species[sp[c]!]!;
        const nNow = count[c]!;
        const e = Math.min(1.35, Math.min(got[i]!, capacity[i]!) / Math.max(1e-9, demand[i]!));
        fed[c] = e;
        const fit = fl[i]! + fs[i]!;
        const births = e > 0.7 ? phen[p + P.RMax]! * ((e - 0.7) / 0.3) * act[i]! : 0;
        const starve = e < 0.7 ? (0.7 - e) * 1.7 : 0;
        const st = stress[i]!;
        const thermal = st * 0.35 + st * st * 1.5;
        const habitat = fit < 0.3 ? (0.3 - fit) * 2.5 : 0;
        const rate = births - phen[p + P.Death]! - starve - thermal - habitat;
        let next = nNow * Math.exp(Math.max(-2.2, Math.min(1, rate * tau)));
        const predLoss = Math.min(next * 0.6, eaten[i]! * tau);
        next -= predLoss;
        s.lossStarve += nNow * starve * tau;
        s.lossThermal += nNow * thermal * tau;
        s.lossHabitat += nNow * habitat * tau;
        s.lossPredation += predLoss;
        this.carrion[r] = this.carrion[r]! + Math.max(0, nNow - next) * phen[p + P.Mass75]! * E_PREY * 0.1;
        if (next < 2 || !(next === next)) this.kill(c);
        else count[c] = next;
      }
    }
    this.disperse(rng, tau);
    this.tally(year);
    if (this.stepCount % 6 === 0) this.detectSpeciation(rng, year);
  }

  /**
   * Cohorts of one species in one region interbreed: close genomes merge, tiny minorities are swamped,
   * and at most three distinct lines of a species persist per region.
   */
  private consolidate(): void {
    const R = this.reg.count;
    for (let r = 0; r < R; r++) {
      const a = this.regionStart[r]!, b = this.regionStart[r + 1]!;
      if (b - a < 2) continue;
      for (let i = a; i < b; i++) {
        const c = this.regionList[i]!;
        if (!this.alive[c]) continue;
        let lines = 1;
        for (let j = a; j < b; j++) {
          if (j === i) continue;
          const d = this.regionList[j]!;
          if (!this.alive[d] || this.sp[d] !== this.sp[c] || this.count[d]! > this.count[c]!) continue;
          const dist = geneDistance(this.genome, c * GENE_COUNT, this.genome, d * GENE_COUNT);
          const minority = this.count[d]! < this.count[c]! * 0.03;
          if (dist < MERGE_DISTANCE) {
            // close kin interbreed: genes mix
            this.blend(c, this.count[d]!, this.genome, d * GENE_COUNT);
            this.kill(d);
          } else if ((minority && dist < 0.22) || lines >= 2) {
            // a distinct line that is tiny or surplus is absorbed without changing the bigger line's genes,
            // so a locally adapted population is not averaged away by its neighbours
            this.count[c] = this.count[c]! + this.count[d]! * 0.5;
            this.kill(d);
          } else lines++;
        }
      }
    }
  }

  /** Find a cohort of the same species in a region with a close genome. */
  private findKin(region: number, species: number, src: Float32Array, so: number, maxDist: number): number {
    const list = this.cohortsIn(region);
    let best = -1, bd = maxDist;
    for (let k = 0; k < list.length; k++) {
      const c = list[k]!;
      if (!alive(this, c) || this.sp[c] !== species) continue;
      const d = geneDistance(this.genome, c * GENE_COUNT, src, so);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  private blend(c: number, n: number, src: Float32Array, so: number): void {
    const o = c * GENE_COUNT;
    const total = this.count[c]! + n;
    const w = n / total;
    for (let i = 0; i < GENE_COUNT; i++) this.genome[o + i] = this.genome[o + i]! * (1 - w) + src[so + i]! * w;
    this.count[c] = total;
    computePhenotype(this.genome, o, this.phen, c * PHEN_COUNT);
  }

  /** Movement between regions, founder mutations, and mutation in place. */
  private disperse(rng: RNG, tau: number): void {
    const reg = this.reg;
    const { phen, count, genome } = this;
    const tmp = new Float32Array(GENE_COUNT);
    const occupancy = new Uint8Array(reg.count);
    for (let c = 0; c < this.high; c++) if (this.alive[c]) occupancy[this.region[c]!] = Math.min(255, occupancy[this.region[c]!]! + 1);
    const high = this.high;
    const t4 = Math.min(1, tau * 4);
    for (let c = 0; c < high; c++) {
      if (!this.alive[c]) continue;
      const p = c * PHEN_COUNT, g = c * GENE_COUNT;
      const r = this.region[c]!;
      const n = count[c]!;
      if (n < 20) continue;
      const hungry = this.fed[c]! < 0.85 ? 0.25 : 0;
      const pMove = Math.min(0.85, (0.1 + 0.45 * genome[g + G.Migration]! + 0.3 * phen[p + P.Fly]! + hungry + 0.15 * genome[g + G.Curiosity]!) * t4);
      if (rng.chance(pMove)) {
        let nb = reg.grid.neighbors[r * 6 + rng.int(reg.grid.ncount[r]!)]!;
        // strong fliers and swimmers range further
        if (phen[p + P.Fly]! > 0.5 && rng.chance(0.5)) nb = reg.grid.neighbors[nb * 6 + rng.int(reg.grid.ncount[nb]!)]!;
        const land = reg.land[nb]!;
        const fit = this.fitLand(c, land) + this.fitSea(c, 1 - land);
        if (fit > 0.12) {
          const moving = n * (0.12 + 0.2 * rng.next());
          const founder = rng.chance(0.3);
          if (founder) mutateInto(genome, g, tmp, 0, rng, 1.8);
          const src = founder ? tmp : genome;
          const so = founder ? 0 : g;
          const kin = this.findKinDirect(nb, this.sp[c]!, src, so, founder ? 0.05 : MERGE_DISTANCE);
          if (kin >= 0) {
            this.blend(kin, moving, src, so);
            count[c] = n - moving;
          } else if (occupancy[nb]! < REGION_CAP || this.makeRoom(nb, moving * phen[p + P.Mass]!)) {
            const made = this.spawn(this.sp[c]!, nb, moving, src, so);
            if (made >= 0) {
              count[c] = n - moving;
              occupancy[nb] = occupancy[nb]! + 1;
            }
          }
        }
      }
      // mutation in place: a variant line splits off and competes with its parents
      if (rng.chance(Math.min(0.5, 0.15 * t4)) && count[c]! > 40) {
        mutateInto(genome, g, tmp, 0, rng, 1.6);
        const part = count[c]! * 0.1;
        if (occupancy[r]! < REGION_CAP || this.makeRoom(r, part * phen[p + P.Mass]!)) {
          if (this.spawn(this.sp[c]!, r, part, tmp, 0) >= 0) {
            count[c] = count[c]! - part;
            occupancy[r] = occupancy[r]! + 1;
          }
        } else {
          // no room: the variant's genes simply flow into the parent line
          const o = c * GENE_COUNT;
          for (let i = 0; i < GENE_COUNT; i++) genome[o + i] = genome[o + i]! * 0.9 + tmp[i]! * 0.1;
          computePhenotype(genome, o, phen, p);
        }
      }
    }
  }

  /** Like findKin but scans all cohorts of a region without relying on the (stale) region lists. */
  private findKinDirect(region: number, species: number, src: Float32Array, so: number, maxDist: number): number {
    const list = this.cohortsIn(region);
    let best = -1, bd = maxDist;
    for (let k = 0; k < list.length; k++) {
      const c = list[k]!;
      if (!this.alive[c] || this.sp[c] !== species || this.region[c] !== region) continue;
      const d = geneDistance(this.genome, c * GENE_COUNT, src, so);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Try to free a slot in a crowded region by removing a much smaller cohort. */
  private makeRoom(region: number, incomingBiomass: number): boolean {
    const list = this.cohortsIn(region);
    let weakest = -1, wb = incomingBiomass * 0.5;
    for (let k = 0; k < list.length; k++) {
      const c = list[k]!;
      if (!this.alive[c] || this.region[c] !== region) continue;
      const b = this.count[c]! * this.phen[c * PHEN_COUNT + P.Mass]!;
      if (b < wb) { wb = b; weakest = c; }
    }
    if (weakest < 0) return false;
    this.species[this.sp[weakest]!]!.lossStarve += this.count[weakest]!;
    this.kill(weakest);
    return true;
  }

  private tally(year: number): void {
    const { species } = this;
    for (const s of species) { s.pop = 0; s.biomass = 0; s.cohorts = 0; s.regions = 0; }
    const best = new Float64Array(species.length);
    let pop = 0, bio = 0;
    for (let c = 0; c < this.high; c++) {
      if (!this.alive[c]) continue;
      const s = species[this.sp[c]!]!;
      const n = this.count[c]!;
      s.pop += n;
      const b = n * this.phen[c * PHEN_COUNT + P.Mass]!;
      s.biomass += b;
      s.cohorts++;
      if (b > best[s.id]!) { best[s.id] = b; s.home = this.region[c]!; }
      pop += n; bio += b;
    }
    this.totalPop = pop;
    this.totalBiomass = bio;
    // count distinct regions cheaply: cohorts of one species in one region are few, so cohorts ~ regions
    for (const s of species) {
      if (s.extinctYear >= 0) continue;
      s.regions = s.cohorts;
      if (s.pop > s.peakPop) s.peakPop = s.pop;
      if (s.regions > s.peakRegions) s.peakRegions = s.regions;
      if (s.cohorts === 0 && year > s.bornYear) {
        s.extinctYear = year;
        this.livingSpecies--;
        this.extinctions.push(s);
        this.version++;
      }
    }
  }

  /**
   * Split species whose populations have drifted apart. A population that is genetically far from
   * its species and separated from it, by geography or by way of life, becomes a new species.
   */
  private detectSpeciation(rng: RNG, year: number): void {
    const { species, genome, phen } = this;
    const bySpecies = new Map<number, number[]>();
    for (let c = 0; c < this.high; c++) {
      if (!this.alive[c]) continue;
      let l = bySpecies.get(this.sp[c]!);
      if (!l) { l = []; bySpecies.set(this.sp[c]!, l); }
      l.push(c);
    }
    const centroid = new Float32Array(GENE_COUNT);
    const coreRegions = new Set<number>();
    for (const [sid, list] of bySpecies) {
      const s = species[sid]!;
      centroid.fill(0);
      let total = 0;
      for (const c of list) {
        const w = this.count[c]!;
        total += w;
        const o = c * GENE_COUNT;
        for (let i = 0; i < GENE_COUNT; i++) centroid[i] = centroid[i]! + genome[o + i]! * w;
      }
      // the reference genome follows the population slowly (gradual change within a species)
      for (let i = 0; i < GENE_COUNT; i++) s.ref[i] = s.ref[i]! + (centroid[i]! / total - s.ref[i]!) * 0.05;
      // an emptier world splits more readily: open niches invite new forms
      const sparse = this.livingSpecies < 8;
      const need = SPECIATION_DISTANCE * (sparse ? 0.72 : 1);
      if (list.length < (sparse ? 2 : 3) || year - s.lastSplit < (sparse ? 0.3e6 : 1.5e6) || this.livingSpecies >= HARD_SPECIES_CAP) continue;
      // the most successful far-out population seeds a candidate species
      let seed = -1, seedN = total * 0.004;
      coreRegions.clear();
      for (const c of list) {
        const d = geneDistance(genome, c * GENE_COUNT, s.ref, 0);
        if (d < need * 0.6) coreRegions.add(this.region[c]!);
        else if (d > need && this.count[c]! > seedN) { seedN = this.count[c]!; seed = c; }
      }
      if (seed < 0) continue;
      const group: number[] = [];
      let groupPop = 0, isolatedPop = 0;
      for (const c of list) {
        if (geneDistance(genome, c * GENE_COUNT, genome, seed * GENE_COUNT) < need * 0.5
          && geneDistance(genome, c * GENE_COUNT, s.ref, 0) > need * 0.7) {
          group.push(c);
          groupPop += this.count[c]!;
          if (!coreRegions.has(this.region[c]!)) isolatedPop += this.count[c]!;
        }
      }
      if (group.length === list.length || groupPop < total * 0.03) continue;
      const groupRegions = new Set(group.map((c) => this.region[c]!)).size;
      const isolated = isolatedPop > groupPop * (sparse ? 0.5 : 0.7) && groupRegions >= (sparse ? 2 : 4);
      centroid.fill(0);
      let gLand = 0, gFly = 0;
      for (const c of group) {
        const o = c * GENE_COUNT;
        const w = this.count[c]! / groupPop;
        for (let i = 0; i < GENE_COUNT; i++) centroid[i] = centroid[i]! + genome[o + i]! * w;
        gLand += phen[c * PHEN_COUNT + P.LandUse]! * w;
        gFly += phen[c * PHEN_COUNT + P.Fly]! * w;
      }
      refPhen.fill(0);
      computePhenotype(s.ref, 0, refPhen, 0);
      const dLand = gLand - refPhen[P.LandUse]!;
      const dFly = gFly - refPhen[P.Fly]!;
      const dDiet = centroid[G.Diet]! - s.ref[G.Diet]!;
      const dNight = centroid[G.Nocturnal]! - s.ref[G.Nocturnal]!;
      const dSize = centroid[G.Size]! - s.ref[G.Size]!;
      let reason = '';
      if (Math.abs(dLand) > 0.3) reason = dLand > 0 ? 'land' : 'sea';
      else if (Math.abs(dFly) > 0.2) reason = 'air';
      else if (Math.abs(dDiet) > 0.22) reason = dDiet > 0 ? 'meat' : 'plants';
      else if (Math.abs(dNight) > 0.4) reason = 'night';
      else if (Math.abs(dSize) > 0.13) reason = 'size';
      if (!isolated && !reason) continue;
      const major = reason === 'land' || reason === 'sea' || reason === 'air' || reason === 'meat' || reason === 'plants';
      if (!major && this.livingSpecies >= SOFT_SPECIES_CAP) continue;
      s.lastSplit = year;
      const sameGenus = geneDistance(centroid, 0, s.genusRef, 0) < 0.8;
      const ns = this.addSpecies(centroid, 0, sid, year, '', sameGenus ? s.genus : '', sameGenus ? s.genusRef : centroid.slice());
      for (const c of group) this.sp[c] = ns.id;
      ns.home = this.region[seed]!;
      this.newSpecies.push({ species: ns, reason: reason || 'isolation', isolated });
      void rng;
    }
  }

  /** Population-weighted mean of a gene or phenotype value for a species. */
  speciesMean(sid: number, idx: number, fromPhen: boolean): number {
    let v = 0, w = 0;
    for (let c = 0; c < this.high; c++) {
      if (!this.alive[c] || this.sp[c] !== sid) continue;
      const n = this.count[c]!;
      v += (fromPhen ? this.phen[c * PHEN_COUNT + idx]! : this.genome[c * GENE_COUNT + idx]!) * n;
      w += n;
    }
    return w > 0 ? v / w : 0;
  }
}

const refPhen = new Float32Array(PHEN_COUNT);

function alive(cr: Creatures, c: number): boolean {
  return cr.alive[c] === 1;
}
