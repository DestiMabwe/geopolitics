import { el } from '../dom.js';
import { playerName, ownerSlot } from '../players.js';

// DESIGN §2 TurnOrderBar: one chip per player in turn order, the current one highlighted.

/**
 * @param {{ game: object }} props
 * @returns {HTMLElement}
 */
export function render({ game }) {
  return el(
    'ol',
    { class: 'turn-order' },
    ...game.turnOrder.map((id, i) => {
      const p = game.players[id];
      const current = i === game.currentTurn && game.status === 'active';
      const classes = ['turn-chip'];
      if (current) classes.push('turn-chip--current');
      if (p.eliminated) classes.push('turn-chip--eliminated');
      return el(
        'li',
        { class: classes.join(' '), 'aria-current': current ? 'step' : false },
        el('span', { class: `owner-mark owner--${ownerSlot(game, id)}` }),
        playerName(game, id),
        p.profile && el('span', { class: `turn-chip__profile turn-chip__profile--${p.profile}` }, p.profile),
      );
    }),
  );
}
