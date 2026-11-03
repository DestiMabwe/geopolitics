import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/config/firebase.js';
import * as gameModel from '../../src/models/gameModel.js';
import { makeState, mockLlm } from '../helpers.js';
import { signUp } from './authHelper.js';

// The SDK is mocked, not the service, so the real fallback code runs.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));

const app = createApp();
const LLM_LINE = 'A line of commentary.';

const attack = { player: 'human', from: 'AAA', to: 'BBB' };
const roll = {
  type: 'roll', ...attack,
  attackerDice: [6, 5], defenderDice: [3, 1],
  attackerLosses: 0, defenderLosses: 2,
  attackerLeft: 4, defenderLeft: 1,
};
const LLM_EVENTS = {
  roll,
  conquest: { type: 'conquest', ...attack, previousOwner: 'npc:BBB', bonus: 2 },
  elimination: { type: 'elimination', player: 'npc:BBB', by: 'human' },
  gameOver: { type: 'gameOver', status: 'won', winner: 'human' },
};
const OTHER_EVENTS = {
  turnStart: { type: 'turnStart', player: 'human', round: 1 },
  reinforce: { type: 'reinforce', player: 'human', amount: 2, placements: { AAA: 2 } },
  transfer: { type: 'transfer', player: 'human', from: 'AAA', to: 'EEE', count: 1 },
  attackStart: { type: 'attackStart', ...attack },
  occupy: { type: 'occupy', ...attack, count: 1, placements: { BBB: 2 } },
  attackFailed: { type: 'attackFailed', ...attack },
  attackStopped: { type: 'attackStopped', ...attack },
  skip: { type: 'skip', player: 'human' },
};

let alice;
let bob;

beforeAll(async () => {
  alice = await signUp();
  bob = await signUp();
});

beforeEach(() => {
  create.mockReset();
  llmReplies(LLM_LINE);
});

function llmReplies(reply) {
  create.mockImplementation(mockLlm(reply).messages.create);
}

/** A game owned by `owner` holding `events`, as 000001, 000002, … */
function seed(owner, events = [roll], overrides = {}) {
  return gameModel.createGame(owner.uid, makeState(overrides), events);
}

function post(id, eventId, user, body) {
  const req = request(app).post(`/api/games/${id}/events/${eventId}/commentary`);
  if (user) req.set('Authorization', `Bearer ${user.idToken}`);
  return req.send(body);
}

const gameRef = (id) => getDb().collection('games').doc(id);

async function storedGame(id) {
  return (await gameRef(id).get()).data();
}

async function storedEvent(id, eventId = '000001') {
  return (await gameRef(id).collection('events').doc(eventId).get()).data();
}

