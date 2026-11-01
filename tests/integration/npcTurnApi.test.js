import { randomInt } from 'node:crypto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/config/firebase.js';
import * as gameModel from '../../src/models/gameModel.js';
import { generateCommentary } from '../../src/services/commentaryService.js';
import { makeState } from '../helpers.js';
import { signUp } from './authHelper.js';

// Real dice unless a test scripts them, so the game-ending test can't flake.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

vi.mock('../../src/services/commentaryService.js', () => ({ generateCommentary: vi.fn() }));

const app = createApp();
const turnStart = { type: 'turnStart', player: 'npc:BBB', round: 1 };

// npc:BBB (warlord) is up, with 10 soldiers. It can reach the human's AAA and EEE.
const npcUp = { currentTurn: 1, countries: { BBB: { soldiers: 10 } } };
// Every country npc:BBB owns has 1 soldier, so it has no target (GAME_RULES §8.1).
const noTarget = { currentTurn: 1, countries: { BBB: { soldiers: 1 } } };
// The human's only country is AAA, with 1 soldier.
const lastCountry = { currentTurn: 1, countries: { AAA: { soldiers: 1 }, BBB: { soldiers: 10 }, EEE: { owner: 'npc:BBB' } } };

let alice;
let bob;

beforeAll(async () => {
  alice = await signUp();
  bob = await signUp();
});

/** A known board owned by `owner`, at version 1. */
function seed(owner, overrides = npcUp) {
  return gameModel.createGame(owner.uid, makeState(overrides), [turnStart]);
}

function post(id, user, body) {
  const req = request(app).post(`/api/games/${id}/npc-turn`);
  if (user) req.set('Authorization', `Bearer ${user.idToken}`);
  return req.send(body);
}

async function stored(id) {
  return (await getDb().collection('games').doc(id).get()).data();
}

async function storedEvents(id) {
  const snap = await getDb().collection('games').doc(id).collection('events').orderBy('seq').get();
  return snap.docs.map((d) => d.data());
}

describe('POST /api/games/:id/npc-turn (ARCHITECTURE §3, §4.2, GAME_RULES §8)', () => {
  it('returns 401 without a token', async () => {
    const id = await seed(alice);
    expect((await post(id, null, { version: 1 })).status).toBe(401);
  });

  it('returns 403 for a user who does not own the game', async () => {
    const id = await seed(alice);
    expect((await post(id, bob, { version: 1 })).status).toBe(403);
    expect((await stored(id)).version).toBe(1);
  });

  it('returns 404 for an unknown game', async () => {
    expect((await post('does-not-exist', alice, { version: 1 })).status).toBe(404);
  });

  it.each([[undefined], ['1'], [0], [1.5]])('returns 400 when version is %s', async (version) => {
    const id = await seed(alice);
    expect((await post(id, alice, { version })).status).toBe(400);
  });

  it.each([['dice', [6, 6]], ['soldiers', 50]])('returns 400 when the body contains %s, and writes nothing', async (key, value) => {
    const id = await seed(alice);
    const res = await post(id, alice, { version: 1, [key]: value });
    expect(res.status).toBe(400);
    expect((await stored(id)).version).toBe(1);
  });

  it('returns 409 for a stale version', async () => {
    const id = await seed(alice);
    const res = await post(id, alice, { version: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stale_version');
  });

  it('returns 409 on the human\'s turn, and writes nothing', async () => {
    const id = await seed(alice, {});
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('not_your_turn');
    expect((await stored(id)).version).toBe(1);
  });

  it('returns 409 once the game is over', async () => {
    const id = await seed(alice, { ...npcUp, status: 'lost', winner: 'npc:BBB' });
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('game_over');
  });

  it('plays exactly one NPC turn', async () => {
    const id = await seed(alice);
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(200);
    const types = res.body.events.map((e) => e.type);
    expect(types).toContain('attackStart');
    expect(types.filter((t) => t === 'turnStart')).toHaveLength(1);
    expect(types.at(-1)).toBe('turnStart');
    expect(res.body.events.at(-1).data.player).toBe('npc:CCC');
    expect(res.body.game).toMatchObject({ version: 2, currentTurn: 2 });
  });

  it('returns events in order with seq increasing', async () => {
    const id = await seed(alice);
    const res = await post(id, alice, { version: 1 });
    const seqs = res.body.events.map((e) => e.seq);
    expect(seqs).toEqual(seqs.map((_, i) => i + 2));
    expect(res.body.game.eventSeq).toBe(seqs.at(-1));
  });

  it('reinforces first in round 2', async () => {
    const id = await seed(alice, { ...npcUp, round: 2, phase: 'reinforce', pendingReinforcements: 2 });
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.events[0]).toMatchObject({ type: 'reinforce', data: { player: 'npc:BBB', amount: 2 } });
  });

  it('skips when the NPC has no target', async () => {
    const id = await seed(alice, noTarget);
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => e.type)).toEqual(['skip', 'turnStart']);
    expect(res.body.game.currentTurn).toBe(2);
  });

  it('saves every event with its template line and aiText null', async () => {
    const id = await seed(alice);
    const res = await post(id, alice, { version: 1 });
    const events = (await storedEvents(id)).slice(1);
    expect(events).toHaveLength(res.body.events.length);
    for (const event of events) {
      expect(event.text).not.toBe('');
      expect(event.aiText).toBeNull();
    }
  });

  it('never calls the LLM', async () => {
    const id = await seed(alice);
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(200);
    expect(generateCommentary).not.toHaveBeenCalled();
  });

  it('ends the game as lost if the human loses their last country', async () => {
    randomInt.mockReturnValueOnce(6).mockReturnValueOnce(1); // 1 die each: 6 beats 1 (GAME_RULES §5.2, §5.3)
    const id = await seed(alice, lastCountry);
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(200);
    const types = res.body.events.map((e) => e.type);
    expect(types).toContain('conquest');
    expect(types).not.toContain('occupy');
    expect(types.at(-1)).toBe('gameOver');
    expect(res.body.game).toMatchObject({ status: 'lost', winner: 'npc:BBB' });
    expect(res.body.events.at(-1).data).toMatchObject({ status: 'lost', winner: 'npc:BBB' });
    expect(await stored(id)).toMatchObject({ status: 'lost', winner: 'npc:BBB', version: 2 });
  });

  it('a second request with the same version gets 409', async () => {
    const id = await seed(alice);
    expect((await post(id, alice, { version: 1 })).status).toBe(200);
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stale_version');
  });

  it('never returns ownerUid', async () => {
    const id = await seed(alice);
    const res = await post(id, alice, { version: 1 });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('ownerUid');
    expect(res.body.game.isOwner).toBe(true);
  });
});
