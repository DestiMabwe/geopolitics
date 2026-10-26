import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/game/setup.js';
import { buildBorders } from '../../src/game/map.js';
import { soldierValue } from '../../src/game/soldiers.js';
import { IllegalMoveError } from '../../src/game/errors.js';
import { scripted } from '../helpers.js';
import data from '../../src/data/countries.json' with { type: 'json' };

// 12 made-up countries on the equator, 10 degrees apart, covering values 1–9.
const POPULATIONS = {
  AAA: 500, BBB: 6_000_000, CCC: 20_000_000, DDD: 40_000_000,
  EEE: 60_000_000, FFF: 90_000_000, GGG: 110_000_000, HHH: 140_000_000,
  III: 200_000_000, JJJ: 3_000_000, KKK: 8_000_000, LLL: 30_000_000,
};
const CATALOGUE = Object.entries(POPULATIONS).map(([code, population], i) => ({
  code,
  name: `Country ${code[0]}`,
  population,
  lat: 0,
  lng: i * 10,
}));
const HUMAN = 'CCC';

// Wraps a randomInt and records every maxExclusive it is called with.
function recording(fn = () => 0) {
  const args = [];
  const randomInt = (maxExclusive) => {
    args.push(maxExclusive);
    return fn(maxExclusive);
  };
  randomInt.args = args;
  return randomInt;
}

const countdown = (from, to) => Array.from({ length: from - to + 1 }, (_, i) => from - i);

const play = (randomInt = recording()) =>
  createGame({ humanCode: HUMAN, catalogue: CATALOGUE, randomInt });

// Worked out by hand from the contract in setup.js:
// picks LLL, AAA, FFF, BBB, JJJ, EEE, DDD, III, GGG (HHH and KKK left out).
const PICKS = [10, 0, 3, 0, 5, 1, 0, 2, 0];
const TURN_SWAPS = [3, 8, 0, 6, 2, 4, 1, 0, 1];
const PROFILE_SWAPS = [0, 7, 2, 5, 0, 1, 1, 0];
const SCRIPT = [...PICKS, ...TURN_SWAPS, ...PROFILE_SWAPS];

