import { el } from '../dom.js';
import { eventText } from '../eventText.js';

// The slice's simple event log (S25b), newest at the bottom. CommentaryFeed (S28) replaces it
// with round dividers and the LLM lines.

/**
 * @param {{ events: object[], game: object }} props
 * @returns {HTMLElement}
 */
export function render({ events, game }) {
  const log = el(
    'ol',
    { class: 'event-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'What happened' },
    ...events.map((event) => el('li', { class: `event-log__line event-log__line--${event.type}` }, event.text || eventText(event, game))),
  );
  if (!events.length) log.append(el('li', { class: 'event-log__line' }, 'The world holds its breath…'));
  return log;
}
