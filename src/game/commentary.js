// The event types that get an LLM line. ARCHITECTURE §4.3
export const LLM_EVENTS = new Set(['roll', 'conquest', 'elimination', 'gameOver']);

export const countryName = (state, code) => state.countries[code].name;

// Always `homeCode`, never current ownership, so a player keeps their name after losing it.
export const playerName = (state, id) => countryName(state, state.players[id].homeCode);

const soldiers = (count) => `${count} ${count === 1 ? 'soldier' : 'soldiers'}`;

/**
 * The template line for one engine event: shown at once, used in fast-forward, and the fallback
 * for the LLM. Does not mutate its inputs. GAME_RULES §10
 *
 * Owner and spectators read the same stored line, so nobody is "You". A player is named after
 * their home country, `state.countries[state.players[id].homeCode].name`, human and NPC alike,
 * even once they have lost it. Every number in the line must be a field of the event.
 *
 * @param {{ type: string, [field: string]: unknown }} event a flat engine event, as listed in §10
 * @param {object} state the game state, for country names and home countries
 * @returns {string} one short line
 */
export function toText(event, state) {
  const country = (code) => countryName(state, code);
  const player = (id) => playerName(state, id);

  switch (event.type) {
    case 'turnStart':
      return `Round ${event.round}: ${player(event.player)}'s turn.`;
    case 'reinforce':
      return `${player(event.player)} places ${soldiers(event.amount)}.`;
    case 'transfer':
      return `${player(event.player)} moves ${soldiers(event.count)} from ${country(event.from)} to ${country(event.to)}.`;
    case 'attackStart':
      return `${country(event.from)} attacks ${country(event.to)}.`;
    case 'roll':
      return `${country(event.from)} rolls ${event.attackerDice.join(', ')} against ` +
        `${country(event.to)}'s ${event.defenderDice.join(', ')}: ` +
        `${event.attackerLeft} vs ${event.defenderLeft} left.`;
    case 'conquest':
      return `${player(event.player)} conquers ${country(event.to)} and earns ${soldiers(event.bonus)}.`;
    case 'occupy':
      return `${player(event.player)} moves ${soldiers(event.count)} into ${country(event.to)}.`;
    case 'attackFailed':
      return `The attack from ${country(event.from)} on ${country(event.to)} fails.`;
    case 'attackStopped':
      return `${country(event.from)} calls off the attack on ${country(event.to)}.`;
    case 'skip':
      return `${player(event.player)} holds position.`;
    case 'elimination':
      return `${player(event.player)} is eliminated by ${player(event.by)}.`;
    case 'gameOver':
      // GAME_RULES §9.2: when the human is eliminated, `winner` is only whoever owns the most countries,
      // so a loss says that instead of "wins the game" (QA 2026-11-03 ISSUE-C).
      if (event.status === 'lost') {
        return event.winner ? `The game ends. ${player(event.winner)} holds the most countries.` : 'The game ends. Tied for the most countries.';
      }
      return event.winner ? `${player(event.winner)} wins the game.` : 'The game ends with no single winner.';
    default:
      return event.type;
  }
}
