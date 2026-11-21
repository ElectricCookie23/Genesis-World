// Writing systems (system E23).
// A script begins as pictures: a wavy line for water, a ring with rays for the sun, the outline of
// the writers' own kind for "people". Written a million times by people in a hurry, each picture loses
// its small strokes, its curves are cut to a few straight lines, and its corners settle on a grid: it
// becomes a sign that no longer looks like anything, but is still the same sign.
//
// Nothing is stored but the script itself (who began it, when, from which older script). A glyph is
// a pure function of the meaning, the writers' bodies, the script and how worn it is, so the early
// and the late form of a word can always be drawn side by side.
import { hash32, hashText } from './hash';

/** A stroke: points x0, y0, x1, y1, ... in a unit box, y downward. */
export type Stroke = number[];
export type Glyph = Stroke[];

/** What the writers' own kind looks like, as far as a picture of one needs: each 0..1 unless said. */
export interface Body {
  /** Pairs of legs drawn: 1, 2 or 3. */
  legs: number;
  neck: number;
  /** Horn or crest on the head; wings; length of tail. */
  horn: number;
  wings: number;
  tail: number;
}

/** A script as the history keeps it. */
export interface Script {
  id: number;
  /** The script it was learned from, or -1 if its people began it themselves. */
  parent: number;
  /** The nation that began it (or first took it up), and the year. */
  nation: number;
  born: number;
  /** How worn the parent script was when this one was taken from it (0 for a script begun from pictures). */
  from: number;
  /** The event that records it, or -1. */
  eventId: number;
  /** Cut or pressed (straight strokes) or drawn with a brush or pen (curved): 0 cut, 1 drawn. */
  hand: number;
  name: string;
}

const TAU = Math.PI * 2;
const line = (x0: number, y0: number, x1: number, y1: number): Stroke => [x0, y0, x1, y1];
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 10, ry = r): Stroke => {
  const s: Stroke = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; s.push(cx + Math.cos(a) * r, cy + Math.sin(a) * ry); }
  return s;
};
const wave = (x0: number, x1: number, y: number, amp: number, cycles: number): Stroke => {
  const s: Stroke = [], n = Math.round(cycles * 8);
  for (let i = 0; i <= n; i++) { const u = i / n; s.push(x0 + (x1 - x0) * u, y + Math.sin(u * cycles * TAU) * amp); }
  return s;
};
const poly = (...p: number[]): Stroke => p;

/** One of the writers' own kind, seen from the side, at a place and size: a body, a neck and head, legs, and what else it has. */
function creature(b: Body, cx: number, cy: number, s: number): Glyph {
  const g: Glyph = [];
  g.push(arc(cx, cy, 0.3 * s, 0, TAU, 12, 0.16 * s));
  const hx = cx + 0.3 * s + 0.1 * s * (1 - b.neck), hy = cy - (0.12 + 0.34 * b.neck) * s;
  g.push(poly(cx + 0.24 * s, cy - 0.08 * s, hx, hy));
  g.push(arc(hx + 0.07 * s, hy - 0.02 * s, 0.09 * s, 0, TAU, 8));
  const pairs = Math.max(1, Math.min(3, Math.round(b.legs)));
  for (let i = 0; i < pairs; i++) {
    const x = cx + (pairs === 1 ? 0 : -0.2 * s + (0.4 * s * i) / (pairs - 1));
    g.push(line(x, cy + 0.14 * s, x - 0.03 * s, cy + 0.42 * s));
  }
  if (b.horn > 0.4) g.push(poly(hx + 0.05 * s, hy - 0.1 * s, hx - 0.02 * s, hy - 0.3 * s * b.horn - 0.1 * s));
  if (b.wings > 0.4) g.push(poly(cx - 0.12 * s, cy - 0.14 * s, cx - 0.3 * s, cy - 0.5 * s, cx + 0.1 * s, cy - 0.15 * s));
  if (b.tail > 0.3) g.push(poly(cx - 0.3 * s, cy, cx - (0.34 + 0.2 * b.tail) * s, cy + 0.12 * s * b.tail));
  return g;
}

/**
 * The picture a script begins with for each meaning: what its first writers scratched on a pot or a wall.
 * Pictures of living things are pictures of the writers' own kind and of what they keep.
 */
