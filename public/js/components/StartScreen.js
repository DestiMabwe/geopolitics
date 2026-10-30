import { el } from '../dom.js';
import { searchCountries, formatPopulation } from '../countrySearch.js';

// DESIGN §2 StartScreen, §3.2. Search, pick one country, Begin. It reports the choice through
// onBegin and app.js starts the game; the server picks the other 9.

/**
 * @param {object} props
 * @param {{ code: string, name: string, population: number, value: number }[]} props.countries  from GET /countries
 * @param {(code: string) => void} props.onBegin
 * @returns {HTMLElement}
 */
export function render({ countries, onBegin }) {
  let selected = null;

  const search = el('input', {
    type: 'search', id: 'start-search', class: 'start__search',
    placeholder: 'Search countries', autocomplete: 'off', 'aria-controls': 'start-list',
  });
  const sort = el(
    'select',
    { class: 'start__sort', 'aria-label': 'Sort by' },
    el('option', { value: 'name' }, 'A–Z'),
    el('option', { value: 'value' }, 'Soldier value'),
  );
  const list = el('ul', { id: 'start-list', class: 'start__list', role: 'listbox', 'aria-label': 'Countries' });
  const summary = el('p', { class: 'start__summary', 'aria-live': 'polite' }, 'Pick the country you will play.');
  const begin = el('button', { type: 'submit', class: 'button button--primary', disabled: true }, 'Begin');

  function drawList() {
    const matches = searchCountries(countries, search.value, sort.value);
    list.replaceChildren(
      ...matches.map((c) => {
        const row = el(
          'li',
          { role: 'option', 'aria-selected': String(c.code === selected?.code) },
          el(
            'button',
            { type: 'button', class: 'start__country', 'data-code': c.code },
            el('span', { class: 'start__name' }, c.name),
            el('span', { class: 'start__meta' }, `${formatPopulation(c.population)} · ★${c.value}`),
          ),
        );
        return row;
      }),
    );
    if (!matches.length) list.append(el('li', { class: 'start__empty' }, 'No country matches.'));
  }

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-code]');
    if (!button) return;
    selected = countries.find((c) => c.code === button.dataset.code);
    summary.textContent = `${selected.name} · ${formatPopulation(selected.population)} · ★${selected.value}`;
    begin.disabled = false;
    drawList();
  });
  search.addEventListener('input', drawList);
  sort.addEventListener('change', drawList);

  const form = el(
    'form',
    { class: 'start' },
    el('h2', { class: 'start__title' }, 'Start a new game'),
    el('div', { class: 'start__controls' }, search, sort),
    list,
    el('div', { class: 'start__footer' }, summary, begin),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (selected) onBegin(selected.code);
  });

  drawList();
  return form;
}

/**
 * @param {HTMLElement} form  from render()
 * @param {{ submitting: boolean }} props
 */
export function update(form, { submitting }) {
  for (const control of form.querySelectorAll('input, select, button')) {
    control.disabled = submitting || (control.type === 'submit' && !form.querySelector('[aria-selected="true"]'));
  }
  form.classList.toggle('start--submitting', submitting);
  form.setAttribute('aria-busy', String(submitting));
}
