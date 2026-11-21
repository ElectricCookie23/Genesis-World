// On the ground (expansion Section 5): a citizen's day and life, the anchor, the eyewitness, the museum, the
// battlefield, an animal's senses, and walking about. What is shown is asked of the simulation and read from what it
// keeps (sim/ground.ts); the page only draws it.
import { useEffect, useRef, useState } from 'preact/hooks';
import { actions, update, useStore, type GroundTab } from './store';
import { formatYear, hsl } from './format';
import { CreatureSketch } from './sketch';
import { Picture } from './art';
import type { AnchorState, Battle, Place } from '../sim/ground';
import css from './ui.module.css';

const TABS: [GroundTab, string, string][] = [
  ['citizen', 'A citizen', 'one ordinary person, through a day and a life'],
  ['anchor', 'Anchor', 'one spot, across all of history'],
  ['witness', 'Eyewitness', 'a great event, from where someone stood'],
  ['museum', 'Museum', 'what a nation keeps of what came before it'],
  ['battle', 'Battlefield', 'a war of the record, on the ground'],
  ['senses', 'Senses', 'the world as an animal senses it'],
  ['explore', 'Explore', 'walk anywhere, or lie back and look at the sky'],
];

function Ago({ year }: { year: number }) {
  const now = useStore().stats?.simYear ?? 0;
  const ago = now - year;
  if (ago >= 0 && ago < 200_000) return <span title={formatYear(year)}>{ago < 1.5 ? 'this year' : `${Math.round(ago).toLocaleString('en-US')} years ago`}</span>;
  return <span>{formatYear(year).toLowerCase()}</span>;
}

// ---------------------------------------------------------------------------------------------- a citizen

/** Where the places of a day lie on the little plan: a town seen from above, in the roughest terms. */
const SPOT: Record<Place, [number, number, string]> = {
  home: [70, 118, 'home'], fields: [34, 40, 'the fields'], workshops: [190, 126, 'workshops'], market: [150, 70, 'the market'], school: [232, 44, 'the school'], docks: [266, 112, 'the water'],
};

