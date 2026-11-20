// The languages of the world (system E21): the family tree of every language still spoken, and for the one
// chosen its sounds, its grammar, how its sounds have changed, and its words laid beside those of its nearest
// relative and of the language least like it.
import type { LanguageInfo } from '../shared/protocol';
import { update, useStore } from './store';
import css from './ui.module.css';

/** How far apart two words are: edit distance over the longer length (0 the same, 1 nothing shared). */
export function apart(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m || !n) return 1;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n]! / Math.max(m, n);
}

/** How unlike two languages are, over the shared list of meanings: 0 the same words, 1 nothing in common. */
export function unlike(a: LanguageInfo, b: LanguageInfo): number {
  let sum = 0;
  const n = Math.min(a.words.length, b.words.length);
  for (let i = 0; i < n; i++) sum += apart(a.words[i]!, b.words[i]!);
  return n ? sum / n : 1;
}

/** The language nearest to this one and the one least like it, among the others (spoken ones first). */
export function relatives(of: LanguageInfo, all: LanguageInfo[]): { near: LanguageInfo | null; far: LanguageInfo | null } {
  let near: LanguageInfo | null = null, far: LanguageInfo | null = null, nd = Infinity, fd = -1;
  for (const o of all) {
    if (o.id === of.id) continue;
    const d = unlike(of, o);
    // (a language no one speaks is a fair comparison only when nothing else is)
    const dead = o.speakers ? 0 : 0.001;
    if (d > 0.02 && d + dead < nd) { nd = d + dead; near = o; }
    if (d - (o.family !== of.family ? -1 : 0) - dead > fd) { fd = d - (o.family !== of.family ? -1 : 0) - dead; far = o; }
  }
  if (far && near && far.id === near.id) far = null;
  return { near, far };
}

/** The tree as rows: every language under the one it split from, oldest first, with how deep it sits. */
export function treeRows(all: LanguageInfo[]): { lang: LanguageInfo; depth: number; last: boolean }[] {
  const ids = new Set(all.map((l) => l.id));
  const kids = new Map<number, LanguageInfo[]>();
  const roots: LanguageInfo[] = [];
  for (const l of all) {
    if (l.parent >= 0 && ids.has(l.parent)) { let k = kids.get(l.parent); if (!k) kids.set(l.parent, (k = [])); k.push(l); } else roots.push(l);
  }
  const rows: { lang: LanguageInfo; depth: number; last: boolean }[] = [];
  const walk = (l: LanguageInfo, depth: number, last: boolean): void => {
    rows.push({ lang: l, depth, last });
    const k = (kids.get(l.id) ?? []).sort((a, b) => a.born - b.born);
    k.forEach((c, i) => walk(c, depth + 1, i === k.length - 1));
  };
  roots.sort((a, b) => a.born - b.born).forEach((r, i) => walk(r, 0, i === roots.length - 1));
  return rows;
}

function shade(d: number): string {
  return d < 0.01 ? '#9fe0a0' : d < 0.4 ? '#cfe7b0' : d < 0.7 ? '#ece7db' : '#a79f92';
}

