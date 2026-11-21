// The star system panel (expansion section 10): the planets around this star, the star's age, the stars that ships
// have been sent to, and what has come back. Drawn as plain SVG so it costs a phone nothing.
import { useEffect, useRef, useState } from 'preact/hooks';
import { actions, update, useStore } from './store';
import { formatYear, hsl, shortYear } from './format';
import { LIFE_STAGES, MAP_H, MAP_W, type CosmosInfo, type Report } from '../sim/cosmos';
import { ENDING_TEXT } from '../sim/future';
import css from './ui.module.css';

const KIND = { rock: 'a bare rocky world', giant: 'a gas giant', ice: 'an ice world' } as const;
const STAGES: Record<string, string> = { barren: 'still lifeless', microbes: 'microbes in its seas', algae: 'green seas, nothing that moves', animals: 'animals' };
const MAP_COLOURS = ['#1c3f63', '#8a7a55', '#e9eef2', '#5f5446'];

/**
 * One sign of a people's writing in lights: strokes between the points of a three by three grid, chosen by the
 * number the simulation made from the word. The same word is always the same sign.
 */
const STROKES: [number, number, number, number][] = [
  [0, 0, 1, 0], [1, 0, 2, 0], [0, 1, 1, 1], [1, 1, 2, 1], [0, 2, 1, 2], [1, 2, 2, 2],
  [0, 0, 0, 1], [0, 1, 0, 2], [1, 0, 1, 1], [1, 1, 1, 2], [2, 0, 2, 1], [2, 1, 2, 2],
];
export function Glyphs({ signs, size = 14, colour = '#ffd9a0', perRow = 10 }: { signs: number[]; size?: number; colour?: string; perRow?: number }) {
  const step = size * 1.45, line = size + 6;
  const cols = Math.min(perRow, signs.length), rows = Math.ceil(signs.length / perRow);
  return (
    <svg width={cols * step} height={rows * line} viewBox={`0 0 ${cols * step} ${rows * line}`} style={{ display: 'block', maxWidth: '100%', margin: '0 auto 0 0', filter: `drop-shadow(0 0 3px ${colour})` }} role="img" aria-label="A message written in lights">
      {signs.map((g, k) => {
        // every sign has at least two strokes
        const bits = g | (1 << (g % 12)) | (1 << ((g >> 4) % 12));
        const ox = (k % perRow) * step + 2, oy = Math.floor(k / perRow) * line + 2;
        return STROKES.map(([x0, y0, x1, y1], i) => ((bits >> i) & 1 ? <line key={`${k}-${i}`} x1={ox + x0 * size / 2} y1={oy + y0 * size / 2} x2={ox + x1 * size / 2} y2={oy + y1 * size / 2} stroke={colour} stroke-width="1.4" stroke-linecap="round" /> : null));
      })}
    </svg>
  );
}

