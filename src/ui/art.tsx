// Paintings (system E26), drawn on the page. A painting arrives as what it shows and how; `compose` (in
// sim/history/art.ts) turns that into a list of things at places, and this file draws the list in one of five
// manners: ochre on rock, flat figures in a border, a scene with depth, dabs of colour, pure shapes.
// The figures are the painters' own kind, built from their species' body. Nothing here is stored.
import type { JSX } from 'preact';
import type { PaintingInfo } from '../shared/protocol';
import { compose, type Actor, type Subject } from '../sim/history/art';
import { hash32 } from '../sim/history/hash';

const W = 160, H = 110;
const f = (v: number): string => v.toFixed(1);

type Tone = 'main' | 'dark' | 'light';
/** One piece of a thing, in its own frame: its foot at the origin, one unit tall (a person), y downward. */
interface Part { d: string; line?: number; tone: Tone }

const ell = (cx: number, cy: number, rx: number, ry: number): string => `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;

/** One of the painters' kind (or a herd animal), from the side. */
function creature(b: PaintingInfo['body'], beast: boolean): Part[] {
  const body = beast ? { legs: 2, neck: 0.25, horn: 0.9, wings: 0, tail: 0.5 } : b;
  const p: Part[] = [];
  const by = -0.52, hx = 0.34 + 0.1 * (1 - body.neck), hy = by - 0.14 - 0.36 * body.neck;
  const pairs = Math.max(1, Math.min(3, Math.round(body.legs)));
  for (let i = 0; i < pairs; i++) { const x = pairs === 1 ? 0 : -0.22 + (0.44 * i) / (pairs - 1); p.push({ d: `M${f(x)} ${f(by + 0.1)}L${f(x - 0.03)} 0`, line: 0.07, tone: 'main' }); }
  if (body.tail > 0.3) p.push({ d: `M-0.3 ${f(by)}L${f(-0.36 - 0.24 * body.tail)} ${f(by + 0.16 * body.tail)}`, line: 0.06, tone: 'main' });
  if (body.wings > 0.4) p.push({ d: `M-0.1 ${f(by - 0.1)}L-0.34 ${f(by - 0.52)}L0.14 ${f(by - 0.12)}Z`, tone: 'light' });
  p.push({ d: ell(0, by, 0.32, 0.18), tone: 'main' });
  p.push({ d: `M0.24 ${f(by - 0.08)}L${f(hx)} ${f(hy)}`, line: 0.09, tone: 'main' });
  p.push({ d: ell(hx + 0.06, hy - 0.02, 0.1, 0.09), tone: 'main' });
  if (body.horn > 0.4) p.push({ d: `M${f(hx + 0.05)} ${f(hy - 0.09)}L${f(hx - 0.03)} ${f(hy - 0.14 - 0.3 * body.horn)}`, line: 0.045, tone: 'dark' });
  return p;
}

/** A great work, by its kind: enough of a shape to tell which it is. */
function wonder(kind: string): Part[] {
  if (kind === 'tomb') return [{ d: 'M-1.1 0L0 -1.5L1.1 0Z', tone: 'main' }, { d: 'M0 -1.5L0.3 0L1.1 0Z', tone: 'dark' }];
  if (kind === 'great-bell') return [{ d: 'M-0.8 0L-0.8 -1.7L-0.6 -1.7L-0.6 0ZM0.6 0L0.6 -1.7L0.8 -1.7L0.8 0ZM-0.9 -1.9L0.9 -1.9L0.9 -1.7L-0.9 -1.7Z', tone: 'dark' }, { d: 'M-0.22 -1.7L0.22 -1.7L0.34 -0.7L0.5 -0.4L-0.5 -0.4L-0.34 -0.7Z', tone: 'main' }];
  if (kind === 'observatory' || kind === 'peace-hall') return [{ d: 'M-0.9 0L-0.9 -0.6L0.9 -0.6L0.9 0Z', tone: 'dark' }, { d: 'M-0.9 -0.6A0.9 0.9 0 0 1 0.9 -0.6Z', tone: 'main' }, { d: 'M0 -1.5L0.12 -0.6L-0.12 -0.6Z', tone: 'dark' }];
  if (kind === 'sungate') return [{ d: 'M-0.7 0L-0.7 -1.4L-0.4 -1.4L-0.4 0ZM0.4 0L0.4 -1.4L0.7 -1.4L0.7 0ZM-0.85 -1.4L0.85 -1.4L0.85 -1.7L-0.85 -1.7Z', tone: 'main' }];
  if (kind === 'crater-stair' || kind === 'fire-watch') return [{ d: 'M-1.1 0L-1.1 -0.3L-0.8 -0.3L-0.8 -0.6L-0.5 -0.6L-0.5 -0.9L0.5 -0.9L0.5 -0.6L0.8 -0.6L0.8 -0.3L1.1 -0.3L1.1 0Z', tone: 'main' }, { d: 'M-0.15 -0.9L0 -1.3L0.15 -0.9Z', tone: 'light' }];
  if (kind === 'lighthouse' || kind === 'first-tower') return [{ d: 'M-0.3 0L-0.2 -1.9L0.2 -1.9L0.3 0Z', tone: 'main' }, { d: ell(0, -2.0, 0.2, 0.14), tone: 'light' }];
  return [{ d: 'M-0.25 0L-0.14 -1.8L0 -2.0L0.14 -1.8L0.25 0Z', tone: 'main' }, { d: 'M-0.5 0L0.5 0L0.5 -0.14L-0.5 -0.14Z', tone: 'dark' }];
}

function parts(a: Actor, p: PaintingInfo): Part[] {
  switch (a.kind) {
    case 'person': return creature(p.body, false);
    case 'beast': return creature(p.body, true);
    case 'boat': return [{ d: 'M-0.9 -0.2L0.9 -0.2L0.6 0.06L-0.6 0.06Z', tone: 'dark' }, { d: 'M0 -0.2L0 -1.2', line: 0.05, tone: 'dark' }, { d: 'M0.04 -1.15L0.7 -0.4L0.04 -0.4Z', tone: 'light' }];
    case 'hut': return [{ d: 'M-0.45 0L-0.45 -0.5L0.45 -0.5L0.45 0Z', tone: 'main' }, { d: 'M-0.6 -0.5L0 -1.0L0.6 -0.5Z', tone: 'dark' }];
    case 'tower': return [{ d: 'M-0.32 0L-0.32 -1.7L0.32 -1.7L0.32 0Z', tone: 'main' }, { d: 'M-0.42 -1.7L0 -2.1L0.42 -1.7Z', tone: 'dark' }];
    case 'flame': return [{ d: 'M0 -1.6Q0.5 -0.9 0.36 -0.3Q0.2 0.02 0 0Q-0.2 0.02 -0.36 -0.3Q-0.5 -0.9 0 -1.6Z', tone: 'main' }, { d: 'M0 -0.9Q0.22 -0.5 0.14 -0.2Q0 -0.06 -0.14 -0.2Q-0.22 -0.5 0 -0.9Z', tone: 'light' }];
    case 'wave': return [{ d: 'M-1 0Q-0.5 -0.5 0 0Q0.5 0.4 1 0', line: 0.1, tone: 'main' }, { d: 'M-0.8 0.26Q-0.4 -0.1 0 0.26Q0.4 0.56 0.8 0.26', line: 0.07, tone: 'light' }];
    case 'mountain': return [{ d: 'M-1.2 0L-0.2 -1.3L0.1 -1.05L0.4 -1.3L1.2 0Z', tone: 'main' }, { d: 'M0.4 -1.3L1.2 0L0.5 0Z', tone: 'dark' }];
    case 'plume': return [{ d: ell(0.1, -1.6, 0.3, 0.26), tone: 'main' }, { d: ell(0.3, -2.0, 0.42, 0.3), tone: 'main' }, { d: ell(0.62, -2.4, 0.5, 0.34), tone: 'light' }];
    case 'crack': return [{ d: 'M-1 -0.1L-0.5 0.08L-0.3 -0.14L0.1 0.1L0.4 -0.1L1 0.06', line: 0.07, tone: 'dark' }];
    case 'tree': return [{ d: 'M0 0L0 -0.8', line: 0.09, tone: 'dark' }, { d: ell(0, -1.1, 0.42, 0.5), tone: 'main' }];
    case 'field': return [{ d: 'M-1.2 0L-0.8 -0.5L1.2 -0.5L0.8 0Z', tone: 'main' }, { d: 'M-0.8 0L-0.4 -0.5M-0.3 0L0.1 -0.5M0.2 0L0.6 -0.5', line: 0.04, tone: 'dark' }];
    case 'sun': return [{ d: ell(0, 0, 0.55, 0.55), tone: 'main' }];
    case 'moon': return [{ d: 'M0.1 -0.5A0.52 0.52 0 1 0 0.1 0.5A0.4 0.4 0 1 1 0.1 -0.5Z', tone: 'main' }];
    case 'comet': return [{ d: 'M0 0L-2.4 -0.5L-2.2 0.34Z', tone: 'light' }, { d: ell(0, 0, 0.3, 0.3), tone: 'main' }];
    case 'dark-sun': return [{ d: ell(0, 0, 0.8, 0.8), tone: 'light' }, { d: ell(0, 0, 0.6, 0.6), tone: 'main' }];
    case 'star': return [{ d: 'M0 -0.9L0.2 -0.2L0.9 0L0.2 0.2L0 0.9L-0.2 0.2L-0.9 0L-0.2 -0.2Z', tone: 'main' }];
    case 'wonder': return wonder(p.detail);
    case 'standard': return [{ d: 'M0 0L0 -1.7', line: 0.05, tone: 'dark' }, { d: 'M0.03 -1.7L0.7 -1.55L0.03 -1.2Z', tone: 'main' }];
    case 'bier': return [{ d: 'M-0.7 0L-0.7 -0.2L0.7 -0.2L0.7 0Z', tone: 'dark' }, { d: 'M-0.6 -0.2Q0 -0.5 0.6 -0.2Z', tone: 'light' }];
  }
}

const SKYISH = new Set(['sun', 'moon', 'comet', 'dark-sun', 'star']);

/** The colour of a thing: its side's colour, or the colour things of its kind have. Hue 0..1, with the movement's turn and loudness. */
function hueOf(a: Actor, p: PaintingInfo): [number, number, number] {
  const sat = 22 + 58 * p.loud;
  const turn = (h: number): number => (((h + p.turn * 0.25) % 1) + 1) % 1;
  if (a.kind === 'flame') return [turn(0.07), 90, 55];
  if (a.kind === 'wave') return [turn(0.57), sat, 48];
  if (a.kind === 'mountain' || a.kind === 'plume') return [turn(0.08), 12, a.kind === 'plume' ? 38 : 44];
  if (a.kind === 'tree' || a.kind === 'field') return [turn(a.kind === 'tree' ? 0.33 : 0.14), sat, 42];
  if (a.kind === 'sun' || a.kind === 'star' || a.kind === 'comet') return [turn(0.13), 88, 68];
  if (a.kind === 'moon') return [0.16, 20, 84];
  if (a.kind === 'dark-sun') return [0.1, 80, 8];
  if (a.kind === 'hut' || a.kind === 'tower' || a.kind === 'wonder' || a.kind === 'bier' || a.kind === 'boat') return [turn(0.09), sat * 0.6, 56];
  if (a.kind === 'beast') return [turn(0.08), sat * 0.7, 36];
  return [turn(a.side === 1 ? p.hueB : p.hueA), sat + 10, 46];
}
/** How much lighter or darker a part is than its thing's own colour (the darkened sun is black with a bright ring). */
const shade = (a: Actor, tone: Tone, dark: number, light: number): number => (a.kind === 'dark-sun' ? (tone === 'light' ? 64 : 0) : tone === 'dark' ? dark : tone === 'light' ? light : 0);
const hsl = ([h, s, l]: [number, number, number], dl = 0): string => `hsl(${Math.round(h * 360)} ${Math.round(s)}% ${Math.round(Math.max(4, Math.min(96, l + dl)))}%)`;

/** A painting. `width` is its width on the page; its height follows (160 by 110). */
export function Picture({ p, width = 220 }: { p: PaintingInfo; width?: number }) {
  const actors = compose({ subject: p.subject as Subject, seed: p.seed, night: p.night, detail: p.detail });
  const r = (k: number): number => (hash32(p.seed, k, 0xb17) % 10000) / 10000;
  const id = `pt${p.id}`;
  const els: JSX.Element[] = [];
  const style = p.style;
  // where a thing stands and how large, in each manner
  const place = (a: Actor): { x: number; y: number; s: number } => {
    const sky = SKYISH.has(a.kind);
    if (style === 0) return sky ? { x: 14 + a.x * 132, y: 16 + r(a.x * 97) * 8, s: 9 * a.size } : { x: 12 + a.x * 136, y: 34 + a.depth * 62, s: 12 * a.size };
    if (style === 1) return sky ? { x: 18 + a.x * 124, y: 22, s: 9 * a.size } : { x: 14 + a.x * 132, y: 78 + (a.depth - 0.5) * 16, s: 13 * a.size };
    return sky ? { x: 10 + a.x * 140, y: 18 + r(7) * 10, s: 9 * a.size } : { x: 8 + a.x * 144, y: 50 + a.depth * 52, s: (5 + 13 * a.depth) * a.size };
  };
  const draw = (a: Actor, key: string, colour: (tone: Tone) => string, outline?: string): void => {
    const at = place(a);
    els.push(
      <g key={key} transform={`translate(${f(at.x)} ${f(at.y)}) scale(${f(at.s * (a.flip ? -1 : 1))} ${f(at.s)})`}>
        {parts(a, p).map((part, i) => part.line
          ? <path key={i} d={part.d} fill="none" stroke={colour(part.tone)} stroke-width={part.line} stroke-linecap="round" />
          : <path key={i} d={part.d} fill={colour(part.tone)} stroke={outline} stroke-width={outline ? 0.05 : undefined} stroke-linejoin="round" />)}
      </g>,
    );
  };
  const ordered = [...actors].sort((a, b) => (SKYISH.has(a.kind) ? -1 : a.depth) - (SKYISH.has(b.kind) ? -1 : b.depth));
  const skyHue: [number, number, number] = p.night ? [0.63, 40, 16] : p.subject === 'ash' ? [0.07, 14, 46] : p.subject === 'sky' && p.detail === 'eclipse' ? [0.66, 30, 24] : [(0.55 + p.turn * 0.1 + 1) % 1, 30 + 30 * p.loud, 72];
  const groundHue: [number, number, number] = p.subject === 'flood' || p.subject === 'voyage' ? [0.56, 36, 40] : [(0.22 + p.turn * 0.2 + 1) % 1, 22 + 30 * p.loud, p.night ? 22 : 46];

  if (style === 0) {
    // ---- ochre on rock: red earth and soot on a wall, no ground and no sky
    els.push(<rect key="rock" width={W} height={H} fill="#8d7558" />);
    for (let i = 0; i < 26; i++) els.push(<ellipse key={`b${i}`} cx={f(r(i) * W)} cy={f(r(i + 50) * H)} rx={f(8 + r(i + 100) * 22)} ry={f(5 + r(i + 150) * 12)} fill={i % 2 ? '#7d6649' : '#9c8466'} opacity={0.35} />);
    ordered.forEach((a, i) => draw(a, `a${i}`, (tone) => (a.side === 1 || a.kind === 'beast' || tone === 'dark' ? '#2a1d16' : tone === 'light' ? '#d9c7a4' : '#8f3413')));
    for (let i = 0; i < 40; i++) els.push(<circle key={`s${i}`} cx={f(r(i + 300) * W)} cy={f(r(i + 400) * H)} r={0.5} fill="#5d4a36" opacity={0.5} />);
  } else if (style === 1) {
    // ---- flat and bordered: every figure in its own flat colour, outlined, on one ground line, inside a painted border
    els.push(<rect key="sky" width={W} height={H} fill={hsl([skyHue[0], skyHue[1] * 0.8, p.night ? 22 : 82])} />);
    els.push(<rect key="ground" y={82} width={W} height={H - 82} fill={hsl(groundHue, 6)} />);
    els.push(<path key="line" d={`M0 82L${W} 82`} stroke="#2a1d16" stroke-width={0.8} />);
    ordered.forEach((a, i) => draw(a, `a${i}`, (tone) => hsl(hueOf(a, p), shade(a, tone, -16, 22)), '#2a1d16'));
    const edge = hsl([p.hueA, 30 + 40 * p.loud, 34]);
    els.push(<rect key="frame" x={3} y={3} width={W - 6} height={H - 6} fill="none" stroke={edge} stroke-width={6} />);
    for (let i = 0; i < 26; i++) els.push(<path key={`t${i}`} d={`M${f(6 + i * 5.8)} 6L${f(8.9 + i * 5.8)} 0.6L${f(11.8 + i * 5.8)} 6ZM${f(6 + i * 5.8)} ${H - 6}L${f(8.9 + i * 5.8)} ${f(H - 0.6)}L${f(11.8 + i * 5.8)} ${H - 6}Z`} fill={hsl([p.hueB, 50, 70])} />);
  } else if (style === 2 || style === 3) {
    // ---- in depth: a sky, a horizon, far things small and near things large, each with its shadow
    els.push(<defs key="defs"><linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={hsl(skyHue, -14)} /><stop offset="1" stop-color={hsl(skyHue, 14)} /></linearGradient><linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={hsl(groundHue, 10)} /><stop offset="1" stop-color={hsl(groundHue, -12)} /></linearGradient></defs>);
    els.push(<rect key="sky" width={W} height={52} fill={`url(#${id}s)`} />);
    els.push(<path key="hills" d={`M0 52L0 ${f(44 + r(1) * 5)}Q40 ${f(34 + r(2) * 8)} 80 ${f(45 + r(3) * 4)}Q120 ${f(36 + r(4) * 8)} 160 ${f(44 + r(5) * 5)}L160 52Z`} fill={hsl([groundHue[0], groundHue[1] * 0.5, groundHue[2] + 12])} />);
    els.push(<rect key="ground" y={51} width={W} height={H - 51} fill={`url(#${id}g)`} />);
    if (style === 2) {
      ordered.forEach((a, i) => {
        const at = place(a);
        if (!SKYISH.has(a.kind) && a.kind !== 'wave' && a.kind !== 'crack' && a.kind !== 'field') els.push(<ellipse key={`sh${i}`} cx={f(at.x + at.s * 0.3)} cy={f(at.y + 0.6)} rx={f(at.s * 0.6)} ry={f(at.s * 0.1)} fill="#000" opacity={0.22} />);
        draw(a, `a${i}`, (tone) => hsl(hueOf(a, p), shade(a, tone, -14, 20) - (SKYISH.has(a.kind) ? 0 : (1 - a.depth) * 6)));
      });
    } else {
      // ---- in dabs of colour: the same scene, but only the light on it, in short strokes that join at a distance
      const dab = (key: string, x: number, y: number, c: [number, number, number], len: number, k: number): void => {
        const ang = (r(k) - 0.5) * 1.2, dx = Math.cos(ang) * len, dy = Math.sin(ang) * len * 0.5;
        els.push(<path key={key} d={`M${f(x - dx)} ${f(y - dy)}L${f(x + dx)} ${f(y + dy)}`} stroke={hsl([((c[0] + (r(k + 1) - 0.5) * 0.06) % 1 + 1) % 1, c[1] + 14, c[2] + (r(k + 2) - 0.5) * 22])} stroke-width={f(2 + r(k + 3) * 1.6)} stroke-linecap="round" opacity={0.86} />);
      };
      for (let i = 0; i < 230; i++) { const x = r(i * 3 + 1000) * W, y = r(i * 3 + 1001) * H; dab(`d${i}`, x, y, y < 51 ? skyHue : groundHue, 2.6, i * 5 + 2000); }
      ordered.forEach((a, i) => {
        const at = place(a), c = hueOf(a, p), sky = SKYISH.has(a.kind);
        const tall = a.kind === 'tower' || a.kind === 'wonder' || a.kind === 'plume' ? 2 : a.kind === 'mountain' || a.kind === 'flame' || a.kind === 'tree' ? 1.4 : a.kind === 'wave' || a.kind === 'field' || a.kind === 'crack' ? 0.3 : 1;
        const wide = a.kind === 'mountain' || a.kind === 'field' || a.kind === 'wave' || a.kind === 'boat' || a.kind === 'wonder' ? 1.0 : 0.42;
        const n = Math.round(6 + at.s * tall * wide * 1.6);
        for (let k = 0; k < n; k++) {
          const u = r(i * 131 + k * 7 + 5000), v = r(i * 131 + k * 7 + 5001);
          dab(`a${i}-${k}`, at.x + (u - 0.5) * 2 * wide * at.s * (1 - (sky ? 0 : v * 0.5)), sky ? at.y + (v - 0.5) * at.s : at.y - v * tall * at.s, c, 1.6 + at.s * 0.08, i * 977 + k * 13 + 7000);
        }
      });
    }
  } else {
    // ---- in pure shapes: nothing in it is a thing; the places and the colours are the ones the scene had
    els.push(<rect key="bg" width={W} height={H} fill={hsl([skyHue[0], 18, p.night ? 14 : 88])} />);
    els.push(<rect key="f1" x={f(r(1) * 40)} y={f(52 + r(2) * 10)} width={f(90 + r(3) * 60)} height={f(40 + r(4) * 20)} fill={hsl([groundHue[0], 60, 50])} opacity={0.85} />);
    els.push(<circle key="f2" cx={f(30 + r(5) * 100)} cy={f(20 + r(6) * 20)} r={f(16 + r(7) * 10)} fill={hsl([(p.hueB + p.turn * 0.25 + 1) % 1, 70, 56])} opacity={0.8} />);
    ordered.forEach((a, i) => {
      const at = place(a), c = hsl([hueOf(a, p)[0], 78, a.kind === 'flame' || a.kind === 'sun' ? 56 : 44]);
      const s = at.s;
      if (SKYISH.has(a.kind)) els.push(<circle key={`a${i}`} cx={f(at.x)} cy={f(at.y)} r={f(s * 0.7)} fill={a.kind === 'dark-sun' ? '#111' : c} stroke="#111" stroke-width={1.2} />);
      else if (a.kind === 'person') els.push(<path key={`a${i}`} d={`M${f(at.x - s * 0.34)} ${f(at.y)}L${f(at.x)} ${f(at.y - s)}L${f(at.x + s * 0.34)} ${f(at.y)}Z`} fill={c} />);
      else if (a.kind === 'beast' || a.kind === 'hut' || a.kind === 'bier' || a.kind === 'field' || a.kind === 'boat') els.push(<rect key={`a${i}`} x={f(at.x - s * 0.5)} y={f(at.y - s * 0.6)} width={f(s)} height={f(s * 0.6)} fill={c} transform={`rotate(${f((r(i + 60) - 0.5) * 24)} ${f(at.x)} ${f(at.y)})`} />);
      else if (a.kind === 'tower' || a.kind === 'wonder' || a.kind === 'standard' || a.kind === 'tree') els.push(<rect key={`a${i}`} x={f(at.x - s * 0.2)} y={f(at.y - s * 1.9)} width={f(s * 0.4)} height={f(s * 1.9)} fill={c} />);
      else if (a.kind === 'mountain' || a.kind === 'plume') els.push(<path key={`a${i}`} d={`M${f(at.x - s * 1.2)} ${f(at.y)}L${f(at.x)} ${f(at.y - s * 1.6)}L${f(at.x + s * 1.2)} ${f(at.y)}Z`} fill={a.kind === 'plume' ? '#111' : c} opacity={a.kind === 'plume' ? 0.5 : 1} />);
      else els.push(<path key={`a${i}`} d={`M${f(at.x - s)} ${f(at.y)}L${f(at.x - s * 0.5)} ${f(at.y - s * 0.7)}L${f(at.x)} ${f(at.y)}L${f(at.x + s * 0.5)} ${f(at.y - s * 0.7)}L${f(at.x + s)} ${f(at.y)}`} fill="none" stroke={c} stroke-width={2.2} stroke-linejoin="miter" />);
    });
    for (let i = 0; i < 3; i++) els.push(<path key={`l${i}`} d={`M${f(r(i + 20) * W)} 0L${f(r(i + 30) * W)} ${H}`} stroke="#111" stroke-width={0.9} opacity={0.7} />);
  }
  return (
    <svg width={width} height={Math.round((width * H) / W)} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', borderRadius: '2px', boxShadow: '0 0 0 3px #3a2f24, 0 0 0 4px #1b1612' }}>
      <title>{p.title}</title>
      {els}
    </svg>
  );
}
