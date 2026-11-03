import { describe, it, expect } from 'vitest';
import { eventText, eventReason, attackOutcome, turnSummary, latestRoll, attackInProgress } from '../../public/js/eventText.js';
import { playerName, ownerSlot } from '../../public/js/players.js';

const game = {
  players: { human: { homeCode: 'ZAF' }, 'npc:KEN': { homeCode: 'KEN' } },
  countries: { ZAF: { name: 'South Africa' }, KEN: { name: 'Kenya' }, BRA: { name: 'Brazil' } },
};
const line = (type, data) => eventText({ type, data }, game);

describe('playerName', () => {
  it('calls the human "You" and an NPC by its home country', () => {
    expect(playerName(game, 'human')).toBe('You');
    expect(playerName(game, 'npc:KEN')).toBe('Kenya');
  });
});

describe('ownerSlot (DESIGN §1 owner colours)', () => {
  it('gives the human its own slot and NPCs 1–9 by turn-order position', () => {
    const g = { turnOrder: ['npc:KEN', 'human', 'npc:BRA'] };
    expect(ownerSlot(g, 'human')).toBe('human');
    expect(ownerSlot(g, 'npc:KEN')).toBe('1');
    expect(ownerSlot(g, 'npc:BRA')).toBe('2');
  });
});

describe('eventText (GAME_RULES §10)', () => {
  it('says whose turn it is, reading round from beside data as the server stores it', () => {
    expect(eventText({ type: 'turnStart', round: 2, data: { player: 'human' } }, game)).toBe('Round 2: your turn.');
    expect(eventText({ type: 'turnStart', round: 1, data: { player: 'npc:KEN' } }, game)).toBe("Round 1: Kenya's turn.");
  });

  it('names both countries in an attack', () => {
    expect(line('attackStart', { player: 'human', from: 'ZAF', to: 'KEN' })).toBe('You attack Kenya from South Africa.');
  });

  it('shows a roll with only the numbers from the event', () => {
    const text = line('roll', {
      player: 'human', from: 'ZAF', to: 'KEN',
      attackerDice: [1, 4], defenderDice: [2, 3],
      attackerLosses: 1, defenderLosses: 1, attackerLeft: 9, defenderLeft: 1,
    });
    expect(text).toBe('1, 4 against 2, 3: South Africa loses 1, Kenya loses 1 (9 vs 1).');
  });

  it('reports a conquest with its bonus', () => {
    expect(line('conquest', { player: 'npc:KEN', from: 'KEN', to: 'BRA', previousOwner: 'npc:BRA', bonus: 3 }))
      .toBe('Kenya conquers Brazil and earns 3 new soldiers.');
  });

  it('reports a win and a loss', () => {
    expect(line('gameOver', { status: 'won', winner: 'human' })).toBe('You conquer the world. Victory!');
    expect(line('gameOver', { status: 'lost', winner: 'npc:KEN' })).toBe('Defeat. Kenya holds the most countries.');
    expect(line('gameOver', { status: 'lost', winner: null })).toBe('Defeat. Tied for the most countries.');
  });

  it.each(['occupy', 'attackFailed', 'attackStopped', 'skip', 'elimination', 'reinforce', 'transfer'])(
    'gives a non-empty line for %s',
    (type) => {
      const text = line(type, { player: 'human', by: 'npc:KEN', from: 'ZAF', to: 'KEN', count: 2, amount: 4 });
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/undefined/);
    },
  );
});

describe('attackOutcome (DESIGN §2 DicePanel states)', () => {
  const ev = (type, data = {}) => ({ type, data: { player: 'human', from: 'ZAF', to: 'KEN', ...data } });

  it('is null when there are no events', () => {
    expect(attackOutcome([])).toBeNull();
  });

  it('is null while an attack is still being rolled', () => {
    expect(attackOutcome([ev('attackStart'), ev('roll')])).toBeNull();
  });

  it('reads a conquest as conquered, with the two countries', () => {
    expect(attackOutcome([ev('attackStart'), ev('roll'), ev('conquest', { bonus: 3 })]))
      .toEqual({ kind: 'conquered', from: 'ZAF', to: 'KEN' });
  });

  it('still reads conquered once the occupy has been played', () => {
    expect(attackOutcome([ev('attackStart'), ev('conquest', { bonus: 3 }), ev('occupy'), ev('turnStart')]))
      .toEqual({ kind: 'conquered', from: 'ZAF', to: 'KEN' });
  });

  it('reads attackFailed as failed', () => {
    expect(attackOutcome([ev('attackStart'), ev('roll'), ev('attackFailed')]))
      .toEqual({ kind: 'failed', from: 'ZAF', to: 'KEN' });
  });

  it('reads attackStopped as stopped', () => {
    expect(attackOutcome([ev('attackStart'), ev('roll'), ev('attackStopped')]))
      .toEqual({ kind: 'stopped', from: 'ZAF', to: 'KEN' });
  });

  it('uses the newest attack, not an earlier one', () => {
    const events = [ev('attackStart'), ev('attackFailed'), ev('attackStart', { to: 'BRA' })];
    expect(attackOutcome(events)).toBeNull();
  });
});

