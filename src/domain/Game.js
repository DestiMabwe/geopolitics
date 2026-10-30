import { createGame } from '../game/setup.js';
import { startAttack, rollAttack, stopAttack, occupy } from '../game/attack.js';
import { placeReinforcements } from '../game/reinforce.js';
import { transfer } from '../game/transfer.js';
import { skip } from '../game/turn.js';
import { currentPlayer } from '../game/players.js';
import { Nation } from './Nation.js';
import { Player } from './Player.js';
import { Battle } from './Battle.js';

/**
 * The whole game. State changes only through the action methods. Each one calls the engine,
 * replaces `#state` with the returned state, and returns the events. If the engine throws,
 * `#state` is left as it was. ARCHITECTURE §1 (Domain classes)
 *
 * `#state` holds the engine's fields. `#meta` holds the stored fields the engine never sees:
 * `ownerUid`, `version`, `eventSeq`, `llmCalls`, `createdAt`, `updatedAt`. They stay apart
 * because the engine's `structuredClone` would strip Firestore Timestamps of their methods.
 * Bumping `version` and `eventSeq` is the model's job, so the action methods leave them alone.
 */
export class Game {
  #state;
  #meta;

  /** Use `Game.start` or `Game.fromDocument`. */
  constructor(state, meta) {
    this.#state = state;
    this.#meta = meta;
  }

  /**
   * Sets up a new game with `createGame`. Meta is `{ ownerUid, version: 1,
   * eventSeq: events.length, llmCalls: 0 }`; the model adds the timestamps. GAME_RULES §3
   *
   * @param {{ ownerUid: string, humanCode: string, catalogue: object[], randomInt: (max: number) => number }} options
   * @returns {{ game: Game, events: object[] }}
   */
  static start({ ownerUid, humanCode, catalogue, randomInt }) {
    const { state, events } = createGame({ humanCode, catalogue, randomInt });
    const meta = { ownerUid, version: 1, eventSeq: events.length, llmCalls: 0 };
    return { game: new Game(state, meta), events };
  }

  /**
   * Rebuilds a game from a stored document. Later changes to `doc` must not reach the game.
   *
   * @param {object} doc the document's data, without `id`
   * @returns {Game}
   */
  static fromDocument(doc) {
    const { ownerUid, version, eventSeq, llmCalls, createdAt, updatedAt, ...state } = doc;
    const meta = { ownerUid, version, eventSeq, llmCalls, createdAt, updatedAt };
    return new Game(structuredClone(state), meta);
  }

  /**
   * The document to store. Changing the result must not reach the game.
   * Timestamps come back as the same objects.
   *
   * @returns {object}
   */
  toDocument() {
    return { ...structuredClone(this.#state), ...this.#meta };
  }

  /** @returns {'active' | 'won' | 'lost'} */
  get status() {
    return this.#state.status;
  }

  /** @returns {string | null} */
  get winner() {
    return this.#state.winner;
  }

  /** @returns {number} */
  get round() {
    return this.#state.round;
  }

  /** @returns {'reinforce' | 'manoeuvre' | 'attacking' | 'occupy'} */
  get phase() {
    return this.#state.phase;
  }

  /** @returns {number} */
  get version() {
    return this.#meta.version;
  }

  /** @returns {Player} the player whose turn it is */
  get currentPlayer() {
    return this.player(currentPlayer(this.#state));
  }

  /** @returns {Nation[]} */
  get nations() {
    return Object.entries(this.#state.countries).map(
      ([code, country]) => new Nation(code, country, this.#state.borders[code]),
    );
  }

  /** @returns {Player[]} */
  get players() {
    const { nations } = this;
    return Object.entries(this.#state.players).map(([id, player]) => new Player(id, player, nations));
  }

  /** @returns {Battle | null} null when no attack is in progress */
  get battle() {
    if (this.#state.attack === null) return null;
    return new Battle(this.#state.attack);
  }

  /**
   * @param {string} code
   * @returns {Nation}
   */
  nation(code) {
    return this.nations.find((nation) => nation.code === code);
  }

  /**
   * @param {string} id
   * @returns {Player}
   */
  player(id) {
    return this.players.find((player) => player.id === id);
  }

  // Keeps the engine's new state. The engine runs first, so a rejected move never gets here.
  #apply({ state, events }) {
    this.#state = state;
    return events;
  }

  /**
   * GAME_RULES §7.3
   * @param {Record<string, number>} placements
   * @returns {object[]} events
   */
  reinforce(placements) {
    return this.#apply(placeReinforcements(this.#state, placements));
  }

  /**
   * GAME_RULES §6
   * @param {string} from
   * @param {string} to
   * @param {number} count
   * @returns {object[]} events
   */
  transfer(from, to, count) {
    return this.#apply(transfer(this.#state, from, to, count));
  }

  /**
   * GAME_RULES §5.1
   * @param {string} from
   * @param {string} to
   * @returns {object[]} events
   */
  attack(from, to) {
    return this.#apply(startAttack(this.#state, from, to));
  }

  /**
   * GAME_RULES §5.2–§5.4
   * @param {() => number} rollDie
   * @returns {object[]} events
   */
  roll(rollDie) {
    return this.#apply(rollAttack(this.#state, rollDie));
  }

  /**
   * GAME_RULES §5.4
   * @returns {object[]} events
   */
  stop() {
    return this.#apply(stopAttack(this.#state));
  }

  /**
   * GAME_RULES §5.6
   * @param {number} count
   * @param {Record<string, number>} placements
   * @returns {object[]} events
   */
  occupy(count, placements) {
    return this.#apply(occupy(this.#state, count, placements));
  }

  /**
   * GAME_RULES §4.2
   * @returns {object[]} events
   */
  skip() {
    return this.#apply(skip(this.#state));
  }
}
