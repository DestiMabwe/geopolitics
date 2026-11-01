import { HttpError } from './errorHandler.js';

/**
 * Fixed-window rate limiter, kept in memory (ARCHITECTURE §5.2). On Vercel each serverless
 * instance has its own memory, so the limit holds per instance, not globally. That is enough to
 * cap LLM cost, which is what it is for.
 *
 * Steps for the returned middleware:
 * 1. Work out the caller's key with `key(req)`.
 * 2. If the key has no window yet, or its window has ended (`now() >= resetAt`), start a new one:
 *    count 0, `resetAt = now() + windowMs`.
 * 3. If the count is already at `limit`, send 429 'too_many_requests' and set a `Retry-After`
 *    header in whole seconds (at least 1) until `resetAt`. Do not count this request.
 * 4. Otherwise add 1 to the count and call `next()`.
 * Drop windows that have ended so the map doesn't grow forever.
 *
 * @param {object} options
 * @param {number} options.limit requests allowed per window
 * @param {number} options.windowMs window length in milliseconds
 * @param {(req: import('express').Request) => string} [options.key] defaults to `req.uid`, so it
 *   must run after requireAuth
 * @param {() => number} [options.now] the clock, so tests can move time without waiting
 * @returns {import('express').RequestHandler}
 * @throws {HttpError} 429 as above, thrown by the returned middleware
 */
export function rateLimit({ limit, windowMs, key = (req) => req.uid, now = Date.now }) {
  const windows = new Map();

  return (req, res, next) => {
    const time = now();
    for (const [k, w] of windows) {
      if (time >= w.resetAt) windows.delete(k);
    }

    const k = key(req);
    let window = windows.get(k);
    if (!window) {
      window = { count: 0, resetAt: time + windowMs };
      windows.set(k, window);
    }

    if (window.count >= limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((window.resetAt - time) / 1000))));
      throw new HttpError(429, 'too_many_requests', 'Too many requests, slow down');
    }
    window.count += 1;
    next();
  };
}