describe('createGame (GAME_RULES §2, §3)', () => {
  it('rejects a human country that is not in the catalogue', () => {
    expect(() =>
      createGame({ humanCode: 'XXX', catalogue: CATALOGUE, randomInt: () => 0 }),
    ).toThrow(IllegalMoveError);
  });

  it("has 10 distinct countries, including the human's", () => {
    const { state } = play();
    const codes = Object.keys(state.countries);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes).toContain(HUMAN);
  });

  it('picks the other 9 from the catalogue without the human, one randomInt(remaining) per pick', () => {
    const randomInt = recording();
    play(randomInt);
    expect(randomInt.args.slice(0, 9)).toEqual(countdown(11, 3));
  });

  it('gives every country soldiers equal to its value', () => {
    const { state } = play();
    for (const [code, country] of Object.entries(state.countries)) {
      expect(country.value).toBe(soldierValue(POPULATIONS[code]));
      expect(country.soldiers).toBe(country.value);
    }
  });

  it('gives each country to its own player: human, or npc:<CODE>', () => {
    const { state } = play();
    for (const [code, country] of Object.entries(state.countries)) {
      expect(country.owner).toBe(code === HUMAN ? 'human' : `npc:${code}`);
    }
  });

  it("records each player's type, homeCode, and eliminated = false", () => {
    const { state } = play();
    expect(Object.keys(state.players)).toHaveLength(10);
    expect(state.players.human).toMatchObject({ type: 'human', profile: null, homeCode: HUMAN, eliminated: false });
    for (const code of Object.keys(state.countries)) {
      if (code === HUMAN) continue;
      expect(state.players[`npc:${code}`]).toMatchObject({ type: 'npc', homeCode: code, eliminated: false });
    }
  });

  it('stores borders from buildBorders on the 10 chosen countries', () => {
    const { state } = play();
    const chosen = CATALOGUE.filter((c) => c.code in state.countries);
    expect(state.borders).toEqual(buildBorders(chosen));
  });

  it('shuffles all 10 player ids into the turn order', () => {
    const randomInt = recording();
    const { state } = play(randomInt);
    expect([...state.turnOrder].sort()).toEqual(Object.keys(state.players).sort());
    expect(randomInt.args.slice(9, 18)).toEqual(countdown(10, 2));
  });

  it('assigns 3 warlords, 3 fortresses and 3 opportunists, none to the human', () => {
    const randomInt = recording();
    const { state } = play(randomInt);
    const profiles = Object.values(state.players)
      .filter((p) => p.type === 'npc')
      .map((p) => p.profile)
      .sort();
    expect(profiles).toEqual([
      'fortress', 'fortress', 'fortress',
      'opportunist', 'opportunist', 'opportunist',
      'warlord', 'warlord', 'warlord',
    ]);
    expect(state.players.human.profile).toBeNull();
    expect(randomInt.args.slice(18)).toEqual(countdown(9, 2));
  });

  it('produces this exact game from this exact script', () => {
    const { state } = play(scripted(...SCRIPT));
    expect(Object.keys(state.countries).sort()).toEqual(
      ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'III', 'JJJ', 'LLL'],
    );
    expect(state.turnOrder).toEqual([
      'npc:JJJ', 'npc:GGG', 'npc:DDD', 'npc:LLL', 'npc:BBB',
      'npc:AAA', 'npc:EEE', 'human', 'npc:III', 'npc:FFF',
    ]);
    // profiles go to the NPCs in turn order (§2.3)
    const profileOf = (id) => state.players[id].profile;
    expect(state.turnOrder.filter((id) => id !== 'human').map(profileOf)).toEqual([
      'opportunist', 'fortress', 'fortress', 'warlord', 'opportunist',
      'fortress', 'warlord', 'opportunist', 'warlord',
    ]);
    expect(state.countries.LLL).toEqual({
      name: 'Country L', value: 4, lat: 0, lng: 110, owner: 'npc:LLL', soldiers: 4,
    });
  });

  it('starts in round 1, active, first player in manoeuvre', () => {
    const { state } = play();
    expect(state).toMatchObject({
      status: 'active',
      winner: null,
      round: 1,
      currentTurn: 0,
      phase: 'manoeuvre',
      pendingReinforcements: 0,
      attack: null,
    });
  });

  it('returns one turnStart event for the first player', () => {
    const { state, events } = play(scripted(...SCRIPT));
    expect(events).toEqual([{ type: 'turnStart', player: 'npc:JJJ', round: 1 }]);
    expect(events[0].player).toBe(state.turnOrder[0]);
  });

  it('does not mutate the catalogue', () => {
    const before = structuredClone(CATALOGUE);
    play(scripted(...SCRIPT));
    expect(CATALOGUE).toEqual(before);
  });

  it('builds a valid game from the real countries.json', () => {
    const randomInt = recording((n) => n - 1);
    const { state } = createGame({ humanCode: 'ZAF', catalogue: data.countries, randomInt });
    const byCode = Object.fromEntries(data.countries.map((c) => [c.code, c]));
    expect(Object.keys(state.countries)).toHaveLength(10);
    expect(state.countries.ZAF.owner).toBe('human');
    for (const [code, country] of Object.entries(state.countries)) {
      expect(country.soldiers).toBe(soldierValue(byCode[code].population));
    }
    expect(randomInt.args.slice(0, 9)).toEqual(countdown(data.countries.length - 1, data.countries.length - 9));
  });

  it('uses exactly 26 random numbers', () => {
    const randomInt = recording();
    play(randomInt);
    expect(randomInt.args).toHaveLength(26);
    expect(() => play(scripted(...SCRIPT.slice(0, 25)))).toThrow(/ran out/);
  });
});
