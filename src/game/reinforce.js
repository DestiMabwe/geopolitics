import { WrongPhaseError } from './errors.js';
import { applyPlacements, checkPlacements } from './placements.js';

/**
 * The current player places all their pending reinforcements. Does not mutate `state`.
 * GAME_RULES §7.3, §4.1
 *
 * The amount is `state.pendingReinforcements`. Use `checkPlacements` and `applyPlacements`
 * from `placements.js`. Afterwards `pendingReinforcements` is 0, the phase is `manoeuvre`,
 * and it is still the same player's turn.
 *
 * @param {object} state
 * @param {Record<string, number>} placements `{ CODE: count }`, summing to `pendingReinforcements`
 * @returns {{
 *   state: object,
 *   events: [{ type: 'reinforce', player: string, amount: number, placements: Record<string, number> }],
 * }}
 * @throws {WrongPhaseError} unless the phase is `reinforce` (409)
 * @throws {IllegalMoveError} for bad placements (422)
 */
export function placeReinforcements(state, placements) {
  state = structuredClone(state);
  if (state.phase !== 'reinforce') {
    throw new WrongPhaseError(`cannot place reinforcements in phase ${state.phase}`);
  }
  const player = state.turnOrder[state.currentTurn];
  const amount = state.pendingReinforcements;
  checkPlacements(state, player, placements, amount);
  applyPlacements(state, placements);
  state.pendingReinforcements = 0;
  state.phase = 'manoeuvre';
  return {
    state,
    events: [{ type: 'reinforce', player, amount, placements }],
  };
}
