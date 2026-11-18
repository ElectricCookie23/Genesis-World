// Scene orchestration: owns the renderer, every visual layer, and per-frame updates.
import { Scene, Vector3, WebGPURenderer, type Mesh, type Vector4 } from 'three/webgpu';
import type { Grid } from '../sim/world';
import { nearestCell } from '../sim/world';
import type { CellSnapshot, WorldStats } from '../shared/protocol';
import { hashSeed } from '../sim/rng';
import { PlanetMesh } from './planet';
import { OceanMesh } from './ocean';
import { CloudLayer } from './clouds';
import { createAtmosphere, createMoon, createSky } from './atmosphere';
import { createDustDisc } from './effects';
import { OrbitCamera } from './camera';
import { PostFX } from './postfx';
import { Vegetation } from './vegetation';
import { CreatureLayer, type Individual } from './creatures';
import { Rivers } from './rivers';
import { createAuroras } from './aurora';
import type { HerdSnapshot, PlantInfo, SpeciesInfo } from '../shared/protocol';
import { EXAG, MOON_DISTANCE, uBolts, uFlash, uGradeTint, uHazeAmount, uHazeTint, uMoonDir, uSeaKm, uSkyAngle, uSunDir, uTime } from './common';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

const GRADE_NEUTRAL = new Vector3(1, 1, 1);
const GRADE_WARM = new Vector3(1.08, 0.99, 0.86);
const GRADE_COLD = new Vector3(0.88, 0.97, 1.1);
const GRADE_SICK = new Vector3(1.0, 0.95, 0.7);
const HAZE_BLUE = new Vector3(0.42, 0.62, 1.0);
const HAZE_SICK = new Vector3(0.75, 0.62, 0.38);

export class GenesisScene {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly cam: OrbitCamera;
  readonly post: PostFX;
  readonly sky: Mesh;
  readonly atmosphere: Mesh;
  readonly moon: Mesh;
  readonly disc: Mesh;
  planet?: PlanetMesh;
  ocean?: OceanMesh;
  clouds?: CloudLayer;
  vegetation?: Vegetation;
  creatures?: CreatureLayer;
  rivers?: Rivers;
  /** Cells under storms, where lightning may flash. */
  stormCells: number[] = [];
  private boltTimer = 0;
  private boltEcho = -1;
  creatureBudget = 5000;
  /** Key of the individual the camera follows, or null. */
  following: number | null = null;
  /** Instance budget for plants (lower on mobile). */
  plantBudget = 60000;
  grid?: Grid;
  backend = 'webgl2';
  time = 0;
  /** Visual day angle; one cosmetic day lasts DAY_SECONDS at any sim speed. */
  dayAngle = 0.8;
  moonAngle = 2.2;
  /** Sun declination (radians) for seasons. */
  declination = 0;
  tilt = 0.4;
  daySpeed = 1;
  /** Era grade targets: -1 ice age .. +1 greenhouse, plus impact-winter haze 0..1. */
  eraWarmth = 0;
  eraHaze = 0;
  eraHazeTarget = 0;
  private lastCell = 0;
  private tmpFocus = new Vector3();
  private lastElevation?: Float32Array;
  moonDistance = MOON_DISTANCE;
  fpsAvg = 60;
  flashLevel = 0;
  /** When false the opening sequence owns the flash uniform. */
  ownsFlash = false;

