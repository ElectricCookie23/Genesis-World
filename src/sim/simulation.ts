// The whole deterministic simulation. Runs in the worker and in headless tests.
import { RNG, hashSeed } from './rng';
import { BIOME_NAMES, buildGrid, createWorld, GRID_N, type Grid, type World } from './world';
import { computeDrainage, erode, erupt, generateTerrain, impact, type GeologyState, type VolcanoSite } from './geology';
import { classifyBiomes, createClimate, updateMoisture, updateSnow, updateTemperature, type ClimateState } from './climate';
import { EventLog, type SimEvent } from './events';
import { buildRegions, updateRegions, type Regions } from './regions';
import { Plants, type PlantSpecies } from './plants';
import { Creatures, type Species } from './creatures';
import { G, GENE_COUNT, P, PG, PLANT_GENES, sizeMetres } from './genetics';
import { nameSpecies, plantName } from './naming';
import { placeName } from './names';

/** Sim years covered by one full ecological step (one tick at Epoch speed). */
export const ECO_YEARS = 15000;

type EraKind = 'none' | 'ice' | 'warm' | 'winter';

export class Simulation {
  readonly seed: string;
  readonly grid: Grid;
  readonly world: World;
  readonly rng: RNG;
  readonly geology: GeologyState;
  readonly climate: ClimateState;
  readonly regions: Regions;
  readonly plants: Plants;
  readonly creatures: Creatures;
  readonly events = new EventLog();
  simYear = 0;
  moonAngle = 0;
  terrainDirty = true;
  /** Highest importance of any event created in the last step (the worker slows down for big ones). */
  bigEvent = 0;
  private drainageTimer = 0;
  private ecoAcc = 0;
  private baseTemp: number;
  private baseIce: number;
  era: { kind: EraKind; eventId: number } = { kind: 'none', eventId: -1 };
  private smoothAnomaly = 0;
  private eraChanged = -1e12;
  private seaState = 0;
  private seaEvent = -1;
  private lifeYear: number;
  private algaeDelay: number;
  private animalDelay: number;
  private algaeYear = -1;
  private lifeEvent = -1;
  private algaeEvent = -1;
  private animalEvent = -1;
  private oxygenEvent = -1;
  stage: 'barren' | 'microbes' | 'algae' | 'animals' = 'barren';
  readonly milestones = new Map<string, number>();
  private taken = new Set<string>();
  private lastTemplate = new Map<string, number>();
  private recentExtinctions: { year: number; causes: number[] }[] = [];
  private lastMassExtinction = -1e12;
  private massEvent = -1;
  private radiationCount = 0;
  private radiationDeclared = true;
  /** Last disaster event to touch each region. */
  private regionEvent: Int32Array;
  private lifeRng: RNG;
  private geoRng: RNG;
  private nameRng: RNG;
  private milestoneTimer = 0;
  /** Milliseconds spent in each part, for tuning. */
  readonly prof = { climate: 0, plants: 0, creatures: 0, paint: 0, regions: 0 };

  constructor(seed: string, gridN: number = GRID_N, grid?: Grid) {
    this.seed = seed;
    this.rng = new RNG(hashSeed(seed));
    this.grid = grid ?? buildGrid(gridN);
    this.world = createWorld(this.grid);
    this.geology = generateTerrain(this.world, this.rng.fork('geology'));
    this.climate = createClimate(this.world, this.rng);
    updateTemperature(this.world, this.climate, 0, -1);
    updateMoisture(this.world, this.climate, 60);
    updateSnow(this.world, this.climate, 1000);
    updateTemperature(this.world, this.climate, 0, -1);
    classifyBiomes(this.world, this.climate);
    computeDrainage(this.world);
    this.baseTemp = this.climate.meanTemp - this.longCycle();
    this.baseIce = this.iceVolume();
    this.regions = buildRegions(this.grid);
    updateRegions(this.regions, this.world, this.climate);
    this.plants = new Plants(this.regions);
    this.creatures = new Creatures(this.regions, this.plants);
    this.regionEvent = new Int32Array(this.regions.count).fill(-1);
    this.lifeRng = this.rng.fork('life');
    this.geoRng = this.rng.fork('events');
    this.nameRng = this.rng.fork('names');
    this.lifeYear = this.lifeRng.range(0.35e6, 0.9e6);
    this.algaeDelay = this.lifeRng.range(1.2e6, 3e6);
    this.animalDelay = this.lifeRng.range(5e6, 10e6);
    this.events.add(0, {
      type: 'world-formed',
      title: 'The world forms',
      description: 'The world is quiet. The water is warm.',
      importance: 1,
    });
  }

  get yearFrac(): number {
    return this.simYear - Math.floor(this.simYear);
  }

  private longCycle(): number {
    let o = 0;
    for (const c of this.climate.cycles) o += c.amp * Math.sin((this.simYear / c.period) * Math.PI * 2 + c.phase);
    return o;
  }

  private iceVolume(): number {
    const { snow, elevation, seaLevel } = this.world;
    let v = 0;
    for (let i = 0; i < this.grid.count; i++) if (elevation[i]! > seaLevel) v += snow[i]!;
    return v / this.grid.count;
  }

