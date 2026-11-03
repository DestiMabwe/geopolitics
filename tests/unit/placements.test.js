import { describe, it, expect } from 'vitest';
import { placedTotal, remaining, add, remove, isComplete } from '../../public/js/placements.js';

// GAME_RULES §5.6: the bonus is split across any of your countries and must add up exactly.

describe('placedTotal', () => {
  it('is 0 for an empty map', () => {
    expect(placedTotal({})).toBe(0);
  });

  it('adds up every country', () => {
    expect(placedTotal({ ZAF: 2, KEN: 1 })).toBe(3);
  });
});

describe('remaining', () => {
  it('starts with the whole bonus left to place', () => {
    expect(remaining({}, 3)).toBe(3);
  });

  it('shrinks by what has been placed', () => {
    expect(remaining({ ZAF: 2 }, 3)).toBe(1);
  });
});

describe('add', () => {
  it('takes one soldier off the remainder per added soldier', () => {
    const next = add({}, 'ZAF', 3);
    expect(next).toEqual({ ZAF: 1 });
    expect(remaining(next, 3)).toBe(2);
  });

  it('stacks on a country that already has some', () => {
    expect(add({ ZAF: 1 }, 'ZAF', 3)).toEqual({ ZAF: 2 });
  });

  it('refuses to place more than the bonus', () => {
    expect(add({ ZAF: 2, KEN: 1 }, 'ZAF', 3)).toEqual({ ZAF: 2, KEN: 1 });
  });

  it('does not change the map it was given', () => {
    const before = { ZAF: 1 };
    add(before, 'KEN', 3);
    expect(before).toEqual({ ZAF: 1 });
  });
});

describe('remove', () => {
  it('takes one soldier off a country', () => {
    expect(remove({ ZAF: 2 }, 'ZAF')).toEqual({ ZAF: 1 });
  });

  it('leaves out a country that reaches 0, so the server gets a clean map', () => {
    expect(remove({ ZAF: 1, KEN: 2 }, 'ZAF')).toEqual({ KEN: 2 });
  });

  it('refuses to remove below zero', () => {
    expect(remove({ KEN: 2 }, 'ZAF')).toEqual({ KEN: 2 });
  });

  it('does not change the map it was given', () => {
    const before = { ZAF: 2 };
    remove(before, 'ZAF');
    expect(before).toEqual({ ZAF: 2 });
  });
});

describe('isComplete', () => {
  it('is complete only when the placements sum to the bonus', () => {
    expect(isComplete({ ZAF: 2, KEN: 1 }, 3)).toBe(true);
    expect(isComplete({ ZAF: 2 }, 3)).toBe(false);
    expect(isComplete({}, 3)).toBe(false);
  });
});
