import { randomInt } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as gameModel from '../../src/models/gameModel.js';
import { makeState } from '../helpers.js';
import { signUp } from './authHelper.js';

// Real dice unless a test scripts them, so the game-ending tests can't flake.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});
const { randomInt: realRandomInt } = await vi.importActual('node:crypto');

const app = createApp();
const turnStart = { type: 'turnStart', player: 'human', round: 1 };

// The human attacks Country B, the last country they don't own. B has 1 soldier, so each side
// rolls 1 die (GAME_RULES §5.2) and a scripted 6 against a 1 conquers it.
const aboutToWin = {
  phase: 'attacking',
  attack: { from: 'AAA', to: 'BBB', rolls: 0, bonus: null },
  countries: {
    AAA: { soldiers: 10 },
    BBB: { soldiers: 1 },
    CCC: { owner: 'human' },
    DDD: { owner: 'human' },
  },
};
// A fight that is not the last one: Country B falls but the others stand.
const midGame = {
  phase: 'attacking',
  attack: { from: 'AAA', to: 'BBB', rolls: 0, bonus: null },
  countries: { AAA: { soldiers: 10 }, BBB: { soldiers: 1 } },
};
// npc:BBB is up and the human's only country is AAA, with 1 soldier.
const aboutToLose = {
  currentTurn: 1,
  countries: { AAA: { soldiers: 1 }, BBB: { soldiers: 10 }, EEE: { owner: 'npc:BBB' } },
};

let alice;
let bob;

beforeAll(async () => {
  alice = await signUp();
  bob = await signUp();
});

beforeEach(() => {
  randomInt.mockReset();
  randomInt.mockImplementation(realRandomInt);
});

const as = (user, req) => (user ? req.set('Authorization', `Bearer ${user.idToken}`) : req);
const stats = (user) => as(user, request(app).get('/api/players/me'));
const post = (path, user, body) => as(user, request(app).post(`/api/${path}`)).send(body);

/** A fresh user, so one test's games never touch another's counts. */
const newUser = () => signUp();

function seed(owner, overrides, turn = 'human') {
  return gameModel.createGame(owner.uid, makeState(overrides), [{ ...turnStart, player: turn }]);
}

/** The roll that wins: the attacker's die is 6, the defender's is 1. */
function winningRoll(id, user) {
  randomInt.mockReturnValueOnce(6).mockReturnValueOnce(1);
  return post(`games/${id}/attack/roll`, user, { version: 1 });
}

describe('GET /api/players/me (ARCHITECTURE §3)', () => {
  it('returns 401 without a token', async () => {
    expect((await stats(null)).status).toBe(401);
  });

  it('returns zeros and no last-played time for a player with no games', async () => {
    const res = await stats(await newUser());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ stats: { gamesStarted: 0, wins: 0, losses: 0, lastPlayedAt: null } });
  });

  it('returns only the four stats, nothing that identifies anyone', async () => {
    const user = await newUser();
    await seed(user, {});
    const res = await stats(user);
    expect(Object.keys(res.body)).toEqual(['stats']);
    expect(Object.keys(res.body.stats).sort()).toEqual(['gamesStarted', 'lastPlayedAt', 'losses', 'wins']);
  });
});

describe('gamesStarted', () => {
  it('goes up by 1 when the player creates a game through the API', async () => {
    const user = await newUser();
    const created = await post('games', user, { countryCode: 'ZAF' });
    expect(created.status).toBe(201);
    const res = await stats(user);
    expect(res.body.stats.gamesStarted).toBe(1);
    expect(typeof res.body.stats.lastPlayedAt).toBe('string');
  });

  it('counts every game', async () => {
    const user = await newUser();
    await post('games', user, { countryCode: 'ZAF' });
    await post('games', user, { countryCode: 'ZAF' });
    expect((await stats(user)).body.stats.gamesStarted).toBe(2);
  });

  it('does not count a game that failed to start', async () => {
    const user = await newUser();
    expect((await post('games', user, { countryCode: 'NOPE' })).status).toBe(422);
    expect((await stats(user)).body.stats.gamesStarted).toBe(0);
  });

  it('keeps each player\'s count separate', async () => {
    const user = await newUser();
    await post('games', user, { countryCode: 'ZAF' });
    expect((await stats(await newUser())).body.stats.gamesStarted).toBe(0);
  });
});

