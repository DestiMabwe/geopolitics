import { IllegalMoveError } from './errors.js';
import { soldierValue } from './soldiers.js';
import { buildBorders } from './map.js';

/**
 * Builds a new game: the human's country plus 9 random others, the map, soldiers,
 * turn order and NPC profiles. Does not mutate `catalogue`.
 * GAME_RULES §2, §3
 *
 * `randomInt` is called exactly 26 times, in this order:
 * 1. Picks (9 calls, §3.2): `remaining` = the catalogue without the human, in catalogue order.
 *    9 times: `i = randomInt(remaining.length)`, then take `remaining.splice(i, 1)`.
 * 2. Turn order (9 calls, §3.4): start from `['human', ...npc ids in pick order]`, then
 *    Fisher–Yates: `for i = 9 → 1: j = randomInt(i + 1); swap(i, j)`.
 * 3. Profiles (8 calls, §2.3): start from
 *    `['warlord' ×3, 'fortress' ×3, 'opportunist' ×3]`, same Fisher–Yates (i = 8 → 1),
 *    then hand them to the NPCs in turn order, skipping the human.
 *
 * @param {object} args
 * @param {string} args.humanCode the country the human chose (§3.1)
 * @param {{ code: string, name: string, population: number, lat: number, lng: number }[]} args.catalogue
 * @param {(maxExclusive: number) => number} args.randomInt
 * @returns {{
 *   state: {
 *     status: 'active', winner: null, round: 1,
 *     turnOrder: string[], currentTurn: 0,
 *     phase: 'manoeuvre', pendingReinforcements: 0,
 *     players: Record<string, { type: 'human'|'npc', profile: null|'warlord'|'fortress'|'opportunist', homeCode: string, eliminated: false }>,
 *     countries: Record<string, { name: string, value: number, lat: number, lng: number, owner: string, soldiers: number }>,
 *     borders: Record<string, string[]>,
 *     attack: null,
 *   },
 *   events: [{ type: 'turnStart', player: string, round: 1 }],
 * }}
 * @throws {IllegalMoveError} if `humanCode` is not in the catalogue
 */

// Fisher–Yates on a copy (§3.4, §2.3): for i = last → 1, swap(i, randomInt(i + 1)).
function shuffle(list, randomInt) {
  const out = [...list];
  let i = out.length - 1;
  while (i > 0) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
    i--;
  }
  return out;
}

export function createGame({ humanCode, catalogue, randomInt }) {
  if (!catalogue.some((c) => c.code === humanCode)) {
    throw new IllegalMoveError(`humanCode ${humanCode} not in catalogue`);
  }
  if (catalogue.length < 10) {
    throw new IllegalMoveError(`catalogue must have at least 10 countries, got ${catalogue.length}`);
  }

  // §3.2: pick 9 from a copy, so splice never touches the caller's catalogue
  const human = catalogue.find((c) => c.code === humanCode);
  const remaining = catalogue.filter((c) => c.code !== humanCode);
  const picks = [];
  for (let n = 0; n < 9; n++) {
    const i = randomInt(remaining.length);
    picks.push(remaining.splice(i, 1)[0]);
  }
  const npcIds = picks.map((c) => `npc:${c.code}`);

  // §3.4
  const turnOrder = shuffle(['human', ...npcIds], randomInt);

  // §2.3: shuffled profiles go to the NPCs in turn order, skipping the human
  const npcProfiles = shuffle(
    ['warlord', 'warlord', 'warlord', 'fortress', 'fortress', 'fortress', 'opportunist', 'opportunist', 'opportunist'],
    randomInt,
  );
  const profileOf = {};
  turnOrder.filter((id) => id !== 'human').forEach((id, n) => (profileOf[id] = npcProfiles[n]));

  const chosen = [human, ...picks];
  const players = {};
  const countries = {};
  for (const c of chosen) {
    const id = c === human ? 'human' : `npc:${c.code}`;
    players[id] = {
      type: c === human ? 'human' : 'npc',
      profile: c === human ? null : profileOf[id],
      homeCode: c.code,
      eliminated: false,
    };
    const value = soldierValue(c.population);
    countries[c.code] = { name: c.name, value, lat: c.lat, lng: c.lng, owner: id, soldiers: value };
  }

  const state = {
    status: 'active',
    winner: null,
    round: 1,
    turnOrder,
    currentTurn: 0,
    phase: 'manoeuvre',
    pendingReinforcements: 0,
    players,
    countries,
    borders: buildBorders(chosen),
    attack: null,
  };
  return { state, events: [{ type: 'turnStart', player: turnOrder[0], round: 1 }] };
}
