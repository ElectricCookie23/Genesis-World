// The family tree of a ruling house (system E7): who ruled after whom, who they married, how they died,
// which of their children fought them for the throne, and the wars that began in each reign.
import type { DynastyDetail, HouseMember } from '../shared/protocol';
import { Portrait } from './portrait';
import { actions, update, useStore } from './store';
import css from './ui.module.css';

const W = 196, H = 92, GAP_X = 14, GAP_Y = 26;

interface Placed { m: HouseMember; x: number; y: number; }

/** Lay the family out as a tidy tree: each generation a row, each parent centred over its children. */
export function layoutHouse(members: HouseMember[]): { nodes: Placed[]; width: number; height: number } {
  const byId = new Map(members.map((m) => [m.id, m]));
  const kids = new Map<number, HouseMember[]>();
  const roots: HouseMember[] = [];
  for (const m of members) {
    if (m.parent >= 0 && byId.has(m.parent)) { let list = kids.get(m.parent); if (!list) kids.set(m.parent, (list = [])); list.push(m); } else roots.push(m);
  }
  const order = (a: HouseMember, b: HouseMember) => a.born - b.born || a.id - b.id;
  const nodes: Placed[] = [];
  let next = 0, deepest = 0;
  const place = (m: HouseMember, depth: number): number => {
    // a row is a generation; a child never sits above its parent even if the records disagree
    const row = Math.max(depth, m.gen);
    deepest = Math.max(deepest, row);
    const below = (kids.get(m.id) ?? []).sort(order);
    let x: number;
    if (!below.length) x = next++;
    else { const xs = below.map((k) => place(k, row + 1)); x = (xs[0]! + xs[xs.length - 1]!) / 2; }
    nodes.push({ m, x: x * (W + GAP_X), y: row * (H + GAP_Y) });
    return x;
  };
  for (const r of roots.sort((a, b) => a.gen - b.gen || order(a, b))) place(r, r.gen);
  return { nodes, width: Math.max(1, next) * (W + GAP_X) - GAP_X, height: (deepest + 1) * (H + GAP_Y) - GAP_Y };
}

function lifeLine(m: HouseMember, year: number): string {
  if (m.reignFrom >= 0) {
    const to = m.reignTo < 0 ? year : m.reignTo;
    const y = Math.max(1, Math.round(to - m.reignFrom));
    return m.reignTo < 0 && m.died < 0 ? `reigning, ${y} ${y === 1 ? 'year' : 'years'}` : `ruled ${y} ${y === 1 ? 'year' : 'years'}`;
  }
  return m.role === 'claimant' ? 'claimed the throne' : m.role;
}

