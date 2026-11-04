import { describe, it, expect } from 'vitest';
import { hasSeen, markSeen } from '../../public/js/helpSeen.js';

const store = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};

describe('help pills seen (a dot until opened, remembered per browser)', () => {
  it('reports unseen on a fresh device', () => {
    expect(hasSeen('play', store())).toBe(false);
    expect(hasSeen('win', store())).toBe(false);
  });

  it('remembers a pill once it has been opened', () => {
    const s = store();
    markSeen('play', s);
    expect(hasSeen('play', s)).toBe(true);
  });

  it('tracks each pill on its own', () => {
    const s = store();
    markSeen('play', s);
    expect(hasSeen('win', s)).toBe(false);
  });

  it('stays seen when marked twice', () => {
    const s = store();
    markSeen('win', s);
    markSeen('win', s);
    expect(hasSeen('win', s)).toBe(true);
  });

  it('falls back to unseen, and does not throw, when storage is blocked', () => {
    const broken = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    expect(hasSeen('play', broken)).toBe(false);
    expect(() => markSeen('play', broken)).not.toThrow();
  });
});
