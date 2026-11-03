// QA 2026-11-03 ISSUE-A: when Firestore is unreachable its client retries for a long time, so a
// request can hang far past what a player will wait. This answers 503 instead.

/**
 * Express middleware factory.
 *
 * - If the response has not started after `ms`, send 503 `{ error: { code: 'unavailable', message } }`
 *   (the ARCHITECTURE §3 error shape).
 * - A handler that answers in time is untouched, and its timer is cleared.
 * - A handler that finishes after the 503 must not crash the server (headers already sent).
 *
 * @param {number} ms
 * @returns {import('express').RequestHandler}
 */
export function requestTimeout(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      res.status(503).json({
        error: { code: 'unavailable', message: 'The service did not answer in time' },
      });
    }, ms);
    // 'close' also fires when the client hangs up, so no timer outlives its request.
    res.on('close', () => clearTimeout(timer));
    next();
  };
}