describe('turnSummary (one line per replayed turn for screen readers, DESIGN §2)', () => {
  const ev = (type, data = {}, round) => ({ type, round, data });

  it('names who played and what they took', () => {
    const events = [
      ev('turnStart', { player: 'npc:KEN' }, 2),
      ev('attackStart', { player: 'npc:KEN', from: 'KEN', to: 'BRA' }),
      ev('roll', { player: 'npc:KEN', from: 'KEN', to: 'BRA' }),
      ev('conquest', { player: 'npc:KEN', from: 'KEN', to: 'BRA', bonus: 3 }),
      ev('occupy', { player: 'npc:KEN', from: 'KEN', to: 'BRA', count: 1 }),
    ];
    expect(turnSummary(events, game)).toBe('Kenya played. Kenya conquers Brazil and earns 3 new soldiers.');
  });

  it('is just "played" for a quiet turn', () => {
    expect(turnSummary([ev('turnStart', { player: 'npc:KEN' }, 2), ev('skip', { player: 'npc:KEN' })], game)).toBe('Kenya played.');
  });

  it('includes an elimination and the end of the game', () => {
    const events = [
      ev('turnStart', { player: 'npc:KEN' }, 2),
      ev('elimination', { player: 'human', by: 'npc:KEN' }),
      ev('gameOver', { status: 'lost', winner: 'npc:KEN' }),
    ];
    expect(turnSummary(events, game)).toBe('Kenya played. You are eliminated by Kenya. Defeat. Kenya holds the most countries.');
  });

  it('is empty when there is nothing to report', () => {
    expect(turnSummary([], game)).toBe('');
  });
});

// QA ISSUE-004: a logged-out visitor is not the player, so they must never read "You".
// The server sends `isOwner`; only an explicit `false` makes the viewer a spectator.
describe('spectators never read "You"', () => {
  const visitor = { ...game, isOwner: false };
  const owner = { ...game, isOwner: true };
  const spectate = (type, data, round) => eventText({ type, round, data }, visitor);

  it('names the human by home country for a spectator', () => {
    expect(playerName(visitor, 'human')).toBe('South Africa');
    expect(playerName(visitor, 'npc:KEN')).toBe('Kenya');
  });

  it('still says "You" to the owner, and when the server sent no isOwner', () => {
    expect(playerName(owner, 'human')).toBe('You');
    expect(playerName(game, 'human')).toBe('You');
  });

  it('writes a spectator\'s attack in the third person', () => {
    expect(spectate('attackStart', { player: 'human', from: 'ZAF', to: 'KEN' }))
      .toBe('South Africa attacks Kenya from South Africa.');
  });

  it('keeps the owner\'s attack in the second person', () => {
    expect(eventText({ type: 'attackStart', data: { player: 'human', from: 'ZAF', to: 'KEN' } }, owner))
      .toBe('You attack Kenya from South Africa.');
  });

  it('writes a spectator\'s conquest in the third person', () => {
    expect(spectate('conquest', { player: 'human', from: 'ZAF', to: 'KEN', bonus: 3 }))
      .toBe('South Africa conquers Kenya and earns 3 new soldiers.');
  });

  it('says "South Africa\'s turn", not "your turn", on the human\'s turn', () => {
    expect(spectate('turnStart', { player: 'human' }, 2)).toBe("Round 2: South Africa's turn.");
  });

  it('does not tell a spectator "You conquer the world"', () => {
    expect(spectate('gameOver', { status: 'won', winner: 'human' })).not.toMatch(/\byou\b/i);
  });

  it('does not say "You" in the replay summary line', () => {
    const events = [{ type: 'turnStart', round: 1, data: { player: 'human' } }];
    expect(turnSummary(events, visitor)).not.toMatch(/\byou\b/i);
  });
});

