import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  noticeFor, summaryNotice, holdMs, createNoticeQueue,
  MIN_HOLD_MS, AI_WAIT_MS, MAX_HOLD_MS,
} from '../../public/js/battleNotice.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const game = {
  isOwner: true,
  players: { human: { homeCode: 'BRA' }, npc1: { homeCode: 'ARG' } },
  countries: { BRA: { name: 'Brazil' }, ARG: { name: 'Argentina' }, PER: { name: 'Peru' } },
};
const ev = (seq, type, data = {}, extra = {}) => ({ seq, type, data, round: 1, text: null, aiText: null, ...extra });
const opts = { isOwner: true, fast: false };

describe('noticeFor: which events pop up (agreed design, 2026-11-03)', () => {
  it('pops up an NPC attack with the engine\'s reason underneath', () => {
    const n = noticeFor(ev(5, 'attackStart', { player: 'npc1', from: 'ARG', to: 'PER', reason: 'Peru is weak' }), game, opts);
    expect(n).toMatchObject({ id: 5, headline: 'Argentina attacks Peru from Argentina.', reason: 'Peru is weak', awaitAi: false });
  });

  it('pops up an NPC deciding not to attack, with its reason', () => {
    expect(noticeFor(ev(6, 'skip', { player: 'npc1', reason: 'too risky' }), game, opts)).toMatchObject({ reason: 'too risky' });
    expect(noticeFor(ev(7, 'attackStopped', { player: 'npc1', to: 'PER', reason: 'losses' }), game, opts)).not.toBeNull();
  });

  it('does not pop up your own attack, hold or stop: you just clicked it', () => {
    for (const type of ['attackStart', 'skip', 'attackStopped']) {
      expect(noticeFor(ev(1, type, { player: 'human', from: 'BRA', to: 'PER' }), game, opts)).toBeNull();
    }
  });

  it('pops up conquests and eliminations for everyone, yours included', () => {
    expect(noticeFor(ev(2, 'conquest', { player: 'human', to: 'PER', bonus: 3 }), game, opts)).not.toBeNull();
    expect(noticeFor(ev(3, 'conquest', { player: 'npc1', to: 'PER', bonus: 3 }), game, opts)).not.toBeNull();
    expect(noticeFor(ev(4, 'elimination', { player: 'npc1', by: 'human' }), game, opts)).not.toBeNull();
  });

  it('never pops up rolls, turn starts, reinforcements, transfers or occupations', () => {
    for (const type of ['roll', 'turnStart', 'reinforce', 'transfer', 'occupy', 'attackFailed']) {
      expect(noticeFor(ev(1, type, { player: 'npc1' }), game, opts)).toBeNull();
    }
  });

  it('leaves game over to the owner\'s Game over dialog, but shows it to a visitor', () => {
    const over = ev(9, 'gameOver', { status: 'won', winner: 'human' });
    expect(noticeFor(over, game, { isOwner: true, fast: false })).toBeNull();
    expect(noticeFor(over, { ...game, isOwner: false }, { isOwner: false, fast: false })).not.toBeNull();
  });

  it('shows no per-event pop-ups in fast-forward', () => {
    expect(noticeFor(ev(2, 'conquest', { player: 'npc1', to: 'PER', bonus: 3 }), game, { isOwner: true, fast: true })).toBeNull();
  });

  it('prefers the saved LLM line, then the stored template, then the plain text', () => {
    const d = { player: 'npc1', to: 'PER', bonus: 3 };
    expect(noticeFor(ev(1, 'conquest', d, { aiText: 'AI line', text: 'stored' }), game, opts).headline).toBe('AI line');
    expect(noticeFor(ev(1, 'conquest', d, { text: 'stored' }), game, opts).headline).toBe('stored');
    expect(noticeFor(ev(1, 'conquest', d), game, opts).headline).toMatch(/Argentina conquers Peru/);
  });

  it('waits for the LLM line only for the owner, on an LLM event with no line yet', () => {
    const d = { player: 'npc1', to: 'PER', bonus: 3 };
    expect(noticeFor(ev(1, 'conquest', d), game, opts).awaitAi).toBe(true);
    expect(noticeFor(ev(1, 'conquest', d, { aiText: 'x' }), game, opts).awaitAi).toBe(false);
    expect(noticeFor(ev(1, 'conquest', d), { ...game, isOwner: false }, { isOwner: false, fast: false }).awaitAi).toBe(false);
  });
});

describe('summaryNotice (fast-forward: one per NPC turn)', () => {
  it('wraps a turn summary, with nothing to wait for', () => {
    expect(summaryNotice('turn-3', 'Argentina played. Argentina conquers Peru.')).toEqual({
      id: 'turn-3', headline: 'Argentina played. Argentina conquers Peru.', reason: '', awaitAi: false,
    });
  });
  it('gives null for an empty summary', () => {
    expect(summaryNotice('turn-3', '')).toBeNull();
  });
});

