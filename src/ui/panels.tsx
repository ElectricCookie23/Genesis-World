import { useEffect, useRef, useState } from 'preact/hooks';
import type { Nation } from '../render/gfx/nations';
import { CreatureSketch } from './sketch';
import { ART_NAMES, Portrait, artStyle } from './portrait';
import { G, GENE_NAMES, HUNTER_DIET } from '../sim/genetics';
import type { SimEvent } from '../sim/events';
import type { NationInfo, PersonInfo, SettlementInfo, SpeciesInfo, WonderInfo } from '../shared/protocol';
import { dateIn } from '../sim/history/calendar';
import { describeRuin } from '../sim/history/decay';
import { CALAMITIES, REBUILDS, describeScar } from '../sim/history/calamity';
import { Written, wearAt } from './glyphs';
import { actions, state, update, useStore, type Relative, type UIState } from './store';
import { ERAS } from '../sim/history/eras';
import { bigNumber, eventColor, eventGlyph, formatYear, hsl, metres, shortYear } from './format';
import { Strata } from './strange';
import { canUndo } from './memory';
import css from './ui.module.css';

/** The date of an event in the count of years of the nation it belongs to, when the page knows that nation (system E8). */
function localDate(realms: NationInfo[], e: SimEvent): string {
  const id = e.data?.nation;
  if (typeof id !== 'number') return '';
  const r = realms.find((x) => x.id === id);
  return r && r.calendar ? dateIn({ name: r.calendar, epoch: r.calendarEpoch }, e.simYear) : '';
}

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
              <div class={css.when} style={{ color: '#ece7db' }}>{formatYear(e.simYear)}{(() => { const own = localDate(s.realms, e); return own ? ` · ${own}` : ''; })()}</div>
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
                <div class={css.when}>{formatYear(e.simYear)}{(() => { const own = localDate(s.realms, e); return own ? ` · ${own}` : ''; })()}</div>
                <h3>{e.title}</h3>
                <p>{e.description}</p>
                {e.cellId >= 0 && <button class={css.link} onClick={() => actions.flyToCell(e.cellId)}>show place</button>}
                {canUndo(e.type) && <button class={css.link} onClick={() => actions.whatIf(e.id)}>what if this had not happened?</button>}
                {e.cellId >= 0 && e.importance >= 1 && <button class={css.link} onClick={() => actions.eyewitness(e.id)}>see it from the ground</button>}
                {(e.type === 'war' || e.type === 'civil-war') && <button class={css.link} onClick={() => actions.openBattle(e.id)}>the battle</button>}
                {(e.speciesIds ?? []).slice(0, 1).map((id) => s.species.has(id) && (
                  <button class={css.link} onClick={() => actions.selectSpecies(id)}>{s.species.get(id)!.name}</button>
                ))}
                {e.effects.length > 0 && i === 0 && <span class={css.sub}>led to {e.effects.length} later event{e.effects.length > 1 ? 's' : ''}</span>}
              </div>
            </div>
          </>
        ))}
        {chain.length === 1 && <p class={css.sub} style={{ marginLeft: '46px' }}>Nothing caused this. It is where a story begins.</p>}
      </div>
    </div>
  );
}

export function describe(sp: SpeciesInfo): string {
  const g = sp.genes;
  const size = sp.metres < 0.15 ? 'tiny' : sp.metres < 0.6 ? 'small' : sp.metres < 2 ? 'mid-sized' : sp.metres < 4.5 ? 'large' : 'giant';
  const diet = g[G.Diet]! > HUNTER_DIET ? 'hunter' : g[G.Diet]! < 0.3 ? 'grazer' : 'forager';
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
        {s.future?.origins[sp.id] && <><span>origin</span><b style={{ fontWeight: 400 }}>{s.future.origins[sp.id] === 'engineered' ? 'made by a people, not evolved' : s.future.origins[sp.id] === 'revived' ? 'brought back from extinction' : 'raised to a mind by another people'}</b></>}
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
      <div style={{ marginTop: '12px' }}>
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
      <div style={{ marginTop: '12px' }}>
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
        <svg class={css.tree} viewBox={`0 0 ${W} ${H}`} style={{ height: `${H}px` }}>
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
    ['Space', 'pause or play'], ['1 – 6', 'time speed'], ['C', 'chronicle'], ['T', 'tree of life'], ['G', 'experiments'], ['J', 'goals, if you want some'], ['S', 'the star system'], ['N', 'the microscope'], ['A', 'the record'], ['B', 'on the ground'],
    ['M', 'flat map'], ['X', 'cross-section'], ['U', 'dive under water'], ['V', 'first-person view while following'], ['O', 'overlays'], ['F', 'follow the selected creature'], ['P', 'postcard mode'], ['H', 'hide the interface'], ['Esc', 'close panels'], ['?', 'this list'],
  ];
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Controls</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        <div class={css.help}>{keys.map(([k, v]) => <><kbd>{k}</kbd><span>{v}</span></>)}</div>
        <p class={css.sub} style={{ marginTop: '14px' }}>Click any line in the chronicle to trace what caused it. Click a branch of the tree to meet that species.</p>
      </div>
    </div>
  );
}

/**
 * The experiment tools, by the kind of thing each one changes. Each is one change made to the world by hand, so that
 * what follows from it can be watched: [id, name, what it does].
 */