export function picture(meaning: string, body: Body): Glyph {
  switch (meaning) {
    case 'water': return [wave(0.1, 0.9, 0.36, 0.07, 2.5), wave(0.1, 0.9, 0.52, 0.07, 2.5), wave(0.1, 0.9, 0.68, 0.07, 2.5)];
    case 'river': return [poly(0.34, 0.08, 0.44, 0.3, 0.3, 0.52, 0.42, 0.74, 0.32, 0.94), poly(0.62, 0.08, 0.72, 0.3, 0.58, 0.52, 0.7, 0.74, 0.6, 0.94), wave(0.4, 0.62, 0.5, 0.03, 1)];
    case 'sea': return [wave(0.06, 0.94, 0.4, 0.09, 2), wave(0.06, 0.94, 0.62, 0.09, 2), line(0.06, 0.84, 0.94, 0.84), arc(0.5, 0.2, 0.09, 0, TAU, 8)];
    case 'hill': return [poly(0.08, 0.84, 0.36, 0.3, 0.52, 0.6, 0.7, 0.2, 0.92, 0.84), line(0.08, 0.84, 0.92, 0.84)];
    case 'stone': return [poly(0.2, 0.72, 0.28, 0.4, 0.52, 0.26, 0.78, 0.42, 0.8, 0.72, 0.2, 0.72), poly(0.4, 0.5, 0.52, 0.42, 0.62, 0.52)];
    case 'sun': return [arc(0.5, 0.5, 0.2, 0, TAU, 14), ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = (k / 8) * TAU; return line(0.5 + Math.cos(a) * 0.28, 0.5 + Math.sin(a) * 0.28, 0.5 + Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42); })];
    case 'moon': return [arc(0.46, 0.5, 0.34, 0.9, TAU - 0.9, 14), arc(0.64, 0.5, 0.27, 1.4, TAU - 1.4, 12)];
    case 'star': return [line(0.5, 0.14, 0.5, 0.86), line(0.14, 0.5, 0.86, 0.5), line(0.25, 0.25, 0.75, 0.75), line(0.75, 0.25, 0.25, 0.75)];
    case 'fire': return [poly(0.5, 0.1, 0.34, 0.42, 0.26, 0.66, 0.4, 0.86, 0.6, 0.86, 0.74, 0.66, 0.66, 0.42, 0.5, 0.1), poly(0.5, 0.46, 0.42, 0.66, 0.5, 0.8, 0.58, 0.66, 0.5, 0.46), line(0.2, 0.9, 0.8, 0.9)];
    case 'wind': return [poly(0.1, 0.34, 0.6, 0.34, 0.72, 0.24, 0.62, 0.16), poly(0.1, 0.52, 0.76, 0.52, 0.88, 0.62, 0.78, 0.72), poly(0.1, 0.7, 0.5, 0.7, 0.58, 0.8)];
    case 'forest': return [line(0.3, 0.9, 0.3, 0.4), poly(0.14, 0.56, 0.3, 0.14, 0.46, 0.56), line(0.68, 0.9, 0.68, 0.46), poly(0.52, 0.62, 0.68, 0.22, 0.84, 0.62), line(0.1, 0.9, 0.9, 0.9)];
    case 'land': return [line(0.1, 0.5, 0.9, 0.5), line(0.2, 0.66, 0.8, 0.66), line(0.3, 0.82, 0.7, 0.82), poly(0.42, 0.5, 0.5, 0.3, 0.58, 0.5)];
    case 'people': return [...creature(body, 0.34, 0.56, 0.62), ...creature(body, 0.68, 0.5, 0.5)];
    case 'town': return [poly(0.12, 0.84, 0.12, 0.5, 0.28, 0.34, 0.44, 0.5, 0.44, 0.84), poly(0.56, 0.84, 0.56, 0.4, 0.72, 0.22, 0.88, 0.4, 0.88, 0.84), line(0.06, 0.84, 0.94, 0.84), line(0.24, 0.84, 0.24, 0.66)];
    case 'king': return [poly(0.2, 0.44, 0.2, 0.18, 0.35, 0.34, 0.5, 0.14, 0.65, 0.34, 0.8, 0.18, 0.8, 0.44, 0.2, 0.44), poly(0.26, 0.84, 0.26, 0.56, 0.74, 0.56, 0.74, 0.84), line(0.14, 0.84, 0.86, 0.84)];
    case 'herd': return [...creature({ legs: 2, neck: 0.3, horn: 0.9, wings: 0, tail: 0.5 }, 0.3, 0.38, 0.5), ...creature({ legs: 2, neck: 0.3, horn: 0.9, wings: 0, tail: 0.5 }, 0.64, 0.66, 0.5)];
    case 'child': return [...creature(body, 0.5, 0.58, 0.44), arc(0.5, 0.52, 0.36, 0.3, TAU - 0.3, 14, 0.4)];
    case 'mother': return [...creature(body, 0.42, 0.42, 0.7), ...creature(body, 0.66, 0.78, 0.3)];
    case 'hand': return [arc(0.5, 0.62, 0.2, 0, TAU, 10, 0.16), ...[0, 1, 2, 3].map((k) => arc(0.26 + k * 0.16, 0.3 + Math.abs(k - 1.5) * 0.05, 0.06, 0, TAU, 6, 0.08))];
    case 'eye': return [arc(0.5, 0.5, 0.36, Math.PI, TAU, 10, 0.24), arc(0.5, 0.5, 0.36, 0, Math.PI, 10, 0.24), arc(0.5, 0.5, 0.1, 0, TAU, 8)];
    case 'tongue': return [arc(0.5, 0.36, 0.34, 0.15, Math.PI - 0.15, 10, 0.2), poly(0.5, 0.42, 0.44, 0.66, 0.5, 0.86, 0.56, 0.66, 0.5, 0.42)];
    case 'one': return [line(0.5, 0.18, 0.5, 0.82)];
    case 'two': return [line(0.38, 0.18, 0.38, 0.82), line(0.62, 0.18, 0.62, 0.82)];
    case 'three': return [line(0.28, 0.18, 0.28, 0.82), line(0.5, 0.18, 0.5, 0.82), line(0.72, 0.18, 0.72, 0.82)];
    case 'many': return [...[[0.3, 0.3], [0.52, 0.24], [0.72, 0.34], [0.26, 0.56], [0.48, 0.5], [0.7, 0.6], [0.4, 0.76], [0.62, 0.8]].map(([x, y]) => arc(x!, y!, 0.05, 0, TAU, 5))];
    case 'old': return [poly(0.5, 0.9, 0.5, 0.5, 0.4, 0.34), poly(0.5, 0.62, 0.7, 0.46, 0.78, 0.26), poly(0.5, 0.5, 0.3, 0.44, 0.2, 0.26), line(0.3, 0.9, 0.7, 0.9)];
    case 'new': return [line(0.5, 0.9, 0.5, 0.52), arc(0.38, 0.44, 0.14, -0.4, 2.2, 8, 0.1), arc(0.62, 0.4, 0.14, 0.9, 3.6, 8, 0.1), line(0.3, 0.9, 0.7, 0.9)];
    case 'great': return [poly(0.1, 0.86, 0.5, 0.12, 0.9, 0.86, 0.1, 0.86), poly(0.36, 0.86, 0.5, 0.6, 0.64, 0.86)];
    case 'bright': return [arc(0.5, 0.7, 0.2, Math.PI, TAU, 10), line(0.14, 0.7, 0.86, 0.7), ...[0, 1, 2, 3, 4].map((k) => { const a = Math.PI + ((k + 0.5) / 5) * Math.PI; return line(0.5 + Math.cos(a) * 0.28, 0.7 + Math.sin(a) * 0.28, 0.5 + Math.cos(a) * 0.46, 0.7 + Math.sin(a) * 0.46); })];
    case 'red': return [poly(0.5, 0.14, 0.3, 0.54, 0.36, 0.76, 0.5, 0.86, 0.64, 0.76, 0.7, 0.54, 0.5, 0.14), line(0.5, 0.5, 0.5, 0.74)];
    case 'see': return [arc(0.36, 0.5, 0.26, Math.PI, TAU, 8, 0.18), arc(0.36, 0.5, 0.26, 0, Math.PI, 8, 0.18), arc(0.36, 0.5, 0.07, 0, TAU, 6), line(0.66, 0.5, 0.92, 0.5), poly(0.82, 0.4, 0.92, 0.5, 0.82, 0.6)];
    case 'give': return [arc(0.36, 0.56, 0.24, 0, Math.PI, 8, 0.22), line(0.12, 0.56, 0.6, 0.56), line(0.5, 0.4, 0.9, 0.4), poly(0.8, 0.3, 0.9, 0.4, 0.8, 0.5)];
    case 'go': return [poly(0.12, 0.76, 0.36, 0.6, 0.56, 0.66, 0.86, 0.34), poly(0.72, 0.32, 0.86, 0.34, 0.84, 0.48), arc(0.2, 0.86, 0.04, 0, TAU, 5), arc(0.4, 0.78, 0.04, 0, TAU, 5)];
    case 'eat': return [poly(0.84, 0.26, 0.3, 0.38, 0.16, 0.5, 0.3, 0.62, 0.84, 0.74), arc(0.6, 0.5, 0.07, 0, TAU, 6)];
    case 'cross': return [wave(0.1, 0.9, 0.7, 0.06, 2), wave(0.1, 0.9, 0.86, 0.06, 2), arc(0.5, 0.56, 0.36, Math.PI, TAU, 10, 0.3), line(0.14, 0.56, 0.86, 0.56)];
    case 'this': return [line(0.5, 0.14, 0.5, 0.7), poly(0.36, 0.56, 0.5, 0.72, 0.64, 0.56), arc(0.5, 0.86, 0.05, 0, TAU, 5)];
    default: {
      // a meaning without a picture of its own: a mark made of a few strokes, fixed by the meaning
      const h = hashText(meaning);
      const g: Glyph = [];
      for (let k = 0; k < 3; k++) { const r = hash32(h, k); g.push(line(0.15 + ((r % 8) / 10), 0.15 + (((r >>> 4) % 8) / 10), 0.15 + (((r >>> 8) % 8) / 10), 0.15 + (((r >>> 12) % 8) / 10))); }
      return g;
    }
  }
}

