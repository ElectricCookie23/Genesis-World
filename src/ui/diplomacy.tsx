// The web of diplomacy (system E34): every living country where its capital lies on the flat map, and a line
// for how each pair stands: at war, an old betrayal remembered, allied, joined by marriage, sworn to peace,
// bound by a pact of trade, trading, or only in touch.
import { TIE_COLOUR, TIE_KINDS, type TieKind } from '../sim/history/diplomacy';
import { actions, update, useStore } from './store';
import css from './ui.module.css';

const WORDS: Record<TieKind, string> = { war: 'at war', grudge: 'a betrayal remembered', alliance: 'allies', marriage: 'joined by marriage', peace: 'sworn to peace', 'trade-pact': 'a pact of trade', trade: 'trading', contact: 'in touch' };

export function DiplomacyPanel() {
  const s = useStore();
  const d = s.diplomacy;
  const year = s.stats?.simYear ?? 0;
  const ago = (y: number) => `${Math.max(0, Math.round(year - y)).toLocaleString('en-US')} years ago`;
  const W = 660, H = 330;
  const at = new Map((d ? d.nations : []).map((n) => [n.id, { x: 14 + n.u * (W - 28), y: 12 + n.v * (H - 24), n }]));
  const shown = d ? d.ties.filter((t) => t.kind !== 'contact') : [];
  const used = new Set(d ? d.ties.map((t) => t.kind) : []);
  return (
    <div class={`${css.panel} ${css.side}`} style={{ width: 'min(720px, 96vw)' }}>
      <div class={css.head}><h2>Diplomacy</h2><span class={css.sub}>{d ? `${d.nations.length} countries` : ''}</span><button class={css.close} onClick={() => update({ panel: 'peoples' })}>✕</button></div>
      <div class={css.scroll}>
        {!d && <p class={css.sub}>Asking the envoys.</p>}
        {d && d.nations.length < 2 && <p class={css.sub}>There are not yet two countries to have dealings with each other.</p>}
        {d && d.nations.length >= 2 && (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', background: '#0c1018', borderRadius: '8px', display: 'block' }}>
              {/* the weakest ties first, so that a war is drawn over a trade */}
              {d.ties.slice().reverse().map((t, i) => {
                const a = at.get(t.a), b = at.get(t.b);
                if (!a || !b) return null;
                // (a pair either side of the edge of the map is not joined across the whole of it)
                if (Math.abs(a.x - b.x) > W / 2) return null;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={TIE_COLOUR[t.kind]} stroke-width={t.kind === 'war' ? 2.6 : t.kind === 'contact' ? 0.8 : 1.8} stroke-dasharray={t.kind === 'grudge' ? '5 4' : undefined}><title>{t.label}</title></line>;
              })}
              {/* pacts signed and not read out, with the Truth switch on (system E39) */}
              {s.truth && (d.secret ?? []).map((t, i) => {
                const a = at.get(t.a), b = at.get(t.b);
                if (!a || !b || Math.abs(a.x - b.x) > W / 2) return null;
                return <line key={`s${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c39bff" stroke-width={2} stroke-dasharray="2 4"><title>{t.label}</title></line>;
              })}
              {[...at.values()].map(({ x, y, n }) => (
                <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => actions.openNation(n.id)}>
                  <circle cx={x} cy={y} r={3 + Math.min(5, Math.sqrt(n.pop) / 12)} fill={`hsl(${Math.round(n.hue * 360)} 70% 60%)`} stroke="#0c1018" stroke-width={1.2} />
                  <text x={x + 8} y={y + 3.5} fill="#ece7db" font-size="10" font-family="system-ui, sans-serif">{n.name}</text>
                </g>
              ))}
            </svg>
            <div class={css.sub} style={{ margin: '8px 0', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {TIE_KINDS.filter((k) => used.has(k)).map((k) => <span key={k}><span style={{ display: 'inline-block', width: '18px', height: '0', borderTop: `2px ${k === 'grudge' ? 'dashed' : 'solid'} ${TIE_COLOUR[k]}`, verticalAlign: 'middle', marginRight: '5px' }} />{WORDS[k]}</span>)}
            </div>
            <p class={css.sub} style={{ margin: '0 0 8px' }}>Each country stands where its capital lies on the map. A line is the strongest thing between two countries. Click a country for its own page.</p>
            {shown.length > 0 && <div class={css.sub} style={{ margin: '8px 0 4px', letterSpacing: '0.08em' }}>HOW THEY STAND</div>}
            {shown.slice(0, 40).map((t, i) => (
              <div key={i} class={css.when} style={{ color: '#ece7db', margin: '0 0 3px' }}>
                <span style={{ color: TIE_COLOUR[t.kind] }}>●</span> {t.label} {t.eventId >= 0 && <button class={css.link} style={{ marginRight: 0 }} onClick={() => update({ whyEvent: t.eventId })}>how it came about</button>}
              </div>
            ))}
            {(d.secret ?? []).length > 0 && s.truth && <div class={css.sub} style={{ margin: '10px 0 4px', letterSpacing: '0.08em', color: '#c39bff' }}>◈ SIGNED AND NOT READ OUT</div>}
            {s.truth && (d.secret ?? []).map((t, i) => (
              <div key={`s${i}`} class={css.when} style={{ color: '#d9c4ff', margin: '0 0 3px' }}>
                {t.label} {t.eventId >= 0 && <button class={css.link} style={{ marginRight: 0 }} onClick={() => update({ whyEvent: t.eventId })}>how it came about</button>}
              </div>
            ))}
            {d.betrayals.length > 0 && <div class={css.sub} style={{ margin: '10px 0 4px', letterSpacing: '0.08em' }}>WRONGS REMEMBERED</div>}
            {d.betrayals.map((b, i) => (
              <div key={i} class={css.when} style={{ color: '#ece7db', margin: '0 0 3px' }}>
                {b.by} wronged {b.against} {ago(b.year)}. {b.avenged >= 0 ? `${b.against} went to war over it ${ago(b.avenged)}.` : `${b.against} has not forgotten.`}{' '}
                {b.eventId >= 0 && <button class={css.link} style={{ marginRight: 0 }} onClick={() => update({ whyEvent: b.eventId })}>what was done</button>}
              </div>
            ))}
            <p class={css.sub} style={{ margin: '12px 0 0' }}><button class={css.link} onClick={() => actions.openDiplomacy()}>look again</button><button class={css.link} style={{ color: s.truth ? '#c39bff' : undefined }} title="Show the pacts that were signed and not read out" onClick={() => update({ truth: !s.truth })}>◈ Truth: {s.truth ? 'on' : 'off'}</button></p>
          </>
        )}
      </div>
    </div>
  );
}