// S33b: the reason the engine attached to an NPC decision (data.reason), shown as a muted second line.
describe('eventReason', () => {
  const REASON = 'Opportunist: moves just 1 into Kenya because it scores highest.';

  it.each(['reinforce', 'attackStart', 'skip', 'attackStopped', 'occupy'])('gives the reason of a %s', (type) => {
    expect(eventReason({ type, data: { reason: REASON } })).toBe(REASON);
  });

  it('gives nothing when the event has no reason', () => {
    expect(eventReason({ type: 'skip', data: { player: 'npc:KEN' } })).toBe('');
  });

  it('gives nothing for a blank reason', () => {
    expect(eventReason({ type: 'skip', data: { reason: '   ' } })).toBe('');
    expect(eventReason({ type: 'skip', data: { reason: '' } })).toBe('');
  });

  it('gives nothing for a reason that is not a string', () => {
    for (const reason of [null, 42, {}, ['x']]) {
      expect(eventReason({ type: 'skip', data: { reason } })).toBe('');
    }
  });

  it('trims the reason', () => {
    expect(eventReason({ type: 'skip', data: { reason: '  Holds.  ' } })).toBe('Holds.');
  });

  it('ignores a reason on an event that is not an NPC decision', () => {
    for (const type of ['roll', 'conquest', 'turnStart', 'elimination', 'gameOver', 'attackFailed', 'transfer']) {
      expect(eventReason({ type, data: { reason: REASON } })).toBe('');
    }
  });

  it('does not throw when the event has no data', () => {
    expect(eventReason({ type: 'skip' })).toBe('');
  });
});

// QA 2026-11-03 ISSUE-G: the Dice panel showed the previous fight's dice when a new attack began.
describe('latestRoll', () => {
  const e = (type, extra = {}) => ({ type, data: {}, ...extra });
  const roll = (id) => e('roll', { id });

  it('gives null when there are no events', () => {
    expect(latestRoll([])).toBeNull();
  });

  it('gives null when nothing has ever been rolled', () => {
    expect(latestRoll([e('turnStart'), e('skip')])).toBeNull();
  });

  it('gives the newest roll of the attack in progress', () => {
    const events = [e('attackStart'), roll(1), roll(2)];
    expect(latestRoll(events)).toBe(events[2]);
  });

  it('gives null when a new attack has started and not rolled yet, even after an earlier fight', () => {
    expect(latestRoll([e('attackStart'), roll(1), e('conquest'), e('attackStart')])).toBeNull();
  });

  it('keeps the last roll of an attack that has ended', () => {
    const events = [e('attackStart'), roll(1), roll(2), e('attackStopped')];
    expect(latestRoll(events)).toBe(events[2]);
  });

  it('gives null for an attack that ended without a single roll', () => {
    expect(latestRoll([e('attackStart'), roll(1), e('attackFailed'), e('attackStart'), e('attackStopped')])).toBeNull();
  });

  it('keeps the roll across the turn changes that follow the attack', () => {
    const events = [e('attackStart'), roll(1), e('conquest'), e('occupy'), e('turnStart')];
    expect(latestRoll(events)).toBe(events[1]);
  });
});

describe('attackInProgress', () => {
  const e = (type) => ({ type, data: {} });

  it('is false with no attack at all', () => {
    expect(attackInProgress([])).toBe(false);
    expect(attackInProgress([e('turnStart'), e('skip')])).toBe(false);
  });

  it('is true once an attack has started, rolled or not', () => {
    expect(attackInProgress([e('attackStart')])).toBe(true);
    expect(attackInProgress([e('attackStart'), e('roll'), e('roll')])).toBe(true);
  });

  it.each(['conquest', 'occupy', 'attackFailed', 'attackStopped'])('is false once the attack ends with %s', (end) => {
    expect(attackInProgress([e('attackStart'), e('roll'), e(end)])).toBe(false);
  });

  it('is true again when a second attack starts after the first ended', () => {
    expect(attackInProgress([e('attackStart'), e('attackStopped'), e('attackStart')])).toBe(true);
  });
});
