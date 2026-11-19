// The planet's surface: quadtree cube-sphere geometry displaced by the baked height map plus
// GPU-eroded detail, shaded per pixel with materials blended from slope, height, moisture and temperature.
import { MeshBasicNodeMaterial, type Texture, type Vector3 } from 'three/webgpu';
import {
  abs, cameraPosition, cross, dot, float, fract, max, min, mix, normalize, positionWorld, pow, reflect, select, sin, smoothstep, texture, varying, vec2, vec3,
} from 'three/tsl';
import { EXAG, uOverlay, uHazeAmount, uHazeTint, uMolten, uMoonDir, uRing, uSeaKm, uSun2, uSun2Dir, uSunDir, uTime } from '../common';
import { cloudShadowAt } from '../clouds';
import type { ErosionBake } from './erosion';
import { uLook } from './look';
import { samplePlanet, type PlanetData } from './planetdata';
import { QuadSphere, patchNodes } from './quadsphere';
import { RIVER_MAX_WIDTH, type RiverMap } from './rivermap';
import { uNightMap, type CivMap } from './civmap';

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
export function groundRadiusNode(data: PlanetData, erosionTex: Texture, dir: N): N {
  const s = (uvn: N): N => (texture(erosionTex, uvn) as any).level(0);
  const a = pow(abs(dir), vec3(4, 4, 4));
  const w = a.div(a.x.add(a.y).add(a.z));
  const tri = (scale: number): N => s(dir.zy.mul(scale)).r.mul(w.x).add(s(dir.xz.mul(scale)).r.mul(w.y)).add(s(dir.xy.mul(scale)).r.mul(w.z));
  const elev: N = (samplePlanet(data.height, dir) as any).level(0).r;
  const land = smoothstep(-0.25, 0.1, elev.sub(uSeaKm));
  const coarse = mix(float(0.1), float(0.55), smoothstep(0.2, 3.5, elev.sub(uSeaKm))).mul(mix(float(0.3), float(1), land));
  const fine = mix(float(0.012), float(0.04), land);
  const h = elev.add(tri(TILE_COARSE).sub(0.5).mul(2).mul(coarse)).add(tri(TILE_FINE).sub(0.5).mul(2).mul(fine));
  return float(1).add(h.mul(EXAG));
}

export class TerrainSurface {
  readonly sphere: QuadSphere;
  /** Deepest quadtree level allowed (lower on weak devices). */
  maxLevel = 11;
  split = 5;

