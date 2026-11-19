// Faceted terrain mesh, coloured per vertex by biome, snow, vegetation and ash.
import { BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  attribute, cameraPosition, dot, float, max, mix, mx_fractal_noise_float, normalWorld, normalize, positionWorld, pow, sin, smoothstep, vec3,
} from 'three/tsl';
import type { Grid } from '../sim/world';
import { Biome, BIOME_COUNT } from '../sim/world';
import type { CellSnapshot } from '../shared/protocol';
import { EXAG, uHazeAmount, uHazeTint, uMolten, uRing, uSun2, uSun2Dir, uSunDir, uTime } from './common';
import { cloudShadowAt } from './clouds';

const hex = (h: number) => new Color(h);

/** Colour of fully vegetated ground for each biome. */
const LUSH: Color[] = [];
/** Colour of bare ground (before or without plants) for each biome. */
const BARE: Color[] = [];
function setBiome(b: Biome, lush: number, bare: number) {
  LUSH[b] = hex(lush);
  BARE[b] = hex(bare);
}
setBiome(Biome.DeepOcean, 0x2b3a4a, 0x2b3a4a);
setBiome(Biome.Ocean, 0x4a5a5e, 0x4a5a5e);
setBiome(Biome.Shallows, 0xbfae84, 0xbfae84);
setBiome(Biome.Beach, 0xe6d3a1, 0xe6d3a1);
setBiome(Biome.Ice, 0xf2f6fb, 0xf2f6fb);
setBiome(Biome.Tundra, 0x8d9a6b, 0x8f8676);
setBiome(Biome.Taiga, 0x2f5d48, 0x7c7466);
setBiome(Biome.TemperateForest, 0x3f8a3a, 0x86785f);
setBiome(Biome.Grassland, 0x8fbf4d, 0x9a875f);
setBiome(Biome.Shrubland, 0xa9a25a, 0xb0946a);
setBiome(Biome.Desert, 0xe2bd7a, 0xdcb478);
setBiome(Biome.Savanna, 0xc2b24f, 0xb99662);
setBiome(Biome.Rainforest, 0x1f7a3c, 0x7d6a52);
setBiome(Biome.Wetland, 0x4f8f62, 0x6d6a55);
setBiome(Biome.Alpine, 0x8a8a8f, 0x85827f);
setBiome(Biome.Volcanic, 0x2a2526, 0x2a2526);
setBiome(Biome.SeaIce, 0x4a5a5e, 0x4a5a5e);
setBiome(Biome.SaltFlat, 0xeeeadf, 0xf1eee6);

const SNOW = hex(0xf4f8ff);
const ASH = hex(0x2b2728);
const ROCK = hex(0x6f6a66);

export class PlanetMesh {
  readonly mesh: Mesh;
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly colors: Float32Array;
  private readonly aux: Float32Array;
  private readonly glow: Float32Array;
  private readonly lights: Float32Array;
  private readonly cellColor: Float32Array;
  /** Smoothed biome colours, so biomes blend over 2 to 3 cells. */
  private readonly scratch: Float32Array;
  elevation: Float32Array;
  /** Data overlay painted over the terrain: none, temp, rain, life or people. */
  overlay: 'none' | 'temp' | 'rain' | 'life' | 'people' = 'none';
  colorblind = false;

