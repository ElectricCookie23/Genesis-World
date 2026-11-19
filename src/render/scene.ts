// Scene orchestration: owns the renderer, every visual layer, and per-frame updates.
import {
  BoxGeometry, ConeGeometry, DoubleSide, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial, Quaternion, RingGeometry, Scene, Vector3,
  WebGPURenderer, type Vector4,
} from 'three/webgpu';
import { dot, float, length, mx_fractal_noise_float, normalize, positionLocal, positionWorld, smoothstep, vec3 } from 'three/tsl';
import type { Grid } from '../sim/world';
import { nearestCell } from '../sim/world';
import type { CellSnapshot, WorldStats, SettlementInfo } from '../shared/protocol';
import { hashSeed } from '../sim/rng';
import { PlanetMesh } from './planet';
import { OceanSurface } from './gfx/ocean';
import { faceDirection } from './gfx/cubebake';
import { setCloudShadow } from './clouds';
import { VolumetricClouds } from './gfx/volclouds';
import { uSiblings, createAtmosphere, createMoon, createSky } from './atmosphere';
import { createDustDisc, ParticleSystem } from './effects';
import { OrbitCamera } from './camera';
import { PostFX } from './postfx';
import { Flora } from './gfx/flora';
import { CreatureLayer, type Individual } from './creatures';
import { Rivers } from './rivers';
import { AuroraVolume, uAurora } from './gfx/aurora';
import { CLOUD_TOP } from './gfx/volclouds';
import { applyLook, worldLook, type WorldLook } from './gfx/look';
import { PlanetData } from './gfx/planetdata';
import { ErosionBake } from './gfx/erosion';
import { TerrainSurface } from './gfx/terrain';
import { GroundSampler } from './gfx/ground';
import { RiverMap } from './gfx/rivermap';
import { Precipitation } from './gfx/weather';
import { Satellites } from './gfx/satellites';
import { CivMap, uNightMap } from './gfx/civmap';
import type { Nation } from './gfx/nations';
import { hashSeed as seedHash } from '../sim/rng';
import type { HerdSnapshot, PlantInfo, SpeciesInfo } from '../shared/protocol';
import { EXAG, MOON_DISTANCE, uBolts, uFlash, uRing, uSun2, uSun2Dir, uUnderwater, uGradeTint, uHazeAmount, uHazeTint, uMoonDir, uSeaKm, uSkyAngle, uSunDir, uTime, uOceanFill, uOverlay, uAtmo, uImpact, uPlumes, uPlumeWind } from './common';

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
  ocean?: OceanSurface;
  oceanResolution = 256;
  clouds?: VolumetricClouds;
  cloudNoiseSize = 64;
  cloudLightSteps = 4;
  vegetation?: Flora;
  creatures?: CreatureLayer;
  rivers?: Rivers;
  data?: PlanetData;
  erosion?: ErosionBake;
  terrain?: TerrainSurface;
  ground?: GroundSampler;
  riverMap?: RiverMap;
  civ?: CivMap;
  aurora?: AuroraVolume;
  weather?: Precipitation;
  satellites?: Satellites;
  riverSize = 512;
  shadowSteps = 8;
  /** Most real plant models and grass tufts drawn near the camera. */
  plantModels = 1600;
  grassBudget = 6000;
  rainDrops = 6000;
  /** Resolution of the baked planet maps per cube face, and of the erosion bake. Set before setGrid. */
  dataSize = 256;
  erosionSize = 512;
  erosionIterations = 320;
  private plantsForBake = new Map<number, PlantInfo>();
  particles?: ParticleSystem;
  private moon2?: Mesh;
  private ringMesh?: Mesh;
  private monolithMesh?: InstancedMesh;
  private boneMesh?: InstancedMesh;
  private oldTree?: Mesh;
  private boneCells: number[] = [];
  showFossils = false;
  /** Postcard mode: slow cinematic camera with depth of field. */
  cinematic = false;
  /** Let the camera dive below the sea surface. */
  underwater = false;
  /** Look out through the eyes of the followed creature. */
  firstPerson = false;
  moons = 1;
  erosionPerFrame = 6;
  /** Cells under storms, where lightning may flash. */
  stormCells: number[] = [];
  private solar = 1;
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

  /** The seed-derived look of this world: star, sky, seas, rocks, pigments, moon. */
  look?: WorldLook;

  setGrid(grid: Grid, seed: string): void {
    this.grid = grid;
    this.look = worldLook(seed);
    applyLook(this.look);
    HAZE_BLUE.set(this.look.skyColor[0], this.look.skyColor[1], this.look.skyColor[2]);
    (uHazeTint.value as Vector3).copy(HAZE_BLUE);
    this.planet = new PlanetMesh(grid);
    // the new surface: baked planet data, GPU-eroded detail, quadtree cube-sphere
    this.data = new PlanetData(grid, this.dataSize);
    this.erosion = new ErosionBake(this.erosionSize, this.erosionIterations, seedHash(`erosion:${seed}`));
    this.ground = new GroundSampler(grid);
    this.civ = new CivMap(grid, this.data.bake, this.riverSize);
    this.clouds = new VolumetricClouds(this.data.life, seedHash(`clouds:${seed}`), this.cloudNoiseSize, this.cloudLightSteps, this.civ.a);
    setCloudShadow(this.clouds.shadow);
    this.riverMap = new RiverMap(grid, this.riverSize);
    this.ocean = new OceanSurface(this.data, this.clouds.shadow, this.erosion.texture, this.oceanResolution, seedHash(`ocean:${seed}`), this.civ);
    this.terrain = new TerrainSurface(this.data, this.erosion, this.riverMap, 32, 800, this.shadowSteps, { node: this.ocean.causticNode, tile: this.ocean.causticTile }, this.civ);
    this.scene.add(this.terrain.sphere.mesh);
    this.planet.mesh.visible = false;
    this.scene.add(this.planet.mesh, this.ocean.sphere.mesh, this.clouds.mesh);
    this.vegetation = new Flora(grid, this.data, this.erosion.texture, this.clouds.shadow, this.plantBudget, this.plantModels, this.grassBudget);
    this.vegetation.pigmentA = this.look.pigmentA;
    this.vegetation.pigmentB = this.look.pigmentB;
    for (const m of this.vegetation.meshes) this.scene.add(m);
    this.particles = new ParticleSystem(grid);
    this.scene.add(this.particles.sprite);
    // a captured second moon, hidden until the sim says it exists
    this.moon2 = createMoon(777);
    this.moon2.scale.setScalar(0.45);
    this.moon2.visible = false;
    // ring system (after the moon is shattered)
    const ringMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const rr = length(positionLocal.xy);
    const bands = mx_fractal_noise_float(vec3(rr.mul(38), 0.3, 0.7), 4, 2.3, 0.6).mul(0.5).add(0.5);
    const lit = dot(normalize(positionWorld), uSunDir).mul(0.25).add(0.85);
    ringMat.colorNode = vec3(0.86, 0.8, 0.7).mul(bands.mul(0.6).add(0.5)).mul(lit);
    ringMat.opacityNode = smoothstep(1.42, 1.5, rr).mul(smoothstep(2.3, 2.15, rr)).mul(bands.mul(0.8).add(0.15)).mul(0.75);
    this.ringMesh = new Mesh(new RingGeometry(1.4, 2.3, 160, 6), ringMat);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.visible = false;
    this.ringMesh.renderOrder = 4;
    // monoliths, and bones of the dead
    const dark = new MeshBasicNodeMaterial();
    dark.colorNode = vec3(0.012, 0.012, 0.016);
    this.monolithMesh = new InstancedMesh(new BoxGeometry(0.004, 0.011, 0.0013).translate(0, 0.0055, 0), dark, 16);
    this.monolithMesh.count = 0;
    const boneMat = new MeshBasicNodeMaterial();
    boneMat.colorNode = vec3(0.86, 0.82, 0.7).mul(dot(normalize(positionWorld), uSunDir).mul(0.5).add(0.6).max(float(0.12)));
    const rib = new ConeGeometry(0.25, 1.4, 4).rotateZ(1.2).translate(0, 0.3, 0);
    this.boneMesh = new InstancedMesh(rib, boneMat, 256);
    this.boneMesh.count = 0;
    // the oldest tree on the planet stands apart: taller, with a pale gold crown
    const treeMat = new MeshBasicNodeMaterial();
    treeMat.colorNode = vec3(0.75, 0.62, 0.22).mul(dot(normalize(positionWorld), uSunDir).mul(0.5).add(0.6).max(float(0.1)));
    this.oldTree = new Mesh(new IcosahedronGeometry(0.5, 1).scale(1, 1.25, 1).translate(0, 1.2, 0), treeMat);
    this.oldTree.add(new Mesh(new ConeGeometry(0.16, 1.1, 6).translate(0, 0.5, 0), dark));
    this.oldTree.visible = false;
    for (const m of [this.moon2, this.ringMesh, this.monolithMesh, this.boneMesh, this.oldTree]) { m.frustumCulled = false; this.scene.add(m); }
    this.rivers = new Rivers(grid);
    this.scene.add(this.rivers.mesh);
    // the old ribbons sit on the old faceted ground; rivers return as part of the new surface
    this.rivers.mesh.visible = false;
    this.satellites = new Satellites(40, seedHash(`sats:${seed}`));
    this.scene.add(this.satellites.mesh);
    // the other planets of this system, placed along a tilted band of sky
    {
      let h = seedHash(`system:${seed}`);
      const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
      const tones: [number, number, number][] = [[1.0, 0.82, 0.6], [0.7, 0.85, 1.0], [1.0, 0.55, 0.4], [0.85, 0.9, 0.75], [0.8, 0.7, 1.0]];
      uSiblings.forEach((sib, k) => {
        const a = rnd() * Math.PI * 2, tilt = (rnd() - 0.5) * 0.25;
        (sib.dir.value as Vector4).set(Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt), k === 0 ? 0.0022 + rnd() * 0.0015 : 0.0004 + rnd() * 0.0005);
        const c = tones[Math.floor(rnd() * tones.length)]!;
        const b = k === 0 ? 0.8 : 0.35 + rnd() * 0.5;
        (sib.color.value as Vector3).set(c[0] * b, c[1] * b, c[2] * b);
      });
    }
    this.weather = new Precipitation(this.rainDrops);
    this.scene.add(this.weather.mesh);
    this.aurora = new AuroraVolume(this.clouds.noise);
    this.scene.add(this.aurora.mesh);
    this.creatures = new CreatureLayer(grid, this.creatureBudget, this.ground!, this.data, this.erosion.texture, this.clouds.shadow);
    this.creatures.onMesh = (m) => this.scene.add(m);
    this.creatures.onStep = (pos, kind, size) => this.particles?.puff(pos, kind, size);
    void hashSeed(seed);
  }

  applyCells(cells: CellSnapshot, first = false): void {
    if (!this.planet || !this.ocean || !this.clouds) return;
    this.lastCells = cells;
    this.data?.update(cells, this.plantsForBake, first);
    this.ground?.setCells(cells.elevation, cells.seaLevel);
    this.riverMap?.update(cells, performance.now(), first);
    this.planet.update(cells, first);
    if (this.overlayOn) this.data?.setOverlay(this.planet.cellColors);
    this.vegetation?.setCells(cells);
    this.creatures?.setCells(cells);
    this.rivers?.update(cells, performance.now(), first || cells.terrainChanged);
    this.lastElevation = cells.elevation;
    uSeaKm.value = cells.seaLevel;
  }

  private seaProbe: [number, number, number] = [0, 0, 0];
  private seaCell = 0;
  /** Sea patches that lie wholly on dry land are not drawn. Only small patches are tested, densely enough not to miss an inlet. */
  private keepSeaPatch = (face: number, x0: number, y0: number, size: number): boolean => {
    const g = this.ground, el = this.lastElevation;
    if (!g || !el || size > 0.032 || uOceanFill.value < 1) return true;
    const limit = uSeaKm.value + 0.4;
    const d = this.seaProbe;
    for (let j = 0; j <= 4; j++) {
      for (let i = 0; i <= 4; i++) {
        faceDirection(face, (x0 + (size * i) / 4) * 2 - 1, (y0 + (size * j) / 4) * 2 - 1, d);
        this.seaCell = g.cellAt(d[0], d[1], d[2], this.seaCell);
        if (el[this.seaCell]! < limit) return true;
      }
    }
    return false;
  };

  private speciesMap = new Map<number, SpeciesInfo>();
  /** Called when the list of nations was rebuilt. */
  onNations?: (nations: Nation[]) => void;
  setSettlements(list: SettlementInfo[]): void {
    this.civ?.setSettlements(list);
  }
  /** A war or plague event at a settlement's cell. */
  civUnrest(cell: number, kind: 'war' | 'plague'): void {
    this.civ?.disturb(cell, kind);
  }
  private projTmp = new Vector3();
  /** Where a direction on the globe falls on screen (CSS pixels), and how visible it is (0 behind the planet). */
  projectDir(x: number, y: number, z: number): [number, number, number] {
    const cam = this.cam.camera;
    const camR = cam.position.length();
    const facing = (x * cam.position.x + y * cam.position.y + z * cam.position.z) / camR;
    const p = this.projTmp.set(x, y, z).project(cam);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const vis = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 ? Math.max(0, Math.min(1, (facing - 1 / camR) * 6)) : 0;
    return [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, vis];
  }
  setNightMap(on: boolean): void {
    uNightMap.value = on ? 1 : 0;
  }

  setSpecies(species: Map<number, SpeciesInfo>): void {
    this.speciesMap = species;
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
    this.plantsForBake = plants;
    this.vegetation?.setPlants(plants);
  }

  /** Radius of the visible surface (terrain or sea) along a unit direction. */
  surfaceRadius(x: number, y: number, z: number): number {
    if (!this.grid || !this.lastElevation) return 1;
    this.lastCell = nearestCell(this.grid, x, y, z, this.lastCell);
    const h = this.ground ? this.ground.heightAt(x, y, z, this.lastCell) : this.lastElevation[this.lastCell]!;
    const e = this.underwater ? h : Math.max(h, uSeaKm.value);
    return 1 + e * EXAG;
  }

  private lastCells?: CellSnapshot;

  /** The latest per-cell snapshot from the simulation. */
  vegetationCells(): CellSnapshot | undefined {
    return this.lastCells;
  }

  setOverlay(mode: 'none' | 'temp' | 'rain' | 'life' | 'people', colorblind: boolean): void {
    if (!this.planet) return;
    this.planet.overlay = mode;
    this.planet.colorblind = colorblind;
    if (this.lastCells) this.planet.update(this.lastCells, false);
    this.overlayOn = mode !== 'none';
    uOverlay.value = this.overlayOn ? 1 : 0;
    if (this.overlayOn) this.data?.setOverlay(this.planet.cellColors);
  }
  private overlayOn = false;

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

  private placeOnSurface(m: Matrix4, cell: number, scale: number, jitter = 0): void {
    const g = this.grid!.pos;
    const up = new Vector3(g[cell * 3]!, g[cell * 3 + 1]!, g[cell * 3 + 2]!);
    if (jitter) up.add(new Vector3(Math.sin(cell * 3.1) * jitter, Math.sin(cell * 7.7) * jitter, Math.sin(cell * 1.3) * jitter)).normalize();
    const r = this.surfaceRadius(up.x, up.y, up.z);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up);
    m.compose(up.clone().multiplyScalar(r), q, new Vector3(scale, scale, scale));
  }

  /** Bones where extinct species made their last stand. */
  setFossils(cells: number[], show: boolean): void {
    this.boneCells = cells.slice(-256);
    this.showFossils = show;
    this.layoutMarkers();
  }

  private layoutMarkers(): void {
    if (!this.boneMesh || !this.grid) return;
    const m = new Matrix4();
    // bones lie small on the ground; the fossil view makes them large enough to find from orbit
    const size = this.showFossils ? 0.012 + Math.min(0.03, this.cam.dist * 0.02) : 0.0018;
    this.boneCells.forEach((c, i) => { this.placeOnSurface(m, c, size, 0.004); this.boneMesh!.setMatrixAt(i, m); });
    this.boneMesh.count = this.boneCells.length;
    this.boneMesh.instanceMatrix.needsUpdate = true;
  }

  /** Meteor debris and fireball at a cell. */
  impactAt(cell: number): void {
    if (!this.grid) return;
    const g = this.grid.pos;
    this.particles?.impact(new Vector3(g[cell * 3]!, g[cell * 3 + 1]!, g[cell * 3 + 2]!));
    (uImpact.value as Vector4).set(g[cell * 3]!, g[cell * 3 + 1]!, g[cell * 3 + 2]!, 0);
  }

  private plumeTimer = 0;
  /** Find the hottest eruptions and fires and feed them to the cloud volume as ash and smoke columns. */
  private updatePlumes(): void {
    const cells = this.lastCells, grid = this.grid;
    if (!cells || !grid) return;
    const { lava, vegetation, windE, windN } = cells;
    const best: number[] = [];
    for (let i = 0; i < grid.count; i++) {
      if (lava[i]! < 0.45) continue;
      // keep sources apart so one eruption does not use every slot
      let near = false;
      for (const b of best) if (grid.pos[b * 3]! * grid.pos[i * 3]! + grid.pos[b * 3 + 1]! * grid.pos[i * 3 + 1]! + grid.pos[b * 3 + 2]! * grid.pos[i * 3 + 2]! > 0.995) { near = true; if (lava[i]! > lava[b]!) best[best.indexOf(b)] = i; break; }
      if (near) continue;
      if (best.length < uPlumes.length) best.push(i);
      else { let weakest = 0; for (let k = 1; k < best.length; k++) if (lava[best[k]!]! < lava[best[weakest]!]!) weakest = k; if (lava[i]! > lava[best[weakest]!]!) best[weakest] = i; }
    }
    for (let k = 0; k < uPlumes.length; k++) {
      const u = uPlumes[k]!.value as Vector4, w = uPlumeWind[k]!.value as Vector4;
      const c = best[k];
      if (c === undefined) { u.w = 0; continue; }
      const x = grid.pos[c * 3]!, y = grid.pos[c * 3 + 1]!, z = grid.pos[c * 3 + 2]!;
      const ash = vegetation[c]! < 0.25 ? 1 : 0;
      u.set(x, y, z, Math.min(1, lava[c]! * (ash ? 1.2 : 0.7)));
      // east and north at the source, to turn the sim's wind into a world direction
      const el = Math.hypot(x, z) || 1;
      const ex = -z / el, ez = x / el;
      const nx = -y * x / el, ny = el, nz = -y * z / el;
      const lean = 0.07;
      w.set((ex * windE[c]! + nx * windN[c]!) * lean, ny * windN[c]! * lean, (ez * windE[c]! + nz * windN[c]!) * lean, ash);
    }
  }

  /** Rain or snow at the camera, from the cloud and storms overhead. */
  private updateWeather(): void {
    const cells = this.lastCells, grid = this.grid, wx = this.weather;
    if (!wx) return;
    if (!cells || !grid || this.cam.dist > 0.09 || uUnderwater.value > 0.5) { wx.set(0, false, 0, 0, 0); return; }
    const p = this.cam.camera.position;
    const l = p.length();
    const c = (this.weatherCell = nearestCell(grid, p.x / l, p.y / l, p.z / l, this.weatherCell));
    let storm = 0;
    for (const s of this.stormCells) { const d = grid.pos[s * 3]! * p.x / l + grid.pos[s * 3 + 1]! * p.y / l + grid.pos[s * 3 + 2]! * p.z / l; if (d > 0.9985) storm = 1; }
    const wet = Math.max(storm, Math.max(0, (cells.cloud[c]! - 0.72) / 0.25) * Math.min(1, cells.moisture[c]! * 2));
    const x = grid.pos[c * 3]!, y = grid.pos[c * 3 + 1]!, z = grid.pos[c * 3 + 2]!;
    const el = Math.hypot(x, z) || 1;
    const k = 0.0009;
    wx.set(Math.min(1, wet), cells.temperature[c]! < 0.5, (-z / el * cells.windE[c]! + (-y * x / el) * cells.windN[c]!) * k, el * cells.windN[c]! * k, (x / el * cells.windE[c]! + (-y * z / el) * cells.windN[c]!) * k);
  }
  private weatherCell = 0;

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
    this.solar = stats.solar ?? 1;
    this.satellites?.set(stats.maxTech >= 0.9 && stats.settlements > 0 ? Math.min(1, (stats.maxTech - 0.9) * 12 + 0.3) : 0);
    if (this.clouds && this.grid) { const g = this.grid; this.clouds.setCyclones((stats.cyclones ?? []).slice(0, 4).map((c) => [g.pos[c * 3]!, g.pos[c * 3 + 1]!, g.pos[c * 3 + 2]!])); }
    this.moons = stats.moons;
    this.moon.visible = stats.moons >= 1 && this.moon.visible;
    if (stats.moons === 0) this.moon.visible = false;
    if (this.moon2) this.moon2.visible = stats.moons >= 2;
    if (this.ringMesh) this.ringMesh.visible = stats.ring;
    uRing.value = stats.ring ? 1 : 0;
    uSun2.value = stats.binary ? 1 : 0;
    if (this.monolithMesh && this.grid && this.monolithMesh.count !== stats.monoliths.length) {
      const m = new Matrix4();
      stats.monoliths.slice(0, 16).forEach((c, i) => { this.placeOnSurface(m, c, 1 + Math.min(4, this.cam.dist * 8)); this.monolithMesh!.setMatrixAt(i, m); });
      this.monolithMesh.count = Math.min(16, stats.monoliths.length);
      this.monolithMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.oldTree && this.grid) {
      this.oldTree.visible = stats.oldestTreeCell >= 0 && this.cam.dist < 1.2;
      if (stats.oldestTreeCell >= 0) {
        const m = new Matrix4();
        this.placeOnSurface(m, stats.oldestTreeCell, 0.006 * (1 + Math.min(2.2, this.cam.dist * 4)));
        m.decompose(this.oldTree.position, this.oldTree.quaternion, this.oldTree.scale);
      }
    }
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
    if (this.moon2?.visible) {
      const a2 = this.moonAngle * 2.3 + 1;
      this.moon2.position.set(Math.cos(a2) * 3.4, Math.sin(0.4) * Math.sin(a2) * 3.4, Math.sin(a2) * 3.4 * Math.cos(0.4));
    }
    // the companion sun trails the main one by a wide angle
    (uSun2Dir.value as Vector3).set(cd * Math.cos(this.dayAngle + 0.9), Math.sin(this.declination) + 0.15, cd * Math.sin(this.dayAngle + 0.9)).normalize();

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
      this.creatures.season = this.tilt > 0 ? this.declination / this.tilt : 0;
      this.creatures.update(this.time, this.cam.dist, uSunDir.value as Vector3);
      // echolocation shown as ripples of sound
      if (this.particles && this.cam.dist < 0.3 && Math.random() < dt * 4) for (const e of this.creatures.echoers(2)) this.particles.ripple(e.pos, e.size * 9);
      // depth of field while following a creature
      this.post.setFocus(this.following !== null || this.cinematic, this.cam.dist);
      if (this.following !== null) {
        const ind = this.creatures.byKey(this.following);
        if (ind) {
          const d = ind.pos.clone().normalize();
          this.cam.track(Math.atan2(d.z, d.x), Math.asin(Math.max(-1, Math.min(1, d.y))));
        }
      }
    }
    this.particles?.update(dt, this.time, this.lastCells, this.cam.focusDir(this.tmpFocus), this.cam.dist, this.stormCells);
    // first-person: ride on the followed creature's head
    if (this.firstPerson && this.following !== null && this.creatures) {
      const ind = this.creatures.byKey(this.following);
      if (ind) {
        const up = ind.pos.clone().normalize();
        const eye = ind.pos.clone().addScaledVector(up, ind.size * 2.2).addScaledVector(ind.fwd, ind.size * 0.8);
        const cam1 = this.cam.camera;
        cam1.position.copy(eye);
        cam1.up.copy(up);
        cam1.lookAt(eye.clone().addScaledVector(ind.fwd, 0.01).addScaledVector(up, -0.0008));
        cam1.near = 0.00008;
      }
    }
    const camR = this.cam.camera.position.length();
    uUnderwater.value = this.underwater && camR < 1 + uSeaKm.value * EXAG ? 1 : 0;
    if (this.vegetation) this.vegetation.autumn = this.tilt > 0 ? this.declination / this.tilt : 0;
    // the erosion bake runs a few iterations a frame until it is done, then the terrain keeps its result
    if (this.erosion && !this.erosion.finished) this.erosion.step(this.renderer, this.erosionPerFrame);
    else if (this.erosion && this.ground) void this.ground.readDetail(this.renderer, this.erosion);
    if (this.civ?.update(this.lastCells, this.speciesMap, performance.now(), dt)) this.onNations?.(this.civ.nations);
    const imp = uImpact.value as Vector4;
    if (imp.w >= 0) { imp.w += dt; if (imp.w > 240) imp.w = -1; }
    if ((this.plumeTimer -= dt) <= 0) { this.plumeTimer = 1.5; this.updatePlumes(); }
    this.updateWeather();
    this.aurora?.setCameraRadius(this.cam.camera.position.length(), CLOUD_TOP);
    // the aurora breathes with the star's activity, and needs air to glow in
    uAurora.value = (0.8 + 0.3 * Math.sin(this.time * 0.037) + 0.2 * Math.sin(this.time * 0.011 + 1.3)) * this.solar * uAtmo.value;
    this.terrain?.update(this.cam.camera.position);
    this.ocean?.update(this.renderer, this.cam.camera.position, this.time, this.keepSeaPatch);
    this.vegetation?.update(this.cam.focusDir(this.tmpFocus), this.cam.dist, this.cam.camera.position, this.renderer);
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
