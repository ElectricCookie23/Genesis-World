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