  /** Pick a sentence template, never the same one twice in a row for a given kind. */
  private say(kind: string, options: string[]): string {
    let i = this.nameRng.int(options.length);
    if (options.length > 1 && i === this.lastTemplate.get(kind)) i = (i + 1) % options.length;
    this.lastTemplate.set(kind, i);
    return options[i]!;
  }

  private emit(e: Parameters<EventLog['add']>[1]): SimEvent {
    const ev = this.events.add(this.simYear, e);
    if (ev.importance > this.bigEvent) this.bigEvent = ev.importance;
    return ev;
  }

  private milestone(key: string, title: string, description: string, cell: number, causes: number[], speciesIds?: number[]): void {
    if (this.milestones.has(key)) return;
    const ev = this.emit({ type: 'milestone', title, description, cellId: cell, causes, importance: 3, speciesIds, data: { key } });
    this.milestones.set(key, ev.id);
  }

  /** Advance the simulation by dt years (fixed timestep chosen by the caller). */
  step(dt: number): void {
    if (dt <= 0) return;
    this.bigEvent = 0;
    this.simYear += dt;
    this.moonAngle = (this.simYear * 13.37 * Math.PI * 2) % (Math.PI * 2);
    const seasonal = dt < 0.2;
    const c = this.climate;
    const w = this.world;
    const tc = performance.now();
    c.aerosol *= Math.exp(-dt / 6);
    c.forced *= Math.exp(-dt / 30000);
    c.greenhouse += (2.5 - c.greenhouse) * (1 - Math.exp(-dt / 2.5e6));
    updateTemperature(w, c, this.simYear, seasonal ? this.yearFrac : -1);
    updateMoisture(w, c, 1);
    updateSnow(w, c, dt);
    // ice sheets lock up water: sea level falls in cold eras and rises in warm ones
    const target = Math.max(-0.3, Math.min(0.2, -(this.iceVolume() - this.baseIce) * 0.035));
    w.seaLevel += (target - w.seaLevel) * 0.15;
    classifyBiomes(w, c);
    // visual fields fade by sim time, but stay visible for about a second at high speed
    const ashK = Math.max(Math.exp(-dt / 60), 0.93);
    const lavaK = Math.max(Math.exp(-dt / 4), 0.9);
    for (let i = 0; i < this.grid.count; i++) {
      if (w.ash[i]! > 0) w.ash[i] = w.ash[i]! < 0.004 ? 0 : w.ash[i]! * ashK;
      if (w.lava[i]! > 0) w.lava[i] = w.lava[i]! < 0.004 ? 0 : w.lava[i]! * lavaK;
    }
    this.prof.climate += performance.now() - tc;
    this.updateEras(dt);
    this.geologyEvents(dt);
    this.ecoAcc += dt / ECO_YEARS;
    if (this.ecoAcc >= 0.02) {
      const tau = Math.min(1, this.ecoAcc);
      this.ecoAcc = 0;
      this.ecology(tau);
    }
    this.drainageTimer += 1;
    if (this.drainageTimer >= 40) {
      this.drainageTimer = 0;
      computeDrainage(w);
    }
  }

  // ---------------------------------------------------------------- climate eras

  private rootClimateCause(): number {
    // a recent great eruption or impact explains a climate swing; otherwise the orbit does
    const recent = this.events.recent('impact', this.simYear, 400_000) ?? this.events.recent('super-eruption', this.simYear, 600_000);
    if (recent) return recent.id;
    const orbit = this.events.recent('orbital-shift', this.simYear, 2e6);
    if (orbit) return orbit.id;
    return this.emit({
      type: 'orbital-shift',
      title: 'The orbit shifts',
      description: this.say('orbit', [
        'The planet\'s orbit stretches a little and its axis nods. Sunlight falls differently now.',
        'A slow wobble of the axis changes where the sunlight lands.',
        'Over thousands of years the path around the sun changes shape.',
      ]),
      importance: 0,
    }).id;
  }

