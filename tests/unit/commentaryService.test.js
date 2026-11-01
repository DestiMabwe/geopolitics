import { describe, it, expect, vi, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { generateCommentary } from '../../src/services/commentaryService.js';
import { toText } from '../../src/game/commentary.js';
import { makeState, mockLlm } from '../helpers.js';

// Soldier counts no event uses, so a prompt that leaks the board fails the number test.
const state = makeState({ countries: { AAA: { soldiers: 91 }, CCC: { soldiers: 83 } } });

const roll = {
  type: 'roll', player: 'human', from: 'EEE', to: 'BBB',
  attackerDice: [6, 2], defenderDice: [3, 5],
  attackerLosses: 1, defenderLosses: 1, attackerLeft: 7, defenderLeft: 4,
};
const llmEvents = {
  roll,
  conquest: { type: 'conquest', player: 'human', from: 'EEE', to: 'BBB', previousOwner: 'npc:BBB', bonus: 3 },
  elimination: { type: 'elimination', player: 'npc:BBB', by: 'human' },
  gameOver: { type: 'gameOver', status: 'lost', winner: 'npc:BBB' },
};
const templateEvents = {
  turnStart: { type: 'turnStart', player: 'npc:BBB', round: 2 },
  reinforce: { type: 'reinforce', player: 'human', amount: 4, placements: { AAA: 3, EEE: 1 } },
  transfer: { type: 'transfer', player: 'human', from: 'AAA', to: 'EEE', count: 2 },
  attackStart: { type: 'attackStart', player: 'human', from: 'EEE', to: 'BBB' },
  occupy: { type: 'occupy', player: 'human', from: 'AAA', to: 'BBB', count: 2, placements: { BBB: 3 } },
  attackFailed: { type: 'attackFailed', player: 'human', from: 'EEE', to: 'BBB' },
  attackStopped: { type: 'attackStopped', player: 'human', from: 'EEE', to: 'BBB' },
  skip: { type: 'skip', player: 'npc:CCC' },
};

const template = toText(roll, state);
const numbers = (text) => text.match(/\d+/g) ?? [];
const sentBody = (client) => client.messages.create.mock.calls[0][0];
const sentOptions = (client) => client.messages.create.mock.calls[0][1];
const prompt = (client) => JSON.stringify(sentBody(client).messages);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('generateCommentary: the reply (PLAN S16b)', () => {
  it('returns a good response trimmed', async () => {
    const client = mockLlm('  Country E strikes!\n');
    expect(await generateCommentary(roll, state, client)).toBe('Country E strikes!');
  });
});

describe('generateCommentary: falling back to the template line (ARCHITECTURE §4.3)', () => {
  it('returns the template line on a timeout', async () => {
    const client = mockLlm(new Anthropic.APIConnectionTimeoutError());
    expect(await generateCommentary(roll, state, client)).toBe(template);
  });

  it('returns the template line on an API error', async () => {
    const client = mockLlm(new Error('500 overloaded'));
    expect(await generateCommentary(roll, state, client)).toBe(template);
  });

  it('returns the template line when the LLM refuses', async () => {
    const client = mockLlm('Sorry', 'refusal');
    expect(await generateCommentary(roll, state, client)).toBe(template);
  });

  it('returns the template line when the reply is cut off', async () => {
    const client = mockLlm('Country E hurls its', 'max_tokens');
    expect(await generateCommentary(roll, state, client)).toBe(template);
  });

  it('returns the template line when the reply has no text block', async () => {
    expect(await generateCommentary(roll, state, mockLlm([]))).toBe(template);
  });

  it('returns the template line when the reply is only whitespace', async () => {
    expect(await generateCommentary(roll, state, mockLlm('  \n '))).toBe(template);
  });
});

describe('generateCommentary: which events call the LLM (PLAN S16b)', () => {
  it.each(Object.keys(llmEvents))('only calls the LLM for %s and the other 3 listed types', async (type) => {
    const client = mockLlm();
    await generateCommentary(llmEvents[type], state, client);
    expect(client.messages.create).toHaveBeenCalledOnce();
  });

  it.each(Object.keys(templateEvents))('uses the template line without the LLM for %s', async (type) => {
    const client = mockLlm();
    const event = templateEvents[type];
    expect(await generateCommentary(event, state, client)).toBe(toText(event, state));
    expect(client.messages.create).not.toHaveBeenCalled();
  });
});

describe('generateCommentary: the prompt (CLAUDE.md, the LLM rule)', () => {
  it.each(Object.keys(llmEvents))('puts only numbers from the %s event in the prompt', async (type) => {
    const client = mockLlm();
    await generateCommentary(llmEvents[type], state, client);
    const allowed = numbers(JSON.stringify(llmEvents[type]));
    for (const number of numbers(prompt(client))) {
      expect(allowed).toContain(number);
    }
  });

  it.each(Object.keys(llmEvents))('sends names, not ids or codes, for %s', async (type) => {
    const client = mockLlm();
    await generateCommentary(llmEvents[type], state, client);
    expect(prompt(client)).not.toMatch(/npc:|\b(AAA|BBB|CCC|DDD|EEE)\b/);
    expect(prompt(client)).toContain('Country B');
  });

  it('sends every die and both countries for a roll', async () => {
    const client = mockLlm();
    await generateCommentary(roll, state, client);
    expect(prompt(client)).toContain('Country E');
    expect(numbers(prompt(client))).toEqual(expect.arrayContaining(['6', '2', '3', '5', '7', '4']));
  });

  it('leaves out countries the event does not mention', async () => {
    const client = mockLlm();
    await generateCommentary(roll, state, client);
    expect(prompt(client)).not.toContain('Country C');
  });
});

describe('generateCommentary: the request (ARCHITECTURE §4.3)', () => {
  it('gives up after 5 seconds with no retries', async () => {
    const client = mockLlm();
    await generateCommentary(roll, state, client);
    expect(sentOptions(client)).toMatchObject({ timeout: 5000, maxRetries: 0 });
  });

  it('uses Haiku by default', async () => {
    vi.stubEnv('LLM_MODEL', '');
    const client = mockLlm();
    await generateCommentary(roll, state, client);
    expect(sentBody(client).model).toBe('claude-haiku-5-5');
  });

  it('uses LLM_MODEL when it is set', async () => {
    vi.stubEnv('LLM_MODEL', 'claude-sonnet-5-5');
    const client = mockLlm();
    await generateCommentary(roll, state, client);
    expect(sentBody(client).model).toBe('claude-sonnet-5-5');
  });

  it('sends the system prompt, a short limit and no thinking', async () => {
    const client = mockLlm();
    await generateCommentary(roll, state, client);
    const body = sentBody(client);
    expect(body.system).toEqual(expect.any(String));
    expect(body.system.trim()).not.toBe('');
    expect(body.max_tokens).toBe(150);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('asks once and sends one user message', async () => {
    const client = mockLlm();
    await generateCommentary(roll, state, client);
    expect(client.messages.create).toHaveBeenCalledOnce();
    expect(sentBody(client).messages.map((m) => m.role)).toEqual(['user']);
  });
});

describe('generateCommentary: the API key (PLAN S16b)', () => {
  const key = 'sk-ant-test-secret-value';

  it('never shows the real key in logs or responses', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', key);
    const logs = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const client = mockLlm(new Error(`401 invalid key ${key}`));

    const text = await generateCommentary(roll, state, client);

    expect(text).not.toContain(key);
    expect(JSON.stringify(sentBody(client))).not.toContain(key);
    for (const log of logs) {
      for (const args of log.mock.calls) {
        expect(args.map(String).join(' ')).not.toContain(key);
      }
    }
  });

  it('does not change the event or the state', async () => {
    const eventBefore = structuredClone(roll);
    const stateBefore = structuredClone(state);
    await generateCommentary(roll, state, mockLlm());
    expect(roll).toEqual(eventBefore);
    expect(state).toEqual(stateBefore);
  });
});
