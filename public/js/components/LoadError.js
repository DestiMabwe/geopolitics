import { el } from '../dom.js';

// QA 2026-11-03 ISSUE-A: what replaces "Loading…" when a load fails. Display only; onRetry says
// the player pressed the button, and the caller decides what to reload. Leave onRetry out when
// trying again cannot help (for example "no game at this link") and no button is drawn.

/**
 * @param {object} props
 * @param {string} props.message  from loadErrorMessage()
 * @param {(() => void) | null} [props.onRetry]
 * @returns {HTMLElement}
 */
export function render({ message, onRetry = null }) {
  const box = el('div', { class: 'load-error', role: 'alert' }, el('p', { class: 'load-error__message' }, message));
  if (onRetry) {
    const button = el('button', { type: 'button', class: 'button', 'data-retry': '' }, 'Try again');
    button.addEventListener('click', onRetry);
    box.append(button);
  }
  return box;
}
