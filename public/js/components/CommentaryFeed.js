import { el } from '../dom.js';
import { eventText } from '../eventText.js';

// DESIGN §2 CommentaryFeed: newest at the bottom, a "Round n" divider at each new round. A line shows
// its template text at once; when the LLM line has been saved (`aiText`) it replaces the template
// (ARCHITECTURE §4.3). While a line is being written it shimmers faintly, and when the LLM fails
// the template simply stays, with no error shown.

/**
 * @param {object} props
 * @param {object[]} props.events  the events shown so far, oldest first
 * @param {object} props.game  for country and player names
 * @param {Set<number>} [props.pendingAi]  seqs whose LLM line is on its way
 * @param {boolean} [props.fast]  fast-forward: the log stops announcing every line to screen readers
 * @returns {HTMLElement}
 */
export function render({ events, game, pendingAi = new Set(), fast = false }) {
  const log = el('ol', {
    class: 'commentary-feed',
    role: 'log',
    'aria-live': fast ? 'off' : 'polite',
    'aria-label': 'What happened',
  });

  let round = null;
  for (const event of events) {
    const eventRound = event.round ?? event.data?.round;
    if (event.type === 'turnStart' && eventRound !== round) {
      round = eventRound;
      log.append(el('li', { class: 'commentary-feed__round' }, `Round ${round}`));
    }
    const classes = ['commentary-feed__line', `commentary-feed__line--${event.type}`];
    if (event.aiText) classes.push('commentary-feed__line--ai');
    if (pendingAi.has(event.seq)) classes.push('commentary-feed__line--pending');
    log.append(el('li', { class: classes.join(' ') }, event.aiText || event.text || eventText(event, game)));
  }
  if (!events.length) log.append(el('li', { class: 'commentary-feed__line' }, 'The world holds its breath…'));
  return log;
}
