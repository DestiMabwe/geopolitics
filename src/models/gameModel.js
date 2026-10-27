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
  const eventDocs = events.map((e, i) => ({
    seq: i + 1,
    round: e.round ?? 0,
    type: e.type,
    data: Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'type' && k !== 'round')),
    text: '',
    aiText: null,
    createdAt: FieldValue.serverTimestamp(),
  }));

  const batch = getDb().batch();
  const gameRef = getDb().collection('games').doc();
  batch.set(gameRef, { ...gameDoc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  for (const event of eventDocs) {
    const eventId = String(event.seq).padStart(6, '0');
    batch.set(gameRef.collection('events').doc(eventId), event);
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
