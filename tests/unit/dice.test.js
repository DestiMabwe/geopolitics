import { describe, it, expect } from 'vitest';
import { diceCount } from '../../src/game/dice.js';
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
