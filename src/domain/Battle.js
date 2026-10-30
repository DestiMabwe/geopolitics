/**
 * The attack in progress, as a read-only snapshot. The engine clears `state.attack` when an
 * attack fails or stops, so those endings are only in the events, and a Battle is either
 * still being rolled or conquered and waiting for occupy.
 * ARCHITECTURE §1 (Domain classes), GAME_RULES §5.4
 */
export class Battle {
  #attack;

  /** @param {{ from: string, to: string, rolls: number, bonus: number | null }} attack */
  constructor(attack) {
    this.#attack = attack;
  }

  /** @returns {string} */
  get from() {
    return this.#attack.from;
  }

  /** @returns {string} */
  get to() {
    return this.#attack.to;
  }

  /** @returns {number} how many rolls so far */
  get rolls() {
    return this.#attack.rolls;
  }

  /** @returns {boolean} true once the country has fallen (the bonus is set) */
  get isFinished() {
    return this.#attack.bonus !== null;
  }

  /** @returns {'conquered' | null} */
  get outcome() {
    if (!this.isFinished) return null;
    return 'conquered';
  }
}
