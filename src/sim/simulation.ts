// The whole deterministic simulation. Runs in the worker and in headless tests.
import { RNG, hashSeed } from './rng';
import { buildGrid, createWorld, GRID_N, type Grid, type World } from './world';
import { computeDrainage, generateTerrain, type GeologyState } from './geology';
import { classifyBiomes, createClimate, updateMoisture, updateSnow, updateTemperature, type ClimateState } from './climate';
import { EventLog } from './events';

export class Simulation {
  readonly seed: string;
  readonly grid: Grid;
  readonly world: World;
  readonly rng: RNG;
  readonly geology: GeologyState;
  readonly climate: ClimateState;
  readonly events = new EventLog();
  simYear = 0;
  /** Angle of the moon in its orbit (radians). */
  moonAngle = 0;
  terrainDirty = true;
  private drainageTimer = 0;

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

  /** Advance the simulation by dt years (fixed timestep chosen by the caller). */
  step(dt: number): void {
    if (dt <= 0) return;
    this.simYear += dt;
    // The moon orbits about 13 times a year; at high speed its phase is only cosmetic.
    this.moonAngle = (this.simYear * 13.37 * Math.PI * 2) % (Math.PI * 2);
    const seasonal = dt < 0.2;
    const c = this.climate;
    // forcing decay
    c.aerosol *= Math.exp(-dt / 6);
    c.forced *= Math.exp(-dt / 4000);
    c.greenhouse += (2.5 - c.greenhouse) * (1 - Math.exp(-dt / 2.5e6));
    updateTemperature(this.world, c, this.simYear, seasonal ? this.yearFrac : -1);
    updateMoisture(this.world, c, 1);
    updateSnow(this.world, c, dt);
    classifyBiomes(this.world, c);
    this.drainageTimer += 1;
    if (this.drainageTimer >= 40) {
      this.drainageTimer = 0;
      computeDrainage(this.world);
    }
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
    mix(Math.round(this.simYear));
    return h;
  }
}