  constructor(readonly canvas: HTMLCanvasElement, forceWebGL = false) {
    this.renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL, powerPreference: 'high-performance' });
    this.cam = new OrbitCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.sky = createSky();
    this.atmosphere = createAtmosphere();
    this.moon = createMoon(1234);
    this.disc = createDustDisc();
    this.disc.visible = false;
    this.scene.add(this.sky, this.atmosphere, this.moon, this.disc);
    this.post = new PostFX(this.renderer, this.scene, this.cam.camera);
    this.cam.groundRadius = (x, y, z) => this.surfaceRadius(x, y, z);
  }

  async init(): Promise<void> {
    await this.renderer.init();
    const backend = (this.renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend;
    this.backend = backend ? 'webgpu' : 'webgl2';
    this.resize();
  }

  setPixelRatio(max: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, max));
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.camera.aspect = w / Math.max(1, h);
    this.cam.camera.updateProjectionMatrix();
  }

  setGrid(grid: Grid, seed: string): void {
    this.grid = grid;
    this.planet = new PlanetMesh(grid);
    this.ocean = new OceanMesh(grid);
    this.clouds = new CloudLayer(grid);
    this.scene.add(this.planet.mesh, this.ocean.mesh, this.clouds.mesh);
    this.vegetation = new Vegetation(grid, this.plantBudget);
    for (const m of this.vegetation.meshes) this.scene.add(m);
    this.rivers = new Rivers(grid);
    this.scene.add(this.rivers.mesh);
    for (const a of createAuroras()) this.scene.add(a);
    this.creatures = new CreatureLayer(grid, this.creatureBudget);
    this.creatures.onMesh = (m) => this.scene.add(m);
    void hashSeed(seed);
  }

  applyCells(cells: CellSnapshot, first = false): void {
    if (!this.planet || !this.ocean || !this.clouds) return;
    this.planet.update(cells, first);
    this.ocean.update(cells);
    this.clouds.update(cells);
    this.vegetation?.setCells(cells);
    this.creatures?.setCells(cells);
    this.rivers?.update(cells, performance.now(), first || cells.terrainChanged);
    this.lastElevation = cells.elevation;
    uSeaKm.value = cells.seaLevel;
  }

  setSpecies(species: Map<number, SpeciesInfo>): void {
    if (!this.creatures) return;
    this.creatures.setSpecies(species);
    for (const m of this.creatures.prune()) this.scene.remove(m);
  }

  setHerds(h: HerdSnapshot): void {
    this.creatures?.setHerds(h);
  }

  /** The creature under a screen point, if any. */
  pickCreature(clientX: number, clientY: number): Individual | null {
    if (!this.creatures) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.cam.camera.updateMatrixWorld();
    return this.creatures.pick(this.cam.camera, clientX - rect.left, clientY - rect.top, rect.width, rect.height);
  }

  follow(key: number | null): void {
    this.following = key;
    if (key !== null && this.cam.dist > 0.06) this.cam.zoomTo(0.035);
  }

  setPlants(plants: Map<number, PlantInfo>): void {
    this.vegetation?.setPlants(plants);
  }

  /** Radius of the visible surface (terrain or sea) along a unit direction. */
  surfaceRadius(x: number, y: number, z: number): number {
    if (!this.grid || !this.lastElevation) return 1;
    this.lastCell = nearestCell(this.grid, x, y, z, this.lastCell);
    const e = Math.max(this.lastElevation[this.lastCell]!, uSeaKm.value);
    return 1 + e * EXAG;
  }

  /** Unit direction on the planet under a screen point, or null if the point misses it. */
  pick(clientX: number, clientY: number): Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector3(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0.5);
    const cam = this.cam.camera;
    cam.updateMatrixWorld();
    const dir = ndc.unproject(cam).sub(cam.position).normalize();
    const o = cam.position;
    let radius = 1;
    for (let k = 0; k < 3; k++) {
      const b = o.dot(dir);
      const disc = b * b - (o.lengthSq() - radius * radius);
      if (disc < 0) return null;
      const t = -b - Math.sqrt(disc);
      if (t < 0) return null;
      const hit = o.clone().addScaledVector(dir, t).normalize();
      radius = this.surfaceRadius(hit.x, hit.y, hit.z);
      if (k === 2) return hit;
    }
    return null;
  }

  /** Brief white flash (impacts). */
  flash(amount: number): void {
    this.flashLevel = Math.max(this.flashLevel, amount);
  }

  cellAt(x: number, y: number, z: number): number {
    if (!this.grid) return 0;
    this.lastCell = nearestCell(this.grid, x, y, z, this.lastCell);
    return this.lastCell;
  }

  applyStats(stats: WorldStats): void {
    this.tilt = stats.tilt;
    // seasons are only shown when a year lasts long enough to see them
    if (stats.yearsPerSecond > 0 && stats.yearsPerSecond <= 1.01) {
      this.declination = stats.tilt * Math.sin(stats.yearFrac * Math.PI * 2);
    }
    this.eraWarmth = Math.max(-1, Math.min(1, (stats.meanTemp - 14.5) / 7));
    this.eraHazeTarget = stats.era === 'winter' ? 1 : 0;
    this.stormCells = stats.storms;
  }

  frame(dt: number): void {
    this.time += dt;
    uTime.value = this.time;
    this.dayAngle += dt * ((Math.PI * 2) / 80) * this.daySpeed;
    this.moonAngle += dt * ((Math.PI * 2) / 140) * this.daySpeed;
    const cd = Math.cos(this.declination);
    (uSunDir.value as Vector3).set(cd * Math.cos(this.dayAngle), Math.sin(this.declination), cd * Math.sin(this.dayAngle)).normalize();
    uSkyAngle.value = -this.dayAngle;
    const mi = 0.09;
    const md = (uMoonDir.value as Vector3).set(Math.cos(this.moonAngle), Math.sin(mi) * Math.sin(this.moonAngle), Math.sin(this.moonAngle)).normalize();
    this.moon.position.copy(md).multiplyScalar(this.moonDistance);
    this.moon.rotation.y = -this.moonAngle;

    // era colour grade
    const w = this.eraWarmth;
    const target = w >= 0 ? GRADE_NEUTRAL.clone().lerp(GRADE_WARM, w) : GRADE_NEUTRAL.clone().lerp(GRADE_COLD, -w);
    target.lerp(GRADE_SICK, this.eraHaze);
    (uGradeTint.value as Vector3).lerp(target, Math.min(1, dt * 0.8));
    (uHazeTint.value as Vector3).lerp(HAZE_BLUE.clone().lerp(HAZE_SICK, this.eraHaze), Math.min(1, dt * 0.8));
    uHazeAmount.value += (this.eraHaze * 0.35 - uHazeAmount.value) * Math.min(1, dt * 0.8);

    // lightning: storms flicker, often with a quick second flash
    for (const b of uBolts) (b.value as Vector4).w *= Math.exp(-dt * 16);
    this.boltTimer -= dt;
    if (this.grid && this.stormCells.length && (this.boltTimer <= 0 || this.boltEcho >= 0)) {
      const slot = Math.floor(Math.random() * uBolts.length);
      const echo = this.boltEcho >= 0;
      const c = echo ? this.boltEcho : this.stormCells[Math.floor(Math.random() * this.stormCells.length)]!;
      const g = this.grid.pos;
      (uBolts[slot]!.value as Vector4).set(g[c * 3]! + (Math.random() - 0.5) * 0.02, g[c * 3 + 1]! + (Math.random() - 0.5) * 0.02, g[c * 3 + 2]! + (Math.random() - 0.5) * 0.02, 2 + Math.random() * 3);
      const v = uBolts[slot]!.value as Vector4;
      const l = Math.hypot(v.x, v.y, v.z);
      v.x /= l; v.y /= l; v.z /= l;
      this.boltEcho = !echo && Math.random() < 0.45 ? c : -1;
      if (!echo) this.boltTimer = 0.15 + Math.random() * (5 / this.stormCells.length);
    }
    if (this.ownsFlash) {
      this.flashLevel *= Math.exp(-dt * 2.2);
      uFlash.value = this.flashLevel;
    }
    this.eraHaze += (this.eraHazeTarget - this.eraHaze) * Math.min(1, dt * 0.5);
    this.cam.update(dt);
    if (this.creatures) {
      this.creatures.update(this.time, this.cam.dist);
      if (this.following !== null) {
        const ind = this.creatures.byKey(this.following);
        if (ind) {
          const d = ind.pos.clone().normalize();
          this.cam.track(Math.atan2(d.z, d.x), Math.asin(Math.max(-1, Math.min(1, d.y))));
        }
      }
    }
    this.vegetation?.update(this.cam.focusDir(this.tmpFocus), this.cam.dist);
    const c = this.cam.camera;
    const far = c.position.length() + this.moonDistance + 4;
    c.far = far;
    c.updateProjectionMatrix();
    this.sky.position.copy(c.position);
    this.sky.scale.setScalar((far * 0.9) / 400);
    this.post.render();
    if (dt > 0) this.fpsAvg += (1 / dt - this.fpsAvg) * 0.05;
  }
}
