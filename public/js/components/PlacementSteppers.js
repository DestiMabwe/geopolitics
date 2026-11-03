import { el } from '../dom.js';
import { add, remove, remaining, isComplete } from '../placements.js';

// The −/+ stepper per country shared by ReinforcePanel and the occupy form (DESIGN §2): split `total`
// new soldiers across the countries you own. The split is local state; the steppers update in place
// so keyboard focus stays on the button that was pressed. The server re-checks the final split.

/**
 * @param {object} props
 * @param {[string, { name: string }][]} props.owned  `[code, country]` pairs, from `ownedBy`
 * @param {number} props.total  soldiers to place, from the server
 * @param {boolean} props.pending  a request is on its way: every stepper disabled
 * @param {string} props.noun  what is being placed, for labels: 'bonus' or 'new'
 * @param {(placements: Record<string, number>) => void} props.onChange  called after each press
 * @returns {{ element: HTMLElement, placements: () => Record<string, number>, complete: () => boolean }}
 */
export function create({ owned, total, pending, noun, onChange }) {
  let placements = {};

  const left = el('p', { class: 'panel-form__left', role: 'status' });
  const steppers = owned.map(([code, country]) => {
    const step = (label, symbol, change) => {
      const b = el('button', { type: 'button', class: 'button panel-form__step', 'aria-label': `${label} ${country.name}` }, symbol);
      b.addEventListener('click', () => {
        placements = change(placements, code);
        sync();
        onChange(placements);
      });
      return b;
    };
    return {
      code,
      country,
      qty: el('output', { class: 'panel-form__qty', 'aria-label': `${noun} soldiers on ${country.name}` }),
      minus: step(`Take a ${noun} soldier off`, '−', remove),
      plus: step(`Add a ${noun} soldier to`, '+', (map, key) => add(map, key, total)),
    };
  });

  function sync() {
    left.textContent = `${remaining(placements, total)} of ${total} ${noun} soldiers left to place`;
    for (const { code, qty, minus, plus } of steppers) {
      qty.textContent = String(placements[code] ?? 0);
      minus.disabled = pending || !placements[code];
      plus.disabled = pending || remaining(placements, total) <= 0;
    }
  }
  sync();

  const rows = el(
    'ul',
    { class: 'panel-form__rows' },
    ...steppers.map(({ country, qty, minus, plus }) =>
      el('li', { class: 'panel-form__row' }, el('span', { class: 'panel-form__country' }, country.name), minus, qty, plus),
    ),
  );

  return {
    element: el('div', { class: 'panel-form__steppers' }, rows, left),
    placements: () => placements,
    complete: () => isComplete(placements, total),
  };
}
