import { describe, it, expect } from 'vitest';
import { shouldAutoRoll, autoDelay, loadAuto, saveAuto, MIN_AUTO_DELAY_MS, FIRST_ROLL_DELAY_MS } from '../../public/js/autoroll.js';

// Autoroll (agreed 2026-11-03): the page sends the ordinary one-roll-per-request roll again and again while
// an attack is open. The server rolls every die, the rules are untouched, and nothing here picks a number.

const attacking = {
  isOwner: true,
  status: 'active',
  phase: 'attacking',
  turnOrder: ['human', 'npc1'],
  currentTurn: 0,
};
const on = { game: attacking, auto: true, pending: false, replaying: false };

describe('shouldAutoRoll', () => {
  it('rolls again while your attack is open and nothing else is going on', () => {
    expect(shouldAutoRoll(on)).toBe(true);
  });

  it('never rolls when the switch is off', () => {
    expect(shouldAutoRoll({ ...on, auto: false })).toBe(false);
  });

  it('stops when the attack ends: conquered (occupy), or back to manoeuvre after a failure or a stop', () => {
    for (const phase of ['occupy', 'manoeuvre', 'reinforce']) {
      expect(shouldAutoRoll({ ...on, game: { ...attacking, phase } })).toBe(false);
    }
  });

  it('waits while a request is out or events are still being replayed', () => {
    expect(shouldAutoRoll({ ...on, pending: true })).toBe(false);
    expect(shouldAutoRoll({ ...on, replaying: true })).toBe(false);
  });

  it('only rolls for the owner, on the human turn, in an active game', () => {
    expect(shouldAutoRoll({ ...on, game: { ...attacking, isOwner: false } })).toBe(false);
    expect(shouldAutoRoll({ ...on, game: { ...attacking, currentTurn: 1 } })).toBe(false);
    expect(shouldAutoRoll({ ...on, game: { ...attacking, status: 'won' } })).toBe(false);
  });

  it('does nothing without a game', () => {
    expect(shouldAutoRoll({ ...on, game: null })).toBe(false);
  });
});

describe('autoDelay: how long to wait before the next roll', () => {
  const pace = { roll: 1800, step: 1400, turn: 1500, rollFast: 120, stepFast: 120 };

  it('waits as long as an NPC roll stays on screen, so the dice land and can be read', () => {
    expect(autoDelay({ fast: false, pace, firstRoll: false })).toBe(1800);
  });

  it('never goes faster than the server allows, even in fast-forward', () => {
    // 60 attack requests a minute is one a second; the floor keeps a long attack under it.
    expect(autoDelay({ fast: true, pace, firstRoll: false })).toBe(MIN_AUTO_DELAY_MS);
    expect(MIN_AUTO_DELAY_MS).toBeGreaterThanOrEqual(1000);
  });

  it('starts quicker for the first roll of an attack', () => {
    expect(autoDelay({ fast: false, pace, firstRoll: true })).toBe(FIRST_ROLL_DELAY_MS);
    expect(FIRST_ROLL_DELAY_MS).toBeLessThan(MIN_AUTO_DELAY_MS);
  });
});

describe('the remembered setting: off by default, kept per browser', () => {
  const store = () => {
    const data = {};
    return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  };

  it('is off when nothing is saved', () => {
    expect(loadAuto(store())).toBe(false);
  });
  it('remembers on, and remembers off again', () => {
    const s = store();
    saveAuto(true, s);
    expect(loadAuto(s)).toBe(true);
    saveAuto(false, s);
    expect(loadAuto(s)).toBe(false);
  });
  it('falls back to off when storage throws', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(loadAuto(broken)).toBe(false);
    expect(() => saveAuto(true, broken)).not.toThrow();
  });
});
