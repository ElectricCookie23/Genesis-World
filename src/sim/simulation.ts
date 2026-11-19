// The whole deterministic simulation. Runs in the worker and in headless tests.
import { RNG, hashSeed } from './rng';
import { BIOME_NAMES, buildGrid, createWorld, GRID_N, type Grid, type World } from './world';
import { driftPlatesMoving } from './tectonics';
import { dustFall, shapeLandforms } from './landforms';
import { carveFjords, computeConvergence, computeDrainage, countContinents, erode, erupt, uplift, generateTerrain, impact, type GeologyState, type VolcanoSite } from './geology';
import { classifyBiomes, createClimate, updateMoisture, updateSnow, updateTemperature, type ClimateState, computeCurrents } from './climate';
import { EventLog, type SimEvent } from './events';
import { buildRegions, updateRegions, type Regions } from './regions';
import { Plants, type PlantSpecies } from './plants';
import { Creatures, type Species } from './creatures';
import { G, GENE_COUNT, P, PG, PLANT_GENES, geneDistance, sizeMetres } from './genetics';
import { cellsWithin } from './geology';
import { nameSpecies, plantName } from './naming';
import { placeName } from './names';
import { Civilization } from './civilization';
import { CellLog, Log } from './history/celllog';

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
  readonly civ = new Civilization();
  /** What changed at every cell and when: built in the constructor, once the grid is known. */
  cellLog!: CellLog;
  private loggedBiome!: Uint8Array;
  private civRng: RNG;
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
  /** Events caused by the user's god tools (temples are built when there are many). */
  godEvents: number[] = [];
  /** Extra sea level from the flood tool, km. Drains away slowly. */
  private seaBias = 0;
  private cometPeriod = 0;
  private cometNext = 0;
  private cometLast = -1;
  private cometName = '';
  private convergentNoted = new Set<string>();
  /** Extinction event of each species, for memorials and constellations. */
  extinctEventOf = new Map<number, number>();
  private lastRanges = new Map<number, number>();
  private keystone = { year: -1e12, eventId: -1, name: '', followers: 0, declared: true };
  /** Regions under a shield dome until the given year. */
  private shields = new Map<number, number>();
  /** Regions holding a monolith. */
  monoliths: number[] = [];
  private sunNoted = false;
  private driftAcc = 0;
  private continentTimer = 0;
  private superContinent = false;
  /** Moons in the sky (0 after the moon is shattered into a ring). */
  moons = 1;
  ring = false;
  /** This world circles two suns. */
  binary = false;
  private bleachNoted = false;
  private notedOnce = new Set<string>();
  /** Fine cell of the oldest living forest, or -1. */
  oldestTreeCell = -1;
  private snowballNoted = false;
  private richAirNoted = false;
  /** Storm cells: dense rain cloud with lightning, drifting with the wind. */
  private canyonWork = 0;
  private deltaLand = 0;
  private dustCells?: Float32Array;
  storms: { cell: number; strength: number; years: number; ticks: number; eternal?: boolean; hurricane?: boolean }[] = [];
  private eternalHome = 0;
  /** Cells on fire right now (low time speeds only), with days left to burn. */
  private burning = new Map<number, number>();
  private weatherRng: RNG;
  /** Milliseconds spent in each part, for tuning. */
  readonly prof = { climate: 0, plants: 0, creatures: 0, paint: 0, regions: 0 };

  constructor(seed: string, gridN: number = GRID_N, grid?: Grid) {
    this.seed = seed;
    this.rng = new RNG(hashSeed(seed));
    this.grid = grid ?? buildGrid(gridN);
    this.cellLog = new CellLog(this.grid.count, Math.max(60_000, this.grid.count * 30));
    this.loggedBiome = new Uint8Array(this.grid.count).fill(255);
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
    this.weatherRng = this.rng.fork('weather');
    this.eternalHome = this.weatherRng.int(this.grid.count);
    this.binary = this.rng.fork('suns').chance(0.14);
    // hydrothermal vents: undersea volcanic sites
    for (const v of this.geology.volcanoes) if (this.world.elevation[v.cell]! < -0.5) this.plants.vents.add(this.regions.regionOf[v.cell]!);
    this.civRng = this.rng.fork('civilization');
    this.cometPeriod = this.lifeRng.range(18e6, 34e6);
    this.cometNext = this.cometPeriod * this.lifeRng.range(0.4, 1);
    this.cometName = placeName(this.nameRng);
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

  /** Set while history is being fast-forwarded: minor events are then not recorded at all. */
  quietEvents = false;

  emit(e: Parameters<EventLog['add']>[1]): SimEvent {
    // (a fast-forwarded history keeps only its turning points: firsts of an era and milestones)
    if (this.quietEvents && (e.importance ?? 1) < 2) return { id: -1, type: e.type, simYear: e.year ?? this.simYear, cellId: e.cellId ?? -1, title: e.title, description: e.description, causes: [], causeWeights: [], effects: [], importance: 0 };
    const ev = this.events.add(this.simYear, e);
    if (ev.importance > this.bigEvent) this.bigEvent = ev.importance;
    // what happens at a place becomes part of that place's record
    if (ev.cellId >= 0 && ev.importance >= 2) this.cellLog.note(ev.cellId, ev.simYear, Log.Event, ev.id);
    return ev;
  }

  milestone(key: string, title: string, description: string, cell: number, causes: number[], speciesIds?: number[]): void {
    if (this.milestones.has(key)) return;
    const ev = this.emit({ type: 'milestone', title, description, cellId: cell, causes, importance: 3, speciesIds, data: { key } });
    this.milestones.set(key, ev.id);
  }

  /** Rebuild what is derived from the saved state rather than saved itself. Call after loading. */
  refreshDerived(): void {
    updateRegions(this.regions, this.world, this.climate);
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
    this.seaBias *= Math.exp(-dt / 60000);
    const target = Math.max(-0.3, Math.min(0.2, -(this.iceVolume() - this.baseIce) * 0.035)) + this.seaBias;
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
    this.weather(dt);
    this.updateEras(dt);
    this.geologyEvents(dt);
    // continents drift: slow enough that it only shows at high time speeds
    this.driftAcc += dt;
    if (this.driftAcc >= 2e6) {
      // the plates themselves move: their outlines shift, they collide and pull apart, and the stress along their edges is worked out afresh
      const drift = driftPlatesMoving(w, this.driftAcc * 0.6);
      if (drift.moved > 0) { computeConvergence(w, this.geology.convergence); computeCurrents(w, this.climate); }
      this.driftAcc = 0;
      this.terrainDirty = true;
      computeDrainage(w);
      if (++this.continentTimer % 4 === 0) {
        const land = countContinents(w);
        if (!this.superContinent && land.largestShare > 0.78) {
          this.superContinent = true;
          this.emit({ type: 'supercontinent', title: 'A supercontinent forms', description: 'The drifting lands have run together into one vast continent. Its heart is far from any sea and turns to desert.', importance: 2 });
        } else if (this.superContinent && land.largestShare < 0.55) {
          this.superContinent = false;
          this.emit({ type: 'supercontinent', title: 'The supercontinent breaks apart', description: 'Rifts open across the great land and the sea floods in. Its pieces begin to drift away from one another, each carrying its own cargo of life.', causes: this.events.last('supercontinent') ? [this.events.last('supercontinent')!.id] : [], importance: 2 });
        }
      }
    }
    // history runs on its own, human clock, every step
    if (this.stage === 'animals') this.civ.advance(this, this.civRng, dt);
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
      // thawing ground gives up gas it held for ages, and the warming feeds itself
      this.climate.greenhouse += 0.7;
      this.emit({ type: 'permafrost', title: 'The frozen ground thaws', description: 'As the ice goes, ground that has been frozen for ages softens and breathes out old gases. The warming speeds up.', causes: [era.eventId], importance: 0 });
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
    const c = this.climate;
    // a snowball world: ice from pole to pole
    if (!this.snowballNoted && c.iceFraction > 0.55) {
      this.snowballNoted = true;
      this.emit({ type: 'snowball', title: 'Snowball world', description: 'The ice sheets meet at the equator. From space the planet is a white marble, and life holds on only where the ground is warm from below.', causes: this.era.eventId >= 0 ? [this.era.eventId] : [], importance: 3 });
    } else if (this.snowballNoted && c.iceFraction < 0.3) this.snowballNoted = false;
    // far future: the sun slowly brightens
    if (this.simYear > 380e6) {
      c.solar = 1 + ((this.simYear - 380e6) / 1e9) * 0.3;
      if (!this.sunNoted) {
        this.sunNoted = true;
        this.emit({ type: 'sun-brightens', title: 'The sun grows brighter', description: 'The star this world circles is ageing. Each age it burns a little hotter, and it will not stop.', importance: 2 });
      }
    }
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

  // ---------------------------------------------------------------- weather

  /** Storm cells drift downwind, rain, and throw lightning; at low speeds fire spreads cell by cell. */
  private weather(dt: number): void {
    const w = this.world, g = this.grid, r = this.weatherRng;
    const storms = this.storms;
    // keep about a dozen storms alive, born over warm humid places
    for (let tries = 0; tries < 3 && storms.length < 14; tries++) {
      const c = r.int(g.count);
      if (this.climate.humidity[c]! > 0.42 && this.climate.meanT[c]! > 6 && r.chance(0.5)) {
        storms.push({ cell: c, strength: r.range(0.8, 1), years: r.range(0.02, 0.06), ticks: 80 + r.int(120) });
      }
    }
    // one storm on this world never ends: it circles its home latitude forever
    if (!storms.some((x) => x.eternal)) storms.push({ cell: this.eternalHome, strength: 1, years: Infinity, ticks: Infinity, eternal: true });
    const moveP = Math.min(0.25, dt / 0.0015);
    for (let k = storms.length - 1; k >= 0; k--) {
      const s = storms[k]!;
      s.years -= dt;
      s.ticks--;
      if (s.years <= 0 && s.ticks <= 0) { storms.splice(k, 1); continue; }
      if (r.chance(moveP)) {
        // step to the neighbour most directly downwind
        const c = s.cell;
        const x = g.pos[c * 3]!, y = g.pos[c * 3 + 1]!, z = g.pos[c * 3 + 2]!;
        let ex = -z, ez = x;
        const el = Math.hypot(ex, ez) || 1;
        ex /= el; ez /= el;
        const u = w.windE[c]!, v = w.windN[c]!;
        const wx = u * ex + v * (-y * ez), wy = v * (ez * x - ex * z), wz = u * ez + v * (y * ex);
        let best = c, bd = 0;
        for (let j = 0; j < g.ncount[c]!; j++) {
          const nb = g.neighbors[c * 6 + j]!;
          const d = (g.pos[nb * 3]! - x) * wx + (g.pos[nb * 3 + 1]! - y) * wy + (g.pos[nb * 3 + 2]! - z) * wz;
          if (d > bd) { bd = d; best = nb; }
        }
        s.cell = best;
      }
      // thick cloud over the cell and its neighbours
      // over warm open sea a strong storm winds itself into a hurricane with a clear eye
      const overSea = w.elevation[s.cell]! <= w.seaLevel;
      if (!s.hurricane && !s.eternal && overSea && s.strength > 0.93 && this.climate.meanT[s.cell]! > 23) { s.hurricane = true; s.years += 0.04; s.ticks += 160; }
      if (s.hurricane) {
        w.cloud[s.cell] = 0.05;
        for (let j = 0; j < g.ncount[s.cell]!; j++) {
          const nb = g.neighbors[s.cell * 6 + j]!;
          w.cloud[nb] = 1;
          for (let k = 0; k < g.ncount[nb]!; k++) { const n2 = g.neighbors[nb * 6 + k]!; if (n2 !== s.cell) w.cloud[n2] = Math.max(w.cloud[n2]!, 0.95); }
        }
        if (!overSea) {
          // landfall: the storm tears at the coast, then dies without warm water under it
          if (dt < 1) {
            const ev = this.emit({ type: 'hurricane', cellId: s.cell, title: 'A hurricane makes landfall', description: this.say('hurricane', ['The great wheel of cloud comes ashore. Forests lie flat in its track.', 'A hurricane crosses the coast, pushing the sea ahead of it.']), importance: 0 });
            this.civ.witness(this, ev.id, [this.regions.regionOf[s.cell]!], [0.15]);
          }
          w.vegetation[s.cell] = w.vegetation[s.cell]! * 0.6;
          s.hurricane = false;
          s.years = Math.min(s.years, 0.01);
          s.ticks = Math.min(s.ticks, 30);
        }
      } else {
        w.cloud[s.cell] = Math.max(w.cloud[s.cell]!, s.strength);
        for (let j = 0; j < g.ncount[s.cell]!; j++) {
          const nb = g.neighbors[s.cell * 6 + j]!;
          w.cloud[nb] = Math.max(w.cloud[nb]!, s.strength * 0.85);
        }
      }
      // lightning: at low speeds a strike on dry growth starts a real fire
      if (dt < 0.1 && r.chance(Math.min(0.2, dt * 12))) {
        const hit = g.neighbors[s.cell * 6 + r.int(g.ncount[s.cell]!)]!;
        if (w.elevation[hit]! > w.seaLevel && w.vegetation[hit]! > 0.3 && w.moisture[hit]! < 0.55 && w.ash[hit]! < 0.2 && !this.burning.has(hit)) {
          this.burning.set(hit, 6 + r.range(0, 8));
          const storm = this.emit({ type: 'storm', cellId: s.cell, title: 'A dry storm', description: 'Thunderheads pile up over dry country. There is lightning, but little rain reaches the ground.', importance: 0 });
          this.emit({
            type: 'wildfire', cellId: hit, title: 'Lightning starts a fire',
            description: this.say('strike', [
              'A bolt splits a dead tree and the dry growth around it catches.',
              'Lightning touches the ground. A thread of smoke rises, then flame.',
              'One strike is enough. Fire begins to move through the dry growth.',
            ]),
            causes: [storm.id], importance: 1,
          });
        }
      }
    }
    if (dt >= 0.1) {
      // at high speed fires are handled statistically per region
      if (this.burning.size) this.burning.clear();
      return;
    }
    if (!this.burning.size) return;
    const days = dt * 365;
    const raining = new Set<number>();
    for (const s of storms) { raining.add(s.cell); for (let j = 0; j < g.ncount[s.cell]!; j++) raining.add(g.neighbors[s.cell * 6 + j]!); }
    for (const [c, left] of [...this.burning]) {
      w.lava[c] = Math.max(w.lava[c]!, 0.55);
      w.ash[c] = Math.max(w.ash[c]!, 0.35);
      for (let j = 0; j < g.ncount[c]!; j++) {
        const nb = g.neighbors[c * 6 + j]!;
        if (this.burning.has(nb) || raining.has(nb)) continue;
        if (w.elevation[nb]! <= w.seaLevel || w.vegetation[nb]! < 0.25 || w.ash[nb]! > 0.3) continue;
        const dry = Math.max(0.05, 0.8 - w.moisture[nb]!);
        if (r.chance(Math.min(0.5, days * 0.35 * dry * w.vegetation[nb]!))) this.burning.set(nb, 5 + r.range(0, 8));
      }
      const remain = left - days;
      if (remain <= 0 || raining.has(c)) {
        this.burning.delete(c);
        w.ash[c] = 0.85;
        w.vegetation[c] = w.vegetation[c]! * 0.15;
        w.canopy[c] = 0;
        const reg = this.regions.regionOf[c]!;
        this.plants.burn(reg, 1 / Math.max(1, this.regions.cellStart[reg + 1]! - this.regions.cellStart[reg]!));
      } else this.burning.set(c, remain);
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
    // earthquakes where plates grind; under or beside the sea they raise tsunamis
    if (r.chance(Math.min(0.5, dt / 900_000))) {
      const conv = this.geology.convergence;
      let cell = -1;
      for (let tries = 0; tries < 30 && cell < 0; tries++) { const c = r.int(this.grid.count); if (Math.abs(conv[c]!) > 0.4) cell = c; }
      if (cell >= 0) this.earthquake(cell, r.range(0.3, 1));
    }
    // hotspots stay where they are in the deep rock while the plates slide over them, so their eruptions leave chains of islands
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
    // a shield dome keeps disasters out of its region
    for (const [reg, until] of this.shields) { if (until < this.simYear) this.shields.delete(reg); else map.delete(reg); }
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
    if (big) {
      this.civ.witness(this, ev.id, hit.regions, hit.kill);
      // sulphur from the plume falls as acid rain and burns the leaves downwind
      for (const reg of hit.regions) this.plants.burn(reg, 0.18);
      this.emit({ type: 'acid-rain', cellId: site.cell, title: 'Acid rain', description: this.say('acid', ['For seasons after the eruption the rain stings. Leaves yellow and drop out of season.', 'Sour rain falls downwind of the mountain and the forests thin.']), causes: [ev.id], importance: 0 });
    }
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

  earthquake(cell: number, magnitude: number): void {
    const w = this.world, g = this.grid;
    const name = placeName(this.nameRng);
    const quake = this.emit({
      type: 'earthquake', cellId: cell, title: `The ${name} earthquake`,
      description: this.say('quake', ['Two plates that have strained for an age let go at once.', 'The ground lurches. Cliffs fall and rivers change their beds.', 'A fault slips and the land shudders for a hundred leagues.']),
      importance: magnitude > 0.8 ? 1 : 0,
    });
    const { cells } = cellsWithin(g, cell, Math.round(2 + 4 * magnitude));
    let wet = 0;
    for (const c of cells) if (w.elevation[c]! <= w.seaLevel) wet++;
    const hit = this.regionsOf(cells, () => 0.05 + 0.1 * magnitude);
    this.creatures.disaster({ regions: hit.regions, kill: hit.kill, eventId: quake.id });
    if (wet > cells.length * 0.3 && magnitude > 0.55) {
      // the sea floor moved: a wave runs out and breaks on every coast nearby
      const far = cellsWithin(g, cell, Math.round(8 + 10 * magnitude));
      const coast = far.cells.filter((c) => w.elevation[c]! > w.seaLevel && w.elevation[c]! - w.seaLevel < 0.25);
      const wave = this.emit({
        type: 'tsunami', cellId: cell, title: 'A tsunami',
        description: this.say('tsunami', ['The sea draws back from the shore, then returns as a wall.', 'A wave taller than the trees crosses the shallows and keeps going inland.']),
        causes: [quake.id], importance: 1,
      });
      for (const c of coast) { w.vegetation[c] = w.vegetation[c]! * 0.4; w.ash[c] = Math.max(w.ash[c]!, 0.3); }
      const drowned = this.regionsOf(coast, () => 0.3);
      for (const reg of drowned.regions) this.regionEvent[reg] = wave.id;
      this.creatures.disaster({ regions: drowned.regions, kill: drowned.kill, eventId: wave.id });
      this.civ.witness(this, wave.id, drowned.regions, drowned.kill);
    }
  }

  /** A sickness sweeps the most crowded, sociable animals of a region. */
  plague(region: number, byHand: boolean): SimEvent | null {
    const cr = this.creatures;
    let victim = -1, dense = 0;
    for (let c = 0; c < cr.high; c++) {
      if (!cr.alive[c] || cr.region[c] !== region) continue;
      const d = cr.count[c]! * (0.3 + cr.genome[c * GENE_COUNT + G.Sociality]!);
      if (d > dense && cr.species[cr.sp[c]!]!.name) { dense = d; victim = cr.sp[c]!; }
    }
    if (victim < 0) return null;
    const sp = cr.species[victim]!;
    const ev = this.emit({
      type: 'plague', cellId: this.regions.centre[region]!, title: `Sickness among ${sp.name}`,
      description: this.say('plague', [`A sickness runs through the herds of ${sp.name}. Where they crowd closest, it kills fastest.`, `${sp.name} is dying of something it cannot see or flee.`]),
      causes: sp.eventId >= 0 ? [sp.eventId] : [], importance: 1, speciesIds: [victim], data: { byHand: byHand ? 1 : 0 },
    });
    // it spreads with the herds through neighbouring regions
    const regs = [region];
    for (let j = 0; j < this.regions.grid.ncount[region]!; j++) regs.push(this.regions.grid.neighbors[region * 6 + j]!);
    for (const r of regs) for (let c = 0; c < cr.high; c++) {
      if (!cr.alive[c] || cr.region[c] !== r || cr.sp[c] !== victim) continue;
      const lost = cr.count[c]! * (0.35 + 0.4 * cr.genome[c * GENE_COUNT + G.Sociality]!);
      cr.count[c] = cr.count[c]! - lost;
      sp.lossDisaster += lost;
      sp.disasterEvent = ev.id;
    }
    return ev;
  }

  /** God tools. Every use is an event with consequences, and the peoples of the world notice. */
  god(tool: string, cell: number, power = 0.8): void {
    const w = this.world, c = this.climate;
    const region = this.regions.regionOf[cell]!;
    let ev: SimEvent | null = null;
    const note = (title: string, description: string) => this.emit({ type: `god-${tool}`, cellId: cell, title, description, importance: 2, data: { byHand: 1 } });
    if (tool === 'meteor') ev = this.meteor(cell, power, true);
    else if (tool === 'iceage') { c.forced -= 9; ev = note('A sudden cold', 'For no reason any rock or tide can explain, the warmth drains out of the world.'); }
    else if (tool === 'heat') { c.forced += 9; ev = note('A sudden heat', 'The air itself seems to catch fire. Ice that stood for ages begins to run.'); }
    else if (tool === 'mountain') {
      const { cells, dist } = cellsWithin(this.grid, cell, 4);
      for (let k = 0; k < cells.length; k++) w.elevation[cells[k]!] = w.elevation[cells[k]!]! + 2.6 * Math.pow(1 - dist[k]! / 5, 1.5);
      this.terrainDirty = true;
      ev = note('The land rises', 'The ground heaves upward as if lifted from below. Where there was plain, there are peaks.');
    } else if (tool === 'flood') { this.seaBias += 0.16; ev = note('The great flood', 'The seas climb their shores without storm or tide. Lowlands vanish under water.'); }
    else if (tool === 'plague') ev = this.plague(region, true);
    else if (tool === 'lightning') {
      if (w.elevation[cell]! > w.seaLevel) {
        this.burning.set(cell, 10);
        w.lava[cell] = 1;
        const reg = this.regions;
        for (let k = reg.cellStart[region]!; k < reg.cellStart[region + 1]!; k++) { const i = reg.cellList[k]!; if (w.vegetation[i]! > 0.2) { w.ash[i] = Math.max(w.ash[i]!, 0.6); w.lava[i] = Math.max(w.lava[i]!, 0.4); } }
        this.plants.burn(region, 0.7);
      }
      ev = note('Fire from a clear sky', 'A bolt falls from a cloudless sky and the land below it burns.');
    }
    else if (tool === 'shatter') {
      if (this.moons > 0) {
        this.moons = 0;
        this.ring = true;
        c.ringShadow = 5;
        ev = note('The moon is broken', 'The moon comes apart in silence. Within an age its wreckage has spread into a bright ring, and a band of permanent shadow lies along the equator.');
      }
    }
    else if (tool === 'generay') { this.creatures.irradiate(region, this.lifeRng, 4); ev = note('A strange light', 'A beam of unseen light sweeps the land. Everything born there afterwards is a little different from its parents.'); }
    else if (tool === 'comet') { this.cometNext = this.simYear; ev = note('A comet is called', 'A new light with a long tail swings in from the dark, as if summoned.'); }
    else if (tool === 'tilt') { c.tilt = c.tilt > 0.6 ? 0.12 : c.tilt + 0.17; ev = note('The world tips', 'The axis of the world leans to a new angle. The seasons will never be what they were.'); }
    else if (tool === 'shield') { this.shields.set(region, this.simYear + 3e6); ev = note('A dome of calm', 'Over one stretch of the world, fire, ash and wave simply stop at an unseen wall.'); }
    else if (tool === 'monolith') { if (!this.monoliths.includes(region)) this.monoliths.push(region); ev = note('The monolith', 'A black slab stands where there was none. The animals that live near it grow curious, and then clever.'); }
    else if (tool === 'life') {
      if (this.stage === 'barren') this.lifeYear = this.simYear;
      else if (this.stage === 'microbes') this.algaeYear = this.simYear;
      else for (const sp of this.plants.species) { if (sp.extinctYear < 0 && sp.cover > 1) for (let k = 0; k < 12; k++) this.plants.seed(this.lifeRng.int(this.regions.count), sp.id, 0.03); }
      ev = note('A rain of life', 'Seeds and spores fall from a clear sky onto every shore and plain.');
    }
    if (ev) {
      this.godEvents.push(ev.id);
      this.civ.omen(this, ev.id, this.civRng);
    }
  }

  /** Slow geology between events: collisions raise mountains, glaciers cut fjords, weather wears peaks down. */
  private shapeLand(tau: number): boolean {
    uplift(this.world, this.geology.convergence, Math.min(0.2, 0.012 * 16 * tau));
    if (this.climate.iceFraction > 0.12) carveFjords(this.world, Math.min(0.1, 0.006 * 16 * tau));
    erode(this.world, Math.min(0.5, 0.06 * 16 * tau));
    // rivers cut canyons and build deltas, dead volcanic islands sink, and reefs grow up to stay in the light
    const lf = shapeLandforms(this.world, Math.min(1.6, 16 * tau));
    this.canyonWork += lf.canyon;
    const once = (key: string) => { if (this.notedOnce.has(key)) return false; this.notedOnce.add(key); return true; };
    if (this.canyonWork > 4000 && once('first-canyon')) {
      let cell = 0, best = 0;
      for (let i = 0; i < this.grid.count; i++) { const d = this.world.downhill[i]!; if (d >= 0 && this.world.elevation[i]! > this.world.seaLevel + 0.3 && this.world.flow[i]! > best) { best = this.world.flow[i]!; cell = i; } }
      this.emit({ type: 'canyon', cellId: cell, title: 'A river cuts a canyon', description: 'Grain by grain, for longer than any living thing has existed, a river has been sawing down through the rock. Its walls now stand far above the water that made them.', importance: 1 });
    }
    this.deltaLand += lf.newLand;
    if (this.deltaLand >= 6 && this.simYear > 15e6 && once('first-delta')) {
      let cell = 0, best = 0;
      for (let i = 0; i < this.grid.count; i++) { const d = this.world.downhill[i]!; if (d >= 0 && this.world.elevation[d]! <= this.world.seaLevel + 0.02 && this.world.elevation[i]! > this.world.seaLevel && this.world.flow[i]! > best) { best = this.world.flow[i]!; cell = i; } }
      this.emit({ type: 'delta', cellId: cell, title: 'A delta grows', description: 'Where a great river meets the sea it drops the mud it has carried from the mountains. New land is rising out of the water, flat and rich, fanned out like an open hand.', importance: 1 });
    }
    if (lf.atollRim >= 3 && once('first-atoll')) {
      let cell = 0;
      for (let i = 0; i < this.grid.count; i++) if (this.world.reef[i]! > 0.25 && this.world.seaLevel - this.world.elevation[i]! < 0.06 && this.world.seaLevel - this.world.elevation[i]! > 0) { cell = i; break; }
      this.emit({ type: 'atoll', cellId: cell, title: 'An atoll', description: 'A volcano that once stood above the waves has sunk back into the sea. The coral that ringed its shore grew upward as fast as it went down, and now a circle of reef encloses a quiet lagoon where the mountain used to be.', importance: 1 });
    }
    return true;
  }

  /** Release a species the user designed. genes are GENE_COUNT values 0..1. */
  designSpecies(cell: number, genes: number[]): void {
    if (this.stage !== 'animals') return;
    const g = Float32Array.from({ length: GENE_COUNT }, (_, i) => Math.max(0, Math.min(1, genes[i] ?? 0.3)));
    const region = this.regions.regionOf[cell]!;
    const sp = this.creatures.addSpecies(g, 0, -1, this.simYear, '', '', g.slice());
    sp.home = region;
    const regs = [region];
    for (let j = 0; j < this.regions.grid.ncount[region]!; j++) regs.push(this.regions.grid.neighbors[region * 6 + j]!);
    for (const reg of regs) this.creatures.spawn(sp.id, reg, 4000, g, 0);
    nameSpecies(this.creatures, sp, 'isolation', this.world.biome[cell]!, this.nameRng, this.taken);
    const ev = this.emit({ type: 'god-species', cellId: cell, title: `${sp.name} is set down`, description: `A creature with no ancestors appears, whole and finished: ${sp.name}, ${this.describeSpecies(sp)}. Whether it lasts is up to the world.`, importance: 2, speciesIds: [sp.id], data: { byHand: 1 } });
    sp.eventId = ev.id;
    this.godEvents.push(ev.id);
  }

  /** Smaller wonders: plagues, eclipses, comets, look-alike species, living fossils, an age of giants. */
  private extras(tau: number): void {
    const r = this.lifeRng, cr = this.creatures;
    if (cr.livingSpecies > 3 && r.chance(Math.min(0.2, 0.006 * tau))) {
      const list = cr.species.filter((s) => s.extinctYear < 0 && s.ref[G.Sociality]! > 0.45 && s.pop > 5000);
      if (list.length) this.plague(r.pick(list).home, false);
    }
    if (r.chance(Math.min(0.2, 0.0025 * tau))) {
      const ev = this.emit({
        type: 'eclipse', title: 'A total eclipse',
        description: this.say('eclipse', ['The moon slides across the sun. For a few minutes the day goes dark and every animal falls silent.', 'A black disc eats the sun at noon. Stars come out, and the birds stop.']),
        importance: this.civ.living > 0 ? 1 : 0,
      });
      this.civ.omen(this, ev.id, this.civRng);
    }
    if (this.simYear >= this.cometNext) {
      this.cometNext += this.cometPeriod;
      const ev = this.emit({
        type: 'comet', title: `Comet ${this.cometName} returns`,
        description: this.cometLast < 0 ? `A long-tailed comet crosses the night sky for the first time anyone could have seen it.` : `The comet is back, right on time, hanging in the evening sky like a pale feather.`,
        causes: this.cometLast >= 0 ? [this.cometLast] : [], importance: this.civ.living > 0 ? 1 : 0,
      });
      this.cometLast = ev.id;
      this.civ.omen(this, ev.id, this.civRng);
    }
    cr.mutationBoost = 1 + (cr.mutationBoost - 1) * Math.exp(-0.05 * tau);
    if (r.chance(Math.min(0.2, 0.002 * tau))) {
      cr.mutationBoost = Math.max(cr.mutationBoost, 3);
      this.emit({ type: 'meteor-shower', title: 'A meteor shower', description: this.say('shower', ['For many nights the sky rains fire that never reaches the ground. Strange births follow in every nest and burrow.', 'A storm of shooting stars. Something in their dust changes the young of that season.']), importance: this.civ.living > 0 ? 1 : 0 });
    }
    if (r.chance(Math.min(0.1, 0.00012 * tau))) {
      cr.mutationBoost = 4;
      this.plants.ozoneHole = 0.75;
      const ev = this.emit({ type: 'supernova', title: 'A new star blazes', description: 'A nearby star dies in a blast brighter than the moon. Its light is visible by day for a season, and its unseen rays strip away the ozone veil. Until it heals, the land lies open to the sun.', importance: 3 });
      const all: number[] = [], kill: number[] = [];
      for (let k = 0; k < this.regions.count; k++) if (this.regions.land[k]! > 0.3) { all.push(k); kill.push(0.14); }
      cr.disaster({ regions: all, kill, eventId: ev.id });
      this.civ.omen(this, ev.id, this.civRng);
    }
    for (const raft of cr.rafted.splice(0)) {
      const sp = cr.species[raft.species]!;
      if (sp.name && r.chance(0.3)) this.emit({ type: 'rafting', cellId: this.regions.centre[raft.region]!, title: `${sp.name} crosses the sea`, description: this.say('raft', [`A storm tears a mat of trees from the shore. Weeks later it grounds on a far coast, and a few ${sp.name} stagger off it.`, `Clinging to driftwood, a handful of ${sp.name} reach a shore none of their kind has ever seen.`]), causes: sp.eventId >= 0 ? [sp.eventId] : [], importance: 0, speciesIds: [sp.id] });
    }
    // invaders: when the seas fall, land animals pour across the new bridges
    if (this.milestoneTimer % 24 === 0) {
      for (const sp of cr.species) {
        if (sp.extinctYear >= 0 || !sp.name) continue;
        const before = this.lastRanges.get(sp.id) ?? sp.regions;
        if (this.seaState < 0 && before >= 6 && sp.regions > before * 1.7 && cr.speciesMean(sp.id, P.LandUse, true) > 0.5) {
          this.emit({ type: 'invasion', cellId: this.regions.centre[sp.home]!, title: `${sp.name} invades`, description: `The fallen seas have opened a land bridge, and ${sp.name} is pouring across it into country that has never known anything like it.`, causes: [this.seaEvent, sp.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [sp.id] });
        }
        this.lastRanges.set(sp.id, sp.regions);
      }
    }
    const once = (key: string) => { if (this.notedOnce.has(key)) return false; this.notedOnce.add(key); return true; };
    // a wandering body is captured as a second moon
    if (this.moons === 1 && r.chance(Math.min(0.05, 0.00018 * tau))) {
      this.moons = 2;
      const ev = this.emit({ type: 'second-moon', title: 'A second moon', description: 'A wandering lump of rock strays too close and cannot leave. From now on two moons cross the night, and the tides keep a more complicated time.', importance: 3 });
      this.civ.omen(this, ev.id, this.civRng);
    }
    // coral bleaches when the water gets too hot
    if (this.milestoneTimer % 16 === 0) {
      let bleached = 0, alive = 0;
      const reef = this.world.reef;
      for (let i = 0; i < reef.length; i += 3) { if (reef[i]! < -0.2) bleached++; else if (reef[i]! > 0.2) alive++; }
      if (alive > 20 && once('reefs')) this.emit({ type: 'reef', title: 'The first reefs', description: 'In warm clear shallows, small animals and the plants that live inside them build stone, layer on layer. Reefs ring the tropical coasts.', causes: this.algaeEvent >= 0 ? [this.algaeEvent] : [], importance: 2 });
      if (!this.bleachNoted && bleached > 30 && bleached > alive * 0.5) {
        this.bleachNoted = true;
        this.emit({ type: 'bleaching', title: 'The reefs turn white', description: 'The sea is too warm. The reefs spit out the living colour inside them and stand bone-white under the water.', causes: this.era.eventId >= 0 ? [this.era.eventId] : [], importance: 1 });
      } else if (this.bleachNoted && bleached < 5) this.bleachNoted = false;
      // the oldest forest on the planet
      const old = this.plants.oldestForest;
      this.oldestTreeCell = old >= 0 ? this.regions.centre[old]! : -1;
      if (old >= 0 && once('oldest-tree')) this.emit({ type: 'old-tree', cellId: this.oldestTreeCell, title: 'The oldest tree', description: 'In one valley the forest has never burned and never frozen. Somewhere in it stands the oldest living thing on the planet.', importance: 1 });
    }
    if (this.milestoneTimer % 32 === 0) {
      // where each kind lives, the coldest country it lives in, and the best flower country it shares with other flower feeders
      const where = new Map<number, Set<number>>();
      const coldest = new Map<number, number>();
      const flowers = new Map<number, number>();
      for (let c = 0; c < cr.high; c++) {
        if (!cr.alive[c]) continue;
        const id = cr.sp[c]!, rg = cr.region[c]!;
        let set = where.get(id); if (!set) { set = new Set(); where.set(id, set); } set.add(rg);
        if (this.regions.land[rg]! > 0.5) {
          const t = this.regions.landTemp[rg]!;
          if (t < (coldest.get(id) ?? 99)) coldest.set(id, t);
          if (this.plants.fruit[rg]! > 0.1 && this.plants.pollinators[rg]! > 0.15) { const was = flowers.get(id); if (was === undefined || this.plants.fruit[rg]! > this.plants.fruit[was]!) flowers.set(id, rg); }
        }
      }
      for (const sp of cr.species) {
        if (sp.extinctYear >= 0 || !sp.name || sp.pop < 2000) continue;
        const g = sp.ref, cell = this.regions.centre[sp.home]!, c0 = sp.eventId >= 0 ? [sp.eventId] : [];
        // cave dwellers: burrowers of the dark that have given up their eyes and colour
        if (g[G.Burrow]! > 0.62 && g[G.Nocturnal]! > 0.55 && g[G.EyeCount]! < 0.12 && once(`cave-${sp.id}`)) {
          this.emit({ type: 'cave', cellId: cell, title: `${sp.name} goes under`, description: `${sp.name} lives its whole life in caves now. It is pale and blind, and it does not need to be anything else.`, causes: c0, importance: 1, speciesIds: [sp.id] });
        }
        // vent life: deep-sea animals living off the planet's own heat
        if (this.plants.vents.has(sp.home) && g[G.Water]! > 0.8 && once(`vent-${sp.id}`) && once('vent-first')) {
          this.emit({ type: 'vent', cellId: cell, title: 'Life at the vents', description: `Far below the reach of sunlight, ${sp.name} crowds around cracks where hot, mineral-black water pours from the sea floor. If the sun went out, it would not notice.`, causes: c0, importance: 1, speciesIds: [sp.id] });
        }
        // hibernation: slow-living burrowers of cold country sleep the winter away
        if (g[G.Burrow]! > 0.18 && g[G.Metabolism]! < 0.5 && g[G.Water]! < 0.5 && (coldest.get(sp.id) ?? 99) < 6 && !this.notedOnce.has('hib-first')) {
          this.notedOnce.add('hib-first');
          this.emit({ type: 'hibernation', cellId: cell, title: `${sp.name} sleeps through the winter`, description: `When the cold comes, ${sp.name} goes underground, slows its heart almost to nothing, and waits. It wakes thin and hungry when the ground thaws, having missed the worst of the year entirely.`, causes: c0, importance: 1, speciesIds: [sp.id] });
        }
        // pollination: small animals that feed at flowers and carry their dust from plant to plant
        if (g[G.Size]! < 0.3 && g[G.Diet]! < 0.45 && g[G.Water]! < 0.5 && (flowers.get(sp.id) ?? -1) >= 0 && !this.notedOnce.has('pollination-first')) {
          this.notedOnce.add('pollination-first');
          const at = flowers.get(sp.id)!;
          const flower = this.plants.species[this.plants.dominant[at]!];
          this.emit({ type: 'pollination', cellId: this.regions.centre[at]!, title: 'Flowers find a partner', description: `${sp.name} drinks at the flowers${flower ? ` of ${flower.name}` : ''} and leaves each one dusted with the last. The plants that feed it best set the most seed, and the animals that visit most are best fed: each is now shaping the other.`, causes: c0, importance: 2, speciesIds: [sp.id] });
        }
        // mass hatchings: glowing sea animals that breed all at once
        if (g[G.Water]! > 0.7 && g[G.Offspring]! > 0.75 && g[G.Glow]! > 0.4 && once(`hatch-${sp.id}`)) {
          this.emit({ type: 'hatching', cellId: cell, title: `The ${sp.name.split(' ')[0]} hatching`, description: `On one night of the year every egg of ${sp.name} hatches together. For a few hours the sea is lit from below, coast to coast.`, causes: c0, importance: 1, speciesIds: [sp.id] });
        }
      }
      // symbiosis: a big animal and a small one that are always found together
      const big = cr.species.filter((x) => x.extinctYear < 0 && x.name && x.ref[G.Size]! > 0.55 && x.pop > 2000 && !cr.symbiont.has(x.id));
      const small = cr.species.filter((x) => x.extinctYear < 0 && x.name && x.ref[G.Size]! < 0.3 && x.pop > 2000 && !cr.symbiont.has(x.id));
      // a pair forms between kinds that share ground, and a world has room for only a few such pairs
      if (big.length && small.length && cr.symbiont.size < 6) {
        pairing: for (const a of big) for (const b of small) {
          if (Math.abs(a.ref[G.Water]! - b.ref[G.Water]!) > 0.3) continue;
          const ra = where.get(a.id), rb = where.get(b.id);
          if (!ra || !rb) continue;
          let shared = -1, both = 0;
          for (const r of ra) if (rb.has(r)) { both++; if (shared < 0) shared = r; }
          if (both < 2 || !once(`sym-${a.id}-${b.id}`)) continue;
          const cleaner = b.ref[G.Diet]! > 0.15;
          const sea = a.ref[G.Water]! > 0.5;
          const how = cleaner
            ? `${b.name} spends its days picking pests from the ${sea ? 'skin' : 'hide'} of ${a.name}. One gets a meal, the other gets clean, and neither would do as well alone.`
            : sea
              ? `${b.name} keeps close under ${a.name} and grazes the growth off its skin. The big animal is rid of its passengers, and nothing dares come near enough to eat the small one.`
              : `${b.name} feeds at the feet of ${a.name}, on what the big animal tramples and turns up. It is the first to see a hunter coming, and when it runs, ${a.name} runs too.`;
          this.emit({ type: 'symbiosis', cellId: this.regions.centre[shared]!, title: 'An unlikely pair', description: how, causes: [a.eventId, b.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [a.id, b.id] });
          // from now on each does a little better wherever the other lives too
          cr.symbiont.set(a.id, b.id); cr.symbiont.set(b.id, a.id);
          break pairing;
        }
      }
      // meat-eating plants where the soil gives them nothing
      for (const pl of this.plants.species) {
        if (pl.extinctYear >= 0 || !pl.established || pl.aquatic) continue;
        if (pl.genes[PG.Thorns]! > 0.65 && pl.genes[PG.Toxicity]! > 0.5 && pl.genes[PG.Growth]! < 0.4 && once(`carn-${pl.id}`)) {
          this.emit({ type: 'carnivorous-plant', title: `${pl.name} learns to eat`, description: `On soil too poor to live on, ${pl.name} has turned its spines and poisons into traps. It feeds on whatever crawls into it.`, causes: pl.eventId >= 0 ? [pl.eventId] : [], importance: 1 });
        }
      }
    }
    if (!this.richAirNoted && this.plants.oxygen > 0.3) {
      this.richAirNoted = true;
      this.emit({ type: 'oxygen', title: 'An age of giants', description: 'Forests have made the air so rich that bodies can grow huge on it. Small things become large, and large things enormous.', causes: this.oxygenEvent >= 0 ? [this.oxygenEvent] : [], importance: 2 });
    }
    if (this.milestoneTimer % 48 !== 0) return;
    const living = cr.species.filter((s) => s.extinctYear < 0 && s.name && s.pop > 1000);
    // living fossils: old species that have barely changed
    for (const s of living) {
      if (!s.fossilNoted && this.simYear - s.bornYear > 60e6 && geneDistance(s.ref, 0, s.origin, 0) < 0.28) {
        s.fossilNoted = true;
        this.emit({ type: 'living-fossil', cellId: this.regions.centre[s.home]!, title: `${s.name}, a living fossil`, description: `${s.name} has hardly changed in ${Math.round((this.simYear - s.bornYear) / 1e6)} million years. Whatever it is doing, it still works.`, causes: s.eventId >= 0 ? [s.eventId] : [], importance: 1, speciesIds: [s.id] });
      }
    }
    // convergent evolution: unrelated lines that have arrived at the same body
    const shape = [G.Size, G.LimbType, G.LimbPairs, G.Armor, G.Diet, G.Water, G.Neck, G.Horn];
    const ancestors = (s: Species) => { const a = new Set<number>(); for (let p = s.parent, k = 0; p >= 0 && k < 4; p = cr.species[p]!.parent, k++) a.add(p); return a; };
    for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
      const a = living[i]!, b = living[j]!;
      const key = `${a.id}:${b.id}`;
      if (this.convergentNoted.has(key) || a.genus === b.genus) continue;
      let d = 0;
      for (const gi of shape) d += (a.ref[gi]! - b.ref[gi]!) ** 2;
      if (d > 0.012) continue;
      const aa = ancestors(a), ab = ancestors(b);
      if (aa.has(b.id) || ab.has(a.id) || [...aa].some((x) => ab.has(x))) continue;
      this.convergentNoted.add(key);
      const form = a.ref[G.Armor]! > 0.5 ? 'armoured, crab-like' : a.ref[G.LimbType]! >= 0.75 ? 'winged' : a.ref[G.Water]! > 0.6 ? 'fish-like' : a.ref[G.Neck]! > 0.6 ? 'long-necked' : 'near-identical';
      this.emit({ type: 'convergence', cellId: this.regions.centre[a.home]!, title: 'Two lines, one shape', description: `Two unrelated lineages, ${a.name} and ${b.name}, have both evolved into ${form} forms. The same problem has found the same answer twice.`, causes: [a.eventId, b.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [a.id, b.id] });
      return;
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
    this.civ.witness(this, ev.id, hit.regions, hit.kill.map((k) => Math.max(0.3, k)));
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
      if (this.milestoneTimer % 16 === 0 && this.shapeLand(tau)) this.terrainDirty = true;
      return;
    }
    const p = this.plants;
    if (!this.creatures.onTrek) this.creatures.onTrek = (from, to, mass) => this.wearTrail(from, to, mass);
    const t0 = performance.now();
    // every few steps: dust blown off the deserts falls on the sea downwind and feeds it
    if (this.milestoneTimer % 4 === 0) {
      const dust = (this.dustCells ??= new Float32Array(this.grid.count));
      const fed = dustFall(this.world, dust);
      p.dust.fill(0);
      const seen = new Uint16Array(reg.count);
      for (let i = 0; i < this.grid.count; i++) if (dust[i]! > 0) { const r = reg.regionOf[i]!; p.dust[r] = p.dust[r]! + dust[i]!; seen[r] = seen[r]! + 1; }
      // spread over a good part of the region, so a thin fall of dust on one corner counts for little
      for (let r = 0; r < reg.count; r++) if (seen[r]!) p.dust[r] = Math.min(1, p.dust[r]! / Math.max(3, 0.4 * (reg.cellStart[r + 1]! - reg.cellStart[r]!)));
      if (fed > this.grid.count * 0.004 && p.living > 0 && this.simYear > 5e6 && !this.notedOnce.has('dust-bloom')) {
        this.notedOnce.add('dust-bloom');
        let cell = 0, best = 0;
        for (let i = 0; i < this.grid.count; i++) if (dust[i]! > best) { best = dust[i]!; cell = i; }
        this.emit({ type: 'dust', cellId: cell, title: 'Dust feeds the sea', description: 'Wind lifts the red dust of a desert high into the air and carries it out over the ocean. Where it settles, the water turns green: the dust is food, and the sea was hungry for it.', importance: 1 });
      }
    }
    // a current that carries warmth or cold far from where it belongs is worth a line in the chronicle
    if (this.climate.currentAnomaly > 5.5 && this.climate.currentCell >= 0 && !this.notedOnce.has('first-current')) {
      this.notedOnce.add('first-current');
      const c = this.climate.currentCell;
      const warm = this.world.temperature[c]! > 27.5 - 49 * this.grid.pos[c * 3 + 1]! * this.grid.pos[c * 3 + 1]! + this.climate.globalOffset;
      this.emit({ type: 'current', cellId: c, title: warm ? 'A warm current' : 'A cold current', description: warm ? 'A river in the sea is carrying the warmth of the tropics toward the pole. The coast it washes is milder than any land at that latitude has a right to be.' : 'Cold water from the high latitudes is running along this coast toward the tropics. The air above it is cool and dry, and the land beside it gets little rain.', importance: 1 });
    }
    // old trails fade unless herds keep walking them
    const fade = Math.exp(-0.08 * tau);
    if (this.milestoneTimer % 4 === 0 && this.stage === 'animals') this.creatures.seasonalTreks();
    const trail = this.world.trail;
    for (let i = 0; i < trail.length; i++) if (trail[i]! > 0) trail[i] = trail[i]! < 0.01 ? 0 : trail[i]! * fade;
    p.step(this.world, this.climate, this.lifeRng, this.simYear, tau);
    const t1 = performance.now();
    if (this.stage === 'animals') this.creatures.step(this.lifeRng, this.simYear, tau, p.oxygen);
    const t2 = performance.now();
    this.fires();
    if (this.stage === 'animals') this.civ.step(this, this.civRng, tau);
    if (this.milestoneTimer % 32 === 0) {
      const b = this.world.biome, was = this.loggedBiome;
      for (let i = 0; i < b.length; i++) if (b[i] !== was[i]) { was[i] = b[i]!; this.cellLog.note(i, this.simYear, Log.Biome, b[i]!); }
    }
    p.paint(this.world, this.climate);
    const t3 = performance.now();
    this.prof.plants += t1 - t0; this.prof.creatures += t2 - t1; this.prof.paint += t3 - t2;
    this.plantEvents();
    this.creatureEvents();
    this.milestoneTimer++;
    if (this.milestoneTimer % 8 === 0) this.checkMilestones();
    this.extras(tau);
    if (this.milestoneTimer % 16 === 0 && this.shapeLand(tau)) this.terrainDirty = true;
  }

  /** Nudge every random stream, so that a copy of this world takes a different road from here on. */
  diverge(): void {
    for (let i = 0; i < 7; i++) { this.rng.next(); this.lifeRng.next(); this.civRng.next(); this.nameRng.next(); }
  }

  /** A per-cell layer for the overlays: how many kinds of animal live here, or how much oxygen is being made here. 0..1. */
  layer(kind: 'diversity' | 'oxygen'): Float32Array {
    const out = new Float32Array(this.grid.count);
    const reg = this.regions, w = this.world;
    if (kind === 'diversity') {
      const cr = this.creatures;
      const seen = new Set<number>();
      const perRegion = new Float32Array(reg.count);
      for (let c = 0; c < cr.high; c++) {
        if (!cr.alive[c]) continue;
        const key = cr.region[c]! * 4096 + cr.sp[c]!;
        if (!seen.has(key)) { seen.add(key); perRegion[cr.region[c]!] = perRegion[cr.region[c]!]! + 1; }
      }
      for (let i = 0; i < out.length; i++) out[i] = Math.min(1, perRegion[reg.regionOf[i]!]! / 4);
    } else {
      for (let i = 0; i < out.length; i++) {
        const r = reg.regionOf[i]!;
        out[i] = w.elevation[i]! > w.seaLevel ? Math.min(1, w.vegetation[i]! * 1.1) : Math.min(1, w.bloom[i]! * 0.7 + this.plants.seaCover[r]! * 0.6);
      }
    }
    return out;
  }

  /** A migrating herd has walked from one region to the next: the ground between is worn a little more. */
  private wearTrail(from: number, to: number, mass: number): void {
    const g = this.grid, w = this.world;
    let cur = this.regions.centre[from]!;
    const target = this.regions.centre[to]!;
    const tx = g.pos[target * 3]!, ty = g.pos[target * 3 + 1]!, tz = g.pos[target * 3 + 2]!;
    const add = Math.min(0.2, 0.03 + 0.03 * Math.log10(1 + Math.max(0, mass)));
    for (let step = 0; step < 24 && cur !== target; step++) {
      if (w.elevation[cur]! > w.seaLevel) w.trail[cur] = Math.min(1, w.trail[cur]! + add * (1 - 0.85 * w.trail[cur]!));
      let best = cur, bd = g.pos[cur * 3]! * tx + g.pos[cur * 3 + 1]! * ty + g.pos[cur * 3 + 2]! * tz;
      for (let k = 0; k < g.ncount[cur]!; k++) {
        const nb = g.neighbors[cur * 6 + k]!;
        const d = g.pos[nb * 3]! * tx + g.pos[nb * 3 + 1]! * ty + g.pos[nb * 3 + 2]! * tz;
        // herds go round the sea and the steepest ground rather than through it
        if (d > bd && w.elevation[nb]! > w.seaLevel) { bd = d; best = nb; }
      }
      if (best === cur) break;
      cur = best;
    }
    if (!this.notedOnce.has('first-trail')) {
      let worn = 0;
      for (let i = 0; i < w.trail.length; i += 7) if (w.trail[i]! > 0.5) worn++;
      if (worn > 6) {
        this.notedOnce.add('first-trail');
        this.emit({ type: 'trail', cellId: target, title: 'A trail is worn', description: 'The herds take the same way every year: over the low pass, along the river, down to the plain. So many feet have followed it that nothing grows there now. From high above it shows as a pale thread across the land.', importance: 1 });
      }
    }
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
      // special stories: wings given up, a return to the sea, island dwarfs and giants
      const lost = parent.ref[G.LimbType]! >= 0.75 && s.ref[G.LimbType]! < 0.73;
      if (lost) this.emit({ type: 'flightless', cellId: reg.centre[s.home]!, title: `${s.name} gives up flight`, description: `With nothing here to flee from, ${s.name} stops spending itself on wings. Its descendants will walk.`, causes: [ev.id], importance: 1, speciesIds: [s.id] });
      if (born.reason === 'sea' && cr.speciesMean(parent.id, P.LandUse, true) > 0.5) {
        this.milestone('return-sea', 'Back to the sea', `${s.name}, whose ancestors crawled out of the water, goes back in. It keeps its lungs and its warm habits, and grows.`, reg.centre[s.home]!, [ev.id], [s.id]);
      }
      const dSize = s.ref[G.Size]! - parent.ref[G.Size]!;
      if (born.isolated && Math.abs(dSize) > 0.09 && s.cohorts <= 8 && this.regions.land[s.home]! < 0.7) {
        this.emit({
          type: 'island-form', cellId: reg.centre[s.home]!, title: dSize < 0 ? `${s.name}, an island dwarf` : `${s.name}, an island giant`,
          description: dSize < 0 ? `On a small island with little to eat, ${s.name} has shrunk to a fraction of its ancestors' size.` : `On an island with no hunters, ${s.name} has grown far larger than its mainland kin.`,
          causes: [ev.id], importance: 1, speciesIds: [s.id],
        });
      }
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
      this.extinctEventOf.set(s.id, ev.id);
      // keystone species: when a widespread one goes, watch whether others follow it down
      const k = this.keystone;
      if (this.simYear - k.year < 1.5e6 && !k.declared) {
        k.followers++;
        if (k.followers >= 3) {
          k.declared = true;
          this.emit({ type: 'collapse', cellId: reg.centre[s.home]!, title: 'An ecosystem unravels', description: `${k.name} held more together than anyone could have guessed. Since it vanished, the species that leaned on it have been falling one after another.`, causes: [k.eventId], importance: 2 });
        }
      } else if (s.peakRegions >= 25) this.keystone = { year: this.simYear, eventId: ev.id, name: s.name, followers: 0, declared: false };
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

  /** Events from the civilization layer, each tied to what caused it. */
  civEvent(kind: string, speciesId: number, cell: number, settlementId: number, cause = -1): void {
    const sp = this.creatures.species[speciesId]!;
    const st = settlementId >= 0 ? this.civ.settlements[settlementId]! : undefined;
    const spCause = sp.eventId >= 0 ? [sp.eventId] : [];
    const mind = this.milestones.get('threshold');
    if (kind === 'threshold') {
      this.milestone('threshold', 'A mind awakens',
        `${sp.name} has begun to teach its young things that no instinct ever knew. What one of them learns, the others keep.`, cell, spCause, [speciesId]);
    } else if (kind === 'camp') {
      const ev = this.emit({ type: 'settlement', cellId: cell, title: `Camp at ${st!.name}`, description: `A band of ${sp.name} stops wandering and makes a camp at ${st!.name}.`, causes: mind !== undefined ? [mind] : spCause, importance: 1, speciesIds: [speciesId] });
      st!.eventId = ev.id;
      this.milestone('first-fire', 'First fire', `On the night side of the world there is a new kind of light. At ${st!.name}, ${sp.name} has learned to keep a fire.`, cell, [ev.id], [speciesId]);
    } else if (kind === 'daughter') {
      const ev = this.emit({ type: 'settlement', cellId: cell, title: `${st!.name} is founded`, description: this.say('daughter', [`Families leave a crowded home and settle at ${st!.name}.`, `A new fire is lit at ${st!.name}.`, `Travellers put down roots at ${st!.name}.`]), causes: mind !== undefined ? [mind] : spCause, importance: 0, speciesIds: [speciesId] });
      st!.eventId = ev.id;
    } else if (kind === 'village') {
      const ev = this.emit({ type: 'settlement', cellId: cell, title: `${st!.name} becomes a village`, description: `${st!.name} has stores of food, walls against the wind, and children who have never moved camp.`, causes: [st!.eventId], importance: 1, speciesIds: [speciesId] });
      this.milestone('first-village', 'First village', `${st!.name} is no longer a camp. People are born there, grow old there, and are buried there.`, cell, [ev.id], [speciesId]);
    } else if (kind === 'city') {
      const ev = this.emit({ type: 'settlement', cellId: cell, title: `${st!.name} becomes a city`, description: `${st!.name} is home to more people than any of them could ever know by name.`, causes: [st!.eventId], importance: 2, speciesIds: [speciesId] });
      this.milestone('first-city', 'First city', `From orbit, a new light shows on the night side. It does not flicker like a fire. It is ${st!.name}, the first city.`, cell, [ev.id], [speciesId]);
    } else if (kind === 'music') {
      this.emit({ type: 'music', cellId: cell, title: `Music at ${st!.name}`, description: `At ${st!.name}, ${sp.name} has begun to make sounds for no reason but the pleasure of them, and to make them together, in time.`, causes: [st!.eventId], importance: 2, speciesIds: [speciesId] });
    } else if (kind === 'trade') {
      this.emit({ type: 'trade', cellId: cell, title: 'The first ships', description: `Boats put out from ${st!.name} carrying more than fishermen. Across the water, another city is waiting for what they bring.`, causes: [st!.eventId], importance: 2, speciesIds: [speciesId] });
    } else if (kind === 'constellation') {
      const gone = this.creatures.species[cause]!;
      const why = this.extinctEventOf.get(gone.id);
      this.emit({ type: 'constellation', cellId: cell, title: `The ${gone.name.split(' ')[0]} constellation`, description: `The people of ${st!.name} dig strange bones out of a hillside. They cannot know the creature was ${gone.name}, but they give its shape to a ring of stars.`, causes: [st!.eventId, why ?? -1].filter((x) => x >= 0), importance: 1, speciesIds: [speciesId, gone.id] });
    } else if (kind === 'war') {
      const other = this.civ.settlements[cause]!;
      const faith = st!.belief >= 0 && other.belief >= 0 && st!.belief !== other.belief;
      this.emit({
        type: 'war', cellId: cell, title: `War between ${st!.name} and ${other.name}`,
        description: faith ? `${st!.name} and ${other.name} remember different wonders and cannot both be right. They go to war over it.` : `${st!.name} and ${other.name} are not the same kind of people, and the land between them is not enough for both. They fight.`,
        causes: [st!.belief, other.belief, st!.eventId].filter((x) => x >= 0), importance: st!.tech > 0.6 ? 1 : 0, speciesIds: [speciesId],
      });
    } else if (kind === 'city-plague') {
      this.emit({ type: 'plague', cellId: cell, title: `Plague in ${st!.name}`, description: this.say('cityplague', [`Sickness arrives in ${st!.name} with the traders and leaves by every road.`, `Half of ${st!.name} is dead of a fever that came along the trade road.`]), causes: [st!.eventId], importance: st!.tech > 0.7 ? 1 : 0, speciesIds: [speciesId] });
    } else if (kind === 'industry') {
      this.emit({ type: 'industry', title: 'The age of smoke', description: `${sp.name} has learned to burn the black remains of ancient swamps. Their cities grow faster than ever, and the air begins, very slowly, to warm.`, causes: mind !== undefined ? [mind] : spCause, importance: 2, speciesIds: [speciesId] });
    } else if (kind === 'space') {
      this.milestone('space-age', 'The space age', `New stars cross the night sky in straight lines: ${sp.name} has put machines in orbit. A faint, steady whisper of radio leaves the planet for the first time.`, -1, mind !== undefined ? [mind] : spCause, [speciesId]);
    } else if (kind === 'nuclear') {
      const ev = this.emit({ type: 'nuclear-war', cellId: cell, title: 'The last war', description: 'In a single day the cities burn brighter than they ever did by night. Then the smoke closes over the world.', causes: [st!.eventId, this.milestones.get('space-age') ?? -1].filter((x) => x >= 0), importance: 3, speciesIds: [speciesId] });
      this.climate.forced -= 9;
      this.climate.aerosol += 12;
      this.era = { kind: 'winter', eventId: ev.id };
      this.civ.devastate();
      this.globalDieback(0.35, ev.id);
    } else if (kind === 'departure') {
      this.milestone('departure', 'Departure', `A light rises from the night side and does not come down. ${sp.name} has left for other suns. Behind it, the lights of home stay on for a while.`, -1, [this.milestones.get('space-age') ?? -1].filter((x) => x >= 0), [speciesId]);
    } else if (kind === 'rediscover') {
      const ruin = this.civ.settlements[cause]!;
      const elder = this.creatures.species[ruin.species]!;
      this.emit({ type: 'rediscovery', cellId: cell, title: `The ruins under ${st!.name}`, description: `Digging foundations at ${st!.name}, ${sp.name} break into walls no one of their kind ever built. ${elder.name} lived here once, ${Math.round((this.simYear - ruin.ruined) / 1e6 * 10) / 10} million years ago.`, causes: [st!.eventId, ruin.eventId].filter((x) => x >= 0), importance: 2, speciesIds: [speciesId, elder.id] });
    } else if (kind === 'painting') {
      const prey = this.creatures.species[cause]!;
      this.emit({ type: 'painting', cellId: cell, title: `Paintings at ${st!.name}`, description: `On a cave wall near ${st!.name}, in ochre and soot, someone has painted ${prey.name}. The animals are running.`, causes: [st!.eventId, prey.eventId].filter((x) => x >= 0), importance: this.notedOnce.has('painting') ? 0 : 1, speciesIds: [speciesId, prey.id] });
      this.notedOnce.add('painting');
    } else if (kind === 'farms') {
      const ev = this.emit({ type: 'settlement', cellId: cell, title: `Fields at ${st!.name}`, description: `The people of ${st!.name} no longer only gather seeds. They plant them, and wait.`, causes: [st!.eventId], importance: 0, speciesIds: [speciesId] });
      this.milestone('first-farm', 'First farms', `Around ${st!.name} the wild growth gives way to rows. For the first time, a species decides what will grow.`, cell, [ev.id], [speciesId]);
    } else if (kind === 'tamed') {
      const tame = this.creatures.species[cause]!;
      const ev = this.emit({ type: 'tamed', cellId: cell, title: `${tame.name} is tamed`, description: `The people of ${st!.name} keep ${tame.name} close, feed it, and choose which of its young will breed. It will not stay the animal it was.`, causes: [st!.eventId, tame.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [speciesId, tame.id] });
      this.milestone('first-tame', 'First tamed animal', `${tame.name} now lives beside ${sp.name}, by choice or by fence.`, cell, [ev.id], [tame.id]);
    } else if (kind === 'temple') {
      this.emit({ type: 'temple', cellId: cell, title: `A temple at ${st!.name}`, description: `Too many wonders have fallen from the sky. At ${st!.name} they raise a temple whose doors face straight up, toward whatever is watching.`, causes: [st!.eventId, ...this.godEvents.slice(-3)].filter((x) => x >= 0), importance: 2, speciesIds: [speciesId] });
    } else if (kind === 'belief') {
      const src = this.events.get(cause)!;
      this.emit({
        type: 'belief', cellId: cell, title: `A faith is born at ${st!.name}`,
        description: this.say('belief', [
          `The people of ${st!.name} saw ${src.title.toLowerCase()}. They tell the story to their children, and the story becomes a faith.`,
          `At ${st!.name} they remember ${src.title.toLowerCase()} in song. The song has turned into worship.`,
          `After ${src.title.toLowerCase()}, the people of ${st!.name} began leaving offerings. They still do.`,
        ]),
        causes: [cause, st!.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [speciesId],
      });
    } else if (kind === 'ruin') {
      this.emit({
        type: 'ruin', cellId: cell, title: `${st!.name} falls silent`,
        description: this.say('ruin', [`The fires of ${st!.name} go out. In time the forest will take the walls.`, `No one is left at ${st!.name}.`, `${st!.name} is abandoned to the weather.`]),
        causes: [st!.eventId, ...(this.era.eventId >= 0 ? [this.era.eventId] : [])].filter((x) => x >= 0), importance: st!.tech > 0.3 ? 1 : 0, speciesIds: [speciesId],
      });
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
