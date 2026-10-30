/**
 * Eliminates `playerId` if they own no countries. Does not mutate `state`.
 * GAME_RULES §2.4
 * @param {object} state
 * @param {string} playerId the player who may have just lost their last country
 * @param {string} by the player who took it
 * @returns {{ state: object, events: object[] }} `[{ type: 'elimination', player, by }]` or no events
 */
export function checkElimination(state, playerId, by) {
  state = structuredClone(state);
  const owned = Object.values(state.countries).some((c) => c.owner === playerId);
  if (owned || state.players[playerId].eliminated) {
    return { state, events: [] };
  }
  state.players[playerId].eliminated = true;
  return { state, events: [{ type: 'elimination', player: playerId, by }] };
}

/**
 * Ends the game if the human owns every country (won) or none (lost). Does not mutate `state`.
 * GAME_RULES §9.1, §9.2, I-6
 * @param {object} state
 * @returns {{ state: object, events: object[] }} `[{ type: 'gameOver', status, winner }]` or no events
 */
export function checkGameOver(state) {
  state = structuredClone(state);
  const owners = Object.values(state.countries).map((c) => c.owner);
  const humanOwns = owners.filter((o) => o === 'human').length;

  if (humanOwns === owners.length) {
    state.status = 'won';
    state.winner = 'human';
  } else if (humanOwns === 0) {
    state.status = 'lost';
    state.winner = leader(owners);
  } else {
    return { state, events: [] };
  }
  state.attack = null;
  return { state, events: [{ type: 'gameOver', status: state.status, winner: state.winner }] };
}

// §9.2: the player owning the most countries, or null on a tie.
function leader(owners) {
  const counts = {};
  for (const o of owners) counts[o] = (counts[o] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return ranked.length > 1 && ranked[0][1] === ranked[1][1] ? null : ranked[0][0];
}
