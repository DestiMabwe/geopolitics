// The words on the GameOverDialog (DESIGN §2, §3.4). Pure (no DOM). Nothing is worked out here:
// the result, the winner and the round are the server's, and the countries held are listed by name.

import { ownedBy } from './players.js';
import { mostCountriesLine } from './eventText.js';

/**
 * @param {object} game  the public game
 * @returns {{ title: string, tone: 'success' | 'danger', winnerLine: string | null, round: number, held: string[] } | null}
 *   null while the game is still being played
 */
export function gameOverSummary(game) {
  if (game.status === 'active') return null;

  const won = game.status === 'won';
  const winnerLine = won ? null : mostCountriesLine(game, game.winner);
  return {
    title: won ? 'You conquered the world' : 'Defeat',
    tone: won ? 'success' : 'danger',
    winnerLine,
    round: game.round,
    held: ownedBy(game, 'human').map(([, country]) => country.name),
  };
}
