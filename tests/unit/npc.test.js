import { describe, it, expect } from 'vitest';
import { chooseTarget } from '../../src/game/npc.js';
import { makeState } from '../helpers.js';

const ME = 'npc:ME';

/**
 * A board holding only the listed countries, so nothing else skews the leader counts.
 *
 * @param {string} profile the profile of `ME`
 * @param {Record<string, [string, number]>} owned `{ CODE: [owner, soldiers] }`
 * @param {[string, string][]} [edges] borders, both ways. By default everything borders everything.
 * @returns {object} a game state
 */
function board(profile, owned, edges) {
  const codes = Object.keys(owned);
  const links = edges ?? codes.flatMap((a, i) => codes.slice(i + 1).map((b) => [a, b]));

  const borders = Object.fromEntries(codes.map((code) => [code, []]));
  for (const [a, b] of links) {
    borders[a].push(b);
    borders[b].push(a);
  }

  const owners = new Set(['human', ME, ...Object.values(owned).map(([owner]) => owner)]);
  const players = {};
  for (const id of owners) {
    players[id] = {
      type: id === 'human' ? 'human' : 'npc',
      profile: id === 'human' ? null : id === ME ? profile : 'warlord',
      homeCode: codes[0],
      eliminated: false,
    };
  }

  const state = makeState({ players, turnOrder: [...owners], borders });
  state.countries = Object.fromEntries(
    Object.entries(owned).map(([code, [owner, soldiers]]) => [
      code,
      { name: code, value: 1, lat: 0, lng: 0, owner, soldiers },
    ]),
  );
  return state;
}

