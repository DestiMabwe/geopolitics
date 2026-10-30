// DESIGN §3.2 StartScreen: a searchable country list, sortable by name or soldier value.
// Pure (no DOM), so it runs in the unit tests.

/**
 * The countries matching `query`, sorted.
 *
 * - `query` is trimmed and matched case-insensitively against the name or the code;
 *   an empty query keeps every country.
 * - `sort: 'name'` → A–Z. `sort: 'value'` → highest soldier value first, then A–Z.
 *
 * @param {{ code: string, name: string, value: number }[]} countries
 * @param {string} query
 * @param {'name' | 'value'} [sort]
 * @returns {object[]} a new array; `countries` is not changed
 */
export function searchCountries(countries, query, sort = 'name') {
  const q = query.trim().toLowerCase();
  const matches = countries.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
  );
  const byName = (a, b) => a.name.localeCompare(b.name);
  return matches.sort(sort === 'value' ? (a, b) => b.value - a.value || byName(a, b) : byName);
}

/**
 * Population as the StartScreen shows it: `64.0M`, `850K`, or the plain number below 1,000.
 * Formatting only: the number itself comes from the server.
 *
 * @param {number} population
 * @returns {string}
 */
export function formatPopulation(population) {
  if (population >= 1e9) return `${(population / 1e9).toFixed(2)}B`;
  if (population >= 1e6) return `${(population / 1e6).toFixed(1)}M`;
  if (population >= 1e3) return `${Math.round(population / 1e3)}K`;
  return String(population);
}
