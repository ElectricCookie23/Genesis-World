// Ocean surface: depth colour, fresnel sky reflection, sun glint, coastal foam, tides.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  attribute, cameraPosition, dot, exp, float, max, mix, mx_noise_float, mx_noise_vec3, normalize, positionLocal, positionWorld, pow, reflect, sin,
  smoothstep, vec3, varying,
} from 'three/tsl';
import type { Grid } from '../sim/world';
import type { CellSnapshot } from '../shared/protocol';
import { EXAG, uMoonDir, uOceanFill, uSeaGlow, uSeaKm, uSunDir, uTideKm, uTime, uHazeTint } from './common';
import { cloudShadowAt } from './clouds';
import { uLook } from './gfx/look';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class OceanMesh {
  readonly mesh: Mesh;
  private readonly geometry: BufferGeometry;
  private readonly depth: Float32Array;
  private readonly ice: Float32Array;
  private readonly wind: Float32Array;
  private readonly cloud: Float32Array;
  private readonly life: Float32Array;

  constructor(private readonly grid: Grid) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(grid.pos.slice(), 3));
    this.depth = new Float32Array(grid.count);
    this.ice = new Float32Array(grid.count);
    this.wind = new Float32Array(grid.count);
    this.cloud = new Float32Array(grid.count);
    this.life = new Float32Array(grid.count * 2);
    g.setAttribute('depth', new BufferAttribute(this.depth, 1));
    g.setAttribute('ice', new BufferAttribute(this.ice, 1));
    g.setAttribute('wind', new BufferAttribute(this.wind, 1));
    g.setAttribute('cloudCover', new BufferAttribute(this.cloud, 1));
    // x = plankton bloom, y = ship lamps
    g.setAttribute('sealife', new BufferAttribute(this.life, 2));
    g.setIndex(new BufferAttribute(grid.tris, 1));
    this.geometry = g;

    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const dirL = normalize(positionLocal);
    // The moon raises two tidal bulges; the sea also drains away during the opening sequence.
    const tide = dot(dirL, uMoonDir).pow2().sub(1 / 3).mul(uTideKm);
    const fillKm = float(1).sub(uOceanFill).mul(-7.5);
    const levelKm = uSeaKm.add(tide).add(fillKm);
    material.positionNode = dirL.mul(float(1).add(levelKm.mul(EXAG)));
    const depthNow = varying(attribute('depth', 'float').add(levelKm));

    const P = positionWorld;
    const up = normalize(P);
    const V = normalize(cameraPosition.sub(P));
    const L = uSunDir;
    const sunHeight = dot(up, L);
    const day = smoothstep(-0.12, 0.22, sunHeight);
    const windAmt = attribute('wind', 'float');
    const t = uTime;
    const ripple = mx_noise_vec3(P.mul(140).add(vec3(t.mul(0.35), t.mul(0.22), t.mul(-0.3))));
    const swell = mx_noise_vec3(P.mul(22).add(vec3(t.mul(-0.07), t.mul(0.05), t.mul(0.06))));
    const N = normalize(up.add(ripple.mul(windAmt.mul(0.05).add(0.022))).add(swell.mul(0.03)));
    // the colour of this world's seas comes from what is dissolved in them
    const shallow: any = vec3(uLook.oceanShallow);
    const deep: any = vec3(uLook.oceanDeep);
    const mid: any = mix(shallow, deep, 0.62);
    let water: any = mix(shallow, mid, float(1).sub(exp(depthNow.mul(-3.2))));
    water = mix(water, deep, float(1).sub(exp(depthNow.mul(-0.55))));
    // plankton blooms stain the water green; by night they glow where the waves stir them
    const life: any = attribute('sealife', 'vec2');
    water = mix(water, vec3(0.05, 0.36, 0.22), life.x.mul(0.5));
    const sunColor = mix(vec3(uLook.dusk), vec3(uLook.star), smoothstep(-0.05, 0.4, sunHeight));
    const shadow = cloudShadowAt(P, attribute('cloudCover', 'float'));
    const diffuse = max(dot(N, L), 0).mul(0.75).add(0.25).mul(day).mul(shadow);
    const fres = pow(float(1).sub(max(dot(N, V), 0)), 5).mul(0.96).add(0.04);
    const sky = vec3(uHazeTint).mul(day.mul(0.85).add(0.015));
    const R = reflect(V.negate(), N);
    const rl = max(dot(R, L), 0);
    const glint = pow(rl, 260).mul(9).add(pow(rl, 28).mul(0.55)).mul(shadow).mul(smoothstep(-0.05, 0.1, sunHeight));
    // foam: a thin bright line at the waterline plus slow bands rolling in
    const shore = float(1).sub(smoothstep(0.0, 0.16, depthNow));
    const band = sin(depthNow.mul(70).sub(t.mul(1.1)).add(mx_noise_float(P.mul(60)).mul(3)));
    const foam = shore.mul(smoothstep(0.55, 0.95, band)).mul(0.7).add(float(1).sub(smoothstep(0.0, 0.028, depthNow)).mul(0.9));
    const ice = attribute('ice', 'float').add(mx_noise_float(P.mul(26)).mul(0.35));
    let color = water.mul(sunColor).mul(diffuse).mul(1.15).add(sky.mul(fres).mul(0.55)).add(sunColor.mul(glint));
    color = color.add(vec3(1, 1, 1).mul(foam).mul(day.mul(0.9).add(0.03)).mul(shadow));
    const iceColor = vec3(0.86, 0.92, 0.98).mul(sunColor.mul(max(dot(up, L), 0).mul(0.9).add(0.1).mul(day)).mul(1.15).add(0.02));
    color = mix(color, iceColor, smoothstep(0.35, 0.65, ice));
    const nightAmt = float(1).sub(day);
    const stir = mx_noise_float(P.mul(90).add(vec3(t.mul(0.4), 0, t.mul(0.3)))).mul(0.5).add(0.5);
    color = color.add(vec3(0.05, 0.75, 0.95).mul(life.x).mul(pow(stir, 3)).mul(nightAmt).mul(uSeaGlow).mul(1.3));
    color = color.add(vec3(2.4, 1.5, 0.6).mul(life.y).mul(nightAmt));
    material.colorNode = color;
    // see through to the sand in the shallows
    material.opacityNode = smoothstep(-0.005, 0.11, depthNow).mul(0.5).add(smoothstep(0.0, 0.9, depthNow).mul(0.5)).mul(0.985).max(foam.mul(0.8)).max(smoothstep(0.35, 0.65, ice))
      .mul(smoothstep(-0.02, 0.0, depthNow));
    this.mesh = new Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  update(cells: CellSnapshot): void {
    const { count } = this.grid;
    for (let i = 0; i < count; i++) {
      this.depth[i] = -cells.elevation[i]!;
      const below = cells.elevation[i]! <= cells.seaLevel;
      const target = below && cells.temperature[i]! < -3 ? 1 : 0;
      this.ice[i] = target;
      this.wind[i] = Math.min(1.5, Math.hypot(cells.windE[i]!, cells.windN[i]!));
    }
    for (let i = 0; i < count; i++) { this.life[i * 2] = cells.bloom[i]!; this.life[i * 2 + 1] = cells.elevation[i]! <= cells.seaLevel ? cells.lights[i]! : 0; }
    this.cloud.set(cells.cloud);
    const a = this.geometry.attributes;
    a.depth!.needsUpdate = true;
    a.ice!.needsUpdate = true;
    a.wind!.needsUpdate = true;
    a.cloudCover!.needsUpdate = true;
    a.sealife!.needsUpdate = true;
  }
}
