import { IllegalMoveError, WrongPhaseError } from '../game/errors.js';

/**
 * An error that already knows its HTTP status. Models and controllers throw it
 * for 400 / 401 / 403 / 404, and `errorHandler` sends it as-is.
 */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code short machine-readable code, e.g. 'not_found'
   * @param {string} [message]
   */
  constructor(status, code, message = code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/**
 * The one place errors become JSON: `{ error: { code, message } }` (ARCHITECTURE §3).
 * Mounted last in app.js. Express needs all four parameters to treat it as an error handler.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return send(res, err.status, err.code, err.message);
  }
  if (err instanceof IllegalMoveError) {
    return send(res, 422, 'illegal_move', err.message);
  }
  if (err instanceof WrongPhaseError) {
    return send(res, 409, 'wrong_phase', err.message);
  }
  // Thrown by express.json() for a body that isn't valid JSON.
  if (err?.type === 'entity.parse.failed') {
    return send(res, 400, 'bad_json', 'Request body is not valid JSON');
  }
  // Unknown errors could carry internals (paths, keys), so the client gets a generic message.
  console.error(err);
  return send(res, 500, 'internal', 'Something went wrong');
}

function send(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}
