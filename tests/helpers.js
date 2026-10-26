/**
 * Stands in for `rollDie` / `randomInt` in tests.
 * Returns a function that yields `values` in order, one per call,
 * and throws once they run out, so a test can't silently use more randomness than it scripted.
 *
 * @param {...number} values
 * @returns {() => number}
 */
export function scripted(...values) {
  let position = 0;
  return function () {
    if (position >= values.length) {
      throw new Error(`scripted(): ran out after ${values.length} value(s)`);
    }
    const result = values[position];
    position++;
    return result;
  };
}

/**
 * A small valid game state for engine tests. It is the human's turn in round 1, phase `manoeuvre`.
 *
 *   EEE(human,1) ── AAA(human,4) ── BBB(npc,2)
 *                       │      ╲      │
 *                       │       ╲     │
 *                       └────── CCC(npc,3) ── DDD(npc,1)
 *
 * Borders: AAA–BBB, AAA–CCC, AAA–EEE, BBB–CCC, BBB–EEE, CCC–DDD. AAA does not border DDD.
 *
 * `overrides` replaces top-level fields, except `countries`, which is merged per code,
 * so `makeState({ countries: { AAA: { soldiers: 10 } } })` changes only AAA's soldiers.
 *
 * @param {object} [overrides]
 * @returns {object} a fresh state object
 */
export function makeState(overrides = {}) {
  const { countries: countryOverrides = {}, ...rest } = overrides;
  const country = (name, value, owner, soldiers) => ({ name, value, lat: 0, lng: 0, owner, soldiers });
  const countries = {
    AAA: country('Country A', 4, 'human', 4),
    BBB: country('Country B', 2, 'npc:BBB', 2),
    CCC: country('Country C', 3, 'npc:CCC', 3),
    DDD: country('Country D', 1, 'npc:DDD', 1),
    EEE: country('Country E', 1, 'human', 1),
  };
  for (const [code, fields] of Object.entries(countryOverrides)) {
    countries[code] = { ...countries[code], ...fields };
  }
  const player = (type, profile, homeCode) => ({ type, profile, homeCode, eliminated: false });
  return {
    status: 'active',
    winner: null,
    round: 1,
    turnOrder: ['human', 'npc:BBB', 'npc:CCC', 'npc:DDD'],
    currentTurn: 0,
    phase: 'manoeuvre',
    pendingReinforcements: 0,
    players: {
      human: player('human', null, 'AAA'),
      'npc:BBB': player('npc', 'warlord', 'BBB'),
      'npc:CCC': player('npc', 'fortress', 'CCC'),
      'npc:DDD': player('npc', 'opportunist', 'DDD'),
    },
    countries,
    borders: {
      AAA: ['BBB', 'CCC', 'EEE'],
      BBB: ['AAA', 'CCC', 'EEE'],
      CCC: ['AAA', 'BBB', 'DDD'],
      DDD: ['CCC'],
      EEE: ['AAA', 'BBB'],
    },
    attack: null,
    ...rest,
  };
}
