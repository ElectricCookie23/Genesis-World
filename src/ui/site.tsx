// The dig view (system E17): a slice through the mound of a town site. People build where people built
// before, so a long-lived site is a stack: every building phase, every burning, flood and fall of ash,
// every abandonment and return is a layer, and under a town may lie the ruins of older towns.
import type { SiteDetail, SiteLayer } from '../shared/protocol';
import { actions, update, useStore } from './store';
import { formatYear } from './format';
import css from './ui.module.css';

/** What a layer looks like in the cut: its colour, how thick it is drawn, and what it is in words. */
export function layerLook(l: SiteLayer): { fill: string; thick: number; words: string } {
  switch (l.kind) {
    case 'burnt': return { fill: '#1d1614', thick: 7, words: 'a layer of charcoal and burnt brick' };
    case 'ash': return { fill: '#8d8a86', thick: 9, words: 'a layer of grey ash' };
    case 'flood': return { fill: '#7f8f86', thick: 9, words: 'a layer of silt left by water' };
    case 'shaken': return { fill: '#6c5a48', thick: 8, words: 'tumbled walls' };
    case 'decay': return { fill: '#5b4a39', thick: 8, words: 'rubbish and fallen roofs: the town had shrunk' };
    case 'abandoned': return { fill: '#4a4032', thick: 14, words: 'windblown soil: no one lived here' };
    default: {
      // a building phase: what it is made of follows what its builders knew
      const fill = l.tech < 0.3 ? '#8a6a45' : l.tech < 0.6 ? '#a8855a' : l.tech < 0.85 ? '#b9b0a2' : '#cfd3d6';
      const what = l.tech < 0.3 ? 'post holes, hearths and trodden floors' : l.tech < 0.6 ? 'mud brick and timber' : l.tech < 0.85 ? 'dressed stone and fired brick' : 'concrete, steel and glass';
      return { fill, thick: l.kind === 'camp' ? 9 : l.kind === 'village' ? 13 : l.kind === 'town' ? 17 : 22, words: `the ${l.kind}: ${what}` };
    }
  }
}

/** The whole stack as bands from the bottom up: each with the town it belongs to, its place in the cut and its look. */
export function siteBands(d: SiteDetail): { town: number; layer: SiteLayer; y: number; h: number; fill: string; words: string }[] {
  const out: { town: number; layer: SiteLayer; y: number; h: number; fill: string; words: string }[] = [];
  let y = 0;
  d.towns.forEach((t, k) => {
    for (const l of t.strata) { const look = layerLook(l); out.push({ town: k, layer: l, y, h: look.thick, fill: look.fill, words: look.words }); y += look.thick; }
  });
  return out;
}

export function SitePanel() {
  const s = useStore();
  const d = s.siteDetail;
  const year = s.stats?.simYear ?? 0;
  const bands = d ? siteBands(d) : [];
  const total = bands.length ? bands[bands.length - 1]!.y + bands[bands.length - 1]!.h : 0;
  const W = 360, pad = 16, H = Math.max(120, total + 46);
  // the mound: wide at the bottom, narrower with every layer
  const half = (y: number) => 150 - 70 * (y / Math.max(60, total));
  return (
    <div class={`${css.panel} ${css.side}`} style={{ width: 'min(620px, 96vw)' }}>
      <div class={css.head}><h2>{d ? `Under ${d.towns[d.towns.length - 1]!.name}` : 'A site'}</h2><button class={css.close} onClick={() => update({ panel: 'peoples' })}>✕</button></div>
      <div class={css.scroll}>
        {!d && <p class={css.sub}>Digging.</p>}
        {d && <p class={css.sub} style={{ margin: '0 0 8px' }}>{d.layers} {d.layers === 1 ? 'layer' : 'layers'} in the ground here{d.towns.length > 1 ? `, from ${d.towns.length} towns built one on top of another` : ''}. The oldest is at the bottom.</p>}
        {d && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flex: 'none', maxWidth: '100%', borderRadius: '8px', background: '#191512' }} role="img" aria-label="A slice through the mound">
              {/* bedrock and the old ground surface */}
              <rect x="0" y={H - pad} width={W} height={pad} fill="#2b2622" />
              {bands.map((b, i) => {
                const y1 = H - pad - b.y, y0 = y1 - b.h, w1 = half(b.y), w0 = half(b.y + b.h);
                const cx = W / 2;
                return (
                  <g key={i}>
                    <path d={`M ${cx - w1} ${y1} L ${cx + w1} ${y1} L ${cx + w0} ${y0} L ${cx - w0} ${y0} Z`} fill={b.fill} stroke="#00000055" stroke-width="0.6" />
                    {/* walls and floors in a building phase: a row of footings */}
                    {['camp', 'village', 'town', 'city', 'great city'].includes(b.layer.kind) && Array.from({ length: Math.max(2, Math.floor(w0 / 16)) }, (_, k) => {
                      const x = cx - w0 + 10 + k * ((w0 * 2 - 20) / Math.max(1, Math.floor(w0 / 16) - 1));
                      return <rect key={k} x={x - 3} y={y0 + b.h * 0.35} width="6" height={b.h * 0.65} fill="#00000030" />;
                    })}
                  </g>
                );
              })}
              {/* today's ground, and grass if no one lives here now */}
              {d.towns[d.towns.length - 1]!.ruined >= 0 && <path d={`M ${W / 2 - half(total)} ${H - pad - total} H ${W / 2 + half(total)}`} stroke="#6f9a55" stroke-width="3" />}
            </svg>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              {[...bands].reverse().map((b, i) => {
                const t = d.towns[b.town]!;
                return (
                  <div key={i} class={css.when} style={{ color: '#cfc9bd', margin: '0 0 5px', display: 'flex', gap: '7px' }}>
                    <span style={{ flex: 'none', width: '11px', height: '11px', marginTop: '3px', background: b.fill, border: '1px solid #ffffff40', borderRadius: '2px' }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ color: '#f2eee4' }}>{t.name}</span>, {formatYear(b.layer.year).toLowerCase()} ({Math.max(0, Math.round(year - b.layer.year)).toLocaleString('en-US')} years ago): {b.words}.
                      {b.layer.eventId >= 0 && <> <button class={css.link} style={{ marginRight: 0 }} onClick={() => update({ whyEvent: b.layer.eventId })}>{b.layer.cause}</button></>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {d && <p class={css.sub} style={{ margin: '10px 0 0' }}><button class={css.link} onClick={() => actions.flyToCell(d.cell, 0.1)}>go to the site</button></p>}
      </div>
    </div>
  );
}
