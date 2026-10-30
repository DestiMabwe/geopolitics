// Visitors' polling (ARCHITECTURE §3). One request at a time: the next one is scheduled only
// after the last one settles, so a slow server never piles requests up.

/**
 * Calls `fn` after `ms`, and again `ms` after each call settles, until stopped.
 *
 * @param {() => Promise<void>} fn
 * @param {number} ms
 * @returns {() => void} stop
 */
export function startPolling(fn, ms) {
  let timer = null;
  let stopped = false;
  const tick = async () => {
    try {
      await fn();
    } catch {
      // fn reports its own failures (the "Reconnecting…" banner); polling just carries on.
    } finally {
      if (!stopped) timer = setTimeout(tick, ms);
    }
  };
  timer = setTimeout(tick, ms);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