describe('POST /api/games/:id/events/:eventId/commentary (ARCHITECTURE §3, §4.3)', () => {
  describe('access', () => {
    it('returns 401 without a token', async () => {
      const id = await seed(alice);
      expect((await post(id, '000001', null)).status).toBe(401);
    });

    it('returns 403 for a user who does not own the game, and calls no LLM', async () => {
      const id = await seed(alice);
      expect((await post(id, '000001', bob)).status).toBe(403);
      expect(create).not.toHaveBeenCalled();
      expect((await storedGame(id)).llmCalls).toBe(0);
      expect((await storedEvent(id)).aiText).toBeNull();
    });

    it('returns 404 for an unknown game', async () => {
      expect((await post('does-not-exist', '000001', alice)).status).toBe(404);
    });

    it('returns 404 for an unknown event', async () => {
      const id = await seed(alice);
      expect((await post(id, '000099', alice)).status).toBe(404);
    });

    it.each([['abc'], ['1'], ['0000001'], ['__bad__']])('returns 404 for the malformed event id %s', async (eventId) => {
      const id = await seed(alice);
      expect((await post(id, eventId, alice)).status).toBe(404);
    });

    it.each([['aiText'], ['text'], ['version']])('returns 400 when the body has %s, and writes nothing', async (key) => {
      const id = await seed(alice);
      const res = await post(id, '000001', alice, { [key]: 'Made up by the client' });
      expect(res.status).toBe(400);
      expect(create).not.toHaveBeenCalled();
      expect((await storedEvent(id)).aiText).toBeNull();
    });
  });

  describe('commentary', () => {
    it.each(Object.keys(LLM_EVENTS))('returns the LLM line for a %s event and saves it as aiText', async (type) => {
      const id = await seed(alice, [LLM_EVENTS[type]]);
      const res = await post(id, '000001', alice);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text: LLM_LINE });
      expect((await storedEvent(id)).aiText).toBe(LLM_LINE);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('sends the event\'s own fields, with no round, seq or text', async () => {
      const id = await seed(alice);
      await post(id, '000001', alice);
      const sent = JSON.parse(create.mock.calls[0][0].messages[0].content);
      expect(sent).toEqual({ ...roll, player: 'Country A', from: 'Country A', to: 'Country B' });
    });

    it('leaves the template text unchanged', async () => {
      const id = await seed(alice);
      const before = await storedEvent(id);
      await post(id, '000001', alice);
      expect((await storedEvent(id)).text).toBe(before.text);
    });

    it('adds 1 to llmCalls', async () => {
      const id = await seed(alice);
      await post(id, '000001', alice);
      expect((await storedGame(id)).llmCalls).toBe(1);
    });

    it('does not change version or updatedAt', async () => {
      const id = await seed(alice);
      const before = await storedGame(id);
      await post(id, '000001', alice);
      const after = await storedGame(id);
      expect(after.version).toBe(before.version);
      expect(after.updatedAt.isEqual(before.updatedAt)).toBe(true);
    });

    it('works on a finished game', async () => {
      const id = await seed(alice, [LLM_EVENTS.gameOver], { status: 'won', winner: 'human' });
      const res = await post(id, '000001', alice);
      expect(res.status).toBe(200);
      expect(res.body.text).toBe(LLM_LINE);
    });

    it('finds the right event among several', async () => {
      const id = await seed(alice, [OTHER_EVENTS.attackStart, roll, LLM_EVENTS.conquest]);
      await post(id, '000003', alice);
      expect((await storedEvent(id, '000002')).aiText).toBeNull();
      expect((await storedEvent(id, '000003')).aiText).toBe(LLM_LINE);
    });
  });

  describe('idempotent', () => {
    it('returns the saved text on a second call without calling the LLM', async () => {
      const id = await seed(alice);
      await post(id, '000001', alice);
      llmReplies('A different line.');
      const res = await post(id, '000001', alice);
      expect(res.body).toEqual({ text: LLM_LINE });
      expect(create).toHaveBeenCalledTimes(1);
      expect((await storedGame(id)).llmCalls).toBe(1);
    });

    it('two calls at once return the same text and save it once', async () => {
      let line = 0;
      create.mockImplementation(async () => ({ content: [{ type: 'text', text: `Line ${++line}` }], stop_reason: 'end_turn' }));
      const id = await seed(alice);
      const [first, second] = await Promise.all([post(id, '000001', alice), post(id, '000001', alice)]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.text).toBe(second.body.text);
      expect((await storedEvent(id)).aiText).toBe(first.body.text);
    });
  });

  describe('fallback', () => {
    it('returns the template when the LLM fails, and saves it', async () => {
      llmReplies(new Error('LLM is down'));
      const id = await seed(alice);
      const { text } = await storedEvent(id);
      const res = await post(id, '000001', alice);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text });
      expect((await storedEvent(id)).aiText).toBe(text);
    });

    it('does not retry the LLM after a saved fallback', async () => {
      llmReplies(new Error('LLM is down'));
      const id = await seed(alice);
      const { text } = await storedEvent(id);
      await post(id, '000001', alice);
      llmReplies(LLM_LINE);
      const res = await post(id, '000001', alice);
      expect(res.body).toEqual({ text });
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  describe('cap of 60 calls', () => {
    const spend = (id, calls) => gameRef(id).update({ llmCalls: calls });

    it('calls the LLM on the 60th call', async () => {
      const id = await seed(alice);
      await spend(id, 59);
      const res = await post(id, '000001', alice);
      expect(res.body).toEqual({ text: LLM_LINE });
      expect((await storedGame(id)).llmCalls).toBe(60);
    });

    it('returns the template at the cap without calling the LLM', async () => {
      const id = await seed(alice);
      await spend(id, 60);
      const { text } = await storedEvent(id);
      const res = await post(id, '000001', alice);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text });
      expect(create).not.toHaveBeenCalled();
      expect((await storedEvent(id)).aiText).toBe(text);
    });

    it('leaves llmCalls at 60', async () => {
      const id = await seed(alice);
      await spend(id, 60);
      await post(id, '000001', alice);
      expect((await storedGame(id)).llmCalls).toBe(60);
    });

    it('two calls at once with one call left reach the LLM only once', async () => {
      const id = await seed(alice, [roll, LLM_EVENTS.conquest]);
      await spend(id, 59);
      const results = await Promise.all([post(id, '000001', alice), post(id, '000002', alice)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(create).toHaveBeenCalledTimes(1);
      expect((await storedGame(id)).llmCalls).toBe(60);
    });
  });

  describe('other event types', () => {
    it.each(Object.keys(OTHER_EVENTS))('returns the template for a %s event, calls no LLM and writes nothing', async (type) => {
      const id = await seed(alice, [OTHER_EVENTS[type]]);
      const { text } = await storedEvent(id);
      const res = await post(id, '000001', alice);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text });
      expect(create).not.toHaveBeenCalled();
      expect((await storedEvent(id)).aiText).toBeNull();
      expect((await storedGame(id)).llmCalls).toBe(0);
    });
  });
});
