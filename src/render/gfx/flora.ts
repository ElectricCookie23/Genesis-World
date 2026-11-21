// Plants around the camera. Near plants are real branching models with cut-out leaves that let
// light through and move in the wind; further out the same models are drawn as imposters (pictures
// of them baked from three angles at load); underfoot there is a dense ring of grass and ground
// plants. Which form grows where comes from the genes of the local plant species.
import {
  BufferGeometry, Color, DataTexture, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, LinearFilter, Mesh, MeshBasicNodeMaterial,
  OrthographicCamera, PlaneGeometry, Quaternion, RGBAFormat, RenderTarget, Scene, UnsignedByteType, Vector3, type InterleavedBufferAttribute, type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  abs, atan, attribute, cameraPosition, cos, cross, dot, float, fract, length, max, mix, normalGeometry, normalize, positionGeometry, positionWorld, pow,
  screenCoordinate, select, sin, smoothstep, step, texture, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import type { Grid } from '../../sim/world';
import type { CellSnapshot, PlantInfo, SettlementInfo } from '../../shared/protocol';
import { PG } from '../../sim/genetics';
import { EXAG, uDitherFrame, uMoonDir, uSunDir, uTime } from '../common';
import { faceDirection } from './cubebake';
import { Pass, makeTarget } from './gpu';
import { uLook } from './look';
import type { PlanetData } from './planetdata';
import { Copies } from './packed';
import { FORMS, PART, addPlantInstanceData, buildPlant, plantFromModel, type Form } from './plantmesh';
import type { Model } from './models';
import { groundRadiusNode } from './terrain';
import { eclipseLight } from './eclipse';
import { settlementSize } from './nations';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Default side of one imposter picture, in texels; presets ask for more or less. */
const DEFAULT_TILE = 192;
const VIEWS = 3;
/** Half-width of the square the imposter camera sees, in model units; models are about one unit tall. */
const BAKE_HALF = 0.78;
const BAKE_CENTRE = 0.6;

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const is = (part: N, k: number): N => step(abs(part.sub(k)), 0.5);

/** Cut-out shapes for the flat cards: a rosette of leaves, rows of needles, a feathered frond, a petal. 1 for solid parts. */
function cutout(card: N): N {
  const u: N = card.x, v: N = card.y, part: N = card.z;
  const c = vec2(u, v).sub(0.5);
  const r = length(c), th = atan(c.y, c.x);
  const leaf = step(r, pow(abs(cos(th.mul(3.5).add(0.6))), 0.7).mul(0.34).add(0.16));
  const ax = abs(u.sub(0.5));
  const needle = max(step(abs(fract(v.mul(9).add(ax.mul(3.2))).sub(0.5)), float(0.3).sub(ax.mul(0.2))).mul(step(ax, float(0.5).sub(v.mul(0.27)))), step(ax, 0.045));
  const env = pow(sin(v.mul(1.02).clamp(0, 1).mul(Math.PI)).max(0), 0.55).mul(0.5);
  const frond = max(step(ax, env).mul(step(0.32, fract(v.mul(13).sub(ax.mul(2.6))))), step(ax, 0.04));
  const petal = step(ax.mul(2), pow(sin(v.clamp(0, 1).mul(Math.PI)).max(0), 0.7));
  const solid = float(1).sub(is(part, PART.leaf)).sub(is(part, PART.needle)).sub(is(part, PART.frond)).sub(is(part, PART.petal));
  return solid.add(is(part, PART.leaf).mul(leaf)).add(is(part, PART.needle).mul(needle)).add(is(part, PART.frond).mul(frond)).add(is(part, PART.petal).mul(petal));
}

/** Light on a plant surface: star, sky, moon, plus light shining through thin leaves from behind. */
function plantLight(albedo: N, Nrm: N, P: N, thin: N, ao: N, shadow: N): N {
  const up = normalize(P);
  const L: N = uSunDir, M: N = uMoonDir;
  const sunH = dot(up, L);
  const day = smoothstep(-0.12, 0.22, sunH);
  const sunColor: N = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.05, 0.4, sunH));
  const sunVis = smoothstep(-0.08, 0.1, sunH).mul(shadow).mul(eclipseLight(P));
  const V: N = normalize(cameraPosition.sub(P));
  // leaves are lit from both sides; solid parts only from the front
  const ndl = dot(Nrm, L);
  const front = mix(max(ndl, 0), abs(ndl).mul(0.75).add(0.25), thin);
  const through = pow(max(dot(V, L.negate()), 0), 3).mul(max(ndl.negate().mul(0.5).add(0.5), 0)).mul(thin);
  const sky: N = mix(vec3(uLook.sky), vec3(0.6, 0.6, 0.6), 0.45).mul(0.4).mul(day).mul(dot(Nrm, up).mul(0.35).add(0.65));
  const moonUp = smoothstep(-0.1, 0.25, dot(up, M));
  const moon: N = vec3(uLook.moon).mul(0.05).mul(max(dot(Nrm, M), 0).mul(0.7).add(0.3)).mul(moonUp).mul(float(1).sub(day));
  const fill = vec3(0.012, 0.016, 0.02);
  return albedo.mul(sunColor.mul(front).mul(sunVis).mul(1.15).add(sky.add(moon).add(fill).mul(ao)))
    .add(albedo.mul(mix(vec3(1, 1, 1), albedo.div(max(max(albedo.x, albedo.y), albedo.z).max(0.05)), 0.6)).mul(sunColor).mul(through).mul(sunVis).mul(1.6));
}

const ign = (): N => { const sc: N = screenCoordinate; return sc.x.add(uDitherFrame).mul(0.06711056).add(sc.y.add(uDitherFrame).mul(0.00583715)).fract().mul(52.9829189).fract(); };

interface FullSlot { mesh: Copies; iDir: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; iTint: InterleavedBufferAttribute; iTint2: InterleavedBufferAttribute; cap: number; n: number; }