const TOOL_GROUPS: [string, string, [string, string, string][]][] = [
  ['Astronomical', 'the sky and the orbit', [
    ['meteor', 'Meteor', 'Shockwave, crater, impact winter.'],
    ['comet', 'Send a comet', 'Put a comet on a path past the world. Peoples will remember it.'],
    ['shatter', 'Break up the moon', 'The moon becomes a ring. Its shadow lays a cold stripe along the equator.'],
    ['rogue', 'Rogue planet', 'A wandering world passes through the system. The orbit shifts, the axis rocks, comets fall.'],
    ['burst', 'Gamma-ray burst', 'A dying star\'s beam strikes the side of the world you click.'],
    ['tilt', 'Tilt the axis', 'Change the seasons for good.'],
  ]],
  ['Geological', 'the rock and what lies under it', [
    ['mountain', 'Raise mountains', 'Lift the land where you click. Winds and rivers change with it.'],
    ['flip', 'Flip the magnetic poles', 'The field turns over. Auroras wander, travellers lose their way, more young are born changed.'],
  ]],
  ['Environmental', 'climate, sea and fire', [
    ['iceage', 'Cool the world', 'Take nine degrees out of the air. Ice spreads, seas fall.'],
    ['heat', 'Warm the world', 'Add nine degrees to the air. Ice melts, seas rise.'],
    ['flood', 'Raise the sea', 'Lowlands drown. What lives there must move.'],
    ['lightning', 'Wildfire', 'One bolt on dry land. See what grows back.'],
    ['shield', 'Sheltered region', 'A control: keep disasters out of one region for three million years.'],
  ]],
  ['Ecological', 'what lives where', [
    ['plague', 'Disease outbreak', 'Sickness among the most crowded animals there.'],
    ['life', 'Seed life', 'Start life early on a bare world, or scatter every plant across it.'],
  ]],
  ['Genetic', 'what is inherited', [
    ['generay', 'Radiation', 'Raise the rate of mutation in everything living there.'],
    ['monolith', 'Test of wits', 'Make food hard to reach in one region. The animals there are selected for cleverness.'],
  ]],
];

const DESIGN_GENES: [number, string, number][] = [
  [G.Size, 'size', 0.4], [G.LimbType, 'fins · legs · wings', 0.6], [G.LimbPairs, 'limb pairs', 0.5], [G.LimbLength, 'limb length', 0.5],
  [G.Neck, 'neck', 0.2], [G.Tail, 'tail', 0.4], [G.Horn, 'horns', 0.1], [G.Armor, 'armour', 0.1], [G.Water, 'water or land', 0.05],
  [G.Diet, 'plants or meat', 0.1], [G.Sociality, 'herding', 0.6], [G.Intelligence, 'intelligence', 0.15], [G.WarmBlood, 'warm blood', 0.3],
  [G.Hue, 'colour', 0.5], [G.Hue2, 'second colour', 0.1], [G.PatternType, 'pattern', 0.4], [G.Glow, 'glow', 0.1], [G.EyeCount, 'eyes', 0.34],
  // traits evolution seldom reaches by itself: here they can be chosen directly
  [G.Ornament, 'ornaments', 0.1], [G.ColorChange, 'colour change', 0.1], [G.Echo, 'echolocation', 0.1], [G.Electric, 'electric sense', 0.1],
  [G.Metamorphosis, 'larval stage', 0.1], [G.Metabolism, 'slow or fast metabolism', 0.3], [G.Nocturnal, 'day or night', 0.2], [G.Burrow, 'burrowing', 0.1],
];

/** Design a species by hand, then click the planet to release it. */
export function Designer() {
  const s = useStore();
  const value = (gi: number, def: number) => s.design[gi] ?? def;
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Design a species</h2><button class={css.close} onClick={() => update({ panel: 'tools', tool: '' })}>✕</button></div>
      <div class={css.scroll}>
        {DESIGN_GENES.map(([gi, label, def]) => (
          <div class={css.row} key={gi} style={{ padding: '3px 0' }}>
            <span>{label}</span>
            <input type="range" min="0" max="1" step="0.01" value={value(gi, def)} onInput={(e) => update({ design: { ...s.design, [gi]: Number((e.target as HTMLInputElement).value) } })} />
          </div>
        ))}
        <div class={css.row}>
          <span class={css.sub}>{s.tool === 'species' ? 'Now click the planet where it should live.' : 'Animals must already exist for a new one to survive.'}</span>
          <button class={css.btn} onClick={() => {
            const design: Record<number, number> = {};
            for (const [gi, , def] of DESIGN_GENES) design[gi] = value(gi, def);
            update({ design, tool: s.tool === 'species' ? '' : 'species' });
          }}>{s.tool === 'species' ? 'cancel' : 'release'}</button>
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
      <div style={{ padding: '0 14px 10px' }}><canvas ref={ref} width={720} height={300} style={{ width: '100%', borderRadius: '8px', display: 'block' }} /></div>
      <Strata />
    </div>
  );
}

/** Flat map of the whole world. Click anywhere to fly there. */
const MOVE_COLOUR: Record<string, string> = { ice: '#bfe6ff', sea: '#5fe0d0', famine: '#ffc56b' };

/** The latest migrations of peoples in the chronicle (system E9), newest last. */
export function recentMigrations(events: SimEvent[], limit = 8): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < limit && events.length - i < 6000; i--) {
    const e = events[i];
    if (e && e.type === 'migration' && typeof e.data?.from === 'number' && typeof e.data?.to === 'number') out.push(e);
  }
  return out.reverse();
}

