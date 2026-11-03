import { el } from '../dom.js';

// Minimize or maximize the full battle log. Minimized (the default), battle news arrives as pop-ups
// (BattleNotice); maximized, the whole log is shown and pop-ups stop. The page remembers the choice.

/**
 * @param {{ open: boolean, onToggle: () => void }} props
 * @returns {HTMLElement}
 */
export function render({ open, onToggle }) {
  const button = el(
    'button',
    { type: 'button', class: 'button log-toggle', 'aria-expanded': String(open), 'data-log-toggle': '' },
    open ? 'Hide full log' : 'Show full log',
  );
  button.addEventListener('click', onToggle);
  return button;
}
