// Which help pills the player has opened, remembered in localStorage so the dot on a pill goes away
// once it has been read. A per-browser convenience only: storage can be blocked or throw (private
// windows), so every read and write is wrapped and the page works without it. Same shape as logView.js.

const KEY = 'helpSeen';

// Reading `globalThis.localStorage` itself can throw when site data is blocked, so even the default is guarded.
const defaultStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const readSeen = (storage) => {
  const raw = storage.getItem(KEY);
  return new Set(raw ? JSON.parse(raw) : []);
};

/**
 * @param {'play' | 'win'} id  which pill
 * @param {Pick<Storage, 'getItem'>} [storage]
 * @returns {boolean}  true once markSeen(id) has run on this browser; false when nothing is saved or storage throws
 */
export function hasSeen(id, storage = defaultStorage()) {
  try {
    return readSeen(storage).has(String(id));
  } catch {
    return false;
  }
}

/**
 * @param {'play' | 'win'} id  which pill
 * @param {Pick<Storage, 'getItem' | 'setItem'>} [storage]
 */
export function markSeen(id, storage = defaultStorage()) {
  try {
    const seen = readSeen(storage);
    seen.add(String(id));
    storage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // Storage is blocked or full: the dot simply comes back next visit.
  }
}
