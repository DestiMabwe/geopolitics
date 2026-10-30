import { IllegalMoveError, WrongPhaseError } from './errors.js';
import { currentPlayer } from './players.js';

/**
 * Moves `count` soldiers between two of the current player's countries. Does not mutate `state`.
 * GAME_RULES §6.1, §6.2, §4.2
 *
 * Legal only if: phase is `manoeuvre`; the current player owns both `from` and `to`;
 * `from` ≠ `to`; `count` is an integer ≥ 1; `soldiers(from) − count ≥ 1`.
 * The two countries do not need to border. Afterwards the phase is still `manoeuvre`
 * and it is still the same player's turn.
 *
 * @param {object} state
 * @param {string} from country code the soldiers leave (`a`)
 * @param {string} to country code the soldiers arrive in (`b`)
 * @param {number} count soldiers moved (`k`)
 * @returns {{
 *   state: object,
 *   events: [{ type: 'transfer', player: string, from: string, to: string, count: number }],
 * }}
 * @throws {WrongPhaseError} unless the phase is `manoeuvre` (409)
 * @throws {IllegalMoveError} for an unknown code, wrong ownership, the same country twice, or a bad count (422)
 */
export function transfer(state, from, to, count) {
  state = structuredClone(state);
  from = from.toUpperCase();
  to = to.toUpperCase();
  const player = currentPlayer(state);
  if (state.phase !== 'manoeuvre') throw new WrongPhaseError(`cannot transfer in phase ${state.phase}`);
  if (!Number.isInteger(count) || count < 1) throw new IllegalMoveError('count must be an integer ≥ 1');
  if (from === to) throw new IllegalMoveError('cannot transfer to the same country');
  if (!state.countries[from]) throw new IllegalMoveError(`unknown from code: ${from}`);
  if (!state.countries[to]) throw new IllegalMoveError(`unknown to code: ${to}`);
  if (state.countries[from].owner !== player) throw new IllegalMoveError(`not your country: ${from}`);
  if (state.countries[to].owner !== player) throw new IllegalMoveError(`not your country: ${to}`);
  if (state.countries[from].soldiers - count < 1) throw new IllegalMoveError('must leave at least one soldier behind');
  state.countries[from].soldiers -= count;
  state.countries[to].soldiers += count;
  return {
    state,
    events: [{ type: 'transfer', player, from, to, count }],
  };
}
