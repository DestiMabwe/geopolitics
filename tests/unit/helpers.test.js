import { describe, it, expect } from 'vitest';
import { scripted, makeState, mockLlm } from '../helpers.js';

describe('mockLlm()', () => {
  it('resolves with the reply as a text block', async () => {
    const response = await mockLlm('Hello').messages.create({});
    expect(response).toEqual({ content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' });
  });

  it('rejects with an error reply', async () => {
    await expect(mockLlm(new Error('boom')).messages.create({})).rejects.toThrow('boom');
  });

  it('passes raw blocks and a stop reason through', async () => {
    const response = await mockLlm([], 'refusal').messages.create({});
    expect(response).toEqual({ content: [], stop_reason: 'refusal' });
  });
});

describe('scripted()', () => {
  it('yields scripted values in order', () => {
    const next = scripted(6, 1, 4);
    expect([next(), next(), next()]).toEqual([6, 1, 4]);
  });

  it('throws when the script runs out', () => {
    const next = scripted(3);
    next();
    expect(() => next()).toThrow();
  });

  it('throws on the first call when given no values', () => {
    expect(() => scripted()()).toThrow();
  });

  it('keeps separate scripts independent', () => {
    const a = scripted(1, 2);
    const b = scripted(5);
    expect(a()).toBe(1);
    expect(b()).toBe(5);
    expect(a()).toBe(2);
  });
});

describe('makeState()', () => {
  it('builds the human-to-play manoeuvre state with symmetric borders', () => {
    const state = makeState();
    expect(state.turnOrder[state.currentTurn]).toBe('human');
    expect(state.phase).toBe('manoeuvre');
    for (const [a, list] of Object.entries(state.borders)) {
      for (const b of list) expect(state.borders[b]).toContain(a);
    }
  });

  it('merges country overrides per code and replaces other fields', () => {
    const state = makeState({ countries: { AAA: { soldiers: 10 } }, phase: 'attacking' });
    expect(state.countries.AAA).toMatchObject({ owner: 'human', soldiers: 10 });
    expect(state.countries.BBB.soldiers).toBe(2);
    expect(state.phase).toBe('attacking');
  });

  it('returns a fresh object each call', () => {
    const a = makeState();
    a.countries.AAA.soldiers = 99;
    expect(makeState().countries.AAA.soldiers).toBe(4);
  });
});
