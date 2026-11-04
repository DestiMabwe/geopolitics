import { el } from '../dom.js';
import { headerBadge } from '../spectator.js';
import { HELP, HELP_IDS } from '../helpContent.js';
import { hasSeen } from '../helpSeen.js';

// DESIGN §2 AppHeader. Display only: the buttons carry data-action and app.js wires them (S25).

/**
 * @param {object} props
 * @param {number | null} [props.round]          from the server's game, or null off the game screen
 * @param {string | null} [props.currentPlayer]  display name of whoever's turn it is
 * @param {'active' | 'won' | 'lost' | null} [props.status]
 * @param {boolean} [props.isOwner]  false for a visitor, who gets "Game over" instead of Victory / Defeat
 * @param {{ email: string } | null} [props.user]  null when logged out
 * @returns {HTMLElement}
 */
export function render({ round = null, currentPlayer = null, status = null, isOwner = true, user = null } = {}) {
  const badge = headerBadge({ status, isOwner });

  return el(
    'div',
    { class: 'app-header' },
    el('h1', { class: 'app-header__title' }, el('a', { href: '/' }, 'Geopolitics')),
    round !== null && renderStatus(round, currentPlayer, badge),
    renderHelp(),
    user ? renderMenu(user) : renderLoggedOut(),
  );
}

// The two help pills show for everyone. A dot marks a pill that has not been opened yet on this
// browser (helpSeen); opening it clears the dot. app.js opens the dialog.
function renderHelp() {
  return el(
    'div',
    { class: 'app-header__help' },
    ...HELP_IDS.map((id) =>
      el(
        'button',
        { type: 'button', class: 'help-pill', 'data-action': `help-${id}` },
        HELP[id].pill,
        !hasSeen(id) && el('span', { class: 'help-pill__dot' }, el('span', { class: 'visually-hidden' }, ' (new)')),
      ),
    ),
  );
}

function renderStatus(round, currentPlayer, badge) {
  return el(
    'p',
    { class: 'app-header__status' },
    el('span', { class: 'app-header__round' }, `Round ${round}`),
    badge
      ? el('span', { class: `app-header__badge app-header__badge--${badge.tone}` }, badge.text)
      : currentPlayer && el('span', {}, `${currentPlayer} to move`),
  );
}

function renderLoggedOut() {
  return el(
    'div',
    { class: 'app-header__actions' },
    el('button', { type: 'button', class: 'button', 'data-action': 'login' }, 'Log in'),
    el('button', { type: 'button', class: 'button button--primary', 'data-action': 'signup' }, 'Sign up'),
  );
}

function renderMenu(user) {
  // <details> gives an open/close menu that works by keyboard with no JS.
  return el(
    'details',
    { class: 'app-header__menu' },
    el('summary', { class: 'button' }, user.email),
    el(
      'div',
      { class: 'app-header__menu-list' },
      el('button', { type: 'button', class: 'button', 'data-action': 'my-games' }, 'My games'),
      el('button', { type: 'button', class: 'button', 'data-action': 'new-game' }, 'New game'),
      el('button', { type: 'button', class: 'button', 'data-action': 'logout' }, 'Log out'),
    ),
  );
}
