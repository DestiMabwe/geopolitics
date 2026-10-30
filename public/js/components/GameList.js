import { el } from '../dom.js';

// DESIGN §2 GameList: "My games". Display only; onOpen reports which game to open.

const STATUS = { active: 'In progress', won: 'Won', lost: 'Lost' };

/**
 * @param {object} props
 * @param {object[] | null} props.games  from GET /games, newest first; null while loading
 * @param {(id: string) => void} props.onOpen
 * @returns {HTMLElement}
 */
export function render({ games, onOpen }) {
  const section = el('div', { class: 'game-list' }, el('h2', { class: 'game-list__title' }, 'My games'));

  if (games === null) {
    section.append(el('p', { class: 'game-list__empty', 'aria-busy': 'true' }, 'Loading your games…'));
    return section;
  }
  if (!games.length) {
    section.append(el('p', { class: 'game-list__empty' }, 'No games yet. Start one below.'));
    return section;
  }

  const list = el('ul', { class: 'game-list__items' });
  for (const game of games) {
    const home = game.countries[game.players.human.homeCode];
    const played = game.updatedAt ? new Date(game.updatedAt).toLocaleString() : '';
    list.append(
      el(
        'li',
        { class: 'game-list__item' },
        el(
          'div',
          { class: 'game-list__info' },
          el('span', { class: 'game-list__country' }, home.name),
          el('span', { class: 'game-list__meta' }, `Round ${game.round} · ${STATUS[game.status]}${played ? ` · ${played}` : ''}`),
        ),
        el(
          'button',
          { type: 'button', class: 'button', 'data-open': game.id },
          game.status === 'active' ? 'Continue' : 'View',
        ),
      ),
    );
  }
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open]');
    if (button) onOpen(button.dataset.open);
  });
  section.append(list);
  return section;
}
