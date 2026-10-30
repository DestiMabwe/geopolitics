import { describe, it, expect } from 'vitest';
import { endTurn, skip } from '../../src/game/turn.js';
import { WrongPhaseError } from '../../src/game/errors.js';
import { makeState } from '../helpers.js';

// makeState: turn order human → npc:BBB → npc:CCC → npc:DDD. The human owns AAA and EEE.

describe('endTurn (GAME_RULES §4.6, §7.1, §7.2)', () => {
  it('passes play to the next player in the turn order', () => {
    const { state, events } = endTurn(makeState());
    expect(state.currentTurn).toBe(1);
    expect(events).toEqual([{ type: 'turnStart', player: 'npc:BBB', round: 1 }]);
  });

  it('gives nobody soldiers in round 1: phase manoeuvre, nothing pending', () => {
    const { state } = endTurn(makeState());
    expect(state).toMatchObject({ round: 1, phase: 'manoeuvre', pendingReinforcements: 0, attack: null });
  });

  it('skips eliminated players', () => {
    const start = makeState();
    start.players['npc:BBB'].eliminated = true;
    start.players['npc:CCC'].eliminated = true;
    const { state, events } = endTurn(start);
    expect(state.currentTurn).toBe(3);
    expect(events[0].player).toBe('npc:DDD');
  });

  it('starts a new round when play wraps from the last position to the first', () => {
    const { state, events } = endTurn(makeState({ currentTurn: 3 }));
    expect(state).toMatchObject({ currentTurn: 0, round: 2 });
    expect(events).toEqual([{ type: 'turnStart', player: 'human', round: 2 }]);
  });

  it('still counts the wrap when the first player is eliminated', () => {
    const start = makeState({ currentTurn: 3 });
    start.players.human.eliminated = true;
    expect(endTurn(start).state).toMatchObject({ currentTurn: 1, round: 2 });
  });

  it('from round 2 gives 2 × countries owned and moves to reinforce', () => {
    // the human owns AAA and EEE
    const { state } = endTurn(makeState({ currentTurn: 3 }));
    expect(state).toMatchObject({ phase: 'reinforce', pendingReinforcements: 4 });
  });

  it('gives 2 to a player with one country in round 2', () => {
    const { state } = endTurn(makeState({ round: 2 }));
    expect(state).toMatchObject({ currentTurn: 1, phase: 'reinforce', pendingReinforcements: 2 });
  });

  it('does not mutate the input state', () => {
    const input = makeState();
    const before = structuredClone(input);
    endTurn(input);
    expect(input).toEqual(before);
  });
});

describe('skip (GAME_RULES §4.2)', () => {
  it('emits skip, then ends the turn', () => {
    const { state, events } = skip(makeState());
    expect(events).toEqual([
      { type: 'skip', player: 'human' },
      { type: 'turnStart', player: 'npc:BBB', round: 1 },
    ]);
    expect(state.currentTurn).toBe(1);
  });

  it.each(['reinforce', 'attacking', 'occupy'])('rejects skipping in phase %s', (phase) => {
    expect(() => skip(makeState({ phase }))).toThrow(WrongPhaseError);
  });
});
