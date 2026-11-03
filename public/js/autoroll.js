// Autoroll (agreed 2026-11-03). With the switch on, the page sends the ordinary roll request again and again
// while an attack is open: still one roll per request, the server still rolls every die, and GAME_RULES is
// untouched. Pure (no DOM), so it runs in the unit tests. Nothing here picks or computes a number.

/** The server allows 60 attack requests a minute (ARCHITECTURE §5.2); this keeps a long attack well under it. */
export const MIN_AUTO_DELAY_MS = 1200;
/** The first roll of an attack follows its declaration quickly, since nothing is on screen to read yet. */
export const FIRST_ROLL_DELAY_MS = 800;

/**
 * Whether the page should send the next roll by itself. Only in an open attack of yours, with nothing else
 * going on. When the attack ends (conquered, failed, stopped) the phase moves on and this turns false.
 *
 * @param {object} state
 * @param {object | null} state.game  the public game
 * @param {boolean} state.auto  the switch
 * @param {boolean} state.pending  a request is already out
 * @param {boolean} state.replaying  NPC events are still being replayed
 * @returns {boolean}
 */
export function shouldAutoRoll({ game, auto, pending, replaying }) {
  return Boolean(
    auto &&
      game &&
      game.isOwner &&
      game.status === 'active' &&
      game.phase === 'attacking' &&
      game.turnOrder[game.currentTurn] === 'human' &&
      !pending &&
      !replaying,
  );
}

/**
 * How long to wait before the next roll: as long as an NPC roll stays on screen, so the dice land and can
 * be read, but never faster than the server allows, even in fast-forward.
 *
 * @param {object} options
 * @param {boolean} options.fast
 * @param {{ roll: number, rollFast: number }} options.pace  from readPace()
 * @param {boolean} options.firstRoll  no roll yet in this attack
 * @returns {number} milliseconds
 */
export function autoDelay({ fast, pace, firstRoll }) {
  if (firstRoll) return FIRST_ROLL_DELAY_MS;
  return Math.max(MIN_AUTO_DELAY_MS, fast ? pace.rollFast : pace.roll);
}

const KEY = 'geopolitics.autoRoll';

/** The remembered switch, off by default. Storage can be blocked, so every access is wrapped. @returns {boolean} */
export function loadAuto(storage = globalThis.localStorage) {
  try {
    return storage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

/** @param {boolean} on */
export function saveAuto(on, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, String(on));
  } catch {
    // Not remembered; autoroll still works for this visit.
  }
}
