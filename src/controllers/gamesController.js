import { randomInt } from 'node:crypto';
import * as gameModel from '../models/gameModel.js';
import { createGame as newGameState } from '../game/setup.js';
import * as attack from '../game/attack.js';
import * as turn from '../game/turn.js';
import { HttpError } from '../middleware/errorHandler.js';
import countryData from '../data/countries.json' with { type: 'json' };

/**
 * Shapes a stored game for any response (ARCHITECTURE §3): drops `ownerUid`
 * and adds `isOwner`, true only when `uid` is the owner's. Visitors pass `uid = null`.
 *
 * @param {object} doc stored game with `id` and `ownerUid`
 * @param {string | null} uid
 * @returns {object}
 */
export function toPublicGame(doc, uid) {
  const { ownerUid, createdAt, updatedAt, ...game } = doc;
  return { ...game, createdAt: toIso(createdAt), updatedAt: toIso(updatedAt), isOwner: uid !== null && uid === ownerUid };
}

// Firestore Timestamps would reach the browser as { _seconds, _nanoseconds }. A value that
// isn't a Timestamp (a fresh runAction result has none, see gameModel) passes through as is.
function toIso(value) {
  return typeof value?.toDate === 'function' ? value.toDate().toISOString() : value;
}

/**
 * POST /games (token). Body `{ countryCode }`.
 * 400 if `countryCode` is not a string · 422 unknown country (engine throws IllegalMoveError).
 * The server picks everything random with crypto.randomInt (CLAUDE.md hard rules).
 * Responds `201 { game, events }`.
 */
export async function createGame(req, res) {
  const { countryCode } = req.body ?? {};
  if (typeof countryCode !== 'string') {
    throw new HttpError(400, 'bad_request', 'countryCode must be a string');
  }

  // An unknown country makes the engine throw IllegalMoveError, which errorHandler turns into 422.
  const { state, events } = newGameState({
    humanCode: countryCode,
    catalogue: countryData.countries,
    randomInt: (max) => randomInt(max),
  });

  const gameId = await gameModel.createGame(req.uid, state, events);
  const saved = await gameModel.getGame(gameId);
  res.status(201).json({ game: toPublicGame(saved, req.uid), events });
}

/** GET /games (token). Responds `200 { games }`, the caller's games only, newest first. */
export async function listGames(req, res) {
  const games = await gameModel.listGamesByOwner(req.uid);
  res.json({ games: games.map((g) => toPublicGame(g, req.uid)) });
}

/** GET /games/:id (public, optional token). Responds `200 { game }` · 404. */
export async function getGame(req, res) {
  const game = await gameModel.getGame(req.params.id);
  res.json({ game: toPublicGame(game, req.uid ?? null) });
}

/**
 * GET /games/:id/events?after=<seq> (public). `after` defaults to 0;
 * anything that isn't a non-negative integer → 400. Responds `200 { events }` · 404.
 */
export async function listEvents(req, res) {
  const after = req.query.after === undefined ? 0 : Number(req.query.after);
  if (!Number.isInteger(after) || after < 0) {
    throw new HttpError(400, 'bad_request', 'after must be a non-negative integer');
  }
  const events = await gameModel.listEvents(req.params.id, after);
  res.json({ events });
}

/**
 * POST /games/:id/attack (token + owner). Body `{ version, from, to }`. ARCHITECTURE §3, GAME_RULES §5.1.
 * 400 bad body · 403 not owner · 409 stale / wrong phase / not your turn · 422 illegal attack.
 * Responds `200 { game, events }`.
 *
 * Steps:
 * 1. Take the body (`req.body ?? {}`).
 * 2. 400 'bad_request' if it has any key other than `version`, `from`, `to`
 *    (this is what rejects a client-sent `dice` or `soldiers`).
 * 3. 400 'bad_request' unless `version` is a positive integer and `from` and `to` are strings.
 * 4. Call gameModel.runAction with the game id from the URL, the caller's uid,
 *    `{ version, turn: 'human' }`, and a function that takes `state` and returns
 *    the engine's `startAttack(state, from, to)`.
 * 5. runAction gives back `{ game, events }`. Respond with `game` passed through toPublicGame
 *    (with the caller's uid) and `events` as they are.
 */
