// What time does to a town no one lives in (system E18). Roofs go first, then the walls come
// down, then there are only mounds, and at last nothing shows above the forest floor. A great
// city of stone and steel lasts longer than a village of mud brick, but not for ever.

/** The stages of a ruin, in order. */
export const DECAY = ['empty', 'roofless', 'crumbling', 'mounds', 'gone'] as const;

/** How many years each stage lasts for a place that knew `tech`: longer for one that built in stone and steel. */
export function decaySpans(tech: number): [number, number, number, number] {
  const lasting = 0.5 + 1.1 * Math.max(0, Math.min(1.2, tech));
  return [25 * lasting, 130 * lasting, 500 * lasting, 2200 * lasting];
}

/** The stage a ruin is at (an index into DECAY), and how far through that stage it is (0..1). */
export function decayOf(years: number, tech: number): { stage: number; through: number } {
  const spans = decaySpans(tech);
  let t = Math.max(0, years);
  for (let k = 0; k < spans.length; k++) { if (t < spans[k]!) return { stage: k, through: t / spans[k]! }; t -= spans[k]!; }
  return { stage: 4, through: 1 };
}

/** How much of what stood still stands: the share of buildings, and how much of their height. */
export function standing(years: number, tech: number): { share: number; height: number } {
  const { stage, through } = decayOf(years, tech);
  const share = [1, 0.92, 0.7, 0.3, 0][stage]! + ([0.92, 0.7, 0.3, 0, 0][stage]! - [1, 0.92, 0.7, 0.3, 0][stage]!) * through;
  const height = [1, 0.85, 0.6, 0.25, 0][stage]! + ([0.85, 0.6, 0.25, 0.08, 0][stage]! - [1, 0.85, 0.6, 0.25, 0][stage]!) * through;
  return { share, height };
}

/** How much of the land round a town is still bare of wild growth so many years after it was left: fields go back to scrub in a few generations, streets take centuries. */
export function stillCleared(years: number, streets: boolean): number {
  const left = Math.exp(-Math.max(0, years) / (streets ? 450 : 140));
  return left < 0.02 ? 0 : left;
}

/** A ruin in a sentence. */
export function describeRuin(years: number, tech: number): string {
  const { stage } = decayOf(years, tech);
  return [
    'Its doors stand open and its roofs are still on. Weeds are up between the paving stones.',
    'Its roofs have fallen in. Saplings stand in the rooms and the streets are green.',
    'Its walls are coming down. Trees grow through the floors and roots lift the streets.',
    'Low mounds under the trees, a line of stones, a doorway with nothing behind it.',
    'The forest has it all. Nothing shows above the ground.',
  ][stage]!;
}
