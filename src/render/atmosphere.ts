// Atmosphere (Rayleigh + Mie single scattering, ray marched), sky with stars, nebula and sun, and the moon.
import {
  AdditiveBlending, BackSide, BufferAttribute, IcosahedronGeometry, Mesh, MeshBasicNodeMaterial, SphereGeometry,
} from 'three/webgpu';
import {
  Fn, Loop, attribute, cameraPosition, cos, dot, exp, float, floor, fract, length, max, min, mix, mx_fractal_noise_float, normalWorld, normalize,
  positionLocal, positionWorld, pow, select, sin, smoothstep, sqrt, vec3, cameraFar, cameraNear, perspectiveDepthToViewZ, positionView, viewportDepthTexture,
} from 'three/tsl';
import { ATMO_RADIUS, MOON_RADIUS, uAtmo, uGradeTint, uHazeTint, uSkyAngle, uSun2, uSun2Dir, uSunDir, uTime } from './common';
import { RNG } from '../sim/rng';
import { uLook } from './gfx/look';
import { makeNoise, fbm } from '../sim/noise';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const RP = 0.998;
const HR = 0.02;
const HM = 0.006;
const STEPS = 10;
const LIGHT_STEPS = 4;

export function createAtmosphere(): Mesh {
  const material = new MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: BackSide, blending: AdditiveBlending,
  });
  const scatter = Fn(() => {
    const ro = cameraPosition;
    const rd = normalize(positionWorld.sub(cameraPosition));
    const L = uSunDir;
    const b = dot(ro, rd);
    const rr = dot(ro, ro);
    const discA = b.mul(b).sub(rr.sub(ATMO_RADIUS * ATMO_RADIUS));
    const sqA = sqrt(max(discA, 0));
    const tNear = max(b.negate().sub(sqA), 0);
    const tFarA = b.negate().add(sqA);
    const discP = b.mul(b).sub(rr.sub(RP * RP));
    const tPlanet = b.negate().sub(sqrt(max(discP, 0)));
    const hitPlanet = discP.greaterThan(0).and(tPlanet.greaterThan(0));
    // air in front of solid things only: a tree trunk against the sky must not be fogged by the sky behind it
    const tSolid: N = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar).div(normalize(positionView).z);
    const tFar = min(select(hitPlanet, min(tFarA, tPlanet), tFarA), max(tSolid, tNear));
    const ds = max(tFar.sub(tNear), 0).div(STEPS);
    // which colours the air scatters depends on what it is made of: uHazeTint carries the world's sky colour
    // (shifted by era), and the strongest channel scatters about as much as blue does on Earth
    const tint: N = vec3(uHazeTint);
    const betaR = tint.div(max(max(tint.x, tint.y), tint.z)).pow(vec3(1.6, 1.6, 1.6)).mul(0.25).mul(uLook.air).div(HR);
    const betaM = float(0.02 / HM).mul(uLook.air);
    const sumR = vec3(0).toVar();
    const sumM = float(0).toVar();
    const odR = float(0).toVar();
    const odM = float(0).toVar();
    Loop(STEPS, ({ i }: { i: N }) => {
      const t = tNear.add(ds.mul(float(i).add(0.5)));
      const p = ro.add(rd.mul(t));
      const h = max(length(p).sub(RP), 0);
      const dR = exp(h.div(-HR)).mul(ds);
      const dM = exp(h.div(-HM)).mul(ds);
      odR.addAssign(dR);
      odM.addAssign(dM);
      const bl = dot(p, L);
      const tl = bl.negate().add(sqrt(max(bl.mul(bl).sub(dot(p, p).sub(ATMO_RADIUS * ATMO_RADIUS)), 0)));
      const dsl = tl.div(LIGHT_STEPS);
      const olR = float(0).toVar();
      const olM = float(0).toVar();
      (Loop as any)({ start: 0, end: LIGHT_STEPS, name: 'j' }, ({ j }: { j: N }) => {
        const pl = p.add(L.mul(dsl.mul(float(j).add(0.5))));
        // below the surface the density keeps rising, which shadows the night side
        const hl = max(length(pl).sub(RP), -0.03);
        olR.addAssign(exp(hl.div(-HR)).mul(dsl));
        olM.addAssign(exp(hl.div(-HM)).mul(dsl));
      });
      const tau = betaR.mul(odR.add(olR)).add(betaM.mul(1.1).mul(odM.add(olM)));
      const att = exp(tau.negate());
      sumR.addAssign(att.mul(dR));
      sumM.addAssign(att.mul(dM));
    });
    const mu = dot(rd, L);
    const phaseR = float(3 / (16 * Math.PI)).mul(mu.mul(mu).add(1));
    const g = 0.76;
    const phaseM = float((3 / (8 * Math.PI)) * (1 - g * g)).mul(mu.mul(mu).add(1))
      .div(float(2 + g * g).mul(pow(float(1 + g * g).sub(mu.mul(2 * g)), 1.5)));
    const color = sumR.mul(betaR).mul(phaseR).add(sumM.mul(betaM).mul(phaseM));
    return color.mul(5).mul(vec3(uLook.star)).mul(uAtmo).mul(vec3(uGradeTint)).mul(select(discA.greaterThan(0), 1, 0));
  });
  material.colorNode = scatter();
  const mesh = new Mesh(new SphereGeometry(ATMO_RADIUS, 96, 64), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

const hash3 = Fn(([p]: [N]) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453)));

