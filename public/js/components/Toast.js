import { el } from '../dom.js';

// DESIGN §2 Toast: short messages (409 stale, 422 illegal, 429 slow down, network).

const LIFETIME_MS = 4000;

/**
 * Shows a toast in the toast region. It goes after 4 s, or on click.
 *
 * @param {string} message
 * @param {'info' | 'error'} [tone]
 * @returns {HTMLElement} the toast, already in the page
 */
export function show(message, tone = 'info') {
  const region = document.querySelector('[data-slot="toasts"]');
  // Errors interrupt a screen reader; info waits for the region's polite announcement.
  const toast = el('div', { class: `toast toast--${tone}`, role: tone === 'error' ? 'alert' : false }, message);

  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.add('toast--leaving');
    // A timer, not transitionend: that never fires at 0ms (reduced motion) or in a background tab.
    const fadeMs = parseFloat(getComputedStyle(toast).transitionDuration) * 1000;
    setTimeout(() => toast.remove(), fadeMs);
  };
  const timer = setTimeout(dismiss, LIFETIME_MS);
  toast.addEventListener('click', dismiss);

  region.append(toast);
  return toast;
}
