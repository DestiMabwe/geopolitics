import { IllegalMoveError, WrongPhaseError } from './errors.js';
import { diceCount, resolveRoll } from './dice.js';
import { isNeighbour } from './map.js';
import { endTurn } from './turn.js';
import { conquestBonus } from './soldiers.js';
import { checkElimination, checkGameOver } from './victory.js';
import { checkPlacements, applyPlacements } from './placements.js';

// The attacker is always the player whose turn it is. Whether the HTTP caller owns
// the game is checked by gameModel (S18), not here.
const currentPlayer = (state) => state.turnOrder[state.currentTurn];

// GAME_RULES §4.5: a failed or stopped attack ends the turn. `state` is already a copy.
function endAttack(state, events) {
  state.attack = null;
  const next = endTurn(state);
  return { state: next.state, events: [...events, ...next.events] };
}

/**
 * Starts an attack from `from` to `to`. No dice are rolled yet. Does not mutate `state`.
 * GAME_RULES §5.1, §4.2
 *
 * Legal only if: phase is `manoeuvre`; the current player owns `from` and not `to`;
 * `to` borders `from`; `soldiers(from) ≥ 2`.
 *
 * @param {object} state
 * @param {string} from attacking country code (`s`)
 * @param {string} to target country code (`t`)
 * @returns {{
 *   state: object & { phase: 'attacking', attack: { from: string, to: string, rolls: 0, bonus: null } },
 *   events: [{ type: 'attackStart', player: string, from: string, to: string }],
 * }}
 * @throws {WrongPhaseError} when the phase is not `manoeuvre` (409)
 * @throws {IllegalMoveError} for an unknown code, wrong ownership, a non-neighbour, or fewer than 2 soldiers (422)
 */
export function startAttack(state, from, to) {
  state = structuredClone(state);
  from = from.toUpperCase();
  to = to.toUpperCase();
  if (state.phase !== 'manoeuvre') {
    throw new WrongPhaseError(`cannot start attack in phase ${state.phase}`);
  }
  if (!state.countries[from]) {
    throw new IllegalMoveError(`unknown attacking country code ${from}`);
  }
  if (!state.countries[to]) {
    throw new IllegalMoveError(`unknown defending country code ${to}`);
  }
  const player = currentPlayer(state);
  if (state.countries[from].owner !== player) {
    throw new IllegalMoveError(`attacking country ${from} is not owned by current player`);
  }
  if (state.countries[to].owner === player) {
    throw new IllegalMoveError(`defending country ${to} is already owned by current player`);
  }
  if (!isNeighbour(state, from, to)) {
    throw new IllegalMoveError(`defending country ${to} does not border attacking country ${from}`);
  }
  if (state.countries[from].soldiers < 2) {
    throw new IllegalMoveError(`attacking country ${from} has fewer than 2 soldiers`);
  }
  state.phase = 'attacking';
  state.attack = { from, to, rolls: 0, bonus: null };
  return {
    state,
    events: [{ type: 'attackStart', player, from, to }],
  };
}

/**
 * Rolls one round of the attack in progress. Does not mutate `state`.
 * GAME_RULES §5.2–§5.4, §4.5
 *
 * `n = diceCount(soldiers(s), soldiers(t))`. `rollDie` is called n times for the attacker,
 * then n times for the defender. Losses come from `resolveRoll`. `attack.rolls` goes up by 1.
 * Events start with
 * `{ type: 'roll', player, from, to, attackerDice, defenderDice, attackerLosses, defenderLosses, attackerLeft, defenderLeft }`.
 * Then:
 * - `soldiers(s) = 1` → failed: `{ type: 'attackFailed', player, from, to }`, `attack = null`,
 *   then the turn ends through `endTurn`, whose state is returned and whose events are appended.
 * - `soldiers(t) = 0` → conquered (§5.5): `t` changes owner, `attack.bonus` is set, phase `occupy`,
 *   `{ type: 'conquest', player, from, to, previousOwner, bonus }`, then `elimination` and
 *   `gameOver` events if they apply. A finished game stops there (no occupy).
 * - otherwise in progress: phase stays `attacking`.
 *
 * @param {object} state
 * @param {() => number} rollDie returns 1–6
 * @returns {{ state: object, events: object[] }}
 * @throws {WrongPhaseError} when no attack is in progress (409)
 */
