// How players appear on screen. Pure (no DOM).

/**
 * Whether `id` is the person looking at the page. The human player is "you" only to the owner: a
 * visitor on a shared link is watching someone else's game. Only an explicit `isOwner: false` from
 * the server makes the viewer a spectator.
 *
 * @param {object} game  the public game from the server
 * @param {string | null} id
 * @returns {boolean}
 */
export function isYou(game, id) {
  return id === 'human' && game.isOwner !== false;
}

/**
 * Who a player id is, for display: "You" for the viewer's own player, else the home country name.
 *
 * @param {object} game  the public game from the server
 * @param {string | null} id
 * @returns {string}
 */
export function playerName(game, id) {
  if (isYou(game, id)) return 'You';
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

/**
 * The countries a player owns, as `[code, country]` pairs in the game's own order, for the
 * reinforce, transfer and occupy panels. An empty list when the player owns none.
 *
 * @param {object} game  the public game from the server
 * @param {string} id  a player id, e.g. `human`
 * @returns {[string, object][]}
 */
export function ownedBy(game, id) {
  return Object.entries(game.countries).filter(([, country]) => country.owner === id);
}
