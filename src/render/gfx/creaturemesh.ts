// Creature bodies from genomes: one continuous skin lofted along a spine from tail tip to snout,
// jointed legs, membrane wings and fins, curved horns, round eyes, back plates, sails, and shells of
// fur. Every vertex carries what the skin shader needs to animate it (which part it belongs to and
// how strongly it follows that part's motion) and to shade it (a skin uv and a material zone).
// Local frame: +X forward, +Y up, torso length 1, feet on y = 0.
import { BufferAttribute, BufferGeometry, Color, type InterleavedBufferAttribute } from 'three/webgpu';
import { G, Limb, limbKind } from '../../sim/genetics';
import { packAttributes } from './packed';

export const ZONE = { skin: 0, limb: 1, membrane: 2, bone: 3, eye: 4, bladder: 5, grove: 6 } as const;
export const COVER = { hide: 0, scales: 1, fur: 2, feathers: 3, chitin: 4 } as const;
/** Animation kinds stored in rig.x */
export const RIG = { body: 0, leg: 1, tail: 2, wing: 3, head: 4 } as const;

export interface CreatureModel {
  geometry: BufferGeometry;
  /** second colour rgb, pattern type 0..3 */
  skinA: [number, number, number, number];
  /** cover type, wetness, iridescence, pattern scale */
  skinB: [number, number, number, number];
  /** glow colour rgb, glow amount */
  skinC: [number, number, number, number];
}

type V3 = [number, number, number];

