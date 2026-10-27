import { describe, it, expect, beforeAll } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../../src/config/firebase.js';
import * as gameModel from '../../src/models/gameModel.js';
import { HttpError } from '../../src/middleware/errorHandler.js';
import { makeState } from '../helpers.js';

// Calls the model directly against the emulator, so it can go green before the controller exists.

const games = () => getDb().collection('games');
const turnStart = { type: 'turnStart', player: 'human', round: 1 };

let counter = 0;
const uniqueUid = () => `uid-${Date.now()}-${++counter}`;

describe('gameModel.createGame (ARCHITECTURE §2)', () => {
  it('returns the new game id as a string', async () => {
    const id = await gameModel.createGame(uniqueUid(), makeState(), [turnStart]);
    expect(typeof id).toBe('string');
    expect((await games().doc(id).get()).exists).toBe(true);
  });

  it('stores the engine state with ownerUid, version 1, eventSeq and llmCalls 0', async () => {
    const uid = uniqueUid();
    const state = makeState();
    const id = await gameModel.createGame(uid, state, [turnStart]);

    const stored = (await games().doc(id).get()).data();
    expect(stored).toMatchObject({ ...state, ownerUid: uid, version: 1, eventSeq: 1, llmCalls: 0 });
  });

  it('sets createdAt and updatedAt as server timestamps', async () => {
    const id = await gameModel.createGame(uniqueUid(), makeState(), [turnStart]);
    const stored = (await games().doc(id).get()).data();
    expect(stored.createdAt).toBeInstanceOf(Timestamp);
    expect(stored.updatedAt).toBeInstanceOf(Timestamp);
  });

  it('sets eventSeq to the number of events', async () => {
    const events = [turnStart, { type: 'turnStart', player: 'npc:BBB', round: 1 }];
    const id = await gameModel.createGame(uniqueUid(), makeState(), events);
    expect((await games().doc(id).get()).data().eventSeq).toBe(2);
  });

  it('writes one event doc per event with zero-padded ids from 000001', async () => {
    const events = [turnStart, { type: 'turnStart', player: 'npc:BBB', round: 1 }];
    const id = await gameModel.createGame(uniqueUid(), makeState(), events);

    const snap = await games().doc(id).collection('events').get();
    expect(snap.docs.map((d) => d.id)).toEqual(['000001', '000002']);
    expect(snap.docs.map((d) => d.data().seq)).toEqual([1, 2]);
  });

  it('stores each event as { seq, round, type, data, text, aiText, createdAt }', async () => {
    const id = await gameModel.createGame(uniqueUid(), makeState(), [turnStart]);

    const event = (await games().doc(id).collection('events').doc('000001').get()).data();
    expect(event).toMatchObject({ seq: 1, round: 1, type: 'turnStart', text: '', aiText: null });
    expect(event.data).toMatchObject({ player: 'human' });
    expect(event.data).not.toHaveProperty('type');
    expect(event.createdAt).toBeInstanceOf(Timestamp);
  });

  it('does not mutate the state or events it is given', async () => {
    const state = makeState();
    const events = [{ ...turnStart }];
    const stateCopy = structuredClone(state);
    const eventsCopy = structuredClone(events);

    await gameModel.createGame(uniqueUid(), state, events);

    expect(state).toEqual(stateCopy);
    expect(events).toEqual(eventsCopy);
  });
});

describe('gameModel.listGamesByOwner', () => {
  it("returns only that owner's games, newest first, each with its id", async () => {
    const uid = uniqueUid();
    const first = await gameModel.createGame(uid, makeState(), [turnStart]);
    const second = await gameModel.createGame(uid, makeState(), [turnStart]);
    await gameModel.createGame(uniqueUid(), makeState(), [turnStart]);

    const list = await gameModel.listGamesByOwner(uid);
    expect(list.map((g) => g.id)).toEqual([second, first]);
    expect(list.every((g) => g.ownerUid === uid)).toBe(true);
  });

  it('returns an empty list for an owner with no games', async () => {
    expect(await gameModel.listGamesByOwner(uniqueUid())).toEqual([]);
  });
});

describe('gameModel.getGame', () => {
  it('returns the stored game with its id (ownerUid included, the controller strips it)', async () => {
    const uid = uniqueUid();
    const id = await gameModel.createGame(uid, makeState(), [turnStart]);

    const game = await gameModel.getGame(id);
    expect(game).toMatchObject({ id, ownerUid: uid, version: 1, round: 1 });
  });

  it('throws a 404 HttpError for an unknown id', async () => {
    const err = await gameModel.getGame('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(404);
  });
});

describe('gameModel.listEvents', () => {
  let id;

  beforeAll(async () => {
    id = await gameModel.createGame(uniqueUid(), makeState(), [turnStart]);
    // 204 more events written straight to Firestore (seq 2…205), out of order, to test sorting and the cap.
    const batch = getDb().batch();
    for (let seq = 205; seq >= 2; seq--) {
      const ref = games().doc(id).collection('events').doc(String(seq).padStart(6, '0'));
      batch.set(ref, { seq, round: 1, type: 'turnStart', data: {}, text: '', aiText: null });
    }
    await batch.commit();
  });

  it('returns events after the given seq in ascending order', async () => {
    const events = await gameModel.listEvents(id, 200);
    expect(events.map((e) => e.seq)).toEqual([201, 202, 203, 204, 205]);
  });

  it('returns at most 200 events, starting from the oldest', async () => {
    const events = await gameModel.listEvents(id, 0);
    expect(events).toHaveLength(200);
    expect(events[0].seq).toBe(1);
    expect(events[199].seq).toBe(200);
  });

  it('returns an empty list when nothing is newer', async () => {
    expect(await gameModel.listEvents(id, 205)).toEqual([]);
  });

  it('throws a 404 HttpError for an unknown game', async () => {
    const err = await gameModel.listEvents('does-not-exist', 0).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(404);
  });
});
