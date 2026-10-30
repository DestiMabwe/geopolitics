import { WrongPhaseError } from './errors.js';
import { reinforcementAmount } from './soldiers.js';

/**
 * Ends the current player's turn: play passes to the next non-eliminated player,
 * `round += 1` on wrap, and from round 2 the next player gets reinforcements.
 * Does not mutate `state`.
 * GAME_RULES §4.6, §7.1, §7.2 — implemented in S12.
 * @param {object} state
 * @returns {{ state: object, events: object[] }} events start with `turnStart` for the next player
 */
export function endTurn(state) {
  state = structuredClone(state);
  const n = state.turnOrder.length;
  let index = state.currentTurn;
  do {
    index = (index + 1) % n;
    // §4.6: passing from the last position back to the first starts a new round,
    // even when the player in position 0 is eliminated and gets skipped.
    if (index === 0) state.round += 1;
  } while (state.players[state.turnOrder[index]].eliminated);

  const player = state.turnOrder[index];
  state.currentTurn = index;
  state.attack = null;
  // §7.1: nobody receives soldiers in round 1. §7.2: from round 2, 2 × countries owned.
  if (state.round >= 2) {
    const owned = Object.values(state.countries).filter((c) => c.owner === player).length;
    state.pendingReinforcements = reinforcementAmount(owned);
    state.phase = 'reinforce';
  } else {
    state.pendingReinforcements = 0;
    state.phase = 'manoeuvre';
  }
  return { state, events: [{ type: 'turnStart', player, round: state.round }] };
}

/**
 * The current player attacks nobody and ends the turn. Does not mutate `state`.
 * GAME_RULES §4.2
 * @param {object} state
 * @returns {{ state: object, events: object[] }} `skip`, then `endTurn`'s events
 * @throws {WrongPhaseError} unless the phase is `manoeuvre` (409)
 */
export function skip(state) {
  if (state.phase !== 'manoeuvre') {
    throw new WrongPhaseError(`cannot skip in phase ${state.phase}`);
  }
  const player = state.turnOrder[state.currentTurn];
  const next = endTurn(state);
  return { state: next.state, events: [{ type: 'skip', player }, ...next.events] };
}
