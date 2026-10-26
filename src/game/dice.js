import { IllegalMoveError } from './errors.js';

/**
 * Dice each side rolls in one roll: min(attacking − 1, defending). No 3-dice cap.
 * GAME_RULES §5.2
 * @param {number} attacking soldiers in the attacking country
 * @param {number} defending soldiers in the defending country
 * @returns {number}
 * @throws {IllegalMoveError} when the attacker has fewer than 2 soldiers
 */

export function diceCount(attacking, defending) {
    if (attacking < 2) {
        throw new IllegalMoveError('Attacker must have at least 2 soldiers to roll dice');
    }
    if (attacking - 1 < defending) {
        return attacking - 1;
    }
    if (attacking - 1 >= defending) {
        return defending;
    }
    if (attacking - 1 === defending) {
        return defending;
    }
    if (attacking >= 2 && defending >= 1) {
        return Math.min(attacking - 1, defending);
    }
    if (attacking < 3 && defending < 1) {
        return 0;
    }
    if (attacking < 3 && defending >= 1) {
        return 1;
    }
}

/**
 * Losses from one roll. Dice are paired in the order rolled (not sorted):
 * attacker die i against defender die i. The lower die loses 1 soldier; a tie kills nobody.
 * Does not mutate its inputs.
 * GAME_RULES §5.3
 * @param {number[]} attackerDice
 * @param {number[]} defenderDice
 * @returns {{ attackerLosses: number, defenderLosses: number }}
 * @throws {Error} 'same number of dice' when the two lists differ in length (§5.2 says they never do)
 */
export function resolveRoll(attackerDice, defenderDice) {
    attackerDice = [...attackerDice];
    defenderDice = [...defenderDice];
    if (attackerDice.length !== defenderDice.length) {
        throw new Error('same number of dice');
    }
    let attackerLosses = 0;
    let defenderLosses = 0;
    for (let i = 0; i < attackerDice.length; i++) {
        const a = attackerDice[i];
        const d = defenderDice[i];
        if (a > d) {
            defenderLosses++;
        } else if (a < d) {
            attackerLosses++;
        }
    }
    return { attackerLosses, defenderLosses };
}
