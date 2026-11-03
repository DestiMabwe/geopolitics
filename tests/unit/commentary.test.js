import { describe, it, expect } from 'vitest';
import { toText } from '../../src/game/commentary.js';
import { makeState } from '../helpers.js';

// makeState: the human's home is AAA (Country A), and npc:BBB's home is BBB (Country B).
// Attacks come from EEE, so the attacking country and the player's home have different names.
const roll = {
  type: 'roll', player: 'human', from: 'EEE', to: 'BBB',
  attackerDice: [6, 2], defenderDice: [3, 5],
  attackerLosses: 1, defenderLosses: 1, attackerLeft: 7, defenderLeft: 4,
};

const samples = {
  turnStart: { type: 'turnStart', player: 'npc:BBB', round: 2 },
  reinforce: { type: 'reinforce', player: 'human', amount: 4, placements: { AAA: 3, EEE: 1 } },
  transfer: { type: 'transfer', player: 'human', from: 'AAA', to: 'EEE', count: 2 },
  attackStart: { type: 'attackStart', player: 'human', from: 'EEE', to: 'BBB' },
  roll,
  conquest: { type: 'conquest', player: 'human', from: 'AAA', to: 'BBB', previousOwner: 'npc:BBB', bonus: 3 },
  occupy: { type: 'occupy', player: 'human', from: 'AAA', to: 'BBB', count: 2, placements: { BBB: 3 } },
  attackFailed: { type: 'attackFailed', player: 'human', from: 'EEE', to: 'BBB' },
  attackStopped: { type: 'attackStopped', player: 'human', from: 'EEE', to: 'BBB' },
  skip: { type: 'skip', player: 'npc:CCC' },
  elimination: { type: 'elimination', player: 'npc:BBB', by: 'human' },
  'gameOver (won)': { type: 'gameOver', status: 'won', winner: 'human' },
  'gameOver (lost)': { type: 'gameOver', status: 'lost', winner: 'npc:BBB' },
  'gameOver (no winner)': { type: 'gameOver', status: 'lost', winner: null },
};
const labels = Object.keys(samples);

const line = (event, state = makeState()) => toText(event, state);
const numbers = (text) => text.match(/\d+/g) ?? [];

describe('toText on every event (GAME_RULES §10)', () => {
  it('covers all 12 event types in §10', () => {
    expect(new Set(Object.values(samples).map((e) => e.type))).toEqual(new Set([
      'turnStart', 'reinforce', 'transfer', 'attackStart', 'roll', 'conquest',
      'occupy', 'attackFailed', 'attackStopped', 'skip', 'elimination', 'gameOver',
    ]));
  });

  it.each(labels)('gives a non-empty line for %s', (label) => {
    const text = line(samples[label]);
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
  });

  it.each(labels)('uses only numbers from the %s event', (label) => {
    const allowed = numbers(JSON.stringify(samples[label]));
    for (const number of numbers(line(samples[label]))) {
      expect(allowed).toContain(number);
    }
  });

  it.each(labels)('never shows a raw id, code or missing value in %s', (label) => {
    expect(line(samples[label])).not.toMatch(/undefined|null|npc:|\[object|\b(AAA|BBB|CCC|DDD|EEE)\b/);
  });

  it.each(labels)('never says "You" in %s', (label) => {
    expect(line(samples[label])).not.toMatch(/\byou(r)?\b/i);
  });

  it('does not mutate the event or the state', () => {
    const state = makeState();
    const before = structuredClone(state);
    for (const event of Object.values(samples)) {
      const copy = structuredClone(event);
      toText(event, state);
      expect(event).toEqual(copy);
    }
    expect(state).toEqual(before);
  });
});

describe('toText names what happened (GAME_RULES §10)', () => {
  it('names the player and the round on turnStart', () => {
    const text = line(samples.turnStart);
    expect(text).toContain('Country B');
    expect(text).toContain('2');
  });

  it('names the player and the amount on reinforce', () => {
    const text = line(samples.reinforce);
    expect(text).toContain('Country A');
    expect(text).toContain('4');
  });

  it('names both countries and the count on transfer', () => {
    const text = line(samples.transfer);
    expect(text).toContain('Country A');
    expect(text).toContain('Country E');
    expect(text).toContain('2');
  });

  it('names both countries on attackStart', () => {
    const text = line(samples.attackStart);
    expect(text).toContain('Country E');
    expect(text).toContain('Country B');
  });

  it('shows every die, both countries and the soldiers left on a roll', () => {
    const text = line(roll);
    expect(text).toContain('Country E');
    expect(text).toContain('Country B');
    for (const number of [...roll.attackerDice, ...roll.defenderDice, roll.attackerLeft, roll.defenderLeft]) {
      expect(numbers(text)).toContain(String(number));
    }
  });

  it('names the conqueror, the country taken and the bonus on conquest', () => {
    const text = line(samples.conquest);
    expect(text).toContain('Country A');
    expect(text).toContain('Country B');
    expect(text).toContain('3');
  });

  it('names the country moved into and the count on occupy', () => {
    const text = line(samples.occupy);
    expect(text).toContain('Country B');
    expect(text).toContain('2');
  });

  it('names both countries on attackFailed', () => {
    const text = line(samples.attackFailed);
    expect(text).toContain('Country E');
    expect(text).toContain('Country B');
  });

  it('names both countries on attackStopped', () => {
    const text = line(samples.attackStopped);
    expect(text).toContain('Country E');
    expect(text).toContain('Country B');
  });

  it('names the player on skip', () => {
    expect(line(samples.skip)).toContain('Country C');
  });

  it('names who was eliminated and by whom', () => {
    const text = line(samples.elimination);
    expect(text).toContain('Country B');
    expect(text).toContain('Country A');
  });

  it('names the human by their home country', () => {
    expect(line({ type: 'skip', player: 'human' })).toContain('Country A');
  });

  it('names an NPC after its home country even once it has lost it', () => {
    const state = makeState({ countries: { BBB: { owner: 'human' }, CCC: { owner: 'npc:BBB' } } });
    const text = line({ type: 'skip', player: 'npc:BBB' }, state);
    expect(text).toContain('Country B');
    expect(text).not.toContain('Country C');
  });

  it('names the winner when the human wins', () => {
    expect(line(samples['gameOver (won)'])).toContain('Country A');
  });

  it('names the winner when the human loses', () => {
    expect(line(samples['gameOver (lost)'])).toContain('Country B');
  });

  // QA 2026-11-03 ISSUE-C: GAME_RULES §9.2 names the player with the most countries as `winner` of a
  // loss, but "wins the game" read as if they had conquered the world.
  it('says the winner of a loss holds the most countries, not that they won the game', () => {
    const text = line(samples['gameOver (lost)']);
    expect(text).toMatch(/holds the most countries/);
    expect(text).not.toMatch(/\bwins?\b|\bwon\b/);
  });

  it('still says the human wins the game when the human wins', () => {
    expect(line(samples['gameOver (won)'])).toMatch(/wins the game/);
  });

  it('says the most countries were tied when a loss has no single winner', () => {
    expect(line(samples['gameOver (no winner)'])).toMatch(/tied for the most countries/i);
  });

  it('reports a loss with no single winner', () => {
    expect(line(samples['gameOver (no winner)'])).not.toContain('Country');
  });
});
