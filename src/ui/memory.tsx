// The record (expansion Section 6): the archive, the atlas, the braid, truth beside record, ancestry, the chronoscope.
// Everything shown here is asked of the simulation when a view is opened and read from what it already keeps;
// nothing in this file changes the world.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { actions, update, useStore, type MemoryTab } from './store';
import { formatYear, hsl } from './format';
import { CreatureSketch } from './sketch';
import type { Atlas, Kind, Lane, Piece, Ref } from '../sim/memory';
import css from './ui.module.css';

const TABS: [MemoryTab, string, string][] = [
  ['archive', 'Archive', 'an article for everything in this world, each leading to the others'],
  ['atlas', 'Atlas', 'who held what, century by century'],
  ['braid', 'Braid', 'every nation as a line in time'],
  ['records', 'Truth and record', 'what happened, beside what a nation wrote down'],
  ['ancestry', 'Ancestry', 'one person, traced back to the first life'],
  ['chronoscope', 'Chronoscope', 'a town as it stood in any year'],
  ['forecasts', 'Forecasts', 'what scholars said would happen, and whether it did'],
  ['whatif', 'What if', 'the same world run twice: once with an event, once without'],
  ['film', 'Documentary', 'a film of this world, from the first life to now'],
];

/** A date, said the way the rest of the page says dates: by how long ago while that means something, else by the year. */
function When({ year }: { year: number }) {
  const now = useStore().stats?.simYear ?? 0;
  const ago = now - year;
  if (ago < 0 && ago > -200_000) return <span title={formatYear(year)}>in {Math.round(-ago).toLocaleString('en-US')} years</span>;
  if (ago >= 0 && ago < 200_000) return <span title={formatYear(year)}>{ago < 1.5 ? 'this year' : `${Math.round(ago).toLocaleString('en-US')} years ago`}</span>;
  return <span>{formatYear(year).toLowerCase()}</span>;
}

