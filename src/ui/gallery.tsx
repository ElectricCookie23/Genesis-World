// The gallery (system E26): paintings of things that happened, each in the manner of its age and its school,
// and the schools of painters themselves: where each began and which it was begun against.
import { Picture } from './art';
import { actions, update, useStore } from './store';
import css from './ui.module.css';

export function GalleryPanel() {
  const s = useStore();
  const g = s.gallery;
  const year = s.stats?.simYear ?? 0;
  const all = g ? g.paintings : [];
  const chosen = all.find((p) => p.id === s.painting) ?? all[0];
  const ago = (y: number) => `${Math.max(0, Math.round(year - y)).toLocaleString('en-US')} years ago`;
  const small = typeof window !== 'undefined' && window.innerWidth < 620;
  return (
    <div class={`${css.panel} ${css.side}`} style={{ width: 'min(720px, 96vw)' }}>
      <div class={css.head}><h2>Gallery</h2><span class={css.sub}>{all.length} paintings</span><button class={css.close} onClick={() => update({ panel: 'peoples' })}>✕</button></div>
      <div class={css.scroll}>
        {!g && <p class={css.sub}>Fetching the pictures.</p>}
        {g && all.length === 0 && <p class={css.sub}>No one has painted anything yet.</p>}
        {chosen && (
          <div style={{ display: 'flex', gap: '14px', flexDirection: small ? 'column' : 'row', alignItems: 'flex-start', margin: '4px 0 14px' }}>
            <div style={{ flex: 'none', padding: '4px' }}><Picture p={chosen} width={small ? 280 : 330} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '600 16px/1.25 system-ui, sans-serif', color: '#f2eee4' }}>{chosen.title}</div>
              <p class={css.sub} style={{ margin: '3px 0 6px' }}>{chosen.painter ? `${chosen.painter}, ` : ''}{chosen.town ? `${chosen.town}, ` : ''}{chosen.nation}, {ago(chosen.year)}.</p>
              <div class={css.when} style={{ color: '#ece7db' }}>{chosen.caption}</div>
              <div class={css.when} style={{ color: '#cfc9bd', margin: '4px 0' }}>
                {chosen.movementName ? `Painted in the way of ${chosen.movementName}.` : chosen.style === 0 ? 'Painted before anyone had a name for a way of painting.' : 'Painted in the manner of its age, by a painter of no school.'}
                {chosen.first ? ' It is the first painting its makers made in their age.' : ''}
              </div>
              <button class={css.link} title={`What it shows: ${chosen.eventTitle}`} onClick={() => update({ whyEvent: chosen.eventId })}>what it shows</button>
            </div>
          </div>
        )}
        {all.length > 0 && <div class={css.sub} style={{ margin: '0 0 6px', letterSpacing: '0.08em' }}>ON THE WALLS</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: '12px 10px' }}>
          {all.map((p) => (
            <button key={p.id} onClick={() => update({ painting: p.id })} title={`${p.title} (${p.styleName})`} style={{ border: 'none', background: p.id === chosen?.id ? '#ffffff14' : 'transparent', borderRadius: '5px', padding: '6px 5px', cursor: 'pointer', textAlign: 'left' }}>
              <Picture p={p} width={122} />
              <div style={{ font: '400 11px/1.3 system-ui, sans-serif', color: '#cfc9bd', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
              <div style={{ font: '400 10px/1.3 system-ui, sans-serif', color: '#8f887c' }}>{p.styleName}</div>
            </button>
          ))}
        </div>
        {g && g.movements.length > 0 && <div class={css.sub} style={{ margin: '16px 0 6px', letterSpacing: '0.08em' }}>SCHOOLS OF PAINTERS</div>}
        {g && g.movements.slice().sort((a, b) => b.born - a.born).map((m) => (
          <div key={m.id} class={css.when} style={{ color: m.followers.length ? '#ece7db' : '#8f887c', margin: '0 0 5px' }}>
            <b style={{ fontWeight: 600 }}>{m.name}</b> ({m.own}), {m.styleName}, {m.loud > 0.5 ? 'in strong colour' : 'in quiet colour'}. Begun in {m.nation} {ago(m.born)}{m.againstName ? `, against ${m.againstName}` : ''}.
            {' '}{m.followers.length ? `Followed now in ${m.followers.slice(0, 4).join(', ')}${m.followers.length > 4 ? ` and ${m.followers.length - 4} more` : ''}.` : 'No one paints this way any more.'}
            {' '}<button class={css.link} style={{ marginRight: 0 }} onClick={() => update({ whyEvent: m.eventId })}>how it began</button>
          </div>
        ))}
        {all.length > 0 && <p class={css.sub} style={{ margin: '12px 0 0' }}><button class={css.link} onClick={() => actions.openGallery()}>look again</button> New paintings are hung as they are made.</p>}
      </div>
    </div>
  );
}
