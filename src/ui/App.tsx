import { SPEEDS } from '../shared/protocol';
import { actions, useStore } from './store';
import { formatYear } from './format';
import css from './ui.module.css';

export function App() {
  const s = useStore();
  const st = s.stats;
  const hidden = s.uiHidden || s.postcard;
  return (
    <div class={css.root}>
      {!s.opening && (
        <div class={hidden ? css.hidden : ''} style={{ transition: 'opacity 0.8s ease' }}>
          <div class={`${css.panel} ${css.top}`}>
            <div class={css.title}>GENESIS</div>
            <div class={css.year}>{st ? formatYear(st.simYear) : ''}</div>
            <div class={css.sub}>{s.seed}</div>
          </div>
          {st && (
            <div class={`${css.panel} ${css.stats}`}>
              <div>{st.meanTemp.toFixed(1)} °C mean</div>
              <div>{(st.iceFraction * 100).toFixed(0)}% ice</div>
              <div class={css.sub}>{s.fps.toFixed(0)} fps · {s.backend}</div>
            </div>
          )}
          <div class={`${css.panel} ${css.speeds}`}>
            {SPEEDS.map((sp, i) => (
              <button class={i === s.speedIndex ? css.active : ''} onClick={() => actions.setSpeed(i)} title={`${sp.label} (${i === 0 ? 'Space' : i})`}>
                {i === 0 ? '❚❚' : sp.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {s.chronicleLine && <div class={css.chronicle} key={s.chronicleLine}>{s.chronicleLine}</div>}
      {s.opening && s.skipVisible && (
        <button class={css.skip} onClick={() => actions.skipOpening()}>SKIP</button>
      )}
    </div>
  );
}
