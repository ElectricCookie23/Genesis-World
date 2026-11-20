import { SPEEDS } from '../shared/protocol';
import { actions, togglePanel, useStore } from './store';
import { GoalMarker, Goals } from './goals';
import { SkyMessage, System } from './system';
import { Microscope, Pulse } from './strange';
import { Memory } from './memory';
import { bigNumber, formatYear } from './format';
import { DynastyPanel } from './dynasty';
import { SitePanel } from './site';
import { Chronicle, CreatureCard, CrossSection, Designer, FlatMap, Experiments, Graphs, Guide, Futures, Help, NationLabels, NationPanel, Num, Peoples, Settings, SpeciesCard, TimelineStrip, Tree, Why } from './panels';
import css from './ui.module.css';

const STAGE: Record<string, string> = { barren: 'lifeless', microbes: 'microbes', algae: 'algae seas', animals: 'living world' };
const ERA: Record<string, string> = { none: '', ice: 'ice age', warm: 'warm era', winter: 'long winter' };
const HINTS = [
  ['Look around', 'Drag to orbit. Scroll or pinch to fly from space down to the ground.'],
  ['Follow the story', 'Open the chronicle and click any line to see what caused it.'],
  ['Change the pace', 'Keys 1 to 6 set the speed. Epoch runs a whole history in half an hour.'],
];