export class Flora {
  readonly meshes: (Copies | Mesh)[] = [];
  plants = new Map<number, PlantInfo>();
  /** Budget for far plants (imposters). Near models get a fortieth of it, grass a tenth. */
  maxInstances: number;
  pigmentA: [number, number, number] = [0.1, 0.3, 0.1];
  pigmentB: [number, number, number] = [0.3, 0.3, 0.05];
  /** Season signal: sun declination over axial tilt, -1..1 (0 when seasons are not shown). */
  autumn = 0;
  /** Most real models and grass tufts to draw (never more than the buffers built at load). */
  modelBudget = 1e9;
  grassBudget = 1e9;
  /** Camera distance at which real models hand over to imposters. */
  readonly uLod = uniform(0.02);
  /** Radius of the grass ring around the camera. */
  readonly uGrassR = uniform(0.009);
  private full = new Map<Form, FullSlot>();
  private geos = new Map<Form, BufferGeometry>();
  private far!: { mesh: Copies; iDir: InstancedBufferAttribute; iData: InstancedBufferAttribute; iTint: InstancedBufferAttribute; iTint2: InstancedBufferAttribute; cap: number };
  private grass!: { mesh: Copies; iDir: InstancedBufferAttribute; iData: InstancedBufferAttribute; iTint: InstancedBufferAttribute; cap: number };
  private atlasNode: N;
  private baked = false;
  private baking = false;
  /** A model arrived while the atlas was being photographed: photograph it again when that is done. */
  private rebake = false;
  /** Which forms are drawn from a made model, not from the generated one. */
  readonly fromModels = new Set<Form>();
  private cells?: CellSnapshot;
  private lastFocus = new Vector3(9, 9, 9);
  private lastCam = new Vector3(9, 9, 9);
  private lastGrass = new Vector3(9, 9, 9);
  private lastDist = 0;
  private dirty = true;
  private lastBuild = 0;
  private triCentre: Float32Array;
  private grassCell = 0;
  /** Living towns as x, y, z, radius, trees kept: the ground between their buildings is kept clear of plants. */
  private towns = new Float32Array(0);
  /** The towns near the patch being planted, and near the grass, same layout. */
  private townsNear: number[] = [];
  private townsByGrass: number[] = [];

