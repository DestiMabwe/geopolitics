import { HttpError } from './errorHandler.js';

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;
const isNumber = (v) => Number.isFinite(v);

// One check per field type. `describe` is the end of the 400 message: `"count" must be …`.
const TYPES = {
  version: { ok: isPositiveInt, describe: 'a positive integer' },
  // Only the type is checked: 0, 1.5 or a negative number is an illegal move, so the engine answers 422 (GAME_RULES §6.1).
  count: { ok: isNumber, describe: 'a number' },
  code: { ok: (v) => typeof v === 'string' && v.length > 0, describe: 'a non-empty string' },
  placements: {
    ok: (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isNumber),
    describe: 'an object of numbers',
  },
};

/**
 * Strict body validation for one route (ARCHITECTURE §5.2). Every field in `shape` is required,
 * and any key not in `shape` is rejected, so a client can never slip in dice, soldier totals or
 * outcomes (CLAUDE.md hard rules). `validate({})` means the route takes no body.
 *
 * Field types:
 * - 'version'    a positive integer
 * - 'count'      a number. Its range is the engine's call, so 0 or 1.5 is a 422, not a 400
 * - 'code'       a non-empty string (country codes are checked against the game later, by the engine)
 * - 'placements' a plain object (not null, not an array) whose values are all numbers
 *
 * Steps for the returned middleware:
 * 1. Take the body (`req.body ?? {}`).
 * 2. 400 'bad_request' for the first key in the body that is not in `shape`, naming it:
 *    `Unexpected field "soldiers"`.
 * 3. 400 'bad_request' for the first field in `shape` that is missing or the wrong type, naming
 *    it: `"count" must be a positive integer`.
 * 4. Otherwise call `next()`, leaving `req.body` as it was.
 *
 * @param {Record<string, 'version' | 'count' | 'code' | 'placements'>} shape
 * @returns {import('express').RequestHandler}
 * @throws {HttpError} 400 as above, thrown by the returned middleware
 */
export function validate(shape) {
  return (req, res, next) => {
    const body = req.body ?? {};

    const unexpected = Object.keys(body).find((key) => !Object.hasOwn(shape, key));
    if (unexpected !== undefined) {
      throw new HttpError(400, 'bad_request', `Unexpected field "${unexpected}"`);
    }
    for (const [field, type] of Object.entries(shape)) {
      if (!TYPES[type].ok(body[field])) {
        throw new HttpError(400, 'bad_request', `"${field}" must be ${TYPES[type].describe}`);
      }
    }
    next();
  };
}
