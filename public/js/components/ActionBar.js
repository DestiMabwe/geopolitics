import { el } from '../dom.js';
import { playerName } from '../players.js';

// DESIGN §2 ActionBar, owner only. Buttons for the current phase; each reports through onAction.
// The slice covers manoeuvre (Attack / Skip), attacking (Roll / Stop) and occupy. Reinforce and
// transfer panels arrive in S26b, NPC turns in S21.

/**
 * @param {object} props
 * @param {object} props.game
 * @param {{ from: string | null, to: string | null }} props.selection
 * @param {boolean} props.pending  a request is on its way: everything disabled
 * @param {(action: string, detail?: object) => void} props.onAction
 *   'attack' · 'skip' · 'roll' · 'stop' · 'occupy' ({ count, placeOn }) · 'copy-link'
 * @returns {HTMLElement}
 */
export function render({ game, selection, pending, onAction }) {
  const bar = el('div', { class: 'action-bar' });
  const button = (label, action, { primary = false, disabled = false, key } = {}) => {
    const b = el(
      'button',
      { type: 'button', class: `button${primary ? ' button--primary' : ''}`, disabled: pending || disabled, 'aria-keyshortcuts': key ?? false },
      label,
    );
    b.addEventListener('click', () => onAction(action));
    return b;
  };
  const hint = (text) => el('p', { class: 'action-bar__hint' }, text);
  const current = game.turnOrder[game.currentTurn];
  const name = (code) => game.countries[code]?.name ?? code;

  if (game.status !== 'active') {
    bar.append(hint(game.status === 'won' ? 'You won this game.' : 'This game is over.'));
  } else if (current !== 'human') {
    bar.append(hint(`${playerName(game, current)} is playing. NPC turns arrive in a later update (S21), so the game waits here.`));
  } else if (game.phase === 'manoeuvre') {
    const { from, to } = selection;
    bar.append(
      hint(!from ? 'Choose a country to attack from.' : !to ? `Choose a neighbour of ${name(from)} to attack.` : `Attack ${name(to)} from ${name(from)}?`),
      button('Attack', 'attack', { primary: true, disabled: !from || !to }),
      button('Skip', 'skip'),
    );
  } else if (game.phase === 'attacking') {
    bar.append(
      hint(`Attacking ${name(game.attack.to)} from ${name(game.attack.from)}.`),
      button('Roll', 'roll', { primary: true, key: 'R' }),
      button('Stop attack', 'stop', { key: 'S' }),
    );
  } else if (game.phase === 'occupy') {
    bar.append(occupyForm(game, pending, onAction));
  } else {
    bar.append(hint(`Phase "${game.phase}" needs the ${game.phase} panel, which arrives in a later update (S26b).`));
  }

  bar.append(button('Copy link', 'copy-link'));
  return bar;
}

// GAME_RULES §5.6. No upper limit is worked out here (CLAUDE.md: no user-facing numbers computed
// in the browser); a count out of range comes back as the server's 422 message.
function occupyForm(game, pending, onAction) {
  const { from, to, bonus } = game.attack;
  const count = el('input', { type: 'number', name: 'count', min: '1', step: '1', value: '1', required: true, id: 'occupy-count' });
  const owned = Object.entries(game.countries).filter(([, c]) => c.owner === 'human');
  const placeOn = el(
    'select',
    { name: 'placeOn', id: 'occupy-place' },
    ...owned.map(([code, c]) => el('option', { value: code, selected: code === to }, c.name)),
  );
  const form = el(
    'form',
    { class: 'occupy-form' },
    el('p', { class: 'action-bar__hint' }, `${game.countries[to].name} is yours. Move soldiers in from ${game.countries[from].name}, then place your ${bonus} bonus soldiers.`),
    el('label', { for: 'occupy-count' }, `Soldiers to move in (leave at least 1 in ${game.countries[from].name})`),
    count,
    el('label', { for: 'occupy-place' }, `Place ${bonus} bonus on`),
    placeOn,
    el('button', { type: 'submit', class: 'button button--primary', disabled: pending }, 'Occupy'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onAction('occupy', { count: Number(count.value), placeOn: placeOn.value });
  });
  return form;
}
