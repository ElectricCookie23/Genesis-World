// The planet's surface: quadtree cube-sphere geometry displaced by the baked height map plus
// GPU-eroded detail, shaded per pixel with materials blended from slope, height, moisture and temperature.
import { MeshBasicNodeMaterial, type Texture, type Vector3 } from 'three/webgpu';
import {
  abs, atan, cameraPosition, cross, dot, exp, float, fract, max, min, mix, normalize, positionWorld, pow, reflect, select, sin, smoothstep, sqrt, step, texture, varying, vec2, vec3,
} from 'three/tsl';
import { EXAG, uExposure, uUnderwater, uFossil, uFungal, uImpact, uOverlay, uHazeAmount, uHazeTint, uMolten, uMoonDir, uRing, uSeaKm, uSun2, uSun2Dir, uSunDir, uTime } from '../common';
import { cloudShadowAt } from '../clouds';
import type { ErosionBake } from './erosion';
import { uLook } from './look';
import { samplePlanet, type PlanetData } from './planetdata';
import { QuadSphere, patchNodes } from './quadsphere';
import { RIVER_MAX_WIDTH, type RiverMap } from './rivermap';
import { uNightMap, type CivMap } from './civmap';
import { eclipseLight } from './eclipse';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** How many times the eroded detail tile repeats around the planet, coarse and fine. */
const TILE_COARSE = 9;
const TILE_FINE = 70;
const TILE_MICRO = 610;
/** Stored slopes are 0.22 x d(height)/d(uv); see ErosionBake's output pass. */
const SLOPE_UNIT = 1 / 0.22;

/**
 * Radius of the ground along a unit direction, for use in vertex shaders: the same baked elevation
 * plus eroded detail that the terrain itself is displaced by. Anything placed with this stands exactly on the land.
 */
let groundRivers: RiverMap | null = null;
/**
 * Rivers cut their beds into the ground that everything stands on. Set once, before any ground is built, so the
 * land, the plants, the buildings and the animals all agree on where the ground is.
 */
export function setGroundRivers(rivers: RiverMap | null): void { groundRivers = rivers; }

export function groundRadiusNode(data: PlanetData, erosionTex: Texture, dir: N): N {
  const s = (uvn: N): N => (texture(erosionTex, uvn) as any).level(0);
  const a = pow(abs(dir), vec3(4, 4, 4));
  const w = a.div(a.x.add(a.y).add(a.z));
  const tri = (scale: number): N => s(dir.zy.mul(scale)).r.mul(w.x).add(s(dir.xz.mul(scale)).r.mul(w.y)).add(s(dir.xy.mul(scale)).r.mul(w.z));
  const elev: N = (samplePlanet(data.height, dir) as any).level(0).r;
  const land = smoothstep(-0.25, 0.1, elev.sub(uSeaKm));
  const coarse = mix(float(0.1), float(0.55), smoothstep(0.2, 3.5, elev.sub(uSeaKm))).mul(mix(float(0.3), float(1), land));
  const fine = mix(float(0.012), float(0.04), land);
  // A river runs in a bed. The hills and hummocks of the detail are smoothed away along it and the ground is cut
  // down a little, so the water lies in a shallow valley. (It was painted on whatever the detail did, and on a real
  // GPU a river through a town ran up and over the bumps like a ribbon laid on the land.)
  let bed: N = float(0);
  if (groundRivers) {
    const RV: N = (samplePlanet(groundRivers.texture, dir) as any).level(0);
    const away = RV.rgb.sub(0.5).mul(2 * groundRivers.range).length();
    const width = RV.a.mul(RIVER_MAX_WIDTH);
    bed = smoothstep(width.mul(6).add(0.0018), width, away).mul(smoothstep(0.0, 0.02, RV.a)).mul(land);
  }
  const h = elev.add(tri(TILE_COARSE).sub(0.5).mul(2).mul(coarse).mul(float(1).sub(bed.mul(0.85)))).add(tri(TILE_FINE).sub(0.5).mul(2).mul(fine).mul(float(1).sub(bed))).sub(bed.mul(0.018));
  return float(1).add(h.mul(EXAG));
}

export class TerrainSurface {
  readonly sphere: QuadSphere;
  /** Deepest quadtree level allowed (lower on weak devices). */
  maxLevel = 11;
  split = 6.5;

