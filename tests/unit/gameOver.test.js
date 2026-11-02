import { describe, it, expect } from 'vitest';
import { gameOverSummary } from '../../public/js/gameOver.js';

// DESIGN §2 GameOverDialog, §3.4: result, rounds played, countries held. Words only; every figure is the server's.

const base = {
  round: 7,
  players: { human: { homeCode: 'ZAF' }, 'npc:KEN': { homeCode: 'KEN' } },
  countries: {
    ZAF: { name: 'South Africa', owner: 'human' },
    KEN: { name: 'Kenya', owner: 'npc:KEN' },
    BRA: { name: 'Brazil', owner: 'human' },
  },
};

describe('gameOverSummary', () => {
  it('is null while the game is still being played', () => {
    expect(gameOverSummary({ ...base, status: 'active', winner: null })).toBeNull();
  });

  it('celebrates a win, in the success tone', () => {
    const s = gameOverSummary({ ...base, status: 'won', winner: 'human' });
    expect(s.tone).toBe('success');
    expect(s.title).toBe('You conquered the world');
  });

  it('names the winner of a loss, in the danger tone', () => {
    const s = gameOverSummary({ ...base, status: 'lost', winner: 'npc:KEN' });
    expect(s.tone).toBe('danger');
    expect(s.title).toBe('Defeat');
    expect(s.winnerLine).toBe('Kenya wins.');
  });

  it('says so when a loss has no single winner (GAME_RULES §9.2)', () => {
    expect(gameOverSummary({ ...base, status: 'lost', winner: null }).winnerLine).toBe('No single winner.');
  });

  it('gives no winner line for a win, since the title says it', () => {
    expect(gameOverSummary({ ...base, status: 'won', winner: 'human' }).winnerLine).toBeNull();
  });

  it('reports the round the game ended in, as the server stored it', () => {
    expect(gameOverSummary({ ...base, status: 'lost', winner: 'npc:KEN' }).round).toBe(7);
  });

  it('lists the countries the human held, in game order', () => {
    expect(gameOverSummary({ ...base, status: 'lost', winner: 'npc:KEN' }).held).toEqual(['South Africa', 'Brazil']);
  });

  it('lists none when the human holds nothing', () => {
    const lost = { ...base, status: 'lost', winner: 'npc:KEN', countries: { ZAF: { name: 'South Africa', owner: 'npc:KEN' } } };
    expect(gameOverSummary(lost).held).toEqual([]);
  });
});
