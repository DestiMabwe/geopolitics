import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startAttack, rollAttack, stopAttack } from '../../src/game/attack.js';
import { endTurn } from '../../src/game/turn.js';
import { IllegalMoveError, WrongPhaseError } from '../../src/game/errors.js';
import { scripted, makeState } from '../helpers.js';

// endTurn is S12. Here we only check that a finished attack hands over to it (GAME_RULES §4.5).
vi.mock('../../src/game/turn.js', () => ({
  endTurn: vi.fn((state) => ({
    state: { ...state, ended: true },
    events: [{ type: 'turnStart', player: 'npc:BBB', round: 1 }],
  })),
}));

beforeEach(() => {
  vi.mocked(endTurn).mockClear();
});

// An attack from AAA (human) on BBB already in progress.
const attacking = (countries = {}) =>
  makeState({
    phase: 'attacking',
    attack: { from: 'AAA', to: 'BBB', rolls: 0, bonus: null },
    countries,
  });

const types = (events) => events.map((e) => e.type);
const handedOver = () => vi.mocked(endTurn).mock.calls[0][0];

describe('startAttack (GAME_RULES §5.1)', () => {
  it('starts an attack: phase attacking, attack recorded, attackStart event, no dice', () => {
    const { state, events } = startAttack(makeState(), 'AAA', 'BBB');
    expect(state.phase).toBe('attacking');
    expect(state.attack).toEqual({ from: 'AAA', to: 'BBB', rolls: 0, bonus: null });
    expect(events).toEqual([{ type: 'attackStart', player: 'human', from: 'AAA', to: 'BBB' }]);
    expect(state.countries.AAA.soldiers).toBe(4);
    expect(state.countries.BBB.soldiers).toBe(2);
  });

  it.each(['reinforce', 'attacking', 'occupy'])('rejects starting in phase %s with WrongPhaseError', (phase) => {
    expect(() => startAttack(makeState({ phase }), 'AAA', 'BBB')).toThrow(WrongPhaseError);
  });

  it('rejects attacking from a country the player does not own', () => {
    expect(() => startAttack(makeState(), 'BBB', 'CCC')).toThrow(IllegalMoveError);
  });

  it('rejects attacking a country the player already owns', () => {
    expect(() => startAttack(makeState(), 'AAA', 'EEE')).toThrow(IllegalMoveError);
  });

  it('rejects attacking a non-neighbour', () => {
    // AAA does not border DDD (I-1)
    expect(() => startAttack(makeState(), 'AAA', 'DDD')).toThrow(IllegalMoveError);
  });

  it('rejects attacking from a country with 1 soldier', () => {
    // EEE borders BBB but has only 1 soldier
    expect(() => startAttack(makeState(), 'EEE', 'BBB')).toThrow(IllegalMoveError);
  });

  it('accepts attacking from a country with exactly 2 soldiers', () => {
    const { state } = startAttack(makeState({ countries: { AAA: { soldiers: 2 } } }), 'AAA', 'CCC');
    expect(state.attack).toMatchObject({ from: 'AAA', to: 'CCC' });
  });

  it('rejects unknown country codes', () => {
    expect(() => startAttack(makeState(), 'XXX', 'BBB')).toThrow(IllegalMoveError);
    expect(() => startAttack(makeState(), 'AAA', 'XXX')).toThrow(IllegalMoveError);
  });

  it('attacks for the player whose turn it is', () => {
    const { events } = startAttack(makeState({ currentTurn: 1 }), 'BBB', 'AAA');
    expect(events[0].player).toBe('npc:BBB');
  });

  it('does not mutate the input state', () => {
    const input = makeState();
    const before = structuredClone(input);
    startAttack(input, 'AAA', 'BBB');
    expect(input).toEqual(before);
  });
});