/** A message that has just been sent to the stars, held over the town that sent it. */
export function SkyMessage() {
  const s = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const m = s.skyMessage ? s.skyMessages[s.skyMessage.id] : undefined;
  useEffect(() => {
    if (!m) return;
    let raf = 0;
    const dir = actions.cellDir(m.cell);
    const tick = () => {
      const el = ref.current;
      if (el) {
        const [x, y, vis] = actions.project(dir[0], dir[1], dir[2]);
        el.style.opacity = String(Math.max(0.0, vis));
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -115%)`;
      }
      if (s.skyMessage && performance.now() > s.skyMessage.until) update({ skyMessage: null });
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  if (!m) return null;
  return (
    <div ref={ref} style={{ position: 'absolute', left: 0, top: 0, opacity: 0, pointerEvents: 'auto', cursor: 'pointer', textAlign: 'center', maxWidth: '300px' }} onClick={() => update({ panel: 'system', skyMessage: null })} title="A message sent to the stars. Click to read it.">
      <div style={{ display: 'inline-block' }}><Glyphs signs={m.glyphs} size={13} perRow={8} /></div>
      <div class={css.sub} style={{ marginTop: '3px' }}>{m.town} is sending this to the stars</div>
    </div>
  );
}

/** Planets on their orbits, turning by CSS alone. Distances are squeezed so the outer worlds fit. */
function Orrery({ c }: { c: CosmosInfo }) {
  const far = Math.max(...c.bodies.map((b) => b.au));
  const radius = (au: number) => 20 + 76 * Math.log(1 + au * 1.8) / Math.log(1 + far * 1.8);
  // one home year is a few seconds here; the outer worlds are slowed less than they should be so they can be seen to move
  const seconds = (period: number) => 14 * Math.pow(period, 0.6);
  const star = c.starPhase === 2 ? '#ff7a3c' : c.starPhase === 1 ? '#ffc27a' : '#fff1c9';
  const starR = Math.min(17, 5 * Math.pow(c.swell, 0.55));
  const worlds = [
    { name: 'this world', au: c.au, period: Math.pow(c.au, 1.5), phase: 0.13, r: 3.2, fill: '#6fb7d8', home: true, alive: 0 },
    ...c.bodies.map((b) => ({ name: b.name, au: b.au, period: b.period, phase: b.phase, r: 1.6 + Math.sqrt(b.size) * 1.5, fill: b.kind === 'giant' ? hsl(b.hue * 360, 45, 62) : b.kind === 'ice' ? '#bfe3ee' : '#a58c7a', home: false, alive: b.life })),
  ];
  // the comet's long path, turned to where the giant's slow cycle has brought it
  const comet = radius(far) * 0.98;
  return (
    <svg viewBox="-104 -104 208 208" style={{ width: '100%', maxHeight: '300px', display: 'block' }} role="img" aria-label="The star system">
      <circle r={starR * 2.2} fill={star} opacity="0.12" />
      <circle r={starR} fill={star} />
      <ellipse cx={comet * 0.42} cy="0" rx={comet * 0.58} ry={comet * 0.2} fill="none" stroke="#ffffff38" stroke-width="0.5" stroke-dasharray="1.5 2.5" transform={`rotate(${(c.giantPhase * 360).toFixed(1)})`} />
      {worlds.map((w) => {
        const r = radius(w.au), d = seconds(w.period);
        return (
          <g key={w.name}>
            <circle r={r} fill="none" stroke={w.home ? '#ffffff55' : '#ffffff22'} stroke-width="0.5" />
            <g style={{ animation: `${css.orbit} ${d.toFixed(1)}s linear infinite`, animationDelay: `${(-w.phase * d).toFixed(1)}s` }}>
              {w.alive > 0 && <circle cx={r} cy="0" r={w.r + 1.8} fill="none" stroke="#9fdc8a" stroke-width="0.7" opacity="0.8" />}
              <circle cx={r} cy="0" r={w.r} fill={w.fill} />
              {w.home && <circle cx={r} cy="0" r={w.r + 2.2} fill="none" stroke="#ffffffaa" stroke-width="0.5" />}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** The nearby stars, with the ships sent to them along the way. */
function StarMap({ c, year, radio, firstWords }: { c: CosmosInfo; year: number; radio: number; firstWords: string }) {
  const far = Math.max(...c.stars.map((s) => s.ly));
  const at = (ly: number, angle: number): [number, number] => { const r = 14 + 80 * (ly / far); return [Math.cos(angle) * r, Math.sin(angle) * r]; };
  return (
    <svg viewBox="-104 -104 208 208" style={{ width: '100%', maxHeight: '300px', display: 'block' }} role="img" aria-label="Nearby stars and the ships sent to them">
      {radio >= 0 && year - radio > 0.5 && (
        // every broadcast this people ever made is still on its way out: a shell one light year wider each year
        <g><circle r={Math.min(100, 14 + 80 * ((year - radio) / far))} fill="#7fb8ff10" stroke="#7fb8ff70" stroke-width="0.5" stroke-dasharray="2 2" /><title>{`Their signals have travelled ${Math.round(year - radio).toLocaleString('en-US')} light years. The first: ${firstWords}`}</title></g>
      )}
      <circle r="2.6" fill="#fff1c9" />
      {c.stars.map((s, i) => {
        const [x, y] = at(s.ly, s.angle);
        const fleet = c.fleets.find((f) => f.star === i);
        return (
          <g key={s.name}>
            {fleet && <line x1="0" y1="0" x2={x} y2={y} stroke="#ffffff30" stroke-width="0.5" stroke-dasharray="1 2" />}
            <circle cx={x} cy={y} r={fleet?.reported ? 2.2 : 1.5} fill={fleet?.reported ? '#9fdc8a' : '#cfd6e6'} />
            <text x={x} y={y - 4} text-anchor="middle" font-size="5.2" fill="#ffffffb0">{s.name}</text>
          </g>
        );
      })}
      {c.fleets.filter((f) => !f.arrived).map((f) => {
        const s = c.stars[f.star]!;
        const t = Math.max(0, Math.min(1, (year - f.launched) / Math.max(1, f.arrives - f.launched)));
        const [x, y] = at(s.ly, s.angle);
        return <circle key={f.id} cx={x * t} cy={y * t} r={f.kind === 'ark' ? 1.5 : 1} fill="#ffd27a" />;
      })}
    </svg>
  );
}

function WorldPicture({ r }: { r: Report }) {
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: '108px', flex: 'none', borderRadius: '4px', display: 'block' }} shape-rendering="crispEdges" role="img" aria-label={`A map of the world at ${r.star}`}>
      <rect width={MAP_W} height={MAP_H} fill={MAP_COLOURS[0]} />
      {r.map.map((k, i) => (k ? <rect key={i} x={i % MAP_W} y={Math.floor(i / MAP_W)} width="1" height="1" fill={MAP_COLOURS[k]} /> : null))}
    </svg>
  );
}

export function System() {
  const s = useStore();
  const c = s.cosmos;
  const [open, setOpen] = useState(-1);
  const [code, setCode] = useState('');
  const year = s.stats?.simYear ?? 0;
  if (!c) return null;
  const toComet = c.nextComet - year;
  const shift = (c.au - 1) * 100;
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>{c.starName} and its worlds</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        <Orrery c={c} />
        <p class={css.sub} style={{ marginTop: '2px' }}>
          {c.starPhase === 0 ? `${c.starName} is in its long steady life.` : c.starPhase === 1 ? `${c.starName} has begun to swell. It will not stop.` : `${c.starName} is a red giant, ${c.swell.toFixed(0)} times its old size in the sky.`}
          {Math.abs(shift) > 0.05 && ` This world now circles ${Math.abs(shift).toFixed(1)}% ${shift > 0 ? 'further out' : 'closer in'} than when it formed.`}
        </p>
        {c.bodies.map((b) => (
          <div class={css.goal} key={b.name}>
            <div class={css.goalTitle}><b>{b.name}</b><span class={css.sub}>{KIND[b.kind]}</span></div>
            <div class={css.sub}>
              {b.au < c.au ? 'closer to the star' : `${(b.au / c.au).toFixed(1)} times as far from the star`}; its year is {b.period < 2 ? `${b.period.toFixed(2)} of ours` : `${b.period.toFixed(0)} of ours`}.
              {b.kind === 'giant' && ` Its slow cycle of ${shortYear(c.giantCycle)} sends the comet inward: ${toComet > 0 ? `next in ${shortYear(toComet)}` : 'it is due'}.`}
              {b.lifeStage > 0 && ` Alive: ${LIFE_STAGES[b.lifeStage]}, since ${formatYear(b.lifeSince)}. It came from here.`}
            </div>
          </div>
        ))}
        {(c.flybys > 0 || c.bursts > 0) && (
          <p class={css.sub} style={{ marginTop: '8px' }}>
            {c.flybys > 0 && `${c.flybys === 1 ? 'A wandering planet has' : `${c.flybys} wandering planets have`} passed through this system. `}
            {c.bursts > 0 && `${c.bursts === 1 ? 'One dying star has' : `${c.bursts} dying stars have`} burned a side of this world.`}
          </p>
        )}
        {s.strange && (
          <div class={css.goal}>
            <div class={css.goalTitle}><b>This world</b><span class={css.sub}>pulse {s.strange.pulse.rate}</span></div>
            <div class={css.sub}>
              {s.strange.poleFlip > 0 ? 'The magnetic field is turning over: the auroras have left the poles and wander.' : `The magnetic field is steady${s.strange.poleSign < 0 ? ', the other way up from how it began' : ''}.`}
              {' '}A swarm of falling stars crosses its path every {s.strange.swarm.period.toLocaleString('en-US')} years
              {year < 5e6 || s.strange.swarm.next - year > s.strange.swarm.period * 1.5 ? '.' : `; the next is ${Math.max(0, Math.round(s.strange.swarm.next - year)).toLocaleString('en-US')} years off.`}
              {s.strange.swarm.stage === 1 && ' Its people tell stories about it.'}
              {s.strange.swarm.stage === 2 && ' Its people have worked out the year.'}
              {s.strange.swarm.stage === 3 && ' Its people are ready for it.'}
              {s.strange.swarm.survived > 0 && ` They have come through ${s.strange.swarm.survived} of them prepared.`}
            </div>
            {s.strange.hive && <div class={css.sub} style={{ marginTop: '3px' }}>{s.species.get(s.strange.hive.species)?.name ?? 'A small animal'} lives as one joined colony across {s.strange.hive.regions} countries{s.strange.hive.awake ? ', and it thinks.' : `; ${Math.round(s.strange.hive.mind * 100)}% of the way to a mind of its own.`}</div>}
            {s.strange.blooms > 0 && <div class={css.sub} style={{ marginTop: '3px' }}>{s.strange.blooms === 1 ? 'One kind of plant here drugs' : `${s.strange.blooms} kinds of plant here drug`} the animals that feed on it.</div>}
            {s.strange.mimics.length > 0 && <div class={css.sub} style={{ marginTop: '3px' }}>{s.strange.mimics.map((id) => s.species.get(id)?.name ?? 'An animal').join(', ')} build{s.strange.mimics.length === 1 ? 's' : ''} nests like the ruins they live among.</div>}
            <div style={{ marginTop: '4px' }}>
              <button class={css.link} onClick={() => update({ panel: 'section' })}>the layers in the rock</button>
              <button class={css.link} onClick={() => update({ panel: 'microscope' })}>under the lens</button>
            </div>
          </div>
        )}
        {s.industry && s.industry.deposits.length > 0 && (
          <div class={css.goal}>
            <div class={css.goalTitle}><b>What they burn</b><span class={css.sub}>{s.industry.warming > 0.05 ? `${s.industry.warming.toFixed(1)}° of warming so far` : ''}</span></div>
            {s.industry.deposits.map((d) => (
              <div class={css.sub} key={d.eventId} style={{ marginTop: '3px' }}>
                <button class={css.link} style={{ marginRight: '6px' }} onClick={() => update({ whyEvent: d.eventId, panel: 'none' })}>{d.kind === 'coal' ? 'A coal field' : 'An oil field'}</button>
                {d.kind === 'coal' ? `formed from ${d.source}, ${shortYear(year - d.from)} to ${shortYear(year - d.to)} ago.` : `formed from ${d.source}.`}
              </div>
            ))}
            <div class={css.sub} style={{ marginTop: '5px' }}>
              {s.industry.electric > 0 && `${Math.round(s.industry.electric * 100)}% of their towns are lit by electricity. `}
              {s.industry.network > 0 && `${Math.round(s.industry.network * 100)}% of the great towns are joined by cable. `}
              {s.industry.moonBase && 'They have a base on the moon. '}
              {s.industry.skyClosedUntil > year && `A shell of wreckage has closed the sky for another ${Math.round(s.industry.skyClosedUntil - year).toLocaleString('en-US')} years. `}
              {s.industry.defence && `They watch for falling rocks${s.industry.deflected ? ` and have turned ${s.industry.deflected} aside` : ''}. `}
              {s.industry.council && `A council of ${s.industry.council.members} countries has sat since ${formatYear(s.industry.council.since)}${s.industry.council.decisions.length ? `; it has decided ${s.industry.council.decisions.join('; ')}` : ''}.`}
            </div>
          </div>
        )}
        {s.future && (s.future.ring > 0 || s.future.arcologies > 0 || s.future.machines || s.future.uploaded > 0 || s.future.shade > 0 || s.future.projects > 0 || s.future.ending || Object.keys(s.future.origins).length > 0) && (
          <div class={css.goal}>
            <div class={css.goalTitle}><b>What its people have made of it</b></div>
            {s.future.ending && <div><b style={{ font: "500 15px 'Cormorant Garamond', serif" }}>{ENDING_TEXT[s.future.ending][0]}.</b> <span class={css.sub}>{ENDING_TEXT[s.future.ending][1]}</span></div>}
            <div class={css.sub} style={{ marginTop: '3px' }}>
              {s.future.ring === 1 && 'A cable hangs from orbit to an anchor on the equator. '}
              {s.future.ring === 2 && 'A ring of stations circles the world above the equator, with a cable down to the ground. '}
              {s.future.arcologies > 0 && `${s.future.arcologies === 1 ? 'One city has' : `${s.future.arcologies} cities have`} been built as a single sealed structure. `}
              {s.future.projects > 0 && `They have tried ${s.future.projects === 1 ? 'once' : `${s.future.projects} times`} to mend the climate by their own hand. `}
              {s.future.machines && 'Minds that were built keep their own records now. '}
              {s.future.uploaded > 0 && `${Math.round(s.future.uploaded * 100)}% of the people live inside machines; the towns are emptying. `}
              {s.future.shade > 0 && `Collectors round the star catch ${(s.future.shade * 100).toFixed(1)}% of its light before it reaches the planet.`}
            </div>
            {Object.entries(s.future.origins).map(([id, how]) => {
              const sp = s.species.get(Number(id));
              return sp ? <div class={css.sub} key={id} style={{ marginTop: '3px' }}><button class={css.link} style={{ marginRight: '6px' }} onClick={() => actions.selectSpecies(sp.id)}>{sp.name}</button>{how === 'engineered' ? 'was made, not born' : how === 'revived' ? 'was brought back from extinction' : 'was raised to a mind by another people'}{sp.extinctYear >= 0 ? ' (now gone)' : ''}</div> : null;
            })}
          </div>
        )}
        <div class={css.goal}>
          <div class={css.goalTitle}><b>A linked world</b>{s.link && <span class={css.sub}>{s.link.seed}</span>}</div>
          {s.link ? (
            <>
              <div class={css.sub}>
                Running beside this one, year for year: {STAGES[s.link.stage] ?? s.link.stage}
                {s.link.species > 0 && `, ${s.link.species} kinds of animal`}
                {s.link.towns > 0 && `, ${s.link.towns} towns`}.
              </div>
              {s.link.contact.length === 0 && <div class={css.sub} style={{ marginTop: '3px' }}>Neither world knows the other is there yet. A people needs lenses to see lights, and both need radio to talk.</div>}
              {s.link.contact.map((e) => <div key={e.title} style={{ marginTop: '3px' }}>{e.title} <span class={css.sub}>{formatYear(e.year)}</span></div>)}
              <div style={{ marginTop: '4px' }}><a class={css.link} href={`?seed=${encodeURIComponent(s.link.seed)}`} target="_blank" rel="noopener">open that world on its own</a></div>
            </>
          ) : (
            <>
              <div class={css.sub}>Give another planet's seed code and the two run side by side. If both raise a people, they can come to see each other's lights, talk, and send machines across.</div>
              <div class={css.row}>
                <input type="text" value={code} placeholder="a seed code, such as basalt-vale-202" style={{ flex: 1, minWidth: 0, font: 'inherit', color: 'inherit', background: '#ffffff12', border: '1px solid #ffffff22', borderRadius: '6px', padding: '5px 8px' }} onInput={(e) => setCode((e.target as HTMLInputElement).value.trim())} />
                <button class={css.btn} disabled={!code || code === s.seed} onClick={() => { location.href = `${location.pathname}?seed=${encodeURIComponent(s.seed)}&neighbor=${encodeURIComponent(code)}&fresh&skip`; }}>link</button>
              </div>
              <div class={css.sub}>Linking starts both worlds from the beginning.</div>
            </>
          )}
        </div>
        <div class={css.goal}>
          <div class={css.goalTitle}><b>The stars nearby</b><span class={css.sub}>{c.fleets.length ? `${c.fleets.length} ships sent` : 'no one has left yet'}</span></div>
          <StarMap c={c} year={year} radio={s.industry?.firstBroadcast ?? -1} firstWords={s.industry?.firstMessage ?? ''} />
          {s.industry && s.industry.firstBroadcast >= 0 && <div class={css.sub}>The dashed shell is their own signals, {Math.round(year - s.industry.firstBroadcast).toLocaleString('en-US')} light years out and growing by one each year. The first thing sent: "{s.industry.firstMessage}"</div>}
          {c.fleets.map((f) => {
            const star = c.stars[f.star]!;
            return (
              <div class={css.sub} key={f.id} style={{ marginTop: '3px' }}>
                {f.kind === 'probe' ? 'Probe' : 'Ark'} {f.name}, to {star.name} ({star.ly} light years): {f.reported ? 'arrived, and heard from' : f.arrived ? `arrived; word is ${Math.max(0, Math.round(f.heard - year)).toLocaleString('en-US')} years from home` : `on its way, ${Math.max(0, Math.round(f.arrives - year)).toLocaleString('en-US')} years to go`}
              </div>
            );
          })}
        </div>
        {s.skyMessages.length > 0 && (
          <div class={css.goal}>
            <div class={css.goalTitle}><b>Sent to the stars</b></div>
            {[...s.skyMessages].reverse().map((m) => (
              <div key={m.id} style={{ marginTop: '8px' }}>
                <Glyphs signs={m.glyphs} size={11} />
                <div style={{ marginTop: '4px' }}>"{m.text}"</div>
                <div class={css.sub}>{m.town}, {formatYear(m.year)}. It passes {m.toward} {m.years.toLocaleString('en-US')} years after it was sent.</div>
                <button class={css.link} onClick={() => update({ whyEvent: m.eventId, panel: 'none' })}>who sent it?</button>
              </div>
            ))}
          </div>
        )}
        {s.archives.length > 0 && (
          <div class={css.goal}>
            <div class={css.goalTitle}><b>Left behind</b><span class={css.sub}>{s.archives.length === 1 ? 'one archive' : `${s.archives.length} archives`}</span></div>
            {[...s.archives].reverse().slice(0, 12).map((a) => (
              <div key={a.id} style={{ marginTop: '6px' }}>
                <div>{a.people}: {a.kind === 'orbital monument' ? `a monument in orbit above ${a.place}` : a.kind === 'vault' ? `the vault under ${a.place}` : `a record buried near ${a.place}`}</div>
                <div class={css.sub}>sealed {formatYear(a.year)}{a.foundBy >= 0 ? `; opened ${formatYear(a.foundYear)} by a later people` : '; no one has found it'}</div>
                <button class={css.link} onClick={() => setOpen(open === a.id ? -1 : a.id)}>{open === a.id ? 'close it' : 'open it'}</button>
                {a.foundEvent >= 0 && <button class={css.link} onClick={() => update({ whyEvent: a.foundEvent, panel: 'none' })}>who found it?</button>}
                {open === a.id && a.historian && <p class={css.sub} style={{ margin: '5px 0 0', fontStyle: 'italic' }}>As {a.historian} set it down. This is their own account, not the plain truth: what they won is enlarged and what shamed them is left out.</p>}
                {open === a.id && a.lines.map((line, i) => <p key={i} class={css.sub} style={{ margin: '5px 0 0' }}>{line}</p>)}
              </div>
            ))}
          </div>
        )}
        {c.reports.length > 0 && (
          <div class={css.goal}>
            <div class={css.goalTitle}><b>Word from beyond</b></div>
            {c.reports.map((r) => (
              <div key={r.fleet} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '8px' }}>
                <WorldPicture r={r} />
                <div>
                  <div>{r.star}, heard {formatYear(r.year)}</div>
                  <div class={css.sub}>{r.summary}</div>
                  <div style={{ marginTop: '3px' }}>
                    <a class={css.link} href={`?seed=${encodeURIComponent(r.seed)}`} target="_blank" rel="noopener">open this world ({r.seed})</a>
                    <button class={css.link} onClick={() => update({ whyEvent: r.eventId, panel: 'none' })}>why did this happen?</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
