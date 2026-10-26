import { IllegalMoveError, WrongPhaseError } from './errors.js';
import { diceCount, resolveRoll } from './dice.js';
import { isNeighbour } from './map.js';
import { endTurn } from './turn.js';

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
 * - otherwise in progress: phase stays `attacking`.
 * - `soldiers(t) = 0` → conquest, which is S09 (§5.5).
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
    // conquest is S09 (§5.5)
    throw new Error('conquest not implemented');
  }
  return { state, events };
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
