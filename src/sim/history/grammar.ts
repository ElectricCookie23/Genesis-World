// Template text. Every chronicle line, biography and newspaper is written by filling
// templates from tables of phrasing with facts from the simulation. No outside service is used.
//
//   #rule#        one of the alternatives listed under `rule`, chosen by the random stream, expanded in turn
//   {name}        the value passed in under `name`
//   .cap .a .s    modifiers after either: capital first letter, "a"/"an" in front, plural
//   [x|y|z]       one of the alternatives written in place
import type { RNG } from '../rng';

export type Rules = Record<string, readonly string[]>;
export type Facts = Record<string, string | number | undefined>;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const article = (s: string): string => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);
const plural = (s: string): string => (/(s|x|z|ch|sh)$/i.test(s) ? `${s}es` : /[^aeiou]y$/i.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`);

function modify(text: string, mods: string[]): string {
  let out = text;
  for (const m of mods) out = m === 'cap' ? cap(out) : m === 'a' ? article(out) : m === 's' ? plural(out) : out;
  return out;
}

/** Fill one template. `rules` may be empty when the template only uses facts and inline choices. */
export function write(template: string, facts: Facts, rng: RNG, rules: Rules = {}, depth = 0): string {
  if (depth > 12) return template;
  let out = template.replace(/\[([^\[\]]*)\]/g, (_, body: string) => { const alts = body.split('|'); return alts[rng.int(alts.length)]!; });
  out = out.replace(/#([a-zA-Z0-9_]+)((?:\.[a-z]+)*)#/g, (_, name: string, mods: string) => {
    const alts = rules[name];
    if (!alts || !alts.length) return name;
    return modify(write(alts[rng.int(alts.length)]!, facts, rng, rules, depth + 1), mods ? mods.slice(1).split('.') : []);
  });
  out = out.replace(/\{([a-zA-Z0-9_]+)((?:\.[a-z]+)*)\}/g, (_, name: string, mods: string) => {
    const v = facts[name];
    return modify(v === undefined ? name : String(v), mods ? mods.slice(1).split('.') : []);
  });
  return out.replace(/\s+/g, ' ').replace(/ ([,.;:!?])/g, '$1').trim();
}

/** Join a list the way a sentence does: "a, b and c". */
export function listing(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A whole number written out with thousands separators. */
export function count(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "1st", "2nd", "3rd", "4th". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
