// Creature bodies from genomes: one continuous skin lofted along a spine from tail tip to snout,
// jointed legs, membrane wings and fins, curved horns, round eyes, back plates, sails, and shells of
// fur. Every vertex carries what the skin shader needs to animate it (which part it belongs to and
// how strongly it follows that part's motion) and to shade it (a skin uv and a material zone).
// Local frame: +X forward, +Y up, torso length 1, feet on y = 0.
import { BufferAttribute, BufferGeometry, Color, type InterleavedBufferAttribute } from 'three/webgpu';
import { G, HUNTER_DIET as HUNTER, Limb, limbKind } from '../../sim/genetics';
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
  // legs carry weight: a giant's are short and thick for its body, and none are stilts (the old range reached 1.95 body
  // depths and read as a body on poles)
  const legLen = walker ? H * (0.4 + 1.05 * g[G.LimbLength]!) * (1 - 0.22 * Math.max(0, g[G.Size]! - 0.6) / 0.4) : 0;
  const bodyY = legLen + H * 0.5;
  const segs = Math.max(1, Math.min(6, 1 + Math.round(g[G.Segments]! * 5)));
  // a neck no longer than the legs and body can balance
  const neck = Math.min(H * 2.4 * g[G.Neck]!, legLen * 1.25 + H * 0.9);
  const hs = H * (0.5 + 0.6 * g[G.Head]!);
  const snout = 1 + 0.5 * g[G.Diet]!;
  // an animal on one pair of legs needs a tail to stand against
  const biped = walker && (kind === Limb.Wings || Math.max(1, Math.round(g[G.LimbPairs]! * 4)) === 1);
  const tail = L * 1.15 * Math.max(g[G.Tail]!, biped ? 0.36 : 0);
  const hasNeck = neck > H * 0.3;
  const headX = L / 2 + neck * 0.55, headY = bodyY + H * 0.15 + neck * 0.8;
  const headLen = hs * 1.25 * snout;

  // ---- colours
  const insulated = g[G.Insulation]! > 0.5;
  // natural skins are muted: the genes give the hue, the renderer keeps saturation believable
  const base = new Color().setHSL(g[G.Hue]!, insulated ? 0.4 : 0.56, insulated ? 0.46 : 0.4);
  // animals of the dark underground lose their colour: pale, almost white
  if (g[G.Burrow]! > 0.6 && g[G.Nocturnal]! > 0.58) base.lerp(new Color(0.86, 0.82, 0.78), 0.7);
  const second = new Color().setHSL(g[G.Hue2]!, 0.62, 0.3);
  const belly = base.clone().lerp(new Color(0.94, 0.9, 0.8), 0.55);
  // the second colour as it is worn on the back, the face and the feet
  const mark = base.clone().lerp(second, 0.75);
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
  // `sq` squares the section off (2 is an ellipse), `ridge` raises the line of the back, `lump` is the mass of a
  // shoulder or haunch on the lower flank where a leg joins.
  interface Station { x: number; y: number; ry: number; rz: number; kind: number; w: number; sq?: number; ridge?: number; lump?: number; /** how far the section reaches below its middle (1 is as far as above) */ low?: number; /** how much of the face colour it wears, 0..1 */ face?: number; /** a brow: the upper flank of the section stands out over the eyes */ brow?: number; }
  const st: Station[] = [];
  // ---- anatomy. A body is not a sausage: it is deep at the chest, drawn in at the waist and wide again at the hips,
  // and a hunter is leaner than a grazer. (With one smooth bump for thickness and plain ellipses for sections,
  // every animal was a bean on pipes.)
  const hunterish = Math.max(0, Math.min(1, (g[G.Diet]! - 0.25) / 0.4));
  const runner = walker ? g[G.LimbLength]! : 0;
  const bell = (u: number, c: number, wd: number) => Math.exp(-(((u - c) / wd) ** 2));
  const fish = (u: number, e: number) => Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, u * 0.94 + 0.03)), e)), 0.85);
  /** Depth and width of the trunk along the spine: 0 at the tail root, 1 at the neck. About 1 at the deepest. */
  const depthAt = (u: number): number => walker
    ? 0.6 + 0.42 * bell(u, 0.74, 0.26) + 0.14 * bell(u, 0.14, 0.2) + 0.1 * (1 - hunterish) * bell(u, 0.48, 0.3) - (0.06 + 0.12 * hunterish + 0.08 * runner) * bell(u, 0.4, 0.18)
    : 0.5 + 0.5 * fish(u, 0.85);
  const widthAt = (u: number): number => walker
    ? 0.66 + 0.3 * bell(u, 0.74, 0.26) + 0.24 * bell(u, 0.16, 0.22) + 0.06 * (1 - hunterish) * bell(u, 0.46, 0.3) - 0.06 * runner * bell(u, 0.42, 0.18)
    : 0.5 + 0.46 * fish(u, 0.8);
  // where the legs stand along the body (the same places the legs are built at, below)
  const legPairsEarly = walker ? (kind === Limb.Wings ? 1 : Math.max(1, Math.round(g[G.LimbPairs]! * 4))) : 0;
  const legXs: number[] = [];
  for (let p = 0; p < legPairsEarly; p++) legXs.push(legPairsEarly === 1 ? 0.05 : -L * 0.34 + (p / (legPairsEarly - 1)) * L * 0.68);
  const endR = 0.5 * depthAt(0);
  /** Height of the back above the middle of the body, for what stands on it (plates, sails). */
  const taper = depthAt;
  /** A point on the skin of the trunk: u along it (0 tail root .. 1 neck), th round it from the top of the back, lifted off the skin by `lift`. */
  const skinAt = (u: number, th: number, lift: number): V3 => {
    const ry = H * 0.5 * depthAt(u), rz = W * 0.5 * widthAt(u);
    const c = Math.cos(th), sn = Math.sin(th), e = 0.87;
    return [-L / 2 + u * L, bodyY + H * 0.04 * Math.sin(u * Math.PI) + Math.sign(c) * Math.pow(Math.abs(c), e) * (ry + lift), Math.sign(sn) * Math.pow(Math.abs(sn), e) * (rz + lift)];
  };
  if (tail > 0.08) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = 1 - i / n; // 1 at tip, toward 0 at base
      const r = Math.max(0.004, Math.pow(1 - t, 0.75) * endR * 0.92 + 0.01 * (1 - t));
      st.push({ x: -L / 2 - tail * t + 0.02, y: bodyY - tail * 0.1 * t * t, ry: H * r * (swimmer ? 1.15 : 1), rz: W * r * (swimmer ? 0.6 : 1), kind: RIG.tail, w: t });
    }
  } else st.push({ x: -L / 2 - H * 0.12, y: bodyY, ry: 0.004, rz: 0.004, kind: RIG.body, w: 0 });
  const torsoN = 26;
  for (let i = 0; i <= torsoN; i++) {
    const u = i / torsoN;
    // segmented bodies pinch in between their segments
    // (a deep pinch between segments made a string of beads; a plated animal's bands overlap like roof tiles, each
    // standing a little proud at its back edge, and a soft one only swells gently)
    const within = (u * segs) % 1;
    const pinch = segs > 1 ? (cover === COVER.chitin ? 0.97 + 0.06 * within : 1 - 0.035 * (0.5 + 0.5 * Math.cos(u * Math.PI * 2 * segs))) : 1;
    const r = 0.5 * pinch;
    const x = -L / 2 + u * L;
    let lump = 0;
    for (const lx of legXs) lump = Math.max(lump, bell(x, lx, L * 0.11));
    // the belly hangs a little between the legs of a grazer; the back carries a low ridge
    const sag = walker ? H * 0.035 * bell(u, 0.45, 0.2) * (1 - hunterish) : 0;
    st.push({
      x, y: bodyY + H * 0.04 * Math.sin(u * Math.PI) - sag, ry: H * r * depthAt(u), rz: W * r * widthAt(u), kind: swimmer ? RIG.tail : RIG.body, w: swimmer ? 0.3 * (1 - u) * (1 - u) : 0,
      sq: walker ? 2.3 - 0.2 * hunterish : 2, ridge: walker ? 0.06 : 0.1, lump,
    });
  }
  const front = st[st.length - 1]!;
  if (hasNeck) {
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const e = t * t * (3 - 2 * t);
      // (it tapers to what the head needs, not to a wire)
      const r = (front.ry / H) * (1 - e) + Math.max(0.2, (hs / H) * 0.34) * e;
      st.push({ x: front.x + (headX - front.x) * t, y: front.y + (headY - front.y) * e, ry: H * r, rz: W * r * 0.9, kind: RIG.head, w: t * 0.7 });
    }
  }
  // ---- the head. It grows out of the neck without a step, swells to a braincase, and ends in an upper jaw that is
  // flat underneath; the lower jaw is a part of its own, hung a little open below it, with the dark of the mouth
  // between. (As one closed shape it read as a bell with a hollow, and no animal had a mouth.) These are invented
  // animals: the jaw is a plain scoop or a hooked shear, not a muzzle with lips.
  const hN = 16;
  const hx0 = hasNeck ? headX - hs * 0.25 : front.x + hs * 0.05, hy = hasNeck ? headY : front.y + H * 0.12;
  const neckR = hasNeck ? Math.max(0.2, (hs / H) * 0.34) * (H / hs) : Math.min(0.5, (front.ry / hs) * 0.9);
  /** Half-height and half-width of the head at t (0 back of the skull .. 1 tip of the jaw), in head sizes. */
  const headR = (t: number): number => {
    const grow = Math.min(1, t / 0.3);
    const skull = neckR + (0.5 - neckR) * grow * grow * (3 - 2 * grow);
    const fore = Math.max(0, (t - 0.38) / 0.62);
    const jawEnd = 0.2 + 0.08 * hunterish;
    // the snout closes in a rounded tip: left blunt, the end of the head was a ring, and with the jaw under it the
    // whole head read from in front as a cup with a hollow (seen in the game, on animals at the surface of the sea)
    const tip = t > 0.8 ? Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) : 1;
    return i0((skull * (1 - fore) + (jawEnd + (0.5 - jawEnd) * Math.pow(1 - fore, 1.6)) * fore) * (0.25 + 0.75 * tip));
  };
  const i0 = (x: number) => Math.max(0.03, x);
  for (let i = 0; i <= hN; i++) {
    const t = i / hN;
    const r = i === hN ? 0.02 : headR(t);
    const fore = Math.max(0, Math.min(1, (t - 0.4) / 0.25));
    // the tip of a hunter's jaw hooks down
    const hook = hunterish * hs * 0.07 * Math.pow(Math.max(0, (t - 0.8) / 0.2), 2);
    st.push({
      x: hx0 + t * headLen, y: hy - hs * 0.05 * t - hook,
      ry: hs * r, rz: hs * r * (0.98 - 0.22 * fore), kind: RIG.head, w: 1,
      sq: 2.2, ridge: 0.16 * bell(t, 0.36, 0.1), low: 1 - 0.78 * fore * fore * (3 - 2 * fore), face: Math.max(0, Math.min(1, (t - 0.3) / 0.4)), brow: 0.22 * bell(t, 0.42, 0.1),
    });
  }
  // ---- loft the skin
  const M = 20;
  const x0 = st[0]!.x, x1 = st[st.length - 1]!.x;
  const loftStart = m.pos.length / 3, loftIndex = m.idx.length;
  const rows: number[][] = [];
  for (let i = 0; i < st.length; i++) {
    const s = st[i]!;
    const row: number[] = [];
    for (let k = 0; k <= M; k++) {
      const th = (k / M) * Math.PI * 2;
      const cy0 = Math.cos(th), sz0 = Math.sin(th);
      // a rounded box where the body is a barrel, an ellipse elsewhere
      const sq = 2 / (s.sq ?? 2);
      const cy = Math.sign(cy0) * Math.pow(Math.abs(cy0), sq), sz = Math.sign(sz0) * Math.pow(Math.abs(sz0), sq);
      // the mass of a shoulder or haunch stands out on the lower flank; the back has a spine line
      const lump = (s.lump ?? 0) * Math.max(0, 1 - Math.abs(cy0 + 0.3) / 0.8);
      const ridge = (s.ridge ?? 0) * Math.pow(Math.max(0, cy0), 10);
      // bellies are a little flatter than backs
      // a brow stands out on the upper flank of the skull, so the eyes sit under it in shadow
      const brow = (s.brow ?? 0) * Math.max(0, 1 - Math.abs(cy0 - 0.55) / 0.4);
      const p: V3 = [s.x, s.y + cy * s.ry * (cy < 0 ? 0.92 * (s.low ?? 1) : 1) + ridge * s.ry - lump * s.ry * 0.06 + brow * s.ry * 0.25, sz * s.rz * (1 + lump * 0.15 + brow)];
      // colour follows the body: a pale belly, a line of the second colour down the back, the same colour on the face
      // and toward the tip of the tail
      const under = Math.max(0, Math.min(1, (-cy0 + 0.15) / 0.6));
      const backLine = Math.pow(Math.max(0, cy0), 3) * 0.85;
      const worn = Math.max(backLine, (s.face ?? 0) * 0.55 * (1 - under), s.kind === RIG.tail && !swimmer ? s.w * 0.6 : 0);
      const c: V3 = [0, 1, 2].map((ch) => { const b0 = [base.r, base.g, base.b][ch]!, be = [belly.r, belly.g, belly.b][ch]!, mk = [mark.r, mark.g, mark.b][ch]!; const body = b0 + (be - b0) * under * 0.85; return body + (mk - body) * worn; }) as V3;
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
  // one eye looks forward from the brow; pairs sit on the sides of the skull; an odd one out sits above and between
  const paired = eyes - (eyes % 2), rowsOfEyes = paired / 2;
  for (let e = 0; e < eyes; e++) {
    const middle = e >= paired;
    const side = middle ? 0 : e % 2 === 0 ? 1 : -1;
    const row = middle ? 0 : Math.floor(e / 2);
    const t = middle ? 0.5 : 0.46 - row * (rowsOfEyes > 2 ? 0.12 : 0.15);
    const hr = hs * headR(t);
    // set into the skull: two thirds of the ball is under the skin
    const c: V3 = middle
      ? [hx0 + t * headLen, hy - hs * 0.05 * t + hr * 0.82, 0]
      : [hx0 + t * headLen, hy - hs * 0.05 * t + hr * (0.28 + row * 0.16), side * (hr * 0.9 * (1 - row * 0.12) - es * 0.3)];
    m.ball(c, [es, es, es], 8, iris, [RIG.head, 1, 0, side || 1], [c[0], c[1], c[2], es], ZONE.eye, eyeGlow);
  }
  // ---- the lower jaw, and the dark of the mouth above it
  {
    const from = 0.42, n = 7;
    // (nearly shut: the mouth is a line along the side of the head, not a cavity)
    const gape = hs * (0.012 + 0.03 * hunterish);
    const path: V3[] = [], radii: number[] = [], roof: V3[][] = [[], []];
    for (let i = 0; i <= n; i++) {
      const t = from + (0.97 - from) * (i / n), a = i / n;
      const hr = hs * headR(t), fore = Math.max(0, Math.min(1, (t - 0.4) / 0.25));
      const under = hy - hs * 0.05 * t - hr * 0.92 * (1 - 0.78 * fore * fore * (3 - 2 * fore));
      const closed = Math.sin(Math.min(1, a / 0.12) * Math.PI / 2) * Math.sqrt(Math.max(0.02, 1 - Math.pow(Math.max(0, (a - 0.75) / 0.25), 2)));
      const half = hr * (0.98 - 0.22 * fore) * 0.8 * closed;
      const deep = hs * (0.11 + 0.05 * hunterish) * (1 - 0.55 * a);
      path.push([hx0 + t * headLen, under - gape * a - deep * 0.55, 0]);
      radii.push(Math.max(0.01, half));
      roof[0]!.push([hx0 + t * headLen, under - gape * a * 0.4, half * 0.7]);
      roof[1]!.push([hx0 + t * headLen, under - gape * a * 0.4, -half * 0.7]);
    }
    const jawC: V3 = rgb(belly, 0.92);
    m.tube(path, radii, 10, jawC, () => headRig, [0, 0, 0, 0], ZONE.skin, (hs * (0.11 + 0.05 * hunterish)) / Math.max(0.02, Math.max(...radii)));
    m.sheet(roof, [0.16, 0.035, 0.05], () => headRig, ZONE.bone);
  }
  if (g[G.Ornament]! > 0.25) {
    const tall = hs * (0.2 + 0.55 * g[G.Ornament]!);
    const grid: V3[][] = [];
    for (let r = 0; r <= 2; r++) {
      const row: V3[] = [];
      for (let c = 0; c <= 5; c++) {
        const t = 0.62 - (c / 5) * 0.62, up = (r / 2) * tall * Math.pow(Math.sin(Math.min(1, c / 5 + 0.12) * Math.PI * 0.9), 0.7);
        row.push([hx0 + t * headLen - up * 0.55, hy - hs * 0.05 * t + hs * headR(t) * 0.95 + up, 0]);
      }
      grid.push(row);
    }
    m.sheet(grid, rgb(second, 1.5), () => headRig, ZONE.membrane);
  }
  // ---- feelers: an animal that lives by scent or touch carries them on its snout; one that lives by hearing has
  // a pair of fans behind its eyes
  if (g[G.Smell]! > 0.55) {
    const fl = hs * (0.5 + 1.1 * (g[G.Smell]! - 0.55) / 0.45);
    for (const side of [1, -1]) {
      const path: V3[] = [], radii: number[] = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; path.push([hx0 + headLen * 0.86 + fl * 0.75 * t, hy - hs * 0.04 + fl * 0.45 * t * (1.4 - t), side * (hs * 0.1 + fl * 0.3 * t)]); radii.push(hs * 0.035 * (1 - t * 0.8)); }
      m.tube(path, radii, 5, rgb(mark, 1.1), () => headRig, [0, 0, 0, 0], ZONE.limb);
    }
  }
  if (g[G.Hearing]! > 0.6) {
    const fan = hs * (0.35 + 0.6 * (g[G.Hearing]! - 0.6) / 0.4);
    for (const side of [1, -1]) {
      const grid: V3[][] = [];
      for (let r = 0; r <= 2; r++) {
        const row: V3[] = [];
        for (let c = 0; c <= 4; c++) { const a = -0.5 + (c / 4) * 1.9, out = (r / 2) * fan * (0.75 + 0.25 * Math.cos(c * Math.PI)); row.push([hx0 + headLen * 0.2 - Math.cos(a) * out * 0.7, hy + hs * 0.15 + Math.sin(a) * out, side * (hs * headR(0.2) * 0.85 + out * 0.5)]); }
        grid.push(row);
      }
      m.sheet(grid, rgb(second, 1.5), () => headRig, ZONE.membrane);
    }
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
    // thicker for a big animal and for a short-legged one: weight has to go somewhere
    // (and never thin beside the length of the body: a long low animal on many legs still needs legs)
    const thick = Math.max(H * (0.14 + 0.12 * g[G.Size]! + 0.05 * (1 - g[G.LimbLength]!)), L * 0.055);
    // short legs sprawl out from the body; long ones stand under it
    const sprawl = Math.max(0, 0.55 - g[G.LimbLength]!) * 1.6;
    const toes = 2 + (Math.round(g[G.LimbType]! * 97) % 2);
    // 7. a foot for the life it leads (docs/concepts/07): a giant stands on pillars, a hunter on long clawed toes, a
    // long-legged plant-eater on a single hard block, the rest on a pad with blunt toes
    const pillar = g[G.Size]! > 0.7;
    const clawed = !pillar && g[G.Diet]! > HUNTER;
    const hoofed = !pillar && !clawed && g[G.LimbLength]! > 0.58;
    for (let p = 0; p < legPairs; p++) {
      const lx = legPairs === 1 ? 0.05 : -L * 0.34 + (p / (legPairs - 1)) * L * 0.68;
      for (const side of [1, -1]) {
        const hipY = bodyY - H * 0.04, hipZ = side * W * 0.27;
        const phase = (p + (side > 0 ? 0 : 1)) % 2;
        // hind legs bend the other way from fore legs
        const sideCode = side * (p < legPairs / 2 && legPairs > 1 ? 2 : 1);
        const rig2: [number, number, number, number] = [lx, hipY, hipY, hipZ];
        const path: V3[] = [], radii: number[] = [], shade: number[] = [];
        const ankle = hipY * 0.06;
        // a heavy thigh that starts inside the flank, so the leg grows out of the body; a knee; a lean shin; an ankle
        const NL = 12, lean = 1 - 0.3 * runner;
        for (let i = 0; i <= NL; i++) {
          const t = i / NL;
          path.push([lx, hipY - (hipY - ankle) * t, hipZ + side * thick * sprawl * t]);
          // (the top of the thigh is drawn in under the skin of the flank, so no edge shows where the leg begins)
          // the thigh is several times the shin (docs/concepts/02): more so for a runner and for an animal on two legs
          const thigh = (1.0 + 0.45 * runner + (legPairs === 1 ? 0.35 : 0)) * lean, shin = pillar ? 0.66 : 0.44 - 0.08 * runner;
          radii.push(thick * (thigh * Math.pow(1 - t, 2.2) + shin + 0.09 * bell(t, 0.52, 0.1) + (pillar ? 0.12 : 0.07) * bell(t, 1, 0.12)) * (0.55 + 0.45 * Math.min(1, t / 0.14)));
          shade.push(t);
        }
        // the leg is the body's colour where it leaves the body and the second colour toward the foot
        const legStart = m.pos.length / 3;
        m.tube(path, radii, 9, limbC, (i) => [RIG.leg, i / NL, phase, sideCode], rig2, ZONE.limb);
        for (let v = legStart; v < m.pos.length / 3; v++) {
          const t = Math.max(0, Math.min(1, (hipY - m.pos[v * 3 + 1]!) / Math.max(1e-6, hipY - ankle)));
          const k = Math.pow(t, 1.5) * 0.7;
          // (at the top it is the colour of the flank it grows out of)
          const f = [base.r + (belly.r - base.r) * 0.4, base.g + (belly.g - base.g) * 0.4, base.b + (belly.b - base.b) * 0.4];
          m.col[v * 3] = f[0]! + (mark.r * 0.8 - f[0]!) * k; m.col[v * 3 + 1] = f[1]! + (mark.g * 0.8 - f[1]!) * k; m.col[v * 3 + 2] = f[2]! + (mark.b * 0.8 - f[2]!) * k;
        }
        // the foot: a low pad set slightly into the ground, with two or three blunt toes spread in front of it
        const footC: V3 = rgb(mark, 0.75);
        const footH = Math.max(ankle * 0.5, thick * 0.3), fz = hipZ + side * thick * sprawl;
        const footRig: [number, number, number, number] = [RIG.leg, 1.1, phase, sideCode];
        if (pillar) {
          // a broad round pad, a little wider than the leg, with a row of blunt nails across the front
          m.ball([lx + thick * 0.1, footH * 0.8, fz], [thick * 1.15, footH * 1.2, thick * 1.1], 7, footC, footRig, rig2, ZONE.limb);
          for (let k = -1; k <= 1; k++) m.ball([lx + thick * 1.05, footH * 0.5, fz + k * thick * 0.55], [thick * 0.26, footH * 0.6, thick * 0.24], 4, hornC, footRig, rig2, ZONE.bone);
        } else if (hoofed) {
          // one hard block, narrower than the ankle above it, cut square at the ground
          m.ball([lx + thick * 0.3, footH * 0.95, fz], [thick * 0.72, footH * 1.25, thick * 0.5], 6, rgb(second, 0.7), footRig, rig2, ZONE.bone);
        } else {
          m.ball([lx + thick * 0.25, footH * 0.7, fz], [thick * (clawed ? 0.7 : 0.9), footH, thick * (clawed ? 0.6 : 0.8)], 6, footC, footRig, rig2, ZONE.limb);
          const count = clawed ? 3 : toes;
          for (let k = 0; k < count; k++) {
            const a = (k - (count - 1) / 2) * (count === 2 ? 0.7 : 0.55);
            const reach = clawed ? 1.35 : 0.95;
            m.ball([lx + thick * (0.25 + reach * Math.cos(a)), footH * 0.5, fz + thick * reach * Math.sin(a)], [thick * (clawed ? 0.8 : 0.62), footH * 0.7, thick * (clawed ? 0.2 : 0.3)], 5, footC, footRig, rig2, ZONE.limb);
            // a hunter's toes end in pale claws
            if (clawed) m.ball([lx + thick * (0.25 + (reach + 0.75) * Math.cos(a)), footH * 0.35, fz + thick * (reach + 0.75) * Math.sin(a)], [thick * 0.34, footH * 0.4, thick * 0.1], 4, hornC, footRig, rig2, ZONE.bone);
          }
        }
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
            // (the trailing edge is notched between the rays)
            const chord = H * 0.62 * (1 - t * 0.8) * (c === 0 && r % 2 ? 0.86 : 1);
            row.push([fx + s * chord - t * len * 0.45, bodyY - H * 0.2 - t * len * 0.25, side * (W * 0.42 + t * len * 0.85)]);
          }
          grid.push(row);
        }
        m.sheet(grid, finC, (r) => [RIG.tail, r / 4, p, side], ZONE.membrane);
      }
    }
  }
  if (swimmer) {
    // a fin along the back, its edge notched between the rays
    const grid: V3[][] = [];
    const tall = H * (0.22 + 0.5 * g[G.Tail]!);
    for (let r = 0; r <= 2; r++) {
      const row: V3[] = [];
      for (let c = 0; c <= 10; c++) {
        const u = 0.22 + (c / 10) * 0.56;
        const top = skinAt(u, 0, 0);
        const rise = (r / 2) * tall * Math.pow(Math.sin((c / 10) * Math.PI), 0.6) * (c % 2 ? 0.78 : 1);
        row.push([top[0] - rise * 0.35, top[1] - H * 0.02 + rise, 0]);
      }
      grid.push(row);
    }
    m.sheet(grid, rgb(mark, 1.1), (r) => [RIG.tail, (r / 2) * 0.12, 2, 1], ZONE.membrane);
    // an animal that makes its own light carries it in a row of spots along each flank, where it shows in dark water
    if (glows) {
      const lamp: V3 = [glowC.r, glowC.g, glowC.b];
      for (let k = 0; k < 8; k++) for (const side of [1, -1]) {
        const c = skinAt(0.16 + k * 0.1, side * 1.25, H * 0.004);
        const r = H * 0.035 * (1 - 0.05 * Math.abs(k - 4));
        m.ball(c, [r, r, r], 5, [glowC.r * 0.8, glowC.g * 0.8, glowC.b * 0.8], [RIG.tail, 0.3 * (1 - (0.16 + k * 0.1)) ** 2, 0, side], [0, 0, 0, 0], ZONE.bone, lamp);
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
          // broad at the root, swept back and drawn to a point, the trailing edge scalloped between three fingers and
          // hanging a little below the leading edge (as a flat rectangle it read as a board)
          const chord = L * 0.7 * Math.pow(1 - t, 0.75) * (1 - 0.28 * Math.abs(Math.sin(t * Math.PI * 3)) * s * s) + L * 0.03;
          row.push([0.22 - t * t * L * 0.34 - s * chord, bodyY + H * 0.3 + Math.sin(t * Math.PI) * H * 0.14 - s * s * H * 0.14, side * (W * 0.36 + t * span)]);
        }
        grid.push(row);
      }
      m.sheet(grid, wingC, (r) => [RIG.wing, r / 7, 0, side], ZONE.membrane);
      // the arm along the leading edge
      const path: V3[] = [], radii: number[] = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; path.push([0.22 - t * t * L * 0.34, bodyY + H * 0.3 + Math.sin(t * Math.PI) * H * 0.14, side * (W * 0.36 + t * span)]); radii.push(H * 0.08 * (1 - t * 0.8)); }
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
          // (it stands out from the flank above the legs; hung low it sat between them like a rag)
          row.push([-span / 2 + t * span, bodyY + H * 0.08 - out * H * 0.1, side * (W * 0.34 + out * W * 0.85 * (1 - 0.4 * edge * edge))]);
        }
        grid.push(row);
      }
      m.sheet(grid, rgb(mark, 1.05), () => [RIG.body, 0, 0, side], ZONE.membrane);
    }
  }
  // ---- a carapace: an armoured animal's back is covered in scutes that lie on it like tiles, each overlapping the
  // one behind and following the curve of the body, larger along the spine and smaller down the flanks. (Armour was
  // only ever a row of things standing on the back.)
  if (g[G.Armor]! > 0.45 && walker) {
    const along = 11, heavy = (g[G.Armor]! - 0.45) / 0.55;
    const reach = 0.75 + 0.5 * heavy; // how far down the flank the armour comes, in radians from the spine
    const across = 2 + Math.round(heavy * 2);
    for (let i = 0; i < along; i++) {
      const u0 = 0.05 + (i / along) * 0.9, u1 = u0 + (0.9 / along) * 1.25;
      for (let j = -across; j <= across; j++) {
        const dth = reach / (across + 0.5), th = (j + (i % 2 ? 0.5 : 0)) * dth;
        if (Math.abs(th) > reach) continue;
        const lift = H * (0.012 + 0.03 * heavy);
        // front edge on the skin, back edge raised over the next row
        const grid: V3[][] = [
          [skinAt(u1, th - dth * 0.55, lift * 0.3), skinAt(u1, th, lift * 0.45), skinAt(u1, th + dth * 0.55, lift * 0.3)],
          [skinAt((u0 + u1) / 2, th - dth * 0.6, lift), skinAt((u0 + u1) / 2, th, lift * 1.5), skinAt((u0 + u1) / 2, th + dth * 0.6, lift)],
          [skinAt(u0, th - dth * 0.42, lift * 1.5), skinAt(u0, th, lift * 2.1), skinAt(u0, th + dth * 0.42, lift * 1.5)],
        ];
        m.sheet(grid, rgb(mark, 0.62 + 0.3 * (((i * 3 + j * 5 + 20) % 4) / 3)), () => [RIG.body, 0, 0, th >= 0 ? 1 : -1], ZONE.bone);
      }
    }
  }
  // ---- armour: plates along the back. Two rows, staggered and leaning apart, each a rounded leaf that overlaps
  // the next, large over the hips and small toward the neck and tail. (One row of identical triangles read as the
  // edge of a saw.)
  if (g[G.Armor]! > 0.62 || (g[G.Armor]! > 0.45 && !walker)) {
    const n = 9;
    const size = H * (0.2 + 0.3 * g[G.Armor]!);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, side = i % 2 === 0 ? 1 : -1;
      const px = -L * 0.44 + u * L * 0.86;
      const top = bodyY + H * 0.5 * taper(u) * 0.93;
      const s = size * (0.45 + 0.55 * Math.pow(Math.sin(Math.min(1, u * 1.15) * Math.PI), 0.8)) * (0.9 + 0.2 * (((i * 7) % 5) / 4));
      const lean = side * 0.32;
      const grid: V3[][] = [];
      for (let r = 0; r <= 3; r++) {
        const h = r / 3, wide = [0.5, 0.56, 0.42, 0.14][r]! * s;
        const row: V3[] = [];
        for (let c = 0; c <= 2; c++) row.push([px + (c - 1) * wide - h * s * 0.12, top - s * 0.12 + h * s * 0.95, side * W * 0.1 + lean * h * s]);
        grid.push(row);
      }
      m.sheet(grid, rgb(mark, 0.85 + 0.25 * (i % 2)), () => [RIG.body, 0, 0, 1], ZONE.bone);
    }
  }
  // ---- the end of the tail: a club on an armoured walker, a fan in the second colour on one that shows off
  if (tail > 0.25 && walker) {
    const tx = -L / 2 - tail + 0.02, ty = bodyY - tail * 0.1;
    if (g[G.Armor]! > 0.5) m.ball([tx, ty, 0], [H * 0.2, H * 0.17, H * 0.2], 7, hornC, [RIG.tail, 1, 0, 1], [0, 0, 0, 0], ZONE.bone);
    else if (g[G.Ornament]! > 0.3) {
      const fan = Math.min(H * 0.75, H * (0.3 + 0.5 * g[G.Ornament]!));
      const grid: V3[][] = [];
      for (let r = 0; r <= 2; r++) { const row: V3[] = []; for (let c = 0; c <= 6; c++) { const a = (c / 6 - 0.5) * 2.0, reach = fan * (r / 2) * (0.82 + 0.18 * Math.cos(c * Math.PI)); row.push([tx + 0.03 - Math.cos(a) * reach, ty + Math.sin(a) * reach, 0]); } grid.push(row); }
      m.sheet(grid, rgb(second, 1.5), () => [RIG.tail, 1, 0, 1], ZONE.membrane);
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
    m.ball([0, bodyY + H * 1.7, 0], [L * 0.55, H * 1.1, W * 1.1], 18, rgb(second, 1.3), [RIG.body, 0, 0, 1], [0, 0, 0, 0], ZONE.bladder);
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
