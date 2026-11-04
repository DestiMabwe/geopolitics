import { el } from '../dom.js';
import { die } from './DicePanel.js';
import { HELP } from '../helpContent.js';

// DESIGN §2 HelpDialog: "How to play" and "How to win", opened from the header pills. A native
// <dialog> opened with showModal(), like GameOverDialog, so the browser traps focus, closes it on
// Escape and puts the board behind it out of reach. The words live in helpContent.js. The dice in the
// example are fixed illustration (GAME_RULES §5.3), never a roll, and nothing here is worked out.

const list = (points) => el('ul', { class: 'help-dialog__list' }, ...points.map((p) => el('li', {}, p)));

// The same ring rule as the DicePanel: higher die wins its pair, a tie is neutral.
const ring = (mine, theirs) => (mine > theirs ? 'win' : mine < theirs ? 'lose' : 'tie');

function exampleRoll(example) {
  const row = (label, dice, other) =>
    el(
      'div',
      { class: 'dice-panel__row' },
      el('span', { class: 'dice-panel__label' }, label),
      ...dice.map((value, i) => die(value, `die--${ring(value, other[i])}`)),
    );
  return el(
    'figure',
    { class: 'help-dialog__example' },
    el(
      'div',
      {
        class: 'dice-panel__dice',
        role: 'img',
        'aria-label': `${example.attackerDice.join(', ')} against ${example.defenderDice.join(', ')}`,
      },
      row(`Attacker, ${example.attackerSoldiers} soldiers`, example.attackerDice, example.defenderDice),
      row(`Defender, ${example.defenderSoldiers} soldiers`, example.defenderDice, example.attackerDice),
    ),
    el('p', { class: 'dice-panel__total' }, `${example.attackerLeft} vs ${example.defenderLeft}`),
    el('figcaption', { class: 'help-dialog__caption' }, example.caption),
  );
}

function playBody(content) {
  return el(
    'ol',
    { class: 'help-dialog__steps' },
    ...content.steps.map((step) =>
      el('li', {}, el('strong', { class: 'help-dialog__step-title' }, step.title), el('p', {}, step.text)),
    ),
  );
}

function winBody(content) {
  return [
    el('section', { class: 'help-dialog__section' }, el('h3', {}, content.dice.title), list(content.dice.points), exampleRoll(content.dice.example)),
    el('section', { class: 'help-dialog__section' }, el('h3', {}, content.snowball.title), list(content.snowball.points)),
    el('section', { class: 'help-dialog__section' }, el('h3', {}, content.goal.title), el('p', {}, content.goal.text)),
    el('p', { class: 'help-dialog__tip' }, content.tip),
  ];
}

/**
 * @param {object} props
 * @param {'play' | 'win'} props.id  which dialog
 * @returns {HTMLDialogElement}  already in the page and open
 */
export function show({ id }) {
  dismiss(document.querySelector('.help-dialog'));
  const content = HELP[id];
  const dialog = el(
    'dialog',
    { class: 'help-dialog', 'aria-labelledby': 'help-dialog-title' },
    el('h2', { class: 'help-dialog__title', id: 'help-dialog-title' }, content.title),
    ...(id === 'play' ? [playBody(content)] : winBody(content)),
    el(
      'div',
      { class: 'help-dialog__actions' },
      el('button', { type: 'button', class: 'button button--primary', 'data-close': '' }, 'Got it'),
    ),
  );
  dialog.addEventListener('click', (event) => {
    // A click on the backdrop lands on the <dialog> itself, so it closes too.
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.querySelector('[data-slot="dialogs"]').append(dialog);
  dialog.showModal();
  return dialog;
}

/** Removes the dialog if there is one. */
export function dismiss(dialog) {
  dialog?.remove();
}
