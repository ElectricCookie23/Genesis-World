// Scene orchestration: owns the renderer, every visual layer, and per-frame updates.
import { describeArchitecture, type Material } from './gfx/architecture';
import {
  AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Quaternion, RingGeometry, Scene, TorusGeometry, Vector3,
  WebGPURenderer, type Vector4,
} from 'three/webgpu';
import { dot, exp, float, length, mx_fractal_noise_float, normalize, positionLocal, positionWorld, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import type { Grid } from '../sim/world';
import { nearestCell } from '../sim/world';
import type { CellSnapshot, NationInfo, WorldStats, SettlementInfo } from '../shared/protocol';
import { hashSeed } from '../sim/rng';
import { PlanetMesh } from './planet';
import { loadFirst } from './gfx/models';
import { PLANT_MODELS } from './gfx/assetroles';
import type { Form } from './gfx/plantmesh';

const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3();
/** How far out the comet hangs: beyond the moon, inside the far edge of what is drawn. */
const COMET_AT = 8;
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
import { AuroraVolume, uAurora, uMagneticPole } from './gfx/aurora';
import { PG } from '../sim/genetics';
import { CLOUD_TOP } from './gfx/volclouds';
import { applyLook, uLook, worldLook, type WorldLook } from './gfx/look';
import { PlanetData } from './gfx/planetdata';
import { ErosionBake } from './gfx/erosion';
import { dumpUniforms, guardUniforms, summariseCells } from './diagnose';
import { TerrainSurface, setGroundRivers } from './gfx/terrain';
import { GroundSampler } from './gfx/ground';
import { RiverMap } from './gfx/rivermap';
import { Precipitation } from './gfx/weather';
import { Satellites } from './gfx/satellites';
import { Towns } from './gfx/buildings';
import { Tornadoes, type Twister } from './gfx/tornado';
import { Caves, buildRibcage } from './gfx/landmarks';
import { uMoonBody, uMoonBody2 } from './gfx/eclipse';
import { MOON_RADIUS } from './common';
import { CivMap, uNightMap } from './gfx/civmap';
import type { Nation } from './gfx/nations';
import { hashSeed as seedHash } from '../sim/rng';
import type { HerdSnapshot, PlantInfo, SpeciesInfo } from '../shared/protocol';
import { EXAG, MOON_DISTANCE, uWaterFog, uBolts, uFlash, uRing, uSun2, uSun2Dir, uUnderwater, uGradeTint, uHazeAmount, uHazeTint, uMoonDir, uSeaKm, uSkyAngle, uSunDir, uTime, uOceanFill, uOverlay, uAtmo, uImpact, uPlumes, uPlumeWind, uFog, uRainbow, uShimmer, uHatch, uFungal, uFossil } from './common';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

const GRADE_NEUTRAL = new Vector3(1, 1, 1);
const GRADE_WARM = new Vector3(1.08, 0.99, 0.86);
const GRADE_COLD = new Vector3(0.88, 0.97, 1.1);
const GRADE_SICK = new Vector3(1.0, 0.95, 0.7);
const HAZE_BLUE = new Vector3(0.42, 0.62, 1.0);
const HAZE_SICK = new Vector3(0.75, 0.62, 0.38);

export type Preset = 'low' | 'medium' | 'high' | 'ultra';

/** What each quality preset turns on. Ultra may need a strong desktop GPU; Low is for phones. */
// Costs set from a real GPU (docs/GPU_REVIEW.md, Apple M3 Pro at 1600x913 on a 2x display). As first written,
// only Low held its settings: High ran at about 20 fps at a pixel ratio of 2 with 22 cloud steps (the cloud march
// alone was over half the frame, and the rest alone missed 50 fps at that resolution), and Ultra at 12. High now
// asks for 1.5 and 18 steps, Medium 1.25 and 12, Ultra 2 and 32; the step-downs in main.ts take it from there.
export const PRESETS: Record<Preset, {
  ratio: number; dataSize: number; erosionSize: number; erosionIterations: number; oceanResolution: number; fftEvery: number;
  cloudSteps: number; cloudLight: number; cloudDetail: number; cloudNoise: number;
  /** Share of the screen resolution the clouds are marched at. */
  cloudScale: number; imposter: number; lod: number; auroraSteps: number; shadowSteps: number; maxLevel: number; lineSize: number;
  plants: number; models: number; grass: number; creatures: number; rain: number; taa: boolean; ao: boolean; bloom: boolean; fringe: boolean;
}> = {
  low: { ratio: 1, cloudScale: 0.4, imposter: 160, lod: 0.02, dataSize: 128, erosionSize: 256, erosionIterations: 160, oceanResolution: 64, fftEvery: 2, cloudSteps: 8, cloudLight: 2, cloudDetail: 0, cloudNoise: 32, auroraSteps: 12, shadowSteps: 3, maxLevel: 9, lineSize: 256, plants: 4000, models: 200, grass: 0, creatures: 600, rain: 1500, taa: false, ao: false, bloom: false, fringe: false },
  medium: { ratio: 1.25, cloudScale: 0.5, imposter: 224, lod: 0.028, dataSize: 192, erosionSize: 384, erosionIterations: 240, oceanResolution: 128, fftEvery: 1, cloudSteps: 12, cloudLight: 3, cloudDetail: 1, cloudNoise: 48, auroraSteps: 18, shadowSteps: 6, maxLevel: 10, lineSize: 512, plants: 15000, models: 600, grass: 2000, creatures: 3000, rain: 3000, taa: false, ao: false, bloom: true, fringe: false },
  high: { ratio: 1.5, cloudScale: 0.5, imposter: 352, lod: 0.042, dataSize: 256, erosionSize: 512, erosionIterations: 320, oceanResolution: 256, fftEvery: 1, cloudSteps: 18, cloudLight: 4, cloudDetail: 1, cloudNoise: 64, auroraSteps: 28, shadowSteps: 8, maxLevel: 11, lineSize: 512, plants: 40000, models: 1600, grass: 6000, creatures: 5000, rain: 6000, taa: true, ao: true, bloom: true, fringe: true },
  ultra: { ratio: 2, cloudScale: 0.75, imposter: 480, lod: 0.055, dataSize: 384, erosionSize: 768, erosionIterations: 400, oceanResolution: 512, fftEvery: 1, cloudSteps: 32, cloudLight: 5, cloudDetail: 1, cloudNoise: 64, auroraSteps: 40, shadowSteps: 12, maxLevel: 12, lineSize: 1024, plants: 60000, models: 2600, grass: 10000, creatures: 5000, rain: 10000, taa: true, ao: true, bloom: true, fringe: true },
};

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
  towns?: Towns;
  tornadoes?: Tornadoes;
  caves?: Caves;
  buildingBudget = 4000;
  riverSize = 512;
  shadowSteps = 8;
  /** Most real plant models and grass tufts drawn near the camera. */
  plantModels = 1600;
  imposterTile = 192;
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
  /** A comet in the sky (expansion E47): shown for a while after the chronicle reports one. */
  private cometMesh?: Mesh;
  private readonly uComet = uniform(0);
  private cometFrom = -1e9;
  private cometFor = 0;
  private readonly cometDir = new Vector3(0.35, 0.45, 0.82).normalize();
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
  private tether?: Mesh;
  private orbitalRing?: Mesh;
  private starSwell = 1;
  private starBase?: { size: number; color: Vector3 };
  private starTmp = new Vector3();
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

  /** Set false (`&noassets` in the address) to draw everything from the game's own generated shapes, as before the asset pass. */
  useAssets = true;
  /** For checks: draw a form of plant from a given file (`&plantmodel=broadleaf:path/to.glb`). */
  plantModelOverride: Record<string, string> = {};

  /** Fetch the made models for plants and hand each to the plant layer as it arrives. A form with no file keeps its generated shape. */
  private async loadPlantModels(): Promise<void> {
    if (!this.useAssets || !this.vegetation) return;
    const forms = new Set<string>([...Object.keys(PLANT_MODELS), ...Object.keys(this.plantModelOverride)]);
    for (const form of forms) {
      const over = this.plantModelOverride[form];
      const model = await loadFirst(over ? [over] : PLANT_MODELS[form as Form] ?? [], !!over);
      if (model) this.vegetation.useModel(form as Form, model);
    }
  }

  /** Put a comet in the sky for so many seconds. Where it hangs is fixed by the number given (the event that reported it). */
  showComet(seconds: number, seed: number): void {
    const a = ((seed * 0.6180339887) % 1) * Math.PI * 2, b = (((seed * 0.7548776662) % 1) - 0.5) * 0.9;
    this.cometDir.set(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)).normalize();
    this.cometFrom = this.time;
    this.cometFor = seconds;
  }

  /** If a comet is in the sky, hang it over this place, high in the north: a comet's path is not worked out, only that it is there. */
  cometOver(lon: number, lat: number): void {
    const cl = Math.cos(lat);
    const up = tmpA.set(cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon));
    const north = tmpB.set(0, 1, 0).addScaledVector(up, -up.y).normalize();
    this.cometDir.copy(up).multiplyScalar(0.9).addScaledVector(north, 0.44).normalize();
  }

  /** What is in the sky just now, for the labels of the night-sky view: where the moon and any comet are, and how much of the moon is lit. */
  skyFacts(): { moon: [number, number, number] | null; moonLit: number; comet: [number, number, number] | null; ring: boolean; sun: [number, number, number] } {
    const sun = uSunDir.value as Vector3, m = this.moon.position;
    const md = tmpA.copy(m).normalize();
    // seen from the planet, the moon is full when it is opposite the sun
    const lit = (1 - md.dot(sun)) / 2;
    const comet = this.cometMesh?.visible ? ([this.cometDir.x * COMET_AT, this.cometDir.y * COMET_AT, this.cometDir.z * COMET_AT] as [number, number, number]) : null;
    return { moon: this.moon.visible ? [m.x, m.y, m.z] : null, moonLit: lit, comet, ring: !!this.ringMesh?.visible, sun: [sun.x, sun.y, sun.z] };
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

  /** The preset the planet was built with: texture sizes and buffer sizes are fixed from then on. */
  builtWith: Preset = 'high';

  /** Sizes that are fixed when the planet is built. Call before setGrid. */
  presetForBuild(name: Preset): void {
    const p = PRESETS[name];
    this.builtWith = name;
    this.dataSize = p.dataSize; this.erosionSize = p.erosionSize; this.erosionIterations = p.erosionIterations;
    this.oceanResolution = p.oceanResolution; this.cloudNoiseSize = p.cloudNoise; this.cloudLightSteps = p.cloudLight;
    this.shadowSteps = p.shadowSteps; this.riverSize = p.lineSize;
    this.imposterTile = p.imposter;
    this.plantBudget = p.plants; this.plantModels = p.models; this.grassBudget = p.grass; this.creatureBudget = p.creatures; this.rainDrops = p.rain;
  }

  /**
   * Everything that can change while running: march steps, level of detail, how many plants and animals, post effects.
   * cut 0..1 scales the counts down further when the frame rate sags; march 0..1 does the same for the cloud and
   * aurora ray-march steps (never below what still reads as cloud).
   */
  presetLive(name: Preset, cut = 1, post = true, march = 1): void {
    const p = PRESETS[name];
    if (this.clouds) { this.clouds.steps.value = Math.max(Math.min(p.cloudSteps, 8), Math.round(p.cloudSteps * march)); this.clouds.detail.value = p.cloudDetail; this.clouds.scale = p.cloudScale; }
    if (this.aurora) this.aurora.steps.value = Math.max(Math.min(p.auroraSteps, 10), Math.round(p.auroraSteps * march));
    if (this.terrain) this.terrain.maxLevel = p.maxLevel;
    if (this.ocean) { this.ocean.maxLevel = p.maxLevel; this.ocean.fftEvery = p.fftEvery; }
    // Far trees are flat pictures; real models take over inside this distance. On a sharp display the pictures were
    // magnified several times at mid distance and read as pixel art, so better presets bake them larger and hand
    // over to models from further out.
    if (this.vegetation) this.vegetation.uLod.value = p.lod;
    if (this.vegetation) { this.vegetation.maxInstances = Math.round(p.plants * cut); this.vegetation.modelBudget = Math.round(p.models * cut); this.vegetation.grassBudget = Math.round(p.grass * cut); }
    if (this.creatures) this.creatures.budget = Math.round(p.creatures * cut);
    if (post) this.post.set({ taa: p.taa, ao: p.ao, bloom: p.bloom, fringe: p.fringe });
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
    setGroundRivers(this.riverMap);
    this.ocean = new OceanSurface(this.data, this.clouds.shadow, this.erosion.texture, this.oceanResolution, seedHash(`ocean:${seed}`), this.civ);
    this.terrain = new TerrainSurface(this.data, this.erosion, this.riverMap, 32, 1200, this.shadowSteps, { node: this.ocean.causticNode, tile: this.ocean.causticTile }, this.civ);
    this.scene.add(this.terrain.sphere.mesh);
    this.planet.mesh.visible = false;
    this.scene.add(this.planet.mesh, this.ocean.sphere.mesh, this.clouds.mesh);
    this.vegetation = new Flora(grid, this.data, this.erosion.texture, this.clouds.shadow, this.plantBudget, this.plantModels, this.grassBudget, this.imposterTile);
    this.vegetation.pigmentA = this.look.pigmentA;
    this.vegetation.pigmentB = this.look.pigmentB;
    for (const m of this.vegetation.meshes) this.scene.add(m);
    void this.loadPlantModels();
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
    // a comet: a small bright head and a long faint tail, far out, lit only by itself
    {
      const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
      const u = uv().x, v = uv().y.sub(0.5);
      const dx = u.sub(0.08).mul(5);
      const head = exp(dx.mul(dx).add(v.mul(v)).mul(-260));
      const along = u.sub(0.08).div(0.92).max(0);
      const wide = along.mul(0.3).add(0.035);
      const tail = exp(v.div(wide).mul(v.div(wide)).negate()).mul(float(1).sub(along).pow(2)).mul(0.5).mul(smoothstep(0.06, 0.1, u));
      mat.colorNode = vec3(0.78, 0.92, 1.0).mul(head.mul(6).add(tail).mul(this.uComet));
      mat.opacityNode = head.add(tail).min(1).mul(this.uComet);
      // (it hangs just beyond the moon: the far edge of what is drawn is set a little past the moon's path)
      this.cometMesh = new Mesh(new PlaneGeometry(1.9, 0.38).translate(0.95 - 0.152, 0, 0), mat);
      this.cometMesh.visible = false;
      this.cometMesh.frustumCulled = false;
      this.cometMesh.renderOrder = 3;
      this.cometMesh.matrixAutoUpdate = false;
      this.scene.add(this.cometMesh);
    }
    // monoliths, and bones of the dead
    const dark = new MeshBasicNodeMaterial();
    dark.colorNode = vec3(0.012, 0.012, 0.016);
    this.monolithMesh = new InstancedMesh(new BoxGeometry(0.004, 0.011, 0.0013).translate(0, 0.0055, 0), dark, 16);
    this.monolithMesh.count = 0;
    const boneMat = new MeshBasicNodeMaterial();
    // bones: lit like anything else on the ground, but in the fossil view they shine through the darkened rock
    boneMat.colorNode = vec3(0.86, 0.82, 0.7).mul(dot(normalize(positionWorld), uSunDir).mul(0.5).add(0.6).max(float(0.12))).add(vec3(1.3, 1.15, 0.8).mul(uFossil));
    const rib = buildRibcage();
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
    this.towns = new Towns(grid, this.data, this.erosion.texture, this.clouds.shadow, this.buildingBudget);
    this.towns.ground = this.ground;
    this.towns.species = this.speciesMap;
    for (const m of this.towns.meshes) this.scene.add(m);
    this.tornadoes = new Tornadoes(this.data, this.erosion.texture);
    this.scene.add(this.tornadoes.mesh);
    this.caves = new Caves(grid, this.data, this.erosion.texture);
    this.scene.add(this.caves.mesh);
    this.weather = new Precipitation(this.rainDrops);
    this.scene.add(this.weather.mesh);
    this.aurora = new AuroraVolume(this.clouds.noise);
    this.scene.add(this.aurora.mesh);
    this.creatures = new CreatureLayer(grid, this.creatureBudget, this.ground!, this.data, this.erosion.texture, this.clouds.shadow);
    this.creatures.onMesh = (m) => this.scene.add(m);
    this.creatures.onStep = (pos, kind, size) => this.particles?.puff(pos, kind, size);
    this.creatures.onArc = (pos, size) => this.particles?.arc(pos, size);
    void hashSeed(seed);
  }

  applyCells(cells: CellSnapshot, first = false): void {
    if (!this.planet || !this.ocean || !this.clouds) return;
    this.lastCells = cells;
    this.data?.update(cells, this.plantsForBake, first);
    this.ground?.setCells(cells.elevation, cells.seaLevel);
    this.riverMap?.update(cells, performance.now(), first);
    this.towns?.setCells(cells);
    this.caves?.setCells(cells);
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
    const nb = this.grid?.neighbors, nc = this.grid?.ncount;
    for (let j = 0; j <= 4; j++) {
      for (let i = 0; i <= 4; i++) {
        faceDirection(face, (x0 + (size * i) / 4) * 2 - 1, (y0 + (size * j) / 4) * 2 - 1, d);
        this.seaCell = g.cellAt(d[0], d[1], d[2], this.seaCell);
        if (el[this.seaCell]! < limit) return true;
        // The drawn ground is blended between cells, so inside a high cell it can still dip under the sea toward a
        // low neighbour. A patch is dropped only where the neighbours are high too: without this, the sea was missing
        // in square pieces beside small islands, showing the bare sea bed with straight edges.
        if (nb && nc) for (let k = 0; k < nc[this.seaCell]!; k++) if (el[nb[this.seaCell * 6 + k]!]! < limit) return true;
      }
    }
    return false;
  };

  private speciesMap = new Map<number, SpeciesInfo>();
  /** Called when the list of nations was rebuilt. */
  onNations?: (nations: Nation[]) => void;
  /** Species whose nests copy the ruins they live among (E87). */
  setMimics(ids: number[]): void { if (this.creatures) this.creatures.mimics = ids; }
  setSettlements(list: SettlementInfo[], known?: NationInfo[]): void {
    this.civ?.setSettlements(list, known);
    this.vegetation?.setTowns(list);
  }
  /** Replay one town's growth from its first huts to what it is now (system E11). */
  timelapse(id: number, seconds = 16): void {
    this.towns?.timelapse(id, seconds);
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
    // a label appears only once its place is well clear of the limb: right at the edge of the disc the ground is seen
    // edge-on and names hung over the rim of the planet for places that could not be made out
    const vis = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 ? Math.max(0, Math.min(1, (facing - 1 / camR - 0.1) * 6)) : 0;
    return [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, vis];
  }
  /** Where a point far out in the sky falls on screen, and whether it can be seen (in view, and not behind the planet). */
  projectSky(x: number, y: number, z: number): [number, number, number] {
    const cam = this.cam.camera, c = cam.position;
    const p = this.projTmp.set(x, y, z).project(cam);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // behind the planet if the straight line to it passes through the globe
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const t = Math.max(0, Math.min(1, -(c.x * dx + c.y * dy + c.z * dz) / (dx * dx + dy * dy + dz * dz)));
    const near = Math.hypot(c.x + dx * t, c.y + dy * t, c.z + dz * t);
    // (standing on the ground the line starts at the surface itself: only a line that dips well into the globe is blocked)
    // (in front of the eye is asked of the camera itself: the far edge of the picture is nearer than the stars are)
    const ahead = dx * -cam.matrixWorld.elements[8]! + dy * -cam.matrixWorld.elements[9]! + dz * -cam.matrixWorld.elements[10]! > 0;
    const vis = ahead && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && (t <= 0 || near > 0.985) ? 1 : 0;
    return [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, vis];
  }
  /** The planet's disc on screen: centre x, y and radius in pixels (larger than the screen from close in). */
  discOnScreen(): [number, number, number] {
    const cam = this.cam.camera;
    const camR = cam.position.length();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const c = this.projTmp.set(0, 0, 0).project(cam);
    const half = Math.tan((cam.fov * Math.PI) / 360);
    const r = camR > 1.0001 ? ((h / 2) * (1 / Math.sqrt(camR * camR - 1))) / half : 1e9;
    return [(c.x * 0.5 + 0.5) * w, (-c.y * 0.5 + 0.5) * h, r];
  }
  setNightMap(on: boolean): void {
    uNightMap.value = on ? 1 : 0;
  }

  setSpecies(species: Map<number, SpeciesInfo>): void {
    this.speciesMap = species;
    if (this.towns) this.towns.species = species;
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
    uOverlay.value = this.overlayOn || this.layerOn ? 1 : 0;
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
    uFossil.value = show ? 1 : 0;
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

  /** Funnels under storm cells that sit over land near the camera. */
  private updateTornadoes(): void {
    const t = this.tornadoes, cells = this.lastCells, grid = this.grid;
    if (!t || !cells || !grid) return;
    const list: Twister[] = [];
    if (this.cam.dist < 0.5) {
      const f = this.cam.focusDir(this.tmpFocus);
      for (const s of this.stormCells) {
        if (list.length >= 6 || cells.elevation[s]! <= cells.seaLevel + 0.02 || cells.elevation[s]! > cells.seaLevel + 2.5) continue;
        const x = grid.pos[s * 3]!, y = grid.pos[s * 3 + 1]!, z = grid.pos[s * 3 + 2]!;
        if (x * f.x + y * f.y + z * f.z < 0.93) continue;
        // not every storm spins one up, and they come and go
        const phase = Math.sin(this.time * 0.05 + s * 1.7);
        if (((s * 2654435761) >>> 0) % 3 !== 0 || phase < -0.2) continue;
        list.push({ dir: [x, y, z], fire: cells.lava[s]! > 0.3, seed: (s % 97) / 97 });
      }
    }
    t.set(list);
  }

  /**
   * What can be heard around the camera and from which side: the nearest sea, the heaviest cloud and any molten rock,
   * each as a loudness 0..1 and a place from -1 (left of the view) to 1 (right).
   */
  soundscape(): { surf: number; surfPan: number; rain: number; rainPan: number; lava: number; lavaPan: number } {
    const out = { surf: 0, surfPan: 0, rain: 0, rainPan: 0, lava: 0, lavaPan: 0 };
    const cells = this.lastCells, grid = this.grid;
    if (!cells || !grid || this.cam.dist > 0.6) return out;
    const f = this.cam.focusDir(this.tmpFocus);
    const cam = this.cam.camera;
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements;
    const rx = e[0]!, ry = e[1]!, rz = e[2]!;
    const reach = Math.min(0.25, 0.03 + this.cam.dist * 0.6);
    const cosR = Math.cos(reach);
    let seaL = 0, seaR = 0, rainL = 0, rainR = 0, lavaL = 0, lavaR = 0, n = 0;
    const { pos, count } = grid;
    // a sparse sample of the cells around the view is plenty for sound
    for (let i = (this.soundPhase++ % 5); i < count; i += 5) {
      const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
      const d = x * f.x + y * f.y + z * f.z;
      if (d < cosR) continue;
      n++;
      const side = (x - f.x) * rx + (y - f.y) * ry + (z - f.z) * rz;
      const near = (d - cosR) / (1 - cosR);
      const right = side > 0 ? near : 0, left = side > 0 ? 0 : near;
      if (cells.elevation[i]! <= cells.seaLevel) { seaL += left; seaR += right; }
      const wet = Math.max(0, cells.cloud[i]! - 0.75) * 4;
      rainL += left * wet; rainR += right * wet;
      const hot = cells.lava[i]!;
      if (hot > 0.2) { lavaL += left * hot; lavaR += right * hot; }
    }
    if (!n) return out;
    const closeness = Math.max(0, 1 - this.cam.dist / 0.5);
    const pan = (l: number, r: number) => (l + r > 1e-6 ? (r - l) / (l + r) : 0);
    out.surf = Math.min(1, ((seaL + seaR) / n) * 2.2) * closeness; out.surfPan = pan(seaL, seaR);
    out.rain = Math.min(1, ((rainL + rainR) / n) * 2.5) * closeness; out.rainPan = pan(rainL, rainR);
    out.lava = Math.min(1, (lavaL + lavaR) * 0.6) * closeness; out.lavaPan = pan(lavaL, lavaR);
    return out;
  }
  private soundPhase = 0;

  /** Paint a per-cell layer (0..1) over the planet with a dark-to-bright ramp: used for the diversity and oxygen overlays. */
  setLayerOverlay(values: Float32Array | null, tint: [number, number, number] = [0.2, 1, 0.6]): void {
    this.layerOn = !!values;
    if (!values || !this.data) { if (!this.overlayOn) uOverlay.value = 0; return; }
    const n = values.length;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(1, values[i]!));
      // deep blue through the tint to pale yellow: readable without relying on red against green
      const a = Math.min(1, v * 2), b = Math.max(0, v * 2 - 1);
      colors[i * 3] = (0.02 + (tint[0] - 0.02) * a) * (1 - b) + 1.0 * b;
      colors[i * 3 + 1] = (0.04 + (tint[1] - 0.04) * a) * (1 - b) + 0.95 * b;
      colors[i * 3 + 2] = (0.18 + (tint[2] - 0.18) * a) * (1 - b) + 0.55 * b;
    }
    this.data.setOverlay(colors);
    uOverlay.value = 1;
  }
  private layerOn = false;

  /** A ship leaves the planet from this cell: a light that climbs away and does not come back. */
  launchAt(cell: number): void {
    if (!this.grid) return;
    const g = this.grid.pos;
    this.particles?.launch(new Vector3(g[cell * 3]!, g[cell * 3 + 1]!, g[cell * 3 + 2]!));
  }

  /** A mass hatching lights the sea around this cell. */
  hatchAt(cell: number): void {
    if (!this.grid) return;
    const g = this.grid.pos;
    (uHatch.value as Vector4).set(g[cell * 3]!, g[cell * 3 + 1]!, g[cell * 3 + 2]!, 0);
  }

  /** The fungal network view: the ground darkens and the threads between the great fungi glow. */
  setFungalView(on: boolean, plants: Map<number, PlantInfo>): void {
    uFungal.value = on ? 1 : 0;
    this.fungalOn = on;
    const cells = this.lastCells;
    if (!on || !cells || !this.data) return;
    const n = cells.elevation.length;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const g = plants.get(cells.flora[i]!)?.genes;
      // glowing, water-loving plants are the fungi; their threads run wherever they grow
      const f = g && g[PG.Glow]! > 0.5 ? Math.min(1, cells.vegetation[i]! * (0.5 + g[PG.WaterNeed]!)) : cells.vegetation[i]! * 0.12;
      colors[i * 3 + 1] = f * f;
    }
    this.data.setOverlay(colors);
  }
  private fungalOn = false;

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
    if (!cells || !grid || this.cam.dist > 0.09 || uUnderwater.value > 0.5) { wx.set(0, false, 0, 0, 0); uFog.value *= 0.95; uRainbow.value *= 0.95; uShimmer.value *= 0.9; return; }
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
    // what the air is doing here: mist on damp ground when the star is low, a rainbow when rain falls in sunshine, shimmer over hot ground
    const sun = uSunDir.value as Vector3;
    const sunUp = x * sun.x + y * sun.y + z * sun.z;
    const low = Math.max(0, 1 - Math.max(0, cells.elevation[c]! - cells.seaLevel) / 1.2);
    const mist = Math.max(0, cells.moisture[c]! - 0.45) * 2 * low * Math.max(0, 1 - Math.abs(sunUp - 0.08) / 0.3) * (cells.temperature[c]! < 22 ? 1 : 0.4);
    uFog.value += (Math.min(1, mist) - uFog.value) * 0.02;
    const bow = wx.amount.value > 0.08 && sunUp > 0.03 && sunUp < 0.68 ? Math.min(1, wx.amount.value * 1.6) * (1 - Math.max(0, cells.cloud[c]! - 0.85) * 5) : 0;
    uRainbow.value += (Math.max(0, bow) - uRainbow.value) * 0.03;
    const hot = this.cam.dist < 0.05 && sunUp > 0.2 ? Math.max(0, Math.min(1, (cells.temperature[c]! - 31) / 10)) : 0;
    uShimmer.value += (hot - uShimmer.value) * 0.05;
  }
  private weatherCell = 0;

  /** Brief white flash (impacts). */
  flash(amount: number): void {
    this.flashLevel = Math.max(this.flashLevel, amount);
  }

  /** Everything the picture is drawn from, for a bug report (Shift+D in the page saves it as a file). */
  diagnose(): Record<string, unknown> {
    const r = this.renderer as unknown as { backend: { isWebGPUBackend?: boolean }; info: { render: object; memory: object }; getPixelRatio(): number };
    const c = this.cam;
    return {
      when: new Date().toISOString(),
      backend: r.backend.isWebGPUBackend ? 'webgpu' : 'webgl2',
      preset: this.builtWith,
      pixelRatio: r.getPixelRatio(),
      canvas: [this.canvas.width, this.canvas.height],
      fps: this.fpsAvg,
      render: r.info.render,
      memory: r.info.memory,
      camera: { lon: c.lon, lat: c.lat, dist: c.dist, position: c.camera.position.toArray() },
      scene: { time: this.time, dayAngle: this.dayAngle, declination: this.declination, moons: this.moons, solar: this.solar, underwater: this.underwater, following: this.following, overlayOn: this.overlayOn, layerOn: this.layerOn, fungalOn: this.fungalOn, showFossils: this.showFossils },
      exposure: { value: this.post.autoExposure, measured: this.post.measured },
      uniforms: dumpUniforms(),
      cells: summariseCells(this.lastCells),
    };
  }

  cellAt(x: number, y: number, z: number): number {
    if (!this.grid) return 0;
    this.lastCell = nearestCell(this.grid, x, y, z, this.lastCell);
    return this.lastCell;
  }

  private simYearSeen = 0;
  private simYearShown = 0;
  private yearsPerSecond = 0;

  /** How a town's builders build and of what, in a sentence (system E13). */
  architecture(st: SettlementInfo): string {
    const a = this.towns?.architecture(st);
    return a ? describeArchitecture(a.arch, a.material as Material) : '';
  }

  /** What is being built in a town just now, if it has been drawn from close by lately (system E12). */
  construction(id: number): { what: string; progress: number; years: number; stage: string }[] {
    return this.towns?.sites.get(id) ?? [];
  }

  applyStats(stats: WorldStats): void {
    this.tilt = stats.tilt;
    this.simYearSeen = stats.simYear; this.yearsPerSecond = stats.yearsPerSecond;
    // seasons are only shown when a year lasts long enough to see them
    if (stats.yearsPerSecond > 0 && stats.yearsPerSecond <= 1.01) {
      this.declination = stats.tilt * Math.sin(stats.yearFrac * Math.PI * 2);
    }
    this.eraWarmth = Math.max(-1, Math.min(1, (stats.meanTemp - 14.5) / 7));
    this.eraHazeTarget = stats.era === 'winter' ? 1 : 0;
    this.stormCells = stats.storms;
    this.solar = stats.solar ?? 1;
    // the magnetic pole: steady at one end of the world, and wandering across it while the field turns over (E82)
    {
      const sign = stats.poleSign ?? 1, t = stats.poleFlip ?? 0;
      const a = t * Math.PI, w = this.time * 0.05;
      (uMagneticPole.value as Vector3).set(0.14 * sign * Math.cos(a) + Math.sin(a) * Math.cos(w), 0.985 * sign * Math.cos(a), 0.1 * sign * Math.cos(a) + Math.sin(a) * Math.sin(w)).normalize();
    }
    // the star in old age: larger in the sky and redder, and its light with it
    const swell = stats.starSwell ?? 1;
    if (swell !== this.starSwell) {
      if (!this.starBase) this.starBase = { size: uLook.starSize.value as number, color: (uLook.star.value as Vector3).clone() };
      this.starSwell = swell;
      const old = Math.min(1, (swell - 1) / 6);
      uLook.starSize.value = this.starBase.size * Math.min(9, swell);
      (uLook.star.value as Vector3).copy(this.starBase.color).lerp(this.starTmp.set(1.0, 0.36, 0.14).multiplyScalar(Math.max(this.starBase.color.x, this.starBase.color.y, this.starBase.color.z)), old * 0.8);
    }
    this.satellites?.set(stats.maxTech >= 0.9 && stats.settlements > 0 ? Math.min(1, (stats.maxTech - 0.9) * 12 + 0.3) : 0);
    if (this.clouds && this.grid) { const g = this.grid; this.clouds.setCyclones((stats.cyclones ?? []).slice(0, 4).map((c) => [g.pos[c * 3]!, g.pos[c * 3 + 1]!, g.pos[c * 3 + 2]!])); }
    this.moons = stats.moons;
    this.moon.visible = stats.moons >= 1 && this.moon.visible;
    if (stats.moons === 0) this.moon.visible = false;
    if (this.moon2) this.moon2.visible = stats.moons >= 2;
    if (this.ringMesh) this.ringMesh.visible = stats.ring;
    // a people's works in orbit (E71): a tether standing on the equator, then a ring round the world
    {
      const level = stats.orbitalRing ?? 0;
      if (level > 0 && !this.tether) {
        const glow = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
        glow.colorNode = vec3(0.9, 0.95, 1.0).mul(0.9);
        this.tether = new Mesh(new CylinderGeometry(0.0011, 0.0011, 0.22, 6), glow);
        this.orbitalRing = new Mesh(new TorusGeometry(1.22, 0.0016, 6, 320), glow);
        this.orbitalRing.rotation.x = Math.PI / 2;
        this.tether.renderOrder = 5; this.orbitalRing.renderOrder = 5;
        this.scene.add(this.tether, this.orbitalRing);
      }
      if (this.tether && this.orbitalRing) {
        const lon = stats.tetherLon ?? 0;
        this.tether.visible = level > 0;
        this.tether.position.set(Math.cos(lon) * 1.11, 0, Math.sin(lon) * 1.11);
        this.tether.quaternion.setFromUnitVectors(this.starTmp.set(0, 1, 0), new Vector3(Math.cos(lon), 0, Math.sin(lon)));
        this.orbitalRing.visible = level > 1;
      }
    }
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
    // the comet: far out in one part of the sky, its tail streaming away from the sun
    if (this.cometMesh) {
      const age = this.time - this.cometFrom;
      const on = age >= 0 && age < this.cometFor;
      this.cometMesh.visible = on;
      if (on) {
        this.uComet.value = Math.min(1, age / 3, (this.cometFor - age) / 8);
        const d = this.cometDir, sun = uSunDir.value as Vector3;
        const tail = tmpA.copy(d).sub(sun).addScaledVector(d, -tmpA.copy(d).sub(sun).dot(d));
        if (tail.lengthSq() < 1e-6) tail.set(0, 1, 0).addScaledVector(d, -d.y);
        tail.normalize();
        const side = tmpB.crossVectors(d, tail).normalize();
        this.cometMesh.matrix.makeBasis(tail, side, tmpC.copy(d).negate());
        this.cometMesh.matrix.setPosition(d.x * COMET_AT, d.y * COMET_AT, d.z * COMET_AT);
        this.cometMesh.matrixWorldNeedsUpdate = true;
      }
    }
    const mi = 0.09;
    const md = (uMoonDir.value as Vector3).set(Math.cos(this.moonAngle), Math.sin(mi) * Math.sin(this.moonAngle), Math.sin(this.moonAngle)).normalize();
    this.moon.position.copy(md).multiplyScalar(this.moonDistance);
    (uMoonBody.value as Vector4).set(this.moon.position.x, this.moon.position.y, this.moon.position.z, this.moon.visible ? MOON_RADIUS * this.moon.scale.x : 0);
    if (this.creatures) { const mb = this.creatures.moonBody; mb.x = this.moon.position.x; mb.y = this.moon.position.y; mb.z = this.moon.position.z; mb.w = this.moon.visible ? MOON_RADIUS * this.moon.scale.x : 0; }
    (uMoonBody2.value as Vector4).w = 0;
    this.moon.rotation.y = -this.moonAngle;
    if (this.moon2?.visible) {
      const a2 = this.moonAngle * 2.3 + 1;
      this.moon2.position.set(Math.cos(a2) * 3.4, Math.sin(0.4) * Math.sin(a2) * 3.4, Math.sin(a2) * 3.4 * Math.cos(0.4));
      (uMoonBody2.value as Vector4).set(this.moon2.position.x, this.moon2.position.y, this.moon2.position.z, MOON_RADIUS * 0.45);
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
      // (only from close by: from further off these were big bright hoops hanging in the sky)
      if (this.particles && this.cam.dist < 0.03 && Math.random() < dt * 1.5) for (const e of this.creatures.echoers(1)) this.particles.ripple(e.pos, e.size * 3);
      // depth of field while following a creature
      this.post.setFocus(this.following !== null, this.cam.dist);
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
    this.cam.lookUp = uUnderwater.value;
    if (uUnderwater.value > 0 && this.look) {
      // the water's colour: bright and green-blue just under a sunlit surface, dark and blue further down and at night
      const down = 0.3 + 0.7 * Math.max(0, Math.min(1, (1 + uSeaKm.value * EXAG - camR) / 0.004));
      const up = this.cam.camera.position.clone().normalize();
      const day = Math.max(0, Math.min(1, (up.dot(uSunDir.value as Vector3) + 0.1) / 0.4));
      const a = this.look.oceanShallow, b = this.look.oceanDeep, light = (0.06 + 0.94 * day) * (1 - 0.6 * down) * 0.42;
      (uWaterFog.value as Vector4).set((a[0] + (b[0] - a[0]) * down) * light, (a[1] + (b[1] - a[1]) * down) * light, (a[2] + (b[2] - a[2]) * down) * light, 120);
    }
    if (this.vegetation) this.vegetation.autumn = this.tilt > 0 ? this.declination / this.tilt : 0;
    // the erosion bake runs a few iterations a frame until it is done, then the terrain keeps its result
    if (this.erosion && !this.erosion.finished) this.erosion.step(this.renderer, this.erosionPerFrame);
    else if (this.erosion && this.ground) void this.ground.readDetail(this.renderer, this.erosion);
    if (this.civ?.update(this.lastCells, this.speciesMap, performance.now(), dt)) { this.onNations?.(this.civ.nations); this.towns?.setTowns(this.civ.towns, this.civ.nations, this.civ.lanes); }
    // the date, carried forward between the simulation's reports so that work on a building site advances smoothly
    // (never more than a fraction of a second of sim time ahead of or behind the last report, however slow the frames)
    this.simYearShown = Math.max(this.simYearSeen - this.yearsPerSecond * 0.3, Math.min(this.simYearSeen + this.yearsPerSecond * 0.2, this.simYearShown + this.yearsPerSecond * dt));
    this.towns?.update(this.cam.focusDir(this.tmpFocus), this.cam.dist, this.time, this.simYearShown, this.yearsPerSecond);
    this.updateTornadoes();
    this.caves?.update(this.cam.focusDir(this.tmpFocus), this.cam.dist);
    // bones are too small to matter from orbit, except in the fossil view
    if (this.boneMesh) this.boneMesh.visible = this.showFossils || this.cam.dist < 0.25;
    const hatch = uHatch.value as Vector4;
    if (hatch.w >= 0) { hatch.w += dt; if (hatch.w > 90) hatch.w = -1; }
    const imp = uImpact.value as Vector4;
    if (imp.w >= 0) { imp.w += dt; if (imp.w > 240) imp.w = -1; }
    if ((this.plumeTimer -= dt) <= 0) { this.plumeTimer = 1.5; this.updatePlumes(); }
    this.updateWeather();
    this.aurora?.setCameraRadius(this.cam.camera.position.length(), CLOUD_TOP);
    // the aurora breathes with the star's activity, and needs air to glow in
    // mostly quiet, now and then a strong display; storms on the star make it much stronger
    uAurora.value = Math.max(0.08, 0.38 + 0.3 * Math.sin(this.time * 0.037) + 0.22 * Math.sin(this.time * 0.011 + 1.3)) * this.solar * uAtmo.value;
    // The aurora shows only on the night side. Seen from well out over the day side there is none in view, and it
    // cost 2.3 ms a frame there for nothing (measured on a real GPU): it is not drawn at all then, nor when there is
    // no air for it to glow in.
    if (this.aurora) {
      const cam = this.cam.camera.position;
      const overDay = cam.dot(uSunDir.value as Vector3) / Math.max(1e-6, cam.length());
      this.aurora.mesh.visible = uAurora.value > 0.001 && !(overDay > 0.5 && this.cam.dist > 0.5);
    }
    this.terrain?.update(this.cam.camera.position);
    this.ocean?.update(this.renderer, this.cam.camera.position, this.time, this.keepSeaPatch);
    this.vegetation?.update(this.cam.focusDir(this.tmpFocus), this.cam.dist, this.cam.camera.position, this.renderer);
    const c = this.cam.camera;
    const far = c.position.length() + this.moonDistance + 4;
    c.far = far;
    c.updateProjectionMatrix();
    this.sky.position.copy(c.position);
    this.sky.scale.setScalar((far * 0.9) / 400);
    guardUniforms();
    // (Raised a little from orbit after a GPU check found the night side so dark that land could hardly be told
    // from sea. The cap only matters in dark scenes: a daylit view never asks for this much.)
    this.post.maxExposure = 2.1 + 1.5 * Math.max(0, Math.min(1, (1.2 - this.cam.dist) / 1.0));
    if (this.clouds) this.clouds.jitter.value = this.post.temporal ? 1 : 0.3;
    this.clouds?.render(this.renderer, this.cam.camera);
    this.post.render(dt);
    if (dt > 0) this.fpsAvg += (1 / dt - this.fpsAvg) * 0.05;
  }
}
