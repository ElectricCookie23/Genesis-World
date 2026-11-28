import { describe, expect, it } from 'vitest';
import { SKIP_PATIENCE, skipStop, skipStopText } from '../src/sim/skip';

describe('a skip to an age', () => {
  it('waits as long as it takes while there is no people yet', () => {
    expect(skipStop(false, false, false, 0)).toBe('');
  });
  it('goes on while a people is on its way', () => {
    expect(skipStop(true, true, true, 0)).toBe('');
    expect(skipStop(true, true, true, SKIP_PATIENCE)).toBe('');
  });
  it('stops when the people it was waiting for have died out', () => {
    expect(skipStop(true, false, false, 1200)).toBe('gone');
  });
  it('stops when they have settled into the long peace short of the age', () => {
    expect(skipStop(true, true, false, 9000)).toBe('settled');
  });
  it('stops when they have had far longer than a history takes', () => {
    expect(skipStop(true, true, true, SKIP_PATIENCE + 25)).toBe('long');
  });
  it('says why in plain words, naming both ages', () => {
    for (const why of ['gone', 'settled', 'long'] as const) {
      const text = skipStopText(why, 'Age of Sails', 'Age of Kilns');
      expect(text).toContain('Age of Kilns');
      expect(text.startsWith('The skip has stopped')).toBe(true);
    }
    expect(skipStopText('gone', 'Age of Sails', 'Age of Kilns')).toContain('Age of Sails');
  });
});
