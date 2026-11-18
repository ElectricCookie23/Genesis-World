// Scene orchestration: owns the renderer, every visual layer, and per-frame updates.
import { Scene, Vector3, WebGPURenderer, type Mesh } from 'three/webgpu';
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
import { EXAG, MOON_DISTANCE, uGradeTint, uHazeAmount, uHazeTint, uMoonDir, uSeaKm, uSkyAngle, uSunDir, uTime } from './common';

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
  private lastCell = 0;
  private lastElevation?: Float32Array;
  moonDistance = MOON_DISTANCE;
  fpsAvg = 60;

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
    void hashSeed(seed);
  }

  applyCells(cells: CellSnapshot, first = false): void {
    if (!this.planet || !this.ocean || !this.clouds) return;
    this.planet.update(cells, first);
    this.ocean.update(cells);
    this.clouds.update(cells);
    this.lastElevation = cells.elevation;
    uSeaKm.value = cells.seaLevel;
  }

  /** Radius of the visible surface (terrain or sea) along a unit direction. */
  surfaceRadius(x: number, y: number, z: number): number {
    if (!this.grid || !this.lastElevation) return 1;
    this.lastCell = nearestCell(this.grid, x, y, z, this.lastCell);
    const e = Math.max(this.lastElevation[this.lastCell]!, uSeaKm.value);
    return 1 + e * EXAG;
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

    this.cam.update(dt);
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
