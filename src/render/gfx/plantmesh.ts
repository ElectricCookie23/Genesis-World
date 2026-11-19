// Procedural plant models: real branching geometry with leaf cards, built once per growth form.
// Every vertex carries what the shader needs: a part id (bark, leaf cluster, needles, frond, blade,
// glow bulb, cap, succulent flesh, petal), a card uv for cut-out leaf shapes, baked ambient
// occlusion, and wind weights for trunk bend, branch sway and leaf flutter.
import { BufferAttribute, BufferGeometry, type InterleavedBufferAttribute } from 'three/webgpu';
import { packAttributes } from './packed';

export const PART = { bark: 0, leaf: 1, needle: 2, frond: 3, blade: 4, bulb: 5, cap: 6, flesh: 7, petal: 8 } as const;

export const FORMS = ['broadleaf', 'conifer', 'umbrella', 'palm', 'bottle', 'fan', 'mushroom', 'column', 'shrub', 'fern', 'tuft', 'flower'] as const;
export type Form = (typeof FORMS)[number];

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const perp = (d: V3): V3 => norm(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0]));
const rotateAbout = (v: V3, axis: V3, angle: number): V3 => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
};

class Builder {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; card: number[] = []; wind: number[] = []; idx: number[] = [];
  private rnd: () => number;
  /** Middle of the crown, for soft leaf shading and occlusion. */
  crown: V3 = [0, 0.75, 0];
  crownR = 0.45;

