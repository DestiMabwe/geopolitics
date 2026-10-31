import { leader } from './victory.js';

// GAME_RULES §8.1. Fortress's eligibility, s ≥ 2t + 1, is the same as its threshold, s − 2t ≥ 1.
const PROFILES = {
  warlord: {
    threshold: 0,
    score: (s, t) => s.soldiers - t.soldiers + (t.owner === 'human' ? 2 : 0),
  },
  fortress: {
    threshold: 1,
    score: (s, t) => s.soldiers - 2 * t.soldiers,
  },
  opportunist: {
    threshold: 2,
    score: (s, t, leaderId) =>
      s.soldiers - t.soldiers + (t.soldiers <= 2 ? 3 : 0) + (t.owner === leaderId ? 2 : 0),
  },
};

/**
 * Picks the attack an NPC wants this turn, or decides to skip. Does not mutate `state`.
 * GAME_RULES §8.1
 *
 * Candidates are every `(s, t)` where the NPC owns `s`, `soldiers(s) ≥ 2`, `t` borders `s`
 * and the NPC does not own `t`. Each is scored by the NPC's profile, and any below the
 * profile's threshold are dropped. Tie-break order: highest score → lowest `soldiers(t)`
 * → `t` code alphabetical → `s` code alphabetical.
 *
 * Trusts `state`: only `playNpcTurn` calls this, so it never sees client input.
 *
 * @param {object} state
 * @param {string} playerId the NPC choosing, e.g. `npc:BRA`
 * @returns {{ from: string, to: string } | null} the attack, or `null` to skip
 */
export function chooseTarget(state, playerId) {
  const { threshold, score } = PROFILES[state.players[playerId].profile];
  const owners = Object.values(state.countries).map((c) => c.owner);
  // Eliminated players own no countries, so they can't appear here.
  const leaderId = leader(owners.filter((owner) => owner !== playerId));

  const candidates = [];
  for (const [from, source] of Object.entries(state.countries)) {
    if (source.owner !== playerId || source.soldiers < 2) continue;
    for (const to of state.borders[from]) {
      const target = state.countries[to];
      if (target.owner === playerId) continue;
      const points = score(source, target, leaderId);
      if (points >= threshold) candidates.push({ from, to, points, soldiers: target.soldiers });
    }
  }
  if (candidates.length === 0) return null;

  const [{ from, to }] = candidates.sort(byBestAttack);
  return { from, to };
}

// §8.1 tie-break order.
const byBestAttack = (a, b) =>
  b.points - a.points ||
  a.soldiers - b.soldiers ||
  a.to.localeCompare(b.to) ||
  a.from.localeCompare(b.from);
