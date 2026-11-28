// The languages of the world as the page is told of them (system E21).
import type { LanguageInfo, ScriptInfo } from '../../shared/protocol';
import { describeScript, type Body } from './script';
import { word } from './language';
import type { HistoryState } from './model';
import { LEXICON, SAYINGS, describeGrammar, describeSounds, say } from './syntax';

/**
 * The languages of the world (system E21): every language still spoken and every ancestor of one, so that the
 * family tree is whole. When there are very many, the most spoken are kept.
 */
/** A script with what the page needs to draw it. `bodyOf` says what a species looks like. */
export function scriptInfo(h: HistoryState, id: number | undefined, species: number, year: number, bodyOf: (species: number) => Body): ScriptInfo | undefined {
  const sc = id !== undefined ? h.scripts?.[id] : undefined;
  if (!sc) return undefined;
  const parent = sc.parent >= 0 ? h.scripts![sc.parent] : undefined;
  // (the pictures are of the people who first drew them: a script learned from another kind keeps their shape)
  let root = sc;
  while (root.parent >= 0 && h.scripts![root.parent]) root = h.scripts![root.parent]!;
  const first = h.nations[root.nation];
  return { id: sc.id, parent: sc.parent, parentName: parent ? parent.name : '', name: sc.name, born: sc.born, from: sc.from, hand: sc.hand, body: bodyOf(first ? first.species : species), about: describeScript(sc, parent ? parent.name : '', year) };
}

export function languageList(h: HistoryState, year = 0, bodyOf?: (species: number) => Body): LanguageInfo[] {
  const spoken = new Map<number, { names: string[]; people: number; script?: number; species: number; most: number }>();
  for (const n of h.nations) {
    if (n.ended >= 0) continue;
    const id = h.cultures[n.culture]!.language;
    let e = spoken.get(id);
    if (!e) spoken.set(id, (e = { names: [], people: 0, species: n.species, most: -1 }));
    e.names.push(n.name); e.people += n.pop;
    // (written as its largest country that writes writes it)
    if (n.script !== undefined && n.pop > e.most) { e.most = n.pop; e.script = n.script; e.species = n.species; }
  }
  let living = [...spoken.keys()].sort((a, b) => spoken.get(b)!.people - spoken.get(a)!.people);
  // (no one left to speak any of them: the last that were spoken)
  if (!living.length) living = h.languages.slice(-12).map((l) => l.id);
  const keep = new Set<number>();
  for (const id of living.slice(0, 48)) for (let l = h.languages[id]; l && !keep.has(l.id) && keep.size < 90; l = h.languages[l.parent]) keep.add(l.id);
  // (a tongue that was only a step on the way, parted from and left within a lifetime, is not shown as a branch of its own)
  const kept = [...keep].map((id) => h.languages[id]!);
  for (const l of kept) {
    if (spoken.has(l.id)) continue;
    const kids = kept.filter((k) => k.parent === l.id && keep.has(k.id));
    if (kids.length === 1 && kids[0]!.bornYear - l.bornYear < 40 && l.parent >= 0) keep.delete(l.id);
  }
  const above = (id: number): number => { let p = h.languages[id]!.parent; while (p >= 0 && !keep.has(p)) p = h.languages[p]!.parent; return p; };
  const out: LanguageInfo[] = [];
  for (const lang of h.languages) {
    if (!keep.has(lang.id)) continue;
    const who = spoken.get(lang.id);
    const names = who ? who.names : [];
    out.push({
      id: lang.id, parent: above(lang.id), family: lang.family, name: lang.name, born: lang.bornYear,
      speakers: names.length === 0 ? '' : names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} other countries`,
      people: who ? who.people : 0,
      sounds: describeSounds(lang), grammar: describeGrammar(lang),
      words: LEXICON.map((m) => word(lang, m)),
      // (changes of sound and changes of grammar in one list, by year: the last ten)
      changes: [...lang.changes.map((c) => ({ year: c.year, note: c.note })), ...(lang.shifts ?? []).map((x) => ({ year: x.year, note: `grammar: ${x.note}` }))].sort((a, b) => a.year - b.year).slice(-10),
      samples: SAYINGS.map((x) => say(lang, x)),
      script: who && bodyOf ? scriptInfo(h, who.script, who.species, year, bodyOf) : undefined,
    });
  }
  return out;
}
