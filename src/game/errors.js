/**
 * Thrown when a move breaks a rule in GAME_RULES.md. Controllers map it to 422.
 */
export class IllegalMoveError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

/**
 * Thrown when an action arrives in the wrong phase. Controllers map it to 409.
 */
export class WrongPhaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WrongPhaseError';
  }
}
