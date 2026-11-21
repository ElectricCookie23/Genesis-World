// One skin material for every creature. The vertex stage animates the body (two-bone leg IK with
// feet planted on the real ground, spine and tail waves, wing beats, head motion, fur shells); the
// fragment stage draws the hide: markings from the genes, then scales, fur, feathers, chitin or bare
// skin, wet sheen, iridescence, light through thin membranes, glowing markings and eyes that follow the viewer.
import { DoubleSide, MeshBasicNodeMaterial, type Texture } from 'three/webgpu';
import {
  abs, attribute, cameraPosition, cos, cross, dot, float, floor, fract, frontFacing, length, max, mix, normalGeometry, normalize, positionGeometry, positionWorld,
  pow, reflect, select, sin, smoothstep, sqrt, step, varying, vec2, vec3,
} from 'three/tsl';
import { uHazeTint, uMoonDir, uSunDir, uTime } from '../common';
import { secondSun } from '../lighting';
import { COVER, RIG, ZONE } from './creaturemesh';
import { uLook } from './look';
import type { PlanetData } from './planetdata';
import { groundRadiusNode } from './terrain';
import { eclipseLight } from './eclipse';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const is = (x: N, k: number): N => step(abs(x.sub(k)), 0.5);
const hash2 = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

export function makeCreatureMaterial(data: PlanetData, erosionTex: Texture, cloudShadow: (p: N) => N): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  material.alphaTest = 0.5;
  const ip: N = attribute('iPos', 'vec3');
  const iq: N = attribute('iQuat', 'vec4');
  const id: N = attribute('iData', 'vec4'); // scale, phase, moving, gait rate
  const rig: N = attribute('rig', 'vec4'), rig2: N = attribute('rig2', 'vec4'), skin: N = attribute('skin', 'vec4');
  const p: N = positionGeometry, n0: N = normalGeometry;
  const rotate = (v: N): N => v.add(cross(iq.xyz, cross(iq.xyz, v).add(v.mul(iq.w))).mul(2));
  const unrotate = (v: N): N => v.add(cross(iq.xyz.negate(), cross(iq.xyz.negate(), v).add(v.mul(iq.w))).mul(2));
  const scale: N = id.x, moving: N = id.z;
  const t: N = uTime.mul(id.w).add(id.y);
  const kind: N = rig.x;
  const isLeg = is(kind, RIG.leg), isTail = is(kind, RIG.tail), isWing = is(kind, RIG.wing), isHead = is(kind, RIG.head);

  // ---- legs: a gait cycle moves each foot; the knee follows by two-bone IK; the foot rests on the real ground
  const hip: N = vec3(rig2.x, rig2.y, rig2.w);
  const len: N = max(rig2.z, 1e-4);
  const ankleH = len.mul(0.06);
  const bone = len.sub(ankleH).mul(0.54);
  const cyc = fract(t.add(rig.z.mul(Math.PI)).add(rig2.x.mul(2.2)).div(Math.PI * 2));
  const STANCE = 0.6;
  const inStance = step(cyc, STANCE);
  const swingT = cyc.sub(STANCE).div(1 - STANCE).clamp(0, 1);
  const stride = len.mul(0.75).mul(moving);
  const fx = mix(mix(stride.mul(-0.5), stride.mul(0.5), smoothstep(0, 1, swingT)), mix(stride.mul(0.5), stride.mul(-0.5), cyc.div(STANCE)), inStance);
  const lift = float(1).sub(inStance).mul(sin(swingT.mul(Math.PI))).mul(len).mul(0.22).mul(moving);
  const footWorld: N = ip.add(rotate(vec3(hip.x.add(fx), 0, hip.z).mul(scale)));
  const deltaRaw = groundRadiusNode(data, erosionTex, normalize(footWorld)).sub(length(ip)).div(max(scale, 1e-7));
  const delta = deltaRaw.clamp(len.mul(-0.35), len.mul(0.35)).mul(step(abs(deltaRaw), len.mul(0.8)));
  const ankle: N = vec3(hip.x.add(fx), ankleH.add(lift).add(delta), hip.z);
  const toAnkle: N = ankle.sub(hip);
  const reach = length(toAnkle);
  const d = reach.clamp(len.mul(0.1), bone.mul(1.998));
  const dir: N = toAnkle.div(max(reach, 1e-5));
  const cosK = bone.mul(bone).add(d.mul(d)).sub(bone.mul(bone)).div(bone.mul(d).mul(2)).clamp(-1, 1);
  const sinK = sqrt(max(float(1).sub(cosK.mul(cosK)), 0));
  // fore legs bend one way and hind legs the other
  const bend = select(abs(rig.w).greaterThan(1.5), float(-1), float(1));
  const perp: N = vec3(dir.y.negate(), dir.x, 0);
  const knee: N = hip.add(dir.mul(cosK).add(perp.mul(sinK).mul(bend)).mul(bone));
  const w: N = rig.y;
  const along: N = mix(mix(hip, knee, w.mul(2).clamp(0, 1)), mix(knee, ankle, w.mul(2).sub(1).clamp(0, 1)), step(0.5, w));
  const legPos: N = along.add(vec3(p.x.sub(hip.x), 0, p.z.sub(hip.z)));
  const footPos: N = ankle.add(p.sub(vec3(hip.x, ankleH, hip.z)));
  const leg: N = mix(legPos, footPos, step(1.05, w));

  // ---- everything else: waves down the spine and tail, wing beats, a head that looks about, breathing
  const dzTail = sin(t.mul(0.9).sub(p.x.mul(4)).add(rig.z)).mul(rig.y).mul(0.2).mul(moving.mul(0.7).add(0.3)).mul(isTail);
  const dyTail = sin(t.mul(0.9).sub(p.x.mul(4)).sub(1.3)).mul(rig.y).mul(0.03).mul(isTail);
  const flap = sin(t.mul(1.6).sub(rig.y.mul(1.2)));
  const dyWing = flap.mul(rig.y).mul(0.42).mul(isWing);
  const dxWing = flap.mul(rig.y).mul(rig.y).mul(-0.08).mul(isWing);
  // the head nods with each step, a beat behind the body, and drifts a little when the animal stands
  const dyHead = sin(t.mul(0.5)).mul(0.02).add(sin(t.mul(2).sub(1.1)).mul(0.035).mul(moving)).mul(rig.y).mul(isHead);
  const dzHead = sin(t.mul(0.31).add(id.y)).mul(0.05).mul(rig.y).mul(float(1).sub(moving.mul(0.6))).mul(isHead);
  // the body rises and falls twice in a stride, and the spine sways from side to side as the weight changes feet
  const bob = sin(t.mul(2)).mul(0.028).mul(moving);
  const dzSpine = sin(t.sub(p.x.mul(3.2))).mul(0.024).mul(moving);
  const breathe = sin(uTime.mul(2).add(id.y)).mul(0.015).add(1);
  // fur shells stand off the skin and sag a little
  const shell: N = n0.mul(skin.w).sub(vec3(0, skin.w.mul(0.35), 0));
  const body: N = vec3(p.x.add(dxWing), p.y.add(dyTail).add(dyWing).add(dyHead).add(bob).mul(breathe), p.z.add(dzTail).add(dzHead).add(dzSpine)).add(shell);
  const local: N = mix(body, leg, isLeg).mul(scale);
  material.positionNode = rotate(local).add(ip);

  // ---- to the fragment stage
  const nW: N = varying(normalize(rotate(n0)));
  const vSkin: N = varying(vec3(skin.x, skin.y, skin.z));
  const vShell: N = varying(rig2.y.mul(is(kind, RIG.leg).oneMinus()).mul(step(1e-6, skin.w)));
  const vColor: N = varying(attribute('color', 'vec3'));
  const vEmis: N = varying(attribute('emissive', 'vec3'));
  const vRest: N = varying(p);
  const vEye: N = varying(rig2);
  const vSide: N = varying(rig.w);
  const vView: N = varying(unrotate(cameraPosition.sub(ip)).div(max(scale, 1e-7)));
  const vA: N = varying(attribute('iSkinA', 'vec4')), vB: N = varying(attribute('iSkinB', 'vec4')), vC: N = varying(attribute('iSkinC', 'vec4'));
  const vGold: N = varying(attribute('iTint', 'float'));
  const vBase: N = varying(ip);

  const zone: N = vSkin.z, u: N = vSkin.x, v: N = vSkin.y;
  const patterned = is(zone, ZONE.skin).add(is(zone, ZONE.limb));
  const second: N = vA.rgb, ptype: N = vA.w, cover: N = vB.x, wet: N = vB.y, iri: N = vB.z, pscale: N = vB.w;
  // ---- markings
  const stripes = smoothstep(0.15, 0.4, sin(u.mul(pscale).mul(2.2).add(sin(v.mul(6.283)).mul(0.7))));
  const g2: N = vec2(u.mul(pscale).mul(1.2), v.mul(pscale).mul(0.5));
  const cell: N = floor(g2);
  const off: N = vec2(hash2(cell.add(17.3)), hash2(cell.add(5.1))).sub(0.5).mul(0.5);
  const spots = float(1).sub(smoothstep(0.18, 0.3, length(fract(g2).sub(0.5).sub(off)))).mul(step(0.45, hash2(cell)));
  const backness = cos(v.mul(6.283)).mul(0.5).add(0.5);
  const mark: N = is(ptype, 1).mul(stripes).add(is(ptype, 2).mul(spots)).add(is(ptype, 3).mul(smoothstep(0.15, 0.85, backness))).mul(patterned);
  let albedo: N = mix(vColor, second, mark);
  // ---- what the skin is made of
  const stag = (cols: number, rows: number): N => { const r = floor(v.mul(rows)); return fract(vec2(u.mul(cols).add(fract(r.mul(0.5))), v.mul(rows))); };
  const sc: N = stag(90, 44);
  const scales = sc.x.mul(0.35).add(0.75).mul(float(1).sub(smoothstep(0.34, 0.5, abs(sc.y.sub(0.5))).mul(0.3)));
  const fe: N = stag(30, 26);
  const feathers = fe.x.mul(0.3).add(0.8).mul(sin(fe.y.mul(40)).mul(0.05).add(0.95)).mul(float(1).sub(smoothstep(0.4, 0.5, abs(fe.y.sub(0.5))).mul(0.25)));
  const fur = sin(v.mul(300).add(sin(u.mul(40)).mul(3))).mul(0.15).add(1);
  const chitin = float(1).sub(smoothstep(0.42, 0.5, abs(fract(u.mul(9)).sub(0.5))).mul(0.5));
  const hide = sin(u.mul(70).add(sin(v.mul(20)).mul(2))).mul(sin(v.mul(50))).mul(0.06).add(0.97);
  const detail: N = is(cover, COVER.hide).mul(hide).add(is(cover, COVER.scales).mul(scales)).add(is(cover, COVER.fur).mul(fur)).add(is(cover, COVER.feathers).mul(feathers)).add(is(cover, COVER.chitin).mul(chitin));
  albedo = albedo.mul(mix(float(1), detail, patterned));
  // plates and horns: growth rings
  albedo = mix(albedo, albedo.mul(sin(v.mul(46)).mul(0.1).add(0.95)), is(zone, ZONE.bone));
  const glossBase: N = is(cover, COVER.hide).mul(0.15).add(is(cover, COVER.scales).mul(0.5)).add(is(cover, COVER.fur).mul(0.04)).add(is(cover, COVER.feathers).mul(0.22)).add(is(cover, COVER.chitin).mul(0.9));
  let gloss: N = glossBase.mul(patterned).add(is(zone, ZONE.bone).mul(0.35)).add(is(zone, ZONE.bladder).mul(0.6)).add(is(zone, ZONE.membrane).mul(0.2)).add(wet.mul(0.45)).clamp(0, 1);
  // fur: outer shells keep only some hairs, and hair is darker near the skin
  // fine enough that single hairs, not square tufts, show up close
  const strand = hash2(floor(vec2(u.mul(720), v.mul(390))));
  const hairKept = step(vShell.mul(0.92), strand);
  albedo = albedo.mul(mix(float(1), vShell.mul(0.5).add(0.6), step(0.001, vShell)));
  // one in a great many is born golden
  albedo = mix(albedo, vec3(1.0, 0.72, 0.18), vGold);
  gloss = mix(gloss, float(0.9), vGold);

  // ---- eyes: an iris and a pupil that turn toward the viewer, within what the eye can reach
  const eyeN: N = normalize(vRest.sub(vEye.xyz));
  const axis: N = normalize(vec3(0.45, 0.12, vSide.sign()));
  const toView: N = normalize(vView.sub(vEye.xyz));
  const gaze: N = (normalize as any)((mix as any)(axis, toView, smoothstep(0.0, 0.4, dot(toView, axis)).mul(0.75)));
  const eg = dot(eyeN, gaze);
  const eyeCol: N = mix(mix(vec3(0.82, 0.82, 0.78), vColor, smoothstep(0.76, 0.8, eg)), vec3(0.01, 0.01, 0.012), smoothstep(0.925, 0.95, eg));
  const isEye = is(zone, ZONE.eye);
  albedo = mix(albedo, eyeCol, isEye);
  gloss = mix(gloss, float(1), isEye);

  // ---- light
  const P: N = positionWorld;
  const Nrm: N = (normalize as any)((select as any)(frontFacing, nW, nW.negate()));
  const up: N = normalize(vBase);
  const L: N = uSunDir, M: N = uMoonDir;
  const V: N = normalize(cameraPosition.sub(P));
  const sunH = dot(up, L);
  const day = smoothstep(-0.12, 0.22, sunH);
  const night = float(1).sub(day);
  const sunColor: N = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.05, 0.4, sunH));
  const sunVis = smoothstep(-0.08, 0.1, sunH).mul(cloudShadow(vBase)).mul(eclipseLight(vBase));
  const thin = is(zone, ZONE.membrane).add(is(zone, ZONE.bladder).mul(0.7));
  const nv = dot(Nrm, V).clamp(0, 1); // clamped above too: a power of a slightly negative 1 - nv is not a number on a GPU
  // shifting colours on some skins, strongest at glancing angles
  const film: N = (cos as any)((vec3 as any)(0, 2.09, 4.19).add(nv.mul(9.4)).add(u.mul(12.6))).mul(0.5).add(0.5);
  albedo = mix(albedo, film, iri.mul(pow(float(1).sub(nv), 0.7)).mul(0.6).mul(patterned).clamp(0, 0.8));
  const ndl = dot(Nrm, L);
  const diffuse = mix(max(ndl, 0).mul(0.85).add(0.15), abs(ndl).mul(0.7).add(0.3), thin);
  const through = pow(max(dot(V, L.negate()), 0), 2).mul(max(ndl.negate(), 0).mul(0.6).add(0.4)).mul(thin);
  const sky: N = mix(vec3(uHazeTint), vec3(0.6, 0.6, 0.6), 0.45).mul(0.4).mul(day).mul(dot(Nrm, up).mul(0.35).add(0.65));
  const moonUp = smoothstep(-0.1, 0.25, dot(up, M));
  const moon: N = vec3(uLook.moon).mul(0.05).mul(max(dot(Nrm, M), 0).mul(0.7).add(0.3)).mul(moonUp).mul(night);
  const H: N = normalize(V.add(L));
  // kept low: at full strength wet and armoured skins showed hard white streaks, like painted plastic
  const spec = pow(max(dot(Nrm, H), 0), mix(float(10), float(200), gloss)).mul(gloss).mul(gloss.mul(1.1).add(0.2)).mul(sunVis);
  const fres = pow(float(1).sub(nv), 4);
  const sheen: N = vec3(uHazeTint).mul(day.mul(0.5).add(0.01)).mul(fres).mul(wet.mul(0.7).add(gloss.mul(0.2)));
  const velvet = pow(float(1).sub(nv), 3).mul(is(cover, COVER.fur).add(is(cover, COVER.feathers).mul(0.5))).mul(patterned).mul(0.3).mul(day);
  let color: N = albedo.mul(sunColor.mul(diffuse).mul(sunVis).mul(1.1).add(secondSun(Nrm, up)).add(sky).add(moon).add(vec3(0.012, 0.016, 0.022)))
    .add(albedo.mul(sunColor).mul(through).mul(sunVis).mul(1.5))
    .add(sunColor.mul(spec)).add(sheen).add(albedo.mul(velvet));
  // living light: eyes of night animals, and markings that glow
  color = color.add(vEmis.mul(float(1.15).sub(day)).mul(2.4)).add(vC.rgb.mul(vC.w).mul(mark.add(is(zone, ZONE.membrane).mul(0.5))).mul(night.mul(1.5).add(0.1)));
  // a small bright point on the eye
  color = color.add(sunColor.mul(pow(max(dot(reflect(V.negate(), Nrm), L), 0), 90)).mul(isEye).mul(sunVis).mul(1.5));
  material.colorNode = color;
  material.opacityNode = mix(float(1), hairKept, step(0.001, vShell));
  return material;
}
