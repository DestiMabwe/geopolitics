import { el } from '../dom.js';
import { spectatorStatus } from '../spectator.js';

// DESIGN §2 SpectatorBanner: for visitors. The "Live" dot pulses on each successful poll and
// turns to "Reconnecting…" after 10 s without one.

/**
 * @param {{ live: boolean, loggedIn: boolean, status?: 'active' | 'won' | 'lost' | null }} props  status: the game's, so a finished game says "Game over", not "Live"
 * @returns {HTMLElement}
 */
export function render({ live, loggedIn, status = null }) {
  const dot = spectatorStatus({ status, live });
  return el(
    'div',
    { class: 'spectator-banner' },
    el('span', { class: 'spectator-banner__text' }, 'You are spectating'),
    el('span', { class: dot.state === 'live' ? 'live-dot' : `live-dot live-dot--${dot.state}` }, dot.label),
    // A logged-in visitor doesn't own this game, so logging in again wouldn't help.
    !loggedIn && el('button', { type: 'button', class: 'button button--primary', 'data-action': 'login' }, 'Log in to play'),
  );
}

/** Restarts the dot's pulse animation, once per successful poll. */
export function pulse(banner) {
  const dot = banner.querySelector('.live-dot');
  dot?.classList.remove('live-dot--pulse');
  void dot?.offsetWidth; // restart the CSS animation
  dot?.classList.add('live-dot--pulse');
}
