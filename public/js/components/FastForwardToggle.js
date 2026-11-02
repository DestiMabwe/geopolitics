import { el } from '../dom.js';

// DESIGN §2 FastForwardToggle: a switch shown while turns are being replayed. It only changes the
// pace; every event is still shown (ARCHITECTURE §4.2). The page remembers the setting.

/**
 * @param {{ on: boolean, onToggle: () => void }} props
 * @returns {HTMLElement}
 */
export function render({ on, onToggle }) {
  const toggle = el(
    'button',
    {
      type: 'button',
      class: `button fast-forward${on ? ' fast-forward--on' : ''}`,
      role: 'switch',
      'aria-checked': String(on),
      'aria-keyshortcuts': 'F',
    },
    '▶▶ Fast-forward',
  );
  toggle.addEventListener('click', onToggle);
  return toggle;
}
