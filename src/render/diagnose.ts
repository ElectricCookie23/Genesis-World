// Safety net and black-box recorder for the renderer's inputs.
// A single non-finite number in a uniform turns whole surfaces black on some graphics cards (and not on
// others), which makes such a fault very hard to find from a screenshot. So every frame the shared
// uniforms are checked and a bad one is put back to its starting value, with a warning in the console;
// and the whole state can be written out for a bug report.
import * as common from './common';
import { uSiblings } from './atmosphere';
import { uAurora, uMagneticPole } from './gfx/aurora';
import { uNightMap } from './gfx/civmap';
import { uMoonBody, uMoonBody2 } from './gfx/eclipse';
import { uCyclones } from './gfx/volclouds';

interface U { value: unknown }
const isUniform = (v: unknown): v is U => !!v && typeof v === 'object' && 'value' in (v as object) && (v as { isNode?: boolean }).isNode === true;

const table: { name: string; u: U; initial: unknown }[] = [];
function add(name: string, v: unknown): void {
  if (Array.isArray(v)) { v.forEach((x, i) => add(`${name}[${i}]`, x)); return; }
  if (isUniform(v)) {
    const val = v.value as { clone?: () => unknown; isTexture?: boolean } | number;
    if (typeof val === 'number') table.push({ name, u: v, initial: val });
    else if (val && typeof val === 'object' && !val.isTexture && typeof val.clone === 'function') table.push({ name, u: v, initial: val.clone() });
  } else if (v && typeof v === 'object' && isUniform((v as { dir?: unknown }).dir)) { add(`${name}.dir`, (v as { dir: unknown }).dir); add(`${name}.color`, (v as { color: unknown }).color); }
}
for (const [k, v] of Object.entries({ ...common, uSiblings, uAurora, uMagneticPole, uNightMap, uMoonBody, uMoonBody2, uCyclones })) add(k, v);

const finite = (v: unknown): boolean => {
  if (typeof v === 'number') return Number.isFinite(v);
  const arr = (v as { toArray?: () => number[] }).toArray?.();
  return !arr || arr.every((x) => Number.isFinite(x));
};

let warned = 0;
/** Put any uniform that has gone non-finite back to its starting value. Returns the names that were reset. */
export function guardUniforms(): string[] {
  const bad: string[] = [];
  for (const e of table) {
    if (finite(e.u.value)) continue;
    bad.push(e.name);
    if (typeof e.initial === 'number') e.u.value = e.initial;
    else (e.u.value as { copy: (o: unknown) => void }).copy(e.initial);
  }
  if (bad.length && warned++ < 20) console.warn('[genesis] reset non-finite shader input:', bad.join(', '));
  return bad;
}

/** Every shared uniform by name, for a diagnostic report. */
export function dumpUniforms(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of table) {
    const v = e.u.value;
    out[e.name] = typeof v === 'number' ? v : ((v as { toArray?: () => number[] }).toArray?.() ?? String(v));
  }
  return out;
}

/** Range and count of bad numbers in each per-cell field of a snapshot. */
export function summariseCells(cells: object | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!cells) return out;
  for (const [k, a] of Object.entries(cells)) {
    if (!ArrayBuffer.isView(a) || a instanceof DataView) { if (typeof a === 'number' || typeof a === 'boolean') out[k] = a; continue; }
    const arr = a as unknown as ArrayLike<number>;
    let bad = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < arr.length; i++) { const v = arr[i]!; if (!Number.isFinite(v)) bad++; else { if (v < lo) lo = v; if (v > hi) hi = v; } }
    out[k] = { nonFinite: bad, min: lo, max: hi };
  }
  return out;
}
