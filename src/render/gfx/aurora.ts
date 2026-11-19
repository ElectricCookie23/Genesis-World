// Aurora as light, not geometry: thin curtains of vertical rays marched through a shell of thin air
// around each magnetic pole. Additive and soft, brightest along the lower edge, slowly folding,
// with pulses of brightness running along the oval. Colours come from the world's air.
import { AdditiveBlending, BackSide, Mesh, MeshBasicNodeMaterial, IcosahedronGeometry, Vector3, type Data3DTexture } from 'three/webgpu';
import {
  Fn, If, Loop, abs, cameraFar, cameraNear, cameraPosition, dot, exp, float, int, length, max, min, mix, normalize, perspectiveDepthToViewZ, positionView,
  positionWorld, screenCoordinate, select, sin, smoothstep, sqrt, texture3D, uniform, vec3, viewportDepthTexture,
} from 'three/tsl';
import { EXAG, uDitherFrame, uExposure, uSunDir, uTime } from '../common';
import { uLook } from './look';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** 0 = none, 1 = normal, higher during solar events. */
export const uAurora = uniform(1);
/** The magnetic pole is tipped a little away from the spin axis. */
export const uMagneticPole = uniform(new Vector3(0.14, 0.985, 0.1).normalize());

/** The curtains hang between these heights (planet radii). */
const LOW = 1 + 10 * EXAG;
const HIGH = 1 + 16.5 * EXAG;
/** Angle from the magnetic pole to the middle of the oval (about 70 degrees magnetic latitude). */
const OVAL = 0.3;

export class AuroraVolume {
  readonly mesh: Mesh;
  readonly steps = uniform(28, 'int');

  constructor(noise: Data3DTexture) {
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: BackSide, blending: AdditiveBlending });
    const noiseAt = (p: N): N => (texture3D(noise, p) as any).level(0);
    const glow = Fn(() => {
      const ro: N = cameraPosition;
      const rd: N = normalize(positionWorld.sub(cameraPosition));
      const b = dot(ro, rd), c = dot(ro, ro);
      const discT = b.mul(b).sub(c.sub(HIGH * HIGH));
      const discB = b.mul(b).sub(c.sub(LOW * LOW));
      const sT = sqrt(max(discT, 0)), sB = sqrt(max(discB, 0));
      const tT0 = b.negate().sub(sT), tT1 = b.negate().add(sT);
      const tB0 = b.negate().sub(sB), tB1 = b.negate().add(sB);
      const above = c.greaterThan(HIGH * HIGH), below = c.lessThan(LOW * LOW);
      const hitsLow = discB.greaterThan(0).and(tB0.greaterThan(0));
      const start = select(above, max(tT0, 0), select(below, tB1, float(0)));
      const endRaw = select(below, tT1, select(hitsLow, tB0, tT1));
      const tSolid = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar).div(normalize(positionView).z);
      const end = min(min(endRaw, tSolid), start.add(1.1));
      const span = max(end.sub(start), 0).mul(select(discT.greaterThan(0).and(tT1.greaterThan(0)), 1, 0));
      const ds = span.div(float(this.steps));
      const sc: N = screenCoordinate;
      const jitter = sc.x.add(uDitherFrame).mul(0.06711056).add(sc.y.add(uDitherFrame).mul(0.00583715)).fract().mul(52.9829189).fract();
      const sum = vec3(0).toVar();
      const pole: N = uMagneticPole;
      const t = uTime;
      If(span.greaterThan(1e-5), () => {
        (Loop as any)({ start: int(0), end: this.steps, type: 'int', condition: '<' }, ({ i }: { i: N }) => {
          const p: N = ro.add(rd.mul(start.add(ds.mul(float(i).add(jitter)))));
          const r = length(p);
          const dir = p.div(r);
          const m = dot(dir, pole);
          // angle from the nearer magnetic pole (small-angle form keeps it cheap)
          const theta = sqrt(max(float(2).sub(abs(m).mul(2)), 0));
          If(abs(theta.sub(OVAL)).lessThan(0.2), () => {
            const h = r.sub(LOW).div(HIGH - LOW);
            // the oval wanders and folds slowly
            const fold: N = noiseAt(dir.mul(1.7).add(vec3(0, t.mul(0.004), t.mul(0.003))));
            const fold2: N = noiseAt(dir.mul(6.5).add(vec3(t.mul(0.006), 0, 0)));
            const centre = float(OVAL).add(fold.a.sub(0.5).mul(0.16)).add(fold2.a.sub(0.5).mul(0.05));
            // three thin sheets side by side, each a few hundredths of a radian apart
            const off = theta.sub(centre);
            const sheet = (shift: number, width: number, gain: number): N => exp(off.sub(shift).div(width).pow(2).negate()).mul(gain);
            const sheets = sheet(0, 0.0045, 1).add(sheet(0.03, 0.0035, 0.5)).add(sheet(-0.027, 0.005, 0.35));
            // vertical rays: the pattern depends on direction only, so it runs straight up the curtain
            const rays: N = noiseAt(dir.mul(31).add(vec3(t.mul(0.011), 0, t.mul(-0.007))));
            const fine: N = noiseAt(dir.mul(96).add(vec3(0, t.mul(0.02), 0)));
            const streaks = smoothstep(0.35, 0.8, rays.g.mul(0.65).add(fine.b.mul(0.35))).mul(0.94).add(0.06);
            // patches of the oval are bright and others nearly dark; pulses run along it
            const patch = smoothstep(0.42, 0.68, fold.r).mul(0.97).add(0.03);
            const pulse = sin(dot(dir, vec3(3.1, 0.4, -2.7)).mul(6).sub(t.mul(0.55))).mul(0.3).add(0.7);
            // bright sharp lower border, fading upward
            const height = smoothstep(0.0, 0.07, h).mul(exp(h.mul(-4.2))).mul(float(1).sub(smoothstep(0.7, 1.0, h)));
            const colour = mix(vec3(uLook.auroraLow), vec3(uLook.auroraHigh), smoothstep(0.12, 0.7, h)).add(vec3(1.0, 0.35, 0.55).mul(float(1).sub(smoothstep(0.0, 0.06, h))).mul(0.35));
            // gone in daylight: it only shows where the sky under it is dark
            const night = float(1).sub(smoothstep(-0.22, 0.02, dot(dir, uSunDir)));
            sum.addAssign(colour.mul(sheets.mul(streaks).mul(patch).mul(pulse).mul(height).mul(night)).mul(ds));
          });
        });
      });
      // a long look along the oval (from orbit, at the limb) must not pile up into a solid wall, and a wide-open
      // night exposure must not burn it out: the glow saturates softly and is held back as the exposure rises
      const raw: N = sum.mul(uAurora).mul(150);
      const lum = max(max(raw.x, raw.y), raw.z);
      const soft = float(1).sub(exp(lum.mul(-1.4))).mul(0.55).div(max(lum, 1e-5));
      return raw.mul(soft).div(max(uExposure, 1).pow(0.6));
    });
    material.colorNode = glow();
    this.mesh = new Mesh(new IcosahedronGeometry(HIGH * 1.03, 5), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  /** From below the clouds the aurora must be drawn first, so cloud covers it; from space it is drawn after. */
  setCameraRadius(r: number, cloudTop: number): void {
    this.mesh.renderOrder = r > cloudTop ? 6 : 2;
  }
}
