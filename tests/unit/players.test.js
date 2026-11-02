import { describe, it, expect } from 'vitest';
import { ownedBy } from '../../public/js/players.js';

const game = {
  countries: {
    ZAF: { name: 'South Africa', owner: 'human', soldiers: 5 },
    KEN: { name: 'Kenya', owner: 'npc:KEN', soldiers: 3 },
    BRA: { name: 'Brazil', owner: 'human', soldiers: 2 },
  },
};

describe('ownedBy (the panels list only your countries)', () => {
  it('lists only the countries the player owns', () => {
    expect(ownedBy(game, 'human').map(([code]) => code)).toEqual(['ZAF', 'BRA']);
  });

  it('gives each country with its code, as the server sent it', () => {
    expect(ownedBy(game, 'npc:KEN')).toEqual([['KEN', game.countries.KEN]]);
  });

  it('keeps the game order', () => {
    expect(ownedBy(game, 'human')[0][0]).toBe('ZAF');
  });

  it('gives an empty list when the player owns none', () => {
    expect(ownedBy(game, 'npc:BRA')).toEqual([]);
  });
});