const length = (s: Stroke): number => { let d = 0; for (let i = 2; i < s.length; i += 2) d += Math.hypot(s[i]! - s[i - 2]!, s[i + 1]! - s[i - 1]!); return d; };

/** Keep only the points of a stroke that matter at this coarseness (Ramer, Douglas and Peucker). */
function thin(s: Stroke, eps: number): Stroke {
  const n = s.length / 2;
  if (n <= 2) return s.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = s[a * 2]!, ay = s[a * 2 + 1]!, bx = s[b * 2]!, by = s[b * 2 + 1]!;
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let far = -1, most = eps;
    for (let i = a + 1; i < b; i++) {
      const d = len < 1e-6 ? Math.hypot(s[i * 2]! - ax, s[i * 2 + 1]! - ay) : Math.abs((s[i * 2]! - ax) * (by - ay) - (s[i * 2 + 1]! - ay) * (bx - ax)) / len;
      if (d > most) { most = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out: Stroke = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(s[i * 2]!, s[i * 2 + 1]!);
  return out;
}

/**
 * A picture after `wear` (0 fresh from the first writers, 1 as worn as writing gets): its smallest strokes
 * dropped, its curves cut to a few straight runs, its corners pulled onto a grid that grows coarser. The same
 * rule every time, so a sign's whole life can be drawn; `seed` (the script) decides the small accidents, so
 * that two scripts that began with the same pictures end with signs that are cousins, not twins.
 */
export function wornGlyph(source: Glyph, wear: number, seed: number, key: number): Glyph {
  const t = Math.max(0, Math.min(1, wear));
  if (t <= 0.001) return source.map((s) => s.slice());
  // the smallest strokes go first; at least three stay, and never fewer than a third
  const order = source.map((s, i) => ({ i, len: length(s) })).sort((a, b) => a.len - b.len);
  // (a sign of three strokes or fewer keeps them all: a tally of three must not wear into a tally of two)
  const keep = source.length <= 3 ? source.length : Math.max(3, Math.ceil(source.length * (1 - 0.65 * t)));
  const dropped = new Set(order.slice(0, source.length - keep).map((x) => x.i));
  const step = 0.02 + 0.2 * t;
  const out: Glyph = [];
  source.forEach((s, i) => {
    if (dropped.has(i)) return;
    const thinned = thin(s, 0.015 + 0.13 * t);
    const snapped: Stroke = [];
    for (let k = 0; k < thinned.length; k += 2) {
      // (an accident of this script's hand: now and then a corner lands one place over)
      const slip = t > 0.3 && hash32(seed, key, i * 31 + k) % 100 < 14 * t ? ((hash32(seed, key, i * 57 + k + 1) % 3) - 1) * step : 0;
      const x = Math.max(0.06, Math.min(0.94, Math.round((thinned[k]! + slip - 0.5) / step) * step + 0.5));
      const y = Math.max(0.06, Math.min(0.94, Math.round((thinned[k + 1]! - 0.5) / step) * step + 0.5));
      const n = snapped.length;
      if (n >= 2 && Math.abs(snapped[n - 2]! - x) < 1e-6 && Math.abs(snapped[n - 1]! - y) < 1e-6) continue;
      snapped.push(x, y);
    }
    // a stroke worn down to a point is still struck: it stays as a short tick
    if (snapped.length === 2) snapped.push(snapped[0]!, Math.min(0.94, snapped[1]! + step * 0.6));
    out.push(snapped);
  });
  return out;
}

/** How worn a script is: fast at first, while it is still being settled, then slowly for ever; never quite finished. */
export function wearOf(script: Script, year: number): number {
  const years = Math.max(0, year - script.born);
  return Math.min(0.97, script.from + (1 - script.from) * (1 - Math.exp(-years / 1100)));
}

/** The sign for a meaning in a script in a given year. */
export function glyphOf(meaning: string, body: Body, script: Script, year: number): Glyph {
  return wornGlyph(picture(meaning, body), wearOf(script, year), hash32(script.id, 0x5c1), hashText(meaning));
}

/** Points along a glyph, evenly spaced: what two glyphs are compared by. */
export function sample(g: Glyph, n = 48): number[] {
  const total = g.reduce((a, s) => a + length(s), 0) || 1e-9;
  const out: number[] = [];
  for (const s of g) {
    const share = Math.max(1, Math.round((length(s) / total) * n));
    for (let k = 0; k < share; k++) {
      let want = (length(s) * (k + 0.5)) / share;
      for (let i = 2; i < s.length; i += 2) {
        const d = Math.hypot(s[i]! - s[i - 2]!, s[i + 1]! - s[i - 1]!);
        if (want <= d || i === s.length - 2) { const u = d > 0 ? Math.min(1, want / d) : 0; out.push(s[i - 2]! + (s[i]! - s[i - 2]!) * u, s[i - 1]! + (s[i + 1]! - s[i - 1]!) * u); break; }
        want -= d;
      }
    }
  }
  return out;
}

/** How unlike two glyphs are: the average distance from a point on one to the nearest point on the other, both ways. */
export function glyphDistance(a: Glyph, b: Glyph): number {
  const p = sample(a), q = sample(b);
  if (!p.length || !q.length) return 1;
  const one = (u: number[], v: number[]): number => {
    let sum = 0;
    for (let i = 0; i < u.length; i += 2) { let best = Infinity; for (let j = 0; j < v.length; j += 2) { const d = Math.hypot(u[i]! - v[j]!, u[i + 1]! - v[j + 1]!); if (d < best) best = d; } sum += best; }
    return sum / (u.length / 2);
  };
  return (one(p, q) + one(q, p)) / 2;
}

/** A glyph as the path of an SVG picture `size` across. Drawn hands round their corners; cut hands do not. */
export function glyphPath(g: Glyph, size: number, drawn: boolean): string {
  const f = (v: number): string => (v * size).toFixed(1);
  let d = '';
  for (const s of g) {
    if (s.length < 4) continue;
    d += `M${f(s[0]!)} ${f(s[1]!)}`;
    if (drawn && s.length >= 6) {
      for (let i = 2; i < s.length - 2; i += 2) d += `Q${f(s[i]!)} ${f(s[i + 1]!)} ${f((s[i]! + s[i + 2]!) / 2)} ${f((s[i + 1]! + s[i + 3]!) / 2)}`;
      d += `L${f(s[s.length - 2]!)} ${f(s[s.length - 1]!)}`;
    } else for (let i = 2; i < s.length; i += 2) d += `L${f(s[i]!)} ${f(s[i + 1]!)}`;
  }
  return d;
}

/** A script in a sentence: who began it, from what, and what it looks like now. */
export function describeScript(script: Script, parentName: string, year: number): string {
  const wear = wearOf(script, year);
  const stage = wear < 0.25 ? 'Its signs are still pictures: anyone can see what most of them show.'
    : wear < 0.55 ? 'Its signs are pictures worn down by use: a few strokes each, with the thing they showed still to be guessed.'
      : wear < 0.8 ? 'Its signs no longer look like anything. A child learns them by rote, and only the oldest inscriptions show what they once pictured.'
        : 'Its signs are a few strokes on a grid, written faster than speech. No one who writes it knows it began as pictures.';
  const hand = script.hand ? 'It is drawn, with a brush or a pen, and its corners are round.' : 'It is cut or pressed, and its strokes are straight.';
  return `${script.parent >= 0 ? `Learned from the writing of ${parentName} and changed in the learning.` : 'Begun from nothing, as pictures.'} ${stage} ${hand}`;
}

/** The body of a people as their pictures show it, from the genes of their species (the order of `G` in sim/genetics.ts). */
export function bodyFrom(limbPairs: number, limbType: number, neck: number, horn: number, tail: number): Body {
  return { legs: 1 + Math.round(limbPairs * 2), neck, horn, wings: limbType >= 0.75 ? 1 : 0, tail };
}
