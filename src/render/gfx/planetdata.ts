// The simulation's state as cube-map textures, re-baked from every snapshot.
// Every surface layer (terrain, ocean, clouds, night lights) reads the planet from these.
import type { CubeTexture } from 'three/webgpu';
import { cubeTexture, vec3 } from 'three/tsl';
import type { Grid } from '../../sim/world';
import type { CellSnapshot, PlantInfo } from '../../shared/protocol';
import { PG } from '../../sim/genetics';
import { CubeBake } from './cubebake';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PlanetData {
  readonly bake: CubeBake;
  /** float: r = elevation (km), g = temperature (C), b = moisture 0..1, a = snow depth (m) */
  readonly height: CubeTexture;
  /** bytes: r = vegetation, g = canopy height, b = ash, a = lava or fire heat */
  readonly cover: CubeTexture;
  /** bytes: r = farmland, g = reef (0.5 = none, above = living, below = bleached), b = plankton, a = cloud cover */
  readonly life: CubeTexture;
  /** bytes: r = ground worn by migrating herds, g = leaf hue gene of the main plant, b = wind strength, a = sea ice */
  readonly extra: CubeTexture;
  /** bytes: rgb = data overlay colour (temperature, rain, life or people), when one is switched on */
  readonly overlay: CubeTexture;
  private scratch: Float32Array;
  private frame = 0;

  constructor(private grid: Grid, size: number) {
    this.bake = new CubeBake(grid, size);
    this.height = this.bake.create(true);
    this.cover = this.bake.create(false);
    this.life = this.bake.create(false);
    this.extra = this.bake.create(false);
    this.overlay = this.bake.create(false);
    this.scratch = new Float32Array(grid.count);
  }

  /** Paint the data overlay from per-cell linear RGB (three floats per cell). */
  setOverlay(colors: Float32Array): void {
    const s = this.scratch, n = this.grid.count;
    for (let ch = 0; ch < 3; ch++) {
      for (let i = 0; i < n; i++) s[i] = Math.sqrt(Math.max(0, colors[i * 3 + ch]!));
      this.bake.fill(this.overlay, ch, s);
    }
    this.bake.commit(this.overlay);
  }

  update(cells: CellSnapshot, plants: Map<number, PlantInfo>, full: boolean): void {
    const b = this.bake;
    this.frame++;
    // terrain and climate
    if (full || cells.terrainChanged) b.fill(this.height, 0, cells.elevation);
    b.fill(this.height, 1, cells.temperature);
    b.fill(this.height, 2, cells.moisture);
    b.fill(this.height, 3, cells.snow);
    b.commit(this.height);
    b.fill(this.cover, 0, cells.vegetation);
    b.fill(this.cover, 1, cells.canopy);
    b.fill(this.cover, 2, cells.ash);
    b.fill(this.cover, 3, cells.lava);
    b.commit(this.cover);
    b.fill(this.life, 0, cells.fields);
    b.fill(this.life, 1, cells.reef, 0.5, 0.5);
    b.fill(this.life, 2, cells.bloom);
    b.fill(this.life, 3, cells.cloud);
    b.commit(this.life);
    const s = this.scratch;
    const n = this.grid.count;
    b.fill(this.extra, 0, cells.trail ?? cells.lights);
    for (let i = 0; i < n; i++) { const p = plants.get(cells.flora[i]!); s[i] = p ? p.genes[PG.LeafHue]! : 0.5; }
    b.fill(this.extra, 1, s);
    for (let i = 0; i < n; i++) s[i] = Math.min(1, Math.hypot(cells.windE[i]!, cells.windN[i]!) * 0.7);
    b.fill(this.extra, 2, s);
    for (let i = 0; i < n; i++) s[i] = cells.elevation[i]! <= cells.seaLevel && cells.temperature[i]! < -3 ? 1 : 0;
    b.fill(this.extra, 3, s);
    b.commit(this.extra);
    // hot springs: the same scattered land cells that puff steam
    if (full || cells.terrainChanged) {
      for (let i = 0; i < n; i++) s[i] = cells.elevation[i]! > cells.seaLevel && ((i * 2654435761) >>> 0) % 2600 === 0 ? 1 : 0;
      b.fill(this.overlay, 3, s);
      b.commit(this.overlay);
    }
  }
}

export interface PlanetDataOverlay { setOverlay(colors: Float32Array): void }
/**
 * Sample one of the planet's cube maps along a world direction.
 * Three mirrors the x axis of ordinary cube textures; this undoes it so directions mean what they say.
 */
export function samplePlanet(tex: CubeTexture, dir: any): any {
  return cubeTexture(tex, vec3(dir.x.negate(), dir.y, dir.z));
}
