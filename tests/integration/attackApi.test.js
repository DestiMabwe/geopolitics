import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/config/firebase.js';
import * as gameModel from '../../src/models/gameModel.js';
import { makeState } from '../helpers.js';
import { signUp } from './authHelper.js';

const app = createApp();
const turnStart = { type: 'turnStart', player: 'human', round: 1 };

// 10 v 10 rolls 9 dice each (GAME_RULES §5.2), so the defender keeps at least 1 and one roll never
// conquers. The attacker can fail only if it loses all 9 pairs, which is very unlikely.
const bigArmies = { AAA: { soldiers: 10 }, BBB: { soldiers: 10 } };
const attacking = { phase: 'attacking', attack: { from: 'AAA', to: 'BBB', rolls: 0, bonus: null } };

let alice;
let bob;

beforeAll(async () => {
  alice = await signUp();
  bob = await signUp();
});

/** A known board owned by `owner`, at version 1, the human's turn. */
function seed(owner, overrides = {}) {
  return gameModel.createGame(owner.uid, makeState({ countries: bigArmies, ...overrides }), [turnStart]);
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

function expectNoOwnerUid(res) {
  expect(JSON.stringify(res.body)).not.toContain('ownerUid');
}

describe('POST /api/games/:id/attack (ARCHITECTURE §3, GAME_RULES §5.1)', () => {
  it('returns 401 without a token', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, null, { version: 1, from: 'AAA', to: 'BBB' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown game', async () => {
    const res = await post('does-not-exist/attack', alice, { version: 1, from: 'AAA', to: 'BBB' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a user who does not own the game', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, bob, { version: 1, from: 'AAA', to: 'BBB' });
    expect(res.status).toBe(403);
    expect((await stored(id)).version).toBe(1);
  });

  it('returns 400 when version is missing', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, alice, { from: 'AAA', to: 'BBB' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when version is not a positive integer', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, alice, { version: '1', from: 'AAA', to: 'BBB' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when from or to is not a string', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, alice, { version: 1, from: 'AAA', to: 7 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body contains soldiers, and writes nothing', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, alice, { version: 1, from: 'AAA', to: 'BBB', soldiers: 50 });
    expect(res.status).toBe(400);
    expect(await stored(id)).toMatchObject({ version: 1, phase: 'manoeuvre' });
  });

  it('returns 400 when the body contains dice', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, alice, { version: 1, from: 'AAA', to: 'BBB', dice: [6, 6, 6] });
    expect(res.status).toBe(400);
  });

  it('returns 409 for a stale version', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, alice, { version: 7, from: 'AAA', to: 'BBB' });
    expect(res.status).toBe(409);
  });

  it('returns 422 when the target does not border the attacker', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, alice, { version: 1, from: 'AAA', to: 'DDD' });
    expect(res.status).toBe(422);
    expect(await stored(id)).toMatchObject({ version: 1, phase: 'manoeuvre', attack: null });
  });

  it('starts the attack: 200, phase attacking, an attackStart event, version 2, no dice yet', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack`, alice, { version: 1, from: 'AAA', to: 'BBB' });

    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    const { game, events } = res.body;
    expect(game).toMatchObject({ id, isOwner: true, version: 2, phase: 'attacking' });
    expect(game.attack).toMatchObject({ from: 'AAA', to: 'BBB', rolls: 0 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ seq: 2, type: 'attackStart', data: { from: 'AAA', to: 'BBB' } });
    expect(game.countries.AAA.soldiers).toBe(10);
    expect(game.countries.BBB.soldiers).toBe(10);
  });
});

describe('POST /api/games/:id/attack/roll (ARCHITECTURE §4.1, GAME_RULES §5.2–§5.4)', () => {
  it('returns 401 without a token', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/roll`, null, { version: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a user who does not own the game', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/roll`, bob, { version: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 409 when no attack is in progress', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack/roll`, alice, { version: 1 });
    expect(res.status).toBe(409);
  });

  it('returns 400 when the body contains dice, and rolls nothing', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/roll`, alice, { version: 1, dice: [6, 6, 6] });
    expect(res.status).toBe(400);
    expect((await stored(id)).attack.rolls).toBe(0);
  });

  it('returns 400 when the body contains soldiers', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/roll`, alice, { version: 1, soldiers: 1 });
    expect(res.status).toBe(400);
  });

  it('rolls server dice: one roll event with dice 1–6 and losses that match', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/roll`, alice, { version: 1 });

    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    const { game, events } = res.body;
    const { type, data } = events[0];
    expect(type).toBe('roll');
    // GAME_RULES §5.2: min(10 − 1, 10) = 9 dice each, no 3-dice cap.
    expect(data.attackerDice).toHaveLength(9);
    expect(data.defenderDice).toHaveLength(9);
    for (const die of [...data.attackerDice, ...data.defenderDice]) {
      expect(Number.isInteger(die) && die >= 1 && die <= 6).toBe(true);
    }
    // GAME_RULES §5.3: a tied pair kills nobody, so losses can be fewer than pairs.
    expect(data.attackerLosses + data.defenderLosses).toBeLessThanOrEqual(9);
    expect(game.countries.AAA.soldiers).toBe(10 - data.attackerLosses);
    expect(game.countries.BBB.soldiers).toBe(10 - data.defenderLosses);
    expect(game.version).toBe(2);
  });

  it('rolls exactly once per request', async () => {
    const id = await seed(alice, attacking);
    const first = await post(`${id}/attack/roll`, alice, { version: 1 });
    const second = await post(`${id}/attack/roll`, alice, { version: 2 });

    expect(first.body.game.attack.rolls).toBe(1);
    expect(second.body.game.attack.rolls).toBe(2);
    expect(second.body.events.map((e) => e.type)).toEqual(['roll']);
  });

  it('returns 409 for a double roll with the same version, and stores only one roll', async () => {
    const id = await seed(alice, attacking);
    const first = await post(`${id}/attack/roll`, alice, { version: 1 });
    const second = await post(`${id}/attack/roll`, alice, { version: 1 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await stored(id)).toMatchObject({ version: 2, attack: { rolls: 1 } });
    expect((await storedEvents(id)).filter((e) => e.type === 'roll')).toHaveLength(1);
  });
});

