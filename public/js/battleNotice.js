// Battle news as short pop-ups instead of a wordy log (design agreed 2026-11-03). Which events pop up,
// what they say, and a queue that shows one at a time. Pure (no DOM), so it runs in the unit tests.
// Nothing here changes the game or computes a number: the words come from eventText and the event itself.

import { eventText, eventReason } from './eventText.js';
import { wantsAiLine } from './commentary.js';

/** A notice never leaves before this, so a quick follow-up cannot replace it unread. */
export const MIN_HOLD_MS = 2500;
/** The longest a notice waits for its LLM line before settling for the template line. */
export const AI_WAIT_MS = 4000;
export const MAX_HOLD_MS = 7000;
const READ_MS_PER_CHAR = 40;

// An NPC deciding what to do. The reason from the engine goes underneath (the brief asks NPCs to justify).
const NPC_DECISIONS = new Set(['attackStart', 'skip', 'attackStopped']);
// Big moments, whoever causes them.
const BIG_MOMENTS = new Set(['conquest', 'elimination']);

/**
 * The pop-up for one event, or null when it gets none. Rolls, turn starts, reinforcements, transfers
 * and occupations never pop up (the dice panel and board show them); your own attack, hold or stop
 * does not either, since you just clicked it. In fast-forward there are no per-event pop-ups (see
 * `summaryNotice`). The owner's Game over dialog already covers the end of the game.
 *
 * @param {{ seq: number, type: string, data?: object, text?: string | null, aiText?: string | null }} event
 * @param {object} game  for country and player names
 * @param {{ isOwner: boolean, fast: boolean }} view
 * @returns {{ id: number | string, headline: string, reason: string, awaitAi: boolean } | null}
 */
export function noticeFor(event, game, { isOwner, fast }) {
  if (fast) return null;
  const mine = event.data?.player === 'human';
  const wanted =
    BIG_MOMENTS.has(event.type) ||
    (NPC_DECISIONS.has(event.type) && !mine) ||
    (event.type === 'gameOver' && !isOwner);
  if (!wanted) return null;
  return {
    id: event.seq,
    headline: event.aiText || event.text || eventText(event, game),
    reason: eventReason(event),
    // Only the owner asks the server for an LLM line, so only the owner can wait for one.
    awaitAi: isOwner && wantsAiLine(event),
  };
}

/**
 * Fast-forward: one pop-up per NPC turn, from the turn summary.
 *
 * @param {number | string} id
 * @param {string} summary  from turnSummary()
 * @returns {{ id: number | string, headline: string, reason: string, awaitAi: boolean } | null}
 */
export function summaryNotice(id, summary) {
  return summary ? { id, headline: summary, reason: '', awaitAi: false } : null;
}

/**
 * How long a notice stays: long enough to read, never under the minimum or over the maximum.
 *
 * @param {{ headline: string, reason: string }} notice
 * @returns {number} milliseconds
 */
export function holdMs({ headline, reason }) {
  const chars = headline.length + (reason?.length ?? 0);
  return Math.min(MAX_HOLD_MS, MIN_HOLD_MS + READ_MS_PER_CHAR * chars);
}

/**
 * Shows notices one at a time. A notice that is waiting for its LLM line stays until the line arrives
 * (`update`) or the cap passes. A newer notice waits for the current one's minimum, then replaces it;
 * only the newest waiting notice is kept.
 *
 * @param {object} handlers
 * @param {(notice: object) => void} handlers.onShow
 * @param {(notice: object) => void} handlers.onUpdate  the shown notice's text changed (the LLM line arrived)
 * @param {() => void} handlers.onHide
 * @param {() => number} [handlers.now]
 * @returns {{ push(notice: object): void, update(id: number | string, headline: string): void, dismiss(): void, clear(): void }}
 */
export function createNoticeQueue({ onShow, onUpdate, onHide, now = Date.now }) {
  let current = null; // { notice, minUntil, expireAt }
  let pending = null;
  let timer = null;

  const stopTimer = () => {
    clearTimeout(timer);
    timer = null;
  };

  const start = (notice) => {
    const t = now();
    const waitFloor = notice.awaitAi ? AI_WAIT_MS : 0;
    current = {
      notice,
      minUntil: t + (notice.awaitAi ? AI_WAIT_MS : MIN_HOLD_MS),
      expireAt: t + Math.max(holdMs(notice), waitFloor),
    };
    onShow(notice);
    schedule();
  };

  // Wake when the current notice may be replaced (if one is waiting) or must go (if not).
  const schedule = () => {
    stopTimer();
    if (!current) return;
    const due = pending ? current.minUntil : current.expireAt;
    timer = setTimeout(advance, Math.max(0, due - now()));
  };

  const advance = () => {
    stopTimer();
    if (pending) {
      const next = pending;
      pending = null;
      start(next);
    } else {
      current = null;
      onHide();
    }
  };

  return {
    push(notice) {
      if (!current) start(notice);
      else {
        pending = notice;
        schedule();
      }
    },
    update(id, headline) {
      if (current?.notice.id === id) {
        const notice = { ...current.notice, headline, awaitAi: false };
        const t = now();
        current = { notice, minUntil: t + MIN_HOLD_MS, expireAt: t + holdMs(notice) };
        onUpdate(notice);
        schedule();
      } else if (pending?.id === id) {
        pending = { ...pending, headline, awaitAi: false };
      }
    },
    dismiss() {
      if (current) advance();
    },
    clear() {
      stopTimer();
      pending = null;
      if (current) {
        current = null;
        onHide();
      }
    },
  };
}