const starLayer = Fn(([dir, scale, density]: [N, N, N]) => {
  const gp = dir.mul(scale);
  const cell = floor(gp);
  const f = fract(gp).sub(0.5);
  const h = hash3(cell);
  const offset = vec3(hash3(cell.add(1.7)), hash3(cell.add(5.3)), hash3(cell.add(9.1))).sub(0.5).mul(0.6);
  const d = length(f.sub(offset));
  const mag = pow(hash3(cell.add(3.9)), 7).mul(2.2).add(0.12);
  const twinkle = sin(uTime.mul(1.5).add(h.mul(40))).mul(0.15).add(0.85);
  const star = smoothstep(0.11, 0.0, d).mul(mag).mul(twinkle).mul(select(h.greaterThan(float(1).sub(density)), 1, 0));
  const tint = mix(vec3(1.0, 0.82, 0.66), vec3(0.72, 0.84, 1.0), hash3(cell.add(7.7)));
  return tint.mul(star);
});

/** Background: procedural starfield, faint nebula, the sun disc. Follows the camera. */
export function createSky(): Mesh {
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, depthTest: false });
  const dir = normalize(positionLocal);
  const c = cos(uSkyAngle), s = sin(uSkyAngle);
  const sd = vec3(dir.x.mul(c).sub(dir.z.mul(s)), dir.y, dir.x.mul(s).add(dir.z.mul(c)));
  const band = exp(pow(dot(sd, normalize(vec3(0.3, 0.9, 0.25))), 2).mul(-9));
  const stars = starLayer(sd, 70, band.mul(0.1).add(0.07)).add(starLayer(sd, 160, band.mul(0.22).add(0.1)).mul(0.5));
  const n1 = mx_fractal_noise_float(sd.mul(1.6), 4, 2.0, 0.55).mul(0.5).add(0.5);
  const n2 = mx_fractal_noise_float(sd.mul(2.3).add(vec3(11.0, 3.0, 7.0)), 4, 2.0, 0.55).mul(0.5).add(0.5);
  const nebula = vec3(0.16, 0.07, 0.3).mul(pow(n1, 3)).add(vec3(0.03, 0.17, 0.22).mul(pow(n2, 3))).mul(0.16)
    .add(vec3(0.55, 0.5, 0.62).mul(band).mul(0.022).mul(n1.add(0.4)));
  const mu = dot(dir, uSunDir);
  // the star: its colour and apparent size depend on what kind of star it is
  const edge = float(1).sub(float(0.00045).mul(uLook.starSize).mul(uLook.starSize));
  const sun = vec3(uLook.star).mul(smoothstep(edge, edge.add(0.00025), mu).mul(60).add(pow(max(mu, 0), float(900).div(uLook.starSize)).mul(3)).add(pow(max(mu, 0), 40).mul(0.12)));
  // binary systems: a smaller, bluer companion sun
  const mu2 = dot(dir, uSun2Dir);
  const sun2 = vec3(0.75, 0.86, 1.0).mul(smoothstep(0.99975, 0.9999, mu2).mul(40).add(pow(max(mu2, 0), 1400).mul(2))).mul(uSun2);
  material.colorNode = stars.add(nebula).add(sun).add(sun2);
  const mesh = new Mesh(new SphereGeometry(400, 48, 32), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/** Low-poly cratered moon, lit by the same sun. */
export function createMoon(seed: number): Mesh {
  const geo = new IcosahedronGeometry(MOON_RADIUS, 5).toNonIndexed();
  const rng = new RNG(seed);
  const noise = makeNoise(rng);
  const craters: [number, number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const [x, y, z] = rng.unitVector();
    craters.push([x, y, z, rng.range(0.08, 0.3)]);
  }
  const pos = geo.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const l = Math.hypot(x, y, z);
    x /= l; y /= l; z /= l;
    let h = 0.035 * fbm(noise, x * 3, y * 3, z * 3, 4);
    const maria = fbm(noise, x * 1.3 + 5, y * 1.3, z * 1.3, 3);
    for (const c of craters) {
      const d = Math.acos(Math.max(-1, Math.min(1, x * c[0] + y * c[1] + z * c[2]))) / c[3];
      if (d < 1.25) h += d < 1 ? -0.035 * (1 - d * d) * (c[3] / 0.2) : 0.012 * (1.25 - d) * 4 * (c[3] / 0.2);
    }
    const r = MOON_RADIUS * (1 + h);
    pos.setXYZ(i, x * r, y * r, z * r);
    const shade = 0.5 + h * 3 - (maria > 0.1 ? 0.16 : 0);
    colors[i * 3] = shade; colors[i * 3 + 1] = shade * 0.98; colors[i * 3 + 2] = shade * 0.95;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const material = new MeshBasicNodeMaterial();
  const ndl = max(dot(normalize(normalWorld), uSunDir), 0);
  material.colorNode = attribute('color', 'vec3').mul(vec3(uLook.moon)).mul(vec3(uLook.star)).mul(ndl.mul(1.5).add(0.012));
  const mesh = new Mesh(geo, material);
  return mesh;
}
