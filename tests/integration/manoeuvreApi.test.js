import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/config/firebase.js';
import * as gameModel from '../../src/models/gameModel.js';
import { makeState } from '../helpers.js';
import { signUp } from './authHelper.js';

const app = createApp();
const turnStart = { type: 'turnStart', player: 'human', round: 1 };

// The human owns AAA (10) and EEE (1). BBB belongs to an NPC.
const armies = { AAA: { soldiers: 10 }, BBB: { soldiers: 10 } };
const reinforcing = { round: 2, phase: 'reinforce', pendingReinforcements: 4 };
const attacking = { phase: 'attacking', attack: { from: 'AAA', to: 'BBB', rolls: 0, bonus: null } };
const occupying = { phase: 'occupy', attack: { from: 'AAA', to: 'BBB', rolls: 1, bonus: 2 } };
const npcTurn = { currentTurn: 1 };

let alice;
let bob;

beforeAll(async () => {
  alice = await signUp();
  bob = await signUp();
});

/** A known board owned by `owner`, at version 1, the human's turn. */
function seed(owner, overrides = {}) {
  return gameModel.createGame(owner.uid, makeState({ countries: armies, ...overrides }), [turnStart]);
}

function post(path, user, body) {
  const req = request(app).post(`/api/games/${path}`);
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

describe('POST /api/games/:id/reinforce (ARCHITECTURE §3, GAME_RULES §7)', () => {
  const body = { version: 1, placements: { AAA: 3, EEE: 1 } };

  it('returns 401 without a token', async () => {
    const id = await seed(alice, reinforcing);
    expect((await post(`${id}/reinforce`, null, body)).status).toBe(401);
  });

  it('returns 403 for a user who does not own the game', async () => {
    const id = await seed(alice, reinforcing);
    expect((await post(`${id}/reinforce`, bob, body)).status).toBe(403);
    expect((await stored(id)).version).toBe(1);
  });

  it('returns 404 for an unknown game', async () => {
    expect((await post('does-not-exist/reinforce', alice, body)).status).toBe(404);
  });

  it.each([[undefined], ['1'], [0], [1.5]])('returns 400 when version is %s', async (version) => {
    const id = await seed(alice, reinforcing);
    expect((await post(`${id}/reinforce`, alice, { ...body, version })).status).toBe(400);
  });

  it.each([[undefined], [null], ['AAA'], [[3, 1]]])('returns 400 when placements is %j', async (placements) => {
    const id = await seed(alice, reinforcing);
    expect((await post(`${id}/reinforce`, alice, { version: 1, placements })).status).toBe(400);
  });

  it('returns 400 for an unknown key, and writes nothing', async () => {
    const id = await seed(alice, reinforcing);
    const res = await post(`${id}/reinforce`, alice, { ...body, soldiers: 50 });
    expect(res.status).toBe(400);
    expect(await stored(id)).toMatchObject({ version: 1, phase: 'reinforce', pendingReinforcements: 4 });
  });

  it('returns 409 for a stale version', async () => {
    const id = await seed(alice, reinforcing);
    const res = await post(`${id}/reinforce`, alice, { ...body, version: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stale_version');
  });

  it('returns 409 outside the reinforce phase', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/reinforce`, alice, body)).status).toBe(409);
  });

  it('returns 409 on an NPC\'s turn', async () => {
    const id = await seed(alice, { ...reinforcing, ...npcTurn });
    const res = await post(`${id}/reinforce`, alice, body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('not_your_turn');
  });

  it('returns 422 when placements add up to too few, and writes nothing', async () => {
    const id = await seed(alice, reinforcing);
    const res = await post(`${id}/reinforce`, alice, { version: 1, placements: { AAA: 3 } });
    expect(res.status).toBe(422);
    expect(await stored(id)).toMatchObject({ version: 1, phase: 'reinforce', pendingReinforcements: 4 });
  });

  it('returns 422 when placements add up to too many', async () => {
    const id = await seed(alice, reinforcing);
    expect((await post(`${id}/reinforce`, alice, { version: 1, placements: { AAA: 5 } })).status).toBe(422);
  });

  it('returns 422 for a country the player does not own', async () => {
    const id = await seed(alice, reinforcing);
    expect((await post(`${id}/reinforce`, alice, { version: 1, placements: { BBB: 4 } })).status).toBe(422);
  });

  it('returns 422 for a negative placement', async () => {
    const id = await seed(alice, reinforcing);
    expect((await post(`${id}/reinforce`, alice, { version: 1, placements: { AAA: 5, EEE: -1 } })).status).toBe(422);
  });

  it('places the soldiers and moves the phase to manoeuvre', async () => {
    const id = await seed(alice, reinforcing);
    const res = await post(`${id}/reinforce`, alice, body);
    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => e.type)).toEqual(['reinforce']);
    expect(res.body.game).toMatchObject({ version: 2, phase: 'manoeuvre', pendingReinforcements: 0, currentTurn: 0 });
    expect(res.body.game.countries.AAA.soldiers).toBe(13);
    expect(res.body.game.countries.EEE.soldiers).toBe(2);
  });

  it('stores a reinforce event with its template line', async () => {
    const id = await seed(alice, reinforcing);
    await post(`${id}/reinforce`, alice, body);
    const event = (await storedEvents(id)).at(-1);
    expect(event).toMatchObject({ seq: 2, type: 'reinforce', aiText: null });
    expect(event.data).toMatchObject({ player: 'human', amount: 4, placements: { AAA: 3, EEE: 1 } });
    expect(event.text).not.toBe('');
  });

  it('never returns ownerUid', async () => {
    const id = await seed(alice, reinforcing);
    const res = await post(`${id}/reinforce`, alice, body);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('ownerUid');
    expect(res.body.game.isOwner).toBe(true);
  });
});

describe('POST /api/games/:id/transfer (ARCHITECTURE §3, GAME_RULES §6)', () => {
  const body = { version: 1, from: 'AAA', to: 'EEE', count: 3 };

  it('returns 401 without a token', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, null, body)).status).toBe(401);
  });

  it('returns 403 for a user who does not own the game', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, bob, body)).status).toBe(403);
    expect((await stored(id)).version).toBe(1);
  });

  it('returns 404 for an unknown game', async () => {
    expect((await post('does-not-exist/transfer', alice, body)).status).toBe(404);
  });

  it.each([[undefined], ['1'], [0], [1.5]])('returns 400 when version is %s', async (version) => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, alice, { ...body, version })).status).toBe(400);
  });

  it.each([['from', 7], ['to', 7], ['from', undefined], ['to', null]])('returns 400 when %s is %s', async (key, value) => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, alice, { ...body, [key]: value })).status).toBe(400);
  });

  it.each([['3'], [undefined], [null]])('returns 400 when count is %j', async (count) => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, alice, { ...body, count })).status).toBe(400);
  });

  it('returns 400 when the body contains soldiers, and writes nothing', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/transfer`, alice, { ...body, soldiers: 50 });
    expect(res.status).toBe(400);
    expect((await stored(id)).version).toBe(1);
  });

  it('returns 400 when the body contains dice', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, alice, { ...body, dice: [6, 6] })).status).toBe(400);
  });

  it('returns 409 for a stale version', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/transfer`, alice, { ...body, version: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stale_version');
  });

  it('returns 409 mid-attack', async () => {
    const id = await seed(alice, attacking);
    expect((await post(`${id}/transfer`, alice, body)).status).toBe(409);
  });

  it('returns 409 in the reinforce phase', async () => {
    const id = await seed(alice, reinforcing);
    expect((await post(`${id}/transfer`, alice, body)).status).toBe(409);
  });

  it('returns 409 in the occupy phase', async () => {
    const id = await seed(alice, occupying);
    expect((await post(`${id}/transfer`, alice, body)).status).toBe(409);
  });

  it('returns 409 on an NPC\'s turn', async () => {
    const id = await seed(alice, npcTurn);
    const res = await post(`${id}/transfer`, alice, body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('not_your_turn');
  });

  it('returns 422 when it would leave fewer than 1 soldier, and writes nothing', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/transfer`, alice, { ...body, count: 10 });
    expect(res.status).toBe(422);
    const game = await stored(id);
    expect(game.version).toBe(1);
    expect(game.countries.AAA.soldiers).toBe(10);
  });

  it('returns 422 for a country the player does not own', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, alice, { ...body, to: 'BBB' })).status).toBe(422);
  });

  it('returns 422 for the same country twice', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, alice, { ...body, to: 'AAA' })).status).toBe(422);
  });

  it.each([[0], [1.5]])('returns 422 for a count of %s', async (count) => {
    const id = await seed(alice);
    expect((await post(`${id}/transfer`, alice, { ...body, count })).status).toBe(422);
  });

  it('moves the soldiers and stays in manoeuvre on the same turn', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/transfer`, alice, body);
    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => e.type)).toEqual(['transfer']);
    expect(res.body.game).toMatchObject({ version: 2, phase: 'manoeuvre', currentTurn: 0 });
    expect(res.body.game.countries.AAA.soldiers).toBe(7);
    expect(res.body.game.countries.EEE.soldiers).toBe(4);
  });

  it('stores a transfer event with its template line', async () => {
    const id = await seed(alice);
    await post(`${id}/transfer`, alice, body);
    const event = (await storedEvents(id)).at(-1);
    expect(event).toMatchObject({ seq: 2, type: 'transfer', aiText: null });
    expect(event.data).toMatchObject({ player: 'human', from: 'AAA', to: 'EEE', count: 3 });
    expect(event.text).not.toBe('');
  });

  it('allows a second transfer in the same turn', async () => {
    const id = await seed(alice);
    await post(`${id}/transfer`, alice, body);
    const res = await post(`${id}/transfer`, alice, { version: 2, from: 'EEE', to: 'AAA', count: 2 });
    expect(res.status).toBe(200);
    expect(res.body.game).toMatchObject({ version: 3, phase: 'manoeuvre' });
    expect(res.body.game.countries.AAA.soldiers).toBe(9);
    expect(res.body.game.countries.EEE.soldiers).toBe(2);
  });

  it('never returns ownerUid', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/transfer`, alice, body);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('ownerUid');
    expect(res.body.game.isOwner).toBe(true);
  });
});
