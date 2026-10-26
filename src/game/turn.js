/**
 * Ends the current player's turn: play passes to the next non-eliminated player,
 * `round += 1` on wrap, and from round 2 the next player gets reinforcements.
 * Does not mutate `state`.
 * GAME_RULES §4.6, §7.1, §7.2 — implemented in S12.
 * @param {object} state
 * @returns {{ state: object, events: object[] }} events start with `turnStart` for the next player
 */
export function endTurn(state) {
  throw new Error('not implemented');
}
