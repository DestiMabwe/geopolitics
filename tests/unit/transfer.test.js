import { describe, it, expect } from 'vitest';
import { transfer } from '../../src/game/transfer.js';
import { IllegalMoveError, WrongPhaseError } from '../../src/game/errors.js';
import { makeState } from '../helpers.js';

// makeState: the human owns AAA (4 soldiers) and EEE (1), and it is their turn in `manoeuvre`.

describe('transfer: a legal transfer (GAME_RULES §6.1)', () => {
  it('moves soldiers from a to b', () => {
    const { state } = transfer(makeState(), 'AAA', 'EEE', 2);
    expect(state.countries.AAA.soldiers).toBe(2);
    expect(state.countries.EEE.soldiers).toBe(3);
  });

  it('allows leaving exactly 1 soldier behind', () => {
    const { state } = transfer(makeState(), 'AAA', 'EEE', 3);
    expect(state.countries.AAA.soldiers).toBe(1);
    expect(state.countries.EEE.soldiers).toBe(4);
  });

  it('allows a transfer between countries that do not border', () => {
    // §6.1 has no border condition, and AAA does not border DDD.
    const start = makeState({ countries: { DDD: { owner: 'human' } } });
    const { state } = transfer(start, 'AAA', 'DDD', 1);
    expect(state.countries.AAA.soldiers).toBe(3);
    expect(state.countries.DDD.soldiers).toBe(2);
  });
});

describe('transfer: phase and turn (GAME_RULES §4.2, §6.2)', () => {
  it('stays in manoeuvre', () => {
    expect(transfer(makeState(), 'AAA', 'EEE', 1).state.phase).toBe('manoeuvre');
  });

  it('keeps the turn with the same player', () => {
    const { state } = transfer(makeState({ round: 2 }), 'AAA', 'EEE', 1);
    expect(state).toMatchObject({ currentTurn: 0, round: 2 });
  });

  it('allows several transfers in one turn', () => {
    const first = transfer(makeState(), 'AAA', 'EEE', 3);
    const second = transfer(first.state, 'EEE', 'AAA', 2);
    const third = transfer(second.state, 'AAA', 'EEE', 1);
    expect(third.state.countries.AAA.soldiers).toBe(2);
    expect(third.state.countries.EEE.soldiers).toBe(3);
  });
});

describe('transfer: events (GAME_RULES §10)', () => {
  it('emits one transfer event with player, from, to and count', () => {
    const { events } = transfer(makeState(), 'AAA', 'EEE', 2);
    expect(events).toEqual([{ type: 'transfer', player: 'human', from: 'AAA', to: 'EEE', count: 2 }]);
  });
});

describe('transfer: rejected moves, 422 (GAME_RULES §6.1)', () => {
  it('rejects leaving 0 soldiers behind', () => {
    expect(() => transfer(makeState(), 'AAA', 'EEE', 4)).toThrow(IllegalMoveError);
  });

  it('rejects moving more soldiers than the country has', () => {
    expect(() => transfer(makeState(), 'AAA', 'EEE', 5)).toThrow(IllegalMoveError);
  });

  it('rejects moving out of a country with 1 soldier', () => {
    expect(() => transfer(makeState(), 'EEE', 'AAA', 1)).toThrow(IllegalMoveError);
  });

  it('rejects a from country the player does not own', () => {
    expect(() => transfer(makeState(), 'BBB', 'AAA', 1)).toThrow(IllegalMoveError);
  });

  it('rejects a to country the player does not own', () => {
    expect(() => transfer(makeState(), 'AAA', 'BBB', 1)).toThrow(IllegalMoveError);
  });

  it('rejects an unknown from code', () => {
    expect(() => transfer(makeState(), 'ZZZ', 'AAA', 1)).toThrow(IllegalMoveError);
  });

  it('rejects an unknown to code', () => {
    expect(() => transfer(makeState(), 'AAA', 'ZZZ', 1)).toThrow(IllegalMoveError);
  });

  it('rejects transferring to the same country', () => {
    expect(() => transfer(makeState(), 'AAA', 'AAA', 1)).toThrow(IllegalMoveError);
  });

  it.each([[0], [-1], [1.5], ['2'], [null], [NaN]])('rejects a count of %j', (count) => {
    expect(() => transfer(makeState(), 'AAA', 'EEE', count)).toThrow(IllegalMoveError);
  });
});

describe('transfer: rejected phases, 409 (GAME_RULES §4.3)', () => {
  it.each(['reinforce', 'attacking', 'occupy'])('rejects a transfer in phase %s', (phase) => {
    expect(() => transfer(makeState({ phase }), 'AAA', 'EEE', 1)).toThrow(WrongPhaseError);
  });
});

describe('transfer: purity and player', () => {
  it('checks ownership against the current player, not the human', () => {
    // npc:BBB's turn: BBB is theirs, AAA and EEE are the human's.
    const start = makeState({ currentTurn: 1, countries: { CCC: { owner: 'npc:BBB' } } });
    expect(transfer(start, 'BBB', 'CCC', 1).state.countries.CCC.soldiers).toBe(4);
    expect(() => transfer(start, 'AAA', 'EEE', 1)).toThrow(IllegalMoveError);
  });

  it('does not mutate the input state', () => {
    const input = makeState();
    const before = structuredClone(input);
    transfer(input, 'AAA', 'EEE', 2);
    expect(input).toEqual(before);
  });
});
