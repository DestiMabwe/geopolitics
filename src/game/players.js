/**
 * The player whose turn it is. Whether the HTTP caller owns the game is checked
 * by gameModel (S18), not here. Lives apart from `turn.js` because the attack
 * tests mock that whole module.
 *
 * @param {object} state
 * @returns {string} a player id
 */
export const currentPlayer = (state) => state.turnOrder[state.currentTurn];