/** The path of an arrow on the flat map between two points given as fractions of its size: a shallow arc, the short way round. */
export function arrowPath(a: [number, number], b: [number, number], W = 720, H = 360): string {
  let bu = b[0];
  if (bu - a[0] > 0.5) bu -= 1; else if (a[0] - bu > 0.5) bu += 1;
  const x0 = a[0] * W, y0 = a[1] * H, x1 = bu * W, y1 = b[1] * H;
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  // bow the line to one side so that two arrows between neighbours do not hide each other
  const bow = Math.min(40, len * 0.22);
  const cx = (x0 + x1) / 2 - (dy / len) * bow, cy = (y0 + y1) / 2 + (dx / len) * bow;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Marching arrows over the flat map, one for each recent migration: from the land a people left to where it settled. */
function MigrationArrows() {
  const s = useStore();
  const moves = recentMigrations(s.events);
  if (!moves.length) return null;
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="none" style={{ position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', borderRadius: '8px' }}>
      <defs>
        {Object.entries(MOVE_COLOUR).map(([k, c]) => <marker key={k} id={`mv-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={c} /></marker>)}
      </defs>
      {moves.map((e, i) => {
        const why = String(e.data!.cause ?? 'famine');
        const d = arrowPath(actions.mapPoint(Number(e.data!.from)), actions.mapPoint(Number(e.data!.to)));
        const colour = MOVE_COLOUR[why] ?? MOVE_COLOUR.famine!;
        return (
          <g key={e.id} style={{ pointerEvents: 'auto', cursor: 'pointer' }} opacity={0.45 + 0.55 * ((i + 1) / moves.length)} onClick={() => update({ whyEvent: e.id })}>
            <title>{`${e.title}: ${e.description}`}</title>
            <path d={d} fill="none" stroke="#000" stroke-width="5" opacity="0.4" />
            <path d={d} fill="none" stroke={colour} stroke-width="2.6" class={s.quality === 'low' ? undefined : css.march} marker-end={`url(#mv-${MOVE_COLOUR[why] ? why : 'famine'})`} />
          </g>
        );
      })}
    </svg>
  );
}

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
        <div style={{ position: 'relative' }}>
          <canvas ref={ref} width={720} height={360} style={{ width: '100%', borderRadius: '8px', cursor: 'crosshair', display: 'block' }}
            onClick={(e) => { const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); actions.mapClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }} />
          <MigrationArrows />
        </div>
        {recentMigrations(s.events).length > 0 && <div class={css.sub} style={{ margin: '6px 0 0' }}>Arrows: peoples on the move (<span style={{ color: MOVE_COLOUR.ice }}>driven by ice</span>, <span style={{ color: MOVE_COLOUR.sea }}>by the sea</span>, <span style={{ color: MOVE_COLOUR.famine }}>by hunger</span>). Click one to see why.</div>}
      </div>
    </div>
  );
}