  private updateEras(dt: number): void {
    // judge eras on a smoothed temperature so short wobbles do not start and end ages
    const k = 1 - Math.exp(-dt / 400_000);
    this.smoothAnomaly += (this.climate.meanTemp - this.baseTemp - this.smoothAnomaly) * k;
    const anomaly = this.smoothAnomaly;
    const era = this.era;
    const settled = this.simYear - this.eraChanged > 1.2e6;
    const before = era.eventId;
    if (era.kind === 'none' && settled) {
      if (anomaly < -2.4) {
        const ev = this.emit({
          type: 'ice-age', title: 'An ice age begins',
          description: this.say('ice', [
            'The world cools. Ice creeps down from the poles and the seas draw back.',
            'Winters stop ending. Glaciers spread and the coastlines step outward.',
            'Cold settles over the planet. The ice sheets grow year after year.',
          ]),
          causes: [this.rootClimateCause()], importance: 2,
        });
        this.era = { kind: 'ice', eventId: ev.id };
      } else if (anomaly > 2.4) {
        const ev = this.emit({
          type: 'greenhouse', title: 'A warm era begins',
          description: this.say('warm', [
            'The air thickens and warms. Ice retreats and the seas rise.',
            'Heat builds across the planet. Forest belts push toward the poles.',
            'A long warm age begins. The polar caps shrink to nothing.',
          ]),
          causes: [this.rootClimateCause()], importance: 2,
        });
        this.era = { kind: 'warm', eventId: ev.id };
      }
    } else if (era.kind === 'ice' && settled && anomaly > -1.0) {
      this.emit({
        type: 'ice-age-end', title: 'The ice retreats',
        description: this.say('ice-end', ['The glaciers pull back and meltwater fills the lowlands.', 'Warmth returns. The ice sheets break up and the seas rise again.']),
        causes: [era.eventId], importance: 1,
      });
      this.era = { kind: 'none', eventId: -1 };
    } else if (era.kind === 'warm' && settled && anomaly < 1.0) {
      this.emit({
        type: 'greenhouse-end', title: 'The warm era ends',
        description: this.say('warm-end', ['The long heat fades and the poles whiten again.', 'Cooler air returns and the first frost in ages touches the high ground.']),
        causes: [era.eventId], importance: 1,
      });
      this.era = { kind: 'none', eventId: -1 };
    } else if (era.kind === 'winter' && this.climate.forced > -1.5) {
      this.emit({
        type: 'winter-end', title: 'The sky clears',
        description: this.say('winter-end', ['The dust settles at last and sunlight reaches the ground again.', 'The long darkness lifts.']),
        causes: [era.eventId], importance: 1,
      });
      this.era = { kind: 'none', eventId: -1 };
    }
    if (this.era.eventId !== before) this.eraChanged = this.simYear;
    // sea level swings open and close land bridges
    const s = this.world.seaLevel;
    if (this.seaState === 0 && s < -0.08) {
      this.seaState = -1;
      this.seaEvent = this.emit({
        type: 'sea-fall', title: 'The seas fall',
        description: this.say('sea-fall', ['So much water is locked in ice that the seas fall. Shallow straits become land bridges.', 'Sea level drops and new land rises between the continents.']),
        causes: this.era.eventId >= 0 ? [this.era.eventId] : [this.rootClimateCause()], importance: 1,
      }).id;
    } else if (this.seaState === 0 && s > 0.08) {
      this.seaState = 1;
      this.seaEvent = this.emit({
        type: 'sea-rise', title: 'The seas rise',
        description: this.say('sea-rise', ['Meltwater lifts the seas. Lowlands drown and peninsulas become islands.', 'The coasts flood. Land bridges sink beneath the waves.']),
        causes: this.era.eventId >= 0 ? [this.era.eventId] : [this.rootClimateCause()], importance: 1,
      }).id;
    } else if (this.seaState !== 0 && Math.abs(s) < 0.03) {
      this.seaState = 0;
    }
  }

  // ---------------------------------------------------------------- geology events

  private geologyEvents(dt: number): void {
    const r = this.geoRng;
    const vol = this.geology.volcanoes;
    if (vol.length) {
      if (r.chance(Math.min(0.9, dt / 40_000))) this.eruption(vol[r.int(vol.length)]!, r.range(0.05, 0.3));
      if (r.chance(Math.min(0.5, dt / 3.5e6))) this.eruption(vol[r.int(vol.length)]!, r.range(0.4, 0.75));
      if (r.chance(Math.min(0.3, dt / 70e6))) this.eruption(vol[r.int(vol.length)]!, 1);
    }
    // meteors fall on their own now and then
    if (r.chance(Math.min(0.3, dt / 90e6))) this.meteor(r.int(this.grid.count), r.range(0.55, 1), false);
  }

  private regionsOf(cells: number[], strength: (k: number) => number): { regions: number[]; kill: number[] } {
    const map = new Map<number, number>();
    for (let k = 0; k < cells.length; k++) {
      const reg = this.regions.regionOf[cells[k]!]!;
      const s = strength(k);
      if (s > (map.get(reg) ?? 0)) map.set(reg, s);
    }
    return { regions: [...map.keys()], kill: [...map.values()] };
  }

  eruption(site: VolcanoSite, magnitude: number): void {
    const w = this.world;
    const big = magnitude > 0.38, huge = magnitude >= 0.95;
    const cells = erupt(w, site, magnitude);
    this.terrainDirty = true;
    const c = this.climate;
    c.aerosol += 1 + 5 * magnitude;
    if (big) c.forced -= huge ? 7 : 1.5 * magnitude;
    c.greenhouse += huge ? 2.2 : 0.25 * magnitude;
    const island = w.elevation[site.cell]! - w.seaLevel < 0.3 && w.elevation[site.cell]! > w.seaLevel;
    const ev = this.emit({
      type: huge ? 'super-eruption' : 'eruption',
      cellId: site.cell,
      title: huge ? `${site.name} tears open` : `${site.name} erupts`,
      description: huge
        ? `The ground splits at ${site.name}. Ash darkens the whole sky and fire pours across the land.`
        : this.say('eruption', [
          `${site.name} wakes. Lava runs down its flanks and ash falls for days.`,
          `A column of ash rises over ${site.name}.`,
          `${site.name} breaks open, burying the land around it in ash.`,
          island ? `Fire meets the sea at ${site.name} and new land cools in the surf.` : `${site.name} throws fire into the sky.`,
        ]),
      importance: huge ? 3 : big ? 1 : 0,
      data: { magnitude },
    });
    const radius = Math.round(2 + 9 * magnitude);
    const hit = this.regionsOf(cells, () => 0.25 + 0.5 * magnitude);
    void radius;
    for (const reg of hit.regions) this.regionEvent[reg] = ev.id;
    this.creatures.disaster({ regions: hit.regions, kill: hit.kill, eventId: ev.id });
    if (huge) {
      const winter = this.emit({
        type: 'volcanic-winter', title: 'A volcanic winter',
        description: 'Ash hides the sun. Summers fail and the cold reaches the equator.',
        causes: [ev.id], importance: 2,
      });
      this.era = { kind: 'winter', eventId: winter.id };
      this.globalDieback(0.35, winter.id);
    }
  }