class Mesh {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; rig: number[] = []; rig2: number[] = []; skin: number[] = []; emi: number[] = []; idx: number[] = [];
  v(p: V3, c: V3, rig: [number, number, number, number], rig2: [number, number, number, number], skin: [number, number, number, number], e: V3 = [0, 0, 0]): number {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(0, 0, 0); this.col.push(c[0], c[1], c[2]);
    this.rig.push(...rig); this.rig2.push(...rig2); this.skin.push(...skin); this.emi.push(e[0], e[1], e[2]);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, b, d, c); }

  /** Smooth normals for the vertices from `from` on, welding points that coincide (seams). */
  normals(from: number, fromIndex: number): void {
    const { pos, nrm, idx } = this;
    const key = (i: number) => `${Math.round(pos[i * 3]! * 2000)},${Math.round(pos[i * 3 + 1]! * 2000)},${Math.round(pos[i * 3 + 2]! * 2000)}`;
    const acc = new Map<string, V3>();
    for (let t = fromIndex; t < idx.length; t += 3) {
      const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
      const ux = pos[b * 3]! - pos[a * 3]!, uy = pos[b * 3 + 1]! - pos[a * 3 + 1]!, uz = pos[b * 3 + 2]! - pos[a * 3 + 2]!;
      const vx = pos[c * 3]! - pos[a * 3]!, vy = pos[c * 3 + 1]! - pos[a * 3 + 1]!, vz = pos[c * 3 + 2]! - pos[a * 3 + 2]!;
      const n: V3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      for (const i of [a, b, c]) {
        const k = key(i);
        const s = acc.get(k);
        if (s) { s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; } else acc.set(k, [n[0], n[1], n[2]]);
      }
    }
    for (let i = from; i < pos.length / 3; i++) {
      const s = acc.get(key(i));
      if (!s) continue;
      const l = Math.hypot(s[0], s[1], s[2]) || 1;
      nrm[i * 3] = s[0] / l; nrm[i * 3 + 1] = s[1] / l; nrm[i * 3 + 2] = s[2] / l;
    }
  }

  /** A tube along a path with a radius per point. Returns the first vertex index of each ring. */
  tube(path: V3[], radii: number[], sides: number, colour: V3, rig: (i: number, p: V3) => [number, number, number, number], rig2: [number, number, number, number], zone: number, flat = 1): void {
    const start = this.pos.length / 3, startI = this.idx.length;
    const rings: number[][] = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)]!, b = path[Math.min(path.length - 1, i + 1)]!;
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      // a frame across the tube: one axis sideways (z), the other in the bend plane
      let sx = -dz, sy = 0, sz = dx;
      const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-4) { sx = 0; sy = 0; sz = 1; } else { sx /= sl; sz /= sl; }
      const ox = dy * sz - dz * sy, oy = dz * sx - dx * sz, oz = dx * sy - dy * sx;
      const ring: number[] = [];
      for (let k = 0; k <= sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const c = Math.cos(ang), s = Math.sin(ang) * flat;
        const p: V3 = [path[i]![0] + (sx * c + ox * s) * radii[i]!, path[i]![1] + (sy * c + oy * s) * radii[i]!, path[i]![2] + (sz * c + oz * s) * radii[i]!];
        ring.push(this.v(p, colour, rig(i, p), rig2, [i / (path.length - 1), k / sides, zone, 0]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) this.quad(rings[i]![k]!, rings[i]![k + 1]!, rings[i + 1]![k]!, rings[i + 1]![k + 1]!);
    this.normals(start, startI);
  }

  /** A ball (eyes, bladders). */
  ball(centre: V3, r: V3, seg: number, colour: V3, rig: [number, number, number, number], rig2: [number, number, number, number], zone: number, e: V3 = [0, 0, 0]): void {
    const start = this.pos.length / 3, startI = this.idx.length;
    const rows: number[][] = [];
    const rings = Math.max(4, Math.round(seg * 0.7));
    for (let j = 0; j <= rings; j++) {
      const th = (j / rings) * Math.PI;
      const row: number[] = [];
      for (let k = 0; k <= seg; k++) {
        const ph = (k / seg) * Math.PI * 2;
        const d: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        row.push(this.v([centre[0] + d[0] * r[0], centre[1] + d[1] * r[1], centre[2] + d[2] * r[2]], colour, rig, rig2, [k / seg, j / rings, zone, 0], e));
      }
      rows.push(row);
    }
    for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) this.quad(rows[j]![k]!, rows[j]![k + 1]!, rows[j + 1]![k]!, rows[j + 1]![k + 1]!);
    this.normals(start, startI);
  }

  /** A thin sheet from a grid of points (membranes, fins, sails). Drawn two-sided by the material. */
  sheet(grid: V3[][], colour: V3, rig: (r: number, c: number, p: V3) => [number, number, number, number], zone: number): void {
    const start = this.pos.length / 3, startI = this.idx.length;
    const ids = grid.map((row, r) => row.map((p, c) => this.v(p, colour, rig(r, c, p), [0, 0, 0, 0], [c / Math.max(1, row.length - 1), r / Math.max(1, grid.length - 1), zone, 0])));
    for (let r = 0; r < grid.length - 1; r++) for (let c = 0; c < grid[r]!.length - 1; c++) this.quad(ids[r]![c]!, ids[r]![c + 1]!, ids[r + 1]![c]!, ids[r + 1]![c + 1]!);
    this.normals(start, startI);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    // one shared buffer: WebGPU allows 8 vertex buffers per draw and the instance data needs room too
    packAttributes(g, [
      { name: 'color', size: 3, data: this.col }, { name: 'rig', size: 4, data: this.rig }, { name: 'rig2', size: 4, data: this.rig2 },
      { name: 'skin', size: 4, data: this.skin }, { name: 'emissive', size: 3, data: this.emi },
    ], this.pos.length / 3);
    g.setIndex(this.idx);
    return g;
  }
}

const rgb = (c: Color, k = 1): V3 => [c.r * k, c.g * k, c.b * k];

