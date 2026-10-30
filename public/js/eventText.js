// A plain line per event for the game page's event log (GAME_RULES §10). Every number in a
// line comes from the event itself; the browser only puts words around it. The LLM
// commentary (S16b) replaces these later. Pure (no DOM), so it runs in the unit tests.

import { playerName } from './players.js';

/**
 * @param {{ type: string, round?: number, data: object }} event  an event doc from the server
 * @param {object} game
 * @returns {string}
 */
export function eventText(event, game) {
  const d = event.data ?? {};
  const who = playerName(game, d.player);
  const name = (code) => game.countries[code]?.name ?? code;
  const verb = (you, they) => (d.player === 'human' ? you : they);

  switch (event.type) {
    case 'turnStart': {
      // Stored events keep `round` beside `data` (gameModel.toEventDoc), not inside it.
      const round = event.round ?? d.round;
      return d.player === 'human' ? `Round ${round}: your turn.` : `Round ${round}: ${who}'s turn.`;
    }
    case 'attackStart':
      return `${who} ${verb('attack', 'attacks')} ${name(d.to)} from ${name(d.from)}.`;
    case 'roll':
      return `${d.attackerDice.join(', ')} against ${d.defenderDice.join(', ')}: ` +
        `${name(d.from)} loses ${d.attackerLosses}, ${name(d.to)} loses ${d.defenderLosses} ` +
        `(${d.attackerLeft} vs ${d.defenderLeft}).`;
    case 'conquest':
      return `${who} ${verb('conquer', 'conquers')} ${name(d.to)} and ${verb('earn', 'earns')} ${d.bonus} new soldiers.`;
    case 'occupy':
      return `${who} ${verb('move', 'moves')} ${d.count} into ${name(d.to)}.`;
    case 'attackFailed':
      return `The attack on ${name(d.to)} fails. ${name(d.from)} holds with 1 soldier.`;
    case 'attackStopped':
      return `${who} ${verb('stop', 'stops')} the attack on ${name(d.to)}.`;
    case 'skip':
      return `${who} ${verb('hold', 'holds')} position.`;
    case 'reinforce':
      return `${who} ${verb('place', 'places')} ${d.amount} new soldiers.`;
    case 'transfer':
      return `${who} ${verb('move', 'moves')} ${d.count} from ${name(d.from)} to ${name(d.to)}.`;
    case 'elimination':
      return `${playerName(game, d.player)} ${d.player === 'human' ? 'are' : 'is'} eliminated by ${playerName(game, d.by)}.`;
    case 'gameOver':
      return d.status === 'won' ? 'You conquer the world. Victory!' : `Defeat. ${d.winner ? `${playerName(game, d.winner)} wins.` : 'No single winner.'}`;
    default:
      return event.type;
  }
}
