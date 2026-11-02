import { describe, it, expect } from 'vitest';
import { chooseTarget, npcOccupy, npcReinforce, playNpcTurn, shouldStop } from '../../src/game/npc.js';
import { WrongPhaseError } from '../../src/game/errors.js';
import { makeState, scripted } from '../helpers.js';

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

describe('npcReinforce (GAME_RULES §8.1)', () => {
  // ZZZ is someone else's, so it must be ignored however many soldiers it has.
  const strongest = (profile) =>
    board(profile, { AAA: [ME, 2], BBB: [ME, 5], CCC: [ME, 1], ZZZ: ['human', 9] });
  const weakest = () =>
    board('fortress', { AAA: [ME, 5], BBB: [ME, 2], CCC: [ME, 3], ZZZ: ['human', 1] });

  it('Warlord puts everything on its country with the most soldiers', () => {
    expect(npcReinforce(strongest('warlord'), ME, 4)).toEqual({ BBB: 4 });
  });

  it('Opportunist puts everything on its country with the most soldiers', () => {
    expect(npcReinforce(strongest('opportunist'), ME, 4)).toEqual({ BBB: 4 });
  });

  it('breaks a most-soldiers tie by code', () => {
    const state = board('warlord', { BBB: [ME, 5], AAA: [ME, 5] });
    expect(npcReinforce(state, ME, 3)).toEqual({ AAA: 3 });
  });

  it('Fortress places one at a time on its country with the fewest soldiers', () => {
    expect(npcReinforce(weakest(), ME, 2)).toEqual({ BBB: 2 }); // 2 → 3, then the tie with CCC → 4
  });

  it('Fortress counts soldiers it has just placed', () => {
    expect(npcReinforce(weakest(), ME, 3)).toEqual({ BBB: 2, CCC: 1 }); // BBB is now the strongest of the two
  });

  it('breaks a fewest-soldiers tie by code', () => {
    const state = board('fortress', { BBB: [ME, 2], AAA: [ME, 2] });
    expect(npcReinforce(state, ME, 3)).toEqual({ AAA: 2, BBB: 1 });
  });
});

describe('shouldStop (GAME_RULES §8.1, §8.2)', () => {
  // AAA is attacking BBB, `rolls` rolls in.
  const fighting = (profile, mine, theirs, rolls = 0) => ({
    ...board(profile, { AAA: [ME, mine], BBB: ['npc:BBB', theirs] }),
    currentTurn: 1,
    phase: 'attacking',
    attack: { from: 'AAA', to: 'BBB', rolls, bonus: null },
  });

  it('Warlord never stops before the cap', () => {
    expect(shouldStop(fighting('warlord', 2, 9), ME)).toBe(false);
  });

  it('Fortress keeps rolling at s = 2t + 1', () => {
    expect(shouldStop(fighting('fortress', 5, 2), ME)).toBe(false);
  });

  it('Fortress stops at s = 2t', () => {
    expect(shouldStop(fighting('fortress', 4, 2), ME)).toBe(true);
  });

  it('Opportunist keeps rolling at s = t + 1', () => {
    expect(shouldStop(fighting('opportunist', 4, 3), ME)).toBe(false);
  });

  it('Opportunist stops at s = t', () => {
    expect(shouldStop(fighting('opportunist', 3, 3), ME)).toBe(true);
  });

  it.each(['warlord', 'fortress', 'opportunist'])('every profile stops at 20 rolls and not at 19: %s', (profile) => {
    expect(shouldStop(fighting(profile, 9, 1, 19), ME)).toBe(false);
    expect(shouldStop(fighting(profile, 9, 1, 20), ME)).toBe(true);
  });
});

