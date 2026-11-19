import { useEffect, useRef, useState } from 'preact/hooks';
import type { Nation } from '../render/gfx/nations';
import { CreatureSketch } from './sketch';
import { G, GENE_NAMES } from '../sim/genetics';
import type { SimEvent } from '../sim/events';
import type { SpeciesInfo } from '../shared/protocol';
import { actions, state, update, useStore, type Relative, type UIState } from './store';
import { bigNumber, eventColor, eventGlyph, formatYear, hsl, metres, shortYear } from './format';
import css from './ui.module.css';

/** A number that glides to its new value. */
export function Num({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  const target = useRef(value);
  const raf = useRef(0);
  target.current = value;
  useEffect(() => {
    if (raf.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      const k = 1 - Math.exp(-(now - last) / 140);
      last = now;
      const diff = target.current - cur.current;
      cur.current = Math.abs(diff) < Math.abs(target.current) * 1e-4 + 1e-6 ? target.current : cur.current + diff * k;
      setShown(cur.current);
      raf.current = cur.current === target.current ? 0 : requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [value]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return <>{format(shown)}</>;
}

export function Chronicle() {
  const s = useStore();
  const ids = s.chronicle.slice(-160).reverse();
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Chronicle</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        {ids.length === 0 && <p class={css.sub}>Nothing has happened yet. Give it time.</p>}
        {ids.map((id) => {
          const e = s.events[id]!;
          return (
            <button class={css.entry} key={id} onClick={() => update({ whyEvent: id })} style={{ color: eventColor(e.type) }}>
              <i class={css.dot} />
              <div class={css.when} style={{ color: '#ece7db' }}>{formatYear(e.simYear)}</div>
              <div class={`${css.what} ${e.importance >= 3 ? css.big : ''}`} style={{ color: '#ece7db' }}>{e.importance >= 3 ? e.title : e.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Walk the cause graph backward from an event: strongest cause first at each level. */
function causeChain(events: SimEvent[], id: number, max = 14): { e: SimEvent; depth: number }[] {
  const out: { e: SimEvent; depth: number }[] = [];
  const seen = new Set<number>();
  const visit = (eid: number, depth: number) => {
    const e = events[eid];
    if (!e || seen.has(eid) || out.length >= max) return;
    seen.add(eid);
    out.push({ e, depth });
    const order = e.causes.map((c, i) => ({ c, w: e.causeWeights[i] ?? 1 })).sort((a, b) => b.w - a.w);
    for (const o of order) visit(o.c, depth + 1);
  };
  visit(id, 0);
  return out;
}

export function Why() {
  const s = useStore();
  const root = s.events[s.whyEvent];
  if (!root) return null;
  const chain = causeChain(s.events, root.id);
  return (
    <div class={`${css.panel} ${css.side} ${css.sideLeft}`}>
      <div class={css.head}><h2>Why did this happen?</h2><button class={css.close} onClick={() => update({ whyEvent: -1 })}>✕</button></div>
      <div class={css.scroll}>
        {chain.map(({ e }, i) => (
          <>
            {i === 1 && <div class={css.because}>because</div>}
            {i > 1 && <div class={css.because}>and before that</div>}
            <div class={css.step} key={e.id} style={{ color: eventColor(e.type) }}>
              <div class={css.thumb}>{eventGlyph(e.type)}</div>
              <div style={{ color: '#ece7db' }}>
                <div class={css.when}>{formatYear(e.simYear)}</div>
                <h3>{e.title}</h3>
                <p>{e.description}</p>
                {e.cellId >= 0 && <button class={css.link} onClick={() => actions.flyToCell(e.cellId)}>show place</button>}
                {(e.speciesIds ?? []).slice(0, 1).map((id) => s.species.has(id) && (
                  <button class={css.link} onClick={() => actions.selectSpecies(id)}>{s.species.get(id)!.name}</button>
                ))}
                {e.effects.length > 0 && i === 0 && <span class={css.sub}>led to {e.effects.length} later event{e.effects.length > 1 ? 's' : ''}</span>}
              </div>
            </div>
          </>
        ))}
        {chain.length === 1 && <p class={css.sub} style={{ marginLeft: 46 }}>Nothing caused this. It is where a story begins.</p>}
      </div>
    </div>
  );
}

export function describe(sp: SpeciesInfo): string {
  const g = sp.genes;
  const size = sp.metres < 0.15 ? 'tiny' : sp.metres < 0.6 ? 'small' : sp.metres < 2 ? 'mid-sized' : sp.metres < 4.5 ? 'large' : 'giant';
  const diet = g[G.Diet]! > 0.62 ? 'hunter' : g[G.Diet]! < 0.3 ? 'grazer' : 'forager';
  const where = sp.fly > 0.45 ? 'flying' : sp.land > 0.6 ? 'land' : sp.land > 0.25 ? 'shore' : 'sea';
  const extra: string[] = [];
  if (g[G.WarmBlood]! > 0.5) extra.push('warm-blooded');
  if (g[G.Nocturnal]! > 0.65) extra.push('active at night');
  if (g[G.Sociality]! > 0.6) extra.push(diet === 'hunter' ? 'hunts in packs' : 'lives in herds');
  if (g[G.Glow]! > 0.55) extra.push('glows in the dark');
  if (g[G.Armor]! > 0.55) extra.push('armoured');
  if (g[G.Venom]! > 0.55) extra.push('venomous');
  if (g[G.Intelligence]! > 0.5) extra.push('clever');
  return `A ${size} ${where} ${diet}${extra.length ? ', ' + extra.join(', ') : ''}.`;
}

const SHOWN_GENES = [G.Size, G.Diet, G.Intelligence, G.Sociality, G.Aggression, G.Armor, G.Sight, G.Insulation, G.Nocturnal, G.Water, G.Offspring, G.Care];

export function SpeciesCard() {
  const s = useStore();
  const sp = s.species.get(s.selectedSpecies);
  if (!sp) return null;
  const lineage: SpeciesInfo[] = [];
  for (let p = s.species.get(sp.parent); p && lineage.length < 6; p = s.species.get(p.parent)) lineage.push(p);
  const now = s.stats?.simYear ?? 0;
  return (
    <div class={`${css.panel} ${css.card}`}>
      <div class={css.head} style={{ padding: 0 }}>
        <h2><i class={css.swatch} style={{ color: hsl(sp.genes[G.Hue]!) }} />{sp.name}</h2>
        <button class={css.close} onClick={() => update({ selectedSpecies: -1 })}>✕</button>
      </div>
      <div class={css.desc}>{describe(sp)}</div>
      <div class={css.kv}>
        <span>status</span><b style={{ fontWeight: 400 }}>{sp.extinctYear >= 0 ? `extinct, ${formatYear(sp.extinctYear).toLowerCase()}` : 'living'}</b>
        <span>length</span><b style={{ fontWeight: 400 }}>{metres(sp.metres)}</b>
        {sp.extinctYear < 0 && <><span>population</span><b style={{ fontWeight: 400 }}><Num value={sp.pop} format={bigNumber} /></b></>}
        {sp.extinctYear < 0 && <><span>range</span><b style={{ fontWeight: 400 }}>{sp.regions} regions</b></>}
        <span>appeared</span><b style={{ fontWeight: 400 }}>{formatYear(sp.bornYear).toLowerCase()}</b>
        <span>lasted</span><b style={{ fontWeight: 400 }}>{shortYear((sp.extinctYear >= 0 ? sp.extinctYear : now) - sp.bornYear)}</b>
      </div>
      <div style={{ margin: '10px 0 4px' }} class={css.sub}>GENES</div>
      {SHOWN_GENES.map((gi) => (
        <div class={css.gene} key={gi}><span>{GENE_NAMES[gi]}</span><i><b style={{ width: `${sp.genes[gi]! * 100}%` }} /></i></div>
      ))}
      {lineage.length > 0 && (
        <>
          <div style={{ margin: '10px 0 4px' }} class={css.sub}>LINEAGE</div>
          {lineage.map((p) => <div key={p.id}><button class={css.link} onClick={() => actions.selectSpecies(p.id)}>{p.name}</button></div>)}
        </>
      )}
      <div style={{ marginTop: 12 }}>
        {sp.extinctYear < 0 && <button class={css.link} onClick={() => actions.flyToCell(sp.homeCell, 0.5)}>fly there</button>}
        {sp.eventId >= 0 && <button class={css.link} onClick={() => update({ whyEvent: sp.eventId })}>why did it appear?</button>}
      </div>
    </div>
  );
}

/** Info card for one individual creature (follow mode). */
export function CreatureCard() {
  const s = useStore();
  const c = s.creature;
  if (!c) return null;
  const sp = s.species.get(c.species);
  if (!sp) return null;
  const lineage: SpeciesInfo[] = [];
  for (let p = s.species.get(sp.parent); p && lineage.length < 4; p = s.species.get(p.parent)) lineage.push(p);
  return (
    <div class={`${css.panel} ${css.card}`}>
      <div class={css.head} style={{ padding: 0 }}>
        <h2><i class={css.swatch} style={{ color: hsl(sp.genes[G.Hue]!) }} />{c.name}</h2>
        <button class={css.close} onClick={() => { actions.followCreature(false); update({ creature: null }); }}>✕</button>
      </div>
      <div class={css.desc}><i>{sp.name}</i>. {describe(sp)}</div>
      <div class={css.kv}>
        <span>doing</span><b style={{ fontWeight: 400 }}>{c.action}</b>
        <span>age</span><b style={{ fontWeight: 400 }}>{c.age}</b>
        <span>length</span><b style={{ fontWeight: 400 }}>{metres(sp.metres)}</b>
        <span>its kind</span><b style={{ fontWeight: 400 }}><Num value={sp.pop} format={bigNumber} /></b>
      </div>
      <div style={{ margin: '10px 0 4px' }} class={css.sub}>GENES</div>
      {SHOWN_GENES.slice(0, 8).map((gi) => (
        <div class={css.gene} key={gi}><span>{GENE_NAMES[gi]}</span><i><b style={{ width: `${sp.genes[gi]! * 100}%` }} /></i></div>
      ))}
      <div style={{ margin: '10px 0 2px' }} class={css.sub}>FAMILY</div>
      <FamilyTreeView creature={c.key} />
      {lineage.length > 0 && <div style={{ margin: '10px 0 2px' }} class={css.sub}>LINEAGE</div>}
      {lineage.map((p) => <div key={p.id}><button class={css.link} onClick={() => actions.selectSpecies(p.id)}>{p.name}</button></div>)}
      <div style={{ marginTop: 12 }}>
        <button class={css.link} onClick={() => actions.followCreature(!c.following)}>{c.following ? 'stop following' : 'follow (F)'}</button>
        <button class={css.link} onClick={() => actions.selectSpecies(sp.id)}>about the species</button>
      </div>
    </div>
  );
}

/** The tree of life: time runs left to right, every species is a glowing branch. */
export function Tree() {
  const s = useStore();
  // the tree is costly to lay out: redraw it about once a second, not on every stats tick
  const cache = useRef<{ at: number; species: number; node: any }>({ at: 0, species: -1, node: null });
  const nowMs = performance.now();
  if (cache.current.node && nowMs - cache.current.at < 1000 && cache.current.species === s.species.size) return cache.current.node;
  const node = renderTree(s);
  cache.current = { at: nowMs, species: s.species.size, node };
  return node;
}

function renderTree(s: UIState) {
  const all = [...s.species.values()].sort((a, b) => a.bornYear - b.bornYear || a.id - b.id);
  const now = s.stats?.simYear ?? 1;
  const children = new Map<number, SpeciesInfo[]>();
  for (const sp of all) {
    const list = children.get(sp.parent) ?? [];
    list.push(sp);
    children.set(sp.parent, list);
  }
  // only keep branches that mattered, so the tree stays readable
  const keep = (sp: SpeciesInfo): boolean => sp.extinctYear < 0 || sp.peakPop > 5e4 || (children.get(sp.id) ?? []).some(keep);
  const rows = new Map<number, number>();
  let row = 0;
  const place = (sp: SpeciesInfo) => {
    if (!keep(sp)) return;
    rows.set(sp.id, row++);
    for (const c of children.get(sp.id) ?? []) place(c);
  };
  for (const sp of all) if (!s.species.has(sp.parent)) place(sp);
  const first = all.length ? all[0]!.bornYear : 0;
  const W = 680, rowH = 17, left = 8, right = 190;
  const x = (y: number) => left + ((y - first) / Math.max(1, now - first)) * (W - left - right);
  const H = Math.max(60, row * rowH + 16);
  return (
    <div class={`${css.panel} ${css.side} ${css.wide}`}>
      <div class={css.head}>
        <h2>Tree of life</h2>
        <span class={css.sub}>{s.stats?.livingSpecies ?? 0} living · {all.length} named</span>
        <button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button>
      </div>
      <div class={css.scroll}>
        {all.length === 0 && <p class={css.sub}>No animals yet. The tree will grow from the first one.</p>}
        <svg class={css.tree} viewBox={`0 0 ${W} ${H}`} style={{ height: H * 1.0 }}>
          {all.map((sp) => {
            const r = rows.get(sp.id);
            if (r === undefined) return null;
            const y = 10 + r * rowH;
            const alive = sp.extinctYear < 0;
            const x0 = x(sp.bornYear), x1 = x(alive ? now : sp.extinctYear);
            const pr = rows.get(sp.parent);
            const col = hsl(sp.genes[G.Hue]!, alive ? 75 : 25, alive ? 66 : 52);
            return (
              <g key={sp.id} onClick={() => actions.selectSpecies(sp.id)} style={{ color: col }} opacity={alive ? 1 : 0.55}>
                {pr !== undefined && <path d={`M${x0} ${10 + pr * rowH} C${x0} ${y - 6}, ${x0} ${y}, ${x0 + 5} ${y}`} stroke={col} class={alive ? css.alive : ''} />}
                <path d={`M${x0 + (pr !== undefined ? 5 : 0)} ${y} L${Math.max(x0 + 6, x1)} ${y}`} stroke={col} class={alive ? css.alive : ''} />
                {alive && <circle cx={Math.max(x0 + 6, x1)} cy={y} r={2.6} fill={col} class={css.tip} />}
                <text x={Math.max(x0 + 6, x1) + 7} y={y + 4} opacity={alive ? 1 : 0.6} font-style="italic">{sp.name}{alive ? '' : ' †'}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function Help() {
  const keys: [string, string][] = [
    ['drag', 'orbit the planet'], ['scroll / pinch', 'zoom, from deep space to the ground'], ['right-drag', 'turn and tilt near the surface'],
    ['Space', 'pause or play'], ['1 – 6', 'time speed'], ['C', 'chronicle'], ['T', 'tree of life'], ['G', 'god tools'],
    ['M', 'flat map'], ['X', 'cross-section'], ['U', 'dive under water'], ['V', 'first-person view while following'], ['O', 'overlays'], ['F', 'follow the selected creature'], ['P', 'postcard mode'], ['H', 'hide the interface'], ['Esc', 'close panels'], ['?', 'this list'],
  ];
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Controls</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        <div class={css.help}>{keys.map(([k, v]) => <><kbd>{k}</kbd><span>{v}</span></>)}</div>
        <p class={css.sub} style={{ marginTop: 14 }}>Click any line in the chronicle to trace what caused it. Click a branch of the tree to meet that species.</p>
      </div>
    </div>
  );
}

const GOD_TOOLS: [string, string, string][] = [
  ['meteor', 'Meteor', 'Shockwave, crater, impact winter.'],
  ['lightning', 'Lightning', 'A bolt from a clear sky. Dry land burns.'],
  ['plague', 'Plague', 'Sickness among the most crowded animals there.'],
  ['mountain', 'Raise mountains', 'Lift the land where you click.'],
  ['flood', 'Flood', 'Raise the seas. Lowlands drown.'],
  ['iceage', 'Ice age', 'Drain the warmth from the world.'],
  ['heat', 'Heat wave', 'Set the air alight.'],
  ['generay', 'Gene ray', 'Scramble the genes of everything living there.'],
  ['shield', 'Shield dome', 'Keep disasters out of one region for three million years.'],
  ['monolith', 'Monolith', 'Animals living beside it grow clever.'],
  ['comet', 'Summon comet', 'Call a comet into the sky. Peoples will remember it.'],
  ['tilt', 'Tilt the axis', 'Change the seasons for good.'],
  ['life', 'Rain of life', 'Seed the world: start life early, or scatter every plant.'],
];

const DESIGN_GENES: [number, string, number][] = [
  [G.Size, 'size', 0.4], [G.LimbType, 'fins · legs · wings', 0.6], [G.LimbPairs, 'limb pairs', 0.5], [G.LimbLength, 'limb length', 0.5],
  [G.Neck, 'neck', 0.2], [G.Tail, 'tail', 0.4], [G.Horn, 'horns', 0.1], [G.Armor, 'armour', 0.1], [G.Water, 'water or land', 0.05],
  [G.Diet, 'plants or meat', 0.1], [G.Sociality, 'herding', 0.6], [G.Intelligence, 'intelligence', 0.15], [G.WarmBlood, 'warm blood', 0.3],
  [G.Hue, 'colour', 0.5], [G.Hue2, 'second colour', 0.1], [G.PatternType, 'pattern', 0.4], [G.Glow, 'glow', 0.1], [G.EyeCount, 'eyes', 0.34],
];

/** Design a species by hand, then click the planet to release it. */
export function Designer() {
  const s = useStore();
  const value = (gi: number, def: number) => s.design[gi] ?? def;
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Design a species</h2><button class={css.close} onClick={() => update({ panel: 'god', godTool: '' })}>✕</button></div>
      <div class={css.scroll}>
        {DESIGN_GENES.map(([gi, label, def]) => (
          <div class={css.row} key={gi} style={{ padding: '3px 0' }}>
            <span>{label}</span>
            <input type="range" min="0" max="1" step="0.01" value={value(gi, def)} onInput={(e) => update({ design: { ...s.design, [gi]: Number((e.target as HTMLInputElement).value) } })} />
          </div>
        ))}
        <div class={css.row}>
          <span class={css.sub}>{s.godTool === 'species' ? 'Now click the planet where it should live.' : 'Animals must already exist for a new one to survive.'}</span>
          <button class={css.btn} onClick={() => {
            const design: Record<number, number> = {};
            for (const [gi, , def] of DESIGN_GENES) design[gi] = value(gi, def);
            update({ design, godTool: s.godTool === 'species' ? '' : 'species' });
          }}>{s.godTool === 'species' ? 'cancel' : 'release'}</button>
        </div>
      </div>
    </div>
  );
}

/** A slice through the world under the camera: rock layers, sea, ice, roots and caves. */
export function CrossSection() {
  const s = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => { if (ref.current) actions.drawSection(ref.current); };
    draw();
    const t = window.setInterval(draw, 700);
    return () => window.clearInterval(t);
  }, []);
  void s;
  return (
    <div class={`${css.panel} ${css.side} ${css.wide}`} style={{ bottom: 'auto' }}>
      <div class={css.head}><h2>Cross-section</h2><span class={css.sub}>the ground under the centre of the view, west to east</span><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div style={{ padding: '0 14px 14px' }}><canvas ref={ref} width={720} height={300} style={{ width: '100%', borderRadius: 8, display: 'block' }} /></div>
    </div>
  );
}

/** Flat map of the whole world. Click anywhere to fly there. */
export function FlatMap() {
  const s = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => { if (ref.current) actions.drawMap(ref.current); };
    draw();
    const t = window.setInterval(draw, 1500);
    return () => window.clearInterval(t);
  }, [s.overlay]);
  return (
    <div class={`${css.panel} ${css.side} ${css.wide}`} style={{ bottom: 'auto' }}>
      <div class={css.head}><h2>Map of the world</h2><span class={css.sub}>click to fly there</span><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div style={{ padding: '0 14px 14px' }}>
        <canvas ref={ref} width={720} height={360} style={{ width: '100%', borderRadius: 8, cursor: 'crosshair', display: 'block' }}
          onClick={(e) => { const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); actions.mapClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }} />
      </div>
    </div>
  );
}


export function GodTools() {
  const s = useStore();
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>God tools</h2><button class={css.close} onClick={() => update({ panel: 'none', godTool: '' })}>✕</button></div>
      <div class={css.scroll}>
        <div class={css.row}>
          <span>Hands-off mode<br /><span class={css.sub}>Lock every tool and let the world run untouched.</span></span>
          <button class={css.btn} onClick={() => update({ handsOff: !s.handsOff, godTool: '' })}>{s.handsOff ? 'on' : 'off'}</button>
        </div>
        {!s.handsOff && GOD_TOOLS.map(([id, name, what]) => (
          <div class={css.row} key={id}>
            <span>{name}<br /><span class={css.sub}>{what}</span></span>
            <button class={css.btn} style={{ opacity: s.godTool === id ? 1 : 0.8 }} onClick={() => update({ godTool: s.godTool === id ? '' : id })}>{s.godTool === id ? 'cancel' : 'aim'}</button>
          </div>
        ))}
        {!s.handsOff && (
          <div class={css.row}>
            <span>Design a species<br /><span class={css.sub}>Shape a creature and set it down.</span></span>
            <button class={css.btn} onClick={() => update({ panel: 'designer' })}>open</button>
          </div>
        )}
        {s.godTool && <p class={css.sub}>Click a spot on the planet to use it there.</p>}
      </div>
    </div>
  );
}

/** Field guide: a card for every living species, and a memorial for those that are gone. */
export function Guide() {
  const s = useStore();
  const all = [...s.species.values()];
  const living = all.filter((x) => x.extinctYear < 0).sort((a, b) => b.pop - a.pop);
  const gone = all.filter((x) => x.extinctYear >= 0 && x.peakPop > 2e4).sort((a, b) => b.extinctYear - a.extinctYear).slice(0, 80);
  const lastWords = (id: number) => {
    for (let i = s.chronicle.length - 1; i >= 0; i--) {
      const e = s.events[s.chronicle[i]!]!;
      if (e.type === 'extinction' && e.speciesIds?.[0] === id) return e;
    }
    return undefined;
  };
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Field guide</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        {living.length === 0 && <p class={css.sub}>No animals yet.</p>}
        {living.map((sp) => (
          <button key={sp.id} onClick={() => actions.selectSpecies(sp.id)} style={{ display: 'block', width: '100%', textAlign: 'left', margin: '0 0 12px', padding: '10px 12px 9px', border: 'none', borderRadius: '5px', cursor: 'pointer', background: '#efe6d2', color: '#3a2e24', boxShadow: '0 1px 6px rgba(0,0,0,0.35)', fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif" }}>
            <CreatureSketch genes={sp.genes} width={236} seed={sp.id + 1} />
            <div style={{ fontStyle: 'italic', fontSize: '17px', marginTop: '6px', borderTop: '1px solid rgba(58,46,36,0.3)', paddingTop: '5px' }}>{sp.name}</div>
            <div style={{ fontSize: '13px', lineHeight: 1.3 }}>{describe(sp)} {metres(sp.metres)}, {bigNumber(sp.pop)} alive.</div>
          </button>
        ))}
        {gone.length > 0 && <div class={css.sub} style={{ margin: '14px 0 4px' }}>IN MEMORY</div>}
        {gone.map((sp) => {
          const e = lastWords(sp.id);
          return (
            <button class={css.entry} key={sp.id} onClick={() => (e ? update({ whyEvent: e.id }) : actions.selectSpecies(sp.id))} style={{ color: '#8f8a9a' }}>
              <i class={css.dot} />
              <div class={css.what} style={{ color: '#cfc9bd', fontStyle: 'italic' }}>{sp.name} †</div>
              <div class={css.when} style={{ color: '#ece7db' }}>{shortYear(sp.bornYear)} to {shortYear(sp.extinctYear)}. Lasted {shortYear(sp.extinctYear - sp.bornYear)}.</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The peoples of the world: every settlement, its size, and what it believes. */
const css3 = (c: [number, number, number], k = 1): string => `rgb(${c.map((v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v * k)), 1 / 2.2))).join(',')})`;

/** A nation's flag: a simple geometric design in its two colours. */
export function EmblemSvg({ nation, size = 22 }: { nation: Nation; size?: number }) {
  const a = css3(nation.signature, 0.85), b = css3(nation.accent, 0.8), ink = '#f4efe2';
  const e = nation.emblem;
  const W = 30, H = 20;
  const star = (cx: number, cy: number, r: number, n: number) => Array.from({ length: n * 2 }, (_, i) => { const rr = i % 2 ? r * 0.45 : r, t = (i * Math.PI) / n - Math.PI / 2; return `${cx + Math.cos(t) * rr},${cy + Math.sin(t) * rr}`; }).join(' ');
  return (
    <svg width={size * 1.5} height={size} viewBox={`0 0 ${W} ${H}`} style={{ borderRadius: 2, boxShadow: '0 0 0 1px rgba(255,255,255,0.25)', flex: 'none' }}>
      <rect width={W} height={H} fill={a} />
      {e.division === 1 && <rect x={W / 2} width={W / 2} height={H} fill={b} />}
      {e.division === 2 && <rect y={H / 2} width={W} height={H / 2} fill={b} />}
      {e.division === 3 && <polygon points={`0,${H} ${W},0 ${W},${H}`} fill={b} />}
      {e.division === 4 && <><rect x={W / 2} width={W / 2} height={H / 2} fill={b} /><rect y={H / 2} width={W / 2} height={H / 2} fill={b} /></>}
      {e.division === 5 && <rect x={2.5} y={2.5} width={W - 5} height={H - 5} fill="none" stroke={b} stroke-width={2.5} />}
      {e.charge === 0 && <circle cx={W / 2} cy={H / 2} r={4.5} fill={ink} />}
      {e.charge === 1 && <circle cx={W / 2} cy={H / 2} r={4.5} fill="none" stroke={ink} stroke-width={1.8} />}
      {e.charge === 2 && <polygon points={star(W / 2, H / 2, 6, e.points)} fill={ink} />}
      {e.charge === 3 && <polygon points={`${W / 2},4 ${W / 2 + 6},15 ${W / 2 - 6},15`} fill={ink} />}
      {e.charge === 4 && <polygon points={`${W / 2},3.5 ${W / 2 + 5.5},10 ${W / 2},16.5 ${W / 2 - 5.5},10`} fill={ink} />}
      {e.charge === 5 && <path d={`M ${W / 2 + 2} 4 A 6 6 0 1 0 ${W / 2 + 2} 16 A 4.6 4.6 0 1 1 ${W / 2 + 2} 4`} fill={ink} />}
      {e.charge === 6 && <>{[-6, 0, 6].map((dx) => <circle cx={W / 2 + dx} cy={H / 2} r={1.9} fill={ink} />)}</>}
      {e.charge === 7 && <rect x={5} y={H / 2 - 1.6} width={W - 10} height={3.2} fill={ink} />}
    </svg>
  );
}

/** Names and emblems of nations floating over their capitals while the Night Map is on. */
export function NationLabels() {
  const s = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const top = [...s.nations].sort((a, b) => b.pop - a.pop).slice(0, 14);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const host = ref.current;
      if (host) {
        for (let i = 0; i < host.children.length; i++) {
          const el = host.children[i] as HTMLElement;
          const n = top[i];
          if (!n) continue;
          const [x, y, vis] = actions.project(n.dir[0], n.dir[1], n.dir[2]);
          el.style.opacity = String(vis);
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -130%)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {top.map((n) => (
        <div key={n.capital} style={{ position: 'absolute', left: 0, top: 0, opacity: 0, display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap', fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", fontSize: `${Math.round(15 + Math.min(9, Math.log10(1 + n.pop) * 2.2))}px`, letterSpacing: '0.06em', color: '#f4efe2', textShadow: '0 1px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)', transition: 'opacity 0.4s' }}>
          <EmblemSvg nation={n} size={15} />
          <span>{n.name}</span>
        </div>
      ))}
    </div>
  );
}

/** An individual's family as a small tree: grandparents, parents, itself among its siblings, and its young. Relatives that are out there in the world can be clicked. */
function FamilyTreeView({ creature }: { creature: number }) {
  const t = actions.familyTree(creature);
  if (!t) return <div class={css.sub}>out of sight</div>;
  const person = (r: Relative, strong = false) => (
    r.key !== null
      ? <button key={`${r.name}${r.key}`} class={css.link} style={{ margin: '0 3px', fontWeight: strong ? 700 : 400 }} onClick={() => actions.selectCreatureKey(r.key!)}>{r.name}</button>
      : <span key={r.name} style={{ margin: '0 4px', opacity: 0.75, fontWeight: strong ? 700 : 400 }}>{r.name}</span>
  );
  const row = (label: string, people: preact.JSX.Element[]) => (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', margin: '1px 0' }}><span class={css.sub} style={{ width: '5.2em', flex: 'none' }}>{label}</span><span style={{ lineHeight: 1.35 }}>{people}</span></div>
  );
  return (
    <div>
      {row('grandparents', t.grandparents.map((n) => person({ name: n, key: null })))}
      {row('parents', t.parents.map((n) => person({ name: n, key: null })))}
      {row('this one', [<b key="self" style={{ margin: '0 4px' }}>{t.self}</b>])}
      {t.siblings.length > 0 && row('siblings', t.siblings.map((r) => person(r)))}
      {t.young.length > 0 && row('young', t.young.map((r) => person(r)))}
    </div>
  );
}

/** The whole history as a thin strip: great events as ticks, rewind points as diamonds you can jump back to. */
export function TimelineStrip() {
  const s = useStore();
  const now = s.stats?.simYear ?? 0;
  if (now < 1e6) return null;
  const events = s.chronicle.map((id) => s.events[id]!).filter((e) => e && e.importance >= 2);
  // keep the strip readable: at most a hundred ticks, the most important first
  const shown = events.length > 100 ? [...events].sort((a, b) => b.importance - a.importance || b.simYear - a.simYear).slice(0, 100) : events;
  const x = (year: number) => `${Math.max(0, Math.min(100, (year / now) * 100)).toFixed(2)}%`;
  return (
    <div class={css.panel} style={{ position: 'absolute', left: '50%', bottom: '64px', transform: 'translateX(-50%)', width: 'min(720px, 86vw)', height: '22px', padding: '0 10px', pointerEvents: 'auto' }}>
      <div style={{ position: 'relative', height: '100%' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '10px', height: '1px', background: 'rgba(236,231,219,0.28)' }} />
        {shown.map((e) => (
          <button key={e.id} title={`${formatYear(e.simYear)}: ${e.title}`} onClick={() => update({ whyEvent: e.id })}
            style={{ position: 'absolute', left: x(e.simYear), top: e.importance >= 3 ? '3px' : '6px', width: '3px', height: e.importance >= 3 ? '15px' : '9px', marginLeft: '-1px', padding: 0, border: 'none', borderRadius: '1px', cursor: 'pointer', background: eventColor(e.type), opacity: e.importance >= 3 ? 1 : 0.7 }} />
        ))}
        {s.timeline.map((t) => (
          <button key={`r${t.index}`} title={`Rewind to ${formatYear(t.simYear).toLowerCase()}: ${t.title}`} onClick={() => { if (confirm(`Rewind to ${formatYear(t.simYear).toLowerCase()} (${t.title})? Everything after it will be lost.`)) actions.rewind(t.index); }}
            style={{ position: 'absolute', left: x(t.simYear), top: '5px', width: '9px', height: '9px', marginLeft: '-5px', padding: 0, border: '1px solid #ece7db', background: '#11141c', transform: 'rotate(45deg)', cursor: 'pointer' }} />
        ))}
        {s.other && <div title="The timeline forked here" style={{ position: 'absolute', left: x(s.other.forkedAt), top: 0, bottom: 0, width: '1px', background: '#9fd0ff' }} />}
      </div>
    </div>
  );
}

/** Two futures from one fork, side by side: this world and the one that took another road. */
export function Futures() {
  const s = useStore();
  const o = s.other;
  if (!o) return null;
  const a = s.stats, b = o.stats;
  const cell = (v: string) => <b style={{ fontWeight: 400 }}>{v}</b>;
  const line = (label: string, f: (w: NonNullable<typeof a>) => string) => (<><span class={css.sub}>{label}</span>{cell(a ? f(a) : '')}{cell(b ? f(b) : '...')}</>);
  return (
    <div class={css.panel} style={{ position: 'absolute', left: '16px', top: '120px', width: '300px', padding: '12px 14px', pointerEvents: 'auto' }}>
      <div class={css.sub} style={{ marginBottom: '6px' }}>TWO FUTURES, FORKED {formatYear(o.forkedAt).toUpperCase()}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '6.2em 1fr 1fr', gap: '2px 8px', fontSize: '13px' }}>
        <span /><span class={css.sub}>this one</span><span class={css.sub}>the other</span>
        {line('year', (w) => shortYear(w.simYear))}
        {line('species', (w) => String(w.livingSpecies))}
        {line('animals', (w) => bigNumber(w.population))}
        {line('mean temp', (w) => `${w.meanTemp.toFixed(1)} °C`)}
        {line('ice', (w) => `${(w.iceFraction * 100).toFixed(0)}%`)}
        {line('settlements', (w) => String(w.settlements))}
      </div>
      {o.events.length > 0 && <div class={css.sub} style={{ margin: '8px 0 2px' }}>IN THE OTHER FUTURE</div>}
      {o.events.slice(-4).map((e) => <div key={e.id} style={{ fontSize: '13px', lineHeight: 1.3, margin: '2px 0' }}><span class={css.sub}>{shortYear(e.simYear)}</span> {e.title}</div>)}
      <div style={{ marginTop: '9px' }}>
        <button class={css.link} onClick={() => actions.crossOver()}>cross over to it</button>
        <button class={css.link} onClick={() => actions.endOtherFuture()}>end the other future</button>
      </div>
    </div>
  );
}

export function Peoples() {
  const s = useStore();
  const live = s.settlements.filter((x) => x.ruined < 0).sort((a, b) => b.tech * 10 + Math.log(b.pop + 1) - (a.tech * 10 + Math.log(a.pop + 1))).slice(0, 60);
  const ruins = s.settlements.filter((x) => x.ruined >= 0).slice(-20).reverse();
  const kind = (t: number) => (t >= 0.9 ? 'great city' : t >= 0.6 ? 'city' : t >= 0.3 ? 'village' : 'camp');
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Peoples</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        {s.settlements.length === 0 && <p class={css.sub}>No one has lit a fire yet. In some worlds, no one ever does.</p>}
        {s.nations.length > 0 && <div class={css.sub} style={{ margin: '4px 0 6px' }}>NATIONS</div>}
        {[...s.nations].sort((a, b) => b.pop - a.pop).slice(0, 24).map((n) => {
          const cap = s.settlements.find((x) => x.id === n.capital);
          const sp = s.species.get(n.species);
          return (
            <div key={`n${n.capital}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '0 0 9px' }}>
              <EmblemSvg nation={n} size={24} />
              <div style={{ minWidth: 0 }}>
                <div class={css.what} style={{ color: '#ece7db' }}>{n.name}</div>
                <div class={css.when} style={{ color: '#cfc9bd' }}>{n.members.length} {n.members.length === 1 ? 'settlement' : 'settlements'}, {bigNumber(n.pop * 1000)} {sp ? sp.name : 'people'}. Capital: {cap ? cap.name : 'unknown'}. <span style={{ color: css3(n.color, 1.1) }}>●</span> its lights</div>
                {(() => {
                  // what the simulation knows of this nation: its age, its ruler and the house that ruler belongs to
                  const realm = s.realms.find((r) => r.ended < 0 && r.capital === n.capital) ?? s.realms.find((r) => r.ended < 0 && r.name === n.name);
                  if (!realm) return null;
                  const year = s.stats?.simYear ?? 0;
                  return (
                    <div class={css.when} style={{ color: '#a9a498' }}>
                      {realm.eraName}. {realm.ruler} of the {realm.house} has ruled {Math.max(1, Math.round(year - realm.rulerSince)).toLocaleString('en-US')} {Math.round(year - realm.rulerSince) === 1 ? 'year' : 'years'} ({realm.houseReigns} {realm.houseReigns === 1 ? 'reign' : 'reigns'} of that house). Founded {Math.round(year - realm.founded).toLocaleString('en-US')} years ago. They speak {realm.language}.
                    </div>
                  );
                })()}
              </div>
              {cap && <button class={css.link} style={{ marginLeft: 'auto' }} onClick={() => { actions.setOverlay('nations'); actions.flyToCell(cap.cell, 1.2); }}>map</button>}
            </div>
          );
        })}
        {s.nations.length > 0 && <div class={css.sub} style={{ margin: '12px 0 4px' }}>SETTLEMENTS</div>}
        {live.map((st) => {
          const sp = s.species.get(st.species);
          const belief = s.events[st.belief];
          return (
            <div class={css.entry} key={st.id} style={{ color: '#ffcf8a', cursor: 'default' }}>
              <i class={css.dot} />
              <div class={css.what} style={{ color: '#ece7db' }}>{st.name}</div>
              <div class={css.when} style={{ color: '#ece7db' }}>A {kind(st.tech)} of {bigNumber(st.pop * 1000)} {sp ? sp.name : 'people'}, founded {formatYear(st.founded).toLowerCase()}.</div>
              {belief && <div class={css.when} style={{ color: '#ece7db' }}>Its faith remembers: {belief.title.toLowerCase()}.</div>}
              <button class={css.link} onClick={() => actions.flyToCell(st.cell, 0.25)}>fly there</button>
              {st.eventId >= 0 && <button class={css.link} onClick={() => update({ whyEvent: st.eventId })}>its story</button>}
              {belief && <button class={css.link} onClick={() => update({ whyEvent: st.belief })}>its faith</button>}
            </div>
          );
        })}
        {ruins.length > 0 && <div class={css.sub} style={{ margin: '14px 0 4px' }}>RUINS</div>}
        {ruins.map((st) => (
          <div class={css.entry} key={st.id} style={{ color: '#b9a48c', cursor: 'default' }}>
            <i class={css.dot} />
            <div class={css.what} style={{ color: '#cfc9bd' }}>{st.name}</div>
            <div class={css.when} style={{ color: '#ece7db' }}>Abandoned {formatYear(st.ruined).toLowerCase()}.</div>
            <button class={css.link} onClick={() => actions.flyToCell(st.cell, 0.25)}>visit the ruins</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Spark({ label, values, color, format }: { label: string; values: number[]; color: string; format: (n: number) => string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const W = 330, H = 54;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 4 - ((v - min) / Math.max(1e-9, max - min)) * (H - 8)}`).join(' ');
  return (
    <div style={{ marginBottom: 12 }}>
      <div class={css.row} style={{ padding: 0 }}><span>{label}</span><span class={css.sub}>{format(values[values.length - 1]!)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}><polyline points={pts} fill="none" stroke={color} stroke-width="1.6" style={{ filter: `drop-shadow(0 0 3px ${color})` }} /></svg>
    </div>
  );
}

export function Graphs() {
  const s = useStore();
  const h = s.history;
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>The long view</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        {h.length < 2 && <p class={css.sub}>Graphs fill in as time passes.</p>}
        <Spark label="Mean temperature" values={h.map((x) => x.temp)} color="#ffb26b" format={(n) => `${n.toFixed(1)} °C`} />
        <Spark label="Oxygen" values={h.map((x) => x.oxygen * 100)} color="#a8e6ff" format={(n) => `${n.toFixed(1)}%`} />
        <Spark label="Plant cover on land" values={h.map((x) => x.land * 100)} color="#b7e07a" format={(n) => `${n.toFixed(1)}%`} />
        <Spark label="Living animal species" values={h.map((x) => x.species)} color="#8fe3a0" format={(n) => n.toFixed(0)} />
        <Spark label="Arms race: plant toxins" values={h.map((x) => x.toxin * 100)} color="#d58cff" format={(n) => `${n.toFixed(0)}%`} />
        <Spark label="Arms race: animal resistance" values={h.map((x) => x.resist * 100)} color="#ff9d9d" format={(n) => `${n.toFixed(0)}%`} />
        <Spark label="Animals alive (log scale)" values={h.map((x) => Math.log10(x.pop + 1))} color="#e9e4d8" format={(n) => bigNumber(Math.pow(10, n))} />
      </div>
    </div>
  );
}

export function Settings() {
  const s = useStore();
  const qualities: UIState['quality'][] = ['low', 'medium', 'high', 'ultra'];
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>World and settings</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        <div class={css.row}><span>Seed code<br /><span class={css.sub}>{s.seed}</span></span><button class={css.btn} onClick={() => actions.copySeedLink()}>copy link</button></div>
        <div class={css.row}><span>Start a new world</span><button class={css.btn} onClick={() => actions.newWorld()}>new seed</button></div>
        <div class={css.sub} style={{ margin: '12px 0 2px' }}>SAVED PLANETS (autosaves every 2 minutes)</div>
        {s.slots.map((sl) => (
          <div class={css.row} key={sl.slot}>
            <span>{sl.name}<br /><span class={css.sub}>{sl.seed} · {formatYear(sl.simYear).toLowerCase()}</span></span>
            <span>
              <button class={css.btn} onClick={() => actions.loadSlot(sl.slot)}>load</button>{' '}
              <button class={css.btn} onClick={() => actions.deleteSlot(sl.slot)}>✕</button>
            </span>
          </div>
        ))}
        {s.slots.length < 10 && (
          <div class={css.row}>
            <span>Save this planet</span>
            <button class={css.btn} onClick={() => actions.saveSlot(`${s.seed}, ${formatYear(s.stats?.simYear ?? 0).toLowerCase()}`)}>save</button>
          </div>
        )}
        <div class={css.sub} style={{ margin: '12px 0 2px' }}>SETTINGS</div>
        <div class={css.row}>
          <span>Quality</span>
          <span>{qualities.map((q) => <button class={css.btn} style={{ marginLeft: 4, opacity: s.quality === q ? 1 : 0.55 }} onClick={() => actions.setQuality(q)}>{q}</button>)}</span>
        </div>
        <div class={css.row}>
          <span>Music</span>
          <input type="range" min="0" max="1" step="0.05" value={s.musicVolume} onInput={(e) => actions.setMusicVolume(Number((e.target as HTMLInputElement).value))} />
        </div>
        <div class={css.row}>
          <span>Sound</span>
          <input type="range" min="0" max="1" step="0.05" value={s.soundVolume} onInput={(e) => actions.setSoundVolume(Number((e.target as HTMLInputElement).value))} />
        </div>
        <div class={css.row}><span>Slow down on big events</span><button class={css.btn} onClick={() => actions.setSlowOnEvents(!s.slowOnEvents)}>{s.slowOnEvents ? 'on' : 'off'}</button></div>
        <div class={css.row}><span>Documentary director<br /><span class={css.sub}>The camera flies to whatever just happened.</span></span><button class={css.btn} onClick={() => update({ director: !s.director })}>{s.director ? 'on' : 'off'}</button></div>
        <div class={css.row}><span>Colour-blind safe overlays</span><button class={css.btn} onClick={() => actions.setColorblind(!s.colorblind)}>{s.colorblind ? 'on' : 'off'}</button></div>
        <div class={css.row}>
          <span>Overlay (O)</span>
          <span>{(['none', 'temp', 'rain', 'life', 'people', 'fossils', 'nations', 'fungal', 'diversity', 'oxygen'] as const).map((o) => <button class={css.btn} style={{ marginLeft: 4, opacity: s.overlay === o ? 1 : 0.55 }} onClick={() => actions.setOverlay(o)}>{o}</button>)}</span>
        </div>
        <div class={css.sub} style={{ margin: '12px 0 2px' }}>CAMERA AND KEEPSAKES</div>
        <div class={css.row}>
          <span>Photo filter</span>
          <span>{['none', 'vivid', 'faded', 'sepia', 'noir'].map((f) => <button class={css.btn} style={{ marginLeft: 4, opacity: s.photoFilter === f ? 1 : 0.55 }} onClick={() => actions.setPhotoFilter(f)}>{f}</button>)}</span>
        </div>
        <div class={css.row}><span>Save a photo</span><button class={css.btn} onClick={() => actions.savePhoto()}>save PNG</button></div>
        <div class={css.row}><span>Record video</span><button class={css.btn} onClick={() => actions.toggleRecording()}>{s.recording ? 'stop and save' : 'record'}</button></div>
        <div class={css.row}><span>Save a GIF<br /><span class={css.sub}>Three seconds of the view, looping.</span></span><button class={css.btn} onClick={() => actions.saveGif()}>save GIF</button></div>
        <div class={css.row}><span>History of this planet<br /><span class={css.sub}>An illustrated book, saved as a PDF.</span></span><button class={css.btn} onClick={() => actions.exportBook()}>make book</button></div>
        <div class={css.row}><span>Fork the timeline here<br /><span class={css.sub}>On a desktop this starts a second future running beside this one; you can compare them and cross over. It is also kept as a rewind point.</span></span><button class={css.btn} onClick={() => actions.fork()}>fork</button></div>
        {s.timeline.length > 0 && <div class={css.sub} style={{ margin: '12px 0 2px' }}>REWIND TO</div>}
        {s.timeline.map((t) => (
          <div class={css.row} key={t.index}><span>{t.title}<br /><span class={css.sub}>{formatYear(t.simYear).toLowerCase()}</span></span><button class={css.btn} onClick={() => actions.rewind(t.index)}>rewind</button></div>
        ))}
        <div class={css.row}><span>Reduced motion</span><button class={css.btn} onClick={() => actions.setReducedMotion(!s.reducedMotion)}>{s.reducedMotion ? 'on' : 'off'}</button></div>
      </div>
    </div>
  );
}

export function closeAll(): void {
  actions.followCreature(false);
  update({ panel: 'none', whyEvent: -1, selectedSpecies: -1, godTool: '', creature: null });
}
void state;