export function Experiments() {
  const s = useStore();
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Experiments</h2><button class={css.close} onClick={() => update({ panel: 'none', tool: '' })}>✕</button></div>
      <div class={css.scroll}>
        <p class={css.sub} style={{ margin: '0 0 6px' }}>Change one thing and watch what follows from it. The chronicle records every change you make and traces its effects.</p>
        <div class={css.row}>
          <span>Hands-off mode<br /><span class={css.sub}>Lock every tool and let the world run untouched.</span></span>
          <button class={css.btn} onClick={() => update({ handsOff: !s.handsOff, tool: '' })}>{s.handsOff ? 'on' : 'off'}</button>
        </div>
        {!s.handsOff && TOOL_GROUPS.map(([group, about, tools]) => (
          <div key={group}>
            <div class={css.toolGroup}><b>{group}</b><span class={css.sub}>{about}</span></div>
            {tools.map(([id, name, what]) => (
              <div class={css.row} key={id}>
                <span>{name}<br /><span class={css.sub}>{what}</span></span>
                <button class={css.btn} style={{ opacity: s.tool === id ? 1 : 0.8 }} onClick={() => update({ tool: s.tool === id ? '' : id })}>{s.tool === id ? 'cancel' : 'aim'}</button>
              </div>
            ))}
            {group === 'Genetic' && (
              <div class={css.row}>
                <span>Design a species<br /><span class={css.sub}>Choose its traits, release it, and see whether it lasts.</span></span>
                <button class={css.btn} onClick={() => update({ panel: 'designer' })}>open</button>
              </div>
            )}
          </div>
        ))}
        {s.tool && <p class={css.sub}>Click a spot on the planet to use it there.</p>}
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

/** The peoples of the world: every settlement, its size, and the story it tells. */
const css3 = (c: [number, number, number], k = 1): string => `rgb(${c.map((v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v * k)), 1 / 2.2))).join(',')})`;

/** A nation's flag: a simple geometric design in its two colours. */
export function EmblemSvg({ nation, size = 22 }: { nation: Nation; size?: number }) {
  const a = css3(nation.signature, 0.85), b = css3(nation.accent, 0.8), ink = '#f4efe2';
  const e = nation.emblem;
  const W = 30, H = 20;
  const star = (cx: number, cy: number, r: number, n: number) => Array.from({ length: n * 2 }, (_, i) => { const rr = i % 2 ? r * 0.45 : r, t = (i * Math.PI) / n - Math.PI / 2; return `${cx + Math.cos(t) * rr},${cy + Math.sin(t) * rr}`; }).join(' ');
  return (
    <svg width={size * 1.5} height={size} viewBox={`0 0 ${W} ${H}`} style={{ borderRadius: '2px', boxShadow: '0 0 0 1px rgba(255,255,255,0.25)', flex: 'none' }}>
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
/** Where a name may sit relative to its capital, in order of preference: above, below, right, left (in half-widths and heights). */
const SPOTS: [number, number][] = [[0, -1], [0, 1], [1, 0], [-1, 0]];

export function NationLabels() {
  const s = useStore();
  const ref = useRef<HTMLDivElement>(null);
  // Every sizeable nation is a candidate; how many names show is decided each frame from what faces the viewer.
  // (With a fixed top fourteen, a world of ninety-five nations showed five names: the rest were on the far side.)
  const top = [...s.nations].sort((a, b) => b.pop - a.pop).slice(0, 72);
  useEffect(() => {
    let raf = 0;
    // Sizes are measured once per render, not every frame. Labels are placed largest nation first, and one that
    // would lie over a label already placed is left out: names used to pile on top of each other where capitals
    // stand close together.
    const sizes: [number, number][] = [];
    if (ref.current) for (let i = 0; i < ref.current.children.length; i++) { const el = ref.current.children[i] as HTMLElement; sizes.push([el.offsetWidth, el.offsetHeight]); }
    const placed: [number, number, number, number][] = [];
    const tick = () => {
      const host = ref.current;
      if (host) {
        placed.length = 0;
        const [discX, discY, discR] = actions.disc();
        for (let i = 0; i < host.children.length; i++) {
          const el = host.children[i] as HTMLElement;
          const n = top[i];
          if (!n) continue;
          const [x, y, vis] = actions.project(n.dir[0], n.dir[1], n.dir[2]);
          const [w, h] = sizes[i] ?? [120, 22];
          // A name may sit above its capital, below it, or to either side: whichever is free. With one fixed place, a
          // crowded archipelago of small countries showed a single name (2 names for 104 countries on a real GPU).
          let free = false, shift = SPOTS[0]!;
          if (vis > 0.02 && placed.length < 22) {
            for (const spot of SPOTS) {
              const cx = x + spot[0] * (w / 2 + 10), cy = y + spot[1] * h * 0.85;
              const x0 = cx - w / 2 - 5, y0 = cy - h / 2 - 2, x1 = cx + w / 2 + 5, y1 = cy + h / 2 + 2;
              // the whole name must lie on the planet: names hung in space beside the limb, pointing at ground seen edge-on
              if (discR < 4000 && Math.max(Math.hypot(x0 - discX, y0 - discY), Math.hypot(x1 - discX, y0 - discY), Math.hypot(x0 - discX, y1 - discY), Math.hypot(x1 - discX, y1 - discY)) > discR * 0.98) continue;
              let clear = true;
              for (const r of placed) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) { clear = false; break; }
              if (!clear) continue;
              placed.push([x0, y0, x1, y1]); free = true; shift = spot;
              break;
            }
          }
          el.style.opacity = free ? String(vis) : '0';
          el.style.transform = `translate(${(x + shift[0] * (w / 2 + 10)).toFixed(1)}px, ${(y + shift[1] * h * 0.85).toFixed(1)}px) translate(-50%, -50%)`;
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

const FIELD_COLOUR: Record<string, string> = {
  food: '#b8d77a', craft: '#e6b56a', build: '#cfc2a8', war: '#e2806f', trade: '#e9d36b', mind: '#9fc4f0', power: '#f0a04a', life: '#8fd9b6', sea: '#6fc7dc', sky: '#c3a6f2',
};
const ERA_NAMES = ['Age of Camps', 'Age of Fields', 'Age of Kilns', 'Age of Walls', 'Age of Sails', 'Age of Presses', 'Age of Engines', 'Age of Signals', 'Age of Orbit', 'Age Beyond'];

/** One nation's knowledge: the tech web era by era, and its rulers on record (expansion system E1). */
/** The kinds of network between towns (system E15), in the order of `NETWORKS` in the simulation. */
const NETWORK_NAMES = ['made roads', 'aqueducts', 'canals', 'railways', 'telegraph wires', 'pipelines', 'power lines'];
const listOf = (words: string[]): string => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0] ?? '');

const ROLE_LABEL: Record<string, string> = { ruler: 'Ruler', founder: 'Founder', inventor: 'Inventor', teller: 'Storyteller', reformer: 'Reformer', general: 'General', explorer: 'Explorer', artist: 'Artist', scholar: 'Scholar', consort: 'Consort', claimant: 'Claimant' };

/** The two strongest sides of a temperament, in plain words. */
function temperament(p: PersonInfo): string {
  const sides: [number, string][] = [
    [p.bold - 0.5, p.bold > 0.5 ? 'bold' : 'cautious'], [p.wise - 0.5, p.wise > 0.5 ? 'wise' : 'rash'],
    [p.cruel - 0.5, p.cruel > 0.5 ? 'cruel' : 'gentle'], [p.open - 0.5, p.open > 0.5 ? 'open to counsel' : 'stubborn'],
  ];
  return sides.filter((x) => Math.abs(x[0]) > 0.15).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 2).map((x) => x[1]).join(' and ');
}

/** One person on record: a portrait in the manner of their age, and what is known of the life. */
function PersonCard({ p, genes, year }: { p: PersonInfo; genes: Float32Array | undefined; year: number }) {
  const age = Math.max(1, Math.round((p.died >= 0 ? p.died : year) - p.born));
  const nature = temperament(p);
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '6px', border: '1px solid #ffffff1f', borderRadius: '6px', background: '#ffffff08', minWidth: 0 }}>
      {genes && <Portrait genes={genes} era={p.era} role={p.role} seed={p.id} bold={p.bold} cruel={p.cruel} width={70} />}
      <div style={{ minWidth: 0, font: '400 11.5px/1.35 system-ui, sans-serif', color: '#cfc9bd' }}>
        <div style={{ font: '600 13px/1.2 system-ui, sans-serif', color: '#f2eee4', overflowWrap: 'anywhere' }}>{p.name}</div>
        <div style={{ color: '#ffffff8c', margin: '1px 0 3px' }}>{ROLE_LABEL[p.role] ?? p.role}{p.house ? `, ${p.house}` : ''}</div>
        <div>{p.died >= 0 ? `Lived ${age} ${age === 1 ? 'year' : 'years'}; ${p.fate || 'died'}.` : `Living, ${age} ${age === 1 ? 'year' : 'years'} old.`}</div>
        {p.deed && <div style={{ overflowWrap: 'anywhere' }}>Remembered for: {p.deed}.</div>}
        {nature && <div>By nature {nature}.</div>}
        {(p.patron || p.rival) && <div style={{ overflowWrap: 'anywhere' }}>{p.patron ? `Served ${p.patron}` : ''}{p.patron && p.rival ? '; ' : ''}{p.rival ? `${p.patron ? 'r' : 'R'}ival of ${p.rival}` : ''}.</div>}
        <div style={{ color: '#ffffff66' }}>{capitalise(ART_NAMES[artStyle(p.era)]!)}</div>
      </div>
    </div>
  );
}

const capitalise = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

export function NationPanel() {
  const s = useStore();
  const d = s.nationDetail;
  const realm = d ? s.realms.find((r) => r.id === d.id) : undefined;
  const year = s.stats?.simYear ?? 0;
  const ago = (y: number) => `${Math.max(0, Math.round(year - y)).toLocaleString('en-US')} years ago`;
  return (
    <div class={`${css.panel} ${css.side}`} style={{ width: 'min(560px, 96vw)' }}>
      <div class={css.head}><h2>{d ? d.name : 'A nation'}</h2><button class={css.close} onClick={() => update({ panel: 'peoples' })}>✕</button></div>
      <div class={css.scroll}>
        {!d && <p class={css.sub}>Asking the archives.</p>}
        {d && realm && (
          <p class={css.sub} style={{ margin: '0 0 8px' }}>
            {realm.eraName} ({realm.eraOwn}{s.earthNotes ? `; ${realm.earth}` : ''}){realm.ended >= 0 ? ' (the nation is gone)' : ''}. {realm.calendar && realm.ended < 0 ? `${dateIn({ name: realm.calendar, epoch: realm.calendarEpoch }, year)} (sim year ${Math.floor(year).toLocaleString('en-US')}). ` : ''}{d.tech.filter((t) => t.state === 1).length} of {d.tech.filter((t) => t.state !== 2).length} things its land allows are known.
            {' '}Its land offers {d.land.length ? d.land.join(', ') : 'little'}{d.land.includes('ore') ? '' : '; no ore, so no metal'}.
            {' '}Its people are the {realm.culture} and speak <button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.openLanguages(realm.language)}>{realm.language}</button>.
            {realm.script && realm.signs && <>{' '}In the {realm.script.name} its name is written <Written meanings={realm.signs} script={realm.script} wear={wearAt(realm.script, year)} size={20} rosetta={s.rosetta} />.</>}
          </p>
        )}
        {d && ERA_NAMES.map((era, e) => {
          const cells = d.tech.filter((t) => t.era === e);
          if (!cells.length) return null;
          return (
            <div key={era} style={{ margin: '0 0 10px' }}>
              <div class={css.sub} style={{ margin: '0 0 4px', letterSpacing: '0.08em' }}>{era.toUpperCase()}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {cells.map((t) => (
                  <span
                    key={t.slot}
                    title={t.state === 1 ? `${t.name}: "${t.own.toLowerCase()}" in their tongue, discovered ${ago(t.year)}` : t.state === 2 ? `${t.name}: nothing in their land makes this possible` : `${t.name}: not yet discovered`}
                    style={{
                      font: '500 11px/1.2 system-ui, sans-serif', padding: '3px 7px', borderRadius: '10px', whiteSpace: 'nowrap',
                      border: `1px solid ${t.state === 1 ? FIELD_COLOUR[t.field] : '#ffffff26'}`,
                      background: t.state === 1 ? `${FIELD_COLOUR[t.field]}2e` : 'transparent',
                      color: t.state === 1 ? '#f2eee4' : '#ffffff66', textDecoration: t.state === 2 ? 'line-through' : 'none', fontWeight: t.key ? 700 : 500,
                    }}
                  >{t.name}</span>
                ))}
              </div>
            </div>
          );
        })}
        {d && (
          <div class={css.sub} style={{ margin: '2px 0 10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {Object.entries(FIELD_COLOUR).map(([f, c]) => <span key={f}><span style={{ color: c }}>●</span> {f}</span>)}
          </div>
        )}
        {d && d.people.length > 0 && <div class={css.sub} style={{ margin: '8px 0 6px', letterSpacing: '0.08em' }}>PEOPLE ON RECORD</div>}
        {d && d.people.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))', gap: '8px', margin: '0 0 10px' }}>
            {d.people.slice(0, s.quality === 'low' ? 8 : 24).map((p) => <PersonCard key={p.id} p={p} genes={s.species.get(d.species)?.genes} year={year} />)}
          </div>
        )}
        {d && d.people.length <= 2 && d.rulers.length > 1 && <p class={css.sub}>Generals, reformers, storytellers, explorers, artists and scholars are recorded only while time runs at the pace of history or slower.</p>}
        {d && d.houses.length > 0 && <div class={css.sub} style={{ margin: '8px 0 4px', letterSpacing: '0.08em' }}>RULING HOUSES</div>}
        {d && d.houses.slice(0, 12).map((x) => (
          <div key={x.id} class={css.when} style={{ color: '#cfc9bd', margin: '0 0 3px' }}>
            <button class={css.link} style={{ marginRight: '6px', fontSize: '11.5px' }} onClick={() => actions.openDynasty(x.id)}>{x.name}</button>
            {x.generations} {x.generations === 1 ? 'generation' : 'generations'}, {x.reigns} {x.reigns === 1 ? 'reign' : 'reigns'}{x.ended < 0 ? ', on the throne now' : `, lost the throne ${ago(x.ended)}`}
          </div>
        ))}
        {d && d.rulers.length > 0 && <div class={css.sub} style={{ margin: '8px 0 4px', letterSpacing: '0.08em' }}>RULERS ON RECORD</div>}
        {d && [...d.rulers].reverse().slice(0, 30).map((r) => (
          <div key={`${r.name}${r.from}`} class={css.when} style={{ color: '#cfc9bd', margin: '0 0 3px' }}>
            {r.name}, {r.house}: {r.to < 0 ? `reigning, came to power ${ago(r.from)}` : `ruled ${Math.max(1, Math.round(r.to - r.from))} ${Math.round(r.to - r.from) === 1 ? 'year' : 'years'}, ${r.fate}`}
          </div>
        ))}
        {d && d.rulers.length <= 1 && <p class={css.sub}>Rulers are recorded one by one only while time runs at the pace of history or slower.</p>}
      </div>
    </div>
  );
}