  constructor(seed: number) {
    let s = seed >>> 0 || 1;
    this.rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  r(a = 0, b = 1): number { return a + (b - a) * this.rnd(); }

  /** How open to the sky a point is: darker deep inside the crown and near the ground under it. */
  ao(p: V3): number {
    const d = Math.hypot(p[0] - this.crown[0], p[1] - this.crown[1], p[2] - this.crown[2]) / this.crownR;
    const inside = Math.max(0, Math.min(1, d));
    const up = Math.max(0, Math.min(1, (p[1] - this.crown[1]) / this.crownR * 0.5 + 0.5));
    return 0.38 + 0.62 * Math.min(1, inside * 0.75 + up * 0.45);
  }

  vertex(p: V3, n: V3, c: V3, u: number, v: number, part: number, ao: number, trunk: number, phase: number, flutter: number): number {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]);
    this.card.push(u, v, part, ao); this.wind.push(trunk, phase, flutter);
    return this.pos.length / 3 - 1;
  }

  /** A tapering tube along a path. Returns nothing; rings share vertices so the limb is smooth. */
  limb(path: V3[], radii: number[], sides: number, colour: V3, part: number, phase: number, sway: number, ribs = 0): void {
    let side = perp(norm(sub(path[1]!, path[0]!)));
    const rings: number[][] = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)]!, b = path[Math.min(path.length - 1, i + 1)]!;
      const dir = norm(sub(b, a));
      side = norm(sub(side, mul(dir, dot(side, dir))));
      const other = cross(dir, side);
      const ring: number[] = [];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const n = add(mul(side, Math.cos(ang)), mul(other, Math.sin(ang)));
        const rr = radii[i]! * (ribs ? 0.82 + 0.18 * Math.cos(ang * ribs) : 1);
        const p = add(path[i]!, mul(n, rr));
        const along = i / (path.length - 1);
        ring.push(this.vertex(p, n, colour, k / sides, along, part, this.ao(p) * (part === PART.bark ? 0.85 : 1), Math.max(0, p[1]) ** 2, phase, sway * along));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = rings[i]![k]!, b = rings[i]![(k + 1) % sides]!, c = rings[i + 1]![k]!, d = rings[i + 1]![(k + 1) % sides]!;
        this.idx.push(a, b, c, b, d, c);
      }
    }
  }

  /** A flat card. centre, facing normal, up vector along the card, width and height. */
  quad(centre: V3, facing: V3, up: V3, w: number, h: number, part: number, phase: number, flutter: number, colour: V3 = [1, 1, 1], puff = 0.7, segments = 1, droop = 0): void {
    const right = norm(cross(up, facing));
    const rows: number[][] = [];
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      // cards can bend along their length (fronds and blades arch over)
      const bend = droop * t * t * h;
      const mid = add(add(centre, mul(up, (t - 0.5) * h)), [0, -bend, 0]);
      const row: number[] = [];
      for (let k = 0; k < 2; k++) {
        const p = add(mid, mul(right, (k - 0.5) * w));
        const out = norm(sub(p, this.crown));
        const n = norm(lerp(facing, out, puff));
        row.push(this.vertex(p, n, colour, k, t, part, this.ao(p), Math.max(0, p[1]) ** 2, phase, flutter * (0.4 + 0.6 * t)));
      }
      rows.push(row);
    }
    for (let s = 0; s < segments; s++) this.idx.push(rows[s]![0]!, rows[s]![1]!, rows[s + 1]![0]!, rows[s]![1]!, rows[s + 1]![1]!, rows[s + 1]![0]!);
  }

  /** A blade or frond that tapers to a point, as real geometry (no cut-out needed). */
  blade(base: V3, dir: V3, facing: V3, length: number, width: number, part: number, phase: number, droop: number, colour: V3 = [1, 1, 1], segments = 3): void {
    const right = norm(cross(dir, facing));
    let prev: [number, number] | null = null;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const mid = add(add(base, mul(dir, t * length)), [0, -droop * t * t * length, 0]);
      const w = width * (1 - t) * (0.6 + 0.8 * Math.min(1, t * 3));
      const n = norm(lerp(facing, [0, 1, 0], 0.5));
      if (s === segments) {
        const tip = this.vertex(mid, n, colour, 0.5, 1, part, 1, Math.max(0, mid[1]) ** 2, phase, 1);
        if (prev) this.idx.push(prev[0], prev[1], tip);
      } else {
        const a = this.vertex(add(mid, mul(right, -w / 2)), n, colour, 0, t, part, 0.55 + 0.45 * t, Math.max(0, mid[1]) ** 2, phase, t);
        const b = this.vertex(add(mid, mul(right, w / 2)), n, colour, 1, t, part, 0.55 + 0.45 * t, Math.max(0, mid[1]) ** 2, phase, t);
        if (prev) this.idx.push(prev[0], prev[1], a, prev[1], b, a);
        prev = [a, b];
      }
    }
  }

  /** A small faceted ball (glow bulbs, flower centres). */
  ball(centre: V3, radius: number, part: number, colour: V3, phase: number): void {
    const dirs: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const ids = dirs.map((d) => this.vertex(add(centre, mul(d, radius)), d, colour, 0.5, 0.5, part, 1, Math.max(0, centre[1]) ** 2, phase, 0.5));
    for (const f of [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]) this.idx.push(ids[f[0]!]!, ids[f[1]!]!, ids[f[2]!]!);
  }

  /** A surface of revolution around the y axis from a profile of (radius, height) pairs. */
  lathe(profile: [number, number][], sides: number, part: number, colour: V3, phase: number): void {
    const rings: number[][] = [];
    for (let i = 0; i < profile.length; i++) {
      const [r, y] = profile[i]!;
      const a = profile[Math.max(0, i - 1)]!, b = profile[Math.min(profile.length - 1, i + 1)]!;
      // outward normal of the profile curve
      const ty = b[1] - a[1], tr = b[0] - a[0];
      const nl = Math.hypot(ty, tr) || 1;
      const ring: number[] = [];
      for (let k = 0; k <= sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const c = Math.cos(ang), s = Math.sin(ang);
        const p: V3 = [r * c, y, r * s];
        ring.push(this.vertex(p, norm([(ty / nl) * c, -tr / nl, (ty / nl) * s]), colour, k / sides, i / (profile.length - 1), part, part === PART.cap && -tr / nl < -0.3 ? 0.45 : 1, Math.max(0, y) ** 2, phase, 0.1));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
      const a = rings[i]![k]!, b = rings[i]![k + 1]!, c = rings[i + 1]![k]!, d = rings[i + 1]![k + 1]!;
      this.idx.push(a, c, b, b, c, d);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    // one shared buffer: WebGPU allows 8 vertex buffers per draw and the instance data needs room too
    packAttributes(g, [{ name: 'color', size: 3, data: this.col }, { name: 'card', size: 4, data: this.card }, { name: 'wind', size: 3, data: this.wind }], this.pos.length / 3);
    g.setIndex(this.idx);
    return g;
  }
}

const BARK: V3 = [0.15, 0.105, 0.08];
const PALE_BARK: V3 = [0.34, 0.3, 0.25];
const DARK_BARK: V3 = [0.085, 0.065, 0.055];

interface TreeSpec {
  height: number; trunkR: number; lean: number; levels: number; children: number[]; angle: number; ratio: number; firstBranch: number;
  /** positive droops, negative reaches upward */
  gravity: number; leafPart: number; leafSize: number; leaves: number; bark: V3; flatCrown: number; twist: number;
}

function tree(b: Builder, spec: TreeSpec): void {
  const grow = (base: V3, dir: V3, length: number, radius: number, level: number, phase: number): void => {
    const segs = level === 0 ? 6 : level === 1 ? 4 : 3;
    const sides = level === 0 ? 7 : level === 1 ? 5 : 4;
    const path: V3[] = [base];
    const radii: number[] = [radius];
    let d = dir, p = base;
    const bendAxis = perp(dir);
    for (let s = 1; s <= segs; s++) {
      d = norm(add(rotateAbout(d, bendAxis, (level === 0 ? spec.lean : 0.14) * b.r(-1, 1)), [0, -spec.gravity * 0.1 * level, 0]));
      p = add(p, mul(d, length / segs));
      path.push(p);
      radii.push(radius * (1 - (s / segs) * (level === spec.levels ? 0.85 : 0.5)));
    }
    b.limb(path, radii, sides, spec.bark, PART.bark, phase, level === 0 ? 0 : 0.6 + 0.4 * level);
    if (level >= spec.levels) {
      // leaves at the end of the last twigs
      for (let k = 0; k < spec.leaves; k++) {
        const along = b.r(0.45, 1);
        const at = path[Math.min(path.length - 1, Math.round(along * segs))]!;
        const off: V3 = [b.r(-1, 1), b.r(-0.5, 1) * (1 - spec.flatCrown), b.r(-1, 1)];
        const centre = add(at, mul(norm(off), spec.leafSize * b.r(0.2, 0.7)));
        const facing = norm(lerp(norm([b.r(-1, 1), b.r(0.2, 1), b.r(-1, 1)]), [0, 1, 0], spec.flatCrown));
        b.quad(centre, facing, perp(facing), spec.leafSize * b.r(0.8, 1.25), spec.leafSize * b.r(0.8, 1.25), spec.leafPart, phase + k * 0.7, 1);
      }
      return;
    }
    const n = spec.children[level] ?? 2;
    for (let k = 0; k < n; k++) {
      const t = level === 0 ? spec.firstBranch + (1 - spec.firstBranch) * ((k + b.r(0.1, 0.9)) / n) : b.r(0.35, 1);
      const idx = Math.min(path.length - 2, Math.floor(t * segs));
      const f = t * segs - idx;
      const at = lerp(path[idx]!, path[idx + 1]!, Math.max(0, Math.min(1, f)));
      const parentDir = norm(sub(path[idx + 1]!, path[idx]!));
      const around = spec.twist * k + b.r(-0.4, 0.4) + level * 1.3;
      const out = rotateAbout(perp(parentDir), parentDir, around);
      const childDir = norm(add(mul(parentDir, Math.cos(spec.angle)), mul(out, Math.sin(spec.angle))));
      grow(at, childDir, length * spec.ratio * b.r(0.8, 1.15) * (level === 0 ? 1 - t * 0.35 : 1), radii[idx]! * 0.6, level + 1, phase + k * 1.9 + level * 3.1);
    }
  };
  grow([0, 0, 0], [0, 1, 0], spec.height, spec.trunkR, 0, 0);
}

/** Build the model for one growth form. Models stand on the origin and are about one unit tall. */
export function buildPlant(form: Form, seed = 1): BufferGeometry {
  const b = new Builder(seed * 7919 + FORMS.indexOf(form) * 104729);
  switch (form) {
    case 'broadleaf':
      b.crown = [0, 0.78, 0]; b.crownR = 0.5;
      tree(b, { height: 0.62, trunkR: 0.055, lean: 0.1, levels: 2, children: [5, 3], angle: 0.85, ratio: 0.62, firstBranch: 0.45, gravity: -0.6, leafPart: PART.leaf, leafSize: 0.24, leaves: 5, bark: BARK, flatCrown: 0.15, twist: 2.4 });
      break;
    case 'umbrella':
      b.crown = [0, 0.95, 0]; b.crownR = 0.55;
      // the crown is a shallow dome, not a single flat layer: leaf cards lying dead level showed as paper discs from
      // above and as rows of dashes from the side (and in the imposter baked from the side)
      tree(b, { height: 0.7, trunkR: 0.045, lean: 0.16, levels: 2, children: [4, 3], angle: 1.1, ratio: 0.7, firstBranch: 0.72, gravity: 0.5, leafPart: PART.leaf, leafSize: 0.22, leaves: 7, bark: DARK_BARK, flatCrown: 0.6, twist: 1.6 });
      break;
    case 'conifer': {
      b.crown = [0, 0.6, 0]; b.crownR = 0.6;
      const trunk: V3[] = [], radii: number[] = [];
      for (let i = 0; i <= 6; i++) { trunk.push([b.r(-0.01, 0.01), (i / 6) * 1.06, b.r(-0.01, 0.01)]); radii.push(0.042 * (1 - (i / 6) * 0.93)); }
      b.limb(trunk, radii, 6, BARK, PART.bark, 0, 0);
      // the leading shoot: two crossed cards that close the top of the crown over the tip of the trunk
      b.quad([0, 1.07, 0], [1, 0, 0], [0, 1, 0], 0.11, 0.3, PART.needle, 9.1, 0.85, [1, 1, 1], 0.5, 2, 0.1);
      b.quad([0, 1.07, 0], [0, 0, 1], [0, 1, 0], 0.11, 0.3, PART.needle, 9.6, 0.85, [1, 1, 1], 0.5, 2, 0.1);
      const whorls = 10;
      for (let w = 0; w < whorls; w++) {
        const t = 0.14 + (w / (whorls - 1)) * 0.8;
        const y = t * 1.15;
        const reach = 0.44 * (1 - t) + 0.07;
        const count = w < 6 ? 6 : 5;
        for (let k = 0; k < count; k++) {
          const ang = (k / count) * Math.PI * 2 + w * 0.9;
          const out: V3 = [Math.cos(ang), -0.25, Math.sin(ang)];
          const centre: V3 = [out[0] * reach * 0.55, y - reach * 0.12, out[2] * reach * 0.55];
          // two crossed needle cards along each drooping bough
          b.quad(centre, [0, 1, 0], norm(out), reach * 0.5, reach * 1.1, PART.needle, w + k * 1.3, 0.7, [1, 1, 1], 0.5, 2, 0.25);
          b.quad(centre, norm(cross(norm(out), [0, 1, 0])), norm(out), reach * 0.34, reach * 1.1, PART.needle, w + k * 1.3 + 0.5, 0.7, [1, 1, 1], 0.5, 2, 0.25);
        }
      }
      break;
    }
    case 'palm': {
      b.crown = [0.12, 1.0, 0]; b.crownR = 0.5;
      const trunk: V3[] = [], radii: number[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; trunk.push([0.16 * t * t, t * 0.95, 0.03 * Math.sin(t * 3)]); radii.push(0.04 * (1 - t * 0.35) * (1 + 0.12 * Math.sin(t * 40))); }
      b.limb(trunk, radii, 7, PALE_BARK, PART.bark, 0, 0);
      const top = trunk[trunk.length - 1]!;
      for (let k = 0; k < 11; k++) {
        const ang = (k / 11) * Math.PI * 2 + b.r(-0.2, 0.2);
        const rise = b.r(0.15, 0.75);
        const dir = norm([Math.cos(ang), rise, Math.sin(ang)]);
        const facing = norm(cross(dir, cross([0, 1, 0], dir)));
        b.quad(add(top, mul(dir, 0.28)), facing, dir, 0.2, 0.6, PART.frond, k * 1.7, 1, [1, 1, 1], 0.35, 4, 0.55 + (1 - rise) * 0.5);
      }
      b.ball(add(top, [0, -0.02, 0]), 0.06, PART.flesh, [1, 1, 1], 0);
      break;
    }
    case 'bottle': {
      b.crown = [0, 0.95, 0]; b.crownR = 0.42;
      const trunk: V3[] = [], radii: number[] = [];
      const profile = [0.13, 0.19, 0.22, 0.2, 0.15, 0.1, 0.07];
      for (let i = 0; i < profile.length; i++) { trunk.push([0, (i / (profile.length - 1)) * 0.72, 0]); radii.push(profile[i]!); }
      b.limb(trunk, radii, 9, PALE_BARK, PART.bark, 0, 0);
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 + b.r(-0.3, 0.3);
        const dir = norm([Math.cos(ang) * 0.8, 0.7, Math.sin(ang) * 0.8]);
        const base: V3 = [0, 0.7, 0];
        const tip = add(base, mul(dir, b.r(0.2, 0.32)));
        b.limb([base, lerp(base, tip, 0.5), tip], [0.045, 0.03, 0.012], 5, PALE_BARK, PART.bark, k * 2.1, 0.8);
        for (let j = 0; j < 4; j++) {
          const facing = norm([b.r(-1, 1), b.r(0.3, 1), b.r(-1, 1)]);
          b.quad(add(tip, mul(norm([b.r(-1, 1), b.r(-0.2, 1), b.r(-1, 1)]), 0.06)), facing, perp(facing), 0.2, 0.2, PART.leaf, k + j, 1);
        }
      }
      break;
    }
    case 'fan': {
      // an alien, coral-like plant: forking branches in one plane, tipped with glowing bulbs
      b.crown = [0, 0.6, 0]; b.crownR = 0.6;
      const fork = (base: V3, dir: V3, length: number, radius: number, level: number, phase: number): void => {
        const tip = add(base, mul(dir, length));
        b.limb([base, lerp(base, tip, 0.5), tip], [radius, radius * 0.8, radius * 0.6], level < 2 ? 6 : 4, [1, 1, 1], PART.flesh, phase, 0.3 * level);
        if (level >= 5) { b.ball(add(tip, mul(dir, radius * 1.5)), Math.max(0.014, radius * 2.2), PART.bulb, [1, 1, 1], phase); return; }
        const spread = 0.42 - level * 0.025;
        for (const sgn of [-1, 1]) {
          const d = norm(rotateAbout(dir, [0, 0, 1], sgn * spread * b.r(0.8, 1.2)));
          fork(tip, norm([d[0], d[1] + 0.12, d[2] + b.r(-0.08, 0.08)]), length * 0.74, radius * 0.68, level + 1, phase + sgn * (level + 1) * 1.3);
        }
      };
      fork([0, 0, 0], [0, 1, 0], 0.3, 0.05, 0, 0);
      break;
    }
    case 'mushroom': {
      b.crown = [0, 0.9, 0]; b.crownR = 0.6;
      b.lathe([[0.1, 0], [0.075, 0.2], [0.06, 0.5], [0.07, 0.74]], 9, PART.bark, [0.86, 0.82, 0.74], 0);
      // cap: gills underneath, a dome above
      b.lathe([[0.07, 0.74], [0.3, 0.7], [0.52, 0.66], [0.56, 0.7], [0.5, 0.82], [0.36, 0.94], [0.18, 1.02], [0.0, 1.05]], 14, PART.cap, [1, 1, 1], 0.5);
      break;
    }
    case 'column': {
      b.crown = [0, 0.6, 0]; b.crownR = 0.7;
      const col = (base: V3, h: number, r: number, phase: number) => {
        const path: V3[] = [], radii: number[] = [];
        for (let i = 0; i <= 5; i++) { const t = i / 5; path.push(add(base, [0, t * h, 0])); radii.push(r * (i === 5 ? 0.55 : 0.92 + 0.08 * Math.sin(t * 3.1))); }
        b.limb(path, radii, 10, [1, 1, 1], PART.flesh, phase, 0.05, 5);
        b.ball(add(base, [0, h, 0]), r * 0.6, PART.flesh, [1, 1, 1], phase);
      };
      col([0, 0, 0], 1.0, 0.12, 0);
      for (const [ang, y, h] of [[0.4, 0.38, 0.42], [3.3, 0.5, 0.3]] as [number, number, number][]) {
        const out: V3 = [Math.cos(ang) * 0.24, y, Math.sin(ang) * 0.24];
        b.limb([[Math.cos(ang) * 0.08, y - 0.05, Math.sin(ang) * 0.08], [out[0] * 0.8, y - 0.03, out[2] * 0.8], out], [0.07, 0.075, 0.08], 8, [1, 1, 1], PART.flesh, ang, 0.05, 4);
        col(out, h, 0.08, ang);
      }
      break;
    }
    case 'shrub': {
      b.crown = [0, 0.3, 0]; b.crownR = 0.42;
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 + b.r(-0.3, 0.3);
        const dir = norm([Math.cos(ang) * 0.75, 1, Math.sin(ang) * 0.75]);
        const len = b.r(0.3, 0.48);
        const tip = mul(dir, len);
        b.limb([[0, 0, 0], mul(dir, len * 0.5), tip], [0.022, 0.016, 0.008], 4, BARK, PART.bark, k * 1.7, 0.8);
        for (let j = 0; j < 5; j++) {
          const facing = norm([b.r(-1, 1), b.r(0.1, 1), b.r(-1, 1)]);
          const at = add(mul(dir, len * b.r(0.45, 1.05)), mul(norm([b.r(-1, 1), b.r(-0.3, 0.8), b.r(-1, 1)]), 0.07));
          b.quad(at, facing, perp(facing), 0.2, 0.2, PART.leaf, k + j * 0.6, 1);
        }
      }
      break;
    }
    case 'fern': {
      b.crown = [0, 0.1, 0]; b.crownR = 0.5;
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2 + b.r(-0.25, 0.25);
        const rise = b.r(0.5, 1.1);
        const dir = norm([Math.cos(ang), rise, Math.sin(ang)]);
        const facing = norm(cross(dir, cross([0, 1, 0], dir)));
        const len = b.r(0.42, 0.62);
        b.quad(mul(dir, len * 0.5), facing, dir, len * 0.36, len, PART.frond, k * 1.3, 1, [1, 1, 1], 0.3, 4, 0.5);
      }
      break;
    }
    case 'tuft': {
      b.crown = [0, 0.2, 0]; b.crownR = 0.4;
      for (let k = 0; k < 9; k++) {
        const ang = b.r(0, Math.PI * 2);
        const lean = b.r(0.1, 0.55);
        const dir = norm([Math.cos(ang) * lean, 1, Math.sin(ang) * lean]);
        const facing = norm([Math.cos(ang + 1.57), 0.1, Math.sin(ang + 1.57)]);
        b.blade([Math.cos(ang) * 0.05, 0, Math.sin(ang) * 0.05], dir, facing, b.r(0.3, 0.6), 0.05, PART.blade, k * 0.9, b.r(0.1, 0.5));
      }
      break;
    }
    case 'flower': {
      b.crown = [0, 0.75, 0]; b.crownR = 0.4;
      b.limb([[0, 0, 0], [0.02, 0.35, 0.01], [0.0, 0.7, 0]], [0.012, 0.01, 0.008], 4, [1, 1, 1], PART.flesh, 0, 1);
      for (let k = 0; k < 3; k++) {
        const ang = k * 2.1;
        const dir = norm([Math.cos(ang), 0.5, Math.sin(ang)]);
        b.blade([0, 0.05 + k * 0.08, 0], dir, norm(cross(dir, [0, 1, 0])), 0.3, 0.07, PART.blade, k, 0.4);
      }
      const head: V3 = [0, 0.72, 0];
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2;
        const dir = norm([Math.cos(ang), 0.35, Math.sin(ang)]);
        const facing = norm(cross(dir, cross([0, 1, 0], dir)));
        b.quad(add(head, mul(dir, 0.1)), facing, dir, 0.11, 0.2, PART.petal, k * 0.5, 0.6, [1, 1, 1], 0.2);
      }
      b.ball(head, 0.04, PART.bulb, [1, 1, 1], 0);
      break;
    }
  }
  return b.build();
}

export interface PlantInstanceData { iDir: InterleavedBufferAttribute; iQuat: InterleavedBufferAttribute; iData: InterleavedBufferAttribute; iTint: InterleavedBufferAttribute; iTint2: InterleavedBufferAttribute }

/** Per-plant data for the real models (where it stands, how it is turned, size and wind, two tints), all in one shared buffer. */
export function addPlantInstanceData(g: BufferGeometry, cap: number): PlantInstanceData {
  return packAttributes(g, [
    { name: 'iDir', size: 3 }, { name: 'iQuat', size: 4 }, { name: 'iData', size: 4 }, { name: 'iTint', size: 3 }, { name: 'iTint2', size: 3 },
  ], cap, { instanced: true, dynamic: true }) as unknown as PlantInstanceData;
}
