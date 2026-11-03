import { describe, it, expect } from 'vitest';
import { loadLogOpen, saveLogOpen } from '../../public/js/logView.js';

const store = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};

describe('log view setting (minimized by default, remembered per browser)', () => {
  it('starts minimized when nothing is saved', () => {
    expect(loadLogOpen(store())).toBe(false);
  });
  it('remembers a maximized log', () => {
    const s = store();
    saveLogOpen(true, s);
    expect(loadLogOpen(s)).toBe(true);
  });
  it('remembers going back to minimized', () => {
    const s = store();
    saveLogOpen(true, s);
    saveLogOpen(false, s);
    expect(loadLogOpen(s)).toBe(false);
  });
  it('falls back to minimized when storage throws', () => {
    const broken = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    expect(loadLogOpen(broken)).toBe(false);
    expect(() => saveLogOpen(true, broken)).not.toThrow();
  });
});