  constructor(private grid: Grid, private data: PlanetData, erosionTex: Texture, private cloudShadow: (p: N) => N, maxInstances: number, fullCap = 1600, grassCap = 6000, private tile = DEFAULT_TILE) {
    this.maxInstances = maxInstances;
    const radius = (dir: N): N => groundRadiusNode(data, erosionTex, dir);
    const rotate = (v: N, q: N): N => v.add(cross(q.xyz, cross(q.xyz, v).add(v.mul(q.w))).mul(2));

    // ---------------- real models
    for (const form of FORMS) {
      const geo = buildPlant(form);
      this.geos.set(form, geo);
      const cap = Math.max(48, Math.floor(fullCap / (form === 'tuft' || form === 'fern' || form === 'shrub' ? 2.5 : 4)));
      const g = geo.clone();
      // per-plant data in one shared buffer (WebGPU allows 8 vertex buffers per draw)
      const { iDir, iQuat, iData, iTint, iTint2 } = addPlantInstanceData(g, cap);
      const material = new MeshBasicNodeMaterial({ side: DoubleSide });
      material.alphaTest = 0.5;
      const aDir: N = attribute('iDir', 'vec3'), aQuat: N = attribute('iQuat', 'vec4'), aData: N = attribute('iData', 'vec4'); // size, glow, wind, seed
      const card: N = attribute('card', 'vec4'), wind: N = attribute('wind', 'vec3');
      const part: N = card.z;
      const thinV = is(part, PART.leaf).add(is(part, PART.needle)).add(is(part, PART.frond)).add(is(part, PART.blade)).add(is(part, PART.petal));
      // wind: the whole plant leans in gusts, boughs sway on their own beat, leaves flutter
      const t = uTime, seed: N = aData.w;
      const gust = sin(t.mul(0.9).add(seed.mul(6.28)).add(dot(aDir, vec3(40, 10, 25)))).mul(0.5).add(0.5);
      const lean = wind.x.mul(gust.mul(0.07).add(0.03)).mul(aData.z);
      const sway = sin(t.mul(2.1).add(wind.y.mul(1.7)).add(seed.mul(10))).mul(wind.z).mul(0.035).mul(aData.z);
      const flutter = (sin as any)(t.mul(7.3).add(wind.y.mul(5.1)).add((positionGeometry as any).x.mul(30))).mul(wind.z).mul(0.012).mul(aData.z).mul(thinV);
      const local: N = (positionGeometry as any).add((vec3 as any)(lean.add(sway), flutter.mul(0.6), sway.mul(0.6).add(flutter))).mul(aData.x);
      const base: N = aDir.mul(radius(aDir));
      material.positionNode = base.add(rotate(local, aQuat));
      const nW: N = varying(normalize(rotate(normalGeometry, aQuat)));
      const vCard: N = varying(card);
      const vTint: N = varying(attribute('iTint', 'vec3')), vTint2: N = varying(attribute('iTint2', 'vec3'));
      const vGlow: N = varying(aData.y);
      const vBase: N = varying(base);
      const vColor: N = varying(attribute('color', 'vec3'));
      const fp: N = vCard.z;
      const fThin = is(fp, PART.leaf).add(is(fp, PART.needle)).add(is(fp, PART.frond)).add(is(fp, PART.blade)).add(is(fp, PART.petal));
      // colour by part
      // each leaf has its own tone (from the model) and a darker line down its middle, like a fold
      const midrib = float(0.86).add(vCard.x.mul(2).sub(1).abs().pow(0.6).mul(0.2));
      const leafCol: N = vTint.mul(mix(float(0.5), float(1.3), smoothstep(0.0, 1.0, vCard.y))).mul(vCard.w.mul(0.45).add(0.6)).mul(vColor).mul(midrib);
      // bark: grooves running up the trunk that wander a little, with faint rings; a plain dark tube read as plastic
      const vAt: N = varying(positionGeometry);
      const grooves = sin(vAt.x.mul(170).add(sin(vAt.y.mul(13)).mul(1.5))).mul(0.5).add(sin(vAt.z.mul(150).add(vAt.y.mul(9))).mul(0.5));
      const barkCol: N = vColor.mul(grooves.mul(0.17).add(0.87)).mul(sin(vCard.y.mul(60)).mul(0.05).add(0.97));
      const capSpots = smoothstep(0.75, 0.9, sin(vCard.x.mul(38)).mul(sin(vCard.y.mul(23))).mul(0.5).add(0.5));
      const capCol: N = mix(vTint, vec3(0.95, 0.92, 0.85), capSpots.mul(0.7));
      // foliage from a made model: the species' own colour over the model's light and dark
      const massCol: N = vTint.mul(vColor).mul(vCard.w.mul(0.5).add(0.6)).mul(mix(float(0.78), float(1.12), smoothstep(0.0, 1.0, vCard.y)));
      const albedo: N = barkCol.mul(is(fp, PART.bark))
        .add(massCol.mul(is(fp, PART.mass)))
        .add(leafCol.mul(fThin.sub(is(fp, PART.petal))))
        .add(vTint2.mul(is(fp, PART.petal).add(is(fp, PART.bulb))))
        .add(capCol.mul(is(fp, PART.cap)))
        .add(vTint.mul(0.85).mul(is(fp, PART.flesh)));
      const P: N = positionWorld;
      const shadow: N = this.cloudShadow(vBase);
      const night = float(1).sub(smoothstep(-0.12, 0.22, dot(normalize(vBase), uSunDir)));
      let color: N = plantLight(albedo, nW, P, fThin.clamp(0, 1), vCard.w, shadow);
      // living light: bulbs always glow a little, and glowing species shine at night
      const pulse = sin(uTime.mul(1.3).add(vBase.x.mul(900))).mul(0.2).add(0.8);
      color = color.add(vTint2.mul(is(fp, PART.bulb)).mul(night.mul(2.4).add(0.35)).mul(pulse))
        .add(albedo.mul(vGlow).mul(night).mul(0.55).mul(fThin.add(is(fp, PART.cap)).add(is(fp, PART.flesh)).clamp(0, 1)));
      material.colorNode = color;
      // hand over to imposters with a dither, so nothing pops
      const dCam = length(cameraPosition.sub(vBase));
      const keep = float(1).sub(smoothstep(this.uLod.mul(0.94), this.uLod.mul(1.06), dCam));
      material.opacityNode = cutout(vCard).mul(step(ign(), keep.add(0.001)));
      const mesh = new Copies(g, material, cap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.full.set(form, { mesh, iDir, iQuat, iData, iTint, iTint2, cap, n: 0 });
    }

    // ---------------- imposters: one draw call for every far plant
    {
      const cap = Math.max(256, maxInstances);
      const g = new PlaneGeometry(1, 1);
      const iDir = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      const iData = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); // size, form index, glow, seed
      const iTint = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      const iTint2 = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      for (const a of [iDir, iData, iTint, iTint2]) a.setUsage(DynamicDrawUsage);
      g.setAttribute('iDir', iDir); g.setAttribute('iData', iData); g.setAttribute('iTint', iTint); g.setAttribute('iTint2', iTint2);
      const blank = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
      blank.needsUpdate = true;
      this.atlasNode = texture(blank);
      const material = new MeshBasicNodeMaterial({ side: DoubleSide });
      material.alphaTest = 0.5;
      const aDir: N = attribute('iDir', 'vec3'), aData: N = attribute('iData', 'vec4');
      const size: N = aData.x;
      const base: N = aDir.mul(radius(aDir));
      const centre: N = base.add(aDir.mul(size.mul(BAKE_CENTRE)));
      const toCam: N = normalize(cameraPosition.sub(centre));
      const e = dot(toCam, aDir);
      const right: N = normalize(cross(aDir, toCam).add(vec3(aDir.z, 0, aDir.x.negate()).mul(1e-3)));
      const upB: N = cross(toCam, right);
      // a little sway of the whole picture in the wind
      const swayB = sin(uTime.mul(1.1).add(aData.w.mul(40))).mul(0.012).mul(positionGeometry.y.add(0.5));
      material.positionNode = centre.add(right.mul(positionGeometry.x.add(swayB)).add(upB.mul(positionGeometry.y)).mul(size.mul(BAKE_HALF * 2)));
      // which baked view: from the side, from 45 degrees, or from above
      const row: N = varying(step(0.4, e).add(step(0.82, e)));
      const col: N = varying(aData.y);
      const quv: N = uv();
      const inset = 0.5 / this.tile;
      const tuv = vec2(col.add(quv.x.mul(1 - 2 * inset).add(inset)).div(FORMS.length), row.add(quv.y.mul(1 - 2 * inset).add(inset)).div(VIEWS));
      const tex: N = this.atlasNode.sample(tuv);
      const vTint: N = varying(attribute('iTint', 'vec3')), vTint2: N = varying(attribute('iTint2', 'vec3'));
      const vGlow: N = varying(aData.z);
      const vBase: N = varying(base);
      const vUp: N = varying(aDir), vRight: N = varying(right), vToCam: N = varying(toCam);
      // r = baked shade, g = how much of the pixel is tinted (leaf or flesh), b = glowing parts
      const albedo: N = mix(vec3(0.3, 0.23, 0.17), vTint, tex.g).mul(tex.r.mul(1.1)).add(vTint2.mul(tex.b).mul(0.5));
      const Nb: N = normalize(vUp.mul(0.55).add(vToCam.mul(0.45)).add(vRight.mul(quv.x.sub(0.5)).mul(0.9)));
      const shadow: N = this.cloudShadow(vBase);
      const night = float(1).sub(smoothstep(-0.12, 0.22, dot(normalize(vBase), uSunDir)));
      let color: N = plantLight(albedo, Nb, positionWorld, tex.g.mul(0.8), tex.r.mul(0.5).add(0.5), shadow);
      color = color.add(vTint2.mul(tex.b).mul(night.mul(2.2).add(0.3))).add(albedo.mul(vGlow).mul(night).mul(0.55).mul(tex.g));
      material.colorNode = color;
      const dCam = length(cameraPosition.sub(vBase));
      const keep = smoothstep(this.uLod.mul(0.94), this.uLod.mul(1.06), dCam);
      material.opacityNode = tex.a.mul(step(float(1).sub(keep), ign()));
      const mesh = new Copies(g, material, cap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.far = { mesh, iDir, iData, iTint, iTint2, cap };
    }

    // ---------------- grass and ground plants underfoot
    {
      // never zero: an empty instance buffer is an error on WebGPU
      const cap = Math.max(1, grassCap);
      const g = buildPlant('tuft', 3);
      const iDir = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      const iData = new InstancedBufferAttribute(new Float32Array(cap * 4), 4); // size, yaw, wind, seed
      const iTint = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      for (const a of [iDir, iData, iTint]) a.setUsage(DynamicDrawUsage);
      g.setAttribute('iDir', iDir); g.setAttribute('iData', iData); g.setAttribute('iTint', iTint);
      const material = new MeshBasicNodeMaterial({ side: DoubleSide });
      const aDir: N = attribute('iDir', 'vec3'), aData: N = attribute('iData', 'vec4');
      const wind: N = attribute('wind', 'vec3'), card: N = attribute('card', 'vec4');
      const base: N = aDir.mul(radius(aDir));
      // a frame standing on the ground, turned by the tuft's own angle
      const east: N = normalize(cross(vec3(0, 1, 0), aDir).add(vec3(1e-4, 0, 0)));
      const north: N = cross(aDir, east);
      const cy = cos(aData.y), sy = sin(aData.y);
      const ax: N = east.mul(cy).add(north.mul(sy)), az: N = north.mul(cy).sub(east.mul(sy));
      const dCamV = length(cameraPosition.sub(base));
      // tufts shrink to nothing at the edge of the ring instead of popping
      const grow = float(1).sub(smoothstep(this.uGrassR.mul(0.6), this.uGrassR, dCamV));
      const t = uTime;
      const wave = sin(t.mul(1.6).add(dot(aDir, vec3(900, 300, 700)))).mul(0.5).add(0.5);
      const bend = wind.z.mul(wave.mul(0.22).add(0.05)).mul(aData.z).add(sin(t.mul(6).add(aData.w.mul(50)).add(wind.y)).mul(wind.z).mul(0.03));
      const lp: N = positionGeometry.add(vec3(bend, 0, bend.mul(0.5))).mul(aData.x).mul(grow);
      material.positionNode = base.add(ax.mul(lp.x)).add(aDir.mul(lp.y)).add(az.mul(lp.z));
      const vTint: N = varying(attribute('iTint', 'vec3'));
      const vH: N = varying(card.y);
      const vBase: N = varying(base);
      const vN: N = varying(normalize(aDir.add(ax.mul(normalGeometry.x)).add(az.mul(normalGeometry.z))));
      const albedo: N = vTint.mul(vH.mul(0.7).add(0.55));
      material.colorNode = plantLight(albedo, vN, positionWorld, float(1), vH.mul(0.6).add(0.4), this.cloudShadow(vBase));
      const mesh = new Copies(g, material, cap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.grass = { mesh, iDir, iData, iTint, cap };
    }

    const tris = grid.tris;
    this.triCentre = new Float32Array((tris.length / 3) * 3);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]! * 3, b = tris[t + 1]! * 3, c = tris[t + 2]! * 3;
      let x = grid.pos[a]! + grid.pos[b]! + grid.pos[c]!, y = grid.pos[a + 1]! + grid.pos[b + 1]! + grid.pos[c + 1]!, z = grid.pos[a + 2]! + grid.pos[b + 2]! + grid.pos[c + 2]!;
      const l = Math.hypot(x, y, z);
      x /= l; y /= l; z /= l;
      this.triCentre[t] = x; this.triCentre[t + 1] = y; this.triCentre[t + 2] = z;
    }
  }

