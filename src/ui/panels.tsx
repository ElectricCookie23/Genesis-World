import { useEffect, useRef, useState } from 'preact/hooks';
import { G, GENE_NAMES } from '../sim/genetics';
import type { SimEvent } from '../sim/events';
import type { SpeciesInfo } from '../shared/protocol';
import { actions, state, update, useStore } from './store';
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

/** The tree of life: time runs left to right, every species is a glowing branch. */
export function Tree() {
  const s = useStore();
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
    ['P', 'postcard mode'], ['H', 'hide the interface'], ['Esc', 'close panels'], ['?', 'this list'],
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

export function GodTools() {
  const s = useStore();
  return (
    <div class={`${css.panel} ${css.side}`} style={{ bottom: 'auto' }}>
      <div class={css.head}><h2>God tools</h2><button class={css.close} onClick={() => update({ panel: 'none', godTool: '' })}>✕</button></div>
      <div class={css.scroll}>
        <div class={css.row}>
          <span><b style={{ fontWeight: 400 }}>Meteor</b><br /><span class={css.sub}>Shockwave, crater, impact winter.</span></span>
          <button class={css.btn} onClick={() => update({ godTool: s.godTool === 'meteor' ? '' : 'meteor' })}>{s.godTool === 'meteor' ? 'cancel' : 'aim'}</button>
        </div>
        {s.godTool === 'meteor' && <p class={css.sub}>Click a spot on the planet to strike it.</p>}
      </div>
    </div>
  );
}

export function Settings() {
  const s = useStore();
  return (
    <div class={`${css.panel} ${css.side}`} style={{ bottom: 'auto' }}>
      <div class={css.head}><h2>World</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        <div class={css.row}><span>Seed code<br /><span class={css.sub}>{s.seed}</span></span><button class={css.btn} onClick={() => actions.copySeedLink()}>copy link</button></div>
        <div class={css.row}><span>Slow down on big events</span><button class={css.btn} onClick={() => actions.setSlowOnEvents(!s.slowOnEvents)}>{s.slowOnEvents ? 'on' : 'off'}</button></div>
        <div class={css.row}><span>Start a new world</span><button class={css.btn} onClick={() => actions.newWorld()}>new seed</button></div>
      </div>
    </div>
  );
}

export function closeAll(): void {
  update({ panel: 'none', whyEvent: -1, selectedSpecies: -1, godTool: '' });
}
void state;
