import { describe, it, expect } from 'vitest';
import {
  reinforceReason, targetReason, skipReason, stopReason, occupyReason,
} from '../../src/game/npcReason.js';
import { chooseTarget, playNpcTurn } from '../../src/game/npc.js';
import { makeState, scripted } from '../helpers.js';

// S33a. The wording is free, so these check what a reason must contain: the real numbers and names
// behind the choice (GAME_RULES §8). Each test builds the board from a §8.3 example.

const ME = 'npc:ME';

// Same board builder as npc.test.js: only the listed countries exist, everything borders everything
// unless `edges` says otherwise, and every country is named after its code.
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

/** The reason for the attack `chooseTarget` makes in `state`. */
const reasonForChosen = (state) => targetReason(state, ME, chooseTarget(state, ME));

describe('targetReason (GAME_RULES §8.1, §8.3)', () => {
  it('says a Warlord went for the human, with the score', () => {
    // ARG 6 vs BRA (human, 4): 6 − 4 + 2 = 4. PER (npc, 5) scores only 1.
    const state = board('warlord', { ARG: [ME, 6], BRA: ['human', 4], PER: ['npc:PER', 5] });
    const reason = reasonForChosen(state);
    expect(reason).toMatch(/human/i);
    expect(reason).toContain('4');
    expect(reason).toContain('BRA');
  });

  it('names the score and the weak target for an Opportunist', () => {
    // §8.3: TUR 5 picks NPL (1 soldier): 5 − 1 + 3 = 7.
    // H2 and H3 give the human its 3 countries but do not border TUR, as in §8.3.
    const state = board(
      'opportunist',
      {
        TUR: [ME, 5], IND: ['human', 3], H2: ['human', 1], H3: ['human', 1],
        NPL: ['npc:NPL', 1], IRN: ['npc:IRN', 4],
      },
      [['TUR', 'IND'], ['TUR', 'NPL'], ['TUR', 'IRN']],
    );
    const reason = reasonForChosen(state);
    expect(reason).toMatch(/weak|1 soldier/i);
    expect(reason).toContain('7');
    expect(reason).toContain('NPL');
  });

  it('says an Opportunist went for the leader', () => {
    // The human owns 3 countries, so it leads. IND (3 soldiers): 5 − 3 + 2 = 4, ahead of KEN's 2.
    const state = board('opportunist', {
      TUR: [ME, 5], IND: ['human', 3], H2: ['human', 9], H3: ['human', 9], KEN: ['npc:KEN', 3],
    });
    expect(chooseTarget(state, ME)).toEqual({ from: 'TUR', to: 'IND' });
    expect(reasonForChosen(state)).toMatch(/leader/i);
  });

  it('says a Fortress saw a sure win, with both soldier counts', () => {
    // §8.3: EGY 5 vs MAR 1 is a sure win (5 ≥ 2×1 + 1). NGA (3) is not.
    const state = board('fortress', { EGY: [ME, 5], MAR: ['npc:MAR', 1], NGA: ['npc:NGA', 3] });
    const reason = reasonForChosen(state);
    expect(reason).toMatch(/sure|safe/i);
    expect(reason).toContain('5');
    expect(reason).toContain('1');
    expect(reason).toContain('MAR');
  });

  it('does not change the state', () => {
    const state = board('warlord', { ARG: [ME, 6], BRA: ['human', 4] });
    const before = structuredClone(state);
    reasonForChosen(state);
    expect(state).toEqual(before);
  });
});

describe('skipReason (GAME_RULES §8.1 step 3)', () => {
  it('says a Fortress skipped because no neighbour was a sure win', () => {
    // §8.3: EGY has 4, every neighbour has 2 or more, and 4 ≥ 5 fails for all.
    const state = board('fortress', { EGY: [ME, 4], KEN: ['human', 2], MAR: ['npc:MAR', 3] });
    expect(chooseTarget(state, ME)).toBeNull();
    const reason = skipReason(state, ME);
    expect(reason).toMatch(/sure|safe/i);
    expect(reason).toContain('4');
  });

  it('says an NPC with no country of 2 or more cannot attack', () => {
    const state = board('warlord', { AAA: [ME, 1], BBB: ['human', 2] });
    expect(chooseTarget(state, ME)).toBeNull();
    expect(skipReason(state, ME)).toMatch(/2 soldiers|2 or more/i);
  });
});

describe('reinforceReason (GAME_RULES §8.1 Reinforce)', () => {
  const mine = (profile) =>
    board(profile, { AAA: [ME, 2], BBB: [ME, 5], CCC: ['human', 3] });

  it('says a Warlord puts everything on its biggest country', () => {
    const reason = reinforceReason(mine('warlord'), ME, 4);
    expect(reason).toContain('BBB');
    expect(reason).toContain('4');
    expect(reason).toMatch(/biggest|most/i);
  });

  it('says an Opportunist puts everything on its biggest country', () => {
    const reason = reinforceReason(mine('opportunist'), ME, 4);
    expect(reason).toContain('BBB');
    expect(reason).toMatch(/biggest|most/i);
  });

  it('says a Fortress shores up its weakest country', () => {
    const reason = reinforceReason(mine('fortress'), ME, 2);
    expect(reason).toContain('AAA');
    expect(reason).toMatch(/weakest|fewest/i);
  });
});