  /** A meteor strike. size 0..1. Used by the god tool and by rare natural impacts. */
  meteor(cell: number, size: number, byHand: boolean): SimEvent {
    const w = this.world;
    const name = placeName(this.nameRng);
    const hitInfo = impact(w, cell, size);
    this.terrainDirty = true;
    const c = this.climate;
    c.aerosol += 6 + 10 * size;
    c.forced -= 4 + 9 * size;
    const sea = w.elevation[cell]! <= w.seaLevel;
    const ev = this.emit({
      type: 'impact', cellId: cell,
      title: `The ${name} impact`,
      description: sea
        ? `A mountain of rock falls from the sky into the sea. Waves race outward and steam climbs to the edge of space.`
        : `A mountain of rock falls from the sky. The flash is seen across half the world, and the ground rings like a bell.`,
      importance: 3,
      data: { size, byHand: byHand ? 1 : 0 },
    });
    const hit = this.regionsOf(hitInfo.cells, (k) => Math.max(0, 1 - hitInfo.dist[k]! / (hitInfo.radius * 2.5)));
    for (const reg of hit.regions) this.regionEvent[reg] = ev.id;
    this.creatures.disaster({ regions: hit.regions, kill: hit.kill, eventId: ev.id });
    const winter = this.emit({
      type: 'impact-winter', title: 'Impact winter',
      description: 'Dust and soot wrap the planet. Plants starve for light and the cold deepens month after month.',
      causes: [ev.id], importance: 2,
    });
    this.era = { kind: 'winter', eventId: winter.id };
    this.globalDieback(0.3 + 0.5 * size, winter.id);
    return ev;
  }

  /** Darkness and cold kill plants everywhere; animals starve afterwards on their own. */
  private globalDieback(fraction: number, eventId: number): void {
    const p = this.plants;
    for (let i = 0; i < p.slotCover.length; i++) {
      if (p.slotSp[i]! >= 0) p.slotCover[i] = p.slotCover[i]! * (1 - fraction * (0.6 + 0.4 * this.geoRng.next()));
    }
    this.regionEvent.fill(eventId);
    const all: number[] = [], kill: number[] = [];
    for (let r = 0; r < this.regions.count; r++) { all.push(r); kill.push(fraction * 0.5); }
    this.creatures.disaster({ regions: all, kill, eventId });
  }

  // ---------------------------------------------------------------- life

  private ecology(tau: number): void {
    const reg = this.regions;
    const tr = performance.now();
    updateRegions(reg, this.world, this.climate);
    this.prof.regions += performance.now() - tr;
    this.originOfLife();
    if (this.stage === 'barren' || this.stage === 'microbes') {
      this.milestoneTimer++;
      if (this.milestoneTimer % 16 === 0 && erode(this.world, Math.min(0.5, 0.06 * 16 * tau))) this.terrainDirty = true;
      return;
    }
    const p = this.plants;
    const t0 = performance.now();
    p.step(this.world, this.climate, this.lifeRng, this.simYear, tau);
    const t1 = performance.now();
    if (this.stage === 'animals') this.creatures.step(this.lifeRng, this.simYear, tau, p.oxygen);
    const t2 = performance.now();
    this.fires();
    p.paint(this.world, this.climate);
    const t3 = performance.now();
    this.prof.plants += t1 - t0; this.prof.creatures += t2 - t1; this.prof.paint += t3 - t2;
    this.plantEvents();
    this.creatureEvents();
    this.milestoneTimer++;
    if (this.milestoneTimer % 8 === 0) this.checkMilestones();
    if (this.milestoneTimer % 16 === 0 && erode(this.world, Math.min(0.5, 0.06 * 16 * tau))) this.terrainDirty = true;
  }

  private bestSeaRegion(): number {
    const reg = this.regions;
    let best = 0, score = -1;
    for (let r = 0; r < reg.count; r++) {
      const s = reg.shallow[r]! * (1 - Math.abs(reg.temp[r]! - 22) / 30) + (1 - reg.land[r]!) * 0.1;
      if (s > score) { score = s; best = r; }
    }
    return best;
  }

