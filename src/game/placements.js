import { IllegalMoveError } from './errors.js';

/**
 * Checks a split of new soldiers across a player's countries. Shared by occupy's bonus (§5.6)
 * and reinforcements (§7.3, S11): non-negative integers, on countries the player owns,
 * adding up exactly to `amount`.
 *
 * @param {object} state
 * @param {string} player
 * @param {Record<string, number>} placements
 * @param {number} amount
 * @throws {IllegalMoveError} (422) for anything else
 */
export function checkPlacements(state, player, placements, amount) {
  if (placements === null || typeof placements !== 'object' || Array.isArray(placements)) {
    throw new IllegalMoveError('placements must be an object of { CODE: count }');
  }
  let total = 0;
  for (const [code, n] of Object.entries(placements)) {
    if (state.countries[code]?.owner !== player) {
      throw new IllegalMoveError(`cannot place soldiers on ${code}: not owned by ${player}`);
    }
    if (!Number.isInteger(n) || n < 0) {
      throw new IllegalMoveError(`placement on ${code} must be a whole number ≥ 0`);
    }
    total += n;
  }
  if (total !== amount) {
    throw new IllegalMoveError(`placements add up to ${total}, expected exactly ${amount}`);
  }
}

/** Adds checked placements to `state` in place. `state` must already be a copy. */
export function applyPlacements(state, placements) {
  for (const [code, n] of Object.entries(placements)) {
    state.countries[code].soldiers += n;
  }
}
