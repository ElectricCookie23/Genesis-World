// The sea: a quadtree cube-sphere at sea level, moved and shaded by the FFT wave field.
// Wave strength follows the simulation's wind; colour comes from this world's water, its depth
// (measured through the water to the real sea bed behind it), plankton and ice.
import { DoubleSide, MeshBasicNodeMaterial, type Texture, type Vector3, type WebGPURenderer } from 'three/webgpu';
import {
  abs, sqrt, step, cameraPosition, cameraViewMatrix, dot, exp, float, frontFacing, length, log2, max, min, mix, normalize, positionView, positionWorld, pow, reflect,
  screenUV, select, sin, smoothstep, texture, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture, cameraNear, cameraFar, perspectiveDepthToViewZ,
} from 'three/tsl';
import { EXAG, uImpact, uOverlay, uHazeAmount, uHazeTint, uMoonDir, uOceanFill, uSeaGlow, uSeaKm, uSunDir, uTideKm, uTime, uUnderwater } from '../common';
import { OceanFFT } from './fft';
import { uLook } from './look';
import { samplePlanet, type PlanetData } from './planetdata';
import { QuadSphere, patchNodes } from './quadsphere';
import type { CivMap } from './civmap';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Planet radii per metre of open-sea wave tile. The world is a miniature, so waves are scaled to read well near the camera. */
export const WAVE_METRE = 2.2e-5;
/** Wave heights are stretched a little, like the terrain's relief. */
const WAVE_LIFT = 1.7;
/** Wind speed the wave spectrum is built for (m/s); local wind scales it up and down. */
const REFERENCE_WIND = 11;

export class OceanSurface {
  readonly sphere: QuadSphere;
  readonly fft: OceanFFT;
  maxLevel = 11;
  split = 4;
  private readonly dispNodes: N[] = [];
  private readonly detailNodes: N[] = [];
  private frame = 0;
  /** Run the wave simulation every n-th frame (1 = every frame). */
  fftEvery = 1;
  /** Texture node of the mid-scale wave detail (slopes, foam, Jacobian) and its tile size, for caustics on the sea bed. */
  readonly causticNode: N;
  readonly causticTile: number;

