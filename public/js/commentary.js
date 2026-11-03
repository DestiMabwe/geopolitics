// Client side of the commentary flow (ARCHITECTURE §4.3). Pure (no DOM).

// The same four types as LLM_EVENTS in src/game/commentary.js; the browser can't import from src/.
const LLM_TYPES = new Set(['roll', 'conquest', 'elimination', 'gameOver']);

/**
 * True when the event should ask the server for an LLM line: one of the four types, with no line saved yet.
 *
 * @param {{ type: string, aiText?: string | null }} event
 * @returns {boolean}
 */
export function wantsAiLine(event) {
  return LLM_TYPES.has(event.type) && !event.aiText;
}

/**
 * @param {string} gameId
 * @param {number} seq  the event's `seq`
 * @returns {string} the API path; event ids are the seq padded to 6 digits
 */
export function commentaryPath(gameId, seq) {
  return `/games/${gameId}/events/${String(seq).padStart(6, '0')}/commentary`;
}
