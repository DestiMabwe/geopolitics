import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../../src/config/firebase.js';
import * as gameModel from '../../src/models/gameModel.js';
import { HttpError } from '../../src/middleware/errorHandler.js';
import { IllegalMoveError, WrongPhaseError } from '../../src/game/errors.js';
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

describe('gameModel.runAction (ARCHITECTURE §4.1)', () => {
  const nextEvents = [
    { type: 'turnStart', player: 'npc:BBB', round: 1 },
    { type: 'turnStart', player: 'npc:CCC', round: 1 },
  ];
  // Stands in for an engine call: changes one field and returns two events.
  const engineStep = () => vi.fn((state) => ({ state: { ...state, round: 2 }, events: nextEvents }));
  const noChange = (state) => ({ state, events: [] });

  async function seed(overrides = {}) {
    const uid = uniqueUid();
    const id = await gameModel.createGame(uid, makeState(overrides), [turnStart]);
    return { uid, id };
  }

  async function snapshot(id) {
    const game = (await games().doc(id).get()).data();
    const eventCount = (await games().doc(id).collection('events').get()).size;
    return { version: game.version, eventSeq: game.eventSeq, round: game.round, eventCount };
  }

  async function expectRejected(promise, status, code) {
    const err = await promise.catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
  }

  describe('on success', () => {
    it('calls fn with the stored state, without ownerUid or version fields', async () => {
      const { uid, id } = await seed();
      const fn = engineStep();

      await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, fn);

      expect(fn).toHaveBeenCalled();
      const state = fn.mock.calls[0][0];
      expect(state).toMatchObject(makeState());
      for (const key of ['ownerUid', 'version', 'eventSeq', 'llmCalls', 'createdAt', 'updatedAt']) {
        expect(state).not.toHaveProperty(key);
      }
    });

    it('saves the new state and bumps version by 1', async () => {
      const { uid, id } = await seed();
      await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, engineStep());

      const stored = (await games().doc(id).get()).data();
      expect(stored.round).toBe(2);
      expect(stored.version).toBe(2);
    });

    it('writes the events with seq continuing from eventSeq', async () => {
      const { uid, id } = await seed();
      await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, engineStep());

      const snap = await games().doc(id).collection('events').orderBy('seq').get();
      expect(snap.docs.map((d) => d.id)).toEqual(['000001', '000002', '000003']);
      expect(snap.docs[1].data()).toMatchObject({
        seq: 2, round: 1, type: 'turnStart', data: { player: 'npc:BBB' }, text: '', aiText: null,
      });
      expect(snap.docs[1].data().data).not.toHaveProperty('type');
      expect(snap.docs[2].data().createdAt).toBeInstanceOf(Timestamp);
      expect((await games().doc(id).get()).data().eventSeq).toBe(3);
    });

    it('returns { game, events } with the new version and the written events', async () => {
      const { uid, id } = await seed();
      const result = await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, engineStep());

      expect(result.game).toMatchObject({ id, ownerUid: uid, version: 2, eventSeq: 3, round: 2 });
      expect(result.events.map((e) => e.seq)).toEqual([2, 3]);
      expect(result.events[0]).toMatchObject({ type: 'turnStart', data: { player: 'npc:BBB' } });
    });

    it('bumps version even when fn returns no events', async () => {
      const { uid, id } = await seed();
      await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, noChange);

      expect(await snapshot(id)).toMatchObject({ version: 2, eventSeq: 1, eventCount: 1 });
    });

    it('keeps ownerUid, llmCalls and createdAt', async () => {
      const { uid, id } = await seed();
      const before = (await games().doc(id).get()).data();
      await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, engineStep());

      const after = (await games().doc(id).get()).data();
      expect(after.ownerUid).toBe(uid);
      expect(after.llmCalls).toBe(0);
      expect(after.createdAt.isEqual(before.createdAt)).toBe(true);
      expect(after.updatedAt).toBeInstanceOf(Timestamp);
    });

    it("runs fn for turn 'npc' on an NPC's turn", async () => {
      const { uid, id } = await seed({ currentTurn: 1 }); // npc:BBB
      const fn = engineStep();

      await gameModel.runAction(id, uid, { version: 1, turn: 'npc' }, fn);
      expect(fn).toHaveBeenCalled();
    });
  });

  // Each rejection also checks that fn never ran and nothing was written.
  describe('when a check fails', () => {
    it('throws 404 for an unknown game', async () => {
      const fn = engineStep();
      await expectRejected(
        gameModel.runAction('does-not-exist', uniqueUid(), { version: 1, turn: 'human' }, fn), 404, 'not_found');
      expect(fn).not.toHaveBeenCalled();
    });

    it('throws 403 when the caller is not the owner', async () => {
      const { id } = await seed();
      const before = await snapshot(id);
      const fn = engineStep();

      await expectRejected(gameModel.runAction(id, uniqueUid(), { version: 1, turn: 'human' }, fn), 403, 'forbidden');
      expect(fn).not.toHaveBeenCalled();
      expect(await snapshot(id)).toEqual(before);
    });

    it('throws 409 stale_version when the version is old', async () => {
      const { uid, id } = await seed();
      await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, noChange);
      const before = await snapshot(id);
      const fn = engineStep();

      await expectRejected(gameModel.runAction(id, uid, { version: 1, turn: 'human' }, fn), 409, 'stale_version');
      expect(fn).not.toHaveBeenCalled();
      expect(await snapshot(id)).toEqual(before);
    });

    it('throws 409 stale_version when the version is ahead', async () => {
      const { uid, id } = await seed();
      const before = await snapshot(id);
      const fn = engineStep();

      await expectRejected(gameModel.runAction(id, uid, { version: 5, turn: 'human' }, fn), 409, 'stale_version');
      expect(fn).not.toHaveBeenCalled();
      expect(await snapshot(id)).toEqual(before);
    });

    it('throws 409 game_over when the game is not active', async () => {
      const { uid, id } = await seed({ status: 'won', winner: 'human' });
      const before = await snapshot(id);
      const fn = engineStep();

      await expectRejected(gameModel.runAction(id, uid, { version: 1, turn: 'human' }, fn), 409, 'game_over');
      expect(fn).not.toHaveBeenCalled();
      expect(await snapshot(id)).toEqual(before);
    });

    it("throws 409 not_your_turn for turn 'human' on an NPC's turn", async () => {
      const { uid, id } = await seed({ currentTurn: 1 }); // npc:BBB
      const before = await snapshot(id);
      const fn = engineStep();

      await expectRejected(gameModel.runAction(id, uid, { version: 1, turn: 'human' }, fn), 409, 'not_your_turn');
      expect(fn).not.toHaveBeenCalled();
      expect(await snapshot(id)).toEqual(before);
    });

    it("throws 409 not_your_turn for turn 'npc' on the human's turn", async () => {
      const { uid, id } = await seed(); // currentTurn 0 = human
      const before = await snapshot(id);
      const fn = engineStep();

      await expectRejected(gameModel.runAction(id, uid, { version: 1, turn: 'npc' }, fn), 409, 'not_your_turn');
      expect(fn).not.toHaveBeenCalled();
      expect(await snapshot(id)).toEqual(before);
    });
  });

  describe('when the engine throws', () => {
    it('rethrows IllegalMoveError from fn and writes nothing', async () => {
      const { uid, id } = await seed();
      const before = await snapshot(id);
      const fn = () => { throw new IllegalMoveError('not a neighbour'); };

      const err = await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, fn).catch((e) => e);
      expect(err).toBeInstanceOf(IllegalMoveError);
      expect(await snapshot(id)).toEqual(before);
    });

    it('rethrows WrongPhaseError from fn and writes nothing', async () => {
      const { uid, id } = await seed();
      const before = await snapshot(id);
      const fn = () => { throw new WrongPhaseError('no attack in progress'); };

      const err = await gameModel.runAction(id, uid, { version: 1, turn: 'human' }, fn).catch((e) => e);
      expect(err).toBeInstanceOf(WrongPhaseError);
      expect(await snapshot(id)).toEqual(before);
    });
  });

  describe('under contention', () => {
    it('lets only one of two concurrent actions with the same version succeed', async () => {
      const { uid, id } = await seed();
      const results = await Promise.allSettled([
        gameModel.runAction(id, uid, { version: 1, turn: 'human' }, engineStep()),
        gameModel.runAction(id, uid, { version: 1, turn: 'human' }, engineStep()),
      ]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(HttpError);
      expect(rejected[0].reason.code).toBe('stale_version');
      expect(await snapshot(id)).toMatchObject({ version: 2, eventSeq: 3, eventCount: 3 });
    });
  });
});
