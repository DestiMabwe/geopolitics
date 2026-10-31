import { startAttack, rollAttack, stopAttack, occupy } from './attack.js';
import { WrongPhaseError } from './errors.js';
import { currentPlayer } from './players.js';
import { placeReinforcements } from './reinforce.js';
import { skip } from './turn.js';
import { leader } from './victory.js';

// GAME_RULES §8.1. Fortress's eligibility, s ≥ 2t + 1, is the same as its threshold, s − 2t ≥ 1.
const PROFILES = {
  warlord: {
    threshold: 0,
    score: (s, t) => s.soldiers - t.soldiers + (t.owner === 'human' ? 2 : 0),
    stop: () => false,
  },
  fortress: {
    threshold: 1,
    score: (s, t) => s.soldiers - 2 * t.soldiers,
    stop: (s, t) => s.soldiers < 2 * t.soldiers + 1,
  },
  opportunist: {
    threshold: 2,
    score: (s, t, leaderId) =>
      s.soldiers - t.soldiers + (t.soldiers <= 2 ? 3 : 0) + (t.owner === leaderId ? 2 : 0),
    stop: (s, t) => s.soldiers <= t.soldiers,
  },
};

const ROLL_LIMIT = 20; // GAME_RULES §8.2

const mostSoldiers = (a, b) => b.soldiers - a.soldiers;
const fewestSoldiers = (a, b) => a.soldiers - b.soldiers;

// §8.1: the NPC's first country in `order`, ties to the lower code.
function pickCountry(state, playerId, order) {
  const [[code]] = Object.entries(state.countries)
    .filter(([, c]) => c.owner === playerId)
    .sort(([aCode, a], [bCode, b]) => order(a, b) || aCode.localeCompare(bCode));
  return code;
}

/**
 * Picks the attack an NPC wants this turn, or decides to skip. Does not mutate `state`.
 * GAME_RULES §8.1
 *
 * Candidates are every `(s, t)` where the NPC owns `s`, `soldiers(s) ≥ 2`, `t` borders `s`
 * and the NPC does not own `t`. Each is scored by the NPC's profile, and any below the
 * profile's threshold are dropped. Tie-break order: highest score → lowest `soldiers(t)`
 * → `t` code alphabetical → `s` code alphabetical.
 *
 * Trusts `state`: only `playNpcTurn` calls this, so it never sees client input.
 *
 * @param {object} state
 * @param {string} playerId the NPC choosing, e.g. `npc:BRA`
 * @returns {{ from: string, to: string } | null} the attack, or `null` to skip
 */
export function chooseTarget(state, playerId) {
  const { threshold, score } = PROFILES[state.players[playerId].profile];
  const owners = Object.values(state.countries).map((c) => c.owner);
  // Eliminated players own no countries, so they can't appear here.
  const leaderId = leader(owners.filter((owner) => owner !== playerId));

  const candidates = [];
  for (const [from, source] of Object.entries(state.countries)) {
    if (source.owner !== playerId || source.soldiers < 2) continue;
    for (const to of state.borders[from]) {
      const target = state.countries[to];
      if (target.owner === playerId) continue;
      const points = score(source, target, leaderId);
      if (points >= threshold) candidates.push({ from, to, points, soldiers: target.soldiers });
    }
  }
  if (candidates.length === 0) return null;

  const [{ from, to }] = candidates.sort(byBestAttack);
  return { from, to };
}

// §8.1 tie-break order.
const byBestAttack = (a, b) =>
  b.points - a.points ||
  a.soldiers - b.soldiers ||
  a.to.localeCompare(b.to) ||
  a.from.localeCompare(b.from);

/**
 * Splits `amount` new soldiers across the NPC's countries. Does not mutate `state`.
 * GAME_RULES §8.1
 *
 * Warlord and Opportunist put them all on their country with the most soldiers. Fortress
 * places one at a time, each on its country with the fewest, counting the ones it has just
 * placed. Ties go to the lower code. Fortress's conquest bonus uses this too.
 *
 * @param {object} state
 * @param {string} playerId
 * @param {number} amount soldiers to place
 * @returns {Record<string, number>} `{ CODE: n }`, listing only countries that receive soldiers
 */
