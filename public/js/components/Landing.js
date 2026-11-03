import { el } from '../dom.js';
import * as WorldMap from './WorldMap.js';
import { render as profileBadge } from './ProfileBadge.js';
import { HOW_IT_WORKS, npcCards, sampleGame, parseGameLink } from '../landing.js';

// DESIGN §3.2 Home, logged out: what the game is, a picture of a board, how a game works, who the rivals
// are, and a way to watch a game without an account. Display only: the Log in and Sign up buttons carry
// data-action (app.js wires them), and onWatch reports the game id a visitor pasted.

/**
 * @param {object} props
 * @param {(gameId: string) => void} props.onWatch
 * @returns {HTMLElement}
 */
export function render({ onWatch }) {
  const hero = el(
    'section',
    { class: 'landing__hero' },
    el(
      'div',
      { class: 'landing__pitch' },
      el('h2', { class: 'landing__title' }, 'Conquer the world, one roll at a time'),
      el(
        'p',
        { class: 'landing__lead' },
        'Pick a real country. Nine rivals join, each run by its own strategist. Take all ten to win.',
      ),
      el(
        'div',
        { class: 'landing__actions' },
        el('button', { type: 'button', class: 'button button--primary', 'data-action': 'signup' }, 'Sign up to play'),
        el('button', { type: 'button', class: 'button', 'data-action': 'login' }, 'Log in'),
      ),
      el('p', { class: 'landing__note' }, 'No account needed to watch: paste a game link further down.'),
    ),
    el(
      'figure',
      { class: 'landing__preview' },
      WorldMap.render({ game: sampleGame() }),
      el('figcaption', { class: 'landing__caption' }, 'An example board. Every real game is dealt by the server.'),
    ),
  );

  const steps = el(
    'section',
    { class: 'landing__section' },
    el('h3', { class: 'landing__heading' }, 'How a game works'),
    el(
      'ol',
      { class: 'landing__steps' },
      ...HOW_IT_WORKS.map((step) =>
        el(
          'li',
          { class: 'landing__step' },
          el('span', { class: 'landing__step-title' }, step.title),
          el('span', { class: 'landing__step-text' }, step.text),
        ),
      ),
    ),
  );

  const rivals = el(
    'section',
    { class: 'landing__section' },
    el('h3', { class: 'landing__heading' }, 'Meet your rivals'),
    el(
      'ul',
      { class: 'landing__npcs' },
      ...npcCards().map((card) =>
        el(
          'li',
          { class: `landing__npc landing__npc--${card.profile}` },
          profileBadge({ profile: card.profile }),
          el('span', { class: 'landing__npc-text' }, card.blurb),
        ),
      ),
    ),
  );

  return el('div', { class: 'landing' }, hero, steps, rivals, watchSection(onWatch));
}

/** "Watch a game": paste a link or an id, and go to it. */
function watchSection(onWatch) {
  const input = el('input', {
    type: 'text',
    class: 'landing__input',
    name: 'link',
    placeholder: 'Paste a game link',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Game link',
  });
  const problem = el('p', { class: 'landing__problem', role: 'alert', hidden: true });
  const form = el(
    'form',
    { class: 'landing__watch-form' },
    input,
    el('button', { type: 'submit', class: 'button button--primary' }, 'Watch'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = parseGameLink(input.value);
    problem.hidden = Boolean(id);
    input.toggleAttribute('aria-invalid', !id);
    if (id) onWatch(id);
    else problem.textContent = "That doesn't look like a game link. Paste the whole link you were sent.";
  });

  return el(
    'section',
    { class: 'landing__section landing__watch' },
    el('h3', { class: 'landing__heading' }, 'Watch a game'),
    el('p', { class: 'landing__lead' }, 'Someone sent you a link? Paste it here. You do not need an account to watch.'),
    form,
    problem,
  );
}