export function Peoples() {
  const s = useStore();
  const live = s.settlements.filter((x) => x.ruined < 0).sort((a, b) => b.tech * 10 + Math.log(b.pop + 1) - (a.tech * 10 + Math.log(a.pop + 1))).slice(0, 60);
  const fallen = s.settlements.filter((x) => x.ruined >= 0);
  // (the last twenty left, and before them any older ruin a wonder still stands in)
  const ruins = [...fallen.slice(-20).reverse(), ...fallen.slice(0, -20).filter((x) => x.wonders && x.wonders.length).reverse()];
  const wonders = s.settlements.flatMap((st) => (st.wonders ?? []).map((w) => ({ w, st }))).sort((a, b) => a.w.year - b.w.year);
  const kind = (t: number) => (t >= 0.9 ? 'great city' : t >= 0.6 ? 'city' : t >= 0.3 ? 'village' : 'camp');
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Peoples</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        {s.settlements.length === 0 && <p class={css.sub}>No one has lit a fire yet. In some worlds, no one ever does.</p>}
        {(s.stats?.longPeace ?? -1) >= 0 && s.nations.length > 0 && (
          <p class={css.sub} style={{ margin: '0 0 8px' }}>The long peace, {Math.max(0, Math.round((s.stats?.simYear ?? 0) - (s.stats?.longPeace ?? 0))).toLocaleString('en-US')} years old. History is no longer made here: these nations and their towns live on as they are, by custom, until the planet disturbs them.</p>
        )}
        {s.realms.some((r) => r.ended < 0) && <p class={css.sub} style={{ margin: '0 0 6px' }}><button class={css.link} title="The family tree of the languages spoken now, and their words side by side" onClick={() => actions.openLanguages()}>the languages they speak</button><button class={css.link} title="Paintings of things that happened, in the manner of each age" onClick={() => actions.openGallery()}>what they have painted</button></p>}
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
                      {realm.eraName} ({realm.eraOwn}{s.earthNotes ? `; ${realm.earth}` : ''}). {realm.ruler ? `${realm.ruler} of the ${realm.house} has ruled ${Math.max(1, Math.round(year - realm.rulerSince)).toLocaleString('en-US')} ${Math.round(year - realm.rulerSince) === 1 ? 'year' : 'years'} (${realm.houseReigns} ${realm.houseReigns === 1 ? 'reign' : 'reigns'} of that house).` : 'It lives by custom and keeps no list of rulers.'} Founded {Math.round(year - realm.founded).toLocaleString('en-US')} years ago. They speak {realm.language}.{realm.networks.length ? ` Its towns are joined by ${listOf(realm.networks.map((k) => NETWORK_NAMES[k] ?? 'works'))}.` : ''}{realm.golden ? ` It is in its golden age, ${realm.golden}, ${Math.max(1, Math.round(year - realm.goldenSince)).toLocaleString('en-US')} years old, with ${realm.goldenWorks} great ${realm.goldenWorks === 1 ? 'work' : 'works'} raised so far.` : ''}{realm.calendar ? ` By their count it is ${dateIn({ name: realm.calendar, epoch: realm.calendarEpoch }, year)}, or ${realm.calendarOwn} in their own tongue (sim year ${Math.floor(year).toLocaleString('en-US')}).` : ''}
                    </div>
                  );
                })()}
              </div>
              <span style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                {cap && <button class={css.link} style={{ marginRight: 0 }} onClick={() => { actions.setOverlay('nations'); actions.flyToCell(cap.cell, 1.2); }}>map</button>}
                {(() => { const realm = s.realms.find((r) => r.ended < 0 && r.capital === n.capital) ?? s.realms.find((r) => r.ended < 0 && r.name === n.name); return realm ? <><button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.openNation(realm.id)}>knowledge</button>{realm.houseId >= 0 && realm.ruler && <button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.openDynasty(realm.houseId)}>family tree</button>}{realm.calendarEvent >= 0 && s.events[realm.calendarEvent] && <button class={css.link} style={{ marginRight: 0 }} title="The event their years are counted from" onClick={() => update({ whyEvent: realm.calendarEvent })}>year one</button>}<button class={css.link} style={{ marginRight: 0 }} title={`They speak ${realm.language}`} onClick={() => actions.openLanguages(realm.language)}>language</button></> : null; })()}
              </span>
            </div>
          );
        })}
        {wonders.length > 0 && <div class={css.sub} style={{ margin: '12px 0 4px' }}>WONDERS OF THE WORLD</div>}
        {wonders.map(({ w, st }) => (
          <div key={w.id} class={css.when} style={{ color: '#ffe9a8', margin: '2px 0', display: 'flex', gap: '6px', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span>✦ {w.name}, at {st.name}{st.ruined >= 0 ? ' (a ruin)' : ''}</span>
            <button class={css.link} style={{ marginRight: 0 }} title={`What inspired it: ${w.causeTitle}`} onClick={() => update({ whyEvent: w.eventId })}>why</button>
            <button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.flyToCell(st.cell, 0.16)}>see it</button>
          </div>
        ))}
        {s.nations.length > 0 && <div class={css.sub} style={{ margin: '12px 0 4px' }}>SETTLEMENTS</div>}
        {live.map((st) => {
          const sp = s.species.get(st.species);
          const lore = s.events[st.lore];
          return (
            <div class={css.entry} key={st.id} style={{ color: '#ffcf8a', cursor: 'default' }}>
              <i class={css.dot} />
              <div class={css.what} style={{ color: '#ece7db' }}>{st.name}</div>
              <div class={css.when} style={{ color: '#ece7db' }}>A {kind(st.tech)} of {bigNumber(st.pop * 1000)} {sp ? sp.name : 'people'}, founded {formatYear(st.founded).toLowerCase()}.</div>
              {(() => { const how = st.tech >= 0.22 ? actions.architecture(st) : ''; return how ? <div class={css.when} style={{ color: '#cfc9bd' }}>{how}</div> : null; })()}
              {(st.dam || st.mine) && <div class={css.when} style={{ color: '#cfc9bd' }}>{st.dam && st.mine ? 'It has dammed its river and mines the hills above it.' : st.dam ? 'It has dammed its river: a lake stands above the town.' : 'It works a mine in the hills above it.'}</div>}
              {st.relic && <div class={css.when} style={{ color: '#d8b98a' }}>Its {st.relic} were built with a forgotten technique: no one here can make more.</div>}
              {actions.construction(st.id).map((j, i) => (
                <div key={i} class={css.when} style={{ color: '#ece7db', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span>Building {j.what}: {j.stage}</span>
                  <span title={`${Math.round(j.progress * 100)}% of a job of ${j.years} years`} style={{ display: 'inline-block', width: '72px', height: '6px', borderRadius: '3px', background: '#ffffff26', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${Math.round(j.progress * 100)}%`, height: '100%', background: '#ffcf8a' }} />
                  </span>
                  <span>{Math.round(j.progress * 100)}%</span>
                </div>
              ))}
              {(st.means || st.names) && <div class={css.when} style={{ color: '#cfc9bd' }}>{st.means ? `Its name means "${st.means}". ` : ''}{nameLine(st, s.stats?.simYear ?? 0)}</div>}
              {scarLines(st, s.stats?.simYear ?? 0).map((line, i) => <div key={`scar${i}`} class={css.when} style={{ color: '#e8b49a' }}>{line}</div>)}
              <WonderLines st={st} year={s.stats?.simYear ?? 0} />
              {(st.monuments ?? 0) > 0 && <div class={css.when} style={{ color: '#ffd76a' }}>{st.monuments} great {st.monuments === 1 ? 'work stands' : 'works stand'} here from a golden age.</div>}
              {lore && <div class={css.when} style={{ color: '#ece7db' }}>The story it tells of itself: {lore.title.toLowerCase()}.</div>}
              <button class={css.link} onClick={() => actions.flyToCell(st.cell, 0.25)}>fly there</button>
              {st.tech >= 0.3 && <button class={css.link} title="Fly down and replay this town from its first huts to what it is now" onClick={() => actions.timelapse(st.id, st.cell)}>watch it grow</button>}
              {st.eventId >= 0 && <button class={css.link} onClick={() => update({ whyEvent: st.eventId })}>its story</button>}
              {(st.layers ?? 1) >= 2 && <button class={css.link} title="What lies in the ground under this town" onClick={() => actions.openSite(st.id)}>{st.layers} layers under it</button>}
              {lore && <button class={css.link} onClick={() => update({ whyEvent: st.lore })}>its oldest story</button>}
            </div>
          );
        })}
        {ruins.length > 0 && <div class={css.sub} style={{ margin: '14px 0 4px' }}>RUINS</div>}
        {ruins.map((st) => (
          <div class={css.entry} key={st.id} style={{ color: '#b9a48c', cursor: 'default' }}>
            <i class={css.dot} />
            <div class={css.what} style={{ color: '#cfc9bd' }}>{st.name}</div>
            <div class={css.when} style={{ color: '#ece7db' }}>Abandoned {formatYear(st.ruined).toLowerCase()}. {st.tech >= 0.3 ? describeRuin(Math.max(0, (s.stats?.simYear ?? 0) - st.ruined), st.tech) : ''}{st.feral ? ` ${st.feral} runs wild in it.` : ''}{st.nesting ? ` ${st.nesting} nests in its towers.` : ''}</div>
            <WonderLines st={st} year={s.stats?.simYear ?? 0} />
            <button class={css.link} onClick={() => actions.flyToCell(st.cell, 0.25)}>visit the ruins</button>
            <button class={css.link} onClick={() => actions.openSite(st.id)}>dig here</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The names a town has had (system E22), in a sentence: "Velhassa when it was founded; Velass from 900 years ago (why); Vass for the last 200 (why)." */
export function nameLine(st: SettlementInfo, year: number): string {
  const names = st.names ?? [];
  if (names.length < 2) return '';
  const ago = (y: number) => Math.max(1, Math.round(year - y)).toLocaleString('en-US');
  const parts = names.map((n, i) => i === 0 ? `${n.name} when it was founded` : i === names.length - 1 ? `${n.name} for the last ${ago(n.year)} years (${n.why})` : `${n.name} from ${ago(n.year)} years ago (${n.why})`);
  return `It has been called ${parts.join('; ')}.`;
}

/** What calamities have left on a town (system E20): the last two, newest first, each in a sentence. */
export function scarLines(st: SettlementInfo, year: number): string[] {
  const out: string[] = [];
  const a = st.scars ?? [];
  for (let i = a.length - 5; i >= 0 && out.length < 2; i -= 5) {
    out.push(describeScar({ year: a[i]!, kind: CALAMITIES[a[i + 1]!] ?? 'fire', share: a[i + 2]!, eventId: -1, rebuilt: REBUILDS[a[i + 3]!] ?? '' }, year - a[i]!));
  }
  return out;
}

/** A wonder in a few lines (system E19): what it is, why it was built, and the way to the event that inspired it. */
export function wonderLine(w: WonderInfo, year: number, ruined: number): string {
  const span = Math.max(1, w.done - w.year);
  const got = Math.round(Math.max(0, Math.min(1, ((ruined >= 0 ? Math.min(year, ruined) : year) - w.year) / span)) * 100);
  const state = got >= 100 ? `Finished ${formatYear(w.done).toLowerCase()} after ${Math.round(span)} years of work.`
    : ruined >= 0 ? `It was ${got}% built when the town was left, and was never finished.`
      : `Begun ${formatYear(w.year).toLowerCase()}: ${got}% built, ${Math.max(1, Math.round(w.done - year))} years of work to go.`;
  return `${w.what.charAt(0).toUpperCase()}${w.what.slice(1)}, raised by ${w.builder}. ${w.why} ${state}`;
}

function WonderLines({ st, year }: { st: SettlementInfo; year: number }) {
  if (!st.wonders || !st.wonders.length) return null;
  return (
    <>
      {st.wonders.map((w) => (
        <div key={w.id} class={css.when} style={{ color: '#ffe9a8', margin: '3px 0' }}>
          <b style={{ fontWeight: 600 }}>✦ {w.name}.</b> {wonderLine(w, year, st.ruined)}{' '}
          <button class={css.link} title={`What inspired it: ${w.causeTitle}`} onClick={() => update({ whyEvent: w.eventId })}>why it was built</button>
          <button class={css.link} onClick={() => actions.flyToCell(st.cell, 0.16)}>see it</button>
        </div>
      ))}
    </>
  );
}

function Spark({ label, values, color, format }: { label: string; values: number[]; color: string; format: (n: number) => string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const W = 330, H = 54;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 4 - ((v - min) / Math.max(1e-9, max - min)) * (H - 8)}`).join(' ');
  return (
    <div style={{ marginBottom: '12px' }}>
      <div class={css.row} style={{ padding: 0 }}><span>{label}</span><span class={css.sub}>{format(values[values.length - 1]!)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: `${H}px` }}><polyline points={pts} fill="none" stroke={color} stroke-width="1.6" style={{ filter: `drop-shadow(0 0 3px ${color})` }} /></svg>
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
          <span>{qualities.map((q) => <button class={css.btn} style={{ marginLeft: '4px', opacity: s.quality === q ? 1 : 0.55 }} onClick={() => actions.setQuality(q)}>{q}</button>)}</span>
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
        <div class={css.row}><span>Compare ages to Earth's</span><button class={css.btn} onClick={() => actions.setEarthNotes(!s.earthNotes)}>{s.earthNotes ? 'on' : 'off'}</button></div>
        <div class={css.row}><span>Hear the planet's pulse in a crisis</span><button class={css.btn} onClick={() => actions.setPulseSound(!s.pulseSound)}>{s.pulseSound ? 'on' : 'off'}</button></div>
        <div class={css.row}><span>Colour-blind safe overlays</span><button class={css.btn} onClick={() => actions.setColorblind(!s.colorblind)}>{s.colorblind ? 'on' : 'off'}</button></div>
        <div class={css.row}>
          <span>Overlay (O)</span>
          <span>{(['none', 'temp', 'rain', 'life', 'people', 'fossils', 'nations', 'fungal', 'diversity', 'oxygen'] as const).map((o) => <button class={css.btn} style={{ marginLeft: '4px', opacity: s.overlay === o ? 1 : 0.55 }} onClick={() => actions.setOverlay(o)}>{o}</button>)}</span>
        </div>
        <div class={css.sub} style={{ margin: '12px 0 2px' }}>CAMERA AND KEEPSAKES</div>
        <div class={css.row}>
          <span>Photo filter</span>
          <span>{['none', 'vivid', 'faded', 'sepia', 'noir'].map((f) => <button class={css.btn} style={{ marginLeft: '4px', opacity: s.photoFilter === f ? 1 : 0.55 }} onClick={() => actions.setPhotoFilter(f)}>{f}</button>)}</span>
        </div>
        <div class={css.row}><span>Save a photo</span><button class={css.btn} onClick={() => actions.savePhoto()}>save PNG</button></div>
        <div class={css.row}><span>Record video</span><button class={css.btn} onClick={() => actions.toggleRecording()}>{s.recording ? 'stop and save' : 'record'}</button></div>
        <div class={css.row}><span>Save a GIF<br /><span class={css.sub}>Three seconds of the view, looping.</span></span><button class={css.btn} onClick={() => actions.saveGif()}>save GIF</button></div>
        <div class={css.row}><span>History of this planet<br /><span class={css.sub}>An illustrated book, saved as a PDF.</span></span><button class={css.btn} onClick={() => actions.exportBook()}>make book</button></div>
        <div class={css.row}><span>Fork the timeline here<br /><span class={css.sub}>On a desktop this starts a second future running beside this one; you can compare them and cross over. It is also kept as a rewind point.</span></span><button class={css.btn} onClick={() => actions.fork()}>fork</button></div>
        <div class={css.sub} style={{ margin: '12px 0 2px' }}>SKIP TO AN AGE</div>
        {s.stats?.skipTo != null
          ? <div class={css.row}><span>Skipping ahead to the {ERAS[s.stats.skipTo]!.name}<br /><span class={css.sub}>now at {formatYear(s.stats.simYear).toLowerCase()}</span></span><button class={css.btn} onClick={() => actions.skipTo(-1)}>stop</button></div>
          : ERAS.map((e, i) => {
            const here = !!s.stats?.history && (s.stats.topEra ?? 0) >= i;
            const back = s.timeline.find((t) => t.title === `Start of the ${e.name}`);
            return (
              <div class={css.row} key={e.name}><span>{e.name}{i === 0 && <><br /><span class={css.sub}>the dawn of history: the first settled people</span></>}</span>
                {!here ? <button class={css.btn} onClick={() => actions.skipTo(i)}>skip ahead</button>
                  : back ? <button class={css.btn} onClick={() => { if (confirm(`Go back to the start of the ${e.name}? Everything after it will be lost.`)) actions.rewind(back.index); }}>go back</button>
                    : <span class={css.sub}>{(s.stats?.topEra ?? 0) === i ? 'now' : 'passed'}</span>}
              </div>
            );
          })}
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
  update({ panel: 'none', whyEvent: -1, selectedSpecies: -1, tool: '', creature: null });
}
void state;
