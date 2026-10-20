import { describe, it, expect } from 'vitest';
import { scripted } from '../helpers.js';

describe('scripted()', () => {
  it('yields scripted values in order', () => {
    const next = scripted(6, 1, 4);
    expect([next(), next(), next()]).toEqual([6, 1, 4]);
  });

  it('throws when the script runs out', () => {
    const next = scripted(3);
    next();
    expect(() => next()).toThrow();
  });

  it('throws on the first call when given no values', () => {
    expect(() => scripted()()).toThrow();
  });

  it('keeps separate scripts independent', () => {
    const a = scripted(1, 2);
    const b = scripted(5);
    expect(a()).toBe(1);
    expect(b()).toBe(5);
    expect(a()).toBe(2);
  });
});
