import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readPace, delayFor, createReplay, viewAfter, mergeEvents } from '../../public/js/replay.js';
import { wantsAiLine, commentaryPath } from '../../public/js/commentary.js';
import { loadFast, saveFast } from '../../public/js/fastForward.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const pace = { roll: 700, step: 400, rollFast: 120, stepFast: 120 };
const ev = (seq, type, data = {}) => ({ seq, type, data, round: 0, text: `line ${seq}`, aiText: null });

describe('readPace (tokens.css --replay-*, DESIGN §1)', () => {
  it('reads each token in milliseconds', () => {
    const tokens = { '--replay-roll': ' 700ms', '--replay-step': '400ms', '--replay-roll-fast': '120ms', '--replay-step-fast': '120ms' };
    expect(readPace((name) => tokens[name])).toEqual(pace);
  });

  it('falls back to the designed pace when a token is missing', () => {
    expect(readPace(() => '')).toEqual(pace);
  });
});

describe('delayFor (ARCHITECTURE §4.2)', () => {
  it('holds a roll longer than any other event', () => {
    expect(delayFor(ev(1, 'roll'), false, pace)).toBe(700);
    expect(delayFor(ev(1, 'conquest'), false, pace)).toBe(400);
  });

  it('uses the fast-forward pace for every event, rolls included', () => {
    expect(delayFor(ev(1, 'roll'), true, pace)).toBe(120);
    expect(delayFor(ev(1, 'turnStart'), true, pace)).toBe(120);
  });
});

