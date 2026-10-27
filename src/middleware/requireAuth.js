import { getAuthClient } from '../config/firebase.js';
import { HttpError } from './errorHandler.js';

/**
 * Returns the uid for a valid `Authorization: Bearer <idToken>` header,
 * or null when the header is missing, malformed, or the token fails verification.
 *
 * @param {import('express').Request} req
 * @returns {Promise<string | null>}
 */
async function uidFromRequest(req) {
  const match = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '');
  if (!match) return null;
  try {
    const decoded = await getAuthClient().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * ARCHITECTURE §5.2: every POST, `GET /games` and `GET /players/me` need a verified token.
 * Sets `req.uid`, or passes a 401 to the error handler.
 */
export async function requireAuth(req, res, next) {
  const uid = await uidFromRequest(req);
  if (!uid) {
    return next(new HttpError(401, 'unauthenticated', 'A valid login token is required'));
  }
  req.uid = uid;
  next();
}

/**
 * For public routes that still want to know who is asking (ARCHITECTURE §3: `isOwner`).
 * A missing or bad token makes the caller a visitor (`req.uid = null`), never a 401.
 */
export async function optionalAuth(req, res, next) {
  req.uid = await uidFromRequest(req);
  next();
}