export function rollAttack(state, rollDie) {
  state = structuredClone(state);
  if (state.phase !== 'attacking' || !state.attack) {
    throw new WrongPhaseError('no attack in progress');
  }
  const { from, to } = state.attack;
  const attackerSoldiers = state.countries[from].soldiers;
  const defenderSoldiers = state.countries[to].soldiers;
  const n = diceCount(attackerSoldiers, defenderSoldiers);
  const attackerDice = Array.from({ length: n }, rollDie);
  const defenderDice = Array.from({ length: n }, rollDie);
  const { attackerLosses, defenderLosses } = resolveRoll(attackerDice, defenderDice);
  state.countries[from].soldiers -= attackerLosses;
  state.countries[to].soldiers -= defenderLosses;
  state.attack.rolls += 1;
  const player = currentPlayer(state);
  const events = [{
    type: 'roll', player, from, to,
    attackerDice, defenderDice,
    attackerLosses, defenderLosses,
    attackerLeft: state.countries[from].soldiers,
    defenderLeft: state.countries[to].soldiers,
  }];
  if (state.countries[from].soldiers === 1) {
    return endAttack(state, [...events, { type: 'attackFailed', player, from, to }]);
  }
  if (state.countries[to].soldiers === 0) {
    return conquer(state, events);
  }
  return { state, events };
}

// GAME_RULES §5.5. `state` is already a copy. t keeps 0 soldiers until occupy moves some in.
function conquer(state, events) {
  const { from, to } = state.attack;
  const player = currentPlayer(state);
  const previousOwner = state.countries[to].owner;
  const bonus = conquestBonus(state.countries[to].value);
  state.countries[to].owner = player;
  state.attack.bonus = bonus;
  state.phase = 'occupy';
  events = [...events, { type: 'conquest', player, from, to, previousOwner, bonus }];

  const elimination = checkElimination(state, previousOwner, player);
  const over = checkGameOver(elimination.state);
  return { state: over.state, events: [...events, ...elimination.events, ...over.events] };
}

/**
 * Finishes a conquest: moves `count` soldiers from `s` into `t`, places the bonus, ends the turn.
 * Does not mutate `state`. GAME_RULES §5.6, §4.4, I-4
 *
 * @param {object} state
 * @param {number} count soldiers moved in, 1 … soldiers(s) − 1
 * @param {Record<string, number>} placements the bonus split across the player's countries, summing to `attack.bonus`
 * @returns {{ state: object, events: object[] }} `{ type: 'occupy', player, from, to, count, placements }`, then `endTurn`'s events
 * @throws {WrongPhaseError} unless the phase is `occupy` (409)
 * @throws {IllegalMoveError} for a count out of range or bad placements (422)
 */
export function occupy(state, count, placements) {
  state = structuredClone(state);
  if (state.phase !== 'occupy' || !state.attack) {
    throw new WrongPhaseError('nothing to occupy');
  }
  const { from, to, bonus } = state.attack;
  const player = currentPlayer(state);
  const max = state.countries[from].soldiers - 1;
  if (!Number.isInteger(count) || count < 1 || count > max) {
    throw new IllegalMoveError(`move in between 1 and ${max} soldiers`);
  }
  checkPlacements(state, player, placements, bonus);

  state.countries[from].soldiers -= count;
  state.countries[to].soldiers += count;
  applyPlacements(state, placements);
  return endAttack(state, [{ type: 'occupy', player, from, to, count, placements }]);
}

/**
 * Stops the attack in progress. Both countries keep their soldiers. Does not mutate `state`.
 * GAME_RULES §5.4, §4.5
 *
 * Emits `{ type: 'attackStopped', player, from, to }`, sets `attack = null`, then the turn
 * ends through `endTurn`, whose state is returned and whose events are appended.
 *
 * @param {object} state
 * @returns {{ state: object, events: object[] }}
 * @throws {WrongPhaseError} when no attack is in progress (409)
 */
export function stopAttack(state) {
  state = structuredClone(state);
  if (state.phase !== 'attacking' || !state.attack) {
    throw new WrongPhaseError('no attack in progress');
  }
  const { from, to } = state.attack;
  return endAttack(state, [{ type: 'attackStopped', player: currentPlayer(state), from, to }]);
}