  private originOfLife(): void {
    const reg = this.regions;
    if (this.stage === 'barren' && this.simYear >= this.lifeYear) {
      this.stage = 'microbes';
      const r = this.bestSeaRegion();
      this.milestone('first-life', 'First life',
        'In a warm, shallow sea, chemistry becomes biology. Something tiny copies itself, and then does it again.', reg.centre[r]!, [0]);
      this.lifeEvent = this.milestones.get('first-life')!;
      this.algaeYear = this.simYear + this.algaeDelay;
    } else if (this.stage === 'microbes' && this.simYear >= this.algaeYear) {
      this.stage = 'algae';
      const genes = new Float32Array(PLANT_GENES);
      genes[PG.Height] = 0.03; genes[PG.Leaf] = 0.55; genes[PG.LeafHue] = 0.36; genes[PG.FlowerHue] = 0.5; genes[PG.Fruit] = 0.05;
      genes[PG.Thorns] = 0; genes[PG.Toxicity] = 0.05; genes[PG.Growth] = 0.8; genes[PG.Dispersal] = 0.1; genes[PG.WaterNeed] = 1;
      genes[PG.Glow] = 0.05; genes[PG.FireResist] = 0;
      const sp = this.plants.addSpecies(genes, -1, this.simYear);
      const r0 = this.bestSeaRegion();
      this.plants.seed(r0, sp.id, 0.05);
      for (let k = 0; k < reg.grid.ncount[r0]!; k++) this.plants.seed(reg.grid.neighbors[r0 * 6 + k]!, sp.id, 0.03);
      sp.name = plantName(genes, true, this.nameRng, this.taken);
      sp.established = true;
      const ev = this.emit({
        type: 'milestone', title: 'Sunlight eaters', cellId: reg.centre[r0]!,
        description: `Green films spread across the shallows. ${sp.name} feeds on light itself and breathes out oxygen.`,
        causes: [this.lifeEvent], importance: 3, data: { key: 'first-algae' },
      });
      sp.eventId = ev.id;
      this.algaeEvent = ev.id;
      this.milestones.set('first-algae', ev.id);
    } else if (this.stage === 'algae' && this.simYear >= this.algaeYear + this.animalDelay && this.plants.totalSeaCover > this.regions.count * 0.04) {
      this.stage = 'animals';
      const g = new Float32Array(GENE_COUNT).fill(0.2);
      const r = this.lifeRng;
      for (let i = 0; i < GENE_COUNT; i++) g[i] = 0.12 + r.next() * 0.16;
      g[G.Size] = 0.08; g[G.LimbType] = 0.3; g[G.LimbPairs] = 0.2; g[G.LimbLength] = 0.2; g[G.Tail] = 0.5; g[G.Head] = 0.45;
      g[G.Diet] = 0.03; g[G.Water] = 1; g[G.WarmBlood] = 0.05; g[G.Metabolism] = 0.3; g[G.EyeCount] = 0; g[G.EyeSize] = 0.05; g[G.Sight] = 0.05;
      g[G.Offspring] = 0.85; g[G.Care] = 0.02; g[G.Lifespan] = 0.2; g[G.Maturity] = 0.1; g[G.HeatTol] = 0.5; g[G.ColdTol] = 0.5;
      g[G.Intelligence] = 0.02; g[G.Armor] = 0.02; g[G.Horn] = 0; g[G.Glow] = 0.03; g[G.Echo] = 0.05; g[G.Electric] = 0.05; g[G.Venom] = 0.02;
      g[G.Toxicity] = 0.03; g[G.Insulation] = 0; g[G.Aggression] = 0.1; g[G.Hue] = r.next(); g[G.Hue2] = r.next();
      const sp = this.creatures.addSpecies(g, 0, -1, this.simYear, '', '', g.slice());
      // seed in the richest algae waters
      const order = [...Array(reg.count).keys()].sort((a, b) => this.plants.seaFood[b]! - this.plants.seaFood[a]!).slice(0, 8);
      for (const reg0 of order) this.creatures.spawn(sp.id, reg0, 5000, g, 0);
      nameSpecies(this.creatures, sp, 'sea', this.world.biome[reg.centre[order[0]!]!]!, this.nameRng, this.taken);
      const ev = this.emit({
        type: 'milestone', title: 'First animals', cellId: reg.centre[order[0]!]!,
        description: `Something moves on purpose. ${sp.name}, a soft thing the length of a finger, grazes the green films of the shallows.`,
        causes: [this.algaeEvent], importance: 3, speciesIds: [sp.id], data: { key: 'first-animal' },
      });
      sp.eventId = ev.id;
      this.animalEvent = ev.id;
      this.milestones.set('first-animal', ev.id);
    }
    if (this.oxygenEvent < 0 && this.plants.oxygen > 0.06) {
      this.oxygenEvent = this.emit({
        type: 'oxygen', title: 'The air changes',
        description: 'Ages of green water have filled the air with oxygen. High above, an ozone veil forms, and the bare land is no longer scorched by the sun.',
        causes: this.algaeEvent >= 0 ? [this.algaeEvent] : [], importance: 2,
      }).id;
    }
  }

