import { describe, it, expect } from 'vitest';
import { HELP, HELP_IDS } from '../../public/js/helpContent.js';

// The worked dice example is fixed text, so these tests make sure it never drifts from the rules
// it teaches (GAME_RULES §5.2, §5.3).

const { example } = HELP.win.dice;

describe('help content', () => {
  it('has one entry per pill, in header order', () => {
    expect(HELP_IDS).toEqual(['play', 'win']);
    for (const id of HELP_IDS) expect(HELP[id].id).toBe(id);
  });

  it('gives "How to play" the six turn steps, each with a title and text', () => {
    expect(HELP.play.steps).toHaveLength(6);
    for (const step of HELP.play.steps) {
      expect(step.title).toBeTruthy();
      expect(step.text).toBeTruthy();
    }
  });

  it('puts the beginner tip in "How to win", not "How to play"', () => {
    expect(HELP.win.tip).toMatch(/weak neighbours/i);
    expect(HELP.play.tip).toBeUndefined();
  });
});

describe('the worked dice example', () => {
  it('is the §5.3 case-study roll: 10 v 2, [1,4] against [2,3], ending 9 v 1', () => {
    expect(example).toMatchObject({
      attackerSoldiers: 10,
      defenderSoldiers: 2,
      attackerDice: [1, 4],
      defenderDice: [2, 3],
      attackerLeft: 9,
      defenderLeft: 1,
    });
  });

  it('rolls min(attacker − 1, defender) dice each (§5.2)', () => {
    const dice = Math.min(example.attackerSoldiers - 1, example.defenderSoldiers);
    expect(example.attackerDice).toHaveLength(dice);
    expect(example.defenderDice).toHaveLength(dice);
  });

  it('shows dice that are real die faces', () => {
    for (const d of [...example.attackerDice, ...example.defenderDice]) {
      expect(Number.isInteger(d) && d >= 1 && d <= 6).toBe(true);
    }
  });

  it('ends on the soldier counts the pairs produce: the lower die loses one, a tie loses none (§5.3)', () => {
    let attackerLost = 0;
    let defenderLost = 0;
    example.attackerDice.forEach((a, i) => {
      const d = example.defenderDice[i];
      if (a < d) attackerLost += 1;
      if (d < a) defenderLost += 1;
    });
    expect(example.attackerSoldiers - attackerLost).toBe(example.attackerLeft);
    expect(example.defenderSoldiers - defenderLost).toBe(example.defenderLeft);
  });
});
