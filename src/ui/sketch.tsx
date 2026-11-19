// Field-guide sketches: a side view of a species drawn in ink from its genes, the way a naturalist
// would put it in a notebook. Pure SVG, with a wobble filter so the lines look hand drawn.
import { G, Limb, limbKind } from '../sim/genetics';

interface P { x: number; y: number; }

/** A smooth closed outline through points. */
function closed(points: P[]): string {
  const n = points.length;
  const mid = (a: P, b: P) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = points[i]!, q = points[(i + 1) % n]!;
    const m = mid(p, q);
    d += i === 0 ? `M ${mid(points[n - 1]!, p).x.toFixed(2)} ${mid(points[n - 1]!, p).y.toFixed(2)} ` : '';
    d += `Q ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${m.x.toFixed(2)} ${m.y.toFixed(2)} `;
  }
  return `${d}Z`;
}

const open = (points: P[]): string => points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

export function CreatureSketch({ genes, width = 220, seed = 1 }: { genes: Float32Array; width?: number; seed?: number }) {
  const g = genes;
  const kind = limbKind(g[G.LimbType]!);
  const hasLimbs = g[G.LimbPairs]! > 0.12;
  const ratio = 1.6 + 2.8 * g[G.BodyRatio]!;
  const L = 100;
  const H = (L / ratio) * (1 + 0.25 * g[G.Insulation]!);
  const walker = hasLimbs && (kind === Limb.Legs || kind === Limb.Wings);
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
  const taper = (u: number) => 0.72 + 0.28 * Math.sin(u * Math.PI);
  // spine stations: x, y (up), half height
  const st: { x: number; y: number; r: number }[] = [];
  if (tail > 8) for (let i = 0; i < 6; i++) { const t = 1 - i / 6; st.push({ x: -L / 2 - tail * t, y: bodyY - tail * 0.1 * t * t, r: Math.max(0.6, Math.pow(1 - t, 0.75) * H * 0.33) }); }
  else st.push({ x: -L / 2 - H * 0.1, y: bodyY, r: 0.6 });
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    const pinch = segs > 1 ? 1 - 0.2 * Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI * 2 * segs), 6) : 1;
    st.push({ x: -L / 2 + u * L, y: bodyY + H * 0.04 * Math.sin(u * Math.PI), r: H * 0.5 * taper(u) * pinch });
  }
  const front = st[st.length - 1]!;
  if (hasNeck) for (let i = 1; i <= 3; i++) { const t = i / 4, e = t * t * (3 - 2 * t); st.push({ x: front.x + (headX - front.x) * t, y: front.y + (headY - front.y) * e, r: front.r * (1 - e) + H * 0.19 * e }); }
  const hx0 = hasNeck ? headX - hs * 0.25 : front.x + hs * 0.05, hy = hasNeck ? headY : front.y + H * 0.12;
  for (let i = 0; i <= 6; i++) { const t = i / 6; const prof = Math.pow(Math.sin(Math.min(1, t * 0.92 + 0.08) * Math.PI), 0.62) * (1 - 0.3 * t); st.push({ x: hx0 + t * headLen, y: hy - hs * 0.08 * t, r: i === 6 ? 0.8 : Math.max(0.06, prof) * hs * 0.5 }); }
  const top = st.map((s) => ({ x: s.x, y: -(s.y + s.r) }));
  const bottom = st.map((s) => ({ x: s.x, y: -(s.y - s.r * 0.92) })).reverse();
  const body = closed([...top, ...bottom]);
  const ink = '#3a2e24', paper = '#efe6d2';
  const parts: preact.JSX.Element[] = [];
  const limb = (pts: P[], w: number, key: string, faint = false) => {
    parts.push(<path key={`${key}o`} d={open(pts)} stroke={ink} stroke-width={w + 1.8} stroke-linecap="round" stroke-linejoin="round" fill="none" opacity={faint ? 0.45 : 1} />);
    parts.push(<path key={`${key}i`} d={open(pts)} stroke={paper} stroke-width={w} stroke-linecap="round" stroke-linejoin="round" fill="none" />);
  };
  const behind: preact.JSX.Element[] = [];
  const pairs = hasLimbs ? Math.max(1, Math.round(g[G.LimbPairs]! * 4)) : 0;
  if (walker) {
    const legPairs = kind === Limb.Wings ? 1 : pairs;
    const thick = H * (0.22 + 0.2 * g[G.Size]!);
    for (let p = 0; p < legPairs; p++) {
      const lx = legPairs === 1 ? 5 : -L * 0.34 + (p / (legPairs - 1)) * L * 0.68;
      const bend = p < legPairs / 2 && legPairs > 1 ? -1 : 1;
      const hipY = bodyY - H * 0.2;
      const far = [{ x: lx + thick * 0.8, y: -hipY }, { x: lx + thick * 0.8 + bend * hipY * 0.12 - hipY * 0.08, y: -hipY * 0.5 }, { x: lx + thick * 0.8 - hipY * 0.12, y: -1 }, { x: lx + thick * 2 - hipY * 0.12, y: -0.5 }];
      behind.push(<path key={`f${p}`} d={open(far)} stroke={ink} stroke-width={thick * 0.8} stroke-linecap="round" stroke-linejoin="round" fill="none" opacity={0.35} />);
      limb([{ x: lx, y: -hipY }, { x: lx + bend * hipY * 0.14, y: -hipY * 0.5 }, { x: lx, y: -1 }, { x: lx + thick * 1.3, y: -0.5 }], thick, `l${p}`);
    }
  }
  if (hasLimbs && kind === Limb.Fins) for (let p = 0; p < Math.min(3, pairs); p++) {
    const fx = L * 0.25 - p * L * 0.3, len = H * (0.6 + 1.2 * g[G.LimbLength]!);
    parts.push(<path key={`fin${p}`} d={closed([{ x: fx + H * 0.2, y: -(bodyY - H * 0.3) }, { x: fx - len * 0.5, y: -(bodyY - H * 0.5 - len * 0.6) }, { x: fx - H * 0.25, y: -(bodyY - H * 0.35) }])} fill={paper} stroke={ink} stroke-width={1.4} />);
  }
  if (tail > 8 && !walker) {
    const tx = -L / 2 - tail;
    parts.push(<path key="fluke" d={closed([{ x: tx + tail * 0.15, y: -(bodyY - tail * 0.1) }, { x: tx - H * 0.5, y: -(bodyY - tail * 0.1 + H * 0.8) }, { x: tx - H * 0.15, y: -(bodyY - tail * 0.1) }, { x: tx - H * 0.5, y: -(bodyY - tail * 0.1 - H * 0.8) }])} fill={paper} stroke={ink} stroke-width={1.4} />);
  }
  if (hasLimbs && kind === Limb.Wings) {
    const span = L * (0.8 + 1.3 * g[G.LimbLength]!) * 0.7;
    parts.push(<path key="wing" d={closed([{ x: 20, y: -(bodyY + H * 0.3) }, { x: -5, y: -(bodyY + H * 0.4 + span) }, { x: -30, y: -(bodyY + H * 0.2 + span * 0.55) }, { x: -45, y: -(bodyY + H * 0.3 + span * 0.3) }, { x: -38, y: -(bodyY + H * 0.2) }])} fill={paper} stroke={ink} stroke-width={1.5} />);
    for (let k = 1; k <= 2; k++) parts.push(<path key={`rib${k}`} d={open([{ x: 18, y: -(bodyY + H * 0.3) }, { x: -5 - k * 13, y: -(bodyY + H * 0.3 + span * (0.9 - k * 0.28)) }])} stroke={ink} stroke-width={0.8} fill="none" opacity={0.7} />);
  }
  if (g[G.Ornament]! > 0.4) {
    const ch = H * 1.6 * g[G.Ornament]!;
    const sail: P[] = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8; sail.push({ x: -L * 0.35 + u * L * 0.6, y: -(bodyY + H * 0.45 * taper(0.2 + u * 0.6) + ch * Math.pow(Math.sin(u * Math.PI), 0.7) * (0.85 + 0.15 * Math.cos(u * Math.PI * 8))) }); }
    behind.push(<path key="sail" d={`${open(sail)} L ${(L * 0.25).toFixed(1)} ${(-bodyY).toFixed(1)} L ${(-L * 0.35).toFixed(1)} ${(-bodyY).toFixed(1)} Z`} fill={paper} stroke={ink} stroke-width={1.3} />);
  }
  if (g[G.Armor]! > 0.45) for (let i = 0; i < 7; i++) {
    const u = (i + 0.5) / 7, px = -L * 0.42 + u * L * 0.84, topY = bodyY + H * 0.5 * taper(u) * 0.95, s = H * (0.18 + 0.3 * g[G.Armor]!) * (0.6 + 0.4 * Math.sin(u * Math.PI));
    behind.push(<path key={`pl${i}`} d={closed([{ x: px - s * 0.5, y: -(topY - s * 0.2) }, { x: px, y: -(topY + s) }, { x: px + s * 0.5, y: -(topY - s * 0.2) }])} fill={paper} stroke={ink} stroke-width={1.2} />);
  }
  if (g[G.Horn]! > 0.22) {
    const hl = hs * 2.2 * g[G.Horn]!;
    const pts: P[] = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push({ x: hx0 + headLen * 0.3 - hl * 0.35 * t * t + hl * 0.1 * t, y: -(hy + hs * 0.35 + hl * 0.8 * t - hl * 0.15 * t * t) }); }
    parts.push(<path key="horn" d={open(pts)} stroke={ink} stroke-width={Math.max(1.6, hs * 0.14)} stroke-linecap="round" fill="none" />);
  }
  // markings and shading, kept inside the outline
  const marks: preact.JSX.Element[] = [];
  const pattern = Math.min(3, Math.floor(g[G.PatternType]! * 4));
  const pScale = 4 + 18 * g[G.PatternScale]!;
  const minX = st[0]!.x, maxX = st[st.length - 1]!.x;
  if (pattern === 1) for (let x = minX; x < maxX; x += (maxX - minX) / pScale) marks.push(<path key={`s${x}`} d={`M ${x.toFixed(1)} ${(-bodyY - H).toFixed(1)} q ${(H * 0.2).toFixed(1)} ${H.toFixed(1)} 0 ${(H * 2).toFixed(1)}`} stroke={ink} stroke-width={Math.max(1, (maxX - minX) / pScale * 0.3)} fill="none" opacity={0.5} />);
  if (pattern === 2) { let h = seed * 9301 + 49297; const r = () => { h = (h * 233280 + 49297) % 2147483647; return (h % 10000) / 10000; }; for (let i = 0; i < pScale * 2.5; i++) marks.push(<circle key={`d${i}`} cx={minX + r() * (maxX - minX)} cy={-(bodyY - H * 0.5 + r() * H)} r={1 + r() * 2.2} fill={ink} opacity={0.45} />); }
  for (let i = 0; i < 16; i++) { const x = minX + ((i + 0.5) / 16) * (maxX - minX); marks.push(<path key={`h${i}`} d={`M ${x.toFixed(1)} ${(-(bodyY - H * 0.5) + 1).toFixed(1)} l ${(-H * 0.14).toFixed(1)} ${(-H * 0.3).toFixed(1)}`} stroke={ink} stroke-width={0.7} fill="none" opacity={0.55} />); }
  // eyes
  const eyes = Math.max(1, Math.round((g[G.EyeCount]! * 6) / 2));
  const es = Math.max(1.2, hs * (0.1 + 0.14 * g[G.EyeSize]!));
  const eyeEls: preact.JSX.Element[] = [];
  for (let e = 0; e < Math.min(3, eyes); e++) { const t = 0.55 - e * 0.2; const cx = hx0 + t * headLen, cy = -(hy + hs * (0.16 + e * 0.1)); eyeEls.push(<circle key={`e${e}`} cx={cx} cy={cy} r={es} fill={paper} stroke={ink} stroke-width={1} />, <circle key={`p${e}`} cx={cx + es * 0.25} cy={cy} r={es * 0.45} fill={ink} />); }
  // frame the drawing
  const x0 = minX - (tail > 8 && !walker ? H * 0.6 : 4), x1 = maxX + 6;
  const yTop = -Math.max(...st.map((s) => s.y + s.r)) - (g[G.Ornament]! > 0.4 ? H * 1.6 * g[G.Ornament]! : 0) - (g[G.Horn]! > 0.22 ? hs * 1.9 * g[G.Horn]! : 0) - (kind === Limb.Wings && hasLimbs ? L * (0.8 + 1.3 * g[G.LimbLength]!) * 0.7 : 0) - 6;
  const yBot = walker ? 4 : -(bodyY - H * 0.5 - H * (0.6 + 1.2 * g[G.LimbLength]!) * 0.7) + 4;
  const vw = x1 - x0, vh = yBot - yTop;
  const id = `sk${seed}`;
  return (
    <svg width={width} height={Math.min(width * 0.8, (width * vh) / vw)} viewBox={`${x0.toFixed(1)} ${yTop.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`} style={{ display: 'block', margin: '0 auto' }}>
      <defs>
        <filter id={`${id}w`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed={seed % 97} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={Math.max(1.5, vw * 0.012)} />
        </filter>
        <clipPath id={`${id}c`}><path d={body} /></clipPath>
      </defs>
      <g filter={`url(#${id}w)`}>
        {walker && <path d={`M ${x0 + 4} 1.5 L ${x1 - 4} 1.5`} stroke={ink} stroke-width={0.8} opacity={0.4} stroke-dasharray="6 5" />}
        {behind}
        <path d={body} fill={paper} stroke={ink} stroke-width={1.8} stroke-linejoin="round" />
        <g clip-path={`url(#${id}c)`}>{marks}</g>
        {parts}
        {eyeEls}
      </g>
    </svg>
  );
}