  private fires(): void {
    const burned = this.plants.burned;
    if (!burned.length) return;
    const reg = this.regions, w = this.world;
    for (const r of burned) {
      for (let k = reg.cellStart[r]!; k < reg.cellStart[r + 1]!; k++) {
        const i = reg.cellList[k]!;
        if (w.elevation[i]! > w.seaLevel && w.vegetation[i]! > 0.1) {
          w.ash[i] = Math.max(w.ash[i]!, 0.6);
          if (((i * 2654435761) >>> 0) % 5 === 0) w.lava[i] = Math.max(w.lava[i]!, 0.3);
        }
      }
    }
    if (burned.length >= 4 || this.lifeRng.chance(0.03)) {
      const r = burned[0]!;
      const big = burned.length >= 8;
      const ev = this.emit({
        type: 'wildfire', cellId: reg.centre[r]!,
        title: big ? 'Great fires' : 'Wildfire',
        description: this.say('fire', [
          'Lightning finds dry wood. Fire runs with the wind until rain stops it.',
          'A dry-season storm sets the land alight. Grass will return first, then shrubs, then trees.',
          'Smoke stains the sky for weeks. Under the ash, seeds are already waiting.',
        ]),
        causes: this.era.kind === 'warm' ? [this.era.eventId] : [], importance: big ? 1 : 0,
      });
      for (const b of burned) this.regionEvent[b] = ev.id;
      this.creatures.disaster({ regions: burned.slice(), kill: burned.map(() => 0.15), eventId: ev.id });
    }
  }

  private plantEvents(): void {
    const p = this.plants;
    for (const sp of p.established.splice(0)) {
      sp.name = plantName(sp.genes, sp.aquatic, this.nameRng, this.taken);
      const parent = sp.parent >= 0 ? p.species[sp.parent] : undefined;
      const causes: number[] = [];
      if (parent && parent.eventId >= 0) causes.push(parent.eventId);
      const h = sp.genes[PG.Height]!;
      const kind = sp.aquatic ? 'water plant' : h > 0.6 ? 'tree' : h > 0.3 ? 'shrub' : 'low plant';
      const ev = this.emit({
        type: 'plant-species', title: `${sp.name} spreads`,
        description: `A new ${kind}, ${sp.name}, has taken hold${parent?.name ? `, descended from ${parent.name}` : ''}.`,
        causes, importance: 0, data: { plant: sp.id },
      });
      sp.eventId = ev.id;
      if (!sp.aquatic) {
        this.milestone('first-land-plant', 'Green reaches the land',
          `${sp.name} creeps out of the tide line onto bare rock. For the first time, the land is not only stone.`,
          -1, [ev.id, ...(this.oxygenEvent >= 0 ? [this.oxygenEvent] : [])]);
        if (h > 0.6) this.milestone('first-forest', 'The first forests', `${sp.name} grows tall enough to cast real shade. Under it, a new kind of place begins: the forest floor.`, -1, [ev.id]);
        if (sp.genes[PG.Fruit]! > 0.6) this.milestone('first-fruit', 'The first fruit', `${sp.name} wraps its seeds in something sweet, an offer to any animal that will carry them.`, -1, [ev.id]);
        if (sp.genes[PG.Glow]! > 0.55) this.milestone('first-glow-plant', 'Light in the leaves', `At night, ${sp.name} glows softly.`, -1, [ev.id]);
      }
    }
    for (const sp of p.extinct.splice(0)) {
      if (sp.peakCover < this.regions.count * 0.02) continue;
      this.emit({
        type: 'plant-extinct', title: `${sp.name} is gone`,
        description: `${sp.name} has died out.`,
        causes: [sp.eventId, ...(this.era.eventId >= 0 ? [this.era.eventId] : [])].filter((x) => x >= 0), importance: 0, data: { plant: sp.id },
      });
    }
  }

  private describeSpecies(s: Species): string {
    const cr = this.creatures;
    const land = cr.speciesMean(s.id, P.LandUse, true), fly = cr.speciesMean(s.id, P.Fly, true);
    const m = sizeMetres(s.ref[G.Size]!);
    const size = m < 0.15 ? 'tiny' : m < 0.6 ? 'small' : m < 2 ? 'mid-sized' : m < 4.5 ? 'large' : 'giant';
    const diet = s.ref[G.Diet]! > 0.62 ? 'hunter' : s.ref[G.Diet]! < 0.3 ? 'grazer' : 'forager';
    const where = fly > 0.45 ? 'flying' : land > 0.6 ? 'land' : land > 0.25 ? 'shore' : 'sea';
    return `a ${size} ${where} ${diet}`;
  }

