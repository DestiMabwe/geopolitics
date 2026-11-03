// What a visitor reads on a finished game (QA 2026-11-03 ISSUE-F). Pure (no DOM): the status comes
// from the server's game, and these functions only choose the words.

/**
 * The header's result badge. The owner's own result stays "Victory" or "Defeat"; a visitor did not
 * win or lose, so they get a neutral "Game over". No badge while the game is being played.
 *
 * @param {{ status?: 'active' | 'won' | 'lost' | null, isOwner?: boolean }} props  isOwner defaults to true
 * @returns {{ text: string, tone: 'won' | 'lost' | 'over' } | null}
 */
export function headerBadge({ status, isOwner = true }) {
  if (!isOver(status)) return null;
  if (!isOwner) return { text: 'Game over', tone: 'over' };
  return status === 'won' ? { text: 'Victory', tone: 'won' } : { text: 'Defeat', tone: 'lost' };
}

/**
 * The visitor banner's status dot. A finished game is not "Live": it says "Game over" and nothing
 * more will happen. Otherwise "Live", or "Reconnecting…" after a missed poll.
 *
 * @param {{ status?: 'active' | 'won' | 'lost' | null, live: boolean }} props
 * @returns {{ label: string, state: 'live' | 'stale' | 'over' }}
 */
export function spectatorStatus({ status, live }) {
  if (isOver(status)) return { label: 'Game over', state: 'over' };
  return live ? { label: 'Live', state: 'live' } : { label: 'Reconnecting…', state: 'stale' };
}

function isOver(status) {
  return status === 'won' || status === 'lost';
}