describe('stopReason (GAME_RULES §8.1 stop rule, §8.2)', () => {
  const attacking = (profile, mineSoldiers, theirs, rolls = 0) => {
    const state = board(profile, { AAA: [ME, mineSoldiers], BBB: ['human', theirs] });
    state.phase = 'attacking';
    state.attack = { from: 'AAA', to: 'BBB', rolls };
    return state;
  };

  it('names both soldier counts when a Fortress stops', () => {
    // 3 < 2×2 + 1, so it is no longer a sure win.
    const reason = stopReason(attacking('fortress', 3, 2), ME);
    expect(reason).toContain('3');
    expect(reason).toContain('2');
  });

  it('names both soldier counts when an Opportunist stops', () => {
    // AAA 2 ≤ BBB 3.
    const reason = stopReason(attacking('opportunist', 2, 3), ME);
    expect(reason).toContain('2');
    expect(reason).toContain('3');
  });

  it('gives the 20-roll cap as the reason when a Warlord reaches it', () => {
    expect(stopReason(attacking('warlord', 9, 9, 20), ME)).toContain('20');
  });
});

describe('occupyReason (GAME_RULES §8.1 Occupy)', () => {
  const occupying = (profile, soldiers) => {
    const state = board(profile, { AAA: [ME, soldiers], BBB: [ME, 1], CCC: ['human', 9] });
    state.phase = 'occupy';
    state.attack = { from: 'AAA', to: 'BBB', bonus: 3 };
    return state;
  };

  it('says how many a Warlord moves in, and why', () => {
    // AAA 7 → floor((7 − 1) / 2) = 3.
    const reason = occupyReason(occupying('warlord', 7), ME, 3);
    expect(reason).toContain('3');
    expect(reason).toContain('BBB');
  });

  it('says a Fortress moves in just 1', () => {
    expect(occupyReason(occupying('fortress', 7), ME, 1)).toContain('1');
  });
});

describe('playNpcTurn puts the reasons on the events (S33a)', () => {
  // §5.7's dice against a value 6 country: AAA wins BBB with 3 soldiers left and a bonus of 3.
  const conquest = () => {
    const state = board(
      'warlord',
      { AAA: [ME, 4], BBB: ['npc:BBB', 2], CCC: ['npc:BBB', 9], HHH: ['human', 9] },
      [['AAA', 'BBB']],
    );
    state.countries.BBB.value = 6;
    return { ...state, currentTurn: 1 };
  };

  it('puts a reason on attackStart and occupy', () => {
    const { events } = playNpcTurn(conquest(), scripted(6, 2, 3, 5, 4, 4, 5, 2));
    for (const type of ['attackStart', 'occupy']) {
      const event = events.find((e) => e.type === type);
      expect(event.reason, type).toEqual(expect.any(String));
      expect(event.reason.length, type).toBeGreaterThan(0);
    }
  });

  it('puts a reason on skip', () => {
    const state = {
      ...board('fortress', { AAA: [ME, 4], BBB: ['human', 2], ZZZ: ['npc:ZZZ', 9] }, [['AAA', 'BBB']]),
      currentTurn: 1,
    };
    const skip = playNpcTurn(state, scripted()).events.find((e) => e.type === 'skip');
    expect(skip.reason).toEqual(expect.any(String));
  });

  it('puts a reason on reinforce from round 2', () => {
    const state = {
      ...board('warlord', { AAA: [ME, 3], BBB: ['npc:BBB', 9], HHH: ['human', 9] }, [['AAA', 'BBB']]),
      currentTurn: 1, round: 2, phase: 'reinforce', pendingReinforcements: 2,
    };
    // AAA becomes 5, still too weak against BBB's 9, so the Warlord skips and no dice are rolled.
    const reinforce = playNpcTurn(state, scripted()).events[0];
    expect(reinforce.type).toBe('reinforce');
    expect(reinforce.reason).toEqual(expect.any(String));
  });

  it('puts a reason on attackStopped', () => {
    // A Fortress with 5 against 2 is a sure win (5 ≥ 2×2 + 1). It loses both dice, so 3 < 5 and it stops.
    const state = {
      ...board('fortress', { AAA: [ME, 5], BBB: ['npc:BBB', 2], CCC: ['human', 9] }, [['AAA', 'BBB']]),
      currentTurn: 1,
    };
    const { events } = playNpcTurn(state, scripted(1, 1, 6, 6));
    const stopped = events.find((e) => e.type === 'attackStopped');
    expect(stopped.reason).toEqual(expect.any(String));
  });

  it('puts no reason on rolls, conquests or turnStart', () => {
    const { events } = playNpcTurn(conquest(), scripted(6, 2, 3, 5, 4, 4, 5, 2));
    for (const e of events.filter((e) => ['roll', 'conquest', 'turnStart'].includes(e.type))) {
      expect(e).not.toHaveProperty('reason');
    }
  });
});