export function App() {
  const s = useStore();
  const st = s.stats;
  const hidden = s.uiHidden || s.postcard;
  const last = s.chronicle.length ? s.events[s.chronicle[s.chronicle.length - 1]!] : undefined;
  return (
    <div class={css.root}>
      {!s.opening && s.overlay === 'nations' && <NationLabels />}
      {!s.opening && s.skyMessage && !hidden && <SkyMessage />}
      {!s.opening && (
        <div class={`${css.fade} ${hidden ? css.hidden : ''}`}>
          <div class={css.topRow}>
          <div class={`${css.panel} ${css.top}`}>
            <div class={css.title}>GENESIS <Pulse /></div>
            <div class={css.year}>{st ? formatYear(st.simYear) : ''}</div>
            <div class={css.sub}>{st ? [st.settlements > 0 ? (st.maxTech >= 0.6 ? 'age of cities' : st.maxTech >= 0.3 ? 'age of villages' : 'first fires') : STAGE[st.stage] ?? '', ERA[st.era] ?? ''].filter(Boolean).join(' · ') : ''}</div>
          </div>
          <GoalMarker />
          {/* the side panels open over this corner: the box steps aside for them */}
          {st && s.panel === 'none' && (
            <div class={`${css.panel} ${css.stats}`}>
              <span>mean temp</span><b><Num value={st.meanTemp} format={(n) => `${n.toFixed(1)} °C`} /></b>
              <span>oxygen</span><b><Num value={st.oxygen * 100} format={(n) => `${n.toFixed(1)}%`} /></b>
              <span>ice</span><b><Num value={st.iceFraction * 100} format={(n) => `${n.toFixed(0)}%`} /></b>
              <span>species</span><b><Num value={st.livingSpecies} format={(n) => n.toFixed(0)} /></b>
              <span>animals</span><b><Num value={st.population} format={bigNumber} /></b>
              {st.settlements > 0 && <><span>settlements</span><b><Num value={st.settlements} format={(n) => n.toFixed(0)} /></b></>}
              <span>{s.backend}</span><b>{s.fps.toFixed(0)} fps</b>
            </div>
          )}
          </div>
          {s.panel === 'chronicle' && <Chronicle />}
          {s.panel === 'tree' && <Tree />}
          {s.panel === 'help' && <Help />}
          {s.panel === 'tools' && <Experiments />}
          {s.panel === 'settings' && <Settings />}
          {s.panel === 'designer' && <Designer />}
          {s.panel === 'map' && <FlatMap />}
          {s.panel === 'section' && <CrossSection />}
          {s.panel === 'guide' && <Guide />}
          {s.panel === 'peoples' && <Peoples />}
          {s.panel === 'nation' && <NationPanel />}
          {s.panel === 'dynasty' && <DynastyPanel />}
          {s.panel === 'site' && <SitePanel />}
          {s.panel === 'graphs' && <Graphs />}
          {s.panel === 'goals' && <Goals />}
          {s.panel === 'system' && <System />}
          {s.panel === 'microscope' && <Microscope />}
          {s.panel === 'archive' && <Memory />}
          {s.whyEvent >= 0 && <Why />}
          {s.selectedSpecies >= 0 && s.whyEvent < 0 && <SpeciesCard />}
          {s.creature && s.selectedSpecies < 0 && s.whyEvent < 0 && <CreatureCard />}
          {s.other && s.panel === 'none' && <Futures />}
          {s.panel === 'none' && !s.mobile && <TimelineStrip />}
          {s.hintStep < HINTS.length && s.panel === 'none' && (
            <div class={`${css.panel} ${css.hint}`} key={s.hintStep}><b>{HINTS[s.hintStep]![0]}</b>{HINTS[s.hintStep]![1]}</div>
          )}
          <div class={`${css.panel} ${css.bar}`}>
            {SPEEDS.map((sp, i) => (
              <button class={i === s.speedIndex ? css.active : ''} onClick={() => actions.setSpeed(i)} title={`${sp.label} (${i === 0 ? 'Space' : i})`}>
                {i === 0 ? '❚❚' : sp.label}
              </button>
            ))}
            <i class={css.sep} />
            <button class={s.panel === 'chronicle' ? css.active : ''} onClick={() => togglePanel('chronicle')} title="Chronicle (C)">Chronicle</button>
            <button class={s.panel === 'tree' ? css.active : ''} onClick={() => togglePanel('tree')} title="Tree of life (T)">Tree</button>
            <button class={s.panel === 'guide' ? css.active : ''} onClick={() => togglePanel('guide')} title="Field guide and memorial">Guide</button>
            {st && st.settlements > 0 && <button class={s.panel === 'peoples' ? css.active : ''} onClick={() => togglePanel('peoples')} title="Settlements and peoples">Peoples</button>}
            <button class={s.panel === 'archive' ? css.active : ''} onClick={() => togglePanel('archive')} title="The record: archive, atlas, braid, ancestry (A)">Record</button>
            <button class={s.panel === 'goals' ? css.active : ''} onClick={() => togglePanel('goals')} title="Goals, if you want some (J)">Goals</button>
            <button class={s.panel === 'system' ? css.active : ''} onClick={() => togglePanel('system')} title="The star system (S)">☉</button>
            <button class={s.panel === 'graphs' ? css.active : ''} onClick={() => togglePanel('graphs')} title="Graphs over time">∿</button>
            <button class={s.panel === 'tools' ? css.active : ''} onClick={() => togglePanel('tools')} title="Experiments (G)">✦</button>
            <button class={s.panel === 'settings' ? css.active : ''} onClick={() => togglePanel('settings')} title="World and settings">⚙</button>
            <button class={s.panel === 'help' ? css.active : ''} onClick={() => togglePanel('help')} title="Controls (?)">?</button>
          </div>
        </div>
      )}
      {s.notice && <div class={`${css.panel} ${css.notice}`}>{s.notice}</div>}
      {s.eraBanner && !s.milestone && !s.opening && (
        <div key={`${s.eraBanner.title}${s.eraBanner.year}`} style={{ position: 'fixed', left: '50%', top: '13%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', maxWidth: '92vw', textShadow: '0 2px 18px #000c' }}>
          <div style={{ font: '500 11px/1 system-ui, sans-serif', letterSpacing: '0.32em', opacity: 0.7 }}>{s.eraBanner.nation.toUpperCase()}</div>
          <div style={{ font: "500 clamp(26px, 4.4vw, 46px)/1.15 'Cormorant Garamond', serif", margin: '8px 0 6px', borderTop: '1px solid #fff5', borderBottom: '1px solid #fff5', padding: '8px 22px' }}>{s.eraBanner.title}</div>
          <div style={{ font: "italic 400 16px/1.3 'Cormorant Garamond', serif", opacity: 0.85 }}>{s.eraBanner.own}{s.earthNotes ? `, ${s.eraBanner.earth}` : ''}</div>
        </div>
      )}
      {s.milestone && (
        <div class={css.toast} key={s.milestone.id}>
          <div class={css.k}>{formatYear(s.milestone.simYear).toUpperCase()}</div>
          <h1>{s.milestone.title}</h1>
          <p>{s.milestone.description}</p>
        </div>
      )}
      {/* on a phone a panel is a sheet over the lower screen: the narration would lie across its text */}
      {s.chronicleLine && !s.milestone && !(s.mobile && s.panel !== 'none') && <div class={css.narration} key={s.chronicleLine}>{s.chronicleLine}</div>}
      {!s.opening && !s.chronicleLine && !s.milestone && last && s.panel !== 'chronicle' && !(s.mobile && s.panel !== 'none') && !hidden && (st?.simYear ?? 0) - last.simYear < 4e6 && (
        <div class={css.narration} key={last.id}><small>{formatYear(last.simYear).toUpperCase()}</small>{last.description}</div>
      )}
      {s.opening && s.skipVisible && <button class={css.skip} onClick={() => actions.skipOpening()}>SKIP</button>}
    </div>
  );
}
