// How players appear on screen. Pure (no DOM).

/**
 * Who a player id is, for display: "You" for the human, else the NPC's home country name.
 *
 * @param {object} game  the public game from the server
 * @param {string | null} id
 * @returns {string}
 */
export function playerName(game, id) {
  if (id === 'human') return 'You';
  const home = game.players[id]?.homeCode;
  return game.countries[home]?.name ?? id ?? 'Nobody';
}

/**
 * The owner colour token for a player (DESIGN §1): `human`, or `1`–`9` for the NPCs
 * by their position in the turn order, so colours stay the same for the whole game.
 *
 * @param {object} game
 * @param {string} id
 * @returns {string}  use as `var(--owner-${slot})`
 */
export function ownerSlot(game, id) {
  if (id === 'human') return 'human';
  return String(game.turnOrder.filter((p) => p !== 'human').indexOf(id) + 1);
}