function CitizenView() {
  const s = useStore();
  const towns = s.settlements.filter((t) => t.ruined < 0).sort((a, b) => b.pop - a.pop).slice(0, 60);
  const c = s.gCitizen;
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [english, setEnglish] = useState(false);
  useEffect(() => { if (!c && towns.length) actions.meet(towns[0]!.id, 7); }, [towns.length]);
  useEffect(() => { setAt(0); }, [c?.name, c?.town]);
  useEffect(() => {
    if (!playing || !c) return;
    const t = window.setInterval(() => setAt((i) => { if (i >= c.day.length - 1) { setPlaying(false); return i; } return i + 1; }), 4200);
    return () => window.clearInterval(t);
  }, [playing, c]);
  if (!towns.length) return <p class={css.sub}>Nobody lives in a town yet.</p>;
  const stop = c?.day[Math.min(at, (c?.day.length ?? 1) - 1)];
  const town = c ? s.settlements.find((t) => t.id === c.town) : undefined;
  return (
    <div>
      <div class={css.row}>
        <select class={css.find} style={{ flex: 1, margin: 0 }} value={c?.town ?? -1} onChange={(e) => actions.meet(Number((e.target as HTMLSelectElement).value), 7)}>
          {towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button class={css.btn} onClick={() => c && actions.meet(c.town, c.index + 13)}>someone else</button>
      </div>
      {!c && <p class={css.sub}>Knocking.</p>}
      {c && stop && (
        <>
          <div class={css.goalTitle}><b style={{ fontSize: '21px' }}>{c.name}</b><span class={css.sub}>{c.age}, {c.trade}, of {c.townName}</span></div>
          <div class={css.sub}>Shares a home with {c.household.map((p) => `${p.name} (${p.age}, ${p.trade})`).join(', ')}.</div>
          {c.saying && (
            <div style={{ margin: '8px 0' }}>
              <div class={css.article} style={{ margin: 0, fontStyle: 'italic' }}>"{c.saying.text}"</div>
              <button class={css.link} onClick={() => setEnglish(!english)}>{english ? 'hide what it means' : 'what does that mean?'}</button>
              {english && <div class={css.sub}>{c.saying.gloss}<br />{c.saying.english}</div>}
            </div>
          )}
          <div class={css.goalTitle} style={{ marginTop: '10px' }}><b>Their day</b><span class={css.sub}>{String(stop.hour).padStart(2, '0')}:00</span></div>
          <svg viewBox="0 0 300 150" style={{ width: '100%', background: '#0c0e14', borderRadius: '8px', display: 'block' }} role="img" aria-label="A plan of the day">
            {c.day.slice(1).map((d, i) => { const a = SPOT[c.day[i]!.place], b = SPOT[d.place]; return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#ffffff22" stroke-dasharray="3 4" />; })}
            {(Object.keys(SPOT) as Place[]).filter((p) => c.day.some((d) => d.place === p)).map((p) => (
              <g key={p}><circle cx={SPOT[p][0]} cy={SPOT[p][1]} r="13" fill={p === stop.place ? '#f0c27a33' : '#ffffff0d'} stroke={p === stop.place ? '#f0c27a' : '#ffffff33'} /><text x={SPOT[p][0]} y={SPOT[p][1] + 26} fill="#ffffff99" font-size="9" text-anchor="middle">{SPOT[p][2]}</text></g>
            ))}
            <circle cx={SPOT[stop.place][0]} cy={SPOT[stop.place][1]} r="4.5" fill="#ffe2a8" style={{ transition: 'cx 1.4s ease, cy 1.4s ease' }} />
          </svg>
          <div class={css.row}>
            <button class={css.btn} onClick={() => { if (at >= c.day.length - 1) setAt(0); setPlaying(!playing); }}>{playing ? 'pause' : at >= c.day.length - 1 ? 'again' : 'follow the day'}</button>
            <input type="range" min="0" max={c.day.length - 1} step="1" value={at} style={{ flex: 1 }} onInput={(e) => { setPlaying(false); setAt(Number((e.target as HTMLInputElement).value)); }} />
          </div>
          <div class={css.article} style={{ margin: 0 }}>{c.name} {stop.doing}.</div>
          <div class={css.article} style={{ fontStyle: 'italic' }}>"{stop.thought}"</div>
          {stop.eventId !== undefined && s.events[stop.eventId] && <button class={css.link} onClick={() => update({ whyEvent: stop.eventId!, panel: 'none' })}>what are they thinking of?</button>}
          {town && <button class={css.link} onClick={() => { actions.flyToCell(town.cell, 0.02); }}>go to {c.townName}</button>}
          <div class={css.goalTitle} style={{ marginTop: '12px' }}><b>Their life</b></div>
          <div class={css.line}>
            {c.life.map((l, i) => (
              <div key={i} class={css.lineStep} style={{ borderColor: l.age < 0 ? '#8f96a8' : '#f0c27a', paddingBottom: '8px' }}>
                <i style={{ background: l.age < 0 ? '#8f96a8' : '#f0c27a' }} />
                <div class={css.sub}>{l.age < 0 ? `${-l.age} years before they were born` : `at ${l.age}`}</div>
                <div class={css.article} style={{ margin: 0 }}>{l.text}</div>
                {l.eventId !== undefined && s.events[l.eventId] && <button class={css.link} onClick={() => update({ whyEvent: l.eventId!, panel: 'none' })}>why did this happen?</button>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the anchor

const GROUND_COLOUR: Record<string, string> = { sea: '#1c4f8c', shallows: '#3f86a8', beach: '#d9c692', ice: '#e8eef4', tundra: '#9a9a84', forest: '#356a3c', grass: '#8ea24e', scrub: '#9c9058', desert: '#d6ba82', marsh: '#4d7460', rock: '#7c7770', lava: '#5a2c22' };
const BUILT = ['camp', 'village', 'town', 'city', 'great city'];

/** A picture of one state of a place: the ground it was, and what stood on it. Drawn, not rendered: the past is not kept as a world. */
export function AnchorPicture({ st }: { st: AnchorState }) {
  const ground = st.kind === 'ruin' || BUILT.includes(st.kind) ? (['sea', 'shallows'].includes(GROUND_FOR[st.biome] ?? '') ? 'grass' : GROUND_FOR[st.biome] ?? 'grass') : st.kind;
  const g = GROUND_COLOUR[ground] ?? '#7c7770';
  const built = BUILT.indexOf(st.kind);
  const rows = built < 0 ? 0 : [3, 6, 11, 17, 24][built]!;
  const tall = built < 0 ? 0 : [7, 10, 15, 26, 46][built]!;
  const wet = ground === 'sea' || ground === 'shallows';
  return (
    <svg viewBox="0 0 300 130" style={{ width: '100%', borderRadius: '8px', display: 'block' }} role="img" aria-label={st.label}>
      <rect width="300" height="130" fill={wet ? '#9cc4e4' : ground === 'ice' ? '#cfdde8' : '#a9c8e6'} />
      <rect y="78" width="300" height="52" fill={g} />
      {wet && [0, 1, 2, 3].map((k) => <path key={k} d={`M 0 ${88 + k * 10} q 15 -5 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0`} fill="none" stroke="#ffffff40" />)}
      {ground === 'forest' && Array.from({ length: 22 }, (_, k) => <path key={k} d={`M ${8 + k * 13.5} 80 l 6 ${-22 - (k % 3) * 6} l 6 ${22 + (k % 3) * 6} z`} fill="#234a2a" />)}
      {(ground === 'grass' || ground === 'scrub' || ground === 'marsh') && Array.from({ length: 30 }, (_, k) => <path key={k} d={`M ${6 + k * 10} ${84 + (k % 4) * 9} l 2 -6 l 2 6`} fill="none" stroke="#00000030" />)}
      {ground === 'desert' && <path d="M 0 96 q 40 -16 80 0 t 80 0 t 80 0 t 80 0 V 130 H 0 Z" fill="#00000012" />}
      {ground === 'ice' && <path d="M 0 78 l 40 -10 l 30 8 l 50 -14 l 40 12 l 60 -9 l 80 13 V 78 Z" fill="#f6fafc" />}
      {ground === 'lava' && Array.from({ length: 6 }, (_, k) => <path key={k} d={`M ${20 + k * 50} 100 q 10 -8 22 2`} fill="none" stroke="#ff7a3c" stroke-width="2" />)}
      {built >= 0 && Array.from({ length: rows }, (_, k) => {
        const x = 150 + (k - rows / 2) * (260 / Math.max(rows, 8)), h = 5 + ((k * 7) % 5) + (k % 4 === 0 ? tall : tall * 0.35);
        return <rect key={k} x={x} y={80 - h} width={Math.max(4, 200 / Math.max(rows, 10))} height={h} fill={built >= 3 && k % 4 === 0 ? '#d8cfbf' : '#b89b78'} stroke="#00000040" stroke-width="0.5" />;
      })}
      {built === 0 && <path d="M 146 80 l 4 -9 l 4 9" fill="#ffb24a" />}
      {st.kind === 'ruin' && Array.from({ length: 9 }, (_, k) => <path key={k} d={`M ${60 + k * 22} 80 v ${-4 - ((k * 5) % 9)} h 6 v ${2 + ((k * 3) % 5)} h 5 V 80 Z`} fill="#8d8474" stroke="#00000040" stroke-width="0.5" />)}
      {st.kind === 'ruin' && Array.from({ length: 6 }, (_, k) => <path key={k} d={`M ${70 + k * 34} 80 l 5 -15 l 5 15 z`} fill="#2f5a34" />)}
    </svg>
  );
}
const GROUND_FOR = ['sea', 'sea', 'shallows', 'beach', 'ice', 'tundra', 'forest', 'forest', 'grass', 'scrub', 'desert', 'grass', 'forest', 'marsh', 'rock', 'lava', 'ice', 'desert'];

function AnchorView() {
  const s = useStore();
  const a = s.gAnchor;
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (a) setAt(a.states.length - 1); }, [a?.cell, a?.states.length]);
  useEffect(() => {
    if (!playing || !a) return;
    const t = window.setInterval(() => setAt((i) => { if (i >= a.states.length - 1) { setPlaying(false); return i; } return i + 1; }), 900);
    return () => window.clearInterval(t);
  }, [playing, a]);
  const towns = s.settlements.slice().sort((x, y) => (y.peak ?? y.pop) - (x.peak ?? x.pop)).slice(0, 40);
  const st = a?.states[Math.min(at, (a?.states.length ?? 1) - 1)];
  const kinds = a ? new Set(a.states.map((x) => x.kind + x.name)).size : 0;
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>Drop an anchor and one spot is held still while all of its history runs past: what the ground was, what was built on it, what became of that. It is read from the log kept for every cell, and drawn, because the past is not kept as a world that could be flown through.</p>
      <div class={css.row}>
        <button class={css.btn} onClick={() => actions.dropAnchor()}>drop it under the view</button>
        <select class={css.find} style={{ flex: 1, margin: 0 }} value={-1} onChange={(e) => { const t = s.settlements.find((x) => x.id === Number((e.target as HTMLSelectElement).value)); if (t) actions.dropAnchor(t.cell); }}>
          <option value={-1}>or at a town</option>
          {towns.map((t) => <option key={t.id} value={t.id}>{t.name}{t.ruined >= 0 ? ' (a ruin)' : ''}</option>)}
        </select>
      </div>
      {a && st && (
        <>
          <AnchorPicture st={st} />
          <div class={css.row}>
            <button class={css.btn} onClick={() => { if (at >= a.states.length - 1) setAt(0); setPlaying(!playing); }}>{playing ? 'pause' : 'run it'}</button>
            <input type="range" min="0" max={a.states.length - 1} step="1" value={at} style={{ flex: 1 }} onInput={(e) => { setPlaying(false); setAt(Number((e.target as HTMLInputElement).value)); }} />
          </div>
          <div class={css.goalTitle}><b>{st.label}</b><span class={css.sub}>{at + 1} of {a.states.length}</span></div>
          <div class={css.sub}>From <Ago year={st.from} />{st.to >= 0 ? <> until <Ago year={st.to} /></> : ' to now'}{st.ownerName ? `, under ${st.ownerName}` : ''}.</div>
          {st.eventId >= 0 && s.events[st.eventId] && <button class={css.link} onClick={() => update({ whyEvent: st.eventId, panel: 'none' })}>{s.events[st.eventId]!.title}</button>}
          <button class={css.link} onClick={() => actions.flyToCell(a.cell, 0.03)}>go there</button>
          <div class={css.sub} style={{ marginTop: '6px' }}>This spot has been {kinds} different things.</div>
          <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', marginTop: '6px' }}>
            {a.states.map((x, i) => <i key={i} title={x.label} onClick={() => setAt(i)} style={{ flex: 1, cursor: 'pointer', background: BUILT.includes(x.kind) ? '#f0c27a' : x.kind === 'ruin' ? '#8d8474' : GROUND_COLOUR[x.kind] ?? '#777', opacity: i === at ? 1 : 0.55 }} />)}
          </div>
        </>
      )}
      {!a && <p class={css.sub}>No anchor is down.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the eyewitness

function WitnessView() {
  const s = useStore();
  const w = s.gWitness;
  const great = s.events.filter((e) => e && e.importance >= 2 && e.cellId >= 0).slice(-12).reverse();
  const e = w ? s.events[w.eventId] : undefined;
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>Every great event that happened somewhere was seen by someone: a person of the nearest town, or an animal that lives there. Choose one and you are put on the ground where they stood, facing it.</p>
      {w && e && (
        <div class={css.goal}>
          <div class={css.goalTitle}><b>{e.title}</b><span class={css.sub}><Ago year={e.simYear} /></span></div>
          <div class={css.sub}>As {w.kind === 'citizen' ? 'seen' : 'sensed'} by {w.who}, {w.km < 1 ? 'on the spot' : `${w.km.toLocaleString('en-US')} km away`}.</div>
          <div class={css.article} style={{ fontStyle: 'italic', marginTop: '6px' }}>"{w.line}"</div>
          <button class={css.link} onClick={() => update({ whyEvent: w.eventId, panel: 'none' })}>why did this happen?</button>
          {w.ref && <button class={css.link} onClick={() => actions.openArticle(w.ref!)}>{w.kind === 'citizen' ? 'their town' : 'their kind'}</button>}
          <button class={css.link} onClick={() => actions.eyewitness(w.eventId)}>stand there again</button>
        </div>
      )}
      {s.gWitness === null && s.groundTab === 'witness' && great.length === 0 && <p class={css.sub}>Nothing great enough has happened yet.</p>}
      {great.map((x) => (
        <div class={css.row} key={x.id}>
          <span>{x.title}<br /><span class={css.sub}><Ago year={x.simYear} /></span></span>
          <button class={css.btn} onClick={() => actions.eyewitness(x.id)}>from the ground</button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the museum

function MuseumView() {
  const s = useStore();
  const [english, setEnglish] = useState(false);
  const nations = s.realms.slice().sort((a, b) => b.pop - a.pop);
  const m = s.gMuseum;
  useEffect(() => { if (!m && nations.length) actions.openMuseum(nations[0]!.id); }, [nations.length]);
  if (!nations.length) return <p class={css.sub}>There are no nations yet, and so no museums.</p>;
  return (
    <div>
      <select class={css.find} value={m?.asked ?? -1} onChange={(e) => actions.openMuseum(Number((e.target as HTMLSelectElement).value))}>
        {nations.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
      {!m && <p class={css.sub}>Asking at the door.</p>}
      {m && !m.data && <p class={css.sub}>This nation keeps no museum. A people begins to collect what came before it about when it begins to print.</p>}
      {m?.data && (
        <>
          <div class={css.goalTitle}><b style={{ fontSize: '20px' }}>{m.data.name}</b><span class={css.sub}>open since <Ago year={m.data.since} /></span></div>
          <div class={css.row} style={{ padding: '2px 0 6px' }}>
            <span class={css.sub}>The cards are written in the language of the place.</span>
            <button class={css.btn} onClick={() => setEnglish(!english)}>{english ? 'as written' : 'translate'}</button>
          </div>
          {m.data.rooms.map((room) => (
            <div key={room.title}>
              <div class={css.toolGroup}><b>{room.title}</b><span class={css.sub}>{room.about}</span></div>
              {room.exhibits.map((x, i) => (
                <div key={i} class={css.exhibit}>
                  {x.painting && <div style={{ flex: 'none' }}><Picture p={x.painting} width={150} /></div>}
                  {x.genes && <div style={{ background: '#e9e1cf', borderRadius: '6px', padding: '4px', width: 'fit-content', flex: 'none' }}><CreatureSketch genes={Float32Array.from(x.genes)} width={120} seed={i + 3} /></div>}
                  <div>
                    <div class={css.sub} style={{ letterSpacing: '0.06em' }}>{english ? x.gloss : x.own}</div>
                    <b>{x.title}</b>
                    <div class={css.article} style={{ margin: '2px 0 4px' }}>{x.label}</div>
                    {x.ref && <button class={css.link} onClick={() => actions.openArticle(x.ref!)}>its article</button>}
                    {x.eventId !== undefined && s.events[x.eventId] && <button class={css.link} onClick={() => update({ whyEvent: x.eventId!, panel: 'none' })}>what happened?</button>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the battlefield

/** Where each soldier of a host stands at a moment of the fight (0 the start .. 1 the end): the same every time. */
export function battleDots(b: Battle, t: number): { x: number; y: number; side: 0 | 1 }[] {
  const out: { x: number; y: number; side: 0 | 1 }[] = [];
  const rand = (k: number) => { const x = Math.sin((b.seed % 10007) * 0.001 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const count = (men: number) => Math.max(8, Math.min(90, Math.round(Math.sqrt(men) * 1.3)));
  const meet = Math.min(1, t / 0.45), after = Math.max(0, (t - 0.55) / 0.45);
  [b.attacker, b.defender].forEach((host, side) => {
    const n = count(host.men), cols = Math.ceil(Math.sqrt(n * 2.2));
    const loose = host.formation.includes('crowd') || host.formation.includes('no line') ? 1 : 0.25;
    const wins = (b.won ? b.won === 'attacker' : b.result === 'taken') === (side === 0);
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const fx = (side === 0 ? 30 : 270) + (side === 0 ? -1 : 1) * row * 7, fy = 20 + (col + 0.5) * (90 / cols);
      // they close on the middle, then the losing side runs back past where it started
      let x = fx + (side === 0 ? 1 : -1) * meet * (105 - row * 2), y = fy + (rand(i + side * 500) - 0.5) * 16 * loose;
      if (after > 0) x += wins ? (side === 0 ? 1 : -1) * after * 40 : (side === 0 ? -1 : 1) * after * (120 + rand(i + 900 + side * 500) * 60);
      if (after > 0 && !wins) y += (rand(i + 77 + side * 500) - 0.5) * 50 * after;
      out.push({ x, y, side: side as 0 | 1 });
    }
  });
  return out;
}

function BattleView() {
  const s = useStore();
  const b = s.gBattle;
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!b) return;
    setT(0);
    const start = performance.now();
    const tick = window.setInterval(() => { const x = Math.min(1, (performance.now() - start) / 14000); setT(x); if (x >= 1) window.clearInterval(tick); }, 80);
    return () => window.clearInterval(tick);
  }, [b?.eventId]);
  const wars = s.events.filter((e) => e && (e.type === 'war' || e.type === 'civil-war')).slice(-12).reverse();
  const phase = b ? Math.min(b.phases.length - 1, Math.floor(t * b.phases.length)) : 0;
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>A war from the record, laid out on the field. Where the war was fought as a campaign, each battle is shown from the campaign's own record: how many each side brought, who won, what decided it and what it cost. For older wars the numbers come from the two towns as they were that year. The weapons are what each side knew. This is a plan of the field, not a view from inside it.</p>
      {b && (
        <div class={css.goal}>
          <div class={css.goalTitle}><b>{b.title}</b><span class={css.sub}><Ago year={b.year} /></span></div>
          <svg viewBox="0 0 300 130" style={{ width: '100%', background: '#3b4a2c', borderRadius: '8px', display: 'block', margin: '6px 0' }} role="img" aria-label="The field">
            <rect x="282" y="34" width="14" height="62" fill="#8d8474" stroke="#00000055" />
            <text x="289" y="28" fill="#ffffffaa" font-size="8" text-anchor="middle">{b.defender.town}</text>
            {battleDots(b, t).map((d, i) => <circle key={i} cx={Math.max(3, Math.min(297, d.x))} cy={Math.max(4, Math.min(126, d.y))} r="2.1" fill={hsl(d.side === 0 ? b.attacker.hue : b.defender.hue, 80, d.side === 0 ? 70 : 55)} stroke="#00000066" stroke-width="0.4" />)}
          </svg>
          <div class={css.split} style={{ borderTop: 'none', padding: '0 0 6px' }}>
            <div><b style={{ color: hsl(b.attacker.hue, 80, 74) }}>{b.attacker.name}</b><div class={css.sub}>{b.attacker.men.toLocaleString('en-US')}, {b.attacker.arms}, in {b.attacker.formation}</div></div>
            <div><b style={{ color: hsl(b.defender.hue, 80, 62) }}>{b.defender.name}</b><div class={css.sub}>{b.defender.men.toLocaleString('en-US')}, {b.defender.arms}, in {b.defender.formation}</div></div>
          </div>
          {b.phases.slice(0, phase + 1).map((p, i) => <div key={i} class={css.article} style={{ margin: '0 0 3px', opacity: i === phase ? 1 : 0.7 }}>{p}</div>)}
          {t >= 1 && <div style={{ marginTop: '4px' }}><b>{b.result === 'taken' ? `${b.defender.town} fell.` : `${b.defender.town} held.`}</b> <span class={css.sub}>{b.campaign ? 'The numbers, the winner and what decided it are the campaign\'s own record of this fight.' : 'That is what the record says, and what the map shows after it.'}</span></div>}
          {b.campaign && b.campaign.length > 1 && (
            <div style={{ margin: '6px 0' }}>
              <div class={css.sub}>The battles of this war, in order:</div>
              {b.campaign.map((c) => (
                <div class={css.row} key={c.year + c.town + c.kind} style={{ opacity: c.shown ? 1 : 0.8 }}>
                  <span>{c.kind === 'field' ? 'In the field near' : c.kind === 'siege' ? 'The siege of' : c.kind === 'storm' ? 'The storming of' : 'The raid on'} {c.town}<br /><span class={css.sub}><Ago year={c.year} />, {c.taken ? 'the town was taken' : c.won === 'attacker' ? 'the attackers had the field' : 'the defenders held'}</span></span>
                  {c.shown ? <span class={css.sub}>shown above</span> : c.eventId >= 0 && <button class={css.btn} onClick={() => actions.openBattle(c.eventId)}>on the field</button>}
                </div>
              ))}
            </div>
          )}
          <button class={css.link} onClick={() => actions.openBattle(b.eventId)}>again</button>
          <button class={css.link} onClick={() => actions.eyewitness(b.eventId)}>someone who was there</button>
          <button class={css.link} onClick={() => actions.openArticle({ kind: 'war', id: b.eventId })}>its article</button>
        </div>
      )}
      {wars.length === 0 && <p class={css.sub}>There has been no war yet.</p>}
      {wars.map((w) => (
        <div class={css.row} key={w.id}>
          <span>{w.title}<br /><span class={css.sub}><Ago year={w.simYear} /></span></span>
          <button class={css.btn} onClick={() => actions.openBattle(w.id)}>on the field</button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- senses

function SensesView() {
  const s = useStore();
  const living = [...s.species.values()].filter((sp) => sp.extinctYear < 0).sort((a, b) => b.pop - a.pop).slice(0, 80);
  const v = s.seeingAs;
  const sp = v ? s.species.get(v.species) : undefined;
  const bar = (label: string, x: number) => <><span>{label}</span><b style={{ fontWeight: 400 }}><span class={css.goalMeter} style={{ display: 'inline-block', width: '140px', margin: 0 }}><i style={{ width: `${Math.round(x * 100)}%` }} /></span></b></>;
  return (
    <div>
      <p class={css.sub} style={{ marginTop: 0 }}>What an animal makes of the world is read from its genes: how sharp its eyes are, how much colour they take in, how well they work in the dark, and whether it finds its way by sight at all, or by echoes, by warmth, or by the electric field of living things. Choose one and the whole picture changes to match.</p>
      <select class={css.find} value={v?.species ?? -1} onChange={(e) => actions.seeAs(Number((e.target as HTMLSelectElement).value))}>
        <option value={-1}>our own eyes</option>
        {living.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {!living.length && <p class={css.sub}>No animals yet.</p>}
      {v && sp && (
        <>
          <div style={{ background: '#e9e1cf', borderRadius: '8px', padding: '6px', width: 'fit-content', margin: '4px 0 8px' }}><CreatureSketch genes={sp.genes} width={200} seed={sp.id + 1} /></div>
          <div class={css.article}>{v.text}</div>
          <div class={css.kv}>
            <span>finds its way by</span><b style={{ fontWeight: 400 }}>{v.mode === 'sight' ? 'sight' : v.mode === 'echo' ? 'echoes' : v.mode === 'heat' ? 'warmth' : 'the electric sense'}</b>
            {bar('sharpness', v.acuity)}{bar('colour', v.colour)}{bar('in the dark', v.night)}{bar('how far round', v.field)}
          </div>
          <div style={{ marginTop: '8px' }}>
            <button class={css.link} onClick={() => actions.selectSpecies(sp.id)}>find one and follow it</button>
            <button class={css.link} onClick={() => actions.seeAs(-1)}>back to our own eyes</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- explore

function ExploreView() {
  const s = useStore();
  return (
    <div>
      <div class={css.row}>
        <span>Walk anywhere<br /><span class={css.sub}>{s.mobile ? 'A pad appears on screen: push it the way you want to go.' : 'W A S D or the arrow keys to walk, R and F to rise and sink, drag to look around, Esc to stop.'} The world is one piece: walk out of a town into the forest and nothing loads.</span></span>
        <button class={css.btn} onClick={() => actions.setWalking(!s.walking)}>{s.walking ? 'stop' : 'walk'}</button>
      </div>
      <div class={css.row}>
        <span>The night sky from here<br /><span class={css.sub}>Stand on the ground under the centre of the view at midnight and look up: the moon in its real phase, the ring if there is one, any comet the chronicle has reported, and the figures peoples have named among the stars.</span></span>
        <button class={css.btn} onClick={() => actions.setSkyView(!s.skyView)}>{s.skyView ? 'stop' : 'look up'}</button>
      </div>
    </div>
  );
}

/** What shows over the picture while walking, looking at the sky, or seeing as an animal sees. */
export function GroundHud() {
  const s = useStore();
  const [labels, setLabels] = useState<{ text: string; x: number; y: number }[]>([]);
  const padRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!s.skyView) { setLabels([]); return; }
    const t = window.setInterval(() => setLabels(actions.skyLabels()), 250);
    return () => window.clearInterval(t);
  }, [s.skyView]);
  if (!s.walking && !s.skyView && !s.seeingAs) return null;
  const sp = s.seeingAs ? s.species.get(s.seeingAs.species) : undefined;
  const push = (e: PointerEvent) => {
    const el = padRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2, y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    actions.walkInput(Math.max(-1, Math.min(1, -y)), Math.max(-1, Math.min(1, x)));
  };
  return (
    <>
      {labels.map((l, i) => <div key={i} class={css.skyLabel} style={{ left: `${l.x}px`, top: `${l.y}px` }}>{l.text}</div>)}
      <div class={`${css.panel} ${css.hud}`}>
        {s.walking && <span>Walking. {s.mobile ? 'Push the pad.' : 'W A S D to move, R and F to rise and sink, drag to look.'} <button class={css.link} onClick={() => actions.setWalking(false)}>stop</button></span>}
        {s.skyView && <span>The sky at midnight from where you stand. Drag to turn. <button class={css.link} onClick={() => actions.setSkyView(false)}>stop</button></span>}
        {s.seeingAs && <span>Seeing as {sp?.name ?? 'an animal'} does{s.seeingAs.mode !== 'sight' ? `: by ${s.seeingAs.mode === 'echo' ? 'echoes' : s.seeingAs.mode === 'heat' ? 'warmth' : 'the electric sense'}` : ''}. <button class={css.link} onClick={() => actions.seeAs(-1)}>our own eyes</button></span>}
      </div>
      {s.walking && s.mobile && (
        <div ref={padRef} class={css.pad} onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); push(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') push(e); }} onPointerUp={() => actions.walkInput(0, 0)} onPointerCancel={() => actions.walkInput(0, 0)}><i /></div>
      )}
    </>
  );
}

export function Ground() {
  const s = useStore();
  const tab = TABS.find((t) => t[0] === s.groundTab) ?? TABS[0]!;
  return (
    <div class={`${css.panel} ${css.side} ${css.wide}`} style={{ width: 'min(560px, calc(100vw - 32px))' }}>
      <div class={css.head}><h2>On the ground</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        <div class={css.tabs}>
          {TABS.map(([id, name]) => <button key={id} class={id === s.groundTab ? css.active : ''} onClick={() => update({ groundTab: id })}>{name}</button>)}
        </div>
        <div class={css.sub} style={{ margin: '0 0 10px' }}>{tab[2]}</div>
        {s.groundTab === 'citizen' && <CitizenView />}
        {s.groundTab === 'anchor' && <AnchorView />}
        {s.groundTab === 'witness' && <WitnessView />}
        {s.groundTab === 'museum' && <MuseumView />}
        {s.groundTab === 'battle' && <BattleView />}
        {s.groundTab === 'senses' && <SensesView />}
        {s.groundTab === 'explore' && <ExploreView />}
      </div>
    </div>
  );
}