export async function startAttack(req, res) {
  const { version, from, to, ...rest } = req.body ?? {};
  if (Object.keys(rest).length > 0) {
    throw new HttpError(400, 'bad_request', 'unexpected keys in body');
  }
  if (!Number.isInteger(version) || version <= 0 || typeof from !== 'string' || typeof to !== 'string') {
    throw new HttpError(400, 'bad_request', 'invalid body');
  }

  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    attack.startAttack(state, from, to)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}

/**
 * POST /games/:id/attack/roll (token + owner). Body `{ version }`. One dice roll per request.
 * ARCHITECTURE §4.1, GAME_RULES §5.2–§5.4. 400 · 403 · 409 stale / no attack in progress.
 * Responds `200 { game, events }`.
 *
 * Steps:
 * 1. Same body checks as startAttack, but the only allowed key is `version`.
 * 2. Make `rollDie`: a function with no arguments returning crypto's `randomInt(1, 7)` (1–6).
 *    The server rolls; the client never sends dice (CLAUDE.md hard rules).
 * 3. Call runAction exactly as in startAttack, but the function returns the engine's
 *    `rollAttack(state, rollDie)`.
 * 4. Respond the same way as startAttack.
 */
export async function rollAttack(req, res) {
  const { version, ...rest } = req.body ?? {};
  if (Object.keys(rest).length > 0) {
    throw new HttpError(400, 'bad_request', 'unexpected keys in body');
  }
  if (!Number.isInteger(version) || version <= 0) {
    throw new HttpError(400, 'bad_request', 'invalid body');
  }

  const rollDie = () => randomInt(1, 7);
  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    attack.rollAttack(state, rollDie)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}

/**
 * POST /games/:id/attack/stop (token + owner). Body `{ version }`. Ends the turn (GAME_RULES §5.4, §4.5).
 * 400 · 403 · 409 stale / no attack in progress. Responds `200 { game, events }`.
 *
 * Steps:
 * 1. Same body check as rollAttack (only `version`).
 * 2. Call runAction; the function returns the engine's `stopAttack(state)`.
 * 3. Respond the same way as startAttack.
 */
export async function stopAttack(req, res) {
  const { version, ...rest } = req.body ?? {};
  if (Object.keys(rest).length > 0) {
    throw new HttpError(400, 'bad_request', 'unexpected keys in body');
  }
  if (!Number.isInteger(version) || version <= 0) {
    throw new HttpError(400, 'bad_request', 'invalid body');
  }

  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    attack.stopAttack(state)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}

/**
 * POST /games/:id/attack/occupy (token + owner). Body `{ version, count, placements: { CODE: n } }`.
 * Moves `count` in, places the bonus, ends the turn. GAME_RULES §5.6, ARCHITECTURE §3.
 * 400 bad body · 403 · 409 stale / not in occupy · 422 count out of range or placements that don't sum to the bonus.
 * Responds `200 { game, events }`.
 */
export async function occupy(req, res) {
  const { version, count, placements, ...rest } = req.body ?? {};
  if (Object.keys(rest).length > 0) {
    throw new HttpError(400, 'bad_request', 'unexpected keys in body');
  }
  const isMap = placements !== null && typeof placements === 'object' && !Array.isArray(placements);
  if (!Number.isInteger(version) || version <= 0 || typeof count !== 'number' || !isMap) {
    throw new HttpError(400, 'bad_request', 'invalid body');
  }

  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    attack.occupy(state, count, placements)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}

/**
 * POST /games/:id/skip (token + owner). Body `{ version }`. Ends the turn without attacking.
 * GAME_RULES §4.2. 400 · 403 · 409 stale / not in manoeuvre. Responds `200 { game, events }`.
 */
export async function skip(req, res) {
  const { version, ...rest } = req.body ?? {};
  if (Object.keys(rest).length > 0) {
    throw new HttpError(400, 'bad_request', 'unexpected keys in body');
  }
  if (!Number.isInteger(version) || version <= 0) {
    throw new HttpError(400, 'bad_request', 'invalid body');
  }

  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    turn.skip(state)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}
