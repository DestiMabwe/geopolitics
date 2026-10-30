/**
 * One country on the board, as a read-only snapshot. Changes go through `Game`.
 * ARCHITECTURE §1 (Domain classes)
 */
export class Nation {
  #code;
  #country;
  #neighbours;

  /**
   * @param {string} code
   * @param {{ name: string, value: number, owner: string, soldiers: number }} country
   * @param {string[]} neighbours codes from `state.borders[code]`
   */
  constructor(code, country, neighbours) {
    this.#code = code;
    this.#country = country;
    this.#neighbours = neighbours;
  }

  /** @returns {string} */
  get code() {
    return this.#code;
  }

  /** @returns {string} */
  get name() {
    return this.#country.name;
  }

  /** @returns {number} the fixed soldier value, GAME_RULES §1.2 */
  get value() {
    return this.#country.value;
  }

  /** @returns {string} a player id */
  get owner() {
    return this.#country.owner;
  }

  /** @returns {number} */
  get soldiers() {
    return this.#country.soldiers;
  }

  /** @returns {string[]} a copy, so a caller can't change the map */
  get neighbours() {
    return [...this.#neighbours];
  }

  /**
   * @param {string} code
   * @returns {boolean}
   */
  isNeighbourOf(code) {
    return this.#neighbours.includes(code);
  }
}
