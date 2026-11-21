// Signs of the generated scripts (system E23), drawn on the page: one sign, or a line of them.
import type { ScriptInfo } from '../shared/protocol';
import { hash32, hashText } from '../sim/history/hash';
import { glyphPath, picture, wornGlyph } from '../sim/history/script';

/** How worn a script is in a year (the same rule as the history engine's `wearOf`). */
export function wearAt(script: ScriptInfo, year: number): number {
  return Math.min(0.97, script.from + (1 - script.from) * (1 - Math.exp(-Math.max(0, year - script.born) / 1100)));
}

/** One sign: the picture for a meaning, as worn as `wear` says (0 the first picture, 1 the last abstraction). */
export function Sign({ meaning, script, wear, size = 22, colour = '#f2eee4', title }: { meaning: string; script: ScriptInfo; wear: number; size?: number; colour?: string; title?: string }) {
  const g = wornGlyph(picture(meaning, script.body), wear, hash32(script.id, 0x5c1), hashText(meaning));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none', display: 'inline-block', verticalAlign: 'middle' }}>
      {title && <title>{title}</title>}
      <path d={glyphPath(g, size, script.hand === 1 && wear < 0.85)} fill="none" stroke={colour} stroke-width={Math.max(1, size / 16)} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** The meanings a glossed sentence is written with: one sign for each word, and for each ending that is itself a word. */
export function signsOf(gloss: string): string[] {
  return gloss.split(/[\s-]+/).filter(Boolean).map((t) => (t === 'MANY' ? 'many' : t === 'BEFORE' ? 'old' : t === 'THE' ? 'this' : t));
}

/** A line of writing: the signs for some meanings, with what each means underneath when the Rosetta is on. */
export function Written({ meanings, script, wear, size = 22, rosetta = false, colour }: { meanings: string[]; script: ScriptInfo; wear: number; size?: number; rosetta?: boolean; colour?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: `${Math.round(size / 5)}px`, alignItems: 'flex-start', flexWrap: 'wrap', verticalAlign: 'middle' }}>
      {meanings.map((m, i) => (
        <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
          <Sign meaning={m} script={script} wear={wear} size={size} colour={colour} title={rosetta ? m : undefined} />
          {rosetta && <span style={{ font: '400 9px/1.2 system-ui, sans-serif', color: '#8f887c' }}>{m}</span>}
        </span>
      ))}
    </span>
  );
}
