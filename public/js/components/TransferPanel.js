import { el } from '../dom.js';
import { ownedBy } from '../players.js';

// DESIGN §2 TransferPanel, GAME_RULES §6: move soldiers between two of your countries, as often as
// you like before attacking. No upper limit for the count is worked out here (CLAUDE.md: no
// user-facing numbers computed in the browser); a count out of range comes back as the server's 422.

/**
 * @param {object} props
 * @param {object} props.game
 * @param {boolean} props.pending
 * @param {(action: 'transfer', detail: { from: string, to: string, count: number }) => void} props.onAction
 * @returns {HTMLElement}
 */
export function render({ game, pending, onAction }) {
  const owned = ownedBy(game, 'human');
  if (owned.length < 2) {
    return el('p', { class: 'action-bar__hint' }, 'You need at least two countries to transfer soldiers.');
  }

  const option = (code, country, selected) => el('option', { value: code, selected }, `${country.name} (${country.soldiers})`);
  const from = el('select', { name: 'from', id: 'transfer-from' }, ...owned.map(([code, c], i) => option(code, c, i === 0)));
  const to = el('select', { name: 'to', id: 'transfer-to' });
  const count = el('input', { type: 'number', name: 'count', min: '1', step: '1', value: '1', required: true, id: 'transfer-count' });

  // The destination can't be the source, so the list is rebuilt whenever the source changes.
  const fillTo = () => {
    const keep = to.value;
    const others = owned.filter(([code]) => code !== from.value);
    to.replaceChildren(...others.map(([code, c]) => option(code, c, code === keep)));
  };
  from.addEventListener('change', fillTo);
  fillTo();

  const form = el(
    'form',
    { class: 'panel-form' },
    el('label', { for: 'transfer-from' }, 'Move from'),
    from,
    el('label', { for: 'transfer-to' }, 'to'),
    to,
    el('label', { for: 'transfer-count' }, 'Soldiers'),
    count,
    el('button', { type: 'submit', class: 'button button--primary', disabled: pending }, 'Transfer'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onAction('transfer', { from: from.value, to: to.value, count: Number(count.value) });
  });
  return form;
}