  /**
   * Photograph every model from the side, from 45 degrees and from above into one atlas.
   * Tiles are read back and assembled on the CPU so the result is identical on WebGL2 and WebGPU.
   */
  async bake(renderer: WebGPURenderer): Promise<void> {
    if (this.baked || this.baking) return;
    this.baking = true;
    try {
      const scene = new Scene();
      const cam = new OrthographicCamera(-BAKE_HALF, BAKE_HALF, BAKE_HALF, -BAKE_HALF, 0.05, 12);
      const material = new MeshBasicNodeMaterial({ side: DoubleSide });
      material.alphaTest = 0.5;
      const card: N = attribute('card', 'vec4');
      const part: N = card.z;
      const shade = card.w.mul(normalGeometry.y.mul(0.22).add(0.78)).mul(mix(float(1), card.y.mul(0.35).add(0.8), is(part, PART.leaf).add(is(part, PART.frond)).add(is(part, PART.needle)).add(is(part, PART.blade))));
      const tinted = float(1).sub(is(part, PART.bark)).sub(is(part, PART.bulb)).sub(is(part, PART.petal));
      material.colorNode = vec3(shade, tinted, is(part, PART.bulb).add(is(part, PART.petal)));
      material.opacityNode = cutout(card);
      const mesh = new Mesh(this.geos.get('broadleaf')!, material);
      scene.add(mesh);
      const W = this.tile * FORMS.length, H = this.tile * VIEWS;
      const atlas = new Uint8Array(W * H * 4);
      const prevTarget = renderer.getRenderTarget();
      const prevColor = (renderer as any).getClearColor(new Color()) as Color;
      const prevAlpha = (renderer as any).getClearAlpha() as number;
      (renderer as any).setClearColor(0x000000, 0);
      // Which way up does a picture of the scene come back? Asked of the same kind of render as the tiles (a camera
      // looking at geometry): a white card fills the upper half of the view and we see which rows it lands in. The
      // earlier test used a full-screen pass, which does not agree with a camera render on WebGPU, so every imposter
      // there was baked upside down (trunks above the crowns).
      let flipped = false;
      {
        const probeScene = new Scene();
        const white = new MeshBasicNodeMaterial({ side: DoubleSide });
        white.colorNode = vec3(1, 1, 1);
        const cardMesh = new Mesh(new PlaneGeometry(BAKE_HALF * 4, BAKE_HALF), white);
        cardMesh.position.set(0, BAKE_CENTRE + BAKE_HALF / 2, 0);
        probeScene.add(cardMesh);
        cam.position.set(0, BAKE_CENTRE, 4);
        cam.up.set(0, 1, 0);
        cam.lookAt(0, BAKE_CENTRE, 0);
        cam.updateMatrixWorld();
        const probe = new RenderTarget(4, 4, { type: UnsignedByteType, format: RGBAFormat, depthBuffer: true });
        renderer.setRenderTarget(probe);
        renderer.render(probeScene, cam);
        renderer.setRenderTarget(prevTarget);
        const pr = (await renderer.readRenderTargetPixelsAsync(probe, 0, 0, 4, 4)) as unknown as ArrayLike<number>;
        // the tiles are stored bottom row first, so they need turning over when the top of the view comes back first
        flipped = pr[0]! > pr[48]!;
        probe.dispose(); cardMesh.geometry.dispose(); white.dispose();
      }
      // draw every tile first, then read them all back together
      const targets: RenderTarget[] = [];
      for (let f = 0; f < FORMS.length; f++) {
        mesh.geometry = this.geos.get(FORMS[f]!)!;
        for (let v = 0; v < VIEWS; v++) {
          const elev = v === 0 ? 0 : v === 1 ? Math.PI / 4 : Math.PI / 2 - 0.001;
          cam.position.set(0, BAKE_CENTRE + Math.sin(elev) * 4, Math.cos(elev) * 4);
          cam.up.set(0, 1, 0);
          cam.lookAt(0, BAKE_CENTRE, 0);
          cam.updateMatrixWorld();
          const rt = new RenderTarget(this.tile, this.tile, { type: UnsignedByteType, format: RGBAFormat, depthBuffer: true });
          renderer.setRenderTarget(rt);
          renderer.render(scene, cam);
          targets.push(rt);
        }
      }
      renderer.setRenderTarget(prevTarget);
      (renderer as any).setClearColor(prevColor, prevAlpha);
      const pixels = await Promise.all(targets.map((rt) => renderer.readRenderTargetPixelsAsync(rt, 0, 0, this.tile, this.tile) as unknown as Promise<Uint8Array>));
      for (let f = 0; f < FORMS.length; f++) {
        for (let v = 0; v < VIEWS; v++) {
          const px = pixels[f * VIEWS + v]!;
          // spread colour into the empty texels around the plant so filtering does not darken its edges
          const tile = new Uint8Array(this.tile * this.tile * 4);
          for (let y = 0; y < this.tile; y++) {
            const sy = flipped ? this.tile - 1 - y : y;
            tile.set(px.subarray(sy * this.tile * 4, (sy + 1) * this.tile * 4), y * this.tile * 4);
          }
          for (let pass = 0; pass < 3; pass++) {
            const src = tile.slice();
            for (let y = 0; y < this.tile; y++) for (let x = 0; x < this.tile; x++) {
              const o = (y * this.tile + x) * 4;
              if (src[o + 3]! > 127) continue;
              let r = 0, g = 0, b = 0, n = 0;
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= this.tile || yy >= this.tile) continue;
                const q = (yy * this.tile + xx) * 4;
                if (src[q + 3]! > 127 || (src[q]! + src[q + 1]! + src[q + 2]! > 0 && pass > 0)) { r += src[q]!; g += src[q + 1]!; b += src[q + 2]!; n++; }
              }
              if (n) { tile[o] = r / n; tile[o + 1] = g / n; tile[o + 2] = b / n; }
            }
          }
          for (let y = 0; y < this.tile; y++) atlas.set(tile.subarray(y * this.tile * 4, (y + 1) * this.tile * 4), ((v * this.tile + y) * W + f * this.tile) * 4);
        }
      }
      for (const rt of targets) rt.dispose();
      const tex = new DataTexture(atlas, W, H, RGBAFormat, UnsignedByteType);
      tex.magFilter = tex.minFilter = LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      this.atlasNode.value = tex;
      this.atlasData = atlas;
      this.baked = !this.rebake;
      this.rebake = false;
      this.dirty = true;
    } finally {
      this.baking = false;
    }
  }
  /**
   * Draw one form of plant from a made model (the asset pass). The model is stood at the height of the generated plant
   * it replaces and kept inside the frame the far-plant pictures are taken in; the plants already standing are
   * replanted with it, and the far-plant pictures are taken again.
   */
  useModel(form: Form, model: Model): void {
    const slot = this.full.get(form), old = this.geos.get(form);
    if (!slot || !old) return;
    const p = old.getAttribute('position');
    let top = 0;
    for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
    // no wider than the picture frame: a spreading model is made lower, not cut off at the sides
    const wide = Math.max(model.max[0] - model.min[0], model.max[2] - model.min[2]) / Math.max(1e-6, model.max[1] - model.min[1]);
    const height = Math.min(top, (BAKE_HALF * 1.9) / Math.max(1e-6, wide));
    const geo = plantFromModel(model, form, Math.max(0.2, height));
    this.geos.set(form, geo);
    const g = geo.clone();
    const inst = addPlantInstanceData(g, slot.cap);
    slot.mesh.geometry.dispose();
    slot.mesh.geometry = g;
    Object.assign(slot, inst);
    slot.n = 0;
    slot.mesh.count = 0;
    this.fromModels.add(form);
    if (this.baking) this.rebake = true;
    this.baked = false;
    this.dirty = true;
  }

  /** The baked atlas pixels, kept for inspection. */
  atlasData?: Uint8Array;

  setCells(cells: CellSnapshot): void {
    this.cells = cells;
    // replant at most every two seconds while the world changes under a still camera
    if (performance.now() - this.lastBuild > 2000) this.dirty = true;
  }

  /**
   * Where people live, plants give way: nothing small grows between the buildings and few trees are left standing.
   * (Seen on a real GPU: tall grass growing against the walls of tower blocks.) The radius is the one the town is
   * built to in `buildings.ts`. Picked up at the next replanting; no rebuild is forced, towns grow slowly.
   */
  setTowns(list: SettlementInfo[]): void {
    const pos = this.grid.pos;
    let n = 0;
    for (const st of list) if (st.ruined < 0) n++;
    if (this.towns.length !== n * 5) this.towns = new Float32Array(n * 5);
    let o = 0;
    for (const st of list) {
      if (st.ruined >= 0) continue;
      const size = settlementSize(st.pop);
      this.towns[o] = pos[st.cell * 3]!; this.towns[o + 1] = pos[st.cell * 3 + 1]!; this.towns[o + 2] = pos[st.cell * 3 + 2]!;
      this.towns[o + 3] = (0.0025 + 0.02 * size * (0.25 + 0.75 * st.tech)) * 1.08;
      // a village keeps its shade trees; a city keeps a few
      this.towns[o + 4] = st.tech < 0.3 ? 0.4 : 0.1;
      o += 5;
    }
  }

  /** The towns within `reach` (radians) of a direction, into `out`. */
  private townsAround(x: number, y: number, z: number, reach: number, out: number[]): void {
    out.length = 0;
    const T = this.towns;
    for (let i = 0; i < T.length; i += 5) {
      const r = reach + T[i + 3]!;
      if (2 - 2 * (T[i]! * x + T[i + 1]! * y + T[i + 2]! * z) < r * r) out.push(T[i]!, T[i + 1]!, T[i + 2]!, T[i + 3]!, T[i + 4]!);
    }
  }

  /** Whether a plant at a direction stands: `h` is its own random number, `tree` whether it is one. */
  private static stands(near: number[], x: number, y: number, z: number, h: number, tree: boolean): boolean {
    for (let i = 0; i < near.length; i += 5) {
      const r = near[i + 3]!;
      const d2 = 2 - 2 * (near[i]! * x + near[i + 1]! * y + near[i + 2]! * z);
      if (d2 >= r * r) continue;
      // cleared in the middle, growing back over the outer fifth
      const edge = Math.max(0, (Math.sqrt(d2) / r - 0.8) / 0.2);
      const keep = Math.max(edge, tree ? near[i + 4]! * (0.35 + 0.65 * Math.sqrt(d2) / r) : 0);
      if (h > keep) return false;
    }
    return true;
  }

  setPlants(plants: Map<number, PlantInfo>): void {
    this.plants = plants;
    this.dirty = true;
  }

  /** Which growth form a plant of these genes and this height takes. */
  private formFor(genes: Float32Array | undefined, hv: number, leafDefault: number, h: number): Form {
    const leaf = genes ? genes[PG.Leaf]! : leafDefault;
    const water = genes ? genes[PG.WaterNeed]! : 0.5;
    const glow = genes ? genes[PG.Glow]! : 0;
    if (hv < 0.16) {
      if (genes && genes[PG.Fruit]! > 0.45 && h < 0.3) return 'flower';
      return water > 0.62 && h < 0.5 ? 'fern' : 'tuft';
    }
    if (hv < 0.36) {
      if (leaf > 0.74 && water < 0.45) return 'column';
      return water > 0.6 && h < 0.4 ? 'fern' : 'shrub';
    }
    // (0.55 was thirstier than any glowing plant in the measured histories: no giant mushroom ever grew)
    if (glow > 0.5) return water > 0.42 ? 'mushroom' : 'fan';
    if (leaf < 0.33) return 'conifer';
    if (leaf > 0.74) return water < 0.42 ? 'column' : 'bottle';
    if (genes && genes[PG.Height]! > 0.72 && water > 0.55) return 'palm';
    if (water < 0.36 || (genes && genes[PG.FireResist]! > 0.62)) return 'umbrella';
    return 'broadleaf';
  }

  /** Rebuild instances around the camera when it has moved or the world has changed. */
  update(focus: Vector3, dist: number, camera: Vector3, renderer?: WebGPURenderer): void {
    const cells = this.cells;
    if (!cells) return;
    if (!this.baked && renderer) void this.bake(renderer);
    this.updateGrass(cells, camera, dist);
    const show = dist < 1.1;
    if (!show) {
      if (this.lastDist < 1.1) { for (const s of this.full.values()) s.mesh.count = 0; this.far.mesh.count = 0; }
      this.lastDist = dist;
      return;
    }
    const lod = this.uLod.value;
    const moved = focus.distanceToSquared(this.lastFocus) > Math.pow(Math.min(0.03, dist * 0.12), 2) || Math.abs(Math.log(dist / Math.max(1e-6, this.lastDist))) > 0.2
      || (dist < 0.12 && camera.distanceToSquared(this.lastCam) > (lod * 0.14) ** 2);
    if (!moved && !this.dirty) return;
    this.dirty = false;
    this.lastBuild = performance.now();
    this.lastFocus.copy(focus);
    this.lastCam.copy(camera);
    this.lastDist = dist;
    // radius of the planted patch grows with altitude; density per triangle falls
    const radius = Math.min(0.42, 0.045 + dist * 0.55);
    const cosR = Math.cos(radius);
    const { tris, pos } = this.grid;
    const tc = this.triCentre;
    const visible: number[] = [];
    for (let t = 0; t < tris.length; t += 3) {
      if (tc[t]! * focus.x + tc[t + 1]! * focus.y + tc[t + 2]! * focus.z > cosR) visible.push(t);
    }
    const perTri = Math.max(1, Math.min(42, Math.floor(this.maxInstances / Math.max(1, visible.length))));
    // towns only clear ground that is seen from near; from far the ground tint carries it
    const townsNear = this.townsNear;
    if (dist < 0.2) this.townsAround(focus.x, focus.y, focus.z, radius + 0.01, townsNear); else townsNear.length = 0;
    for (const s of this.full.values()) s.n = 0;
    let farN = 0;
    const far = this.far;
    const farCap = Math.min(far.cap, this.maxInstances);
    const fullBudget = Math.min(this.modelBudget, Math.max(40, Math.floor(this.maxInstances / 25)));
    let fullN = 0;
    const q = new Quaternion(), yaw = new Quaternion(), up = new Vector3();
    const Y = new Vector3(0, 1, 0);
    const { elevation, vegetation, canopy, flora, seaLevel, snow, windE, windN, reef } = cells;
    // plants are drawn larger from higher up so forests stay readable
    const sizeBoost = 1 + Math.min(1.6, dist * 3.2);
    const A = this.pigmentA, B = this.pigmentB;
    for (const t of visible) {
      const ia = tris[t]!, ib = tris[t + 1]!, ic = tris[t + 2]!;
      let va = vegetation[ia]!, vb = vegetation[ib]!, vc = vegetation[ic]!;
      // the sea bed has its own gardens: coral where a reef lives, weed in the shallows. Only planted from near,
      // where they can be seen through the water or from under it.
      const depthA = seaLevel - elevation[ia]!, depthB = seaLevel - elevation[ib]!, depthC = seaLevel - elevation[ic]!;
      const seaBed = depthA > 0 && depthB > 0 && depthC > 0;
      let coralA = 0, coralB = 0, coralC = 0;
      if (seaBed) {
        if (dist > 0.07) continue;
        const shallow = (d: number) => Math.max(0, 1 - d / 0.45);
        coralA = Math.max(0, reef[ia]!); coralB = Math.max(0, reef[ib]!); coralC = Math.max(0, reef[ic]!);
        va = Math.min(1, coralA * 0.9 + shallow(depthA) * 0.5); vb = Math.min(1, coralB * 0.9 + shallow(depthB) * 0.5); vc = Math.min(1, coralC * 0.9 + shallow(depthC) * 0.5);
      }
      if (va + vb + vc < 0.05) continue;
      for (let k = 0; k < perTri; k++) {
        const h0 = hash(t * 131 + k * 7919);
        let u = hash(t * 17 + k * 104729), v = hash(t * 29 + k * 1299709);
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;
        const density = va * w + vb * u + vc * v;
        if (h0 > density * 0.95) continue;
        const e = elevation[ia]! * w + elevation[ib]! * u + elevation[ic]! * v;
        if (seaBed ? e > seaLevel - 0.03 : e <= seaLevel + 0.02) continue;
        const near = w >= u && w >= v ? ia : u >= v ? ib : ic;
        // nothing grows out of deep snow: a thin cover thins the plants, a thick one buries them
        if (!seaBed && snow[near]! > 0.5 + 1.5 * h0) continue;
        const sp = this.plants.get(flora[near]!);
        const genes = sp?.genes;
        const height = genes ? genes[PG.Height]! : canopy[near]!;
        // individual variation around the species' height
        const hv = height * (0.6 + 0.8 * hash(t * 53 + k * 15485863));
        const coral = seaBed && hash(t * 37 + k * 433) < (coralA * w + coralB * u + coralC * v) * 1.2;
        const form: Form = seaBed ? (coral ? 'fan' : hash(t * 41 + k * 617) < 0.55 ? 'fern' : 'tuft') : this.formFor(genes, hv, 0.5, hash(t * 71 + k * 911));
        up.set(
          pos[ia * 3]! * w + pos[ib * 3]! * u + pos[ic * 3]! * v,
          pos[ia * 3 + 1]! * w + pos[ib * 3 + 1]! * u + pos[ic * 3 + 1]! * v,
          pos[ia * 3 + 2]! * w + pos[ib * 3 + 2]! * u + pos[ic * 3 + 2]! * v,
        ).normalize();
        const small = form === 'tuft' || form === 'fern' || form === 'flower';
        if (!seaBed && townsNear.length && !Flora.stands(townsNear, up.x, up.y, up.z, hash(t * 61 + k * 211), !small && form !== 'shrub')) continue;
        const size = (seaBed ? (coral ? 0.0015 : form === 'fern' ? 0.0034 : 0.0013) : small ? 0.0011 : form === 'shrub' ? 0.0015 : 0.0021 + 0.0042 * hv) * sizeBoost * (0.8 + 0.4 * hash(t * 7 + k * 31));
        // colour: this world's pigments, with the leaf-hue gene running between the two
        const tHue = Math.max(0, Math.min(1, (genes ? genes[PG.LeafHue]! : 0.5) + (hash(t + k * 5) - 0.5) * 0.18));
        const light = (small ? 1.35 : 1) * (0.8 + 0.5 * hash(t * 11 + k));
        let r = (A[0] + (B[0] - A[0]) * tHue) * light, g = (A[1] + (B[1] - A[1]) * tHue) * light, b = (A[2] + (B[2] - A[2]) * tHue) * light;
        // autumn: where the cold season is coming, broad leaves turn gold and red, then brown
        if ((form === 'broadleaf' || form === 'umbrella' || form === 'shrub') && this.autumn !== 0) {
          const fall = Math.max(0, Math.min(1, -this.autumn * Math.sign(up.y) * Math.min(1, Math.abs(up.y) * 2.2)));
          if (fall > 0.15) {
            const tone = hash(t * 5 + k * 3), k1 = Math.min(1, fall * 1.4);
            const tr = tone < 0.5 ? 0.62 : 0.55, tg = tone < 0.5 ? 0.42 : 0.14, tb = tone < 0.5 ? 0.06 : 0.05;
            r += (tr - r) * k1; g += (tg - g) * k1; b += (tb - b) * k1;
            if (fall > 0.85) { r += (0.25 - r) * 0.6; g += (0.17 - g) * 0.6; b += (0.1 - b) * 0.6; }
          }
        }
        // flowers, glow bulbs and petals take the flower-hue gene
        const fh = genes ? genes[PG.FlowerHue]! : 0.9;
        const f6 = (n: number) => { const kk = (n + fh * 6) % 6; return 0.95 - 0.95 * 0.7 * Math.max(0, Math.min(kk, 4 - kk, 1)); };
        let r2 = f6(5), g2 = f6(3), b2 = f6(1);
        if (genes && genes[PG.Fruit]! > 0.45 && form === 'broadleaf' && hash(t * 97 + k * 13) < 0.25) { r = r2 * 0.8; g = g2 * 0.8; b = b2 * 0.8; }
        let glow = genes && genes[PG.Glow]! > 0.5 ? genes[PG.Glow]! : 0;
        let windHere = Math.min(1.6, 0.35 + Math.hypot(windE[near]!, windN[near]!) * 0.9);
        if (seaBed) {
          // coral in its own bright colours; weed in a dull olive cast of the world's pigment; everything sways in the swell
          const tone = hash(t * 23 + k * 59);
          if (coral) {
            const c = tone < 0.34 ? [0.95, 0.38, 0.5] : tone < 0.67 ? [0.2, 0.78, 0.7] : [0.95, 0.72, 0.28];
            r = c[0]! * light; g = c[1]! * light; b = c[2]! * light;
            r2 = Math.min(1, c[0]! * 1.3 + 0.1); g2 = Math.min(1, c[1]! * 1.3 + 0.1); b2 = Math.min(1, c[2]! * 1.3 + 0.1);
          } else { r = (r * 0.35 + 0.1) * light; g = (g * 0.35 + 0.2) * light; b = (b * 0.35 + 0.08) * light; }
          glow = 0; windHere = 0.9;
        }
        const rr = 1 + e * EXAG;
        const dCam = Math.hypot(up.x * rr - camera.x, up.y * rr - camera.y, up.z * rr - camera.z);
        if (dCam < lod * 1.15 && fullN < fullBudget) {
          const slot = this.full.get(form)!;
          if (slot.n < slot.cap) {
            const n = slot.n++;
            fullN++;
            q.setFromUnitVectors(Y, up);
            yaw.setFromAxisAngle(Y, h0 * 40);
            q.multiply(yaw);
            slot.iDir.setXYZ(n, up.x, up.y, up.z);
            slot.iQuat.setXYZW(n, q.x, q.y, q.z, q.w);
            slot.iData.setXYZW(n, size, glow, windHere, h0);
            slot.iTint.setXYZ(n, r, g, b);
            slot.iTint2.setXYZ(n, r2, g2, b2);
          }
        }
        if (dCam > lod * 0.85 && farN < farCap && this.baked) {
          far.iDir.setXYZ(farN, up.x, up.y, up.z);
          far.iData.setXYZW(farN, size, FORMS.indexOf(form), glow, h0);
          far.iTint.setXYZ(farN, r, g, b);
          far.iTint2.setXYZ(farN, r2, g2, b2);
          farN++;
        }
      }
    }
    for (const s of this.full.values()) {
      s.mesh.count = s.n;
      s.iDir.needsUpdate = true; // one shared buffer: this uploads all of the instance data
    }
    far.mesh.count = farN;
    far.iDir.needsUpdate = far.iData.needsUpdate = far.iTint.needsUpdate = far.iTint2.needsUpdate = true;
  }

  /** The ring of grass around the camera, anchored to the ground so it does not swim as the camera moves. */
  private updateGrass(cells: CellSnapshot, camera: Vector3, dist: number): void {
    const gr = this.grass;
    const camR = camera.length();
    const R = this.uGrassR.value;
    const cap = Math.min(gr.cap, this.grassBudget);
    if (dist > 0.06 || cap < 8) { if (gr.mesh.count) gr.mesh.count = 0; this.lastGrass.set(9, 9, 9); return; }
    if (camera.distanceToSquared(this.lastGrass) < (R * 0.18) ** 2) return;
    this.lastGrass.copy(camera);
    const fx = camera.x / camR, fy = camera.y / camR, fz = camera.z / camR;
    // work on the cube face under the camera, on a grid fixed to that face
    const axv = Math.abs(fx), ayv = Math.abs(fy), azv = Math.abs(fz);
    const face = axv >= ayv && axv >= azv ? (fx > 0 ? 0 : 1) : ayv >= azv ? (fy > 0 ? 2 : 3) : fz > 0 ? 4 : 5;
    const m = Math.max(axv, ayv, azv);
    let cu: number, cv: number;
    switch (face) {
      case 0: cu = -fz / m; cv = -fy / m; break;
      case 1: cu = fz / m; cv = -fy / m; break;
      case 2: cu = fx / m; cv = fz / m; break;
      case 3: cu = fx / m; cv = -fz / m; break;
      case 4: cu = fx / m; cv = -fy / m; break;
      default: cu = -fx / m; cv = -fy / m; break;
    }
    const side = Math.max(8, Math.floor(Math.sqrt(cap) * 1.15));
    const step = (R * 2 * 1.5) / side;
    const iu = Math.round(cu / step), iv = Math.round(cv / step);
    const d: [number, number, number] = [0, 0, 0];
    const { elevation, vegetation, flora, seaLevel, snow, windE, windN } = cells;
    const { pos, neighbors, ncount } = this.grid;
    const A = this.pigmentA, B = this.pigmentB;
    let n = 0;
    let cell = this.grassCell;
    const townsNear = this.townsByGrass;
    this.townsAround(fx, fy, fz, R * 1.2, townsNear);
    const half = side >> 1;
    for (let j = -half; j <= half && n < cap; j++) {
      for (let i = -half; i <= half && n < cap; i++) {
        const gi = iu + i, gj = iv + j;
        const key = (gi * 73856093) ^ (gj * 19349663) ^ (face * 83492791);
        const u = (gi + hash(key) - 0.5) * step, v = (gj + hash(key + 1) - 0.5) * step;
        if (Math.abs(u) > 1 || Math.abs(v) > 1) continue;
        faceDirection(face, u, v, d);
        const dx = d[0] - fx, dy = d[1] - fy, dz = d[2] - fz;
        if (dx * dx + dy * dy + dz * dz > R * R * 1.3) continue;
        // nearest cell, walking from the last one
        let best = pos[cell * 3]! * d[0] + pos[cell * 3 + 1]! * d[1] + pos[cell * 3 + 2]! * d[2];
        for (;;) {
          let movedCell = false;
          for (let k = 0; k < ncount[cell]!; k++) {
            const nb = neighbors[cell * 6 + k]!;
            const dd = pos[nb * 3]! * d[0] + pos[nb * 3 + 1]! * d[1] + pos[nb * 3 + 2]! * d[2];
            if (dd > best) { best = dd; cell = nb; movedCell = true; }
          }
          if (!movedCell) break;
        }
        if (elevation[cell]! <= seaLevel + 0.03 || snow[cell]! > 3) continue;
        const veg = vegetation[cell]!;
        if (hash(key + 2) > veg * 1.5 + 0.04) continue;
        if (townsNear.length && !Flora.stands(townsNear, d[0], d[1], d[2], hash(key + 8), false)) continue;
        const genes = this.plants.get(flora[cell]!)?.genes;
        const tHue = Math.max(0, Math.min(1, (genes ? genes[PG.LeafHue]! : 0.5) + (hash(key + 3) - 0.5) * 0.25));
        const light = 1.25 * (0.75 + 0.6 * hash(key + 4));
        gr.iDir.setXYZ(n, d[0], d[1], d[2]);
        gr.iData.setXYZW(n, 0.00035 + 0.00045 * hash(key + 5), hash(key + 6) * 6.283, Math.min(1.6, 0.4 + Math.hypot(windE[cell]!, windN[cell]!)), hash(key + 7));
        gr.iTint.setXYZ(n, (A[0] + (B[0] - A[0]) * tHue) * light, (A[1] + (B[1] - A[1]) * tHue) * light, (A[2] + (B[2] - A[2]) * tHue) * light);
        n++;
      }
    }
    this.grassCell = cell;
    gr.mesh.count = n;
    gr.iDir.needsUpdate = gr.iData.needsUpdate = gr.iTint.needsUpdate = true;
  }
}
