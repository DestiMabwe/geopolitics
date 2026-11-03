import { el } from '../dom.js';
import { pipsFor, FACE_VALUE, FACE_TRANSFORM, restRotation, tumblePlan } from '../dice3d.js';

// DESIGN §2 DicePanel: the latest roll, attacker dice on top and defender dice below, one column
// per pair in roll order (GAME_RULES §5.3, I-7), a ring per pair. Shows only server dice.
// The dice are real cubes with pips. A new roll tumbles for a moment and comes to rest on the server's
// numbers; the tumble is decoration and never chooses a value (CLAUDE.md hard rules). The win, lose and
// tie rings, the total and the outcome appear once the dice have landed (CSS, after `--duration-dice`).

const OUTCOME_TEXT = {
  conquered: (to) => `${to} conquered`,
  failed: (to) => `Attack on ${to} failed`,
  stopped: (to) => `Attack on ${to} stopped`,
};

// Slows down at the end, like a die losing speed.
const TUMBLE_EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
// A toss: up, down, a small second bounce, still.
const HOP = [
  { transform: 'translateY(0)' },
  { transform: 'translateY(-16px)', offset: 0.35 },
  { transform: 'translateY(0)', offset: 0.7 },
  { transform: 'translateY(-4px)', offset: 0.85 },
  { transform: 'translateY(0)' },
];

/** One die: a cube whose six faces carry their pips, at rest showing `value` (or value 1 when undecided). */
function die(value, ringClass = '') {
  const rest = restRotation(value);
  const faces = Object.entries(FACE_VALUE).map(([name, faceValue]) =>
    el(
      'span',
      { class: `die__face die__face--${name}`, style: `transform: ${FACE_TRANSFORM[name]} translateZ(calc(var(--die) / 2))` },
      ...pipsFor(faceValue).map((cell) =>
        el('i', { class: 'die__pip', style: `grid-area: ${Math.floor(cell / 3) + 1} / ${(cell % 3) + 1}` }),
      ),
    ),
  );
  return el(
    'span',
    { class: `die ${ringClass}`.trim(), 'data-value': String(value), 'aria-hidden': 'true' },
    el('span', { class: 'die__cube', style: `transform: rotateX(${rest.x}deg) rotateY(${rest.y}deg)` }, ...faces),
  );
}

/** Starts the tumble on every die in `panel`, once it is on the page. Never changes what a die shows. */
function tumble(panel, seq) {
  const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-dice')) || 0;
  if (!duration) return; // reduced motion: the dice simply appear, at rest
  requestAnimationFrame(() => {
    panel.querySelectorAll('.dice-panel__row').forEach((row, rowIndex) => {
      row.querySelectorAll('.die').forEach((dieEl, index) => {
        const value = Number(dieEl.dataset.value);
        const rest = restRotation(value);
        // The same index in each row, so the two dice of a pair land together.
        const plan = tumblePlan(seq + rowIndex * 101, index, value);
        dieEl.style.setProperty('--delay', `${plan.delay}ms`);
        dieEl.querySelector('.die__cube').animate(
          [
            { transform: `rotateX(${plan.fromX}deg) rotateY(${plan.fromY}deg)` },
            { transform: `rotateX(${rest.x}deg) rotateY(${rest.y}deg)` },
          ],
          { duration, delay: plan.delay, easing: TUMBLE_EASE, fill: 'backwards' },
        );
        dieEl.animate(HOP, { duration, delay: plan.delay, easing: 'ease-out', fill: 'backwards' });
      });
    });
  });
}

/**
 * @param {object} props
 * @param {{ seq?: number, data: object } | null} props.roll  the latest `roll` event, or null
 * @param {object} props.game
 * @param {boolean} [props.rolling]  a roll request is on its way: two spinning dice, no values
 * @param {boolean} [props.attacking]  an attack is under way but nothing has been rolled yet
 * @param {{ kind: 'conquered' | 'failed' | 'stopped', to: string } | null} [props.outcome]  how the latest attack ended (DESIGN §2 states)
 * @param {boolean} [props.animate]  this roll is new: tumble, then land
 * @returns {HTMLElement}
 */
export function render({ roll, game, rolling = false, attacking = false, outcome = null, animate = false }) {
  const panel = el('div', { class: 'dice-panel' }, el('h2', { class: 'dice-panel__title' }, 'Dice'));

  if (rolling) {
    // Decoration only: the real dice replace these the moment the server answers.
    panel.append(
      el('div', { class: 'dice-panel__row dice-panel__row--idle' }, die(1, 'die--idle'), die(1, 'die--idle')),
      el('p', { class: 'dice-panel__status dice-panel__status--rolling' }, 'Rolling…'),
    );
    return panel;
  }
  if (!roll) {
    panel.append(el('p', { class: 'dice-panel__status' }, attacking ? 'No dice rolled yet.' : 'Pick a target to attack.'));
    return panel;
  }

  const d = roll.data;
  const name = (code) => game.countries[code]?.name ?? code;
  // The ring only colours what the server already decided: higher die wins, tie kills nobody.
  const ring = (mine, theirs) => (mine > theirs ? 'win' : mine < theirs ? 'lose' : 'tie');
  const row = (label, dice, other) =>
    el(
      'div',
      { class: 'dice-panel__row' },
      el('span', { class: 'dice-panel__label' }, label),
      ...dice.map((value, i) => die(value, `die--${ring(value, other[i])}`)),
    );

  panel.append(
    el(
      'div',
      { class: 'dice-panel__dice', role: 'img', 'aria-label': `${d.attackerDice.join(', ')} against ${d.defenderDice.join(', ')}` },
      row(name(d.from), d.attackerDice, d.defenderDice),
      row(name(d.to), d.defenderDice, d.attackerDice),
    ),
    el('p', { class: 'dice-panel__total' }, `${d.attackerLeft} vs ${d.defenderLeft}`),
  );
  if (outcome) {
    panel.append(el('p', { class: `dice-panel__outcome dice-panel__outcome--${outcome.kind}` }, OUTCOME_TEXT[outcome.kind](name(outcome.to))));
  }
  if (animate) {
    panel.classList.add('dice-panel--tumbling');
    tumble(panel, roll.seq ?? 0);
  }
  return panel;
}
