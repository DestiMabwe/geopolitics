import { describe, it, expect } from 'vitest';
import { eventText } from '../../public/js/eventText.js';
import { playerName, ownerSlot } from '../../public/js/players.js';

const game = {
  players: { human: { homeCode: 'ZAF' }, 'npc:KEN': { homeCode: 'KEN' } },
  countries: { ZAF: { name: 'South Africa' }, KEN: { name: 'Kenya' }, BRA: { name: 'Brazil' } },
};
const line = (type, data) => eventText({ type, data }, game);

describe('playerName', () => {
  it('calls the human "You" and an NPC by its home country', () => {
    expect(playerName(game, 'human')).toBe('You');
    expect(playerName(game, 'npc:KEN')).toBe('Kenya');
  });
});

describe('ownerSlot (DESIGN §1 owner colours)', () => {
  it('gives the human its own slot and NPCs 1–9 by turn-order position', () => {
    const g = { turnOrder: ['npc:KEN', 'human', 'npc:BRA'] };
    expect(ownerSlot(g, 'human')).toBe('human');
    expect(ownerSlot(g, 'npc:KEN')).toBe('1');
    expect(ownerSlot(g, 'npc:BRA')).toBe('2');
  });
});

describe('eventText (GAME_RULES §10)', () => {
  it('says whose turn it is, reading round from beside data as the server stores it', () => {
    expect(eventText({ type: 'turnStart', round: 2, data: { player: 'human' } }, game)).toBe('Round 2: your turn.');
    expect(eventText({ type: 'turnStart', round: 1, data: { player: 'npc:KEN' } }, game)).toBe("Round 1: Kenya's turn.");
  });

  it('names both countries in an attack', () => {
    expect(line('attackStart', { player: 'human', from: 'ZAF', to: 'KEN' })).toBe('You attack Kenya from South Africa.');
  });

  it('shows a roll with only the numbers from the event', () => {
    const text = line('roll', {
      player: 'human', from: 'ZAF', to: 'KEN',
      attackerDice: [1, 4], defenderDice: [2, 3],
      attackerLosses: 1, defenderLosses: 1, attackerLeft: 9, defenderLeft: 1,
    });
    expect(text).toBe('1, 4 against 2, 3: South Africa loses 1, Kenya loses 1 (9 vs 1).');
  });

  it('reports a conquest with its bonus', () => {
    expect(line('conquest', { player: 'npc:KEN', from: 'KEN', to: 'BRA', previousOwner: 'npc:BRA', bonus: 3 }))
      .toBe('Kenya conquers Brazil and earns 3 new soldiers.');
  });

  it('reports a win and a loss', () => {
    expect(line('gameOver', { status: 'won', winner: 'human' })).toBe('You conquer the world. Victory!');
    expect(line('gameOver', { status: 'lost', winner: 'npc:KEN' })).toBe('Defeat. Kenya wins.');
    expect(line('gameOver', { status: 'lost', winner: null })).toBe('Defeat. No single winner.');
  });

  it.each(['occupy', 'attackFailed', 'attackStopped', 'skip', 'elimination', 'reinforce', 'transfer'])(
    'gives a non-empty line for %s',
    (type) => {
      const text = line(type, { player: 'human', by: 'npc:KEN', from: 'ZAF', to: 'KEN', count: 2, amount: 4 });
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/undefined/);
    },
  );
});