describe('wins and losses (GAME_RULES §9.1, §9.2)', () => {
  it('adds 1 win when the human conquers the last country, and no loss', async () => {
    const user = await newUser();
    const id = await seed(user, aboutToWin);
    const roll = await winningRoll(id, user);
    expect(roll.body.game).toMatchObject({ status: 'won', winner: 'human' });
    const { stats: s } = (await stats(user)).body;
    expect(s).toMatchObject({ wins: 1, losses: 0 });
    expect(typeof s.lastPlayedAt).toBe('string');
  });

  it('adds 1 loss when the human is eliminated on an NPC turn, and no win', async () => {
    const user = await newUser();
    const id = await seed(user, aboutToLose, 'npc:BBB');
    randomInt.mockReturnValueOnce(6).mockReturnValueOnce(1);
    const turn = await post(`games/${id}/npc-turn`, user, { version: 1 });
    expect(turn.body.game).toMatchObject({ status: 'lost' });
    expect((await stats(user)).body.stats).toMatchObject({ wins: 0, losses: 1 });
  });

  it('changes nothing while the game is still going', async () => {
    const user = await newUser();
    const id = await seed(user, midGame);
    const roll = await winningRoll(id, user);
    expect(roll.body.game.status).toBe('active');
    expect((await stats(user)).body.stats).toMatchObject({ wins: 0, losses: 0 });
  });

  it('counts a finished game once, however many more actions are tried', async () => {
    const user = await newUser();
    const id = await seed(user, aboutToWin);
    await winningRoll(id, user);
    expect((await post(`games/${id}/attack/roll`, user, { version: 2 })).status).toBe(409);
    expect((await post(`games/${id}/skip`, user, { version: 2 })).status).toBe(409);
    expect((await post(`games/${id}/npc-turn`, user, { version: 2 })).status).toBe(409);
    expect((await stats(user)).body.stats).toMatchObject({ wins: 1, losses: 0 });
  });

  it('counts two requests at once only once', async () => {
    const user = await newUser();
    const id = await seed(user, aboutToWin);
    // Whichever request commits first must win its roll: attacker die 6, then defender die 1, every time.
    let calls = 0;
    randomInt.mockImplementation(() => (calls++ % 2 === 0 ? 6 : 1));
    const results = await Promise.all([
      post(`games/${id}/attack/roll`, user, { version: 1 }),
      post(`games/${id}/attack/roll`, user, { version: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await stats(user)).body.stats).toMatchObject({ wins: 1, losses: 0 });
  });

  it('does not count a refused action', async () => {
    const user = await newUser();
    const id = await seed(user, aboutToWin);
    expect((await post(`games/${id}/attack/roll`, user, { version: 7 })).status).toBe(409);
    expect((await post(`games/${id}/attack/roll`, await newUser(), { version: 1 })).status).toBe(403);
    expect((await stats(user)).body.stats).toMatchObject({ wins: 0, losses: 0 });
  });

  it('adds the win to the owner, not to anyone else', async () => {
    const user = await newUser();
    const id = await seed(user, aboutToWin);
    await winningRoll(id, user);
    expect((await stats(bob)).body.stats).toMatchObject({ wins: 0, losses: 0 });
  });

  it('keeps wins and losses separate across several games', async () => {
    const user = await newUser();
    await winningRoll(await seed(user, aboutToWin), user);
    await winningRoll(await seed(user, aboutToWin), user);
    randomInt.mockReturnValueOnce(6).mockReturnValueOnce(1);
    await post(`games/${await seed(user, aboutToLose, 'npc:BBB')}/npc-turn`, user, { version: 1 });
    expect((await stats(user)).body.stats).toMatchObject({ wins: 2, losses: 1 });
  });
});
