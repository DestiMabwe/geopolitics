import { describe, it, expect } from 'vitest';
import { soldierValue, conquestBonus, reinforcementAmount } from '../../src/game/soldiers.js';

describe('soldierValue (GAME_RULES §1.2)', () => {
  it('gives 1 soldier to exactly 5,000,000 people', () => {
    expect(soldierValue(5_000_000)).toBe(1);
  });

  it('gives 2 soldiers to 5,000,001 people', () => {
    expect(soldierValue(5_000_001)).toBe(2);
  });

  it('gives 2 soldiers to exactly 10,000,000 people', () => {
    expect(soldierValue(10_000_000)).toBe(2);
  });

  it('gives 4 soldiers to 25,000,001 people', () => {
    expect(soldierValue(25_000_001)).toBe(4);
  });

  it('gives 8 soldiers to exactly 150,000,000 people', () => {
    expect(soldierValue(150_000_000)).toBe(8);
  });

  it('gives 9 soldiers to 150,000,001 people', () => {
    expect(soldierValue(150_000_001)).toBe(9);
  });

  it('gives Vatican City (~500 people) 1 soldier', () => {
    expect(soldierValue(500)).toBe(1);
  });

  it('gives India (~1.46 bn people) 9 soldiers', () => {
    expect(soldierValue(1_460_000_000)).toBe(9);
  });

  // Covers the brackets the boundary list above doesn't name (25M, 50M, 75M, 100M, 125M).
  it("treats every bracket's upper limit as inclusive", () => {
    const limits = [
      // [upper limit, value at the limit]
      [5_000_000, 1],
      [10_000_000, 2],
      [25_000_000, 3],
      [50_000_000, 4],
      [75_000_000, 5],
      [100_000_000, 6],
      [125_000_000, 7],
      [150_000_000, 8],
    ];
    for (const [limit, value] of limits) {
      expect(soldierValue(limit), `${limit}`).toBe(value);
      expect(soldierValue(limit + 1), `${limit + 1}`).toBe(value + 1);
    }
  });
});

describe('conquestBonus (GAME_RULES §5.5)', () => {
  it('gives 4 for India (value 9)', () => {
    expect(conquestBonus(9)).toBe(4);
  });

  it('gives 2 for Vatican City (value 1)', () => {
    expect(conquestBonus(1)).toBe(2);
  });

  it('gives 2 for a value-5 country', () => {
    expect(conquestBonus(5)).toBe(2);
  });

  it('gives 3 for a value-6 country', () => {
    expect(conquestBonus(6)).toBe(3);
  });

  it('never gives less than 2', () => {
    for (const value of [1, 2, 3]) expect(conquestBonus(value), `value ${value}`).toBe(2);
  });
});

describe('reinforcementAmount (GAME_RULES §7.2)', () => {
  it('gives 2 for 1 country', () => {
    expect(reinforcementAmount(1)).toBe(2);
  });

  it('gives 6 for 3 countries', () => {
    expect(reinforcementAmount(3)).toBe(6);
  });

  it('gives 10 for 5 countries', () => {
    expect(reinforcementAmount(5)).toBe(10);
  });
});