export function buildCreatureModel(g: Float32Array): CreatureModel {
  const m = new Mesh();
  const kind = limbKind(g[G.LimbType]!);
  const hasLimbs = g[G.LimbPairs]! > 0.12;
  const ratio = 1.6 + 2.8 * g[G.BodyRatio]!;
  const L = 1;
  const H = (L / ratio) * (1 + 0.25 * g[G.Insulation]!);
  const W = H * (0.85 + 0.3 * g[G.Armor]!);
  const walker = hasLimbs && (kind === Limb.Legs || kind === Limb.Wings);
  const swimmer = !walker;
  const legLen = walker ? H * (0.45 + 1.5 * g[G.LimbLength]!) : 0;
  const bodyY = legLen + H * 0.5;
  const segs = Math.max(1, Math.min(6, 1 + Math.round(g[G.Segments]! * 5)));
  const neck = H * 2.4 * g[G.Neck]!;
  const hs = H * (0.5 + 0.6 * g[G.Head]!);
  const snout = 1 + 0.5 * g[G.Diet]!;
  const tail = L * 1.15 * g[G.Tail]!;
  const hasNeck = neck > H * 0.3;
  const headX = L / 2 + neck * 0.55, headY = bodyY + H * 0.15 + neck * 0.8;
  const headLen = hs * 1.25 * snout;

  // ---- colours
  const insulated = g[G.Insulation]! > 0.5;
  // natural skins are muted: the genes give the hue, the renderer keeps saturation believable
  const base = new Color().setHSL(g[G.Hue]!, insulated ? 0.28 : 0.46, insulated ? 0.4 : 0.33);
  const second = new Color().setHSL(g[G.Hue2]!, 0.5, 0.22);
  const belly = base.clone().lerp(new Color(0.9, 0.86, 0.75), 0.4);
  const hornC: V3 = [0.85, 0.8, 0.68];
  const glowC = new Color().setHSL(g[G.GlowHue]!, 0.9, 0.55);
  const glows = g[G.Glow]! > 0.5 || (g[G.Electric]! > 0.6 && g[G.Water]! > 0.6);
  const aquatic = g[G.Water]! > 0.6;
  const flying = kind === Limb.Wings && hasLimbs;
  let cover: number = COVER.hide;
  if (g[G.Armor]! > 0.5) cover = segs >= 3 ? COVER.chitin : COVER.scales;
  else if (g[G.Insulation]! > 0.55) cover = flying ? COVER.feathers : COVER.fur;
  else if (aquatic || g[G.Hue2]! > 0.55) cover = COVER.scales;
  if (segs >= 5 && g[G.Insulation]! < 0.4) cover = COVER.chitin;
  const furLen = cover === COVER.fur ? H * (0.05 + 0.14 * g[G.Insulation]!) : 0;

  // ---- the spine: stations from tail tip to snout
  interface Station { x: number; y: number; ry: number; rz: number; kind: number; w: number; }
  const st: Station[] = [];
  const taper = (u: number) => 0.72 + 0.28 * Math.sin(u * Math.PI);
  const endR = 0.5 * taper(0);
  if (tail > 0.08) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = 1 - i / n; // 1 at tip, toward 0 at base
      const r = Math.max(0.004, Math.pow(1 - t, 0.75) * endR * 0.92 + 0.01 * (1 - t));
      st.push({ x: -L / 2 - tail * t + 0.02, y: bodyY - tail * 0.1 * t * t, ry: H * r * (swimmer ? 1.15 : 1), rz: W * r * (swimmer ? 0.6 : 1), kind: RIG.tail, w: t });
    }
  } else st.push({ x: -L / 2 - H * 0.12, y: bodyY, ry: 0.004, rz: 0.004, kind: RIG.body, w: 0 });
  const torsoN = 12;
  for (let i = 0; i <= torsoN; i++) {
    const u = i / torsoN;
    // segmented bodies pinch in between their segments
    const pinch = segs > 1 ? 1 - 0.2 * Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI * 2 * segs), 6) : 1;
    const r = 0.5 * taper(u) * pinch;
    st.push({ x: -L / 2 + u * L, y: bodyY + H * 0.04 * Math.sin(u * Math.PI), ry: H * r, rz: W * r, kind: swimmer ? RIG.tail : RIG.body, w: swimmer ? 0.3 * (1 - u) * (1 - u) : 0 });
  }
  const front = st[st.length - 1]!;
  if (hasNeck) {
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const e = t * t * (3 - 2 * t);
      const r = (front.ry / H) * (1 - e) + 0.19 * e + 0.04 * Math.sin(t * Math.PI) * 0;
      st.push({ x: front.x + (headX - front.x) * t, y: front.y + (headY - front.y) * e, ry: H * r, rz: W * r * 0.9, kind: RIG.head, w: t * 0.7 });
    }
  }
  // head: an egg, longer toward the snout
  const hN = 7;
  const hx0 = hasNeck ? headX - hs * 0.25 : front.x + hs * 0.05, hy = hasNeck ? headY : front.y + H * 0.12;
  for (let i = 0; i <= hN; i++) {
    const t = i / hN;
    const prof = Math.pow(Math.sin(Math.min(1, t * 0.92 + 0.08) * Math.PI), 0.62) * (1 - 0.3 * t);
    const r = i === hN ? 0.012 : Math.max(0.03, prof) * 0.5;
    st.push({ x: hx0 + t * headLen, y: hy - hs * 0.08 * t, ry: hs * r * (i === 0 && hasNeck ? 0.85 : 1), rz: hs * 0.95 * r, kind: RIG.head, w: 1 });
  }
  // ---- loft the skin
  const M = 12;
  const x0 = st[0]!.x, x1 = st[st.length - 1]!.x;
  const loftStart = m.pos.length / 3, loftIndex = m.idx.length;
  const rows: number[][] = [];
  for (let i = 0; i < st.length; i++) {
    const s = st[i]!;
    const row: number[] = [];
    for (let k = 0; k <= M; k++) {
      const th = (k / M) * Math.PI * 2;
      const cy = Math.cos(th), sz = Math.sin(th);
      // bellies are a little flatter than backs
      const p: V3 = [s.x, s.y + cy * s.ry * (cy < 0 ? 0.92 : 1), sz * s.rz];
      const under = Math.max(0, Math.min(1, (-cy + 0.2) / 0.7));
      const c: V3 = [base.r + (belly.r - base.r) * under * 0.6, base.g + (belly.g - base.g) * under * 0.6, base.b + (belly.b - base.b) * under * 0.6];
      row.push(m.v(p, c, [s.kind, s.w, 0, sz >= 0 ? 1 : -1], [(s.x - x0) / (x1 - x0), 0, 0, 0], [(s.x - x0) / (x1 - x0), k / M, ZONE.skin, 0]));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < M; k++) m.quad(rows[i]![k]!, rows[i]![k + 1]!, rows[i + 1]![k]!, rows[i + 1]![k + 1]!);
  m.normals(loftStart, loftIndex);
  const loftEnd = m.pos.length / 3, loftIndexEnd = m.idx.length;
  // ---- fur: shells of the same skin pushed outward, cut into hairs by the shader
  if (furLen > 0) {
    const SHELLS = 4;
    for (let sh = 1; sh <= SHELLS; sh++) {
      const off = m.pos.length / 3 - loftStart;
      for (let i = loftStart; i < loftEnd; i++) {
        const id = m.v([m.pos[i * 3]!, m.pos[i * 3 + 1]!, m.pos[i * 3 + 2]!], [m.col[i * 3]!, m.col[i * 3 + 1]!, m.col[i * 3 + 2]!],
          [m.rig[i * 4]!, m.rig[i * 4 + 1]!, m.rig[i * 4 + 2]!, m.rig[i * 4 + 3]!], [m.rig2[i * 4]!, sh / SHELLS, 0, 0], [m.skin[i * 4]!, m.skin[i * 4 + 1]!, ZONE.skin, (sh / SHELLS) * furLen]);
        m.nrm[id * 3] = m.nrm[i * 3]!; m.nrm[id * 3 + 1] = m.nrm[i * 3 + 1]!; m.nrm[id * 3 + 2] = m.nrm[i * 3 + 2]!;
      }
      for (let t = loftIndex; t < loftIndexEnd; t++) m.idx.push(m.idx[t]! + off);
    }
  }

  const headRig: [number, number, number, number] = [RIG.head, 1, 0, 1];
  // ---- eyes
  const eyes = Math.round(g[G.EyeCount]! * 6);
  const es = hs * (0.1 + 0.14 * g[G.EyeSize]!);
  const iris: V3 = rgb(new Color().setHSL((g[G.Hue2]! + 0.5) % 1, 0.75, 0.45));
  const eyeGlow: V3 = g[G.Nocturnal]! > 0.6 ? rgb(new Color().setHSL(g[G.GlowHue]!, 0.8, 0.5), 0.6) : [0, 0, 0];
  for (let e = 0; e < eyes; e++) {
    const side = e % 2 === 0 ? 1 : -1;
    const row = Math.floor(e / 2);
    const t = 0.55 - row * 0.2;
    const c: V3 = [hx0 + t * headLen, hy + hs * (0.16 + row * 0.1), side * hs * (0.36 - row * 0.03)];
    m.ball(c, [es, es, es], 8, iris, [RIG.head, 1, 0, side], [c[0], c[1], c[2], es], ZONE.eye, eyeGlow);
  }
  // ---- horns: curved, tapering
  if (g[G.Horn]! > 0.22) {
    const hl = hs * 2.2 * g[G.Horn]!;
    for (const side of [1, -1]) {
      const path: V3[] = [], radii: number[] = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        path.push([hx0 + headLen * 0.3 - hl * 0.35 * t * t + hl * 0.1 * t, hy + hs * 0.35 + hl * 0.8 * t - hl * 0.15 * t * t, side * (hs * 0.24 + hl * 0.22 * t * (1 - t * 0.5))]);
        radii.push(hs * 0.12 * (1 - t * 0.92));
      }
      m.tube(path, radii, 6, hornC, () => headRig, [0, 0, 0, 0], ZONE.bone);
    }
  }
  // ---- legs: thigh, shin and foot, posed by the shader
  const pairs = hasLimbs ? Math.max(1, Math.round(g[G.LimbPairs]! * 4)) : 0;
  const limbC: V3 = rgb(base, 0.82);
  if (walker) {
    const legPairs = kind === Limb.Wings ? 1 : pairs;
    const thick = H * (0.11 + 0.1 * g[G.Size]!);
    for (let p = 0; p < legPairs; p++) {
      const lx = legPairs === 1 ? 0.05 : -L * 0.34 + (p / (legPairs - 1)) * L * 0.68;
      for (const side of [1, -1]) {
        const hipY = bodyY - H * 0.12, hipZ = side * W * 0.36;
        const phase = (p + (side > 0 ? 0 : 1)) % 2;
        // hind legs bend the other way from fore legs
        const sideCode = side * (p < legPairs / 2 && legPairs > 1 ? 2 : 1);
        const rig2: [number, number, number, number] = [lx, hipY, hipY, hipZ];
        const path: V3[] = [], radii: number[] = [];
        const ankle = hipY * 0.06;
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          path.push([lx, hipY - (hipY - ankle) * t, hipZ]);
          radii.push(thick * (1.15 - 0.7 * t + 0.18 * Math.sin(t * Math.PI * 2) * (t < 0.5 ? 1 : 0.4)));
        }
        m.tube(path, radii, 6, limbC, (i) => [RIG.leg, i / 6, phase, sideCode], rig2, ZONE.limb);
        // foot: a low pad reaching forward, little wider than the shin and set slightly into the ground. As a round
        // ball three shins wide it read as a ball on a stick, and it hovered on uneven ground (seen on a real GPU).
        const footH = Math.max(ankle * 0.5, thick * 0.3);
        m.ball([lx + thick * 0.75, footH * 0.7, hipZ], [thick * 1.25, footH, thick * 0.62], 6, limbC, [RIG.leg, 1.1, phase, sideCode], rig2, ZONE.limb);
      }
    }
  }
  // ---- fins
  const finC: V3 = rgb(base, 0.82);
  if (hasLimbs && kind === Limb.Fins) {
    for (let p = 0; p < Math.min(3, pairs); p++) {
      const fx = L * 0.25 - p * L * 0.3;
      for (const side of [1, -1]) {
        const len = H * (0.6 + 1.2 * g[G.LimbLength]!);
        const grid: V3[][] = [];
        for (let r = 0; r <= 4; r++) {
          const t = r / 4;
          const row: V3[] = [];
          for (let c = 0; c <= 3; c++) {
            const s = c / 3 - 0.5;
            const chord = H * 0.55 * (1 - t * 0.85);
            row.push([fx + s * chord - t * len * 0.45, bodyY - H * 0.2 - t * len * 0.25, side * (W * 0.42 + t * len * 0.85)]);
          }
          grid.push(row);
        }
        m.sheet(grid, finC, (r) => [RIG.tail, r / 4, p, side], ZONE.membrane);
      }
    }
  }
  // tail fluke for swimmers
  if (tail > 0.08 && swimmer) {
    const tx = -L / 2 - tail + 0.02;
    const grid: V3[][] = [];
    for (let r = 0; r <= 4; r++) {
      const t = r / 4 - 0.5;
      const row: V3[] = [];
      for (let c = 0; c <= 2; c++) {
        const s = c / 2;
        row.push([tx + tail * 0.12 - s * H * (0.5 + 0.9 * Math.abs(t)), bodyY - tail * 0.1 + t * H * 1.5 * (0.35 + 0.65 * s), 0]);
      }
      grid.push(row);
    }
    m.sheet(grid, finC, () => [RIG.tail, 1, 0, 1], ZONE.membrane);
  }
  // ---- wings: a membrane on three fingers
  if (flying) {
    const span = L * (0.8 + 1.3 * g[G.LimbLength]!);
    const wingC: V3 = rgb(cover === COVER.feathers ? base : second, cover === COVER.feathers ? 0.9 : 1.1);
    for (const side of [1, -1]) {
      const grid: V3[][] = [];
      for (let r = 0; r <= 7; r++) {
        const t = r / 7;
        const row: V3[] = [];
        for (let c = 0; c <= 4; c++) {
          const s = c / 4;
          const chord = L * 0.62 * (1 - t * 0.7) * (1 - 0.12 * Math.abs(Math.sin(t * Math.PI * 3)) * s);
          row.push([0.22 - t * L * 0.1 - s * chord, bodyY + H * 0.3 + Math.sin(t * Math.PI) * H * 0.12, side * (W * 0.36 + t * span)]);
        }
        grid.push(row);
      }
      m.sheet(grid, wingC, (r) => [RIG.wing, r / 7, 0, side], ZONE.membrane);
      // the arm along the leading edge
      const path: V3[] = [], radii: number[] = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; path.push([0.22 - t * L * 0.1, bodyY + H * 0.3 + Math.sin(t * Math.PI) * H * 0.12, side * (W * 0.36 + t * span)]); radii.push(H * 0.07 * (1 - t * 0.8)); }
      m.tube(path, radii, 5, limbC, (i) => [RIG.wing, i / 5, 0, side], [0, 0, 0, 0], ZONE.limb);
    }
  }
  // gliding membrane between the limbs of would-be fliers
  if (hasLimbs && kind === Limb.Legs && g[G.LimbType]! > 0.66) {
    for (const side of [1, -1]) {
      const grid: V3[][] = [];
      // A flap of skin along the flank, not a board: it narrows and droops away from the body and its front and
      // back edges curve in. (As a plain rectangle it stuck out of the animal's side like a card.)
      for (let r = 0; r <= 2; r++) {
        const row: V3[] = [];
        const out = r / 2, span = L * 0.6 * (1 - 0.45 * out);
        for (let c = 0; c <= 3; c++) {
          const t = c / 3, edge = Math.abs(t - 0.5) * 2;
          row.push([-span / 2 + t * span, bodyY - H * 0.1 - out * H * 0.24 - out * edge * H * 0.06, side * (W * 0.3 + out * W * 0.55 * (1 - 0.4 * edge * edge))]);
        }
        grid.push(row);
      }
      m.sheet(grid, limbC, () => [RIG.body, 0, 0, side], ZONE.membrane);
    }
  }
  // ---- armour: a ridge of plates along the back
  if (g[G.Armor]! > 0.45) {
    const n = 7;
    const size = H * (0.18 + 0.3 * g[G.Armor]!);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const px = -L * 0.42 + u * L * 0.84;
      const top = bodyY + H * 0.5 * taper(u) * 0.95;
      const s = size * (0.6 + 0.4 * Math.sin(u * Math.PI));
      const grid: V3[][] = [[[px - s * 0.5, top - s * 0.15, 0], [px + s * 0.5, top - s * 0.15, 0]], [[px - s * 0.35, top + s * 0.6, 0], [px + s * 0.3, top + s * 0.55, 0]], [[px - s * 0.05, top + s, 0], [px + s * 0.05, top + s, 0]]];
      m.sheet(grid, rgb(base, 0.5), () => [RIG.body, 0, 0, 1], ZONE.bone);
    }
  }
  // ---- ornament: a sail along the back, in the second colour
  if (g[G.Ornament]! > 0.4) {
    const ch = H * 1.6 * g[G.Ornament]!;
    const grid: V3[][] = [];
    for (let r = 0; r <= 3; r++) {
      const row: V3[] = [];
      for (let c = 0; c <= 8; c++) {
        const u = c / 8;
        const hgt = ch * Math.pow(Math.sin(u * Math.PI), 0.7) * (0.85 + 0.15 * Math.cos(u * Math.PI * 8));
        row.push([-L * 0.35 + u * L * 0.6, bodyY + H * 0.45 * taper(0.2 + u * 0.6) + (r / 3) * hgt, 0]);
      }
      grid.push(row);
    }
    m.sheet(grid, rgb(second, 1.3), (r) => [RIG.tail, (r / 3) * 0.15, 2, 1], ZONE.membrane);
  }
  // gas-bladder drifters: slow winged bodies carry a great pale float above them
  if (flying && g[G.Metabolism]! < 0.3 && g[G.Size]! > 0.45) {
    m.ball([0, bodyY + H * 1.7, 0], [L * 0.55, H * 1.1, W * 1.1], 12, rgb(second, 1.3), [RIG.body, 0, 0, 1], [0, 0, 0, 0], ZONE.bladder);
  }
  // living islands and walking forests: giants that carry a grove on their backs
  if (g[G.Size]! > 0.85 && (g[G.Water]! > 0.7 ? g[G.Armor]! > 0.25 : g[G.ColorChange]! > 0.6)) {
    for (let t = 0; t < 5; t++) {
      const tx = -L * 0.3 + t * L * 0.15, tz = (t % 2 ? 1 : -1) * W * 0.18;
      const by = bodyY + H * 0.4;
      m.tube([[tx, by, tz], [tx, by + H * 0.45, tz], [tx, by + H * 0.9, tz]], [H * 0.2, H * 0.14, 0.004], 6, [0.12, 0.42, 0.16], () => [RIG.body, 0, 0, 1], [0, 0, 0, 0], ZONE.grove);
    }
  }
  const pattern = Math.min(3, Math.floor(g[G.PatternType]! * 4));
  return {
    geometry: m.build(),
    skinA: [second.r, second.g, second.b, pattern],
    skinB: [cover, aquatic ? 1 : 0, Math.max(0, g[G.ColorChange]! - 0.45) * 1.8, 4 + 18 * g[G.PatternScale]!],
    skinC: [glowC.r, glowC.g, glowC.b, glows ? 1 : 0],
  };
}

export interface CreatureInstanceData { iPos: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; iTint: InterleavedBufferAttribute }

/**
 * Per-animal data (place, facing, size and gait, golden tint), all in one shared buffer. The species'
 * skin settings ride along as instance data too, so that every species can share one material.
 */
export function addCreatureInstanceData(model: CreatureModel, cap: number): CreatureInstanceData {
  return packAttributes(model.geometry, [
    { name: 'iPos', size: 3 }, { name: 'iQuat', size: 4 }, { name: 'iData', size: 4 }, { name: 'iTint', size: 1 },
    { name: 'iSkinA', size: 4, data: model.skinA }, { name: 'iSkinB', size: 4, data: model.skinB }, { name: 'iSkinC', size: 4, data: model.skinC },
  ], cap, { instanced: true, dynamic: true }) as unknown as CreatureInstanceData;
}
