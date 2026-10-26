import { describe, it, expect } from 'vitest';
import { diceCount, resolveRoll } from '../../src/game/dice.js';
import { IllegalMoveError } from '../../src/game/errors.js';

describe('diceCount (GAME_RULES §5.2)', () => {
  it('rolls 2 dice each with 10 attackers against 2 defenders', () => {
    expect(diceCount(10, 2)).toBe(2);
  });

  it('rolls 2 dice each with 3 attackers against 5 defenders', () => {
    expect(diceCount(3, 5)).toBe(2);
  });

  it('rolls 1 die each with 2 attackers against 5 defenders', () => {
    expect(diceCount(2, 5)).toBe(1);
  });

  it('throws IllegalMoveError when the attacker has only 1 soldier', () => {
    expect(() => diceCount(1, 3)).toThrow(IllegalMoveError);
  });

  it('has no 3-dice cap: 10 attackers against 10 defenders roll 9 dice each', () => {
    expect(diceCount(10, 10)).toBe(9);
  });

  it('rolls as many dice as defenders when attackers − 1 equals defenders', () => {
    expect(diceCount(4, 3)).toBe(3);
  });
});

describe('resolveRoll (GAME_RULES §5.3)', () => {
  it('matches the case-study row: 10 vs 2, [1,4] vs [2,3] → each side loses 1 (9 vs 1)', () => {
    const { attackerLosses, defenderLosses } = resolveRoll([1, 4], [2, 3]);
    expect({ attackerLosses, defenderLosses }).toEqual({ attackerLosses: 1, defenderLosses: 1 });
    expect([10 - attackerLosses, 2 - defenderLosses]).toEqual([9, 1]);
  });

  it('matches row 2: 6 vs 3, [5,5,1] vs [5,2,6] → each side loses 1 (5 vs 2)', () => {
    const { attackerLosses, defenderLosses } = resolveRoll([5, 5, 1], [5, 2, 6]);
    expect({ attackerLosses, defenderLosses }).toEqual({ attackerLosses: 1, defenderLosses: 1 });
    expect([6 - attackerLosses, 3 - defenderLosses]).toEqual([5, 2]);
  });

  it('kills nobody on a tied single pair: [3] vs [3]', () => {
    expect(resolveRoll([3], [3])).toEqual({ attackerLosses: 0, defenderLosses: 0 });
  });

  it('kills 2 defenders when the attacker wins every pair: [6,6] vs [1,1]', () => {
    const { attackerLosses, defenderLosses } = resolveRoll([6, 6], [1, 1]);
    expect({ attackerLosses, defenderLosses }).toEqual({ attackerLosses: 0, defenderLosses: 2 });
    expect([5 - attackerLosses, 2 - defenderLosses]).toEqual([5, 0]);
  });

  it('pairs dice in roll order, not sorted', () => {
    // Sorted high-to-low this would be 6>5, 2>1 → defender −2. In roll order it is 1<2, 6>5.
    expect(resolveRoll([1, 6], [2, 5])).toEqual({ attackerLosses: 1, defenderLosses: 1 });
  });

  it('kills nobody when every pair ties', () => {
    expect(resolveRoll([4, 2, 6], [4, 2, 6])).toEqual({ attackerLosses: 0, defenderLosses: 0 });
  });

  it('does not mutate the dice arrays', () => {
    const attackerDice = [1, 6, 3];
    const defenderDice = [2, 5, 3];
    resolveRoll(attackerDice, defenderDice);
    expect(attackerDice).toEqual([1, 6, 3]);
    expect(defenderDice).toEqual([2, 5, 3]);
  });

  it('throws when the two sides rolled a different number of dice', () => {
    expect(() => resolveRoll([6, 5], [4])).toThrow('same number of dice');
  });
});
