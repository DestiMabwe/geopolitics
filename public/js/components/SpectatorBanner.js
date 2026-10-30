import { el } from '../dom.js';

// DESIGN §2 SpectatorBanner: for visitors. The "Live" dot pulses on each successful poll and
// turns to "Reconnecting…" after 10 s without one.

/**
 * @param {{ live: boolean, loggedIn: boolean }} props
 * @returns {HTMLElement}
 */
export function render({ live, loggedIn }) {
  return el(
    'div',
    { class: 'spectator-banner' },
    el('span', { class: 'spectator-banner__text' }, 'You are spectating'),
    el('span', { class: `live-dot${live ? '' : ' live-dot--stale'}` }, live ? 'Live' : 'Reconnecting…'),
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