describe('POST /api/games/:id/attack/stop (GAME_RULES §5.4, §4.5)', () => {
  it('returns 401 without a token', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/stop`, null, { version: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a user who does not own the game', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/stop`, bob, { version: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when the body has an unknown key', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/stop`, alice, { version: 1, soldiers: 3 });
    expect(res.status).toBe(400);
  });

  it('returns 409 when no attack is in progress', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack/stop`, alice, { version: 1 });
    expect(res.status).toBe(409);
  });

  it('stops the attack: attackStopped event, attack cleared, soldiers unchanged, turn handed over', async () => {
    const id = await seed(alice, attacking);
    const res = await post(`${id}/attack/stop`, alice, { version: 1 });

    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    const { game, events } = res.body;
    expect(events.map((e) => e.type)).toEqual(['attackStopped', 'turnStart']);
    expect(events[0].data).toMatchObject({ from: 'AAA', to: 'BBB' });
    expect(game).toMatchObject({ version: 2, attack: null, currentTurn: 1 });
    expect(game.countries.AAA.soldiers).toBe(10);
    expect(game.countries.BBB.soldiers).toBe(10);
  });
});

// AAA (10) has just conquered BBB (value 2 → bonus 2); BBB is empty until occupy.
const occupying = {
  countries: { AAA: { soldiers: 10 }, BBB: { owner: 'human', soldiers: 0 } },
  phase: 'occupy',
  attack: { from: 'AAA', to: 'BBB', rolls: 1, bonus: 2 },
};

describe('POST /api/games/:id/attack/occupy (GAME_RULES §5.6, ARCHITECTURE §3)', () => {
  it('returns 401 without a token', async () => {
    const id = await seed(alice, occupying);
    const res = await post(`${id}/attack/occupy`, null, { version: 1, count: 1, placements: { BBB: 2 } });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a user who does not own the game', async () => {
    const id = await seed(alice, occupying);
    const res = await post(`${id}/attack/occupy`, bob, { version: 1, count: 1, placements: { BBB: 2 } });
    expect(res.status).toBe(403);
  });

  it('returns 400 when placements is missing or count is not a number', async () => {
    const id = await seed(alice, occupying);
    expect((await post(`${id}/attack/occupy`, alice, { version: 1, count: 1 })).status).toBe(400);
    expect((await post(`${id}/attack/occupy`, alice, { version: 1, count: '1', placements: { BBB: 2 } })).status).toBe(400);
  });

  it('returns 400 for an unknown key', async () => {
    const id = await seed(alice, occupying);
    const res = await post(`${id}/attack/occupy`, alice, { version: 1, count: 1, placements: { BBB: 2 }, bonus: 9 });
    expect(res.status).toBe(400);
  });

  it('returns 409 when there is nothing to occupy', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/attack/occupy`, alice, { version: 1, count: 1, placements: { AAA: 2 } });
    expect(res.status).toBe(409);
  });

  it('returns 422 for a count out of range, and writes nothing', async () => {
    const id = await seed(alice, occupying);
    const res = await post(`${id}/attack/occupy`, alice, { version: 1, count: 10, placements: { BBB: 2 } });
    expect(res.status).toBe(422);
    expect(await stored(id)).toMatchObject({ version: 1, phase: 'occupy' });
  });

  it('returns 422 when placements do not add up to the bonus', async () => {
    const id = await seed(alice, occupying);
    const res = await post(`${id}/attack/occupy`, alice, { version: 1, count: 1, placements: { BBB: 5 } });
    expect(res.status).toBe(422);
  });

  it('occupies: soldiers moved and bonus placed, occupy event, turn handed over', async () => {
    const id = await seed(alice, occupying);
    const res = await post(`${id}/attack/occupy`, alice, { version: 1, count: 4, placements: { BBB: 1, AAA: 1 } });

    expect(res.status).toBe(200);
    expectNoOwnerUid(res);
    const { game, events } = res.body;
    expect(events.map((e) => e.type)).toEqual(['occupy', 'turnStart']);
    expect(events[0].data).toMatchObject({ from: 'AAA', to: 'BBB', count: 4, placements: { BBB: 1, AAA: 1 } });
    expect(game.countries.AAA.soldiers).toBe(7);
    expect(game.countries.BBB.soldiers).toBe(5);
    expect(game).toMatchObject({ version: 2, attack: null, currentTurn: 1, phase: 'manoeuvre' });
  });
});

describe('POST /api/games/:id/skip (GAME_RULES §4.2)', () => {
  it('returns 401 without a token', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/skip`, null, { version: 1 })).status).toBe(401);
  });

  it('returns 403 for a user who does not own the game', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/skip`, bob, { version: 1 })).status).toBe(403);
  });

  it('returns 400 for an unknown key', async () => {
    const id = await seed(alice);
    expect((await post(`${id}/skip`, alice, { version: 1, soldiers: 3 })).status).toBe(400);
  });

  it('returns 409 mid-attack', async () => {
    const id = await seed(alice, attacking);
    expect((await post(`${id}/skip`, alice, { version: 1 })).status).toBe(409);
  });

  it('skips: skip event, then the next player\'s turn', async () => {
    const id = await seed(alice);
    const res = await post(`${id}/skip`, alice, { version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => e.type)).toEqual(['skip', 'turnStart']);
    expect(res.body.game).toMatchObject({ version: 2, currentTurn: 1 });
  });
});