describe('npcOccupy (GAME_RULES §8.1, §5.6)', () => {
  // AAA has just conquered BBB, which holds 0 soldiers until occupy moves some in.
  const conquered = (profile, soldiers, others = {}, bonus = 2) => ({
    ...board(profile, { AAA: [ME, soldiers], BBB: [ME, 0], ZZZ: ['human', 1], ...others }),
    currentTurn: 1,
    phase: 'occupy',
    attack: { from: 'AAA', to: 'BBB', rolls: 1, bonus },
  });

  it('Warlord moves in half of soldiers(s) − 1, rounded down', () => {
    expect(npcOccupy(conquered('warlord', 8), ME).count).toBe(3);
  });

  it('Warlord moves in at least 1', () => {
    expect(npcOccupy(conquered('warlord', 2), ME).count).toBe(1);
  });

  it.each(['fortress', 'opportunist'])('Fortress and Opportunist move in 1: %s', (profile) => {
    expect(npcOccupy(conquered(profile, 8), ME).count).toBe(1);
  });

  it.each(['warlord', 'opportunist'])('Warlord and Opportunist put the whole bonus on the new country: %s', (profile) => {
    const state = conquered(profile, 8, { CCC: [ME, 20] }, 3);
    expect(npcOccupy(state, ME).placements).toEqual({ BBB: 3 });
  });

  it('Fortress places the bonus by its Reinforce rule, counting the soldiers just moved in', () => {
    // After the move-in: AAA 4, BBB 1, CCC 2. Without it BBB would start on 0 and take all 3.
    const state = conquered('fortress', 5, { CCC: [ME, 2] }, 3);
    expect(npcOccupy(state, ME)).toEqual({ count: 1, placements: { BBB: 2, CCC: 1 } });
  });
});

