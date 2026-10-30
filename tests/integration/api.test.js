import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/config/firebase.js';
import { signUp } from './authHelper.js';

const app = createApp();

// ARCHITECTURE §3: `ownerUid` is never returned, to anyone. Every successful body is checked.
function expectNoOwnerUid(res) {
  expect(JSON.stringify(res.body)).not.toContain('ownerUid');
}

function createAs(user, countryCode = 'ZAF') {
  return request(app).post('/api/games').set('Authorization', `Bearer ${user.idToken}`).send({ countryCode });
}

let alice;
let bob;

beforeAll(async () => {
  alice = await signUp();
  bob = await signUp();
});

describe('POST /api/games', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/games').send({ countryCode: 'ZAF' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .post('/api/games')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ countryCode: 'ZAF' });
    expect(res.status).toBe(401);
  });

  it('returns 201 with a valid starting state', async () => {
    const res = await createAs(alice, 'ZAF');

    expect(res.status).toBe(201);
    expectNoOwnerUid(res);
    const { game, events } = res.body;
    expect(typeof game.id).toBe('string');
    expect(game.isOwner).toBe(true);
    expect(game.status).toBe('active');
    expect(game.round).toBe(1);
    expect(game.version).toBe(1);
    expect(game.phase).toBe('manoeuvre');
    expect(Object.keys(game.countries)).toHaveLength(10);
    expect(game.countries.ZAF.owner).toBe('human');
    expect(game.turnOrder).toHaveLength(10);
    expect(game.attack).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('turnStart');
  });

  it('stores the game and its turnStart event in Firestore', async () => {
    const res = await createAs(alice, 'KEN');
    const ref = getDb().collection('games').doc(res.body.game.id);

    const stored = (await ref.get()).data();
    expect(stored.ownerUid).toBe(alice.uid);
    expect(stored.version).toBe(1);
    expect(stored.eventSeq).toBe(1);
    expect(stored.llmCalls).toBe(0);
    expect(stored.countries.KEN.owner).toBe('human');
    expect(stored.createdAt).toBeDefined();
    expect(stored.updatedAt).toBeDefined();

    const event = (await ref.collection('events').doc('000001').get()).data();
    expect(event).toMatchObject({
      seq: 1,
      round: 1,
      type: 'turnStart',
      data: { player: stored.turnOrder[0] },
      text: '',
      aiText: null,
    });
    expect(event.createdAt).toBeDefined();
  });

  it('returns 422 for an unknown country', async () => {
    const res = await createAs(alice, 'XXX');
    expect(res.status).toBe(422);
  });

  it('returns 400 when countryCode is missing', async () => {
    const res = await request(app).post('/api/games').set('Authorization', `Bearer ${alice.idToken}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/games', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(401);
  });

  it("returns only the caller's games, newest first", async () => {
    const carol = await signUp();
    const first = await createAs(carol, 'ZAF');
    const second = await createAs(carol, 'KEN');
    await createAs(bob, 'ZAF');

    const res = await request(app).get('/api/games').set('Authorization', `Bearer ${carol.idToken}`);

    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    expect(res.body.games.map((g) => g.id)).toEqual([second.body.game.id, first.body.game.id]);
    expect(res.body.games.every((g) => g.isOwner === true)).toBe(true);
  });

  it('sends createdAt and updatedAt as ISO strings', async () => {
    const dave = await signUp();
    await createAs(dave, 'ZAF');
    const res = await request(app).get('/api/games').set('Authorization', `Bearer ${dave.idToken}`);
    const [game] = res.body.games;
    for (const field of ['createdAt', 'updatedAt']) {
      expect(game[field]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });
});

describe('GET /api/games/:id (public)', () => {
  let gameId;

  beforeAll(async () => {
    gameId = (await createAs(alice)).body.game.id;
  });

  it('works without a token, with isOwner false', async () => {
    const res = await request(app).get(`/api/games/${gameId}`);
    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    expect(res.body.game.id).toBe(gameId);
    expect(res.body.game.isOwner).toBe(false);
    expect(Object.keys(res.body.game.countries)).toHaveLength(10);
  });

  it("sets isOwner true for the owner's token", async () => {
    const res = await request(app).get(`/api/games/${gameId}`).set('Authorization', `Bearer ${alice.idToken}`);
    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    expect(res.body.game.isOwner).toBe(true);
  });

  it("sets isOwner false for another user's token", async () => {
    const res = await request(app).get(`/api/games/${gameId}`).set('Authorization', `Bearer ${bob.idToken}`);
    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    expect(res.body.game.isOwner).toBe(false);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/games/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/games/:id/events (public)', () => {
  let gameId;

  beforeAll(async () => {
    gameId = (await createAs(alice)).body.game.id;
    // Two later events written straight to Firestore, so ordering and `after` have something to work on.
    const events = getDb().collection('games').doc(gameId).collection('events');
    await events.doc('000003').set({ seq: 3, round: 1, type: 'turnStart', data: {}, text: '', aiText: null });
    await events.doc('000002').set({ seq: 2, round: 1, type: 'turnStart', data: {}, text: '', aiText: null });
  });

  it('works without a token', async () => {
    const res = await request(app).get(`/api/games/${gameId}/events`);
    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    expect(res.body.events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('returns only events after the given seq, ascending', async () => {
    const res = await request(app).get(`/api/games/${gameId}/events?after=1`);
    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => e.seq)).toEqual([2, 3]);
  });

  it('returns 400 for a bad after value', async () => {
    for (const after of ['abc', '-1', '1.5']) {
      const res = await request(app).get(`/api/games/${gameId}/events?after=${after}`);
      expect(res.status, `after=${after}`).toBe(400);
    }
  });

  it('returns 404 for an unknown game', async () => {
    const res = await request(app).get('/api/games/does-not-exist/events');
    expect(res.status).toBe(404);
  });
});
