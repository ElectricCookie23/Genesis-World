// A skip to an age waits for a people to reach it. When does it stop waiting? The rule is here, pure, so that
// the worker and the tests agree.

/** A skip gives a people this many years of living history to reach the age asked for before it gives up on them. */
export const SKIP_PATIENCE = 40000;

/** Why a skip stopped short: the people died out, they settled into the long peace, or they had far longer than a history takes. */
export type SkipStop = '' | 'gone' | 'settled' | 'long';

/**
 * Should a skip to an age give up? `seen`: has there been a people during this skip (or when it began)?
 * `active`: is there a country now? `live`: is history still being made (not settled into the long peace)?
 * `lived`: the years of living history this skip has run through.
 * Before any people exists it waits: there is nothing yet to give up on.
 */
export function skipStop(seen: boolean, active: boolean, live: boolean, lived: number): SkipStop {
  if (seen && !active) return 'gone';
  if (seen && !live) return 'settled';
  return lived > SKIP_PATIENCE ? 'long' : '';
}

/** What the page says when a skip stops short. `to` and `got` are the names of the age asked for and the age reached. */
export function skipStopText(why: Exclude<SkipStop, ''>, to: string, got: string): string {
  return why === 'gone' ? `The skip has stopped: the people died out before the ${to}. They had reached the ${got}.`
    : why === 'settled' ? `The skip has stopped: the people have settled into a long peace in the ${got}, short of the ${to}.`
      : `The skip has stopped: after forty thousand years of history the people are still in the ${got}.`;
}
