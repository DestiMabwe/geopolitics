import { el } from '../dom.js';
import { playerName, ownerSlot } from '../players.js';

// DESIGN §2 NationBoard + NationCard. The 10 countries, each listing its neighbours by code, so a
// target can be chosen without a map. Display only: onPick reports a click, the page decides.

/**
 * @param {object} props
 * @param {object} props.game  the public game from the server
 * @param {{ from?: string | null, to?: string | null }} [props.selection]
 * @param {(code: string) => 'selectable-source' | 'valid-target' | null} [props.roleOf]  which cards can be picked
 * @param {(code: string) => void} [props.onPick]
 * @returns {HTMLElement}
 */
export function render({ game, selection = {}, roleOf = () => null, onPick = () => {} }) {
  // The attack in progress, else the player's current selection.
  const from = game.attack?.from ?? selection.from ?? null;
  const to = game.attack?.to ?? selection.to ?? null;

  const board = el('ol', { class: 'nation-board' });
  for (const [code, c] of Object.entries(game.countries)) {
    const role = roleOf(code);
    const owner = playerName(game, c.owner);
    const classes = ['nation-card'];
    if (code === from) classes.push('nation-card--source');
    if (code === to) classes.push(game.attack ? 'nation-card--under-attack' : 'nation-card--target');
    if (role) classes.push(`nation-card--${role}`);

    const card = el(
      'button',
      {
        type: 'button',
        class: classes.join(' '),
        'data-code': code,
        'aria-pressed': String(code === from || code === to),
        disabled: !role && code !== from,
        'aria-label': `${c.name}, ${owner === 'You' ? 'yours' : `owned by ${owner}`}, ${c.soldiers} soldiers`,
      },
      el('span', { class: `owner-mark owner--${ownerSlot(game, c.owner)}` }),
      el(
        'span',
        { class: 'nation-card__head' },
        el('span', { class: 'nation-card__name' }, c.name),
        el('span', { class: 'nation-card__code' }, code),
      ),
      el('span', { class: 'nation-card__owner' }, owner),
      el(
        'span',
        { class: 'nation-card__stats' },
        el('span', { class: 'nation-card__soldiers' }, String(c.soldiers)),
        el('span', { class: 'nation-card__value', title: 'Soldier value' }, `★${c.value}`),
      ),
      el('span', { class: 'nation-card__borders' }, `Borders ${game.borders[code].join(' · ')}`),
    );
    board.append(el('li', {}, card));
  }
  board.addEventListener('click', (event) => {
    const card = event.target.closest('[data-code]');
    if (card && !card.disabled) onPick(card.dataset.code);
  });
  return board;
}
