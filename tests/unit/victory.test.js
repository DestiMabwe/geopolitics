import { describe, it, expect } from 'vitest';
import { checkElimination, checkGameOver } from '../../src/game/victory.js';
import { makeState } from '../helpers.js';

// makeState's countries, re-owned: { CODE: owner }.
const ownedBy = (owners) =>
  makeState({ countries: Object.fromEntries(Object.entries(owners).map(([code, owner]) => [code, { owner }])) });

describe('checkElimination (GAME_RULES §2.4)', () => {
  it('eliminates a player who owns no countries', () => {
    const { state, events } = checkElimination(ownedBy({ BBB: 'human' }), 'npc:BBB', 'human');
    expect(state.players['npc:BBB'].eliminated).toBe(true);
    expect(events).toEqual([{ type: 'elimination', player: 'npc:BBB', by: 'human' }]);
  });

  it('leaves a player who still owns a country', () => {
    const { state, events } = checkElimination(makeState(), 'npc:BBB', 'human');
    expect(state.players['npc:BBB'].eliminated).toBe(false);
    expect(events).toEqual([]);
  });
});

describe('checkGameOver (GAME_RULES §9)', () => {
  it('wins when the human owns every country', () => {
    const { state, events } = checkGameOver(ownedBy({ BBB: 'human', CCC: 'human', DDD: 'human' }));
    expect(state).toMatchObject({ status: 'won', winner: 'human' });
    expect(events).toEqual([{ type: 'gameOver', status: 'won', winner: 'human' }]);
  });

  it('loses when the human owns nothing; the winner owns the most countries', () => {
    const { state, events } = checkGameOver(ownedBy({ AAA: 'npc:CCC', EEE: 'npc:CCC' }));
    expect(state).toMatchObject({ status: 'lost', winner: 'npc:CCC' });
    expect(events).toEqual([{ type: 'gameOver', status: 'lost', winner: 'npc:CCC' }]);
  });

  it('loses with winner null when the most countries is a tie', () => {
    expect(checkGameOver(ownedBy({ AAA: 'npc:BBB', EEE: 'npc:CCC' })).state).toMatchObject({ status: 'lost', winner: null });
  });

  it('carries on while the human owns some but not all', () => {
    const { state, events } = checkGameOver(makeState());
    expect(state.status).toBe('active');
    expect(events).toEqual([]);
  });
});