describe('rollAttack (GAME_RULES §5.2–§5.4)', () => {
  it('rejects rolling when no attack is in progress', () => {
    expect(() => rollAttack(makeState(), scripted(6, 1))).toThrow(WrongPhaseError);
  });

  it('rolls diceCount dice for the attacker first, then the same number for the defender', () => {
    // AAA 4 vs CCC 3 → min(3, 3) = 3 dice each, so exactly 6 calls
    const input = makeState({
      phase: 'attacking',
      attack: { from: 'AAA', to: 'CCC', rolls: 0, bonus: null },
    });
    const rollDie = vi.fn(scripted(1, 5, 3, 6, 2, 3));
    const { events } = rollAttack(input, rollDie);
    expect(rollDie).toHaveBeenCalledTimes(6);
    expect(events[0]).toMatchObject({ attackerDice: [1, 5, 3], defenderDice: [6, 2, 3] });
  });

  it('applies §5.3 row 1: 10 vs 2, [1,4] vs [2,3] → 9 vs 1, in progress', () => {
    const { state, events } = rollAttack(attacking({ AAA: { soldiers: 10 } }), scripted(1, 4, 2, 3));
    expect(events).toEqual([
      {
        type: 'roll', player: 'human', from: 'AAA', to: 'BBB',
        attackerDice: [1, 4], defenderDice: [2, 3],
        attackerLosses: 1, defenderLosses: 1,
        attackerLeft: 9, defenderLeft: 1,
      },
    ]);
    expect(state.countries.AAA.soldiers).toBe(9);
    expect(state.countries.BBB.soldiers).toBe(1);
    expect(state.countries.BBB.owner).toBe('npc:BBB');
  });

  it('stays in phase attacking while in progress, across several rolls', () => {
    const first = rollAttack(attacking({ AAA: { soldiers: 10 } }), scripted(1, 4, 2, 3));
    expect(first.state.phase).toBe('attacking');
    expect(first.state.attack).toEqual({ from: 'AAA', to: 'BBB', rolls: 1, bonus: null });

    // 9 vs 1 → 1 die each, tie
    const second = rollAttack(first.state, scripted(3, 3));
    expect(second.state.phase).toBe('attacking');
    expect(second.state.attack.rolls).toBe(2);
    expect(endTurn).not.toHaveBeenCalled();
  });

  it('kills nobody on a tied roll', () => {
    const { state, events } = rollAttack(attacking(), scripted(4, 4, 4, 4));
    expect(events[0]).toMatchObject({ attackerLosses: 0, defenderLosses: 0, attackerLeft: 4, defenderLeft: 2 });
    expect(state.countries.AAA.soldiers).toBe(4);
    expect(state.countries.BBB.soldiers).toBe(2);
  });

  it('fails when the attacker is down to 1: attackFailed, defender keeps t, attacker keeps s with 1', () => {
    // 2 vs 2 → 1 die each, attacker loses
    const { events } = rollAttack(attacking({ AAA: { soldiers: 2 } }), scripted(1, 6));
    expect(types(events).slice(0, 2)).toEqual(['roll', 'attackFailed']);
    expect(events[1]).toEqual({ type: 'attackFailed', player: 'human', from: 'AAA', to: 'BBB' });
    expect(handedOver().countries.AAA).toMatchObject({ owner: 'human', soldiers: 1 });
    expect(handedOver().countries.BBB).toMatchObject({ owner: 'npc:BBB', soldiers: 2 });
  });

  it('ends the turn after a failed attack', () => {
    const { state, events } = rollAttack(attacking({ AAA: { soldiers: 2 } }), scripted(1, 6));
    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(handedOver().attack).toBeNull();
    expect(state.ended).toBe(true);
    expect(types(events)).toEqual(['roll', 'attackFailed', 'turnStart']);
  });

  it('does not mutate the input state', () => {
    const input = attacking({ AAA: { soldiers: 10 } });
    const before = structuredClone(input);
    rollAttack(input, scripted(1, 4, 2, 3));
    expect(input).toEqual(before);
  });
});

describe('stopAttack (GAME_RULES §5.4, §4.5)', () => {
  it('rejects stopping when no attack is in progress', () => {
    expect(() => stopAttack(makeState())).toThrow(WrongPhaseError);
  });

  it('stops: attackStopped, both countries keep their soldiers', () => {
    const { events } = stopAttack(attacking({ AAA: { soldiers: 7 } }));
    expect(events[0]).toEqual({ type: 'attackStopped', player: 'human', from: 'AAA', to: 'BBB' });
    expect(handedOver().countries.AAA).toMatchObject({ owner: 'human', soldiers: 7 });
    expect(handedOver().countries.BBB).toMatchObject({ owner: 'npc:BBB', soldiers: 2 });
  });

  it('ends the turn after a stop', () => {
    const { state, events } = stopAttack(attacking());
    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(handedOver().attack).toBeNull();
    expect(state.ended).toBe(true);
    expect(types(events)).toEqual(['attackStopped', 'turnStart']);
  });

  it('does not mutate the input state', () => {
    const input = attacking();
    const before = structuredClone(input);
    stopAttack(input);
    expect(input).toEqual(before);
  });
});
