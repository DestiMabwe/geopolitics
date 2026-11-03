import { leader } from './victory.js';

// One plain-English reason for each NPC decision, so the player can see why it chose what it did
// (brief p.5: "show every NPC decision with a brief justification"). GAME_RULES §8.
//
// Every function is pure: it reads the state as it was when the NPC decided, never mutates it, and
// builds the sentence only from numbers and names in that state. The wording is free, but the
// numbers must be the real ones behind the choice. Names come from `state.countries[code].name`.

const NAMES = { warlord: 'Warlord', fortress: 'Fortress', opportunist: 'Opportunist' };
const THRESHOLDS = { warlord: 0, fortress: 1, opportunist: 2 }; // §8.1 table
const ROLL_LIMIT = 20; // §8.2, the same cap `shouldStop` uses

const soldiers = (n) => `${n} soldier${n === 1 ? '' : 's'}`;

// The NPC's profile code, or a throw for one the rules do not define.
function profileOf(state, playerId) {
  const { profile } = state.players[playerId];
  if (!Object.hasOwn(NAMES, profile)) throw new Error(`unknown profile ${profile}`);
  return profile;
}

const ownedBy = (state, playerId) =>
  Object.entries(state.countries).filter(([, c]) => c.owner === playerId);

// §8.1: the NPC's first country in `order`, ties to the lower code.
function pickOwned(state, playerId, order) {
  const [[, country]] = ownedBy(state, playerId).sort(
    ([aCode, a], [bCode, b]) => order(a, b) || aCode.localeCompare(bCode),
  );
  return country;
}

/**
 * Why the NPC puts its new soldiers where it does. GAME_RULES §8.1 Reinforce.
 *
 * @param {object} state phase `reinforce`, before the soldiers are placed
 * @param {string} playerId the NPC, e.g. `npc:BRA`
 * @param {number} amount soldiers being placed
 * @returns {string} e.g. "Puts all 4 on Brazil, its biggest country."
 */
export function reinforceReason(state, playerId, amount) {
  const profile = profileOf(state, playerId);
  if (profile === 'fortress') {
    const weakest = pickOwned(state, playerId, (a, b) => a.soldiers - b.soldiers);
    return `Fortress: shores up ${weakest.name}, its weakest country (${soldiers(weakest.soldiers)}), adding ${amount} one at a time to whichever has the fewest.`;
  }
  const biggest = pickOwned(state, playerId, (a, b) => b.soldiers - a.soldiers);
  return `${NAMES[profile]}: puts all ${amount} on ${biggest.name}, its biggest country (${soldiers(biggest.soldiers)}).`;
}

/**
 * Why the NPC picked this attack. GAME_RULES §8.1 target score.
 *
 * @param {object} state phase `attack`, before `startAttack`
 * @param {string} playerId
 * @param {{ from: string, to: string }} target the pair `chooseTarget` returned
 * @returns {string} names the profile's reason and the real score and soldier counts
 */
export function targetReason(state, playerId, target) {
  const profile = profileOf(state, playerId);
  const s = state.countries[target.from];
  const t = state.countries[target.to];

  if (profile === 'warlord') {
    const human = t.owner === 'human';
    const score = s.soldiers - t.soldiers + (human ? 2 : 0);
    const who = human ? 'goes for the human' : 'has no human in reach, so takes the best odds';
    return `Warlord: ${who}, ${t.name} from ${s.name}, score ${s.soldiers} − ${t.soldiers}${human ? ' + 2' : ''} = ${score}.`;
  }

  if (profile === 'fortress') {
    const score = s.soldiers - 2 * t.soldiers;
    return `Fortress: ${t.name} is a sure win, ${s.soldiers} ≥ 2×${t.soldiers} + 1, score ${s.soldiers} − 2×${t.soldiers} = ${score}.`;
  }

  // Same leader as `chooseTarget`: ignoring the NPC itself, ties give no leader.
  const owners = Object.values(state.countries).map((c) => c.owner);
  const leaderId = leader(owners.filter((owner) => owner !== playerId));
  const weak = t.soldiers <= 2;
  const leads = t.owner === leaderId;
  const terms = [`${s.soldiers} − ${t.soldiers}`];
  if (weak) terms.push('3');
  if (leads) terms.push('2');
  const score = s.soldiers - t.soldiers + (weak ? 3 : 0) + (leads ? 2 : 0);
  const why = [weak && `a weak target with ${soldiers(t.soldiers)}`, leads && 'the leader']
    .filter(Boolean)
    .join(' and ');
  return `Opportunist: ${t.name} is ${why || 'the best odds'}, score ${terms.join(' + ')} = ${score}.`;
}

/**
 * Why the NPC found no attack worth making. GAME_RULES §8.1 step 3.
 *
 * @param {object} state phase `attack`, when `chooseTarget` returned `null`
 * @param {string} playerId
 * @returns {string}
 */
export function skipReason(state, playerId) {
  const profile = profileOf(state, playerId);
  const label = NAMES[profile];
  const biggest = pickOwned(state, playerId, (a, b) => b.soldiers - a.soldiers);
  if (biggest.soldiers < 2) {
    return `${label}: no country has 2 or more soldiers, so it cannot attack.`;
  }
  if (profile === 'fortress') {
    return `Fortress: no neighbour is a sure win; its biggest country has ${soldiers(biggest.soldiers)} and a sure win needs 2×theirs + 1.`;
  }
  return `${label}: no target scores ${THRESHOLDS[profile]} or more, so it skips.`;
}

/**
 * Why the NPC calls off the attack in progress. GAME_RULES §8.1 stop rule, §8.2 the 20-roll cap.
 *
 * @param {object} state phase `attacking`, when `shouldStop` is true
 * @param {string} playerId
 * @returns {string} names the rule that fired with the soldier counts, or the 20-roll cap
 */
export function stopReason(state, playerId) {
  const profile = profileOf(state, playerId);
  const { from, to, rolls } = state.attack;
  const mine = state.countries[from].soldiers;
  const theirs = state.countries[to].soldiers;
  const label = NAMES[profile];

  if (rolls >= ROLL_LIMIT) return `${label}: stops after ${ROLL_LIMIT} rolls, the safety cap.`;
  if (profile === 'fortress') {
    return `Fortress: ${mine} < 2×${theirs} + 1, so it is no longer a sure win.`;
  }
  if (profile === 'opportunist') {
    return `Opportunist: ${mine} ≤ ${theirs}, so the odds are gone.`;
  }
  return `${label}: stops after ${ROLL_LIMIT} rolls, the safety cap.`; // Warlord only stops at the cap
}

/**
 * Why the NPC moves this many soldiers into a country it just conquered. GAME_RULES §8.1 Occupy.
 *
 * @param {object} state phase `occupy`, before the move-in
 * @param {string} playerId
 * @param {number} count soldiers moved in, from `npcOccupy`
 * @returns {string}
 */
export function occupyReason(state, playerId, count) {
  const profile = profileOf(state, playerId);
  const { from, to } = state.attack;
  const conquered = state.countries[to].name;
  if (profile === 'warlord') {
    const mine = state.countries[from].soldiers;
    return `Warlord: moves ${count} into ${conquered}, half of what it can spare, floor((${mine} − 1) / 2).`;
  }
  return `${NAMES[profile]}: moves just ${count} into ${conquered} and keeps the rest where they were.`;
}
