import { describe, it, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

// ARCHITECTURE §5.1: the rules deny every client request. Only the server (Admin SDK, which
// bypasses rules) touches Firestore. These tests use the client SDK, as a browser would.

const OWNER = 'rules-alice';
const GAME = 'games/rules-g1';
const EVENT = `${GAME}/events/000001`;
const PLAYER = `players/${OWNER}`;

let testEnv;

beforeAll(async () => {
  // Host and port come from FIRESTORE_EMULATOR_HOST, set by `firebase emulators:exec`.
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-geopolitics',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });

  // Seed real documents so every read is denied by the rules, not by a missing doc.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, GAME), { ownerUid: OWNER, version: 1 });
    await setDoc(doc(db, EVENT), { seq: 1, type: 'turnStart', text: 'Round 1.', aiText: null });
    await setDoc(doc(db, PLAYER), { gamesStarted: 1, wins: 0, losses: 0 });
  });
});

afterAll(async () => {
  // Delete only what this file seeded: clearFirestore() would wipe other files' data.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await deleteDoc(doc(db, EVENT));
    await deleteDoc(doc(db, GAME));
    await deleteDoc(doc(db, PLAYER));
  });
  await testEnv.cleanup();
});

// The signed-in client is the game's owner and the player doc's own uid: even they are denied.
describe.each([
  ['a logged-out client', () => testEnv.unauthenticatedContext()],
  ['the signed-in owner', () => testEnv.authenticatedContext(OWNER)],
])('Firestore rules for %s', (_label, context) => {
  const db = () => context().firestore();

  describe('games', () => {
    it('denies reading a game', async () => {
      await assertFails(getDoc(doc(db(), GAME)));
    });

    it('denies listing games', async () => {
      await assertFails(getDocs(collection(db(), 'games')));
    });

    it('denies querying games by owner', async () => {
      await assertFails(getDocs(query(collection(db(), 'games'), where('ownerUid', '==', OWNER))));
    });

    it('denies creating a game', async () => {
      await assertFails(setDoc(doc(db(), 'games/rules-new'), { ownerUid: OWNER, version: 1 }));
    });

    it('denies updating a game', async () => {
      await assertFails(updateDoc(doc(db(), GAME), { version: 2 }));
    });

    it('denies deleting a game', async () => {
      await assertFails(deleteDoc(doc(db(), GAME)));
    });
  });

  describe('events', () => {
    it('denies reading an event', async () => {
      await assertFails(getDoc(doc(db(), EVENT)));
    });

    it('denies listing events', async () => {
      await assertFails(getDocs(collection(db(), `${GAME}/events`)));
    });

    it('denies creating an event', async () => {
      await assertFails(setDoc(doc(db(), `${GAME}/events/000002`), { seq: 2, type: 'roll' }));
    });

    it('denies writing aiText on an event', async () => {
      await assertFails(updateDoc(doc(db(), EVENT), { aiText: 'A forged line.' }));
    });

    it('denies deleting an event', async () => {
      await assertFails(deleteDoc(doc(db(), EVENT)));
    });
  });

  describe('players', () => {
    it('denies reading your own player stats', async () => {
      await assertFails(getDoc(doc(db(), PLAYER)));
    });

    it('denies creating player stats', async () => {
      await assertFails(setDoc(doc(db(), 'players/rules-new'), { wins: 99 }));
    });

    it('denies updating your own player stats', async () => {
      await assertFails(updateDoc(doc(db(), PLAYER), { wins: 99 }));
    });

    it('denies deleting your own player stats', async () => {
      await assertFails(deleteDoc(doc(db(), PLAYER)));
    });
  });
});
