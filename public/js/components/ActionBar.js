import { el } from '../dom.js';
import { playerName, ownedBy } from '../players.js';
import * as PlacementSteppers from './PlacementSteppers.js';
import * as ReinforcePanel from './ReinforcePanel.js';
import * as TransferPanel from './TransferPanel.js';

// DESIGN §2 ActionBar, owner only. Buttons for the current phase; each reports through onAction.
// Reinforce (ReinforcePanel), manoeuvre (Attack / Transfer / Skip), attacking (Roll / Stop) and occupy.
// NPC turns are driven and replayed by gamePage.js (S28); here they show only a hint.

/**
 * @param {object} props
 * @param {object} props.game
 * @param {{ from: string | null, to: string | null }} props.selection
 * @param {boolean} props.pending  a request is on its way: everything disabled
 * @param {boolean} [props.replaying]  NPC events are still being replayed: nothing can be done yet
 * @param {boolean} [props.npcPaused]  an NPC turn failed to load; offers a Continue button
 * @param {'transfer' | null} [props.panel]  the open side panel; only 'transfer' exists, and only in manoeuvre
 * @param {(action: string, detail?: object) => void} props.onAction
 *   'attack' · 'skip' · 'roll' · 'stop' · 'occupy' ({ count, placements }) · 'reinforce' ({ placements })
 *   · 'transfer' ({ from, to, count }) · 'toggle-transfer' · 'npc-continue' · 'copy-link'
 * @returns {HTMLElement}
 */
export function render({ game, selection, pending, panel = null, replaying = false, npcPaused = false, onAction }) {
  const bar = el('div', { class: 'action-bar' });
  // While a request is out the buttons are aria-disabled, not disabled: a disabled button drops keyboard
  // focus, and gamePage ignores clicks while pending anyway.
  const button = (label, action, { primary = false, disabled = false, key } = {}) => {
    const b = el(
      'button',
      { type: 'button', class: `button${primary ? ' button--primary' : ''}`, disabled, 'aria-disabled': pending ? 'true' : false, 'aria-keyshortcuts': key ?? false },
      label,
    );
    b.addEventListener('click', () => onAction(action));
    return b;
  };
  const hint = (text) => el('p', { class: 'action-bar__hint' }, text);
  const current = game.turnOrder[game.currentTurn];
  const name = (code) => game.countries[code]?.name ?? code;

  if (replaying) {
    // The server already holds the end of the turn; the screen is still catching up (DESIGN §3.3).
    bar.append(hint('Watching the turn play out…'));
  } else if (game.status !== 'active') {
    bar.append(hint(game.status === 'won' ? 'You won this game.' : 'This game is over.'));
  } else if (current !== 'human') {
    bar.append(
      hint(npcPaused ? `${playerName(game, current)}'s turn could not be loaded.` : `${playerName(game, current)} is playing.`),
      // Spread, not `npcPaused && button(...)`: append(false) would write the text "false".
      ...(npcPaused ? [button('Continue', 'npc-continue', { primary: true })] : []),
    );
  } else if (game.phase === 'reinforce') {
    bar.append(ReinforcePanel.render({ game, pending, onAction }));
  } else if (game.phase === 'manoeuvre') {
    const { from, to } = selection;
    const transfer = button('Transfer', 'toggle-transfer');
    transfer.setAttribute('aria-expanded', String(panel === 'transfer'));
    bar.append(
      hint(!from ? 'Choose a country to attack from.' : !to ? `Choose a neighbour of ${name(from)} to attack.` : `Attack ${name(to)} from ${name(from)}?`),
      button('Attack', 'attack', { primary: true, disabled: !from || !to }),
      transfer,
      button('Skip', 'skip'),
    );
    if (panel === 'transfer') bar.append(TransferPanel.render({ game, pending, onAction }));
  } else if (game.phase === 'attacking') {
    // GAME_RULES §6.2: no transfers while an attack is in progress.
    bar.append(
      hint(`Attacking ${name(game.attack.to)} from ${name(game.attack.from)}.`),
      button('Roll', 'roll', { primary: true, key: 'R' }),
      button('Stop attack', 'stop', { key: 'S' }),
      button('Transfer', 'toggle-transfer', { disabled: true }),
    );
  } else if (game.phase === 'occupy') {
    bar.append(occupyForm(game, pending, onAction));
  }

  bar.append(button('Copy link', 'copy-link'));
  return bar;
}

// GAME_RULES §5.6, DESIGN §2 OccupyDialog. Two parts in one form: how many soldiers to move in, then
// how to split the bonus across your countries. No upper limit for the move-in is worked out here
// (CLAUDE.md: no user-facing numbers computed in the browser); a count out of range comes back as the
// server's 422 message.
function occupyForm(game, pending, onAction) {
  const { from, to, bonus } = game.attack;
  const count = el('input', { type: 'number', name: 'count', min: '1', step: '1', value: '1', required: true, id: 'occupy-count' });
  const confirm = el('button', { type: 'submit', class: 'button button--primary' }, 'Occupy');
  const steppers = PlacementSteppers.create({
    owned: ownedBy(game, 'human'),
    total: bonus,
    pending,
    noun: 'bonus',
    onChange: () => { confirm.disabled = pending || !steppers.complete(); },
  });
  confirm.disabled = pending || !steppers.complete();

  const form = el(
    'form',
    { class: 'panel-form' },
    el('p', { class: 'action-bar__hint' }, `${game.countries[to].name} is yours. Move soldiers in from ${game.countries[from].name}, then place your ${bonus} bonus soldiers.`),
    el('label', { for: 'occupy-count' }, `Soldiers to move in (leave at least 1 in ${game.countries[from].name})`),
    count,
    el('p', { class: 'panel-form__heading' }, 'Place the bonus'),
    steppers.element,
    confirm,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (steppers.complete()) onAction('occupy', { count: Number(count.value), placements: steppers.placements() });
  });
  return form;
}
