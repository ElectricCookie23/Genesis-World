// The era clock. An era is a band of a nation's level of knowledge. Eras are not global: each nation
// is in its own, so one can be raising engines while another still keeps to its fields.

export interface Era {
  /** Level of knowledge at which the era begins (the scale settlements and nations share). */
  from: number;
  /** A plain name for what defines it. Cultures give eras names of their own (expansion system E2). */
  name: string;
  /** For the optional "comparable to Earth around ..." note: a year, negative for BCE. */
  earth: number;
}

export const ERAS: Era[] = [
  { from: 0, name: 'Age of Camps', earth: -20000 },
  { from: 0.22, name: 'Age of Fields', earth: -8000 },
  { from: 0.3, name: 'Age of Kilns', earth: -3500 },
  { from: 0.45, name: 'Age of Walls', earth: -800 },
  { from: 0.6, name: 'Age of Sails', earth: 1450 },
  { from: 0.72, name: 'Age of Presses', earth: 1700 },
  { from: 0.85, name: 'Age of Engines', earth: 1850 },
  { from: 1.0, name: 'Age of Signals', earth: 1960 },
  { from: 1.1, name: 'Age of Orbit', earth: 2030 },
  { from: 1.18, name: 'Age Beyond', earth: 2200 },
];

/** The era a level of knowledge falls in. */
export function eraOf(tech: number): number {
  let e = 0;
  for (let i = 1; i < ERAS.length; i++) if (tech >= ERAS[i]!.from) e = i;
  return e;
}

/** "comparable to Earth around 1450" / "... 3500 BCE". */
export function earthNote(era: number): string {
  const y = ERAS[Math.max(0, Math.min(ERAS.length - 1, era))]!.earth;
  return y < 0 ? `comparable to Earth around ${-y} BCE` : `comparable to Earth around ${y}`;
}

/**
 * What an age is called depends on how a people got there (system E2). The age that begins with the
 * first hard cutting edge is an Age of Copper for those with ore, an Age of Glass for those with
 * only sand, an Age of Fired Clay for the rest. `wayOf` gives the invention a nation has, or will
 * have, for a need of the tech web ('' if its land allows none).
 */
const NAMED: Record<number, { slot: string; by: Record<string, string>; none?: string }> = {
  2: { slot: 'edge', by: { copper: 'Age of Copper', glassblade: 'Age of Glass', hardclay: 'Age of Fired Clay' } },
  3: { slot: 'hard', by: { iron: 'Age of Iron', bonecomp: 'Age of Horn', sinter: 'Age of White Stone' } },
  4: { slot: 'compass', by: { lodestone: 'Age of Sails', sunstone: 'Age of Sun Stones' }, none: 'Age of Roads' },
  6: { slot: 'engine', by: { steam: 'Age of Steam', turbine: 'Age of Falling Water', sunboiler: 'Age of Mirrors' } },
  7: { slot: 'telegraph', by: { wire: 'Age of Wires', heliograph: 'Age of Flashing Towers' } },
};

export function eraTitle(era: number, wayOf: (slot: string) => string): string {
  const e = Math.max(0, Math.min(ERAS.length - 1, era));
  const named = NAMED[e];
  if (!named) return ERAS[e]!.name;
  const way = wayOf(named.slot);
  return named.by[way] ?? (way === '' && named.none ? named.none : ERAS[e]!.name);
}

/** The need of the tech web that an age is named for, or '' if the age has one name for everyone. */
export function eraSlot(era: number): string {
  return NAMED[era]?.slot ?? '';
}