describe('playNpcTurn (GAME_RULES §4, §8, §9.2)', () => {
  // board(), on ME's turn. The turn order is the human, ME, then the other owners as listed.
  const myTurn = (profile, owned, edges, fields = {}) => ({
    ...board(profile, owned, edges),
    currentTurn: 1,
    ...fields,
  });
  const edges = [['AAA', 'BBB']];
  const types = (events) => events.map((e) => e.type);

  // §5.7's dice against a value 6 country: AAA ends on 3 soldiers, BBB falls, bonus 3.
  const conquest = () => {
    const state = myTurn(
      'warlord',
      { AAA: [ME, 4], BBB: ['npc:BBB', 2], CCC: ['npc:BBB', 9], HHH: ['human', 9] },
      edges,
    );
    state.countries.BBB.value = 6;
    return state;
  };
  const conquestDice = () => scripted(6, 2, 3, 5, 4, 4, 5, 2);

  it('skips when no target is good enough', () => {
    const state = myTurn('fortress', { AAA: [ME, 4], BBB: ['human', 2], ZZZ: ['npc:ZZZ', 9] }, edges);
    expect(playNpcTurn(state, scripted()).events).toEqual([
      { type: 'skip', player: ME, reason: expect.any(String) },
      { type: 'turnStart', player: 'npc:ZZZ', round: 1 },
    ]);
  });

  it('plays a conquest: attackStart, rolls, conquest, occupy, turnStart', () => {
    const { state, events } = playNpcTurn(conquest(), conquestDice());
    const fight = { player: ME, from: 'AAA', to: 'BBB' };
    expect(events).toEqual([
      { type: 'attackStart', ...fight, reason: expect.any(String) },
      {
        type: 'roll', ...fight,
        attackerDice: [6, 2], defenderDice: [3, 5],
        attackerLosses: 1, defenderLosses: 1, attackerLeft: 3, defenderLeft: 1,
      },
      {
        type: 'roll', ...fight,
        attackerDice: [4], defenderDice: [4],
        attackerLosses: 0, defenderLosses: 0, attackerLeft: 3, defenderLeft: 1,
      },
      {
        type: 'roll', ...fight,
        attackerDice: [5], defenderDice: [2],
        attackerLosses: 0, defenderLosses: 1, attackerLeft: 3, defenderLeft: 0,
      },
      { type: 'conquest', ...fight, previousOwner: 'npc:BBB', bonus: 3 },
      { type: 'occupy', ...fight, count: 1, placements: { BBB: 3 }, reason: expect.any(String) },
      { type: 'turnStart', player: 'npc:BBB', round: 1 },
    ]);
    expect(state.countries.AAA.soldiers).toBe(2);
    expect(state.countries.BBB).toMatchObject({ owner: ME, soldiers: 4 });
  });

  it('places reinforcements first from round 2, and they count when choosing a target', () => {
    // AAA has 3, too few for a Fortress against BBB's 2. The 2 reinforcements make it 5.
    const state = myTurn(
      'fortress',
      { AAA: [ME, 3], BBB: ['npc:BBB', 2], CCC: ['npc:BBB', 9], HHH: ['human', 9] },
      edges,
      { round: 2, phase: 'reinforce', pendingReinforcements: 2 },
    );
    const { events } = playNpcTurn(state, scripted(6, 6, 1, 1));
    expect(types(events)).toEqual(['reinforce', 'attackStart', 'roll', 'conquest', 'occupy', 'turnStart']);
    expect(events[0]).toEqual({
      type: 'reinforce', player: ME, amount: 2, placements: { AAA: 2 }, reason: expect.any(String),
    });
  });

  it('ends with attackFailed when the NPC runs down to 1 soldier', () => {
    const start = myTurn('warlord', { AAA: [ME, 2], BBB: ['human', 2], ZZZ: ['npc:ZZZ', 9] }, edges);
    const { state, events } = playNpcTurn(start, scripted(1, 6));
    expect(types(events)).toEqual(['attackStart', 'roll', 'attackFailed', 'turnStart']);
    expect(state.countries.AAA.soldiers).toBe(1);
    expect(state.countries.BBB).toMatchObject({ owner: 'human', soldiers: 2 });
  });

  it('stops mid-attack when the profile says so', () => {
    const start = myTurn('fortress', { AAA: [ME, 5], BBB: ['npc:BBB', 2], HHH: ['human', 9] }, edges);
    const { state, events } = playNpcTurn(start, scripted(1, 1, 6, 6)); // 3 against 2: 3 < 5
    expect(types(events)).toEqual(['attackStart', 'roll', 'attackStopped', 'turnStart']);
    expect(state.countries.AAA.soldiers).toBe(3);
    expect(state.countries.BBB).toMatchObject({ owner: 'npc:BBB', soldiers: 2 });
  });

  it('stops after 20 rolls of ties', () => {
    const start = myTurn('warlord', { AAA: [ME, 2], BBB: ['human', 2], ZZZ: ['npc:ZZZ', 9] }, edges);
    const { events } = playNpcTurn(start, scripted(...Array(40).fill(3))); // 1 die each, so 2 a roll
    expect(types(events)).toEqual([
      'attackStart',
      ...Array(20).fill('roll'),
      'attackStopped',
      'turnStart',
    ]);
  });

  it('Opportunist with equal soldiers stops before rolling any dice', () => {
    const start = myTurn('opportunist', { AAA: [ME, 2], BBB: ['npc:BBB', 2], HHH: ['human', 9] }, edges);
    const { events } = playNpcTurn(start, scripted());
    expect(types(events)).toEqual(['attackStart', 'attackStopped', 'turnStart']);
  });

  it('eliminates an NPC, then still occupies and ends the turn', () => {
    const start = myTurn('warlord', { AAA: [ME, 3], BBB: ['npc:BBB', 1], HHH: ['human', 9] }, edges);
    const { state, events } = playNpcTurn(start, scripted(6, 1));
    expect(types(events)).toEqual(['attackStart', 'roll', 'conquest', 'elimination', 'occupy', 'turnStart']);
    expect(events[3]).toEqual({ type: 'elimination', player: 'npc:BBB', by: ME });
    expect(events[5]).toEqual({ type: 'turnStart', player: 'human', round: 2 }); // npc:BBB is skipped
    expect(state.players['npc:BBB'].eliminated).toBe(true);
  });

  it('ends the game as lost at once when the human loses their last country', () => {
    const start = myTurn('warlord', { AAA: [ME, 3], BBB: ['human', 1], CCC: ['npc:CCC', 1] }, edges);
    const { state, events } = playNpcTurn(start, scripted(6, 1));
    expect(types(events)).toEqual(['attackStart', 'roll', 'conquest', 'elimination', 'gameOver']);
    expect(events.at(-1)).toEqual({ type: 'gameOver', status: 'lost', winner: ME });
    expect(state).toMatchObject({ status: 'lost', winner: ME, currentTurn: 1 });
  });

  it('passes the turn to the next player', () => {
    // npc:ZZZ owns 2 countries, so it starts its turn with 4 reinforcements to place.
    const start = myTurn(
      'fortress',
      { AAA: [ME, 1], BBB: ['human', 9], YYY: ['npc:ZZZ', 9], ZZZ: ['npc:ZZZ', 9] },
      edges,
      { round: 2, phase: 'reinforce', pendingReinforcements: 2 },
    );
    const { state } = playNpcTurn(start, scripted());
    expect(state.turnOrder[state.currentTurn]).toBe('npc:ZZZ');
    expect(state).toMatchObject({ round: 2, phase: 'reinforce', pendingReinforcements: 4 });
  });

  it("throws WrongPhaseError on the human's turn", () => {
    const state = myTurn('warlord', { AAA: [ME, 4], BBB: ['human', 2] }, edges, { currentTurn: 0 });
    expect(() => playNpcTurn(state, scripted())).toThrow(WrongPhaseError);
  });

  it('does not mutate state', () => {
    const state = conquest();
    const before = structuredClone(state);
    playNpcTurn(state, conquestDice());
    expect(state).toEqual(before);
  });
});
