import { el } from '../dom.js';

// DESIGN §2 GameOverDialog, §3.4: the result, the round, and the countries held, over the board.
// A native <dialog> opened with showModal(), so the browser traps focus, closes it on Escape and
// puts the page behind it out of reach. "New game" and "My games" carry data-action, which app.js
// already handles; leaving the page removes the dialog (closeGame).

/**
 * @param {object} props
 * @param {{ title: string, tone: 'success' | 'danger', winnerLine: string | null, round: number, held: string[] }} props.summary  from gameOverSummary
 * @param {() => void} props.onClose  the player dismissed it to look at the board
 * @returns {HTMLDialogElement}  already in the page and open
 */
export function show({ summary, onClose }) {
  const dialog = el(
    'dialog',
    { class: 'game-over', 'aria-labelledby': 'game-over-title' },
    el('h2', { class: `game-over__title game-over__title--${summary.tone}`, id: 'game-over-title' }, summary.title),
    summary.winnerLine && el('p', { class: 'game-over__line' }, summary.winnerLine),
    el('p', { class: 'game-over__line' }, `Round ${summary.round}`),
    el('p', { class: 'game-over__line' }, `Countries you held: ${summary.held.length ? summary.held.join(', ') : 'none'}`),
    el(
      'div',
      { class: 'game-over__actions' },
      el('button', { type: 'button', class: 'button button--primary', 'data-action': 'new-game' }, 'New game'),
      el('button', { type: 'button', class: 'button', 'data-action': 'my-games' }, 'My games'),
      el('button', { type: 'button', class: 'button', 'data-close': '' }, 'View board'),
    ),
  );
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose();
  });
  document.querySelector('[data-slot="dialogs"]').append(dialog);
  dialog.showModal();
  return dialog;
}

/** Removes the dialog without calling onClose (the page is going away). */
export function dismiss(dialog) {
  dialog?.remove();
}
