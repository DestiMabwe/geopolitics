import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/config/firebase.js';
import * as gameModel from '../../src/models/gameModel.js';
import { makeState, mockLlm } from '../helpers.js';
import { signUp } from './authHelper.js';

// The SDK is mocked, so no test can reach the real API.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));

const app = createApp();
const turnStart = { type: 'turnStart', player: 'human', round: 1 };
const roll = {
  type: 'roll', player: 'human', from: 'AAA', to: 'BBB',
  attackerDice: [6, 5], defenderDice: [3, 1],
  attackerLosses: 0, defenderLosses: 2, attackerLeft: 4, defenderLeft: 1,
};

// ARCHITECTURE §5.2: per player, per game, per minute.
const COMMENTARY_LIMIT = 20;
const ATTACK_LIMIT = 60;

// A valid body for each action route, so the only thing wrong in a test is the field it adds.
const ACTIONS = {
  attack: { version: 1, from: 'AAA', to: 'BBB' },
  'attack/roll': { version: 1 },
  'attack/stop': { version: 1 },
  'attack/occupy': { version: 1, count: 1, placements: { BBB: 2 } },
  skip: { version: 1 },
  reinforce: { version: 1, placements: { AAA: 1 } },
  transfer: { version: 1, from: 'AAA', to: 'EEE', count: 1 },
  'npc-turn': { version: 1 },
};
const CLIENT_SENT = ['attackerDice', 'defenderDice', 'soldiers', 'outcome'];

let alice;
let bob;

beforeAll(async () => {
  alice = await signUp();
  bob = await signUp();
});

beforeEach(() => {
  create.mockReset();
  create.mockImplementation(mockLlm('A line of commentary.').messages.create);
});

function seed(owner, events = [turnStart]) {
  return gameModel.createGame(owner.uid, makeState(), events);
}

function post(path, user, body) {
  const req = request(app).post(`/api/games/${path}`);
  if (user) req.set('Authorization', `Bearer ${user.idToken}`);
  return req.send(body);
}

async function stored(id) {
  return (await getDb().collection('games').doc(id).get()).data();
}

describe('input validation (ARCHITECTURE §5.2)', () => {
  describe.each(Object.keys(ACTIONS))('POST /games/:id/%s', (route) => {
    it.each(CLIENT_SENT)('returns 400 naming %s, and writes nothing', async (key) => {
      const id = await seed(alice);
      const before = await stored(id);
      const res = await post(`${id}/${route}`, alice, { ...ACTIONS[route], [key]: 3 });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(key);
      const after = await stored(id);
      expect(after.version).toBe(before.version);
      expect(after.eventSeq).toBe(before.eventSeq);
    });
  });

  it('names the missing field when the body is incomplete', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/transfer`, alice, { version: 1, from: 'AAA', to: 'EEE' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('count');
  });

  it('answers every failure in one shape: { error: { code, message } }', async () => {
    const id = await seed(alice);
    const failures = [
      [await post(`${id}/skip`, null, { version: 1 }), 401],
      [await post(`${id}/skip`, alice, { version: 'x' }), 400],
      [await post(`${id}/skip`, bob, { version: 1 }), 403],
      [await post('does-not-exist/skip', alice, { version: 1 }), 404],
    ];
    for (const [res, status] of failures) {
      expect(res.status).toBe(status);
      expect(Object.keys(res.body)).toEqual(['error']);
      expect(res.body.error).toEqual({ code: expect.any(String), message: expect.any(String) });
    }
  });
});

describe('rate limiting (ARCHITECTURE §5.2)', () => {
  const comment = (id, user = alice, eventId = '000001') => post(`${id}/events/${eventId}/commentary`, user);

  it('returns 429 after a burst of commentary requests', { timeout: 60000 }, async () => {
    const id = await seed(alice, [roll]);
    for (let i = 0; i < COMMENTARY_LIMIT; i++) {
      expect((await comment(id)).status).toBe(200);
    }
    const res = await comment(id);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('too_many_requests');
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('counts each game separately', { timeout: 60000 }, async () => {
    const first = await seed(alice, [roll]);
    const second = await seed(alice, [roll]);
    for (let i = 0; i < COMMENTARY_LIMIT + 1; i++) await comment(first);
    expect((await comment(first)).status).toBe(429);
    expect((await comment(second)).status).toBe(200);
  });

  it('counts each player separately', { timeout: 60000 }, async () => {
    const id = await seed(alice, [roll]);
    for (let i = 0; i < COMMENTARY_LIMIT + 1; i++) await comment(id);
    // Bob is refused for owning nothing, not for being rate limited.
    expect((await comment(id, bob)).status).toBe(403);
  });

  it('returns 429 after a burst of attack requests, shared across the attack routes', { timeout: 60000 }, async () => {
    const id = await seed(alice);
    for (let i = 0; i < ATTACK_LIMIT; i++) {
      const route = i % 2 === 0 ? 'attack/roll' : 'attack/stop';
      expect((await post(`${id}/${route}`, alice, ACTIONS[route])).status).not.toBe(429);
    }
    const res = await post(`${id}/attack`, alice, ACTIONS.attack);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('too_many_requests');
  });

  it('does not limit reading a game or its events', { timeout: 60000 }, async () => {
    const id = await seed(alice);
    for (let i = 0; i < ATTACK_LIMIT + 10; i++) {
      expect((await request(app).get(`/api/games/${id}`)).status).toBe(200);
      expect((await request(app).get(`/api/games/${id}/events`)).status).toBe(200);
    }
  });

  it('does not limit the other action routes', { timeout: 60000 }, async () => {
    const id = await seed(alice);
    for (let i = 0; i < ATTACK_LIMIT + 5; i++) {
      expect((await post(`${id}/skip`, alice, ACTIONS.skip)).status).not.toBe(429);
    }
  });
});
