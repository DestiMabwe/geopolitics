// The fast-forward setting, remembered in localStorage (DESIGN §2). Storage can be blocked or throw
// (private windows), so every read and write is wrapped and the game works without it.

const KEY = 'geopolitics.fastForward';

/** @param {Pick<Storage, 'getItem'>} [storage] @returns {boolean} */
export function loadFast(storage = globalThis.localStorage) {
  try {
    return storage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

/** @param {boolean} on @param {Pick<Storage, 'setItem'>} [storage] */
export function saveFast(on, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, String(on));
  } catch {
    // Not remembered; fast-forward still works for this visit.
  }
}
