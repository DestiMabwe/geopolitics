// Whether the full battle log is open, remembered in localStorage. The log starts minimized: battle
// news arrives as short pop-ups instead (BattleNotice). Storage can be blocked or throw (private
// windows), so every read and write is wrapped and the page works without it.

const KEY = 'geopolitics.logOpen';

/** @param {Pick<Storage, 'getItem'>} [storage] @returns {boolean} */
export function loadLogOpen(storage = globalThis.localStorage) {
  try {
    return storage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

/** @param {boolean} open @param {Pick<Storage, 'setItem'>} [storage] */
export function saveLogOpen(open, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, String(open));
  } catch {
    // Not remembered; the log still opens and closes for this visit.
  }
}
