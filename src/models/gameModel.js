import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase.js';
import { HttpError } from '../middleware/errorHandler.js';

/**
 * Stores a new game and its first events in one batch (ARCHITECTURE §2).
 *
 * `games/{auto id}` = the engine state, plus
 *   `ownerUid`, `version: 1`, `eventSeq` (= number of events), `llmCalls: 0`,
 *   `createdAt` and `updatedAt` (server timestamps).
 * `games/{id}/events/{000001, 000002, …}` = one doc per engine event:
 *   `{ seq, round, type, data, text: '', aiText: null, createdAt }`
 *   where `type` is the event's type and `data` is every other field of the event.
 *   `text` stays '' until S16 (commentary.toText) exists.
 *
 * @param {string} ownerUid
 * @param {object} state engine state from `createGame`
 * @param {{ type: string, round?: number, [key: string]: unknown }[]} events engine events
 * @returns {Promise<string>} the new game id
 */
export async function createGame(ownerUid, state, events) {
  const gameDoc = { ...state, ownerUid, version: 1, eventSeq: events.length, llmCalls: 0 };
  const eventDocs = events.map((e, i) => toEventDoc(e, i + 1));

  const batch = getDb().batch();
  const gameRef = getDb().collection('games').doc();
  batch.set(gameRef, { ...gameDoc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  for (const event of eventDocs) {
    batch.set(gameRef.collection('events').doc(eventId(event.seq)), event);
  }
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
    const eventDocs = result.events.map((e, i) => toEventDoc(e, eventSeq + i + 1));

    tx.set(gameRef, { ...game, updatedAt: FieldValue.serverTimestamp() });
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

/** Engine event → stored event doc (ARCHITECTURE §2). `text` stays '' until S16. */
function toEventDoc(event, seq) {
  const { type, round = 0, ...data } = event;
  return { seq, round, type, data, text: '', aiText: null, createdAt: FieldValue.serverTimestamp() };
}

function eventId(seq) {
  return String(seq).padStart(6, '0');
}
