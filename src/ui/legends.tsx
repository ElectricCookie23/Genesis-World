// Stories told about old bones (system E28): what was dug up and where, the story told about it, the animal
// it really was (a species in the tree of life), and whether anyone has yet worked that out.
import { actions, update, useStore } from './store';
import css from './ui.module.css';

export function LegendsPanel() {
  const s = useStore();
  const list = s.legends;
  const year = s.stats?.simYear ?? 0;
  const long = (y: number) => (y >= 1e6 ? `${(y / 1e6).toFixed(y >= 1e7 ? 0 : 1)} million years ago` : `${Math.max(1, Math.round(y / 1000)).toLocaleString('en-US')} thousand years ago`);
  const ago = (y: number) => `${Math.max(0, Math.round(year - y)).toLocaleString('en-US')} years ago`;
  return (
    <div class={`${css.panel} ${css.side}`} style={{ width: 'min(560px, 96vw)' }}>
      <div class={css.head}><h2>Old bones</h2><span class={css.sub}>{list ? `${list.length} stories` : ''}</span><button class={css.close} onClick={() => update({ panel: 'peoples' })}>✕</button></div>
      <div class={css.scroll}>
        {!list && <p class={css.sub}>Asking the storytellers.</p>}
        {list && list.length === 0 && <p class={css.sub}>No one has dug up anything they could not explain. It takes a mine, a well or a new field, and an animal that died out near there long ago.</p>}
        {list && list.length > 0 && <p class={css.sub} style={{ margin: '0 0 10px' }}>People who dig find the bones of animals that died out before there were people, and explain them as well as they can. Every story here is about a real species in the tree of life.</p>}
        {(list ?? []).map((L) => (
          <div key={L.id} class={css.entry} style={{ cursor: 'default', color: L.known ? '#b9d7a8' : '#ffcf8a' }}>
            <i class={css.dot} />
            <div class={css.what} style={{ color: '#f2eee4' }}>{L.own}, {L.means}</div>
            <div class={css.when} style={{ color: '#8f887c' }}>{L.nation}, {ago(L.year)}; found at {L.found}.</div>
            <div class={css.when} style={{ color: '#ece7db', margin: '3px 0' }}>{L.tale}</div>
            <div class={css.when} style={{ color: '#cfc9bd' }}>
              The bones are those of <button class={css.link} style={{ marginRight: 0 }} title="Its place in the tree of life" onClick={() => actions.selectSpecies(L.species)}>{L.speciesName}</button>, which died out {long(year - L.extinctYear)}.
              {' '}{L.known ? `${L.known.nation} worked it out ${ago(L.known.year)}: ${L.known.text.charAt(0).toLowerCase()}${L.known.text.slice(1)}` : 'No one who tells the story knows that yet.'}
            </div>
            {L.cell >= 0 && <button class={css.link} onClick={() => actions.flyToCell(L.cell, 0.25)}>where it was found</button>}
            <button class={css.link} onClick={() => update({ whyEvent: L.eventId })}>how the story began</button>
            {L.known && <button class={css.link} onClick={() => update({ whyEvent: L.known!.eventId })}>how it was worked out</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
