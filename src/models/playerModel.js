import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase.js';

/** `players/{uid}`: one stats doc per user (ARCHITECTURE §2). Only the server ever writes it. */
export const playerRef = (uid) => getDb().collection('players').doc(uid);

// Every write sets all three counters, so a doc never has a missing one. `increment` needs no read,
// so the write can sit inside the game's own transaction or batch and commit with it.
const bump = (started, won, lost) => ({
  gamesStarted: FieldValue.increment(started),
  wins: FieldValue.increment(won),
  losses: FieldValue.increment(lost),
  lastPlayedAt: FieldValue.serverTimestamp(),
});

/** Fields to merge into the owner's doc when a game is created. */
export const startedFields = () => bump(1, 0, 0);

/** Fields to merge into the owner's doc when a game ends as `won` or `lost` (GAME_RULES §9). */
export const finishedFields = (status) => bump(0, status === 'won' ? 1 : 0, status === 'lost' ? 1 : 0);

/**
 * @param {string} uid
 * @returns {Promise<{ gamesStarted: number, wins: number, losses: number, lastPlayedAt: object | null }>}
 *   zeros for a player with no games yet
 */
export async function getStats(uid) {
  const doc = await playerRef(uid).get();
  const { gamesStarted = 0, wins = 0, losses = 0, lastPlayedAt = null } = doc.data() ?? {};
  return { gamesStarted, wins, losses, lastPlayedAt };
}
