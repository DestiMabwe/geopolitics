/**
 * One of the 10 players, as a read-only snapshot. ARCHITECTURE §1 (Domain classes)
 */
export class Player {
  #id;
  #player;
  #nations;

  /**
   * @param {string} id `human` or `npc:<CODE>`
   * @param {{ type: 'human' | 'npc', profile: string | null, homeCode: string, eliminated: boolean }} player
   * @param {import('./Nation.js').Nation[]} nations every nation in the game
   */
  constructor(id, player, nations) {
    this.#id = id;
    this.#player = player;
    this.#nations = nations;
  }

  /** @returns {string} */
  get id() {
    return this.#id;
  }

  /** @returns {'human' | 'npc'} */
  get type() {
    return this.#player.type;
  }

  /** @returns {string | null} `warlord`, `fortress`, `opportunist`, or null for the human */
  get profile() {
    return this.#player.profile;
  }

  /** @returns {string} */
  get homeCode() {
    return this.#player.homeCode;
  }

  /** @returns {boolean} */
  get eliminated() {
    return this.#player.eliminated;
  }

  /** @returns {boolean} */
  get isHuman() {
    return this.#player.type === 'human';
  }

  /** @returns {import('./Nation.js').Nation[]} only the nations this player owns */
  get ownedNations() {
    return this.#nations.filter((nation) => nation.owner === this.#id);
  }
}

