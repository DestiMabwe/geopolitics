/**
 * Stands in for `rollDie` / `randomInt` in tests.
 * Returns a function that yields `values` in order, one per call,
 * and throws once they run out, so a test can't silently use more randomness than it scripted.
 *
 * @param {...number} values
 * @returns {() => number}
 */
export function scripted(...values) {
  let position = 0;
  return function () {
    if (position >= values.length) {
      throw new Error(`scripted(): ran out after ${values.length} value(s)`);
    }
    const result = values[position];
    position++;
    return result;
  };
}