describe('createReplay', () => {
  const make = (extra = {}) => {
    const onEvent = vi.fn();
    const onIdle = vi.fn();
    const replay = createReplay({ pace, onEvent, onIdle, ...extra });
    return { replay, onEvent, onIdle };
  };

  it('shows the first event at once and then one event per delay, in order', async () => {
    const { replay, onEvent } = make();
    replay.push([ev(1, 'turnStart'), ev(2, 'roll'), ev(3, 'conquest')]);
    expect(onEvent.mock.calls.map(([e]) => e.seq)).toEqual([1]);
    await vi.advanceTimersByTimeAsync(400);
    expect(onEvent.mock.calls.map(([e]) => e.seq)).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(700);
    expect(onEvent.mock.calls.map(([e]) => e.seq)).toEqual([1, 2, 3]);
  });

  it('says it is idle once, after the last event has had its time on screen', async () => {
    const { replay, onIdle } = make();
    replay.push([ev(1, 'roll')]);
    await vi.advanceTimersByTimeAsync(699);
    expect(onIdle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('shows every event in fast-forward, only faster', async () => {
    const { replay, onEvent } = make({ fast: true });
    replay.push([ev(1, 'roll'), ev(2, 'roll'), ev(3, 'roll'), ev(4, 'conquest')]);
    await vi.advanceTimersByTimeAsync(120 * 3);
    expect(onEvent).toHaveBeenCalledTimes(4);
  });

  it('switches pace for the events still waiting when fast-forward is turned on', async () => {
    const { replay, onEvent } = make();
    replay.push([ev(1, 'roll'), ev(2, 'roll'), ev(3, 'roll')]);
    replay.setFast(true);
    await vi.advanceTimersByTimeAsync(700); // event 1's own slot was scheduled at normal pace
    expect(onEvent).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120);
    expect(onEvent).toHaveBeenCalledTimes(3);
  });

  it('queues events pushed while it is playing, behind the ones already waiting', async () => {
    const { replay, onEvent, onIdle } = make();
    replay.push([ev(1, 'turnStart')]);
    replay.push([ev(2, 'roll')]);
    await vi.advanceTimersByTimeAsync(400);
    expect(onEvent.mock.calls.map(([e]) => e.seq)).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(700);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('starts again after going idle', async () => {
    const { replay, onEvent } = make();
    replay.push([ev(1, 'turnStart')]);
    await vi.advanceTimersByTimeAsync(400);
    replay.push([ev(2, 'turnStart')]);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('reports whether it is busy', async () => {
    const { replay } = make();
    expect(replay.busy()).toBe(false);
    replay.push([ev(1, 'turnStart')]);
    expect(replay.busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(replay.busy()).toBe(false);
  });

  it('stops for good on clear, with no idle call', async () => {
    const { replay, onEvent, onIdle } = make();
    replay.push([ev(1, 'turnStart'), ev(2, 'roll')]);
    replay.clear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onIdle).not.toHaveBeenCalled();
    expect(replay.busy()).toBe(false);
  });
});

describe('viewAfter (the board as the replay reaches each event)', () => {
  const game = {
    round: 1,
    currentTurn: 0,
    turnOrder: ['human', 'npc:KEN'],
    attack: null,
    countries: {
      ZAF: { name: 'South Africa', owner: 'human', soldiers: 5 },
      KEN: { name: 'Kenya', owner: 'npc:KEN', soldiers: 3 },
    },
  };

  it('moves the turn marker and round on turnStart', () => {
    const next = viewAfter(game, { type: 'turnStart', round: 2, data: { player: 'npc:KEN' } });
    expect(next.currentTurn).toBe(1);
    expect(next.round).toBe(2);
  });

  it('shows the soldiers the server says are left after a roll', () => {
    const next = viewAfter(game, { type: 'roll', data: { from: 'ZAF', to: 'KEN', attackerLeft: 4, defenderLeft: 2 } });
    expect(next.countries.ZAF.soldiers).toBe(4);
    expect(next.countries.KEN.soldiers).toBe(2);
  });

  it('marks the attack in progress on attackStart and clears it when it ends', () => {
    const started = viewAfter(game, { type: 'attackStart', data: { from: 'KEN', to: 'ZAF' } });
    expect(started.attack).toMatchObject({ from: 'KEN', to: 'ZAF' });
    for (const type of ['conquest', 'occupy', 'attackFailed', 'attackStopped']) {
      expect(viewAfter(started, { type, data: { player: 'npc:KEN', from: 'KEN', to: 'ZAF' } }).attack).toBeNull();
    }
  });

  it('hands the conquered country to the conqueror', () => {
    const next = viewAfter(game, { type: 'conquest', data: { player: 'npc:KEN', from: 'KEN', to: 'ZAF' } });
    expect(next.countries.ZAF.owner).toBe('npc:KEN');
  });

  it('leaves the game alone for an event that changes nothing on the board', () => {
    expect(viewAfter(game, { type: 'skip', data: { player: 'human' } })).toEqual(game);
  });

  it('never changes the game it was given', () => {
    const before = structuredClone(game);
    viewAfter(game, { type: 'roll', data: { from: 'ZAF', to: 'KEN', attackerLeft: 1, defenderLeft: 1 } });
    viewAfter(game, { type: 'conquest', data: { player: 'npc:KEN', from: 'KEN', to: 'ZAF' } });
    expect(game).toEqual(before);
  });
});

describe('mergeEvents (visitors re-read the newest events to pick up saved commentary)', () => {
  it('appends events it has not seen and reports them as fresh', () => {
    const { events, fresh } = mergeEvents([ev(1, 'turnStart')], [ev(2, 'roll'), ev(3, 'roll')]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(fresh.map((e) => e.seq)).toEqual([2, 3]);
  });

  it('swaps in the saved commentary on an event it already had, without calling it fresh', () => {
    const old = ev(2, 'roll');
    const { events, fresh } = mergeEvents([ev(1, 'turnStart'), old], [{ ...old, aiText: 'Kenya presses on.' }]);
    expect(events[1].aiText).toBe('Kenya presses on.');
    expect(fresh).toEqual([]);
  });

  it('keeps the events in seq order', () => {
    const { events } = mergeEvents([ev(1, 'turnStart'), ev(3, 'roll')], [ev(2, 'roll')]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('does not change the list it was given', () => {
    const before = [ev(1, 'turnStart')];
    mergeEvents(before, [ev(2, 'roll')]);
    expect(before).toHaveLength(1);
  });
});

describe('commentary helpers (ARCHITECTURE §4.3)', () => {
  it('asks the LLM only for roll, conquest, elimination and gameOver', () => {
    for (const type of ['roll', 'conquest', 'elimination', 'gameOver']) expect(wantsAiLine(ev(1, type))).toBe(true);
    for (const type of ['turnStart', 'attackStart', 'occupy', 'skip', 'transfer']) expect(wantsAiLine(ev(1, type))).toBe(false);
  });

  it('does not ask again for an event that already has its line', () => {
    expect(wantsAiLine({ ...ev(1, 'roll'), aiText: 'Done.' })).toBe(false);
  });

  it('builds the commentary URL with the 6-digit event id', () => {
    expect(commentaryPath('abc', 42)).toBe('/games/abc/events/000042/commentary');
  });
});

describe('fast-forward setting (DESIGN §2, kept in localStorage)', () => {
  it('is off when nothing was saved', () => {
    expect(loadFast({ getItem: () => null })).toBe(false);
  });

  it('reads back what was saved', () => {
    const store = {};
    const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
    saveFast(true, storage);
    expect(loadFast(storage)).toBe(true);
    saveFast(false, storage);
    expect(loadFast(storage)).toBe(false);
  });

  it('works without storage: off, and saving does not throw', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadFast(broken)).toBe(false);
    expect(() => saveFast(true, broken)).not.toThrow();
  });
});
