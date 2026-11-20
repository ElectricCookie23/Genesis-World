// What section 9 of the expansion shows: the layers in the rock, the microscope, and the planet's pulse.
import { useEffect, useRef } from 'preact/hooks';
import { update, useStore } from './store';
import { formatYear } from './format';
import type { LayerKind } from '../sim/strange';
import css from './ui.module.css';

const LAYER_COLOUR: Record<LayerKind, string> = { metal: '#c9b458', ash: '#d8d4cc', boundary: '#3a3531', coal: '#15130f', plastic: '#d86aa0', glass: '#6fa2a8' };
const LAYER_NAME: Record<LayerKind, string> = { metal: 'metal-rich line', ash: 'ash band', boundary: 'boundary clay', coal: 'coal seam', plastic: 'unrotting stratum', glass: 'fused glass' };

/** The banded record under the cross-section: each layer was laid by an event, and says which. */
export function Strata() {
  const s = useStore();
  const layers = s.strange?.layers ?? [];
  if (!layers.length) return <p class={css.sub} style={{ margin: '0 14px 12px' }}>Nothing has marked the rock yet. Great impacts, eruptions, extinctions, forests and industry each leave a layer.</p>;
  const shown = [...layers].reverse().slice(0, 14);
  return (
    <div style={{ padding: '0 14px 12px' }}>
      <div class={css.sub} style={{ marginBottom: '5px' }}>Layers in the rock, youngest on top. Each was laid by something that happened.</div>
      {shown.map((l) => (
        <button key={l.eventId} class={css.stratum} onClick={() => update({ whyEvent: l.eventId, panel: 'none' })} title="What laid this down?">
          <i style={{ background: LAYER_COLOUR[l.kind] }} />
          <span>{LAYER_NAME[l.kind]}{l.world ? ', worldwide' : ', local'}</span>
          <span class={css.sub}>{formatYear(l.year)}{l.read >= 0 ? ' · read by geologists' : ''}</span>
        </button>
      ))}
    </div>
  );
}

/** The world too small to see, under the centre of the view: drifting cells, thicker where life crowds, redder where sickness breeds. */
export function Microscope() {
  const s = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  const m = s.strange?.microbes ?? { life: 0, germ: 0, strain: '' };
  const life = s.stats && s.stats.stage !== 'barren' ? Math.max(0.12, m.life) : 0;
  useEffect(() => {
    const cv = ref.current, ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const W = cv.width, H = cv.height;
    const n = Math.round(life * 140);
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const cells = Array.from({ length: n }, (_, i) => ({ x: rnd() * W, y: rnd() * H, r: 3 + rnd() * 9, a: rnd() * 6.28, v: 0.15 + rnd() * 0.5, kind: rnd(), sick: i / Math.max(1, n) < m.germ * 0.8, long: rnd() < 0.35 }));
    let raf = 0, t = 0;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const draw = () => {
      t += 1;
      ctx.fillStyle = '#0b1418'; ctx.fillRect(0, 0, W, H);
      // the round field of a lens
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.62);
      g.addColorStop(0, '#1d3b3a'); g.addColorStop(1, '#0b1418');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W / 2, H / 2, H * 0.6, 0, 6.3); ctx.fill();
      for (const c of cells) {
        c.a += (Math.sin(t * 0.013 + c.kind * 40) * 0.03);
        c.x = (c.x + Math.cos(c.a) * c.v + W) % W; c.y = (c.y + Math.sin(c.a) * c.v + H) % H;
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = c.sick ? '#d4574f' : c.kind < 0.4 ? '#7fd6a6' : c.kind < 0.75 ? '#a9c9e8' : '#e3d28a';
        ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, 0, c.long ? c.r * 1.9 : c.r, c.r * (c.long ? 0.55 : 0.9), 0, 0, 6.3); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#00000066'; ctx.beginPath(); ctx.arc(c.r * 0.2, 0, c.r * 0.28, 0, 6.3); ctx.fill();
        ctx.restore();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [Math.round(life * 20), Math.round(m.germ * 20)]);
  return (
    <div class={`${css.panel} ${css.side}`} style={{ bottom: 'auto' }}>
      <div class={css.head}><h2>Under the lens</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div style={{ padding: '0 14px 14px' }}>
        <canvas ref={ref} width={352} height={240} style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
        <p class={css.sub} style={{ margin: '8px 0 0' }}>
          {life <= 0 ? 'Nothing lives here yet, at any size.' : `A drop from the country under the centre of the view. ${m.life > 0.5 ? 'It is thick with life: many animals share this ground.' : m.life > 0.15 ? 'A fair crowd of small things.' : 'Thinly peopled.'} ${m.germ > 0.4 ? 'A good part of what swims here lives inside other animals: sickness is being bred.' : m.germ > 0.15 ? 'A few of them are the kind that make animals ill.' : 'Almost none of it does any harm.'}`}
        </p>
        {m.strain && <p class={css.sub} style={{ margin: '6px 0 0' }}>A plague began here once: "{m.strain}".</p>}
      </div>
    </div>
  );
}

/** The planet's pulse: a dot that beats at the world's own rate, slow when it is well. */
export function Pulse() {
  const s = useStore();
  const rate = s.stats?.pulseRate, health = s.stats?.health;
  if (!rate || health === undefined) return null;
  const colour = health > 0.75 ? '#9fdc8a' : health > 0.5 ? '#e9d27a' : '#e0765f';
  return (
    <span class={css.pulse} title={`The planet's pulse: ${rate} beats a minute. ${health > 0.75 ? 'The world is well.' : health > 0.5 ? 'The world is troubled.' : 'The world is in crisis.'}`}>
      <i style={{ background: colour, boxShadow: `0 0 6px ${colour}`, animationDuration: `${(60 / rate).toFixed(2)}s` }} />
      <span class={css.sub}>{rate}</span>
    </span>
  );
}
