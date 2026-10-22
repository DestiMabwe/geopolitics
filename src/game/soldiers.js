const BRACKET_LIMITS = [
  // [upper limit, soldier value]
  [5_000_000, 1],
  [10_000_000, 2],
  [25_000_000, 3],
  [50_000_000, 4],
  [75_000_000, 5],
  [100_000_000, 6],
  [125_000_000, 7],
  [150_000_000, 8],
];

/**
 * Soldier value of a country from its population. Bracket limits are inclusive.
 * GAME_RULES §1.2
 * @param {number} population
 * @returns {number} 1–9
 */
export function soldierValue(population) {
  for (const [limit, value] of BRACKET_LIMITS) {
    if (population <= limit) {
      return value;
    }
  }
  return 9;
}

/**
 * New soldiers the attacker earns for conquering a country: max(2, floor(value / 2)).
 * GAME_RULES §5.5
 * @param {number} value soldier value of the conquered country
 * @returns {number}
 */
export function conquestBonus(value) {
  return Math.max(2, Math.floor(value / 2));
}

/**
 * Soldiers a player receives at the start of a turn from round 2 on: 2 × countriesOwned.
 * GAME_RULES §7.2
 * @param {number} countriesOwned
 * @returns {number}
 */
export function reinforcementAmount(countriesOwned) {
  return countriesOwned * 2;
}
