// The goals panel and the small on-screen marker for a goal being followed. Goals are optional: the
// panel says so, nothing is locked, and nothing here can be lost.
import { useState } from 'preact/hooks';
import { actions, update, useStore } from './store';
import { formatYear } from './format';
import css from './ui.module.css';

export function Goals() {
  const s = useStore();
  const [open, setOpen] = useState('');
  const reached = s.goals.filter((g) => g.reached).length;
  return (
    <div class={`${css.panel} ${css.side}`}>
      <div class={css.head}><h2>Goals</h2><button class={css.close} onClick={() => update({ panel: 'none' })}>✕</button></div>
      <div class={css.scroll}>
        <p class={css.sub} style={{ marginTop: 0 }}>
          Things to aim for, if you want something to aim for. Every tool is free, nothing is locked and nothing can be lost. Ignore all of this and the world carries on.
        </p>
        <div class={css.sub} style={{ margin: '8px 0 10px' }}>{reached} of {s.goals.length} reached</div>
        {s.goals.map(({ goal, result, reached: done, here }) => {
          const rec = s.goalsDone[goal.id];
          const why = result.eventId ?? (here ? rec?.eventId : undefined);
          return (
            <div class={`${css.goal} ${done ? css.goalDone : ''}`} key={goal.id}>
              <div class={css.goalTitle}>
                <b>{done ? '✓ ' : ''}{goal.title}</b>
                <button class={css.link} style={{ marginRight: 0 }} onClick={() => actions.trackGoal(s.goalTracked === goal.id ? '' : goal.id)}>
                  {s.goalTracked === goal.id ? 'following' : 'follow'}
                </button>
              </div>
              <div>{goal.brief}</div>
              <div class={css.goalMeter}><i style={{ width: `${Math.round((here ? 1 : result.progress) * 100)}%` }} /></div>
              <div class={css.sub}>
                {result.note}
                {rec && <> · reached {here ? `here, ${formatYear(rec.year)}` : `on the world "${rec.seed}"`}</>}
              </div>
              <div style={{ marginTop: '4px' }}>
                <button class={css.link} onClick={() => setOpen(open === goal.id ? '' : goal.id)}>{open === goal.id ? 'hide the hint' : 'a hint'}</button>
                {why !== undefined && why >= 0 && s.events[why] && <button class={css.link} onClick={() => update({ whyEvent: why, panel: 'none' })}>why did this happen?</button>}
                {done && here && <button class={css.link} onClick={() => actions.copySeedLink()}>share this world</button>}
              </div>
              {open === goal.id && <div class={css.sub} style={{ marginTop: '4px' }}>{goal.hint}</div>}
            </div>
          );
        })}
        {reached > 0 && <p style={{ marginTop: '12px' }}><button class={css.link} onClick={() => actions.resetGoals()}>start the list again</button></p>}
      </div>
    </div>
  );
}

/** The goal being followed, as a small box beside the title (under it on a phone). */
export function GoalMarker() {
  const s = useStore();
  const g = s.goals.find((x) => x.goal.id === s.goalTracked);
  if (!g) return null;
  return (
    <button class={`${css.panel} ${css.goalMarker}`} onClick={() => update({ panel: s.panel === 'goals' ? 'none' : 'goals' })} title="Open goals">
      <span>{g.here ? '✓ ' : ''}{g.goal.title}</span>
      <span class={css.goalMeter}><i style={{ width: `${Math.round((g.here ? 1 : g.result.progress) * 100)}%` }} /></span>
      <span class={css.sub}>{g.result.note}</span>
    </button>
  );
}