describe('chooseTarget (GAME_RULES §8.1)', () => {
  describe('§8.3 worked examples', () => {
    it('Warlord ARG(6) attacks CHL: the 4s tie and CHL has fewer soldiers', () => {
      const state = board('warlord', {
        ARG: [ME, 6],
        BRA: ['human', 4],
        CHL: ['npc:CHL', 2],
        PER: ['npc:PER', 5],
      });
      expect(chooseTarget(state, ME)).toEqual({ from: 'ARG', to: 'CHL' });
    });

    it('Fortress EGY(5) attacks MAR, the highest score, and ignores ineligible NGA', () => {
      const state = board('fortress', {
        EGY: [ME, 5],
        KEN: ['npc:KEN', 2],
        MAR: ['npc:MAR', 1],
        NGA: ['npc:NGA', 3],
      });
      expect(chooseTarget(state, ME)).toEqual({ from: 'EGY', to: 'MAR' });
    });

    it('Fortress EGY(4) skips when every neighbour has at least 2 soldiers', () => {
      const state = board('fortress', {
        EGY: [ME, 4],
        KEN: ['npc:KEN', 2],
        MAR: ['npc:MAR', 2],
        NGA: ['npc:NGA', 3],
      });
      expect(chooseTarget(state, ME)).toBeNull();
    });

    it('Opportunist TUR(5) attacks NPL over the leader-owned IND', () => {
      const state = board(
        'opportunist',
        {
          TUR: [ME, 5],
          IND: ['human', 3],
          NPL: ['npc:NPL', 1],
          IRN: ['npc:IRN', 4],
          KAZ: ['human', 9],
          RUS: ['human', 9],
        },
        [['TUR', 'IND'], ['TUR', 'NPL'], ['TUR', 'IRN']],
      );
      expect(chooseTarget(state, ME)).toEqual({ from: 'TUR', to: 'NPL' });
    });
  });

  describe('candidates', () => {
    it('never launches from a country with 1 soldier', () => {
      const state = board(
        'warlord',
        {
          AAA: [ME, 1],
          BBB: [ME, 2],
          CCC: ['human', 1], // would score 2 from AAA
          DDD: ['npc:DDD', 2], // scores 0 from BBB
        },
        [['AAA', 'CCC'], ['BBB', 'DDD']],
      );
      expect(chooseTarget(state, ME)).toEqual({ from: 'BBB', to: 'DDD' });
    });

    it('never targets a country that does not border the source', () => {
      const state = board(
        'warlord',
        {
          ARG: [ME, 6],
          BRA: ['npc:BRA', 2],
          CHL: ['npc:CHL', 1], // would score higher, but only borders BRA
        },
        [['ARG', 'BRA'], ['BRA', 'CHL']],
      );
      expect(chooseTarget(state, ME)).toEqual({ from: 'ARG', to: 'BRA' });
    });

    it('never targets a country the NPC owns', () => {
      const state = board('warlord', {
        AAA: [ME, 6],
        BBB: [ME, 1], // would score 5
        CCC: ['npc:CCC', 5],
      });
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'CCC' });
    });

    it('returns null when the NPC has no country with 2 or more soldiers', () => {
      const state = board('warlord', { AAA: [ME, 1], BBB: ['human', 1] });
      expect(chooseTarget(state, ME)).toBeNull();
    });
  });

  describe('thresholds', () => {
    it('Warlord attacks at exactly score 0', () => {
      const state = board('warlord', { AAA: [ME, 2], BBB: ['human', 4] });
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'BBB' });
    });

    it('Warlord skips below score 0', () => {
      const state = board('warlord', { AAA: [ME, 2], BBB: ['human', 5] });
      expect(chooseTarget(state, ME)).toBeNull();
    });

    it('Warlord adds 2 only for human-owned targets', () => {
      const state = board('warlord', {
        AAA: [ME, 5],
        BBB: ['npc:BBB', 4], // scores 1
        CCC: ['human', 5], // scores 2
      });
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'CCC' });
    });

    it('Fortress attacks at exactly s = 2t + 1', () => {
      const state = board('fortress', { AAA: [ME, 5], BBB: ['npc:BBB', 2] });
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'BBB' });
    });

    it('Fortress skips at s = 2t', () => {
      const state = board('fortress', { AAA: [ME, 4], BBB: ['npc:BBB', 2] });
      expect(chooseTarget(state, ME)).toBeNull();
    });

    // ZZZ gives a second player one country too. Without it, BBB's owner would be the leader.
    const opportunist = (mine, theirs) =>
      board('opportunist', { AAA: [ME, mine], BBB: ['npc:BBB', theirs], ZZZ: ['human', 9] }, [['AAA', 'BBB']]);

    it('Opportunist attacks at exactly score 2', () => {
      expect(chooseTarget(opportunist(5, 3), ME)).toEqual({ from: 'AAA', to: 'BBB' });
    });

    it('Opportunist skips at score 1', () => {
      expect(chooseTarget(opportunist(4, 3), ME)).toBeNull();
    });

    it('Opportunist adds 3 for a target with exactly 2 soldiers and not for 3', () => {
      expect(chooseTarget(opportunist(2, 2), ME)).toEqual({ from: 'AAA', to: 'BBB' }); // 0 + 3
      expect(chooseTarget(opportunist(3, 3), ME)).toBeNull(); // 0
    });
  });

  describe('tie-break order', () => {
    it('prefers the highest score over fewer defending soldiers', () => {
      const state = board('warlord', {
        AAA: [ME, 6],
        BBB: ['npc:BBB', 3], // scores 3
        CCC: ['human', 4], // scores 4
      });
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'CCC' });
    });

    it('breaks a score tie by lowest soldiers(t)', () => {
      const state = board('warlord', {
        AAA: [ME, 6],
        BBB: ['human', 4], // scores 4, and comes first by code
        CCC: ['npc:CCC', 2], // scores 4
      });
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'CCC' });
    });

    it('breaks a further tie by t.code alphabetically', () => {
      const state = board(
        'warlord',
        {
          AAA: [ME, 5], // the lower s.code must not decide before t.code does
          BBB: [ME, 5],
          CCC: ['npc:CCC', 2],
          DDD: ['npc:DDD', 2],
        },
        [['AAA', 'DDD'], ['BBB', 'CCC']],
      );
      expect(chooseTarget(state, ME)).toEqual({ from: 'BBB', to: 'CCC' });
    });

    it('breaks a final tie by s.code alphabetically', () => {
      const state = board(
        'warlord',
        {
          BBB: [ME, 4], // listed first, so the order on the board must not decide
          AAA: [ME, 4],
          TTT: ['npc:TTT', 1],
        },
        [['BBB', 'TTT'], ['AAA', 'TTT']],
      );
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'TTT' });
    });
  });

  describe('leader', () => {
    const edges = [['AAA', 'BBB'], ['AAA', 'CCC']];

    it('adds 2 for a target owned by the leader', () => {
      const state = board(
        'opportunist',
        {
          AAA: [ME, 5],
          BBB: ['npc:LDR', 4], // scores 1 + 2
          LLL: ['npc:LDR', 9],
          CCC: ['npc:CCC', 3], // scores 2
          HHH: ['human', 9],
        },
        edges,
      );
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'BBB' });
    });

    it('gives no leader bonus when two players tie for most countries', () => {
      const state = board(
        'opportunist',
        {
          AAA: [ME, 5],
          BBB: ['npc:LDR', 4], // scores 1
          LLL: ['npc:LDR', 9],
          CCC: ['npc:CCC', 3], // scores 2
          HHH: ['human', 9],
          III: ['human', 9],
        },
        edges,
      );
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'CCC' });
    });

    it('gives no leader bonus in round 1', () => {
      const state = board('opportunist', { AAA: [ME, 5], BBB: ['npc:BBB', 4], CCC: ['human', 9] }, [['AAA', 'BBB']]);
      expect(chooseTarget(state, ME)).toBeNull();
    });

    it('does not count the NPC itself when finding the leader', () => {
      const state = board(
        'opportunist',
        {
          AAA: [ME, 5],
          MMM: [ME, 1],
          NNN: [ME, 1],
          BBB: ['npc:LDR', 4], // scores 1 + 2
          LLL: ['npc:LDR', 9],
          CCC: ['npc:CCC', 3], // scores 2
          HHH: ['human', 9],
        },
        edges,
      );
      expect(chooseTarget(state, ME)).toEqual({ from: 'AAA', to: 'BBB' });
    });
  });

  it('does not mutate state', () => {
    const state = board('warlord', { AAA: [ME, 6], BBB: ['human', 4] });
    const before = structuredClone(state);
    chooseTarget(state, ME);
    expect(state).toEqual(before);
  });
});
