import { randomInt } from 'node:crypto';
import * as gameModel from '../models/gameModel.js';
import { createGame as newGameState } from '../game/setup.js';
import * as attack from '../game/attack.js';
import * as turn from '../game/turn.js';
import * as reinforcements from '../game/reinforce.js';
import * as transfers from '../game/transfer.js';
import * as npc from '../game/npc.js';
import { LLM_EVENTS } from '../game/commentary.js';
import { generateCommentary } from '../services/commentaryService.js';
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
  const { countryCode } = req.body;

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
  const { version, from, to } = req.body;

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
  const { version } = req.body;

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
  const { version } = req.body;

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
  const { version, count, placements } = req.body;

  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    attack.occupy(state, count, placements)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}

/**
 * POST /games/:id/npc-turn (token + owner). Body `{ version }`. Plays the current NPC's whole turn
 * and saves its events with their template lines. Never calls the LLM (CLAUDE.md hard rules).
 * ARCHITECTURE §4.2, GAME_RULES §8, §9.2. 400 · 403 · 409 stale / game over / human's turn.
 * Responds `200 { game, events }`.
 *
 * Steps:
 * 1. Same body check as rollAttack (only `version`).
 * 2. Make `rollDie` the same way as rollAttack. The server rolls for the NPC too.
 * 3. Call runAction with `{ version, turn: 'npc' }`, which gives the 409 on the human's turn. The
 *    function returns the engine's `npc.playNpcTurn(state, rollDie)`.
 * 4. Respond the same way as startAttack.
 */
export async function npcTurn(req, res) {
  const { version } = req.body;

  const rollDie = () => randomInt(1, 7);
  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'npc' }, (state) =>
    npc.playNpcTurn(state, rollDie)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}

/**
 * POST /games/:id/events/:eventId/commentary (token + owner). No body. ARCHITECTURE §3, §4.3.
 * Not a game action, so it takes no `version` and works on a finished game.
 * 400 any body key · 403 not owner · 404 no such game or event. Responds `200 { text }`.
 *
 * Steps:
 * 1. (Done before this runs: `validate({})` answers 400 'bad_request' if the body has any key at all.)
 * 2. 404 'not_found' unless `eventId` is exactly 6 digits (`/^\d{6}$/`). Firestore throws on ids
 *    like `__bad__`, which would otherwise be a 500.
 * 3. Call gameModel.claimCommentary with the game id, event id and caller's uid.
 * 4. If `event.aiText` is not null, respond with it. This is what makes the endpoint idempotent.
 * 5. If `event.type` is not in LLM_EVENTS, respond with `event.text`. Save nothing.
 * 6. Choose the line, with no transaction open (CLAUDE.md hard rules). If `claimed`, it is
 *    `await generateCommentary({ type: event.type, ...event.data }, state)`. If not (the cap), it is
 *    `event.text`. Leave `event.round` out: on these four types it is a stored 0, not a real field,
 *    and it would reach the prompt.
 * 7. Save it with gameModel.saveCommentary and respond with what that returns.
 */
export async function commentary(req, res) {
  // Firestore throws on ids like `__bad__`, which would otherwise be a 500.
  if (!/^\d{6}$/.test(req.params.eventId)) {
    throw new HttpError(404, 'not_found', `No event with id ${req.params.eventId}`);
  }

  const { id, eventId } = req.params;
  const { event, state, claimed } = await gameModel.claimCommentary(id, eventId, req.uid);

  if (event.aiText !== null) {
    return res.json({ text: event.aiText });
  }
  if (!LLM_EVENTS.has(event.type)) {
    return res.json({ text: event.text });
  }

  // No transaction is open here (CLAUDE.md). `round` is left out: on these types it is a stored 0.
  const line = claimed ? await generateCommentary({ type: event.type, ...event.data }, state) : event.text;
  res.json({ text: await gameModel.saveCommentary(id, eventId, line) });
}

/**
 * POST /games/:id/reinforce (token + owner). Body `{ version, placements: { CODE: n } }`.
 * Places all pending reinforcements. GAME_RULES §7.3, ARCHITECTURE §3.
 * 400 bad body · 403 · 409 stale / not in reinforce / not your turn · 422 bad sum or not owned.
 * Responds `200 { game, events }`.
 *
 * Steps:
 * 1. Same body checks as occupy, without `count`: the only allowed keys are `version` and
 *    `placements`, and `placements` must be a map (not null, not an array).
 * 2. Call runAction with `{ version, turn: 'human' }`; the function returns the engine's
 *    `reinforcements.placeReinforcements(state, placements)`.
 * 3. Respond the same way as startAttack.
 */
export async function reinforce(req, res) {
  const { version, placements } = req.body;

  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    reinforcements.placeReinforcements(state, placements)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}

/**
 * POST /games/:id/transfer (token + owner). Body `{ version, from, to, count }`.
 * Moves soldiers between two of the player's countries. GAME_RULES §6, ARCHITECTURE §3.
 * 400 bad body · 403 · 409 stale / not in manoeuvre / not your turn · 422 §6.1.
 * Responds `200 { game, events }`.
 *
 * Steps:
 * 1. 400 'bad_request' for any key other than `version`, `from`, `to`, `count`.
 * 2. 400 'bad_request' unless `version` is a positive integer, `from` and `to` are strings, and
 *    `count` is a number. The strings matter: the engine calls `toUpperCase` on them, so anything
 *    else would crash into a 500. Leave 0 and 1.5 to the engine, which answers 422 (§6.1).
 * 3. Call runAction; the function returns the engine's `transfers.transfer(state, from, to, count)`.
 * 4. Respond the same way as startAttack.
 */
export async function transfer(req, res) {
  const { version, from, to, count } = req.body;

  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    transfers.transfer(state, from, to, count)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}

/**
 * POST /games/:id/skip (token + owner). Body `{ version }`. Ends the turn without attacking.
 * GAME_RULES §4.2. 400 · 403 · 409 stale / not in manoeuvre. Responds `200 { game, events }`.
 */
export async function skip(req, res) {
  const { version } = req.body;

  const { game, events } = await gameModel.runAction(req.params.id, req.uid, { version, turn: 'human' }, (state) =>
    turn.skip(state)
  );
  res.json({ game: toPublicGame(game, req.uid), events });
}
