import { describe, it, expect } from 'vitest';
import { placeReinforcements } from '../../src/game/reinforce.js';
import { IllegalMoveError, WrongPhaseError } from '../../src/game/errors.js';
import { makeState } from '../helpers.js';

// The human owns AAA (4 soldiers) and EEE (1), so round 2 gives them 2 × 2 = 4.
const reinforcing = (overrides = {}) =>
  makeState({ round: 2, phase: 'reinforce', pendingReinforcements: 4, ...overrides });

describe('placeReinforcements: a legal placement (GAME_RULES §7.3)', () => {
  it('adds each placement to its country', () => {
    const { state } = placeReinforcements(reinforcing(), { AAA: 3, EEE: 1 });
    expect(state.countries.AAA.soldiers).toBe(7);
    expect(state.countries.EEE.soldiers).toBe(2);
  });

  it('allows all of them on one country', () => {
    const { state } = placeReinforcements(reinforcing(), { EEE: 4 });
    expect(state.countries.AAA.soldiers).toBe(4);
    expect(state.countries.EEE.soldiers).toBe(5);
  });

  it('allows a zero on an owned country when the sum is exact', () => {
    const { state } = placeReinforcements(reinforcing(), { AAA: 0, EEE: 4 });
    expect(state.countries.AAA.soldiers).toBe(4);
    expect(state.countries.EEE.soldiers).toBe(5);
  });
});

describe('placeReinforcements: phase and turn (GAME_RULES §4.1)', () => {
  it('moves the phase to manoeuvre', () => {
    expect(placeReinforcements(reinforcing(), { AAA: 4 }).state.phase).toBe('manoeuvre');
  });

  it('clears pendingReinforcements', () => {
    expect(placeReinforcements(reinforcing(), { AAA: 4 }).state.pendingReinforcements).toBe(0);
  });

  it('keeps the turn with the same player', () => {
    const { state } = placeReinforcements(reinforcing(), { AAA: 4 });
    expect(state).toMatchObject({ currentTurn: 0, round: 2 });
  });
});

describe('placeReinforcements: events (GAME_RULES §10)', () => {
  it('emits one reinforce event with player, amount and placements', () => {
    const { events } = placeReinforcements(reinforcing(), { AAA: 3, EEE: 1 });
    expect(events).toEqual([
      { type: 'reinforce', player: 'human', amount: 4, placements: { AAA: 3, EEE: 1 } },
    ]);
  });
});

describe('placeReinforcements: rejected placements, 422 (GAME_RULES §7.3)', () => {
  it('rejects an under-sum', () => {
    expect(() => placeReinforcements(reinforcing(), { AAA: 3 })).toThrow(IllegalMoveError);
  });

  it('rejects an over-sum', () => {
    expect(() => placeReinforcements(reinforcing(), { AAA: 5 })).toThrow(IllegalMoveError);
  });

  it('rejects a country the player does not own', () => {
    expect(() => placeReinforcements(reinforcing(), { AAA: 3, BBB: 1 })).toThrow(IllegalMoveError);
  });

  it('rejects an unknown code', () => {
    expect(() => placeReinforcements(reinforcing(), { AAA: 3, ZZZ: 1 })).toThrow(IllegalMoveError);
  });

  it('rejects a negative number, even when the sum is exact', () => {
    expect(() => placeReinforcements(reinforcing(), { AAA: 5, EEE: -1 })).toThrow(IllegalMoveError);
  });

  it('rejects a non-integer', () => {
    expect(() => placeReinforcements(reinforcing(), { AAA: 2.5, EEE: 1.5 })).toThrow(IllegalMoveError);
  });

  it.each([[null], [[4]], ['AAA'], [4]])('rejects placements that are not an object: %j', (placements) => {
    expect(() => placeReinforcements(reinforcing(), placements)).toThrow(IllegalMoveError);
  });
});

describe('placeReinforcements: rejected phases, 409 (GAME_RULES §4.1)', () => {
  it.each(['manoeuvre', 'attacking', 'occupy'])('rejects placing in phase %s', (phase) => {
    expect(() => placeReinforcements(reinforcing({ phase }), { AAA: 4 })).toThrow(WrongPhaseError);
  });
});

describe('placeReinforcements: purity and player', () => {
  it('checks ownership against the current player, not the human', () => {
    // npc:BBB's turn: BBB is theirs, AAA is the human's.
    const start = reinforcing({ currentTurn: 1, pendingReinforcements: 2 });
    expect(placeReinforcements(start, { BBB: 2 }).state.countries.BBB.soldiers).toBe(4);
    expect(() => placeReinforcements(start, { AAA: 2 })).toThrow(IllegalMoveError);
  });

  it('does not mutate the input state', () => {
    const input = reinforcing();
    const before = structuredClone(input);
    placeReinforcements(input, { AAA: 4 });
    expect(input).toEqual(before);
  });
});
