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