  constructor(data: PlanetData, erosion: ErosionBake, rivers: RiverMap, segments = 32, maxPatches = 1200, private shadowSteps = 8, caustics?: { node: N; tile: number }, civ?: CivMap) {
    const material = new MeshBasicNodeMaterial();
    const eros = erosion.texture;

    /** Eroded detail sampled on three planes and blended, so it never stretches. lod is set in the vertex stage. */
    const triplanar = (p: N, scale: number, w: N, lod: boolean): N => {
      const s = (uvn: N) => (lod ? (texture(eros, uvn) as any).level(0) : texture(eros, uvn));
      return s(p.zy.mul(scale)).mul(w.x).add(s(p.xz.mul(scale)).mul(w.y)).add(s(p.xy.mul(scale)).mul(w.z));
    };
    const weights = (dir: N): N => { const a = pow(abs(dir), vec3(4, 4, 4)); return a.div(a.x.add(a.y).add(a.z)); };
    /** How strongly eroded detail shows: bold in mountains, gentle on plains, faint under the sea. */
    const amplitudes = (elev: N): { coarse: N; fine: N } => {
      const land = smoothstep(-0.25, 0.1, elev.sub(uSeaKm));
      const coarse = mix(float(0.1), float(0.55), smoothstep(0.2, 3.5, elev.sub(uSeaKm))).mul(mix(float(0.3), float(1), land));
      return { coarse, fine: mix(float(0.012), float(0.04), land) };
    };

    // ---------------- vertex: place the patch on the sphere and displace it
    const pn = patchNodes();
    const vDir: N = pn.dir;
    const vA: N = (samplePlanet(data.height, vDir) as any).level(0);
    const vw = weights(vDir);
    const vAmp = amplitudes(vA.r);
    const vH = vA.r
      .add(triplanar(vDir, TILE_COARSE, vw, true).r.sub(0.5).mul(2).mul(vAmp.coarse))
      .add(triplanar(vDir, TILE_FINE, vw, true).r.sub(0.5).mul(2).mul(vAmp.fine));
    // skirts hang below the surface by a fraction of the patch width
    material.positionNode = vDir.mul(float(1).add(vH.mul(EXAG)).sub(pn.skirt.mul(pn.size).mul(0.06)));

    // ---------------- fragment: materials and light
    const P: N = positionWorld;
    const dir: N = normalize(P);
    const A: N = samplePlanet(data.height, dir);
    const B: N = samplePlanet(data.cover, dir);
    const C: N = samplePlanet(data.life, dir);
    const X: N = samplePlanet(data.extra, dir);
    const w = weights(dir);
    const e1: N = triplanar(dir, TILE_COARSE, w, false);
    const e2: N = triplanar(dir, TILE_FINE, w, false);
    const amp = amplitudes(A.r);
    const h: N = A.r.add(e1.r.sub(0.5).mul(2).mul(amp.coarse)).add(e2.r.sub(0.5).mul(2).mul(amp.fine));
    const above: N = h.sub(uSeaKm);

    // large-scale slope from the baked height map
    const pole = abs(dir.y).greaterThan(0.99);
    const t1: N = normalize(cross(select(pole, vec3(1, 0, 0), vec3(0, 1, 0)), dir));
    const t2: N = cross(dir, t1);
    const eps = 0.006;
    const hE: N = samplePlanet(data.height, normalize(dir.add(t1.mul(eps)))).r, hW: N = samplePlanet(data.height, normalize(dir.sub(t1.mul(eps)))).r;
    const hN: N = samplePlanet(data.height, normalize(dir.add(t2.mul(eps)))).r, hS: N = samplePlanet(data.height, normalize(dir.sub(t2.mul(eps)))).r;
    const hx = hE.sub(hW), hz = hN.sub(hS);
    const macro: N = t1.mul(hx).add(t2.mul(hz)).mul(EXAG / (2 * eps));
    // fine slope from the eroded detail, plane by plane
    const detailGrad = (e: N, scale: number, a: N): N => {
      const k = a.mul(2 * scale * SLOPE_UNIT * EXAG);
      const gx = vec3(0, e.b, e.g).mul(w.x), gy = vec3(e.g, 0, e.b).mul(w.y), gz = vec3(e.g, e.b, 0).mul(w.z);
      return gx.add(gy).add(gz).mul(k);
    };
    // the fine layer fades with distance so far-off ground does not shimmer
    const camDist: N = cameraPosition.sub(P).length();
    const fineFade = smoothstep(0.9, 0.05, camDist);
    // a third, very fine layer appears only near the camera: pebbles, cracks and tussocks underfoot
    const microFade = smoothstep(0.07, 0.008, camDist);
    const e3: N = triplanar(dir, TILE_MICRO, w, false);
    const grad: N = macro.add(detailGrad(e1, TILE_COARSE, amp.coarse)).add(detailGrad(e2, TILE_FINE, amp.fine).mul(fineFade))
      .add(detailGrad(e3, TILE_MICRO, float(0.0045)).mul(microFade));
    const Nrm: N = normalize(dir.sub(grad.sub(dir.mul(dot(grad, dir)))));
    const slope: N = float(1).sub(dot(Nrm, dir)).clamp(0, 1);
    const steep: N = smoothstep(0.05, 0.2, slope);

    // rivers: distance to the nearest centre line, from the vector field in the river map
    const RV: N = samplePlanet(rivers.texture, dir);
    const riverDist: N = RV.rgb.sub(0.5).mul(2 * rivers.range).length();
    const riverWidth: N = RV.a.mul(RIVER_MAX_WIDTH);
    const hasRiver = smoothstep(0.0, 0.02, RV.a).mul(smoothstep(0.0, 0.03, above));
    const pixel = camDist.mul(0.0011);
    const river: N = smoothstep(riverWidth.add(pixel), riverWidth.mul(0.7).sub(pixel.mul(0.3)), riverDist).mul(hasRiver).mul(riverWidth.div(riverWidth.add(pixel.mul(0.7))).clamp(0.25, 1));
    const bank: N = smoothstep(riverWidth.mul(5).add(0.0012), riverWidth, riverDist).mul(hasRiver);

    const temp: N = A.g, moist: N = A.b, snow: N = A.a;
    const veg: N = B.r, canopy: N = B.g, ash: N = B.b, heat: N = B.a;
    const rockA: N = vec3(uLook.rockA), rockB: N = vec3(uLook.rockB), rockC: N = vec3(uLook.rockC);
    const sandC: N = vec3(uLook.sand), soilC: N = vec3(uLook.soil);

    // rock: layered strata that follow height, with thin bright mineral bands
    // The layers are bent by the two coarser detail scales and the mineral band is faint: as level, evenly spaced
    // bright lines they read as map contours drawn on every hillside and shore.
    const strata = fract(h.mul(1.25).add(e1.r.mul(0.5)).add(e2.r.mul(0.9)).add(e3.r.mul(0.35)));
    let rock: N = mix(rockA, rockB, smoothstep(0.3, 0.7, strata));
    rock = mix(rock, rockC.mul(1.25), smoothstep(0.88, 0.94, strata).mul(smoothstep(1.0, 0.95, strata)).mul(0.28));
    // loose ground: dark wet soil through to pale dry sand
    const dry = float(1).sub(smoothstep(0.08, 0.32, moist));
    const hot = smoothstep(8, 22, temp);
    let ground: N = mix(soilC.mul(float(1).sub(moist.mul(0.4))), sandC, dry);
    // salt crust in hot dry basins, cracked into pale plates
    const basin = float(1).sub(smoothstep(0.04, 0.22, above));
    const saltAmt = dry.mul(hot).mul(basin).mul(smoothstep(-0.02, 0.02, above));
    const plates = smoothstep(0.47, 0.5, abs(e2.r.sub(0.5)).add(0.42));
    ground = mix(ground, mix(vec3(0.9, 0.88, 0.84), vec3(0.62, 0.6, 0.58), plates), saltAmt);
    let albedo: N = mix(ground, rock, max(steep, smoothstep(3.0, 5.0, above).mul(0.75)));
    // where water has run, the ground is darker and smoother
    albedo = albedo.mul(float(1).sub(e1.a.mul(0.3)));
    // living ground cover in this world's own pigments
    const pigment: N = mix(vec3(uLook.pigmentA), vec3(uLook.pigmentB), X.g);
    // plants crowd the river banks, even in dry country
    const vegMask = smoothstep(0.12, 0.55, veg.mul(bank.mul(1.2).add(1.25)).add(bank.mul(smoothstep(0.02, 0.2, veg)).mul(0.25)).add(e2.r.sub(0.5).mul(0.45))).mul(float(1).sub(steep.mul(0.75)));
    const litter: N = mix(soilC.mul(0.7), pigment.mul(0.34), 0.42);
    const meadow: N = mix(pigment.mul(0.62), mix(pigment.mul(0.9), sandC, 0.4), smoothstep(0.3, 0.75, e2.r));
    const forestFloor = smoothstep(0.12, 0.55, canopy);
    // under trees the ground lies in broken shade
    const dapple = mix(float(1), smoothstep(0.3, 0.7, e2.r).mul(0.5).add(0.5), forestFloor);
    albedo = mix(albedo, mix(meadow, litter, forestFloor).mul(e2.r.mul(0.4).add(0.8)).mul(dapple), vegMask.mul(0.94));
    // farmland: ploughed strips in alternating crops
    const rows = sin(dot(dir, t1).mul(5200).add(e1.r.mul(40))).mul(0.5).add(0.5);
    albedo = mix(albedo, mix(sandC.mul(0.8), pigment.mul(1.4), rows), C.r.mul(0.8).mul(float(1).sub(steep)));
    // trails worn by herds: the ground along a route is trampled paler and barer, in soft uneven patches. (Drawn as
    // thin lines along the detail noise they followed its contours and read as terraces on every shore.)
    const trodden = smoothstep(0.35, 0.9, X.r).mul(smoothstep(0.35, 0.7, e2.r.mul(0.6).add(e1.r.mul(0.4)))).mul(smoothstep(-0.01, 0.03, above)).mul(float(1).sub(smoothstep(0.3, 1.5, snow))).mul(float(1).sub(steep));
    albedo = mix(albedo, mix(soilC, sandC, 0.6).mul(1.05), trodden.mul(0.35));
    albedo = albedo.mul(mix(float(1), e3.r.mul(0.7).add(0.65), microFade));
    // hot springs: a pool of mineral-blue water in a pale crust, ringed with rust-coloured terraces
    const springField: N = samplePlanet(data.overlay, dir).a.mul(e1.r.mul(0.7).add(0.55));
    const pool = smoothstep(0.62, 0.7, springField).mul(smoothstep(-0.01, 0.03, above));
    const rimBand = smoothstep(0.42, 0.6, springField).mul(float(1).sub(pool)).mul(smoothstep(-0.01, 0.03, above));
    const terraces = fract(springField.mul(18)).mul(0.5).add(0.6);
    albedo = mix(albedo, mix(vec3(0.85, 0.5, 0.2), vec3(0.93, 0.9, 0.82), smoothstep(0.5, 0.6, springField)).mul(terraces), rimBand.mul(0.85));
    albedo = mix(albedo, mix(vec3(0.1, 0.75, 0.8), vec3(0.04, 0.3, 0.6), smoothstep(0.7, 0.95, springField)), pool);
    albedo = mix(albedo, vec3(0.045, 0.04, 0.045), ash.mul(0.9));
    albedo = albedo.mul(float(1).sub(bank.mul(0.22)));
    // river water: the colour of this world's shallows, rippling downstream
    const ripple = sin(e2.r.mul(30).add(e3.r.mul(12)).sub(uTime.mul(2.4))).mul(0.5).add(0.5);
    const riverColor: N = mix(vec3(uLook.oceanDeep), vec3(uLook.oceanShallow), ripple.mul(0.25).add(0.3)).mul(0.75);
    albedo = mix(albedo, riverColor, river);
    // sea bed: pale sand in the shallows, dark silt in the deep, coral where it grows
    const depth = above.negate();
    let seabed: N = mix(sandC.mul(0.95), soilC.mul(0.3), smoothstep(0.0, 1.6, depth));
    const reef = C.g.mul(2).sub(1);
    seabed = mix(seabed, mix(vec3(0.95, 0.4, 0.5), vec3(0.2, 0.8, 0.7), e2.r), max(reef, 0).mul(0.75));
    seabed = mix(seabed, vec3(0.93, 0.93, 0.9), max(reef.negate(), 0).mul(0.8));
    albedo = mix(albedo, seabed, smoothstep(0.02, -0.05, above));
    // snow and ice: settles on gentle slopes; thick ice shows blue fracture lines
    // Deep snow lies unbroken: the ground's own roughness only shows through a thin cover, and only the steepest
    // faces shed a thick one. (From 5 km a snowfield was a harsh dark-and-white speckle that read as gravel, on a
    // real GPU: every bump of the detail noise broke the cover, however deep.)
    const deepSnow = smoothstep(1.2, 4.0, snow);
    const snowAmt = smoothstep(0.25, 1.6, snow.add(e2.r.sub(0.5).mul(mix(float(0.9), float(0.15), deepSnow)))).mul(float(1).sub(steep.mul(mix(float(0.65), float(0.25), deepSnow)))).mul(smoothstep(-0.03, 0.02, above));
    const fracture = pow(float(1).sub(abs(e1.r.mul(2).sub(1))), 14).mul(smoothstep(6, 20, snow));
    albedo = mix(albedo, mix(vec3(0.9, 0.93, 0.97), vec3(0.3, 0.62, 0.92), fracture), snowAmt);

    // ---- light
    const L = uSunDir, M = uMoonDir;
    const sunH = dot(dir, L);
    const day = smoothstep(-0.2, 0.3, sunH);
    const sunColor = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.06, 0.36, sunH)).mul(1.25);
    const shadow: N = cloudShadowAt(P, C.a);
    const ringShade = float(1).sub(uRing.mul(smoothstep(0.085, 0.02, abs(dir.y))).mul(0.55));
    // mountains cast shadows: march the height map toward the star and see whether the ground rises above the ray
    const origin: N = dir.mul(float(1).add(A.r.mul(EXAG)));
    let occl: N = float(0);
    for (let i = 0; i < this.shadowSteps; i++) {
      const sLen = 0.0035 * Math.pow(1.62, i * (9 / this.shadowSteps));
      const q: N = origin.add(L.mul(sLen));
      const qr: N = q.length();
      const gh: N = float(1).add((samplePlanet(data.height, q.div(qr)) as any).r.mul(EXAG));
      occl = max(occl, gh.sub(qr).div(sLen * 0.09));
    }
    const terrainShadow: N = float(1).sub(occl.clamp(0, 1));
    // hollows see less sky
    const hollow = hE.add(hW).add(hN).add(hS).mul(0.25).sub(A.r);
    const ao: N = float(1).sub(hollow.mul(1.1).clamp(0, 0.55)).mul(mix(float(0.62), float(1), smoothstep(0.25, 0.6, e1.r))).mul(mix(float(1), e2.r.mul(0.5).add(0.72).min(1), fineFade));
    // sunlight focused by the waves dances on the shallow sea bed
    let causticLight: N = float(1);
    if (caustics) {
      const T = caustics.tile;
      const drift = vec3(uTime.mul(0.00002), 0, uTime.mul(0.000013));
      const cj = (s: number): N => { const q: N = dir.mul(s).add(drift); return caustics.node.sample(q.zy.div(T)).a.mul(w.x).add(caustics.node.sample(q.xz.div(T)).a.mul(w.y)).add(caustics.node.sample(q.xy.div(T)).a.mul(w.z)); };
      const focus = pow(float(1.22).sub(cj(1)).clamp(0, 1.2), 3).add(pow(float(1.22).sub(cj(2.7)).clamp(0, 1.2), 3)).mul(1.6);
      // from above the dancing light only shows in the shallows; from under water it plays over the whole lit bed
      const reach = mix(smoothstep(0.12, 0.5, above.negate()), smoothstep(0.7, 1.6, above.negate()), uUnderwater);
      const wet = smoothstep(0.0, -0.03, above).mul(float(1).sub(reach));
      causticLight = mix(float(1), focus.mul(mix(float(1), float(1.5), uUnderwater)).add(0.72), wet);
    }
    const eclipse: N = eclipseLight(P);
    const direct = max(dot(Nrm, L), 0).mul(smoothstep(-0.1, 0.14, sunH)).mul(shadow).mul(ringShade).mul(terrainShadow).mul(causticLight).mul(eclipse);
    const skyLight = mix(vec3(uLook.sky), vec3(0.6, 0.6, 0.6), 0.4).mul(0.2).mul(day).mul(dot(Nrm, dir).mul(0.4).add(0.6)).mul(ao).mul(eclipse.mul(0.75).add(0.25));
    // the moon lights the night side in its own tint; airglow and starlight keep the rest from going black
    const moonUp = smoothstep(-0.1, 0.25, dot(dir, M));
    const moonLight = vec3(uLook.moon).mul(0.05).mul(max(dot(Nrm, M), 0).mul(0.8).add(0.2)).mul(moonUp).mul(float(1).sub(day)).mul(ao.mul(0.6).add(0.4));
    const airglow = vec3(0.006, 0.01, 0.009).add(vec3(uLook.sky).mul(0.005));
    // a second sun casts its own shadows, so under two suns every mountain has two
    let occl2: N = float(0);
    for (let i = 0; i < Math.max(2, Math.floor(this.shadowSteps / 2)); i++) {
      const sLen = 0.005 * Math.pow(2.3, i);
      const q2: N = origin.add(uSun2Dir.mul(sLen));
      const qr2: N = q2.length();
      occl2 = max(occl2, float(1).add((samplePlanet(data.height, q2.div(qr2)) as any).r.mul(EXAG)).sub(qr2).div(sLen * 0.09));
    }
    const second = max(dot(Nrm, uSun2Dir), 0).mul(smoothstep(-0.1, 0.25, dot(dir, uSun2Dir))).mul(uSun2).mul(0.45).mul(float(1).sub(occl2.clamp(0, 1)));
    const V: N = normalize(cameraPosition.sub(P));
    const gloss = snowAmt.mul(0.45).add(saltAmt.mul(0.25)).add(e1.a.mul(moist).mul(0.3)).mul(float(1).sub(river)).add(river.mul(float(1).sub(snowAmt)).mul(0.55));
    const specN: N = (normalize as any)((mix as any)(Nrm, dir, river));
    const spec = pow(max(dot(reflect(V.negate(), specN), L), 0), 48).mul(gloss).mul(day).mul(shadow)
      .add(pow(max(dot(reflect(V.negate(), specN), M), 0), 48).mul(river).mul(0.12).mul(moonUp).mul(float(1).sub(day)));
    let lit: N = albedo.mul(sunColor.mul(direct).add(vec3(0.7, 0.8, 1.0).mul(second)).add(skyLight).add(moonLight).add(airglow)).add(sunColor.mul(spec));

    // molten crust during the opening sequence
    const cracks = smoothstep(0.12, -0.1, abs(e1.r.sub(0.5).mul(2.2)).sub(uMolten.mul(uMolten).mul(0.5)));
    const molten = mix(vec3(0.035, 0.012, 0.01), vec3(2.3, 0.5, 0.05), cracks).add(vec3(1.4, 0.8, 0.2).mul(pow(max(cracks, 0), 8)).mul(uMolten));
    lit = mix(lit, molten, smoothstep(0, 0.6, uMolten));
    // lava and fire glow through whatever is on top
    // lava: a dark crust that splits into glowing cracks, wider and brighter the hotter it is; fire burns in the same way through plants
    const flicker = sin(uTime.mul(9).add(P.x.mul(700)).add(P.z.mul(500))).mul(0.2).add(0.8);
    const crustN = e2.r.mul(0.6).add(e3.r.mul(0.4)).add(sin(uTime.mul(0.3).add(e1.r.mul(20))).mul(0.03));
    const crackW = heat.mul(0.55).add(0.03);
    const lavaCracks = float(1).sub(smoothstep(crackW.mul(0.4), crackW, abs(crustN.sub(0.5)).mul(2)));
    const crusted = smoothstep(0.08, 0.4, heat);
    lit = mix(lit, lit.mul(0.25).add(vec3(0.02, 0.014, 0.012)), crusted.mul(0.8));
    lit = lit.add(mix(vec3(2.6, 0.45, 0.04), vec3(4.2, 2.0, 0.5), lavaCracks.mul(heat)).mul(lavaCracks.mul(pow(max(heat, 0), 0.5)).mul(1.6).add(heat.mul(heat).mul(0.5))).mul(flicker));
    // a meteor strike: a ring of fire racing outward over the ground, and a crater that glows for a while
    // No strike is under way while uImpact.w is negative. The age is clamped before the square root: the root of a
    // negative number is not a number on real GPUs, and multiplying by zero afterwards does not clear it, which
    // turned the whole surface black whenever no strike was in progress.
    const impAge: N = max(uImpact.w, 0);
    const impAng = sqrt(max(float(2).sub(dot(dir, uImpact.xyz).mul(2)), 0));
    const impOn = step(0, uImpact.w);
    const ringR = impAge.mul(0.085);
    const ring = exp(impAng.sub(ringR).div(impAge.sqrt().mul(0.012).add(0.006)).pow2().negate()).mul(exp(impAge.mul(-0.3))).mul(impOn);
    const rays = pow(sin(atan(dot(dir, t2).sub(dot(uImpact.xyz, t2)), dot(dir, t1).sub(dot(uImpact.xyz, t1))).mul(17).add(e1.r.mul(9))).mul(0.5).add(0.5), 3);
    const crater = exp(impAng.div(0.035).pow2().negate()).mul(exp(impAge.mul(-0.03))).mul(impOn);
    const ejecta = exp(impAng.div(0.11).pow2().negate()).mul(rays).mul(exp(impAge.mul(-0.08))).mul(impOn).mul(0.6);
    lit = lit.add(vec3(4.5, 2.4, 0.9).mul(ring.mul(2.5))).add(vec3(3.6, 0.9, 0.1).mul(crater.mul(e2.r.mul(1.2).add(0.4)).add(ejecta)));
    // ---- civilization: city light in each nation's own colour, roads, and (with the Night Map on) borders
    if (civ) {
      const CA: N = samplePlanet(civ.a, dir);
      const CB: N = samplePlanet(civ.b, dir);
      const RD: N = samplePlanet(civ.roads.texture, dir);
      const strongest = max(max(CA.r, CA.g), CA.b);
      const hue: N = CA.rgb.div(max(strongest, 0.04));
      const claimed = smoothstep(0.1, 0.45, strongest);
      const nightAmt = float(1).sub(day);
      const landMask = smoothstep(-0.01, 0.03, above);
      const glowI: N = CA.a;
      // roads first: cities stretch out along them
      const roadDist: N = RD.rgb.sub(0.5).mul(2 * civ.roads.range).length();
      const code = RD.a.mul(255);
      const isRoad = smoothstep(0.5, 1.5, code).mul(float(1).sub(smoothstep(127, 128, code)));
      const importance = code.div(127).clamp(0, 1);
      const roadW = importance.mul(0.00022).add(0.00012);
      const px = camDist.mul(0.0011);
      const roadLine = smoothstep(roadW.add(px), roadW.mul(0.4), roadDist).mul(isRoad).mul(roadW.div(roadW.add(px.mul(0.6))).clamp(0.45, 1)).mul(landMask);
      const roadNear = float(1).sub(smoothstep(roadW.mul(4), roadW.mul(30), roadDist)).mul(isRoad);
      // a dense core that breaks up toward the edge into blocks, threads and scattered points
      const coarse = smoothstep(0.3, 0.7, e1.r);
      const reachI = glowI.mul(coarse.mul(0.8).add(0.5)).add(glowI.mul(roadNear).mul(0.6));
      const fray = e2.r.mul(0.6).add(e3.r.mul(0.4));
      const lower = float(0.66).sub(reachI.mul(0.8));
      const built = smoothstep(lower, lower.add(0.18), fray).mul(smoothstep(0.0, 0.04, glowI));
      const streets = pow(float(1).sub(abs(e3.r.mul(2).sub(1))), 5).mul(1.6).add(pow(float(1).sub(abs(e2.r.mul(2).sub(1))), 7));
      const tech: N = CB.g;
      const fire = float(1).sub(smoothstep(0.35, 0.55, tech)).mul(sin(uTime.mul(7).add(P.x.mul(900)).add(P.z.mul(1300))).mul(0.25));
      const warFlick = float(1).sub(CB.b.mul(sin(uTime.mul(11).add(P.y.mul(1700)).add(e2.r.mul(30))).mul(0.5).add(0.5)).mul(0.9));
      const alive = float(1).sub(CB.a.mul(0.95)).mul(warFlick);
      const cityLight = built.mul(streets.add(0.12)).mul(pow(reachI.min(1), 0.8).mul(0.65).add(0.35)).mul(fire.add(1)).mul(alive).mul(landMask);
      const traffic = e3.r.mul(0.8).add(0.5);
      lit = mix(lit, lit.mul(0.6).add(sandC.mul(0.35).mul(day)), roadLine.mul(0.5).mul(day));
      // Around a town the ground is worked and trodden: bare earth between the houses, broken up so it is not a flat
      // stain. (Seen on a real GPU: buildings standing in untouched wild grass, with nothing between them.)
      const worked = smoothstep(0.03, 0.22, glowI).mul(landMask).mul(e2.r.mul(0.5).add(0.5)).mul(float(1).sub(smoothstep(0.5, 3.0, camDist)));
      lit = mix(lit, lit.mul(0.55).add(soilC.mul(0.3).add(sandC.mul(0.18)).mul(day.add(0.04))), worked.mul(0.6));
      const roadLight = roadLine.mul(importance.mul(0.6).add(0.4)).mul(traffic).mul(alive).mul(0.9);
      // up close the light comes from real windows and lamps, so the painted glow steps back
      // (It steps back further and over a longer distance than it did: from low over a town at night the painted
      // glow was large hard-edged white patches, far brighter than anything else, because the exposure opens up in
      // the dark. The glow is also held back by that exposure, as the stars are.)
      // (Second check on the GPU: from low over a town the patches were dimmer but still there, with hard ragged
      // edges, and a village's road was a bright painted ribbon. Below about a tenth of a radius the painted light
      // is gone altogether and the windows carry the scene; it returns gradually with height.)
      const paint = smoothstep(0.1, 0.9, camDist);
      const heldBack = float(1).div(max(uExposure, 1)).pow(0.5);
      lit = lit.add(hue.mul(cityLight.mul(1.25).mul(paint).add(roadLight.mul(smoothstep(0.08, 0.7, camDist)))).mul(nightAmt).mul(heldBack));
      // the Night Map: borders as fine bright lines, and a faint wash of each nation's colour over its land
      // Borders are known cell by cell, and drawn straight they step along the six-sided cells. The line is read a
      // little to one side and the other as it goes (a slow wander of about a third of a cell), so it runs like a
      // border drawn by hand along rivers and ridges instead of along a honeycomb.
      const wander: N = vec3(
        sin(dir.y.mul(190).add(dir.z.mul(137))).add(sin(dir.z.mul(83).sub(dir.x.mul(61))).mul(0.6)),
        sin(dir.z.mul(173).add(dir.x.mul(149))).add(sin(dir.x.mul(79).sub(dir.y.mul(67))).mul(0.6)),
        sin(dir.x.mul(181).add(dir.y.mul(131))).add(sin(dir.y.mul(89).sub(dir.z.mul(71))).mul(0.6)),
      ).mul(0.0042);
      const CBw: N = samplePlanet(civ.b, normalize(dir.add(wander)));
      const border = float(1).sub(smoothstep(0.2, 0.42, CBw.r));
      const frontier = float(1).sub(smoothstep(0.6, 0.78, CBw.r)).mul(0.3);
      const lineAmt = max(border, frontier).mul(landMask).mul(uNightMap);
      lit = lit.add(hue.mul(claimed).mul(0.03).mul(uNightMap).mul(landMask));
      lit = mix(lit, hue.mul(1.5).add(0.12), lineAmt.mul(0.9));
    }
    // the fungal view: the ground goes dark and the threads that join the great fungi show as a glowing web
    const OVf: N = samplePlanet(data.overlay, dir);
    const threads = pow(float(1).sub(abs(e2.r.mul(2).sub(1))), 9).add(pow(float(1).sub(abs(e3.r.mul(2).sub(1))), 7).mul(0.6)).add(pow(float(1).sub(abs(e1.r.mul(2).sub(1))), 12).mul(0.8));
    const web: N = vec3(0.2, 1.0, 0.75).mul(threads).mul(OVf.g.mul(OVf.g)).mul(sin(uTime.mul(0.8).add(e1.r.mul(30))).mul(0.25).add(0.85)).mul(1.6);
    lit = mix(lit, lit.mul(0.1).add(vec3(0.004, 0.008, 0.01)).add(web), uFungal.mul(smoothstep(-0.02, 0.02, above)));
    // the fossil view: the ground turns to dark glass with its layers showing, so the bones in it can be seen
    const layers = smoothstep(0.9, 1.0, fract(h.mul(6).add(e1.r.mul(0.6)))).mul(0.5);
    lit = mix(lit, vec3(0.03, 0.045, 0.07).add(vec3(0.25, 0.4, 0.55).mul(layers)).mul(max(dot(Nrm, normalize(dir.add(t1.mul(0.6)))), 0).mul(0.6).add(0.5)), uFossil.mul(0.92));
    // data overlays replace the surface colour but keep the shape of the land readable
    const OV: N = OVf;
    const relief = max(dot(Nrm, normalize(dir.add(t1.mul(0.6)).add(t2.mul(0.3)))), 0).mul(0.6).add(0.45);
    lit = mix(lit, OV.rgb.mul(OV.rgb).mul(relief), uOverlay);
    // aerial perspective: distant ground takes on the colour of the air
    const rim = pow(float(1).sub(dot(dir, V).clamp(0, 1)), 3);
    const far = smoothstep(0.03, 0.9, camDist);
    const haze = vec3(uHazeTint).mul(day.mul(0.9).add(0.02));
    lit = mix(lit, haze, rim.mul(0.3).mul(far).add(uHazeAmount).clamp(0, 0.9).mul(float(1).sub(uMolten)));
    material.colorNode = lit;
    void varying; void vec2; void min;

    this.sphere = new QuadSphere(material, segments, maxPatches);
  }

  update(camera: Vector3): void {
    this.sphere.update(camera, this.split, this.maxLevel);
  }
}
