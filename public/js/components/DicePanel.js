import { el } from '../dom.js';

// DESIGN §2 DicePanel: the latest roll, attacker dice on top and defender dice below, one column
// per pair in roll order (GAME_RULES §5.3, I-7), a ring per pair. Shows only server dice.

/**
 * @param {object} props
 * @param {{ data: object } | null} props.roll  the latest `roll` event, or null
 * @param {object} props.game
 * @param {boolean} [props.rolling]  a roll request is on its way: tumble, no values
 * @returns {HTMLElement}
 */
export function render({ roll, game, rolling = false }) {
  const panel = el('div', { class: 'dice-panel' }, el('h2', { class: 'dice-panel__title' }, 'Dice'));

  if (rolling) {
    panel.append(el('p', { class: 'dice-panel__status dice-panel__status--rolling' }, 'Rolling…'));
    return panel;
  }
  if (!roll) {
    panel.append(el('p', { class: 'dice-panel__status' }, 'Pick a target to attack.'));
    return panel;
  }

  const d = roll.data;
  const name = (code) => game.countries[code]?.name ?? code;
  // The ring only colours what the server already decided: higher die wins, tie kills nobody.
  const ring = (mine, theirs) => (mine > theirs ? 'win' : mine < theirs ? 'lose' : 'tie');
  const row = (label, dice, other) =>
    el(
      'div',
      { class: 'dice-panel__row' },
      el('span', { class: 'dice-panel__label' }, label),
      ...dice.map((value, i) => el('span', { class: `die die--${ring(value, other[i])}` }, String(value))),
    );

  panel.append(
    el(
      'div',
      { class: 'dice-panel__dice', role: 'img', 'aria-label': `${d.attackerDice.join(', ')} against ${d.defenderDice.join(', ')}` },
      row(name(d.from), d.attackerDice, d.defenderDice),
      row(name(d.to), d.defenderDice, d.attackerDice),
    ),
    el('p', { class: 'dice-panel__total' }, `${d.attackerLeft} vs ${d.defenderLeft}`),
  );
  return panel;
}
