import { el } from '../dom.js';
import { createNoticeQueue } from '../battleNotice.js';

// A short, non-modal pop-up for battle news, one at a time, in its own spot beside the dice (never over
// the board or the buttons). The words and timing come from battleNotice.js; this only draws them.
// The container is a polite live region, so a screen reader hears each notice once. Click to dismiss.

/**
 * @param {HTMLElement} container  the `battle-notice` slot
 * @returns {{ push(notice: object): void, update(id: number | string, headline: string): void, clear(): void }}
 */
export function mount(container) {
  const draw = (notice) =>
    el(
      'div',
      { class: 'battle-notice', title: 'Click to dismiss' },
      el('span', { class: 'battle-notice__headline' }, notice.headline),
      notice.reason && el('span', { class: 'battle-notice__reason' }, notice.reason),
    );

  const queue = createNoticeQueue({
    onShow: (notice) => container.replaceChildren(drawWithDismiss(draw(notice))),
    onUpdate: (notice) => container.replaceChildren(drawWithDismiss(draw(notice))),
    onHide: () => {
      const shown = container.firstElementChild;
      if (!shown) return;
      shown.classList.add('battle-notice--leaving');
      // A timer, not transitionend: that never fires at 0ms (reduced motion) or in a background tab.
      const fadeMs = parseFloat(getComputedStyle(shown).transitionDuration) * 1000 || 0;
      setTimeout(() => {
        if (shown.parentNode === container) shown.remove();
      }, fadeMs);
    },
  });

  function drawWithDismiss(node) {
    node.addEventListener('click', () => queue.dismiss());
    return node;
  }

  return { push: queue.push, update: queue.update, clear: queue.clear };
}
