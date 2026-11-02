// Splitting a fixed number of soldiers across countries (GAME_RULES §5.6 occupy bonus, §7.3
// reinforcements). Pure and immutable: every function returns a new map and never touches its input.
// The server re-checks the final split; this only drives the steppers (CLAUDE.md: the client
// shows what the server decides). A map is `{ [countryCode]: soldiers }`.

/**
 * Soldiers placed so far.
 *
 * @param {Record<string, number>} placements
 * @returns {number}
 */
export function placedTotal(placements) {
  return Object.values(placements).reduce((sum, soldiers) => sum + soldiers, 0);
}

/**
 * Soldiers still to place out of `total`.
 *
 * @param {Record<string, number>} placements
 * @param {number} total the bonus (or the reinforcement amount) from the server
 * @returns {number}
 */
export function remaining(placements, total) {
  return total - placedTotal(placements);
}

/**
 * Puts one more soldier on `code`. Returns the same contents unchanged when nothing is left to place.
 *
 * @param {Record<string, number>} placements
 * @param {string} code
 * @param {number} total
 * @returns {Record<string, number>} a new map
 */
export function add(placements, code, total) {
  if (remaining(placements, total) <= 0) return placements;
  return { ...placements, [code]: (placements[code] ?? 0) + 1 };
}

/**
 * Takes one soldier off `code`. Never goes below 0, and a country that reaches 0 is dropped from the map.
 *
 * @param {Record<string, number>} placements
 * @param {string} code
 * @returns {Record<string, number>} a new map
 */
export function remove(placements, code) {
  if (!placements[code]) return placements;
  const next = { ...placements, [code]: placements[code] - 1 };
  if (next[code] === 0) delete next[code];
  return next;
}

/**
 * True only when the placements add up to exactly `total`.
 *
 * @param {Record<string, number>} placements
 * @param {number} total
 * @returns {boolean}
 */
export function isComplete(placements, total) {
  return placedTotal(placements) === total;
}
