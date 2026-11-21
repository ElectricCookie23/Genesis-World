// The world's market (system E32): what each good has cost over the years, the bubble now swelling if there is
// one, and the panics on record.
import { GOOD_COLOUR, type Good } from '../sim/history/trade';
import { actions, update, useStore } from './store';
import css from './ui.module.css';

/** A price line for one good: its history as a path in a box `w` by `h`, scaled to the highest price any good has reached. */
export function pricePath(values: number[], top: number, w: number, h: number): string {
  if (values.length < 2) return '';
  return values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - 3 - (Math.min(top, v) / Math.max(1e-9, top)) * (h - 6)).toFixed(1)}`).join('');
}

export function MarketPanel() {
  const s = useStore();
  const m = s.market;
  const year = s.stats?.simYear ?? 0;
  const ago = (y: number) => `${Math.max(0, Math.round(year - y)).toLocaleString('en-US')} years ago`;
  const W = 300, H = 46;
  const span = m && m.years.length > 1 ? Math.round(m.years[m.years.length - 1]! - m.years[0]!) : 0;
  return (
    <div class={`${css.panel} ${css.side}`} style={{ width: 'min(700px, 96vw)' }}>
      <div class={css.head}><h2>Markets</h2><span class={css.sub}>{span ? `the last ${span.toLocaleString('en-US')} years` : ''}</span><button class={css.close} onClick={() => update({ panel: 'peoples' })}>✕</button></div>
      <div class={css.scroll}>
        {!m && <p class={css.sub}>Asking the merchants.</p>}
        {m && m.years.length < 2 && <p class={css.sub}>No one has kept prices long enough to draw them.</p>}
        {m && m.bubble && <p class={css.when} style={{ color: '#ffb46a', margin: '0 0 10px' }}>A bubble is swelling: {m.bubble.good} in {m.bubble.nation} has been bid up for {Math.max(1, Math.round(year - m.bubble.since))} years, to {m.bubble.froth.toFixed(1)} times its worth.</p>}
        {m && m.years.length >= 2 && (
          <>
            <p class={css.sub} style={{ margin: '0 0 8px' }}>What each good costs across the world, where 1 is a fair price. A price is high where the thing is scarce; a spike that falls off a cliff is a bubble and its panic.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px 16px' }}>
              {m.goods.map((good, i) => {
                const values = m.prices[i] ?? [];
                const now = values[values.length - 1] ?? 0, top = Math.max(1.5, ...values);
                const colour = GOOD_COLOUR[good as Good] ?? '#ece7db';
                return (
                  <div key={good}>
                    <div class={css.row} style={{ padding: 0 }}><span style={{ color: colour }}>{good}</span><span class={css.sub}>{now.toFixed(2)}{m.bubble && m.bubble.good === good ? ' (bubble)' : ''}</span></div>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: `${H}px` }}>
                      <path d={`M0 ${(H - 3 - (1 / top) * (H - 6)).toFixed(1)}L${W} ${(H - 3 - (1 / top) * (H - 6)).toFixed(1)}`} stroke="#ffffff22" stroke-dasharray="3 4" />
                      <path d={pricePath(values, top, W, H)} fill="none" stroke={colour} stroke-width="1.6" />
                    </svg>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {m && m.panics.length > 0 && <div class={css.sub} style={{ margin: '14px 0 6px', letterSpacing: '0.08em' }}>PANICS</div>}
        {m && m.panics.map((p) => (
          <div key={p.eventId} class={css.when} style={{ color: '#ece7db', margin: '0 0 4px' }}>
            {p.title}, {ago(p.year)}. <button class={css.link} style={{ marginRight: 0 }} onClick={() => update({ whyEvent: p.eventId })}>what happened</button>
          </div>
        ))}
        {m && <p class={css.sub} style={{ margin: '12px 0 0' }}><button class={css.link} onClick={() => actions.openMarket()}>look again</button></p>}
      </div>
    </div>
  );
}