  constructor(data: PlanetData, erosion: ErosionBake, rivers: RiverMap, segments = 32, maxPatches = 800, private shadowSteps = 8, caustics?: { node: N; tile: number }, civ?: CivMap) {
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
    const strata = fract(h.mul(1.25).add(e1.r.mul(0.5)));
    let rock: N = mix(rockA, rockB, smoothstep(0.3, 0.7, strata));
    rock = mix(rock, rockC.mul(1.5), smoothstep(0.9, 0.94, strata).mul(smoothstep(1.0, 0.96, strata)).mul(0.8));
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
    albedo = mix(albedo, pigment.mul(float(1).sub(canopy.mul(0.4))).mul(e2.r.mul(0.6).add(0.7)), vegMask);
    // farmland: ploughed strips in alternating crops
    const rows = sin(dot(dir, t1).mul(5200).add(e1.r.mul(40))).mul(0.5).add(0.5);
    albedo = mix(albedo, mix(sandC.mul(0.8), pigment.mul(1.4), rows), C.r.mul(0.8).mul(float(1).sub(steep)));
    albedo = albedo.mul(mix(float(1), e3.r.mul(0.7).add(0.65), microFade));
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
    const snowAmt = smoothstep(0.25, 1.6, snow.add(e2.r.sub(0.5).mul(0.9))).mul(float(1).sub(steep.mul(0.65))).mul(smoothstep(-0.03, 0.02, above));
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
      const wet = smoothstep(0.0, -0.03, above).mul(float(1).sub(smoothstep(0.12, 0.5, above.negate())));
      causticLight = mix(float(1), focus.add(0.72), wet);
    }
    const direct = max(dot(Nrm, L), 0).mul(smoothstep(-0.1, 0.14, sunH)).mul(shadow).mul(ringShade).mul(terrainShadow).mul(causticLight);
    const skyLight = mix(vec3(uLook.sky), vec3(0.6, 0.6, 0.6), 0.4).mul(0.2).mul(day).mul(dot(Nrm, dir).mul(0.4).add(0.6)).mul(ao);
    // the moon lights the night side in its own tint; airglow and starlight keep the rest from going black
    const moonUp = smoothstep(-0.1, 0.25, dot(dir, M));
    const moonLight = vec3(uLook.moon).mul(0.05).mul(max(dot(Nrm, M), 0).mul(0.8).add(0.2)).mul(moonUp).mul(float(1).sub(day)).mul(ao.mul(0.6).add(0.4));
    const airglow = vec3(0.006, 0.01, 0.009).add(vec3(uLook.sky).mul(0.005));
    const second = max(dot(Nrm, uSun2Dir), 0).mul(smoothstep(-0.1, 0.25, dot(dir, uSun2Dir))).mul(uSun2).mul(0.45);
    const V: N = normalize(cameraPosition.sub(P));
    const gloss = snowAmt.mul(0.45).add(saltAmt.mul(0.25)).add(e1.a.mul(moist).mul(0.3)).mul(float(1).sub(river)).add(river.mul(float(1).sub(snowAmt)).mul(0.55));
    const specN: N = (normalize as any)((mix as any)(Nrm, dir, river));
    const spec = pow(max(dot(reflect(V.negate(), specN), L), 0), 48).mul(gloss).mul(day).mul(shadow)
      .add(pow(max(dot(reflect(V.negate(), specN), M), 0), 48).mul(river).mul(0.12).mul(moonUp).mul(float(1).sub(day)));
    let lit: N = albedo.mul(sunColor.mul(direct).add(vec3(0.7, 0.8, 1.0).mul(second)).add(skyLight).add(moonLight).add(airglow)).add(sunColor.mul(spec));

    // molten crust during the opening sequence
    const cracks = smoothstep(0.12, -0.1, abs(e1.r.sub(0.5).mul(2.2)).sub(uMolten.mul(uMolten).mul(0.5)));
    const molten = mix(vec3(0.035, 0.012, 0.01), vec3(2.3, 0.5, 0.05), cracks).add(vec3(1.4, 0.8, 0.2).mul(pow(cracks, 8)).mul(uMolten));
    lit = mix(lit, molten, smoothstep(0, 0.6, uMolten));
    // lava and fire glow through whatever is on top
    const flicker = sin(uTime.mul(9).add(P.x.mul(700)).add(P.z.mul(500))).mul(0.2).add(0.8);
    lit = lit.add(vec3(3.2, 0.75, 0.08).mul(heat.mul(heat)).mul(flicker).mul(e2.r.mul(0.8).add(0.6)));
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
      const roadLight = roadLine.mul(importance.mul(0.6).add(0.4)).mul(traffic).mul(alive).mul(0.9);
      lit = lit.add(hue.mul(cityLight.mul(1.25).add(roadLight)).mul(nightAmt));
      // the Night Map: borders as fine bright lines, and a faint wash of each nation's colour over its land
      const border = float(1).sub(smoothstep(0.2, 0.42, CB.r));
      const frontier = float(1).sub(smoothstep(0.6, 0.78, CB.r)).mul(0.3);
      const lineAmt = max(border, frontier).mul(landMask).mul(uNightMap);
      lit = lit.add(hue.mul(claimed).mul(0.03).mul(uNightMap).mul(landMask));
      lit = mix(lit, hue.mul(1.5).add(0.12), lineAmt.mul(0.9));
    }
    // data overlays replace the surface colour but keep the shape of the land readable
    const OV: N = samplePlanet(data.overlay, dir);
    const relief = max(dot(Nrm, normalize(dir.add(t1.mul(0.6)).add(t2.mul(0.3)))), 0).mul(0.6).add(0.45);
    lit = mix(lit, OV.rgb.mul(OV.rgb).mul(relief), uOverlay);
    // aerial perspective: distant ground takes on the colour of the air
    const rim = pow(float(1).sub(max(dot(dir, V), 0)), 3);
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