  constructor(private readonly grid: Grid) {
    const triCount = grid.tris.length / 3;
    this.positions = new Float32Array(triCount * 9);
    this.normals = new Float32Array(triCount * 9);
    this.colors = new Float32Array(triCount * 9);
    this.aux = new Float32Array(triCount * 3);
    this.glow = new Float32Array(triCount * 3);
    this.lights = new Float32Array(triCount * 3);
    this.cellColor = new Float32Array(grid.count * 3);
    this.scratch = new Float32Array(grid.count * 3);
    this.elevation = new Float32Array(grid.count);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.normals, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('cloudCover', new BufferAttribute(this.aux, 1));
    this.geometry.setAttribute('glow', new BufferAttribute(this.glow, 1));
    this.geometry.setAttribute('lights', new BufferAttribute(this.lights, 1));

    const material = new MeshBasicNodeMaterial();
    const albedo = attribute('color', 'vec3');
    const P = positionWorld;
    const up = normalize(P);
    const N = normalize(normalWorld);
    const L = uSunDir;
    const sunHeight = dot(up, L);
    const day = smoothstep(-0.12, 0.22, sunHeight);
    const ndl = dot(N, L);
    const diffuse = max(ndl.mul(0.85).add(0.15), 0).mul(day);
    const sunColor = mix(vec3(1.0, 0.36, 0.13), vec3(1.0, 0.95, 0.88), smoothstep(-0.05, 0.4, sunHeight));
    const shadow = cloudShadowAt(P, attribute('cloudCover', 'float'));
    const skyAmbient = vec3(0.3, 0.45, 0.75).mul(0.2).mul(day).mul(dot(N, up).mul(0.5).add(0.5));
    // faint moonlight so the night side is dark but not blind
    const nightAmbient = vec3(0.02, 0.03, 0.058).mul(dot(N, up).mul(0.5).add(0.5));
    // the shadow of a ring falls as a dark band along the equator
    const ringShade = float(1).sub(uRing.mul(smoothstep(0.085, 0.02, up.y.abs())).mul(0.55));
    // a second, smaller sun adds its own cooler light from another direction
    const second = max(dot(N, uSun2Dir).mul(0.8).add(0.2), 0).mul(smoothstep(-0.1, 0.25, dot(up, uSun2Dir))).mul(uSun2).mul(0.45);
    let lit = albedo.mul(sunColor.mul(diffuse).mul(shadow).mul(ringShade).mul(1.2).add(vec3(0.7, 0.8, 1.0).mul(second)).add(skyAmbient).add(nightAmbient));
    // Molten surface for the opening sequence: glowing cracks between dark crust plates.
    // only two octaves once the crust has cooled: the detail is invisible then and costs every pixel
    const crust = mx_fractal_noise_float(P.mul(7).add(vec3(0, uTime.mul(0.02), 0)), 2, 2.1, 0.55);
    const cracks = smoothstep(0.12, -0.1, crust.abs().sub(uMolten.mul(uMolten).mul(0.34)));
    const lava = mix(vec3(0.035, 0.012, 0.01), vec3(2.3, 0.5, 0.05), cracks).add(vec3(1.4, 0.8, 0.2).mul(pow(cracks, 8)).mul(uMolten));
    lit = mix(lit, lava, smoothstep(0, 0.6, uMolten));
    // Aerial haze toward the limb.
    const V = normalize(cameraPosition.sub(P));
    const rim = pow(float(1).sub(max(dot(up, V), 0)), 3);
    const hazeColor = vec3(uHazeTint).mul(day.mul(0.9).add(0.02));
    // haze builds with distance through the air, so nearby ground stays crisp
    const far = smoothstep(0.03, 0.9, cameraPosition.sub(P).length());
    lit = mix(lit, hazeColor, rim.mul(0.3).mul(far).add(uHazeAmount).clamp(0, 0.9).mul(float(1).sub(uMolten)));
    // morning mist: low, damp ground near the dawn line lies under a pale haze
    const lowGround = smoothstep(1 + 0.7 * EXAG, 1 + 0.05 * EXAG, P.length());
    const dawn = smoothstep(-0.02, 0.1, sunHeight).mul(smoothstep(0.34, 0.12, sunHeight));
    lit = mix(lit, vec3(0.8, 0.84, 0.9).mul(day.mul(0.9).add(0.05)), lowGround.mul(dawn).mul(smoothstep(0.35, 0.8, attribute('cloudCover', 'float'))).mul(0.45).mul(float(1).sub(uMolten)));
    // lava and wildfire glow (bright enough to bloom, flickering)
    const heat = attribute('glow', 'float');
    const flicker = sin(uTime.mul(9).add(P.x.mul(700)).add(P.z.mul(500))).mul(0.2).add(0.8);
    lit = lit.add(vec3(3.2, 0.75, 0.08).mul(heat.mul(heat)).mul(flicker));
    // firelight and city light: warm points that only show on the night side
    const town = attribute('lights', 'float');
    const sparkle = mx_fractal_noise_float(P.mul(260), 1, 2.0, 0.5).mul(0.5).add(0.5);
    // a steady glow that reads from orbit, with brighter specks that resolve as you come closer
    const lamp = pow(town, 1.2).mul(smoothstep(0.3, 0.8, sparkle).mul(1.6).add(0.45)).mul(float(1).sub(day));
    lit = lit.add(vec3(2.6, 1.55, 0.55).mul(lamp));
    material.colorNode = lit;
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  /** Linear RGB per cell, as last painted (for the flat map). */
  get cellColors(): Float32Array {
    return this.cellColor;
  }

  /** Radius of the terrain surface at a cell. */
  radiusAt(cell: number): number {
    return 1 + this.elevation[cell]! * EXAG;
  }

  update(cells: CellSnapshot, forceGeometry: boolean): void {
    const { grid } = this;
    const { tris, pos, count, neighbors, ncount } = grid;
    const geometryChanged = forceGeometry || cells.terrainChanged;
    this.elevation = cells.elevation;
    const { biome, vegetation, snow, ash, elevation } = cells;
    const cc = this.cellColor;
    const sc = this.scratch;
    for (let i = 0; i < count; i++) {
      const b = biome[i]!;
      const lush = LUSH[b < BIOME_COUNT ? b : 0]!;
      const bare = BARE[b < BIOME_COUNT ? b : 0]!;
      const v = Math.min(1, vegetation[i]!);
      // tall canopy reads darker and richer than low growth
      const shade = 1 - 0.3 * Math.min(1, cells.canopy[i]! * 1.3) * v;
      sc[i * 3] = (bare.r + (lush.r - bare.r) * v) * shade;
      sc[i * 3 + 1] = (bare.g + (lush.g - bare.g) * v) * (shade * 0.5 + 0.5);
      sc[i * 3 + 2] = (bare.b + (lush.b - bare.b) * v) * shade;
    }
    for (let i = 0; i < count; i++) {
      // blend with neighbours so biome borders are soft
      let r = sc[i * 3]! * 2, g = sc[i * 3 + 1]! * 2, bl = sc[i * 3 + 2]! * 2;
      const nc = ncount[i]!;
      let steep = 0;
      const e = elevation[i]!;
      for (let j = 0; j < nc; j++) {
        const nb = neighbors[i * 6 + j]!;
        r += sc[nb * 3]!; g += sc[nb * 3 + 1]!; bl += sc[nb * 3 + 2]!;
        steep = Math.max(steep, Math.abs(elevation[nb]! - e));
      }
      const w = 1 / (nc + 2);
      r *= w; g *= w; bl *= w;
      const land = e > cells.seaLevel;
      if (land) {
        // exposed rock on steep slopes
        const rock = Math.min(0.75, Math.max(0, (steep - 0.9) * 0.6));
        r += (ROCK.r - r) * rock; g += (ROCK.g - g) * rock; bl += (ROCK.b - bl) * rock;
      }
      // farmland: a patchwork of field colours around settlements
      const fl = land ? cells.fields[i]! : 0;
      if (fl > 0) {
        const patch = ((i * 2654435761) >>> 0) % 3;
        const fr = patch === 0 ? 0.74 : patch === 1 ? 0.5 : 0.62, fg = patch === 0 ? 0.62 : patch === 1 ? 0.6 : 0.5, fb = patch === 0 ? 0.2 : patch === 1 ? 0.18 : 0.22;
        r += (fr - r) * fl * 0.75; g += (fg - g) * fl * 0.75; bl += (fb - bl) * fl * 0.75;
      }
      // coral reefs colour the shallows; bleached reef shows bone white through the water
      const rf = cells.reef[i]!;
      if (rf > 0.05) { const pk = ((i * 2246822519) >>> 0) % 2; r += ((pk ? 0.95 : 0.2) - r) * rf * 0.7; g += ((pk ? 0.45 : 0.8) - g) * rf * 0.7; bl += ((pk ? 0.5 : 0.7) - bl) * rf * 0.7; }
      else if (rf < -0.05) { r += (0.95 - r) * -rf * 0.8; g += (0.95 - g) * -rf * 0.8; bl += (0.92 - bl) * -rf * 0.8; }
      const a = Math.min(1, ash[i]!);
      if (a > 0) { r += (ASH.r - r) * a; g += (ASH.g - g) * a; bl += (ASH.b - bl) * a; }
      // snow sticks less to steep faces
      let s = Math.min(1, snow[i]! / (land ? 1.2 : 0.5)) * (1 - Math.min(0.5, steep * 0.12));
      if (!land) s = 0;
      if (s > 0) { r += (SNOW.r - r) * s; g += (SNOW.g - g) * s; bl += (SNOW.b - bl) * s; }
      if (this.overlay !== 'none') {
        // data overlays use a perceptual ramp (dark blue to yellow) that is safe for colour-blind viewers
        let v = 0;
        if (this.overlay === 'temp') v = (cells.temperature[i]! + 25) / 60;
        else if (this.overlay === 'rain') v = cells.moisture[i]!;
        else if (this.overlay === 'life') v = land ? cells.vegetation[i]! : 0.05;
        else v = Math.max(cells.lights[i]!, cells.fields[i]! * 0.5);
        v = Math.max(0, Math.min(1, v));
        const k = land ? 1 : 0.55;
        if (this.colorblind || this.overlay !== 'temp') {
          // viridis-like
          r = (0.27 + v * (0.99 - 0.27) * v) * k; g = (0.0 + 0.9 * Math.pow(v, 0.8)) * k; bl = (0.33 + 0.35 * Math.sin(v * 3.1) - 0.3 * v) * k;
        } else {
          r = (v < 0.5 ? 0.1 + v * 0.6 : 0.4 + (v - 0.5) * 1.2) * k; g = (0.25 + 0.5 * Math.sin(v * 3.14)) * k; bl = (1 - v) * 0.9 * k;
        }
      }
      cc[i * 3] = r; cc[i * 3 + 1] = g; cc[i * 3 + 2] = bl;
    }
    const P = this.positions, C = this.colors, Nn = this.normals, A = this.aux;
    const cloud = cells.cloud;
    const lava = cells.lava;
    const Gl = this.glow;
    const town = cells.lights;
    const Li = this.lights;
    for (let t = 0, o = 0; t < tris.length; t += 3, o += 9) {
      const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
      if (geometryChanged) {
        const ra = 1 + elevation[a]! * EXAG, rb = 1 + elevation[b]! * EXAG, rc = 1 + elevation[c]! * EXAG;
        const ax = pos[a * 3]! * ra, ay = pos[a * 3 + 1]! * ra, az = pos[a * 3 + 2]! * ra;
        const bx = pos[b * 3]! * rb, by = pos[b * 3 + 1]! * rb, bz = pos[b * 3 + 2]! * rb;
        const cx = pos[c * 3]! * rc, cy = pos[c * 3 + 1]! * rc, cz = pos[c * 3 + 2]! * rc;
        P[o] = ax; P[o + 1] = ay; P[o + 2] = az;
        P[o + 3] = bx; P[o + 4] = by; P[o + 5] = bz;
        P[o + 6] = cx; P[o + 7] = cy; P[o + 8] = cz;
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        Nn[o] = nx; Nn[o + 1] = ny; Nn[o + 2] = nz;
        Nn[o + 3] = nx; Nn[o + 4] = ny; Nn[o + 5] = nz;
        Nn[o + 6] = nx; Nn[o + 7] = ny; Nn[o + 8] = nz;
      }
      C[o] = cc[a * 3]!; C[o + 1] = cc[a * 3 + 1]!; C[o + 2] = cc[a * 3 + 2]!;
      C[o + 3] = cc[b * 3]!; C[o + 4] = cc[b * 3 + 1]!; C[o + 5] = cc[b * 3 + 2]!;
      C[o + 6] = cc[c * 3]!; C[o + 7] = cc[c * 3 + 1]!; C[o + 8] = cc[c * 3 + 2]!;
      const ti = t;
      A[ti] = cloud[a]!; A[ti + 1] = cloud[b]!; A[ti + 2] = cloud[c]!;
      Gl[ti] = lava[a]!; Gl[ti + 1] = lava[b]!; Gl[ti + 2] = lava[c]!;
      Li[ti] = town[a]!; Li[ti + 1] = town[b]!; Li[ti + 2] = town[c]!;
    }
    if (geometryChanged) {
      this.geometry.attributes.position!.needsUpdate = true;
      this.geometry.attributes.normal!.needsUpdate = true;
    }
    this.geometry.attributes.color!.needsUpdate = true;
    this.geometry.attributes.cloudCover!.needsUpdate = true;
    this.geometry.attributes.glow!.needsUpdate = true;
    this.geometry.attributes.lights!.needsUpdate = true;
  }
}