function Node({ p, genes, year }: { p: Placed; genes: Float32Array | undefined; year: number }) {
  const m = p.m;
  const ruled = m.reignFrom >= 0;
  return (
    <div
      title={[m.name, lifeLine(m, year), m.fate, m.spouse ? `wed ${m.spouse}${m.spouseHouse ? ` of the ${m.spouseHouse}` : ''}` : '', m.claim ? `had a claim on ${m.claim}` : '', ...m.wars.map((w) => `in this reign: ${w}`)].filter(Boolean).join('\n')}
      style={{
        position: 'absolute', left: `${p.x}px`, top: `${p.y}px`, width: `${W}px`, height: `${H}px`, boxSizing: 'border-box', display: 'flex', gap: '7px', padding: '5px',
        border: `1px solid ${ruled ? '#ffffff38' : '#ffffff1c'}`, borderStyle: ruled ? 'solid' : 'dashed', borderRadius: '6px', background: ruled ? '#ffffff0d' : '#ffffff05', overflow: 'hidden',
      }}
    >
      {genes && <Portrait genes={genes} era={m.era} role={m.role} seed={m.id} bold={m.bold} cruel={m.cruel} width={48} />}
      <div style={{ minWidth: 0, font: '400 10.5px/1.3 system-ui, sans-serif', color: '#cfc9bd' }}>
        <div style={{ font: '600 12.5px/1.15 system-ui, sans-serif', color: '#f2eee4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
        <div style={{ color: '#ffffff8c' }}>{lifeLine(m, year)}</div>
        {m.fate && <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.fate}</div>}
        {m.spouse && <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>wed {m.spouse}</div>}
        {m.wars.length > 0 && <div style={{ color: '#ffb48a' }}>{m.wars.length === 1 ? '1 war' : `${m.wars.length}${m.wars.length === 4 ? '+' : ''} wars`} in this reign</div>}
      </div>
    </div>
  );
}

function Lines({ nodes }: { nodes: Placed[] }) {
  const at = new Map(nodes.map((n) => [n.m.id, n]));
  return (
    <>
      {nodes.filter((n) => at.has(n.m.parent)).map((n) => {
        const p = at.get(n.m.parent)!;
        const x0 = p.x + W / 2, y0 = p.y + H, x1 = n.x + W / 2, y1 = n.y, mid = y1 - GAP_Y / 2;
        return <path key={n.m.id} d={`M ${x0} ${y0} V ${mid} H ${x1} V ${y1}`} fill="none" stroke={n.m.reignFrom >= 0 ? '#ffffff66' : '#ffffff33'} stroke-width="1.2" stroke-dasharray={n.m.reignFrom >= 0 ? undefined : '3 3'} />;
      })}
    </>
  );
}

/** On a small screen, or at the low preset, the same family as a plain indented list. */
function HouseList({ d, year }: { d: DynastyDetail; year: number }) {
  const { nodes } = layoutHouse(d.members);
  return (
    <div>
      {[...nodes].sort((a, b) => a.y - b.y || a.x - b.x).map((n) => (
        <div key={n.m.id} class={css.when} style={{ color: n.m.reignFrom >= 0 ? '#e6e0d2' : '#a9a498', margin: '0 0 4px', paddingLeft: `${Math.min(6, Math.round(n.y / (H + GAP_Y)) % 7) * 6}px` }}>
          {n.m.name}: {lifeLine(n.m, year)}{n.m.fate ? `, ${n.m.fate}` : ''}{n.m.spouse ? `; wed ${n.m.spouse}` : ''}{n.m.wars.length ? `; ${n.m.wars.length} ${n.m.wars.length === 1 ? 'war' : 'wars'}` : ''}
        </div>
      ))}
    </div>
  );
}

export function DynastyPanel() {
  const s = useStore();
  const d = s.dynastyDetail;
  const year = s.stats?.simYear ?? 0;
  const genes = d ? s.species.get(d.species)?.genes : undefined;
  const small = s.quality === 'low' || (typeof window !== 'undefined' && window.innerWidth < 620);
  const tree = d && !small ? layoutHouse(d.members) : null;
  const ago = (y: number) => `${Math.max(0, Math.round(year - y)).toLocaleString('en-US')} years ago`;
  return (
    <div class={`${css.panel} ${css.side}`} style={{ width: 'min(680px, 96vw)' }}>
      <div class={css.head}><h2>{d ? d.name : 'A ruling house'}</h2><button class={css.close} onClick={() => (d ? actions.openNation(d.nation) : update({ panel: 'peoples' }))}>✕</button></div>
      <div class={css.scroll}>
        {!d && <p class={css.sub}>Asking the archives.</p>}
        {d && (
          <p class={css.sub} style={{ margin: '0 0 8px' }}>
            Rules <button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.openNation(d.nation)}>{d.nationName}</button>. {d.generations} {d.generations === 1 ? 'generation' : 'generations'}, {d.reigns} {d.reigns === 1 ? 'reign' : 'reigns'}; took the throne {ago(d.founded)}{d.ended >= 0 ? `, lost it ${ago(d.ended)}` : ''}.
            {d.branchId >= 0 && <> A branch of the <button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.openDynasty(d.branchId)}>{d.branchOf}</button>.</>}
            {d.branches.length > 0 && <> Branches: {d.branches.map((b, i) => <span key={b.id}>{i ? ', ' : ''}<button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.openDynasty(b.id)}>{b.name} of {b.nation}</button></span>)}.</>}
          </p>
        )}
        {d && d.members.length === 0 && <p class={css.sub}>No one of this house was recorded by name: its years passed while time ran faster than the pace of history.</p>}
        {d && d.members.length > 0 && d.members.length < d.reigns && <p class={css.sub} style={{ margin: '0 0 8px' }}>Only those who lived while time ran at the pace of history, or slower, are on record.</p>}
        {d && tree && (
          <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: '8px', flex: 'none', minHeight: `${tree.height + 10}px` }}>
            <div style={{ position: 'relative', width: `${tree.width}px`, height: `${tree.height}px` }}>
              <svg width={tree.width} height={tree.height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}><Lines nodes={tree.nodes} /></svg>
              {tree.nodes.map((n) => <Node key={n.m.id} p={n} genes={genes} year={year} />)}
            </div>
          </div>
        )}
        {d && small && <HouseList d={d} year={year} />}
        {d && <p class={css.sub} style={{ margin: '8px 0 0' }}>Solid frames ruled; dashed frames were born to the house and never did. Hold the pointer over anyone for the wars that began in their reign.</p>}
      </div>
    </div>
  );
}