function Pieces({ of }: { of: Piece[] }) {
  return (
    <>
      {of.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span>
        : 'year' in p ? <When key={i} year={p.year} />
          : <button key={i} class={css.ref} onClick={() => actions.openArticle(p.to)}>{p.text}</button>))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------- the archive

function ArchiveView() {
  const s = useStore();
  const [group, setGroup] = useState<Kind>('nation');
  const [find, setFind] = useState('');
  useEffect(() => { if (!s.memIndex) actions.askMemory({ what: 'index' }); }, []);
  const here = s.memTrail[s.memTrail.length - 1];
  const a = here && s.memArticle && s.memArticle.ref.kind === here.kind && s.memArticle.ref.id === here.id ? s.memArticle : null;
  const back = () => {
    const trail = s.memTrail.slice(0, -1);
    update({ memTrail: trail, memArticle: null });
    const prev = trail[trail.length - 1];
    if (prev) actions.askMemory({ what: 'article', kind: prev.kind, id: prev.id });
  };
  if (here) {
    return (
      <div>
        <div style={{ marginBottom: '8px' }}>
          <button class={css.link} onClick={back}>{s.memTrail.length > 1 ? 'back' : 'to the index'}</button>
          {s.memTrail.length > 1 && <button class={css.link} onClick={() => update({ memTrail: [], memArticle: null })}>index</button>}
        </div>
        {!a && <p class={css.sub}>Looking it up.</p>}
        {a && (
          <div>
            <div class={css.goalTitle}><b style={{ fontSize: '22px' }}>{a.title}</b><span class={css.sub}>{a.label}</span></div>
            {a.hue !== undefined && <div style={{ height: '3px', background: hsl(a.hue), borderRadius: '2px', margin: '4px 0 8px' }} />}
            {a.genes && <div style={{ background: '#e9e1cf', borderRadius: '8px', padding: '6px', margin: '6px 0', width: 'fit-content' }}><CreatureSketch genes={Float32Array.from(a.genes)} width={220} seed={a.ref.id + 1} /></div>}
            <div class={css.kv} style={{ margin: '8px 0 10px' }}>
              {a.box.map((row) => <><span>{row.key}</span><b style={{ fontWeight: 400 }}><Pieces of={row.value} /></b></>)}
            </div>
            {a.body.map((para, i) => <p key={i} class={css.article}><Pieces of={para} /></p>)}
            {a.events.length > 0 && s.events[a.events[0]!] && <button class={css.link} onClick={() => update({ whyEvent: a.events[0]!, panel: 'none' })}>why did this happen?</button>}
            {a.ref.kind === 'place' && <button class={css.link} onClick={() => { update({ memTab: 'chronoscope' }); actions.setChrono(a.ref.id, s.stats?.simYear ?? 0); }}>see it in another year</button>}
            {a.ref.kind === 'place' && <button class={css.link} onClick={() => actions.meet(a.ref.id, 7)}>meet someone who lives here</button>}
            {a.ref.kind === 'war' && <button class={css.link} onClick={() => actions.openBattle(a.ref.id)}>the battle, on the field</button>}
            {a.ref.kind === 'nation' && <button class={css.link} onClick={() => actions.openMuseum(a.ref.id)}>its museum</button>}
            {a.ref.kind === 'species' && <button class={css.link} onClick={() => { update({ panel: 'ground', groundTab: 'senses' }); actions.seeAs(a.ref.id); }}>see as it sees</button>}
            {a.ref.kind === 'nation' && <button class={css.link} onClick={() => { update({ memTab: 'records', memRecords: null }); actions.askMemory({ what: 'records', id: a.ref.id }); }}>its own history of itself</button>}
          </div>
        )}
      </div>
    );
  }
  const g = s.memIndex?.find((x) => x.kind === group);
  const q = find.trim().toLowerCase();
  const shown = g ? (q ? g.entries.filter((e) => e.name.toLowerCase().includes(q)) : g.entries) : [];
  return (
    <div>
      {!s.memIndex && <p class={css.sub}>Gathering the record.</p>}
      {s.memIndex && (
        <>
          <div class={css.tabs}>
            {s.memIndex.map((x) => <button key={x.kind} class={x.kind === group ? css.active : ''} onClick={() => setGroup(x.kind)}>{x.label} <span class={css.sub}>{x.entries.length.toLocaleString('en-US')}</span></button>)}
          </div>
          <input class={css.find} type="search" placeholder="find by name" value={find} onInput={(e) => setFind((e.target as HTMLInputElement).value)} />
          {shown.length === 0 && <p class={css.sub}>{g && g.entries.length ? 'Nothing by that name.' : 'Nothing of this kind yet.'}</p>}
          <div class={css.entries}>
            {shown.slice(-400).reverse().map((e) => <button key={e.id} class={css.ref} onClick={() => actions.openArticle({ kind: group, id: e.id })}>{e.name}</button>)}
          </div>
          {shown.length > 400 && <p class={css.sub}>The latest 400 of {shown.length.toLocaleString('en-US')}. Search by name for the rest.</p>}
          <button class={css.link} onClick={() => { update({ memIndex: null }); actions.askMemory({ what: 'index' }); }}>bring the index up to date</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the atlas

function drawAtlas(cv: HTMLCanvasElement, base: HTMLCanvasElement, a: Atlas, index: number, byLanguage: boolean): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = cv.width, H = cv.height, f = a.frames[index]!;
  ctx.globalAlpha = 1;
  ctx.drawImage(base, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(0, 0, W, H);
  const hue = new Map<number, number>();
  for (const n of a.nations) hue.set(n.id, byLanguage ? (n.language < 0 ? 0 : ((n.language * 0.381966) % 1)) : n.hue);
  const at = (cell: number): [number, number] => { const [u, v] = actions.mapPoint(cell); return [u * W, v * H]; };
  // the made roads and lines that existed by then
  ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(255, 236, 190, 0.35)';
  ctx.beginPath();
  for (let i = 0; i < a.links.length; i += 4) {
    if (a.links[i + 3]! > f.year) continue;
    const [x0, y0] = at(a.links[i]!), [x1, y1] = at(a.links[i + 1]!);
    if (Math.abs(x1 - x0) > W / 2) continue; // across the edge of the map
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  // each town colours the country around it
  for (let i = 0; i < f.towns.length; i += 3) {
    const owner = f.towns[i + 1]!;
    if (owner < 0) continue;
    const [x, y] = at(f.towns[i]!);
    ctx.globalAlpha = 0.42; ctx.fillStyle = hsl(hue.get(owner) ?? 0, 75, 58);
    ctx.beginPath(); ctx.arc(x, y, 5 + f.towns[i + 2]! * 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < f.towns.length; i += 3) {
    const [x, y] = at(f.towns[i]!), owner = f.towns[i + 1]!;
    ctx.fillStyle = owner < 0 ? '#cfc8b8' : hsl(hue.get(owner) ?? 0, 85, 78);
    const r = f.towns[i + 2]! >= 3 ? 1.6 : 1;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // where there was fighting since the last frame
  ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const c of f.wars) { const [x, y] = at(c); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); }
  ctx.stroke();
}

function AtlasView() {
  const s = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useMemo(() => { const c = document.createElement('canvas'); c.width = 720; c.height = 360; return c; }, []);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [byLanguage, setByLanguage] = useState(false);
  const a = s.memAtlas;
  useEffect(() => { actions.askMemory({ what: 'atlas' }); actions.drawBareMap(base); }, []);
  useEffect(() => { if (a) setFrame(a.frames.length - 1); }, [a?.to, a?.frames.length]);
  useEffect(() => { if (a && ref.current && a.frames[frame]) drawAtlas(ref.current, base, a, frame, byLanguage); }, [a, frame, byLanguage]);
  useEffect(() => {
    if (!playing || !a) return;
    const t = window.setInterval(() => setFrame((f) => { if (f >= a.frames.length - 1) { setPlaying(false); return f; } return f + 1; }), 140);
    return () => window.clearInterval(t);
  }, [playing, a]);
  if (!a) return <p class={css.sub}>{s.memAtlas === null ? 'There is no atlas before there is history: it begins with the first nation.' : ''}</p>;
  const f = a.frames[Math.min(frame, a.frames.length - 1)]!;
  const owners = new Map<number, number>();
  for (let i = 0; i < f.towns.length; i += 3) if (f.towns[i + 1]! >= 0) owners.set(f.towns[i + 1]!, (owners.get(f.towns[i + 1]!) ?? 0) + 1);
  const top = [...owners.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  const languages = new Set(a.nations.filter((n) => owners.has(n.id)).map((n) => n.language));
  return (
    <div>
      <canvas ref={ref} width={720} height={360} style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
      <div class={css.row}>
        <button class={css.btn} onClick={() => { if (frame >= a.frames.length - 1) setFrame(0); setPlaying(!playing); }}>{playing ? 'pause' : 'play'}</button>
        <input type="range" min="0" max={a.frames.length - 1} step="1" value={frame} style={{ flex: 1 }} onInput={(e) => { setPlaying(false); setFrame(Number((e.target as HTMLInputElement).value)); }} />
        <button class={css.btn} onClick={() => setByLanguage(!byLanguage)}>{byLanguage ? 'by language' : 'by nation'}</button>
      </div>
      <div><When year={f.year} />: {owners.size} {owners.size === 1 ? 'nation' : 'nations'}, {f.towns.length / 3} towns, {languages.size} {languages.size === 1 ? 'language' : 'languages'}{f.wars.length ? `, fighting in ${f.wars.length} ${f.wars.length === 1 ? 'place' : 'places'}` : ''}.</div>
      <div class={css.sub} style={{ margin: '4px 0' }}>Each frame is {a.step} years after the last. A town colours the country around it in its nation's colour{byLanguage ? ' (here, the colour of the language spoken there)' : ''}; thin lines are made roads and wires; a red cross is a war.</div>
      <div class={css.entries}>
        {top.map(([id, n]) => { const nat = a.nations.find((x) => x.id === id); return nat ? <button key={id} class={css.ref} style={{ color: hsl(nat.hue, 80, 76) }} onClick={() => actions.openArticle({ kind: 'nation', id })}>{nat.name} ({n})</button> : null; })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the braid

/** Give each lane a row: a lane takes the first row that has been free for a while, so the picture stays compact. */
export function braidRows(lanes: Lane[], now: number): Map<number, number> {
  const rows: number[] = [];
  const out = new Map<number, number>();
  const gap = Math.max(40, (now - Math.min(...lanes.map((l) => l.from), now)) * 0.02);
  for (const l of [...lanes].sort((a, b) => a.from - b.from || a.id - b.id)) {
    let r = rows.findIndex((free) => free + gap <= l.from);
    if (r < 0) { r = rows.length; rows.push(0); }
    rows[r] = l.to >= 0 ? l.to : Infinity;
    out.set(l.id, r);
  }
  return out;
}

function BraidView() {
  const s = useStore();
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { actions.askMemory({ what: 'braid' }); }, []);
  // nations multiply toward the present: when zoomed in, start at the recent end
  useEffect(() => { if (box.current) box.current.scrollLeft = box.current.scrollWidth; }, [zoom]);
  const b = s.memBraid;
  if (!b) return <p class={css.sub}>The braid begins with the first nation.</p>;
  const rows = braidRows(b.lanes, b.to);
  const count = Math.max(1, ...rows.values()) + 1;
  const span = Math.max(1, b.to - b.from);
  const W = 680 * zoom, LH = 20, H = count * LH + 30;
  const x = (year: number) => 6 + ((year - b.from) / span) * (W - 130);
  const y = (id: number) => 16 + (rows.get(id) ?? 0) * LH;
  const ticks = 4 * zoom;
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>Time runs left to right. A line is a nation; it rises out of the one it broke from and runs into the one it was joined to. A dot is something that happened to it: click one to see why.</p>
      <div class={css.row} style={{ padding: '0 0 6px' }}>
        <span class={css.sub}>{zoom === 1 ? 'the whole of history' : `${zoom} times closer: scroll sideways`}</span>
        <span>
          <button class={css.btn} disabled={zoom <= 1} style={{ opacity: zoom <= 1 ? 0.4 : 1 }} onClick={() => setZoom(Math.max(1, zoom / 2))}>wider</button>{' '}
          <button class={css.btn} disabled={zoom >= 8} style={{ opacity: zoom >= 8 ? 0.4 : 1 }} onClick={() => setZoom(Math.min(8, zoom * 2))}>closer</button>
        </span>
      </div>
      <div ref={box} style={{ overflowX: 'auto', background: '#0c0e14', borderRadius: '8px' }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: zoom === 1 ? '100%' : undefined, height: zoom === 1 ? 'auto' : undefined }}>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const year = b.from + (span * i) / ticks;
            return <g key={i}><line x1={x(year)} y1={0} x2={x(year)} y2={H - 14} stroke="#ffffff10" /><text x={x(year) + 2} y={H - 3} fill="#ffffff66" font-size="9">{i === ticks ? 'now' : `${Math.round(b.to - year).toLocaleString('en-US')} years ago`}</text></g>;
          })}
          {b.lanes.map((l) => {
            const x0 = x(l.from), x1 = x(l.to >= 0 ? l.to : b.to), yy = y(l.id), col = hsl(l.hue, 70, 62);
            const parent = b.lanes.find((p) => p.id === l.parent), into = b.lanes.find((p) => p.id === l.into);
            return (
              <g key={l.id}>
                {parent && <path d={`M ${x0 - 7} ${y(parent.id)} C ${x0 - 2} ${y(parent.id)}, ${x0 - 5} ${yy}, ${x0} ${yy}`} fill="none" stroke={col} stroke-width="1.3" opacity="0.7" />}
                {into && <path d={`M ${x1} ${yy} C ${x1 + 5} ${yy}, ${x1 + 2} ${y(into.id)}, ${x1 + 7} ${y(into.id)}`} fill="none" stroke={col} stroke-width="1.3" opacity="0.7" />}
                <line x1={x0} y1={yy} x2={x1} y2={yy} stroke={col} stroke-width={1.5 + Math.min(3.5, l.peakTowns * 0.25)} stroke-linecap="round" opacity={l.to >= 0 ? 0.6 : 1} />
                {l.to >= 0 && !into && <line x1={x1} y1={yy - 4} x2={x1} y2={yy + 4} stroke={col} stroke-width="1.5" />}
                {l.stations.map((st) => <circle key={st.eventId} cx={x(st.year)} cy={yy} r="2.6" fill={st.kind.includes('war') ? '#ff6a5a' : '#fff4d8'} stroke="#0c0e14" stroke-width="0.8" style={{ cursor: 'pointer' }} onClick={() => update({ whyEvent: st.eventId, panel: 'none' })}><title>{st.title}</title></circle>)}
                <text x={x1 + (into ? 10 : 6)} y={yy + 3} fill={col} font-size="10" style={{ cursor: 'pointer' }} onClick={() => actions.openArticle({ kind: 'nation', id: l.id })}>{l.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div class={css.sub} style={{ marginTop: '6px' }}>{b.lanes.length} nations: {b.lanes.filter((l) => l.to < 0).length} living, {b.lanes.filter((l) => l.parent >= 0).length} that broke out of another, {b.lanes.filter((l) => l.into >= 0).length} that were joined to another. Click a name for its article.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- truth and record

const SLANT: Record<string, [string, string]> = {
  kept: ['kept', '#b8c4b0'], slanted: ['slanted', '#f0c27a'], enlarged: ['enlarged', '#f0a56a'], forgotten: ['left out', '#8f96a8'], 'made up': ['made up', '#ff7d6a'],
};

function RecordsView() {
  const s = useStore();
  useEffect(() => { if (!s.memIndex) actions.askMemory({ what: 'index' }); }, []);
  const nations = s.memIndex?.find((g) => g.kind === 'nation')?.entries ?? [];
  const r = s.memRecords;
  const pick = (id: number) => { update({ memRecords: null }); actions.askMemory({ what: 'records', id }); };
  useEffect(() => { if (!r && nations.length) pick((s.realms.slice().sort((a, b) => b.pop - a.pop)[0]?.id) ?? nations[nations.length - 1]!.id); }, [nations.length]);
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>On the left, what happened, from the record the simulation keeps. On the right, the same years as that nation's own historians wrote them. The slant follows from which side of each event the nation was on: nothing here is noise.</p>
      <select class={css.find} value={r?.nation ?? -1} onChange={(e) => pick(Number((e.target as HTMLSelectElement).value))}>
        {!r && <option value={-1}>choose a nation</option>}
        {[...nations].reverse().map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
      {!nations.length && <p class={css.sub}>No nation has a history yet.</p>}
      {r && (
        <>
          <div class={css.goalTitle} style={{ marginTop: '8px' }}><b>{r.name}</b><span class={css.sub}>as written by {r.historian}</span></div>
          <div class={css.sub}>{['kept', 'slanted', 'enlarged', 'forgotten', 'made up'].map((k) => `${r.entries.filter((e) => e.slant === k).length} ${SLANT[k]![0]}`).join(' · ')}</div>
          {r.entries.map((e, i) => (
            <div key={i} class={css.split}>
              <div>
                <div class={css.sub}><When year={e.year} /></div>
                {e.truth ? <><b>{e.truth.title}</b><div class={css.article}>{e.truth.text}</div>{e.truth.why && <div class={css.sub}>because of: {e.truth.why}</div>}</> : <div class={css.sub}>Nothing happened.</div>}
                {e.eventId >= 0 && s.events[e.eventId] && <button class={css.link} onClick={() => update({ whyEvent: e.eventId, panel: 'none' })}>trace the causes</button>}
              </div>
              <div style={{ borderLeft: `2px solid ${SLANT[e.slant]![1]}`, paddingLeft: '10px' }}>
                <div class={css.sub} style={{ color: SLANT[e.slant]![1] }}>{SLANT[e.slant]![0]}</div>
                {e.record ? <><b style={{ fontStyle: 'italic' }}>{e.record.title}</b><div class={css.article} style={{ fontStyle: 'italic' }}>{e.record.text}</div></> : <div class={css.sub}>Their history says nothing of this year.</div>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- ancestry

const STEP_COLOUR: Record<string, string> = { person: '#ffe2a8', generations: '#c9b98f', town: '#f0c27a', people: '#e6a070', species: '#9fd6b0', life: '#8fc4ff' };

function AncestryView() {
  const s = useStore();
  const towns = s.settlements.filter((t) => t.ruined < 0).sort((a, b) => b.pop - a.pop).slice(0, 60);
  const [town, setTown] = useState(-1);
  const [who, setWho] = useState(7);
  const ask = (t: number, w: number) => { setTown(t); setWho(w); update({ memAncestry: null }); actions.askMemory({ what: 'ancestry', town: t, index: w }); };
  useEffect(() => { if (towns.length && town < 0) ask(towns[0]!.id, 7); }, [towns.length]);
  const a = s.memAncestry;
  if (!towns.length) return <p class={css.sub}>Nobody lives in a town yet. Ancestry needs someone to start from.</p>;
  return (
    <div>
      <div class={css.row}>
        <select class={css.find} style={{ flex: 1, margin: 0 }} value={town} onChange={(e) => ask(Number((e.target as HTMLSelectElement).value), 7)}>
          {towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button class={css.btn} onClick={() => ask(town, who + 13)}>someone else</button>
      </div>
      {!a && <p class={css.sub}>Tracing the line.</p>}
      {a && (
        <>
          <p class={css.sub}>The line of {a.name} of {a.town}, newest first. Every step is in the record: the family in its town, the founding of the town, the turning points of their people, each species in their descent, and the first life in the sea.</p>
          <div class={css.line}>
            {a.steps.map((st, i) => (
              <div key={i} class={css.lineStep} style={{ borderColor: STEP_COLOUR[st.kind] }}>
                <i style={{ background: STEP_COLOUR[st.kind] }} />
                <div class={css.sub}><When year={st.year} /></div>
                <b>{st.ref ? <button class={css.ref} onClick={() => actions.openArticle(st.ref as Ref)}>{st.title}</button> : st.title}</b>
                <div class={css.article}>{st.text}</div>
                {st.eventId !== undefined && s.events[st.eventId] && <button class={css.link} onClick={() => update({ whyEvent: st.eventId!, panel: 'none' })}>why did this happen?</button>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the chronoscope

function ChronoscopeView() {
  const s = useStore();
  const now = s.stats?.simYear ?? 0;
  const towns = s.settlements.filter((t) => t.tech >= 0.22 || t.ruined >= 0).sort((a, b) => (b.peak ?? b.pop) - (a.peak ?? a.pop)).slice(0, 80);
  const id = s.chrono?.id ?? -1;
  const town = s.settlements.find((t) => t.id === id);
  const p = s.memPlace && s.memPlace.id === id ? s.memPlace : null;
  useEffect(() => { if (id < 0 && towns.length) actions.setChrono(towns[0]!.id, now); }, [towns.length]);
  // leaving the view puts the town back: a town left in the past with no dial in sight would only confuse
  useEffect(() => () => actions.setChrono(-1, null), []);
  if (!towns.length) return <p class={css.sub}>There are no towns to look back at yet.</p>;
  const until = town ? (town.ruined >= 0 ? town.ruined : now) : now;
  const from = town?.founded ?? 0;
  const year = Math.max(from, Math.min(until, s.chrono?.year ?? until));
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>Turn the dial and one town goes back to the year you choose, while the rest of the world stays in the present. What it shows is rebuilt from the layers in the ground under the town, its walls and the log kept for its land.</p>
      <div class={css.row}>
        <select class={css.find} style={{ flex: 1, margin: 0 }} value={id} onChange={(e) => actions.setChrono(Number((e.target as HTMLSelectElement).value), now)}>
          {towns.map((t) => <option key={t.id} value={t.id}>{t.name}{t.ruined >= 0 ? ' (a ruin)' : ''}</option>)}
        </select>
        {town && <button class={css.btn} onClick={() => actions.flyToCell(town.cell, 0.02)}>fly there</button>}
      </div>
      {town && (
        <>
          <input type="range" min={from} max={until} step={Math.max(1, Math.round((until - from) / 400))} value={year} style={{ width: '100%' }}
            onInput={(e) => actions.setChrono(town.id, Number((e.target as HTMLInputElement).value))} />
          <div class={css.row} style={{ padding: 0 }}>
            <button class={css.link} onClick={() => actions.setChrono(town.id, from)}>its founding</button>
            <span><When year={year} /></span>
            <button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.setChrono(town.id, until)}>{town.ruined >= 0 ? 'its last year' : 'the present'}</button>
          </div>
          {p && (
            <div class={css.kv} style={{ marginTop: '8px' }}>
              <span>then</span><b style={{ fontWeight: 400 }}>a {p.phase}, {p.note}</b>
              <span>people</span><b style={{ fontWeight: 400 }}>about {Math.round(p.pop * 1000).toLocaleString('en-US')}</b>
              <span>age</span><b style={{ fontWeight: 400 }}>{p.era}</b>
              <span>under</span><b style={{ fontWeight: 400 }}>{p.owner >= 0 ? <button class={css.ref} onClick={() => actions.openArticle({ kind: 'nation', id: p.owner })}>{p.ownerName}</button> : 'no nation'}</b>
            </div>
          )}
          {p && p.events.length > 0 && <div style={{ marginTop: '8px' }}>{p.events.map((e) => (s.events[e] ? <div key={e} class={css.sub}><When year={s.events[e]!.simYear} />: {s.events[e]!.title}</div> : null))}</div>}
          <div style={{ marginTop: '8px' }}>
            <button class={css.link} onClick={() => actions.openArticle({ kind: 'place', id: town.id })}>its article</button>
            <button class={css.link} onClick={() => actions.setChrono(town.id, null)}>put it back in the present</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- forecasts

function ForecastsView() {
  const s = useStore();
  useEffect(() => {
    actions.askMemory({ what: 'forecasts' });
    const t = window.setInterval(() => actions.askMemory({ what: 'forecasts' }), 4000);
    return () => window.clearInterval(t);
  }, []);
  const f = s.memForecasts;
  if (!f) return <p class={css.sub}>Asking.</p>;
  const score = ([kept, failed]: [number, number]) => (kept + failed === 0 ? 'none settled yet' : `${kept} of ${kept + failed} came true`);
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>A scholar says what is coming. Some forecasts are reckoned from something that really is regular in this world (a comet that has come back before, a sea that has been rising for a century). Others are only said. The world decides which come true; this keeps the score.</p>
      <div class={css.split} style={{ borderTop: 'none', paddingTop: 0 }}>
        <div><b>Reckoned from a pattern</b><div>{score(f.reckoned)}</div></div>
        <div><b>Guessed</b><div>{score(f.guessed)}</div></div>
      </div>
      {f.forecasts.length === 0 && <p class={css.sub}>Nobody has made a forecast yet. It takes a nation that keeps written records.</p>}
      {[...f.forecasts].reverse().map((x) => (
        <div key={x.id} class={css.goal}>
          <div class={css.goalTitle}><b>{x.by}</b><span class={css.sub} style={{ color: x.outcome === 'kept' ? '#cfe6b4' : x.outcome === 'failed' ? '#f0a56a' : undefined }}>{x.outcome === 'open' ? 'not yet settled' : x.outcome === 'kept' ? 'came true' : 'did not happen'}</span></div>
          <div class={css.article}>"{x.text}"</div>
          <div class={css.sub}>{x.basis === 'reckoned' ? `Reckoned: ${x.from}.` : 'A guess: no reckoning was given.'} Said <When year={x.year} />{x.outcome === 'open' ? <>, to be settled by <When year={x.due} /></> : ''}.</div>
          <button class={css.link} onClick={() => actions.openArticle({ kind: 'nation', id: x.nation })}>whose scholar?</button>
          {(x.outcomeEvent >= 0 ? s.events[x.outcomeEvent] : s.events[x.eventId]) && <button class={css.link} onClick={() => update({ whyEvent: x.outcomeEvent >= 0 ? x.outcomeEvent : x.eventId, panel: 'none' })}>{x.outcome === 'kept' ? 'what made it true?' : 'in the chronicle'}</button>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- what if

/** Events that can be made to happen again by hand, and so can be taken away (the same rule the simulation uses). */
export const canUndo = (type: string): boolean => type === 'impact' || type === 'plague' || type === 'rogue-planet' || type === 'gamma-burst' || (type.startsWith('tool-') && type !== 'tool-species');

function WhatIfView() {
  const s = useStore();
  const w = s.whatIf, maps = s.whatIfMaps;
  const a = useRef<HTMLCanvasElement>(null), b = useRef<HTMLCanvasElement>(null), heat = useRef<HTMLCanvasElement>(null);
  const [at, setAt] = useState(0);
  useEffect(() => { if (maps) setAt(maps.heat.length - 1); }, [maps]);
  useEffect(() => {
    if (!maps || !w?.done) return;
    if (a.current) actions.drawCellBytes(a.current, maps.withMap);
    if (b.current) actions.drawCellBytes(b.current, maps.withoutMap);
    if (heat.current && maps.heat[at]) actions.drawCellBytes(heat.current, maps.withMap, maps.heat[at]);
  }, [maps, w?.done, at]);
  const recent = s.events.filter((e) => e && canUndo(e.type) && e.importance >= 1).slice(-10).reverse();
  const herd = w?.change.kind === 'herd';
  const it = herd ? 'the herd' : 'it';
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>An experiment with a control. Two copies of the world are started from the same saved moment and stepped forward in exactly the same way. In one the event happens; in the other it does not. Whatever differs afterwards is the work of that one event. Neither copy is the world on screen: a world run again never comes out quite the same, which is why the two re-runs are compared with each other.</p>
      {s.whatIfProblem && <p style={{ color: '#f0a56a' }}>{s.whatIfProblem}</p>}
      {w && (
        <div class={css.goal}>
          <div class={css.goalTitle}><b>{herd ? 'One small herd, spared' : `Without: ${w.change.title}`}</b><span class={css.sub}>{w.done ? 'done' : `${Math.round(w.progress * 100)}%`}</span></div>
          <div class={css.goalMeter}><i style={{ width: `${Math.round(w.progress * 100)}%` }} /></div>
          <div class={css.sub}>Both copies start <When year={w.from} /> and are taken to <When year={w.to} />{w.to > (s.stats?.simYear ?? 0) + 1 ? ' (past the present: the change is too recent to have done much yet)' : ''}.</div>
          {!w.done && <button class={css.link} onClick={() => actions.whatIf(-1)}>stop</button>}
        </div>
      )}
      {w?.done && (
        <>
          <div class={css.split} style={{ borderTop: 'none' }}>
            <div><b>With {it}</b><canvas ref={a} width={340} height={170} style={{ width: '100%', borderRadius: '6px', display: 'block', margin: '4px 0' }} /><div class={css.sub}>{w.with.species} kinds of animal, {Math.round(w.with.animals).toLocaleString('en-US')} animals{w.with.towns ? `, ${w.with.towns} towns` : ''}, {w.with.meanTemp.toFixed(1)} °C</div></div>
            <div><b>Without {it}</b><canvas ref={b} width={340} height={170} style={{ width: '100%', borderRadius: '6px', display: 'block', margin: '4px 0' }} /><div class={css.sub}>{w.without.species} kinds of animal, {Math.round(w.without.animals).toLocaleString('en-US')} animals{w.without.towns ? `, ${w.without.towns} towns` : ''}, {w.without.meanTemp.toFixed(1)} °C</div></div>
          </div>
          <div class={css.goalTitle}><b>What is different</b></div>
          {w.differences.map((d, i) => <div key={i} class={css.article} style={{ margin: '0 0 3px' }}>{d}</div>)}
          <div class={css.goalTitle} style={{ marginTop: '12px' }}><b>How the difference spread</b><span class={css.sub}>{maps?.heat[at] ? `${Math.round((w.spread[at]?.share ?? 0) * 100)}% of the planet differs` : ''}</span></div>
          <canvas ref={heat} width={680} height={340} style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
          <input type="range" min="0" max={Math.max(0, (maps?.heat.length ?? 1) - 1)} step="1" value={at} style={{ width: '100%' }} onInput={(e) => setAt(Number((e.target as HTMLInputElement).value))} />
          <div class={css.sub}>{w.spread[at] ? <>{Math.round(w.spread[at]!.year - Math.max(w.from, w.change.year)).toLocaleString('en-US')} years after the change. Bright is where the two copies differ: in what grows there, in how many animals live there, in who holds it. The checkpoints crowd toward the start, where the spreading happens.</> : ''}</div>
          <svg viewBox="0 0 680 60" style={{ width: '100%', display: 'block', marginTop: '4px' }}>
            <polyline fill="none" stroke="#f0a56a" stroke-width="1.5" points={w.spread.map((p, i) => `${(i / Math.max(1, w.spread.length - 1)) * 680},${58 - p.share * 56}`).join(' ')} />
            <circle cx={(at / Math.max(1, w.spread.length - 1)) * 680} cy={58 - (w.spread[at]?.share ?? 0) * 56} r="3" fill="#fff4d8" />
          </svg>
        </>
      )}
      <div class={css.goalTitle} style={{ marginTop: '12px' }}><b>Take one thing away</b></div>
      {recent.length === 0 && <p class={css.sub}>Nothing has happened yet that can be taken away. Impacts, plagues, a passing planet, a burst of radiation from a dying star, and anything done with the experiment tools can be.</p>}
      {recent.map((e) => (
        <div class={css.row} key={e.id}>
          <span>{e.title}<br /><span class={css.sub}><When year={e.simYear} /></span></span>
          <button class={css.btn} onClick={() => actions.whatIf(e.id)}>what if not?</button>
        </div>
      ))}
      <div class={css.goalTitle} style={{ marginTop: '12px' }}><b>The butterfly</b></div>
      <div class={css.row}>
        <span>Spare one small herd<br /><span class={css.sub}>Forty animals, under the centre of the view, that would otherwise have died. Then watch how far so small a thing reaches.</span></span>
        <button class={css.btn} onClick={() => actions.whatIfHerd()}>try it</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the documentary

function FilmView() {
  const s = useStore();
  const [record, setRecord] = useState(false);
  const weighty = s.events.filter((e) => e && e.importance >= 1).length;
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>Choose a length. The film takes the weightiest events of every stretch of this world's record, from the first life to the present, flies to where each one happened and tells it. Time stands still while it plays. The places are shown as they are now, not as they were then.</p>
      <div class={css.row}>
        <span>Save it as a video file as well<br /><span class={css.sub}>A .webm file, with the words on the picture and without sound.</span></span>
        <button class={css.btn} onClick={() => setRecord(!record)}>{record ? 'yes' : 'no'}</button>
      </div>
      {[1, 3, 10].map((m) => (
        <div class={css.row} key={m}>
          <span>{m === 1 ? 'One minute' : `${m} minutes`}<br /><span class={css.sub}>{Math.min(weighty, Math.round((m * 60) / 9))} scenes</span></span>
          <button class={css.btn} onClick={() => actions.playFilm(m, record)}>{record ? 'film it' : 'play'}</button>
        </div>
      ))}
      {weighty === 0 && <p class={css.sub}>Nothing has happened yet to make a film of.</p>}
    </div>
  );
}

/** The words of the film over the picture, and the way out of it. */
export function FilmOverlay() {
  const s = useStore();
  const f = s.film;
  if (!f) return null;
  const shot = f.shots[f.index];
  const total = f.minutes * 60;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'linear-gradient(to bottom, #0000 55%, #000c 100%)' }}>
      <div style={{ position: 'absolute', top: '14px', right: '16px', pointerEvents: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
        {f.recording && <span class={css.sub} style={{ color: '#ff7d6a' }}>● filming</span>}
        <span class={css.sub}>{f.index + 1} of {f.shots.length}</span>
        <button class={css.btn} onClick={() => actions.stopFilm()}>stop</button>
      </div>
      {shot && (
        <div key={shot.eventId} class={css.filmWords} style={{ animationDuration: `${shot.seconds}s` }}>
          <div class={css.sub} style={{ letterSpacing: '0.3em' }}>{formatYear(shot.year).toUpperCase()}</div>
          <h1>{shot.title}</h1>
          <p>{shot.text}</p>
        </div>
      )}
      <div style={{ height: '2px', background: '#ffffff22' }}><i style={{ display: 'block', height: '100%', background: '#fff4d8', width: `${shot ? ((shot.at + shot.seconds) / total) * 100 : 0}%`, transition: `width ${shot ? shot.seconds : 0}s linear` }} /></div>
    </div>
  );
}

export function Memory() {
  const s = useStore();
  const tab = TABS.find((t) => t[0] === s.memTab) ?? TABS[0]!;
  return (
    <div class={`${css.panel} ${css.side} ${css.wide}`}>
      <div class={css.head}><h2>The record</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        <div class={css.tabs}>
          {TABS.map(([id, name]) => <button key={id} class={id === s.memTab ? css.active : ''} onClick={() => update({ memTab: id })}>{name}</button>)}
        </div>
        <div class={css.sub} style={{ margin: '0 0 10px' }}>{tab[2]}</div>
        {s.memTab === 'archive' && <ArchiveView />}
        {s.memTab === 'atlas' && <AtlasView />}
        {s.memTab === 'braid' && <BraidView />}
        {s.memTab === 'records' && <RecordsView />}
        {s.memTab === 'ancestry' && <AncestryView />}
        {s.memTab === 'chronoscope' && <ChronoscopeView />}
        {s.memTab === 'forecasts' && <ForecastsView />}
        {s.memTab === 'whatif' && <WhatIfView />}
        {s.memTab === 'film' && <FilmView />}
      </div>
    </div>
  );
}