export function LanguagesPanel() {
  const s = useStore();
  const data = s.languages;
  const all = data ? data.list : [];
  const chosen = all.find((l) => l.id === s.tongue) ?? all.filter((l) => l.speakers).sort((a, b) => b.people - a.people)[0] ?? all[0];
  const rows = treeRows(all);
  const { near, far } = chosen ? relatives(chosen, all) : { near: null, far: null };
  const year = s.stats?.simYear ?? 0;
  const small = typeof window !== 'undefined' && window.innerWidth < 620;
  const cols = [chosen, near, far].filter((x): x is LanguageInfo => !!x);
  return (
    <div class={`${css.panel} ${css.side}`} style={{ width: 'min(720px, 96vw)' }}>
      <div class={css.head}><h2>Languages</h2><span class={css.sub}>{all.filter((l) => l.speakers).length} spoken</span><button class={css.close} onClick={() => update({ panel: 'peoples' })}>✕</button></div>
      <div class={css.scroll}>
        {!data && <p class={css.sub}>Listening.</p>}
        {data && all.length === 0 && <p class={css.sub}>No one has spoken yet.</p>}
        {chosen && (
          <div style={{ display: 'flex', gap: '14px', flexDirection: small ? 'column' : 'row', alignItems: 'flex-start' }}>
            <div style={{ flex: 'none', width: small ? '100%' : '230px' }}>
              <div class={css.sub} style={{ margin: '0 0 4px', letterSpacing: '0.08em' }}>THE FAMILY TREE</div>
              {rows.map(({ lang, depth, last }) => (
                <button
                  key={lang.id}
                  onClick={() => update({ tongue: lang.id })}
                  title={lang.speakers ? `Spoken in ${lang.speakers}` : 'No longer spoken'}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px',
                    background: lang.id === chosen.id ? '#ffffff1f' : 'transparent', color: lang.speakers ? '#f2eee4' : '#8f887c',
                    font: `${lang.speakers ? 600 : 400} 12.5px/1.35 system-ui, sans-serif`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  <span style={{ color: '#6f695f', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre' }}>{depth > 0 ? `${'   '.repeat(depth - 1)}${last ? '└ ' : '├ '}` : ''}</span>
                  {lang.name}{lang.speakers ? '' : ' †'}
                  <span style={{ color: '#8f887c', fontWeight: 400 }}> {lang.speakers ? `${Math.round(lang.people).toLocaleString('en-US')}k` : ''}</span>
                </button>
              ))}
              <p class={css.sub} style={{ margin: '8px 0 0' }}>† no longer spoken: it lives on in its daughters. Numbers are speakers, in thousands.</p>
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <div style={{ font: '600 17px/1.2 system-ui, sans-serif', color: '#f2eee4' }}>{chosen.name}</div>
              <p class={css.sub} style={{ margin: '2px 0 8px' }}>
                {chosen.speakers ? `Spoken in ${chosen.speakers}.` : 'No one speaks it now.'}{' '}
                {chosen.parent >= 0 ? `It parted from ${all.find((l) => l.id === chosen.parent)?.name ?? 'an older tongue'} ${Math.max(0, Math.round(year - chosen.born)).toLocaleString('en-US')} years ago.` : 'It is the first tongue of its family: every other on this branch of the tree came out of it.'}
              </p>
              <div class={css.when} style={{ color: '#ece7db' }}>{chosen.sounds}</div>
              <div class={css.when} style={{ color: '#cfc9bd', margin: '4px 0 10px' }}>{chosen.grammar}</div>
              <div class={css.sub} style={{ margin: '0 0 4px', letterSpacing: '0.08em' }}>THE SAME WORDS IN {cols.length} TONGUES</div>
              <div style={{ display: 'grid', gridTemplateColumns: `minmax(64px, 0.8fr) repeat(${cols.length}, minmax(0, 1fr))`, columnGap: '10px', rowGap: '1px', font: '400 12.5px/1.4 system-ui, sans-serif' }}>
                <span class={css.sub}>meaning</span>
                {cols.map((c, i) => (
                  <span key={c.id} class={css.sub} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {i === 0 ? c.name : <button class={css.link} style={{ marginRight: 0 }} onClick={() => update({ tongue: c.id })}>{c.name}</button>}
                    {i === 1 ? ' (nearest)' : i === 2 ? (c.family !== chosen.family ? ' (no kin)' : ' (furthest)') : ''}
                  </span>
                ))}
                {data!.lexicon.map((m, k) => (
                  <>
                    <span key={`m${k}`} style={{ color: '#8f887c' }}>{m}</span>
                    {cols.map((c, i) => <span key={`${c.id}-${k}`} style={{ color: i === 0 ? '#f2eee4' : shade(apart(chosen.words[k] ?? '', c.words[k] ?? '')) }}>{c.words[k]}</span>)}
                  </>
                ))}
              </div>
              {near && <p class={css.sub} style={{ margin: '6px 0 10px' }}>{chosen.name} and {near.name} share {Math.round((1 - unlike(chosen, near)) * 100)}% of their sounds over these words{far ? `; ${chosen.name} and ${far.name}, ${Math.round((1 - unlike(chosen, far)) * 100)}%` : ''}. Greener words are closer to {chosen.name}.</p>}
              <div class={css.sub} style={{ margin: '0 0 4px', letterSpacing: '0.08em' }}>THINGS SAID IN IT</div>
              {chosen.samples.map((x, i) => (
                <div key={i} style={{ margin: '0 0 6px' }}>
                  <div style={{ font: '600 13.5px/1.3 system-ui, sans-serif', color: '#f2eee4' }}>{x.text}</div>
                  <div style={{ font: '400 11px/1.3 ui-monospace, monospace', color: '#8f887c' }}>{x.gloss}</div>
                  <div class={css.when} style={{ color: '#cfc9bd' }}>{data!.sayings[i]}{near ? ` In ${near.name}: ${near.samples[i]?.text ?? ''}` : ''}</div>
                </div>
              ))}
              {chosen.changes.length > 0 && <div class={css.sub} style={{ margin: '8px 0 4px', letterSpacing: '0.08em' }}>HOW ITS SOUNDS HAVE CHANGED</div>}
              {chosen.changes.slice().reverse().map((c, i) => <div key={i} class={css.when} style={{ color: '#cfc9bd' }}>{Math.max(0, Math.round(year - c.year)).toLocaleString('en-US')} years ago, {c.note}.</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
