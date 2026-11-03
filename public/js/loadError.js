// What the player reads when a load fails (QA 2026-11-03 ISSUE-A). Pure text, so it is unit-tested;
// the Retry button that sits next to it is plain HTML and CSS.

import { ApiError } from './api.js';

const TRY_AGAIN = 'Please try again.';

/**
 * Turns the error from a failed load into one short, friendly sentence.
 *
 * - `ApiError` code 'timeout' → says the server is taking too long.
 * - `ApiError` code 'network' → says the server can't be reached.
 * - `ApiError` code 'unavailable' (HTTP 503) → says the service is unavailable right now.
 * - Any other `ApiError` → its own `message`.
 * - Anything else (not an ApiError) → a generic "Something went wrong".
 * Every retryable sentence ends by telling the player they can try again.
 *
 * @param {unknown} err
 * @returns {string}
 */
export function loadErrorMessage(err) {
  if (!(err instanceof ApiError)) return `Something went wrong. ${TRY_AGAIN}`;
  switch (err.code) {
    case 'timeout':
      return `The server is taking too long to answer. ${TRY_AGAIN}`;
    case 'network':
      return `Can't reach the server. Check your connection. ${TRY_AGAIN}`;
    case 'unavailable':
      return `The game service is unavailable right now. ${TRY_AGAIN}`;
    default:
      return err.message;
  }
}
