// Portraits of the people on record (system E6). The face is drawn from the genes of the person's
// species, so every people looks like itself, and in the manner of the age the person lived in:
// ochre on rock, a painted clay roundel, a woodcut, a studio photograph, a picture on a screen.
import { G } from '../sim/genetics';

interface P { x: number; y: number; }

const f = (v: number): string => v.toFixed(1);

/** A smooth closed outline through points. */
function closed(points: P[]): string {
  const n = points.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = points[i]!, q = points[(i + 1) % n]!;
    if (i === 0) { const o = points[n - 1]!; d += `M ${f((o.x + p.x) / 2)} ${f((o.y + p.y) / 2)} `; }
    d += `Q ${f(p.x)} ${f(p.y)} ${f((p.x + q.x) / 2)} ${f((p.y + q.y) / 2)} `;
  }
  return `${d}Z`;
}

/** A small repeatable random number from a seed and a slot, in [0, 1). */
function rnd(seed: number, k: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The five manners of portrait, by age: 0 ochre on rock, 1 painted clay, 2 woodcut, 3 photograph, 4 screen. */
export function artStyle(era: number): number {
  return era <= 1 ? 0 : era <= 3 ? 1 : era <= 5 ? 2 : era <= 7 ? 3 : 4;
}

export const ART_NAMES = ['ochre on rock', 'painted clay', 'woodcut', 'photograph', 'screen picture'];

const EMBLEM: Record<string, string> = {
  ruler: 'M1 9.5 L1 3 L4 6 L6 2 L8 6 L11 3 L11 9.5 Z',
  founder: 'M3 10.5 L3 4.5 Q6 0.5 9 4.5 L9 10.5 Z',
  inventor: 'M6 3.2 A2.8 2.8 0 1 0 6.01 3.2 Z M6 0.6 V2.4 M6 9.6 V11.4 M0.6 6 H2.4 M9.6 6 H11.4 M2.2 2.2 L3.5 3.5 M8.5 8.5 L9.8 9.8 M9.8 2.2 L8.5 3.5 M3.5 8.5 L2.2 9.8',
  prophet: 'M6 0.8 Q10.4 6.2 6 11.2 Q1.6 6.2 6 0.8 Z',
  general: 'M6 0.6 L7.3 7.2 L4.7 7.2 Z M3 7.8 H9 M6 7.8 V11.4',
  explorer: 'M6 0.5 L7.3 4.7 L11.5 6 L7.3 7.3 L6 11.5 L4.7 7.3 L0.5 6 L4.7 4.7 Z',
  artist: 'M1.5 10.5 L6.8 5.2 M6.8 5.2 Q9.6 1.2 11 1 Q10.8 3.6 8.2 6.4 Z',
  scholar: 'M2 2.5 H10 V9.5 H2 Z M4 4.8 H8 M4 7.2 H8',
  consort: 'M4.3 3.2 A2.9 2.9 0 1 0 4.31 3.2 Z M7.7 3.2 A2.9 2.9 0 1 0 7.71 3.2 Z',
  claimant: 'M1 9.5 L1 3 L4 6 L5.2 3.6 M6.8 3.6 L8 6 L11 3 L11 9.5 M1 9.5 H4.6 M7.4 9.5 H11',
};

export interface PortraitProps {
  /** Genome of the person's species. */
  genes: Float32Array;
  /** The age the person rose in. */
  era: number;
  role: string;
  /** The person's id: small differences between one face and the next come from it. */
  seed: number;
  /** Temperament 0..1: a bold face has a heavier brow, a cruel one a harder mouth. */
  bold?: number;
  cruel?: number;
  width?: number;
}

export function Portrait({ genes: g, era, role, seed, bold = 0.5, cruel = 0.5, width = 76 }: PortraitProps) {
  const style = artStyle(era);
  const id = `pt${seed}s${style}`;
  const j = (k: number, amount: number) => (rnd(seed, k) - 0.5) * 2 * amount;
  const head = g[G.Head]!, diet = g[G.Diet]!, neck = g[G.Neck]!, size = g[G.Size]!;
  const hr = 13 + 8 * head + j(1, 1.2);
  const sl = hr * (0.45 + 0.9 * diet) * (1 + j(2, 0.1));
  const neckLen = 10 + 24 * neck;
  const neckW = 9 + 7 * size + 3 * (1 - neck);
  const cx = Math.min(46 + neckLen * 0.25, 90 - hr - sl);
  const cy = 52 + j(3, 1.5);
  const baseY = cy + hr * 0.7 + neckLen;       // where the neck meets the shoulders
  const at = (x: number, y: number): P => ({ x: cx + x, y: cy + y });

  const skull = closed([
    at(-hr, 0), at(-hr * 0.72, -hr * 0.8), at(0, -hr), at(hr * 0.65, -hr * (0.62 + 0.1 * bold)), at(hr + sl * 0.5, -hr * 0.2), at(hr + sl, hr * 0.12),
    at(hr + sl * 0.7, hr * 0.5), at(hr * 0.35, hr * 0.84), at(-hr * 0.5, hr * 0.76),
  ]);
  const throat = `M ${f(cx - neckW * 0.8)} ${f(cy + hr * 0.3)} Q ${f(cx - neckW * 1.25)} ${f((cy + baseY) / 2)} ${f(42 - neckW)} ${f(baseY + 4)} L ${f(42 + neckW)} ${f(baseY + 4)} Q ${f(cx + neckW * 0.5)} ${f((cy + baseY) / 2 + hr * 0.3)} ${f(cx + neckW * 0.55)} ${f(cy + hr * 0.55)} Z`;
  const shoulders = `M -2 124 L -2 ${f(baseY + 20)} Q 8 ${f(baseY + 4)} ${f(42 - neckW - 6)} ${f(baseY - 1)} Q 42 ${f(baseY - 5)} ${f(42 + neckW + 6)} ${f(baseY + 1)} Q 86 ${f(baseY + 8)} 102 ${f(baseY + 26)} L 102 124 Z`;
  const figure = [shoulders, throat, skull];

  // ---- the colours and line of each manner
  const hue = Math.round(g[G.Hue]! * 360), hue2 = Math.round(g[G.Hue2]! * 360);
  const look = [
    { fill: '#8a2d18', line: '#8a2d18', lw: 1.6, mark: '#2a1c14', cut: '#c9b594', dress: '#2a1c14' },
    { fill: '#1c130f', line: '#1c130f', lw: 1.2, mark: '#d98a55', cut: '#d98a55', dress: '#d98a55' },
    { fill: '#efe6d2', line: '#2b221b', lw: 1.5, mark: '#2b221b', cut: '#2b221b', dress: '#2b221b' },
    { fill: `url(#${id}tone)`, line: '#2a1f17', lw: 0.8, mark: '#3a2c20', cut: '#1d1510', dress: '#1d1510' },
    { fill: `hsl(${hue} 52% 50%)`, line: `hsl(${hue} 85% 84%)`, lw: 0.9, mark: `hsl(${hue2} 60% 30%)`, cut: '#06131f', dress: `hsl(${hue} 85% 84%)` },
  ][style]!;

  // ---- what the species gives the face
  const behind: preact.JSX.Element[] = [];
  const on: preact.JSX.Element[] = [];
  if (g[G.Ornament]! > 0.4) {
    const ch = hr * (0.5 + 1.1 * g[G.Ornament]!);
    const pts: P[] = [at(hr * 0.25, -hr * 0.95)];
    for (let i = 0; i <= 6; i++) { const u = i / 6, a = -Math.PI * 0.5 - u * Math.PI * 0.62, r = hr + ch * Math.pow(Math.sin(u * Math.PI), 0.7) * (0.8 + 0.2 * Math.cos(u * 19)); pts.push(at(Math.cos(a) * r, Math.sin(a) * r)); }
    pts.push(at(-hr * 0.8, hr * 0.5));
    behind.push(<path key="crest" d={`M ${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ')} Z`} fill={look.fill} stroke={look.line} stroke-width={look.lw} stroke-linejoin="round" />);
  }
  if (g[G.Hearing]! > 0.45) {
    const el = hr * (0.5 + 0.8 * g[G.Hearing]!);
    behind.push(<path key="ear" d={closed([at(-hr * 0.75, -hr * 0.5), at(-hr * 0.9 - el * 0.45, -hr * 0.7 - el), at(-hr * 0.3, -hr * 0.88)])} fill={look.fill} stroke={look.line} stroke-width={look.lw} />);
  }
  if (g[G.Armor]! > 0.45) for (let i = 0; i < 4; i++) {
    const u = (i + 0.5) / 4, px = cx - neckW * (0.85 + 0.35 * Math.sin(u * Math.PI)) + (42 - cx) * u, py = cy + hr * 0.5 + (baseY - cy - hr * 0.3) * u, s = 3 + 5 * g[G.Armor]!;
    behind.push(<path key={`pl${i}`} d={`M ${f(px + 1)} ${f(py - s * 0.6)} L ${f(px - s)} ${f(py)} L ${f(px + 1)} ${f(py + s * 0.6)} Z`} fill={look.fill} stroke={look.line} stroke-width={look.lw} stroke-linejoin="round" />);
  }
  if (g[G.Horn]! > 0.22) {
    const hl = hr * (0.6 + 1.8 * g[G.Horn]!);
    const tip = at(hr * 0.1 - hl * 0.45, -hr * 0.9 - hl * 0.75), mid = at(hr * 0.45, -hr * 0.95 - hl * 0.55), w = Math.max(1.6, hr * 0.16);
    on.push(<path key="horn" d={`M ${f(cx + hr * 0.2 - w)} ${f(cy - hr * 0.9)} Q ${f(mid.x - w)} ${f(mid.y)} ${f(tip.x)} ${f(tip.y)} Q ${f(mid.x + w)} ${f(mid.y + w)} ${f(cx + hr * 0.2 + w)} ${f(cy - hr * 0.86)} Z`} fill={style === 2 ? look.fill : look.line} stroke={look.line} stroke-width={look.lw} stroke-linejoin="round" />);
  }
  if (g[G.Insulation]! > 0.55) for (let i = 0; i < 11; i++) {
    const u = i / 10, a = -Math.PI * 0.62 - u * Math.PI * 0.75, len = 2.5 + 4 * g[G.Insulation]! * (0.6 + 0.4 * rnd(seed, 20 + i));
    const p = at(Math.cos(a) * hr * 0.98, Math.sin(a) * hr * 0.98), q = at(Math.cos(a - 0.25) * (hr + len), Math.sin(a - 0.25) * (hr + len));
    behind.push(<path key={`fur${i}`} d={`M ${f(p.x)} ${f(p.y)} L ${f(q.x)} ${f(q.y)}`} stroke={look.line} stroke-width={look.lw * 1.3} stroke-linecap="round" />);
  }
  // markings, kept inside the outline
  const marks: preact.JSX.Element[] = [];
  const pattern = Math.min(3, Math.floor(g[G.PatternType]! * 4));
  const gap = 4 + 6 * g[G.PatternScale]!;
  if (pattern === 1) for (let x = -20; x < 110; x += gap) marks.push(<path key={`s${x}`} d={`M ${f(x)} ${f(cy + hr * 0.2)} q ${f(-gap * 0.6)} 30 ${f(-gap * 0.2)} 70`} stroke={look.mark} stroke-width={gap * 0.3} fill="none" opacity={style === 2 ? 0.8 : 0.6} />);
  if (pattern === 2) for (let i = 0; i < 26; i++) marks.push(<circle key={`d${i}`} cx={f(6 + rnd(seed >> 3, 40 + i) * 80)} cy={f(cy + hr * 0.1 + rnd(seed >> 3, 80 + i) * 70)} r={f(gap * (0.16 + 0.14 * rnd(seed, 120 + i)))} fill={look.mark} opacity={style === 2 ? 0.8 : 0.6} />);
  if (pattern === 3) marks.push(<path key="mask" d={`M ${f(cx - hr)} ${f(cy - hr * 0.42)} L ${f(cx + hr + sl)} ${f(cy - hr * 0.2)} L ${f(cx + hr + sl)} ${f(cy + hr * 0.02)} L ${f(cx - hr)} ${f(cy - hr * 0.1)} Z`} fill={look.mark} opacity={0.45} />);
  // the shaded side, in the manner of the age
  if (style === 2) for (let k = -40; k < 150; k += 2.3) marks.push(<path key={`h${k}`} d={`M ${f(k)} 124 L ${f(k - 62)} 0`} stroke={look.line} stroke-width={0.55} opacity={k < cx + 12 ? 0.8 : 0} />);

  // the face
  const eyes = Math.min(3, Math.max(1, Math.round(g[G.EyeCount]! * 3)));
  const er = Math.max(1.3, hr * (0.1 + 0.13 * g[G.EyeSize]!));
  const face: preact.JSX.Element[] = [];
  for (let e = 0; e < eyes; e++) {
    const ex = cx + hr * (0.38 - e * 0.42), ey = cy - hr * (0.26 - e * 0.07), r = er * (1 - e * 0.18);
    face.push(<circle key={`e${e}`} cx={f(ex)} cy={f(ey)} r={f(r)} fill={style === 3 ? '#efe2c9' : style === 4 ? '#eafcff' : look.cut} stroke={style >= 2 ? look.line : 'none'} stroke-width={look.lw * 0.7} />);
    if (style >= 2) face.push(<circle key={`p${e}`} cx={f(ex + r * 0.25)} cy={f(ey)} r={f(r * 0.5)} fill={style === 4 ? '#06131f' : look.line} />);
  }
  if (bold > 0.6 && style >= 1) face.push(<path key="brow" d={`M ${f(cx + hr * 0.1)} ${f(cy - hr * 0.5)} L ${f(cx + hr * 0.75)} ${f(cy - hr * 0.36)}`} stroke={look.cut} stroke-width={look.lw * 1.6} stroke-linecap="round" />);
  if (style >= 1) {
    face.push(<path key="mouth" d={`M ${f(cx + hr + sl * 0.93)} ${f(cy + hr * 0.24)} Q ${f(cx + hr * 0.9)} ${f(cy + hr * (cruel > 0.6 ? 0.2 : 0.46))} ${f(cx + hr * 0.45)} ${f(cy + hr * 0.4)}`} stroke={look.cut} stroke-width={look.lw * 0.9} fill="none" stroke-linecap="round" />);
    face.push(<circle key="nose" cx={f(cx + hr + sl * 0.8)} cy={f(cy - hr * 0.01)} r={0.9} fill={look.cut} />);
  }

  // ---- what the calling adds
  const dress: preact.JSX.Element[] = [];
  const halo: preact.JSX.Element[] = [];
  if (role === 'ruler' || role === 'founder' || role === 'consort') {
    const a = at(-hr * 0.78, -hr * 0.62), b = at(0, -hr * 1.04), c = at(hr * 0.62, -hr * 0.7);
    dress.push(<path key="band" d={`M ${f(a.x)} ${f(a.y)} Q ${f(b.x)} ${f(b.y)} ${f(c.x)} ${f(c.y)}`} stroke={look.dress} stroke-width={2.6} fill="none" stroke-linecap="round" />);
    if (role === 'ruler') for (let i = 0; i < 3; i++) { const u = 0.2 + i * 0.3, x = a.x + (c.x - a.x) * u, y = a.y + (c.y - a.y) * u - hr * 0.22 * Math.sin(u * Math.PI) - 1; dress.push(<path key={`pt${i}`} d={`M ${f(x - 2)} ${f(y)} L ${f(x)} ${f(y - 5)} L ${f(x + 2)} ${f(y)} Z`} fill={look.dress} />); }
  }
  if (role === 'prophet') halo.push(<circle key="halo" cx={f(cx)} cy={f(cy)} r={f(hr * 1.55)} fill="none" stroke={style === 2 ? look.line : style === 0 ? '#d8c08a' : style === 1 ? '#1c130f' : style === 3 ? '#e9dcc3' : '#5fd6e8'} stroke-width={1.4} stroke-dasharray={style === 4 ? '1 2' : 'none'} opacity={0.85} />);
  if (role === 'general') {
    for (let i = 0; i < 3; i++) dress.push(<path key={`g${i}`} d={`M ${f(42 - neckW - 5 + i)} ${f(baseY - 2 - i * 3.2)} Q 42 ${f(baseY + 4 - i * 3.2)} ${f(42 + neckW + 5 - i)} ${f(baseY - i * 3.2)}`} stroke={look.dress} stroke-width={2} fill="none" stroke-linecap="round" />);
    dress.push(<path key="scar" d={`M ${f(cx + hr * 0.7)} ${f(cy - hr * 0.12)} L ${f(cx + hr * 0.95)} ${f(cy + hr * 0.3)}`} stroke={look.cut} stroke-width={0.9} stroke-linecap="round" />);
  }
  if (role === 'explorer') dress.push(<path key="scarf" d={`M ${f(42 + neckW + 3)} ${f(baseY - 5)} Q 42 ${f(baseY + 1)} ${f(42 - neckW - 3)} ${f(baseY - 6)} q -8 -1 -14 6 q 7 -1 13 2`} stroke={look.dress} stroke-width={2.4} fill="none" stroke-linecap="round" stroke-linejoin="round" />);
  if (role === 'scholar' || role === 'inventor' || role === 'artist') {
    dress.push(<path key="collar" d={`M ${f(42 - neckW - 4)} ${f(baseY - 2)} Q 42 ${f(baseY + 5)} ${f(42 + neckW + 4)} ${f(baseY)}`} stroke={look.dress} stroke-width={1.6} fill="none" stroke-linecap="round" />);
    dress.push(<circle key="pendant" cx={f(42 + neckW * 0.3)} cy={f(baseY + 8)} r={role === 'artist' ? 1.6 : 2.2} fill={role === 'inventor' ? 'none' : look.dress} stroke={look.dress} stroke-width={1} />);
  }

  // ---- the ground it is made on, and its frame
  const ground: preact.JSX.Element[] = [];
  const over: preact.JSX.Element[] = [];
  let clip = `<rect x="0" y="0" width="100" height="120" rx="3" />`;
  if (style === 0) {
    ground.push(<rect key="rock" width="100" height="120" fill="#74624e" />);
    ground.push(<rect key="grain" width="100" height="120" filter={`url(#${id}rock)`} opacity={0.55} />);
    for (let i = 0; i < 5; i++) over.push(<circle key={`dot${i}`} cx={f(9 + i * 5.5 + j(60 + i, 1))} cy={f(110 + j(70 + i, 1.5))} r={1.5} fill="#8a2d18" opacity={0.85} />);
  } else if (style === 1) {
    ground.push(<rect key="bg" width="100" height="120" fill="#241913" />);
    ground.push(<circle key="disc" cx="50" cy="60" r="47" fill={`url(#${id}clay)`} />);
    over.push(<circle key="rim" cx="50" cy="60" r="45" fill="none" stroke="#1c130f" stroke-width="3" stroke-dasharray="2.5 3.5" />);
    over.push(<circle key="edge" cx="50" cy="60" r="47" fill="none" stroke="#6f3a20" stroke-width="1.5" />);
    clip = `<circle cx="50" cy="60" r="43" />`;
  } else if (style === 2) {
    ground.push(<rect key="paper" width="100" height="120" fill="#efe6d2" />);
    for (let y = 10; y < 112; y += 3) ground.push(<path key={`sky${y}`} d={`M 6 ${y} H 94`} stroke="#2b221b" stroke-width={0.4} opacity={y < cy ? 0.38 : 0.16} />);
    over.push(<ellipse key="o1" cx="50" cy="60" rx="45" ry="56" fill="none" stroke="#2b221b" stroke-width="1.8" />);
    over.push(<ellipse key="o2" cx="50" cy="60" rx="47.5" ry="58.5" fill="none" stroke="#2b221b" stroke-width="0.6" />);
    over.push(<path key="mat" fill-rule="evenodd" d="M0 0 H100 V120 H0 Z M50 4 A45 56 0 1 0 50.01 4 Z" fill="#efe6d2" />);
    clip = `<ellipse cx="50" cy="60" rx="45" ry="56" />`;
  } else if (style === 3) {
    ground.push(<rect key="back" width="100" height="120" fill={`url(#${id}drop)`} />);
    over.push(<rect key="dots" width="100" height="120" fill={`url(#${id}half)`} opacity={0.2} />);
    over.push(<rect key="vig" width="100" height="120" fill={`url(#${id}vig)`} />);
    over.push(<rect key="margin" x="2.5" y="2.5" width="95" height="115" fill="none" stroke="#e9dcc3" stroke-width="5" />);
  } else {
    ground.push(<rect key="back" width="100" height="120" fill="#06131f" />);
    ground.push(<circle key="glow" cx={f(cx)} cy={f(cy)} r="60" fill={`url(#${id}lit)`} />);
    over.push(<rect key="lines" width="100" height="120" fill={`url(#${id}scan)`} opacity={0.35} />);
    for (const [x, y, sx, sy] of [[4, 4, 1, 1], [96, 4, -1, 1], [4, 116, 1, -1], [96, 116, -1, -1]] as const) over.push(<path key={`c${x}${y}`} d={`M ${x} ${y + sy * 9} V ${y} H ${x + sx * 9}`} stroke="#5fd6e8" stroke-width="1" fill="none" />);
    over.push(<text key="tag" x="7" y="113" fill="#5fd6e8" style={{ font: '500 5px ui-monospace, monospace' }} opacity={0.8}>{`ID ${String(seed).padStart(5, '0')}`}</text>);
  }
  const emblemInk = style === 0 ? '#2a1c14' : style === 1 ? '#1c130f' : style === 2 ? '#2b221b' : style === 3 ? '#e9dcc3' : '#5fd6e8';
  const emblemAt = style === 1 ? { x: 78, y: 92 } : style === 2 ? { x: 44, y: 104 } : { x: 82, y: 100 };
  const handmade = style <= 2;

  return (
    <svg width={width} height={width * 1.2} viewBox="0 0 100 120" style={{ display: 'block', borderRadius: '3px', flex: 'none' }} role="img" aria-label={`Portrait, ${ART_NAMES[style]}`}>
      <defs>
        <clipPath id={`${id}clip`} dangerouslySetInnerHTML={{ __html: clip }} />
        <clipPath id={`${id}fig`}>{figure.map((d, i) => <path key={i} d={d} />)}</clipPath>
        {handmade && (
          <filter id={`${id}hand`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency={style === 0 ? 0.09 : 0.05} numOctaves="2" seed={seed % 89} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={style === 0 ? 3.2 : 1.4} />
          </filter>
        )}
        {style === 0 && (
          <filter id={`${id}rock`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.045 0.09" numOctaves="3" seed={seed % 53} />
            <feColorMatrix type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.11  0 0 0 0 0.07  0.9 0.9 0 0 -0.55" />
          </filter>
        )}
        {style === 1 && <radialGradient id={`${id}clay`} cx="0.42" cy="0.38" r="0.75"><stop offset="0" stop-color="#cf7f4c" /><stop offset="1" stop-color="#a2552d" /></radialGradient>}
        {style === 3 && [
          <linearGradient key="a" id={`${id}drop`} x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#8a745c" /><stop offset="1" stop-color="#31251b" /></linearGradient>,
          <linearGradient key="b" id={`${id}tone`} x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="#5d4a38" /><stop offset="0.7" stop-color="#d6c09f" /><stop offset="1" stop-color="#eadbc0" /></linearGradient>,
          <radialGradient key="c" id={`${id}vig`} cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#1a120c" stop-opacity="0" /><stop offset="1" stop-color="#1a120c" stop-opacity="0.75" /></radialGradient>,
          <pattern key="d" id={`${id}half`} width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><circle cx="1.2" cy="1.2" r="0.6" fill="#1a120c" /></pattern>,
        ]}
        {style === 4 && [
          <radialGradient key="a" id={`${id}lit`}><stop offset="0" stop-color={`hsl(${hue} 60% 30%)`} stop-opacity="0.75" /><stop offset="1" stop-color="#06131f" stop-opacity="0" /></radialGradient>,
          <pattern key="b" id={`${id}scan`} width="4" height="2" patternUnits="userSpaceOnUse"><rect width="4" height="0.8" fill="#000" /></pattern>,
        ]}
      </defs>
      {ground}
      <g clip-path={`url(#${id}clip)`}>
        <g filter={handmade ? `url(#${id}hand)` : undefined}>
          {halo}
          {behind}
          {/* outline first, then the fill over it, so the lines where neck meets head and shoulders do not show */}
          {figure.map((d, i) => <path key={`o${i}`} d={d} fill="none" stroke={look.line} stroke-width={look.lw * 2} stroke-linejoin="round" />)}
          {figure.map((d, i) => <path key={`f${i}`} d={d} fill={look.fill} />)}
          <g clip-path={`url(#${id}fig)`}>{marks}</g>
          {on}
          {face}
          {dress}
        </g>
      </g>
      {over}
      {EMBLEM[role] && (
        <g transform={`translate(${emblemAt.x} ${emblemAt.y})`}>
          {style !== 2 && <circle cx="6" cy="6" r="8.5" fill={style === 0 ? '#c9b594' : style === 1 ? '#cf7f4c' : style === 3 ? '#31251b' : '#06131f'} stroke={emblemInk} stroke-width="0.8" opacity={style === 0 ? 0.85 : 1} />}
          <path d={EMBLEM[role]} fill={role === 'inventor' || role === 'scholar' || role === 'artist' || role === 'consort' || role === 'claimant' ? 'none' : emblemInk} stroke={emblemInk} stroke-width="1" stroke-linejoin="round" stroke-linecap="round" />
        </g>
      )}
    </svg>
  );
}
