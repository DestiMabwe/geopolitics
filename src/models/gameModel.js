import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase.js';
import { HttpError } from '../middleware/errorHandler.js';
import { LLM_EVENTS, toText } from '../game/commentary.js';
import { playerRef, startedFields, finishedFields } from './playerModel.js';

// ARCHITECTURE §4.3: LLM calls allowed per game.
export const MAX_LLM_CALLS = 60;

/**
 * Stores a new game and its first events in one batch (ARCHITECTURE §2).
 *
 * `games/{auto id}` = the engine state, plus
 *   `ownerUid`, `version: 1`, `eventSeq` (= number of events), `llmCalls: 0`,
 *   `createdAt` and `updatedAt` (server timestamps).
 * `games/{id}/events/{000001, 000002, …}` = one doc per engine event:
 *   `{ seq, round, type, data, text, aiText: null, createdAt }`
 *   where `type` is the event's type, `data` is every other field of the event,
 *   and `text` is the template line from `commentary.toText`.
 *
 * @param {string} ownerUid
 * @param {object} state engine state from `createGame`
 * @param {{ type: string, round?: number, [key: string]: unknown }[]} events engine events
 * @returns {Promise<string>} the new game id
 */
export async function createGame(ownerUid, state, events) {
  const gameDoc = { ...state, ownerUid, version: 1, eventSeq: events.length, llmCalls: 0 };
  const eventDocs = events.map((e, i) => toEventDoc(e, i + 1, state));

  const batch = getDb().batch();
  const gameRef = getDb().collection('games').doc();
  batch.set(gameRef, { ...gameDoc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  for (const event of eventDocs) {
    batch.set(gameRef.collection('events').doc(eventId(event.seq)), event);
  }
  batch.set(playerRef(ownerUid), startedFields(), { merge: true });
  await batch.commit();
  return gameRef.id;
}

/**
 * The owner's games, newest `updatedAt` first. Uses the `ownerUid` + `updatedAt desc` index.
 *
 * @param {string} ownerUid
 * @returns {Promise<object[]>} each stored document's data with its `id` added
 */
export async function listGamesByOwner(ownerUid) {
  const snap = await getDb().collection('games')
    .where('ownerUid', '==', ownerUid)
    .orderBy('updatedAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * @param {string} gameId
 * @returns {Promise<object>} the stored document's data with its `id` added (still has `ownerUid`)
 * @throws {HttpError} 404 'not_found' if there is no such game
 */
export async function getGame(gameId) {
  const doc = await getDb().collection('games').doc(gameId).get();
  if (!doc.exists) {
    throw new HttpError(404, 'not_found', `No game with id ${gameId}`);
  }
  return { id: doc.id, ...doc.data() };
}

/**
 * Events with `seq > after`, ascending by `seq`, at most 200 (ARCHITECTURE §3).
 *
 * @param {string} gameId
 * @param {number} after
 * @returns {Promise<object[]>} event documents' data
 * @throws {HttpError} 404 'not_found' if there is no such game
 */
export async function listEvents(gameId, after) {
  await getGame(gameId); // throws the 404
  const snap = await getDb().collection('games').doc(gameId).collection('events')
    .where('seq', '>', after)
    .orderBy('seq', 'asc')
    .limit(200)
    .get();
  return snap.docs.map((d) => d.data());
}

/**
 * Runs one game action in one Firestore transaction (ARCHITECTURE §4.1, §5.2).
 *
 * In order: 404 'not_found' · 403 'forbidden' (ownerUid ≠ uid) · 409 'game_over' (status ≠ 'active') ·
 * 409 'stale_version' (version ≠ stored version) · 409 'not_your_turn' (the current player's
 * `type` ≠ `turn`). Then `fn(state)`, where `state` is the stored doc without `ownerUid`, `version`,
 * `eventSeq`, `llmCalls`, `createdAt`, `updatedAt`. Errors thrown by `fn` propagate and nothing is written.
 *
 * On success it writes the new state with `version + 1`, `eventSeq + events.length` and a new
 * `updatedAt`, plus one event doc per event (same shape as `createGame`), seq continuing from `eventSeq`.
 *
 * @param {string} gameId
 * @param {string} uid caller's uid from requireAuth
 * @param {{ version: number, turn: 'human' | 'npc' }} expected
 * @param {(state: object) => { state: object, events: object[] }} fn the engine call
 * @returns {Promise<{ game: object, events: object[] }>} `game` has `id` and still has `ownerUid`
 * @throws {HttpError} 404 / 403 / 409 as above
 */
export async function runAction(gameId, uid, { version, turn }, fn) {
  const gameRef = getDb().collection('games').doc(gameId);

  // Anything thrown inside the callback aborts the transaction, so a failed check or engine error writes nothing.
  return getDb().runTransaction(async (tx) => {
    const doc = await tx.get(gameRef);
    if (!doc.exists) {
      throw new HttpError(404, 'not_found', `No game with id ${gameId}`);
    }
    const stored = doc.data();
    if (stored.ownerUid !== uid) {
      throw new HttpError(403, 'forbidden', 'Only the owner can play this game');
    }
    if (stored.status !== 'active') {
      throw new HttpError(409, 'game_over', 'The game is over');
    }
    if (stored.version !== version) {
      throw new HttpError(409, 'stale_version', `Version ${version} is stale, the game is at ${stored.version}`);
    }
    const current = stored.players[stored.turnOrder[stored.currentTurn]];
    if (current.type !== turn) {
      throw new HttpError(409, 'not_your_turn', `It is not the ${turn}'s turn`);
    }

    const { ownerUid, version: _v, eventSeq, llmCalls, createdAt, updatedAt, ...state } = stored;
    // Randomness inside fn reruns if Firestore retries the callback; only the committed roll is seen (ARCHITECTURE §4).
    const result = fn(state);

    const game = {
      ...result.state,
      ownerUid,
      llmCalls,
      createdAt,
      version: stored.version + 1,
      eventSeq: eventSeq + result.events.length,
    };
    const eventDocs = result.events.map((e, i) => toEventDoc(e, eventSeq + i + 1, result.state));

    tx.set(gameRef, { ...game, updatedAt: FieldValue.serverTimestamp() });
    // Only an active game gets here, so the turn that ends it counts once, in the same commit as the move.
    if (result.state.status !== 'active') {
      tx.set(playerRef(ownerUid), finishedFields(result.state.status), { merge: true });
    }
    for (const event of eventDocs) {
      tx.set(gameRef.collection('events').doc(eventId(event.seq)), event);
    }
    // Server timestamps can't be read back inside a transaction, so they are left out of the return value.
    return {
      game: { id: gameId, ...game },
      events: eventDocs.map(({ createdAt: _c, ...event }) => event),
    };
  });
}

/**
 * Loads an event and, if it needs a new LLM line, reserves one call against the game's cap, in one
 * transaction (ARCHITECTURE §4.3, §5.2). Runs on finished games too: `gameOver` only exists on one.
 * Separate from runAction, which would reject a finished game and bump `version`. Reserving before
 * the LLM call, not after, is what stops two requests at once going past the cap.
 *
 * Steps:
 * 1. Same start as runAction: `gameRef`, then `getDb().runTransaction`, then `tx.get(gameRef)`.
 * 2. 404 'not_found' if there is no game, 403 'forbidden' if ownerUid ≠ uid. No status, version or
 *    turn checks.
 * 3. `tx.get` the event doc at `gameRef.collection('events').doc(eventId)`. 404 'not_found' if missing.
 *    Do this before step 5: a Firestore transaction must do all its reads before any write.
 * 4. `claimed` is true only when the event's `type` is in LLM_EVENTS, its `aiText` is null, and the
 *    game's `llmCalls` is below MAX_LLM_CALLS.
 * 5. If claimed, `tx.update(gameRef, { llmCalls: llmCalls + 1 })`. Only that field: `version` and
 *    `updatedAt` must not change, or the client's next roll would go stale.
 * 6. Return `{ event, state, claimed }`, where `event` is the event doc's data and `state` is the
 *    game doc's data.
 *
 * @param {string} gameId
 * @param {string} eventId zero-padded `seq`, already checked by the controller
 * @param {string} uid caller's uid from requireAuth
 * @returns {Promise<{ event: object, state: object, claimed: boolean }>}
 * @throws {HttpError} 404 / 403 as above
 */
export async function claimCommentary(gameId, eventId, uid) {
  const gameRef = getDb().collection('games').doc(gameId);

  return getDb().runTransaction(async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists) {
      throw new HttpError(404, 'not_found', `No game with id ${gameId}`);
    }
    if (gameDoc.data().ownerUid !== uid) {
      throw new HttpError(403, 'forbidden', 'Only the owner can request commentary');
    }
    // After the owner check, so a non-owner learns nothing about which events exist.
    const eventDoc = await tx.get(gameRef.collection('events').doc(eventId));
    if (!eventDoc.exists) {
      throw new HttpError(404, 'not_found', `No event with id ${eventId}`);
    }

    const state = gameDoc.data();
    const event = eventDoc.data();
    const claimed = LLM_EVENTS.has(event.type) && event.aiText === null && state.llmCalls < MAX_LLM_CALLS;
    if (claimed) {
      // Only llmCalls: version and updatedAt stay put so the player's next action isn't stale.
      tx.update(gameRef, { llmCalls: state.llmCalls + 1 });
    }

    return { event, state, claimed };
  });
}

/**
 * Saves `aiText` on an event, once (ARCHITECTURE §4.3 step 4). Two requests can both reach the LLM
 * for one event, so the first to save wins and the other gets the winner's text back.
 *
 * Steps:
 * 1. In one transaction, `tx.get` the event doc.
 * 2. If its `aiText` is not null, return that and write nothing.
 * 3. Otherwise `tx.update` only `aiText`, and return `text`.
 *
 * @param {string} gameId
 * @param {string} eventId
 * @param {string} text
 * @returns {Promise<string>} the saved text
 */
export async function saveCommentary(gameId, eventId, text) {
  const eventRef = getDb().collection('games').doc(gameId).collection('events').doc(eventId);

  return getDb().runTransaction(async (tx) => {
    const { aiText } = (await tx.get(eventRef)).data();
    // A request that got here first already saved its line; return that one so both agree.
    if (aiText !== null) {
      return aiText;
    }
    tx.update(eventRef, { aiText: text });
    return text;
  });
}

/** Engine event → stored event doc (ARCHITECTURE §2). */
function toEventDoc(event, seq, state) {
  const { type, round = 0, ...data } = event;
  return { seq, round, type, data, text: toText(event, state), aiText: null, createdAt: FieldValue.serverTimestamp() };
}

function eventId(seq) {
  return String(seq).padStart(6, '0');
}