  private creatureEvents(): void {
    const cr = this.creatures;
    const reg = this.regions;
    for (const born of cr.newSpecies.splice(0)) {
      const s = born.species;
      const parent = cr.species[s.parent]!;
      nameSpecies(cr, s, born.reason, this.world.biome[reg.centre[s.home]!]!, this.nameRng, this.taken);
      const causes: number[] = [];
      const weights: number[] = [];
      if (parent.eventId >= 0) { causes.push(parent.eventId); weights.push(1); }
      const afterMass = this.simYear - this.lastMassExtinction < 12e6 && this.massEvent >= 0;
      if (afterMass) { causes.push(this.massEvent); weights.push(0.8); this.radiationCount++; }
      if (born.isolated && this.seaEvent >= 0 && this.seaState !== 0) { causes.push(this.seaEvent); weights.push(0.7); }
      if (this.era.eventId >= 0) { causes.push(this.era.eventId); weights.push(0.4); }
      const what = this.describeSpecies(s);
      const reasonText: Record<string, string[]> = {
        land: [`A branch of ${parent.name} spends more and more time out of the water. It is now ${s.name}, ${what}.`, `${s.name} leaves the sea behind. It is ${what}, descended from ${parent.name}.`],
        sea: [`Some of ${parent.name} return to the water for good and become ${s.name}, ${what}.`],
        air: [`A line of ${parent.name} takes to the air. Call it ${s.name}, ${what}.`],
        meat: [`Some of ${parent.name} stop grazing and start hunting. They are now ${s.name}, ${what}.`],
        plants: [`A branch of ${parent.name} gives up the hunt for an easier meal and becomes ${s.name}, ${what}.`],
        night: [`Part of ${parent.name} retreats into the dark hours and becomes ${s.name}, ${what}.`],
        size: [`${parent.name} splits by size. The new form, ${s.name}, is ${what}.`],
        isolation: [
          `Cut off from its kin, a population of ${parent.name} drifts until it is something new: ${s.name}, ${what}.`,
          `Distance does its slow work. ${s.name}, ${what}, parts ways with ${parent.name}.`,
          `Far from the rest of ${parent.name}, a new form settles in: ${s.name}, ${what}.`,
        ],
      };
      const notable = born.reason !== 'isolation' || s.genus !== parent.genus;
      const ev = this.emit({
        type: 'speciation', cellId: reg.centre[s.home]!, title: `${s.name} appears`,
        description: this.say(`sp-${born.reason}`, reasonText[born.reason] ?? reasonText.isolation!),
        causes, causeWeights: weights, importance: notable ? 1 : 0, speciesIds: [s.id, parent.id], data: { reason: born.reason },
      });
      s.eventId = ev.id;
    }
    for (const s of cr.extinctions.splice(0)) {
      const total = s.lossStarve + s.lossThermal + s.lossPredation + s.lossHabitat + s.lossDisaster + 1e-9;
      const parts: { w: number; cause: number; text: string }[] = [];
      const era = this.era.eventId;
      const regionEv = this.regionEvent[s.home]!;
      if (s.lossDisaster / total > 0.08 && s.disasterEvent >= 0) parts.push({ w: s.lossDisaster / total, cause: s.disasterEvent, text: `it never recovered from ${this.events.get(s.disasterEvent)!.title.toLowerCase()}` });
      if (s.lossThermal / total > 0.08) parts.push({ w: s.lossThermal / total, cause: era >= 0 ? era : this.rootClimateCause(), text: this.era.kind === 'warm' ? 'the heat was more than it could bear' : 'the cold was more than it could bear' });
      if (s.lossStarve / total > 0.08) parts.push({ w: s.lossStarve / total, cause: regionEv >= 0 ? regionEv : era, text: 'there was no longer enough to eat' });
      if (s.lossPredation / total > 0.08 && s.topPredator >= 0) {
        const pred = cr.species[s.topPredator]!;
        parts.push({ w: s.lossPredation / total, cause: pred.eventId, text: `${pred.name} hunted it faster than it could breed` });
      }
      if (s.lossHabitat / total > 0.08) parts.push({ w: s.lossHabitat / total, cause: this.seaEvent >= 0 ? this.seaEvent : era, text: 'its home changed under it' });
      parts.sort((a, b) => b.w - a.w);
      const valid = parts.filter((p) => p.cause >= 0);
      const lived = this.simYear - s.bornYear;
      const span = lived > 1e6 ? `${(lived / 1e6).toFixed(1)} million years` : `${Math.max(1, Math.round(lived / 1000))} thousand years`;
      const why = parts.length ? parts.slice(0, 2).map((p) => p.text).join(', and ') : 'its numbers simply dwindled';
      const importance = s.peakRegions >= 30 || lived > 25e6 ? 2 : s.peakRegions >= 8 ? 1 : 0;
      const causes = [...valid.map((p) => p.cause)];
      const weights = [...valid.map((p) => p.w)];
      if (s.eventId >= 0) { causes.push(s.eventId); weights.push(0.05); }
      const ev = this.emit({
        type: 'extinction', cellId: reg.centre[s.home]!, title: `${s.name} goes extinct`,
        description: this.say('extinct', [
          `After ${span}, the last ${s.name} dies: ${why}.`,
          `${s.name} is gone. It lasted ${span}; in the end, ${why}.`,
          `No more ${s.name}. For ${span} it held on, until ${why}.`,
        ]),
        causes, causeWeights: weights, importance, speciesIds: [s.id],
      });
      this.recentExtinctions.push({ year: this.simYear, causes: valid.map((p) => p.cause) });
      void ev;
    }
    // mass extinction: many species lost in a short window
    const window = 3e6;
    while (this.recentExtinctions.length && this.simYear - this.recentExtinctions[0]!.year > window) this.recentExtinctions.shift();
    const lost = this.recentExtinctions.length;
    if (lost >= Math.max(6, (cr.livingSpecies + lost) * 0.36) && this.simYear - this.lastMassExtinction > 8e6) {
      const tallies = new Map<number, number>();
      for (const e of this.recentExtinctions) for (const c of e.causes) tallies.set(c, (tallies.get(c) ?? 0) + 1);
      const top = [...tallies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const pct = Math.round((lost / (cr.livingSpecies + lost)) * 100);
      const ev = this.emit({
        type: 'mass-extinction', title: `The ${placeName(this.nameRng)} extinction`,
        description: `${lost} species, about ${pct}% of all animal kinds, have vanished in a short span. The world is emptier, and full of openings.`,
        causes: top.map((t) => t[0]), causeWeights: top.map((t) => t[1] / lost), importance: 3,
      });
      this.lastMassExtinction = this.simYear;
      this.massEvent = ev.id;
      this.radiationCount = 0;
      this.radiationDeclared = false;
    }
    if (!this.radiationDeclared && this.radiationCount >= 6) {
      this.radiationDeclared = true;
      this.emit({
        type: 'radiation', title: 'Life rebounds',
        description: 'The survivors spread into the empty world and change as they go. New kinds appear faster than at any time since the dying.',
        causes: [this.massEvent], importance: 2,
      });
    }
  }

  private checkMilestones(): void {
    const cr = this.creatures;
    const reg = this.regions;
    for (const s of cr.species) {
      if (s.extinctYear >= 0 || s.pop < 500 || !s.name) continue;
      const cell = reg.centre[s.home]!;
      const g = s.ref;
      const c = s.eventId >= 0 ? [s.eventId] : [];
      const ids = [s.id];
      if (g[G.EyeCount]! > 0.12 && g[G.EyeSize]! + g[G.Sight]! > 0.5) this.milestone('first-eye', 'First eye', `${s.name} can see. A patch of light-sensitive skin has become an eye, and the world gains its first witness.`, cell, c, ids);
      if (g[G.Diet]! > 0.6) this.milestone('first-hunter', 'First hunter', `${s.name} eats other animals. From now on, everything alive must watch its back.`, cell, c, ids);
      if (g[G.Glow]! > 0.55) this.milestone('first-glow', 'Living light', `${s.name} makes its own light in the dark.`, cell, c, ids);
      if (g[G.WarmBlood]! > 0.5) this.milestone('first-warm', 'Warm blood', `${s.name} burns food to stay warm. It can hunt at night and in the cold, and it is always hungry.`, cell, c, ids);
      if (g[G.Size]! > 0.82) this.milestone('first-giant', 'The first giants', `${s.name} is more than ${Math.round(sizeMetres(g[G.Size]!))} metres long. Nothing alive has ever been this big.`, cell, c, ids);
      if (g[G.Armor]! > 0.6) this.milestone('first-armor', 'Armour', `${s.name} grows a shell thick enough to turn teeth.`, cell, c, ids);
      if (g[G.Venom]! > 0.6) this.milestone('first-venom', 'Venom', `${s.name} carries venom.`, cell, c, ids);
      if (g[G.Sociality]! > 0.65 && g[G.Diet]! > 0.6) this.milestone('first-pack', 'The first packs', `${s.name} hunts together. Prey that could shrug off one hunter cannot shrug off six.`, cell, c, ids);
      if (g[G.Care]! > 0.6) this.milestone('first-care', 'Parents', `${s.name} guards and feeds its young.`, cell, c, ids);
      const land = cr.speciesMean(s.id, P.LandUse, true);
      if (land > 0.55) {
        const lp = this.milestones.get('first-land-plant');
        this.milestone('first-steps', 'First steps on land', `${s.name} hauls itself out of the water and stays. The land has its first animal.`, cell, lp !== undefined ? [...c, lp] : c, ids);
      }
      const fly = cr.speciesMean(s.id, P.Fly, true);
      if (fly > 0.12 && fly <= 0.45) this.milestone('first-glide', 'First glide', `${s.name} leaps and does not quite fall. Skin stretched between its limbs carries it from tree to tree.`, cell, c, ids);
      if (fly > 0.45) {
        const gl = this.milestones.get('first-glide');
        this.milestone('first-flight', 'First flight', `${s.name} flies. It does not glide or fall slowly: it climbs into the sky under its own power.`, cell, gl !== undefined ? [...c, gl] : c, ids);
      }
      if (g[G.Intelligence]! > 0.55) this.milestone('first-mind', 'A thinking animal', `${s.name} solves problems it has never met before.`, cell, c, ids);
    }
  }

  biomeName(cell: number): string {
    return BIOME_NAMES[this.world.biome[cell]!] ?? 'unknown';
  }

  /** Small digest of world state, used by determinism tests. */
  digest(): number {
    const w = this.world;
    let h = 2166136261 >>> 0;
    const mix = (v: number) => {
      h ^= v | 0;
      h = Math.imul(h, 16777619) >>> 0;
    };
    for (let i = 0; i < this.grid.count; i += 7) {
      mix(Math.round(w.elevation[i]! * 1000));
      mix(Math.round(w.temperature[i]! * 100));
      mix(Math.round(w.moisture[i]! * 1000));
      mix(w.biome[i]!);
      mix(Math.round(w.vegetation[i]! * 1000));
    }
    mix(this.events.events.length);
    mix(this.creatures.species.length);
    mix(this.plants.species.length);
    mix(Math.round(this.creatures.totalPop / 1000));
    mix(Math.round(this.simYear));
    return h;
  }
}

export type { PlantSpecies, Species };
