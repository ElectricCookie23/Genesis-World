// The owner's rule: no religion and no "god" anywhere in the game. This reads the source for the words themselves,
// outside comments and outside the few lines that mend worlds saved before the rule.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('wording', () => {
  it('has no gods, worship, prayer or scripture in anything the game can say', () => {
    const banned = /\bgods?\b|\bgoddess|\bholy\b|\bsacred\b|worship|\bpray(s|ed|er|ers|ing)?\b|scripture|\bdeit(y|ies)\b|\bdivine\b/i;
    const found: string[] = [];
    for (const file of files('src')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        // an old save's event types are renamed on loading
        if (code.includes("startsWith('god-')")) return;
        // (a trailing comment is not something the game says either)
        const said = code.replace(/\s\/\/ .*$/, '');
        if (banned.test(said)) found.push(`${file}:${i + 1}: ${said.slice(0, 120)}`);
      });
    }
    expect(found).toEqual([]);
  });
});
