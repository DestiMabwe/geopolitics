// Display text for the three NPC profiles (GAME_RULES §8). Words only: the numbers behind each
// profile live on the server, and the client shows what it decides (CLAUDE.md). A profile code is
// `'warlord' | 'fortress' | 'opportunist'`, and the human has `null`.

// A Map, not an object, so a code like 'toString' can't match an inherited key.
const LABELS = new Map([
  ['warlord', 'Warlord'],
  ['fortress', 'Fortress'],
  ['opportunist', 'Opportunist'],
]);

const BLURBS = new Map([
  ['warlord', 'Aggressive: piles soldiers on its biggest country and goes after the human.'],
  ['fortress', 'Cautious: only attacks when a win is sure, otherwise it skips.'],
  ['opportunist', 'Picks off the weak and goes after whoever is the leader.'],
]);

/**
 * The name shown on a profile badge, e.g. `'warlord'` → `'Warlord'`.
 *
 * @param {string | null | undefined} profile
 * @returns {string} an empty string for the human (no profile) or an unknown code
 */
export function profileLabel(profile) {
  return LABELS.get(profile) ?? '';
}
/**
 * One line saying how the profile plays, for a badge tooltip (GAME_RULES §8 table).
 *
 * @param {string | null | undefined} profile
 * @returns {string} an empty string for the human (no profile) or an unknown code
 */


export function profileBlurb(profile) {
  return BLURBS.get(profile) ?? '';
}