export function npcReinforce(state, playerId, amount) {
  if (state.players[playerId].profile !== 'fortress') {
    return { [pickCountry(state, playerId, mostSoldiers)]: amount };
  }

  state = structuredClone(state); // a copy, so Fortress can count what it has just placed
  const amounts = {};
  for (let i = 0; i < amount; i++) {
    const code = pickCountry(state, playerId, fewestSoldiers);
    amounts[code] = (amounts[code] || 0) + 1;
    state.countries[code].soldiers++;
  }
  return amounts;
}

/**
 * Whether the NPC stops the attack in progress. Checked before every roll, including the
 * first, so an Opportunist with `soldiers(s) ≤ soldiers(t)` stops without rolling.
 * Does not mutate `state`. GAME_RULES §8.1, §8.2, §8.3
 *
 * Warlord: never. Fortress: `soldiers(s) < 2 × soldiers(t) + 1`.
 * Opportunist: `soldiers(s) ≤ soldiers(t)`. Every profile stops once `attack.rolls` reaches 20.
 *
 * @param {object} state phase `attacking`
 * @param {string} playerId
 * @returns {boolean}
 */
export function shouldStop(state, playerId) {
  const { from, to, rolls } = state.attack;
  const { stop } = PROFILES[state.players[playerId].profile];
  return rolls >= ROLL_LIMIT || stop(state.countries[from], state.countries[to]);
}

/**
 * The NPC's occupy after a conquest. Does not mutate `state`. GAME_RULES §8.1, §5.6
 *
 * Warlord moves in `max(1, floor((soldiers(s) − 1) / 2))`, Fortress and Opportunist move in 1.
 * Warlord and Opportunist put the whole bonus on the new country. Fortress uses its Reinforce
 * rule, worked out after the move-in, because §5.6 moves soldiers in first.
 *
 * @param {object} state phase `occupy`
 * @param {string} playerId
 * @returns {{ count: number, placements: Record<string, number> }} the arguments for `occupy`
 */
export function npcOccupy(state, playerId) {
  const { from, to, bonus } = state.attack;
  const profile = state.players[playerId].profile;
  const count =
    profile === 'warlord' ? Math.max(1, Math.floor((state.countries[from].soldiers - 1) / 2)) : 1;
  if (profile !== 'fortress') return { count, placements: { [to]: bonus } };

  // A copy, so Fortress's Reinforce rule sees the soldiers that have just moved in.
  const afterMoveIn = structuredClone(state);
  afterMoveIn.countries[from].soldiers -= count;
  afterMoveIn.countries[to].soldiers += count;
  return { count, placements: npcReinforce(afterMoveIn, playerId, bonus) };
}

/**
 * Plays the current NPC's whole turn through the same actions the human uses. Does not mutate
 * `state`. GAME_RULES §4, §8, §9.2
 *
 * Reinforce (if the phase is `reinforce`) → `chooseTarget` → `skip`, or `startAttack`, then
 * `shouldStop` before each roll → `stopAttack` or `rollAttack` → `occupy` after a conquest.
 * If the human loses their last country the game is over: nothing more happens, even though
 * the phase is still `occupy`.
 *
 * @param {object} state
 * @param {() => number} rollDie returns 1–6
 * @returns {{ state: object, events: object[] }} every event in order, ending with the next
 *   player's `turnStart`, or with `gameOver` if the game ended
 * @throws {WrongPhaseError} on the human's turn (409)
 */
export function playNpcTurn(state, rollDie) {
  const player = currentPlayer(state);
  if (state.players[player].type === 'human') {
    throw new WrongPhaseError('cannot play an NPC turn on the human turn');
  }

  const events = [];
  const apply = (result) => {
    state = result.state;
    events.push(...result.events);
  };

  if (state.phase === 'reinforce') {
    apply(placeReinforcements(state, npcReinforce(state, player, state.pendingReinforcements)));
  }

  const target = chooseTarget(state, player);
  if (!target) {
    apply(skip(state));
    return { state, events };
  }

  apply(startAttack(state, target.from, target.to));
  // Stopping or failing ends the turn, and a conquest moves to `occupy`, so either leaves the loop.
  while (state.phase === 'attacking') {
    apply(shouldStop(state, player) ? stopAttack(state) : rollAttack(state, rollDie));
  }

  // §9.2: if that conquest ended the game, the phase is still `occupy` but nothing more happens.
  if (state.phase === 'occupy' && state.status === 'active') {
    const { count, placements } = npcOccupy(state, player);
    apply(occupy(state, count, placements));
  }
  return { state, events };
}
