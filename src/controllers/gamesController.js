import { randomInt } from 'node:crypto';
import * as gameModel from '../models/gameModel.js';
import { createGame as newGameState } from '../game/setup.js';
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
  const { ownerUid, ...game } = doc;
  return { ...game, isOwner: uid !== null && uid === ownerUid };
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