  constructor(data: PlanetData, cloudShadow: (p: N) => N, erosionTex: Texture, resolution = 256, seed = 1, civ?: CivMap, segments = 32, maxPatches = 700) {
    this.fft = new OceanFFT(resolution, seed);
    this.fft.setWind(REFERENCE_WIND, 0.6);
    const outs = this.fft.outputs;
    for (const o of outs) {
      this.dispNodes.push(texture(o.displacement));
      this.detailNodes.push(texture(o.detail));
    }
    this.causticNode = this.detailNodes[1];
    this.causticTile = outs[1]!.length * WAVE_METRE;
    const tiles = outs.map((o) => o.length * WAVE_METRE);
    const material = new MeshBasicNodeMaterial({ transparent: true, side: DoubleSide });
    material.depthWrite = true;

    const weights = (dir: N): N => { const a = pow(abs(dir), vec3(8, 8, 8)); return a.div(a.x.add(a.y).add(a.z)); };
    /** How rough the sea is here: calm in still air, heavy under strong wind and storms. */
    const seaState = (X: N, C: N): N => mix(float(0.28), float(1.75), X.b).mul(smoothstep(0.7, 1.0, C.a).mul(0.5).add(1));
    /** Waves die down where the water gets shallow. */
    const shoaling = (elev: N, level: N): N => smoothstep(0.0, 0.12, level.sub(elev));

    // ---------------- vertex: sea level with tides, then the waves
    const pn = patchNodes();
    const vDir: N = pn.dir;
    const tide = pow(dot(vDir, uMoonDir), 2).sub(1 / 3).mul(uTideKm);
    const fillKm = float(1).sub(uOceanFill).mul(-7.5);
    const levelKm: N = uSeaKm.add(tide).add(fillKm);
    const vA: N = (samplePlanet(data.height, vDir) as any).level(0);
    const vX: N = (samplePlanet(data.extra, vDir) as any).level(0);
    const vC: N = (samplePlanet(data.life, vDir) as any).level(0);
    const vState = seaState(vX, vC).mul(shoaling(vA.r, levelKm)).mul(float(1).sub(vX.a));
    const vw = weights(vDir);
    // spacing of this patch's vertices: waves shorter than that are left to the shading
    const spacing: N = pn.size.mul(2 / segments);
    let lift: N = float(0);
    let slide: N = vec3(0, 0, 0);
    for (let c = 0; c < 2; c++) {
      const T = tiles[c]!;
      const lod = log2(spacing.div(T / resolution)).add(1).clamp(0, 9);
      const fade = float(1).sub(smoothstep(T * 0.12, T * 0.45, spacing));
      const s = (uvn: N): N => (this.dispNodes[c].sample(uvn) as any).level(lod);
      const dx: N = s(vDir.zy.div(T)), dy: N = s(vDir.xz.div(T)), dz: N = s(vDir.xy.div(T));
      lift = lift.add(dx.g.mul(vw.x).add(dy.g.mul(vw.y)).add(dz.g.mul(vw.z)).mul(fade));
      slide = slide.add(vec3(0, dx.b, dx.r).mul(vw.x).add(vec3(dy.r, 0, dy.b).mul(vw.y)).add(vec3(dz.r, dz.b, 0).mul(vw.z)).mul(fade));
    }
    const tangentSlide: N = slide.sub(vDir.mul(dot(slide, vDir)));
    material.positionNode = vDir.mul(float(1).add(levelKm.mul(EXAG)).add(lift.mul(vState).mul(WAVE_METRE * WAVE_LIFT)).sub(pn.skirt.mul(pn.size).mul(0.02).mul(float(1).sub(uUnderwater))))
      .add(tangentSlide.mul(vState).mul(WAVE_METRE));

    // ---------------- fragment
    const P: N = positionWorld;
    const dir: N = normalize(P);
    const A: N = samplePlanet(data.height, dir);
    const C: N = samplePlanet(data.life, dir);
    const X: N = samplePlanet(data.extra, dir);
    const tideF = pow(dot(dir, uMoonDir), 2).sub(1 / 3).mul(uTideKm);
    const level: N = uSeaKm.add(tideF).add(float(1).sub(uOceanFill).mul(-7.5));
    const depthKm: N = level.sub(A.r);
    const iceRaw: N = X.a;
    const state: N = seaState(X, C).mul(shoaling(A.r, level));
    const w = weights(dir);
    const V: N = normalize(cameraPosition.sub(P));
    const camDist: N = cameraPosition.sub(P).length();
    const L: N = uSunDir, M: N = uMoonDir;

    // wave slopes, foam and folding from all three cascades
    let grad: N = vec3(0, 0, 0);
    let foamTex: N = float(0);
    let fold: N = float(0);
    for (let c = 0; c < 3; c++) {
      const T = tiles[c]!;
      const s = (uvn: N): N => this.detailNodes[c].sample(uvn);
      const ex: N = s(dir.zy.div(T)), ey: N = s(dir.xz.div(T)), ez: N = s(dir.xy.div(T));
      grad = grad.add(vec3(0, ex.g, ex.r).mul(w.x).add(vec3(ey.r, 0, ey.g).mul(w.y)).add(vec3(ez.r, ez.g, 0).mul(w.z)));
      const f = ex.b.mul(w.x).add(ey.b.mul(w.y)).add(ez.b.mul(w.z));
      const j = ex.a.mul(w.x).add(ey.a.mul(w.y)).add(ez.a.mul(w.z));
      foamTex = max(foamTex, f.mul(c === 2 ? 0.7 : 1));
      fold = fold.add(float(1).sub(j).max(0).mul(c === 0 ? 1 : 0.6));
    }
    grad = grad.mul(state).mul(WAVE_LIFT);
    const Nw: N = normalize(dir.sub(grad.sub(dir.mul(dot(grad, dir)))));
    // seen from below, the surface faces down
    const Nrm: N = select(frontFacing, Nw, Nw.negate());

    // ---- what lies behind the surface: distance through the water to the sea bed, and the bed itself, bent by the waves
    const viewDirZ = normalize(positionView).z;
    const tFrag = length(positionView);
    const solidAt = (uvn: N): N => perspectiveDepthToViewZ(viewportDepthTexture(uvn), cameraNear, cameraFar).div(viewDirZ);
    const pathStraight = max(solidAt(screenUV).sub(tFrag), 0);
    const bendView: N = cameraViewMatrix.mul(vec4(Nw.sub(dir), 0)).xy;
    const bendAmt = float(1).sub(exp(pathStraight.mul(-4000))).mul(0.035).div(camDist.mul(6).add(1));
    const uvBent = screenUV.add(bendView.mul(bendAmt));
    const pathBent = solidAt(uvBent).sub(tFrag);
    // never pull in something that is in front of the water
    const useBent = pathBent.greaterThan(0);
    const uvR = select(useBent, uvBent, screenUV);
    const path: N = select(useBent, pathBent, pathStraight);
    const behind: N = viewportSharedTexture(uvR).rgb;

    // ---- the colour of the water itself
    const shallow: N = vec3(uLook.oceanShallow), deep: N = vec3(uLook.oceanDeep);
    const strongest = max(max(shallow.x, shallow.y), shallow.z);
    const absorb: N = vec3(1.08, 1.08, 1.08).sub(shallow.div(strongest));
    const transmit: N = exp(absorb.mul(path).mul(-3200));
    const sunH = dot(dir, L);
    const day = smoothstep(-0.14, 0.24, sunH);
    const sunColor: N = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.05, 0.4, sunH));
    const shadow: N = cloudShadow(P);
    const sunVis = smoothstep(-0.08, 0.1, sunH).mul(shadow);
    let body: N = mix(shallow.mul(0.6), deep, float(1).sub(exp(path.mul(-950))));
    // plankton blooms stain the water
    body = mix(body, mix(body, vec3(uLook.pigmentA), 0.45).mul(1.3), C.b.mul(0.55));
    const moonUp = smoothstep(-0.1, 0.25, dot(dir, M));
    const night = float(1).sub(day);
    const moonAmb: N = vec3(uLook.moon).mul(0.05).mul(moonUp).mul(night);
    const ambient: N = mix(vec3(uHazeTint), vec3(0.6, 0.6, 0.6), 0.4).mul(0.3).mul(day).add(moonAmb.mul(0.6)).add(vec3(0.004, 0.007, 0.008));
    const bodyLit: N = body.mul(sunColor.mul(sunVis).mul(max(dot(Nw, L), 0).mul(0.6).add(0.4)).mul(0.95).add(ambient));
    let water: N = behind.mul(transmit).add(bodyLit.mul(vec3(1, 1, 1).sub(transmit)));
    // light glowing through the thin tops of waves, looking toward the star
    const crest = smoothstep(0.05, 0.5, fold.mul(state));
    const through = pow(max(dot(V, L.sub(dir.mul(dot(L, dir))).normalize().negate()), 0), 3);
    water = water.add(shallow.mul(sunColor).mul(crest).mul(through).mul(sunVis).mul(0.55));

    // ---- reflection of the sky, the star and the moon
    const R: N = reflect(V.negate(), Nrm);
    const upness = max(dot(R, dir), 0);
    const overcast = smoothstep(0.35, 0.9, C.a);
    const zenith: N = vec3(uHazeTint).mul(0.62);
    const horizon: N = mix(vec3(uHazeTint), vec3(1, 1, 1), 0.45).mul(0.9);
    let sky: N = mix(horizon, zenith, pow(upness, 0.55)).mul(day.mul(0.95).add(0.012));
    sky = mix(sky, sky.add(vec3(uLook.dusk).mul(0.5).mul(pow(max(dot(R, L), 0), 6))), smoothstep(0.35, -0.05, sunH).mul(day));
    sky = mix(sky, vec3(0.55, 0.56, 0.6).mul(day.mul(0.8).add(0.01)), overcast.mul(0.75)).add(moonAmb.mul(0.5));
    // far away the waves are smaller than a pixel: their slopes widen the glitter instead (Cox and Munk)
    const far = smoothstep(0.015, 0.5, camDist);
    const windMs = state.mul(REFERENCE_WIND);
    const farPower = float(2).div(windMs.mul(0.00512).add(0.003)).sub(2);
    const power = mix(float(520), farPower.mul(1.6), far);
    const H: N = normalize(V.add(L));
    const nh = max(dot(Nrm, H), 0);
    const fresnel = float(0.02).add(pow(float(1).sub(max(dot(Nrm, V), 0)), 5).mul(0.98).mul(mix(float(1), float(0.55), far)));
    const glint = pow(nh, power).mul(power.add(8)).mul(0.0398).mul(sunVis).mul(smoothstep(0.0, 0.06, dot(Nrm, L))).min(60);
    const Hm: N = normalize(V.add(M));
    const moonGlint = pow(max(dot(Nrm, Hm), 0), power).mul(power.add(8)).mul(0.0398).mul(moonUp).mul(night).mul(0.045).min(3);
    let color: N = mix(water, sky, fresnel).add(sunColor.mul(glint).mul(fresnel.mul(4).add(0.25).min(1))).add(vec3(uLook.moon).mul(moonGlint));

    // ---- foam: where waves fold over, in storms, and along the shore
    // from far away single whitecaps cannot be seen: they become a faint paling of rough water
    const whitecaps = mix(foamTex.mul(smoothstep(0.75, 1.5, state)).add(smoothstep(1.45, 2.3, state).mul(fold).mul(0.6)), smoothstep(1.0, 2.2, state).mul(0.08), far);
    const shore = float(1).sub(smoothstep(0.0, 0.11, depthKm));
    const swash = sin(depthKm.mul(95).sub(uTime.mul(1.2)).add(grad.x.add(grad.z).mul(9))).mul(0.5).add(0.5);
    const edge = float(1).sub(smoothstep(0.0, 0.00009, path));
    const shoreFoam = shore.mul(smoothstep(0.55, 0.95, swash)).mul(0.6).add(edge.mul(0.85)).mul(smoothstep(-0.05, 0.02, depthKm));
    const foam = max(whitecaps, shoreFoam).clamp(0, 1);
    const whiteLit: N = sunColor.mul(sunVis).mul(max(dot(dir, L), 0).mul(0.8).add(0.2)).add(ambient.mul(1.6));
    color = mix(color, vec3(0.94, 0.96, 0.97).mul(whiteLit), foam.mul(0.92));
    // glowing plankton, stirred by breaking waves at night
    color = color.add(vec3(0.05, 0.75, 0.95).mul(C.b).mul(foam.add(crest.mul(0.6)).add(0.06)).mul(night).mul(uSeaGlow).mul(1.5));

    // ---- sea ice: pale sheets split by blue leads
    const e1: N = texture(erosionTex, dir.zy.mul(9)).mul(w.x).add(texture(erosionTex, dir.xz.mul(9)).mul(w.y)).add(texture(erosionTex, dir.xy.mul(9)).mul(w.z));
    const e2: N = texture(erosionTex, dir.zy.mul(70)).mul(w.x).add(texture(erosionTex, dir.xz.mul(70)).mul(w.y)).add(texture(erosionTex, dir.xy.mul(70)).mul(w.z));
    const ice = smoothstep(0.35, 0.6, iceRaw.add(e1.r.sub(0.5).mul(0.5)));
    const leads = pow(float(1).sub(abs(e2.r.mul(2).sub(1))), 10).mul(0.8);
    const iceColor: N = mix(vec3(0.9, 0.94, 0.98), vec3(0.25, 0.6, 0.9), leads).mul(whiteLit);
    color = mix(color, iceColor, ice);

    // ---- ships and platforms: dotted lines of lamps along the sea lanes, lone lights off advanced coasts
    if (civ) {
      const CA: N = samplePlanet(civ.a, dir);
      const CB: N = samplePlanet(civ.b, dir);
      const RD: N = samplePlanet(civ.roads.texture, dir);
      const strongest = max(max(CA.r, CA.g), CA.b);
      const hue: N = mix(vec3(1.0, 0.82, 0.55), CA.rgb.div(max(strongest, 0.04)), smoothstep(0.05, 0.3, strongest));
      const laneDist: N = RD.rgb.sub(0.5).mul(2 * civ.roads.range).length();
      const code = RD.a.mul(255);
      const isLane = smoothstep(127, 128, code);
      const px = camDist.mul(0.0011);
      const laneW = float(0.00016);
      const lane = smoothstep(laneW.add(px), laneW.mul(0.4), laneDist).mul(isLane).mul(laneW.div(laneW.add(px.mul(0.8))).clamp(0.3, 1));
      // ships are separate points of light moving slowly along the lane
      const along = dot(dir, vec3(0.37, 0.71, 0.59)).mul(2600).add(uTime.mul(0.05));
      const ships = smoothstep(0.72, 0.95, sin(along).mul(0.5).add(0.5));
      const platforms = smoothstep(0.985, 0.995, e2.g.mul(0.5).add(e2.r.mul(0.5)).add(e1.r.mul(0.12))).mul(smoothstep(0.82, 0.95, CB.g)).mul(smoothstep(0.2, 0.5, strongest)).mul(float(1).sub(smoothstep(0.25, 0.6, depthKm)));
      color = color.add(hue.mul(lane.mul(ships).mul(0.9).add(platforms.mul(1.6))).mul(night).mul(float(1).sub(ice)));
    }

    // a meteor strike sends a bright ring across the sea as well
    const impAge: N = uImpact.w;
    const impAng = sqrt(max(float(2).sub(dot(dir, uImpact.xyz).mul(2)), 0));
    const impRing = exp(impAng.sub(impAge.mul(0.085)).div(impAge.sqrt().mul(0.012).add(0.006)).pow(2).negate()).mul(exp(impAge.mul(-0.3))).mul(step(0, impAge));
    color = color.add(vec3(4.5, 2.6, 1.2).mul(impRing.mul(2)));

    // ---- from below: the bright window of sky overhead, darkness beyond it
    const cosUp = max(dot(V, Nw.negate()), 0);
    const windowAmt = smoothstep(0.62, 0.72, cosUp);
    const below: N = mix(deep.mul(0.6).add(shallow.mul(0.12)).mul(day.add(0.03)), sky.mul(1.4).add(sunColor.mul(pow(max(dot(V.negate(), L).negate(), 0), 40)).mul(4).mul(sunVis)), windowAmt);
    color = select(frontFacing, color, below);

    const OV: N = samplePlanet(data.overlay, dir);
    color = mix(color, OV.rgb.mul(OV.rgb).mul(0.85), select(frontFacing, uOverlay, float(0)));
    // aerial perspective, as on land
    const rim = pow(float(1).sub(max(dot(dir, V), 0)), 3);
    const haze: N = vec3(uHazeTint).mul(day.mul(0.9).add(0.02));
    color = mix(color, haze, select(frontFacing, rim.mul(0.3).mul(smoothstep(0.03, 0.9, camDist)).add(uHazeAmount).clamp(0, 0.9), float(0)));
    material.colorNode = color;
    void min; void vec2;

    this.sphere = new QuadSphere(material, segments, maxPatches);
    this.sphere.mesh.renderOrder = 1;
  }

  /** Advance the waves and choose the patches to draw. */
  update(renderer: WebGPURenderer, camera: Vector3, time: number, keep?: (face: number, x0: number, y0: number, size: number) => boolean): void {
    if (this.frame++ % this.fftEvery === 0) {
      const outs = this.fft.update(renderer, time * 0.75, 1.15);
      for (let c = 0; c < outs.length; c++) {
        this.dispNodes[c].value = outs[c]!.displacement;
        this.detailNodes[c].value = outs[c]!.detail;
      }
    }
    this.sphere.update(camera, this.split, this.maxLevel, keep);
  }
}
