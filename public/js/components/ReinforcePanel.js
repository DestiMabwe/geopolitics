import { el } from '../dom.js';
import { ownedBy } from '../players.js';
import * as PlacementSteppers from './PlacementSteppers.js';

// DESIGN §2 ReinforcePanel, GAME_RULES §7.3: place every new soldier, in any split, across the
// countries you own. Confirm is enabled only when none are left. The amount is the server's
// `pendingReinforcements`; the server re-checks the split.

/**
 * @param {object} props
 * @param {object} props.game
 * @param {boolean} props.pending
 * @param {(action: 'reinforce', detail: { placements: Record<string, number> }) => void} props.onAction
 * @returns {HTMLElement}
 */
export function render({ game, pending, onAction }) {
  const amount = game.pendingReinforcements;
  const confirm = el('button', { type: 'submit', class: 'button button--primary' }, 'Confirm');
  const steppers = PlacementSteppers.create({
    owned: ownedBy(game, 'human'),
    total: amount,
    pending,
    noun: 'new',
    onChange: () => { confirm.disabled = pending || !steppers.complete(); },
  });
  confirm.disabled = pending || !steppers.complete();

  const form = el(
    'form',
    { class: 'panel-form' },
    el('p', { class: 'action-bar__hint' }, `You have ${amount} new soldiers. Place them on your countries.`),
    steppers.element,
    confirm,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (steppers.complete()) onAction('reinforce', { placements: steppers.placements() });
  });
  return form;
}