describe('holdMs', () => {
  const n = (headline, reason = '') => ({ id: 1, headline, reason, awaitAi: false });
  it('never goes below the minimum, and grows with the text', () => {
    expect(holdMs(n('Hi'))).toBeGreaterThanOrEqual(MIN_HOLD_MS);
    expect(holdMs(n('a'.repeat(100)))).toBeGreaterThan(holdMs(n('a'.repeat(20))));
  });
  it('stops growing at the maximum', () => {
    expect(holdMs(n('a'.repeat(5000)))).toBe(MAX_HOLD_MS);
  });
});

describe('createNoticeQueue: one at a time, nothing replaced unread', () => {
  const n = (id, extra = {}) => ({ id, headline: `line ${id}`, reason: '', awaitAi: false, ...extra });
  const make = () => {
    const calls = [];
    const q = createNoticeQueue({
      onShow: (x) => calls.push(['show', x.id]),
      onUpdate: (x) => calls.push(['update', x.id, x.headline]),
      onHide: () => calls.push(['hide']),
    });
    return { q, calls };
  };

  it('shows the first notice at once and hides it after its hold', () => {
    const { q, calls } = make();
    q.push(n(1));
    expect(calls).toEqual([['show', 1]]);
    vi.advanceTimersByTime(holdMs(n(1)) - 1);
    expect(calls).toEqual([['show', 1]]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual([['show', 1], ['hide']]);
  });

  it('keeps the current notice up for the minimum before a second one replaces it', () => {
    const { q, calls } = make();
    q.push(n(1));
    vi.advanceTimersByTime(1000);
    q.push(n(2));
    vi.advanceTimersByTime(MIN_HOLD_MS - 1000 - 1);
    expect(calls).toEqual([['show', 1]]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual([['show', 1], ['show', 2]]);
  });

  it('shows a newer pending notice instead of an older one that never got its turn', () => {
    const { q, calls } = make();
    q.push(n(1));
    q.push(n(2));
    q.push(n(3));
    vi.advanceTimersByTime(MIN_HOLD_MS);
    expect(calls).toEqual([['show', 1], ['show', 3]]);
  });

  it('holds an LLM-awaiting notice until its line arrives, then swaps it in place', () => {
    const { q, calls } = make();
    q.push(n(1, { awaitAi: true }));
    vi.advanceTimersByTime(3000);
    expect(calls).toEqual([['show', 1]]); // still waiting, past the normal minimum
    q.update(1, 'AI line');
    expect(calls).toEqual([['show', 1], ['update', 1, 'AI line']]);
    vi.advanceTimersByTime(MIN_HOLD_MS - 1);
    expect(calls).toHaveLength(2); // the new text gets time to be read
  });

  it('gives up waiting for the LLM after the cap, leaving the template line', () => {
    const { q, calls } = make();
    q.push(n(1, { awaitAi: true }));
    vi.advanceTimersByTime(AI_WAIT_MS);
    expect(calls).toEqual([['show', 1], ['hide']]);
  });

  it('lets a waiting notice go after the cap when another is queued behind it', () => {
    const { q, calls } = make();
    q.push(n(1, { awaitAi: true }));
    q.push(n(2));
    vi.advanceTimersByTime(AI_WAIT_MS - 1);
    expect(calls).toEqual([['show', 1]]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual([['show', 1], ['show', 2]]);
  });

  it('ignores a late LLM line for a notice that has already gone', () => {
    const { q, calls } = make();
    q.push(n(1));
    vi.advanceTimersByTime(holdMs(n(1)));
    q.update(1, 'too late');
    expect(calls).toEqual([['show', 1], ['hide']]);
  });

  it('puts a pending notice\'s LLM line into it before it is shown', () => {
    const { q, calls } = make();
    q.push(n(1));
    q.push(n(2, { awaitAi: true }));
    q.update(2, 'AI two');
    vi.advanceTimersByTime(MIN_HOLD_MS);
    expect(calls).toEqual([['show', 1], ['show', 2]]);
  });

  it('dismiss hides the current notice at once and moves on to the pending one', () => {
    const { q, calls } = make();
    q.push(n(1));
    q.push(n(2));
    q.dismiss();
    expect(calls).toEqual([['show', 1], ['show', 2]]);
    q.dismiss();
    expect(calls).toEqual([['show', 1], ['show', 2], ['hide']]);
  });

  it('clear drops everything and cancels timers', () => {
    const { q, calls } = make();
    q.push(n(1));
    q.push(n(2));
    q.clear();
    vi.advanceTimersByTime(60_000);
    expect(calls).toEqual([['show', 1], ['hide']]);
  });
});
