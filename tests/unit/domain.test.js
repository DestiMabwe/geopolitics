import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../../src/domain/Game.js';
import { Nation } from '../../src/domain/Nation.js';
import { Player } from '../../src/domain/Player.js';
import { Battle } from '../../src/domain/Battle.js';
import { IllegalMoveError, WrongPhaseError } from '../../src/game/errors.js';
import countryData from '../../src/data/countries.json' with { type: 'json' };
import { makeState, scripted } from '../helpers.js';

// Stands in for a Firestore Timestamp: a class instance, so structuredClone would lose toDate.
class FakeTimestamp {
  toDate() {
    return new Date('2026-10-30T12:00:00Z');
  }
}

// makeState plus the stored fields. The human owns AAA (4 soldiers) and EEE (1); BBB has 2.
const storedDocument = (overrides = {}) => ({
  ...makeState(overrides),
  ownerUid: 'uid-1',
  version: 3,
  eventSeq: 7,
  llmCalls: 2,
  createdAt: new FakeTimestamp(),
  updatedAt: new FakeTimestamp(),
});

const loadGame = (overrides) => Game.fromDocument(storedDocument(overrides));

// An attack AAA → BBB already started.
const attacking = () => {
  const game = loadGame();
  game.attack('AAA', 'BBB');
  return game;
};

// Dice min(3, 2) = 2 each: both defender dice lose, so BBB falls at once.
const conquering = () => {
  const game = attacking();
  game.roll(scripted(6, 6, 1, 1));
  return game;
};

describe('Game: encapsulation (ARCHITECTURE §1)', () => {
  it('blocks a direct write to a getter', () => {
    const game = loadGame();
    expect(() => {
      game.round = 99;
    }).toThrow(TypeError);
    expect(game.round).toBe(1);
  });

  it('blocks a write to a nation through a getter', () => {
    const game = loadGame();
    expect(() => {
      game.nation('AAA').soldiers = 99;
    }).toThrow(TypeError);
    expect(game.nation('AAA').soldiers).toBe(4);
  });

  it('exposes no public fields', () => {
    expect(Object.keys(loadGame())).toEqual([]);
  });

  it('hands out copies, so changing one leaves the game unchanged', () => {
    const game = loadGame();
    game.toDocument().countries.AAA.soldiers = 99;
    game.nation('AAA').neighbours.push('ZZZ');
    expect(game.nation('AAA').soldiers).toBe(4);
    expect(game.nation('AAA').neighbours).not.toContain('ZZZ');
  });

  it('is not changed by later edits to the stored document', () => {
    const stored = storedDocument();
    const game = Game.fromDocument(stored);
    stored.countries.AAA.soldiers = 99;
    expect(game.nation('AAA').soldiers).toBe(4);
  });
});

describe('Game: stored documents (ARCHITECTURE §1)', () => {
  it('rebuilds from a stored document and serialises back unchanged', () => {
    const stored = storedDocument();
    expect(Game.fromDocument(stored).toDocument()).toStrictEqual(stored);
  });

  it('keeps a Firestore Timestamp intact through a round trip', () => {
    const stored = storedDocument();
    const { createdAt, updatedAt } = Game.fromDocument(stored).toDocument();
    expect(createdAt).toBe(stored.createdAt);
    expect(updatedAt).toBe(stored.updatedAt);
  });

  it('keeps a Firestore Timestamp intact after an action', () => {
    const stored = storedDocument();
    const game = Game.fromDocument(stored);
    game.transfer('AAA', 'EEE', 1);
    expect(game.toDocument().createdAt).toBe(stored.createdAt);
  });

  it('leaves version and eventSeq to the model', () => {
    const game = loadGame();
    game.transfer('AAA', 'EEE', 1);
    expect(game.toDocument()).toMatchObject({ version: 3, eventSeq: 7 });
  });

  it('reads the stored fields through getters', () => {
    const game = loadGame({ round: 2 });
    expect(game).toMatchObject({ status: 'active', winner: null, round: 2, phase: 'manoeuvre', version: 3 });
  });
});

describe('Game.start (GAME_RULES §3)', () => {
  const started = () =>
    Game.start({ ownerUid: 'uid-1', humanCode: 'ZAF', catalogue: countryData.countries, randomInt: () => 0 });

  it('sets up 10 nations and 10 players', () => {
    const { game } = started();
    expect(game.nations).toHaveLength(10);
    expect(game.players).toHaveLength(10);
  });

  it('gives the human the chosen country', () => {
    expect(started().game.nation('ZAF').owner).toBe('human');
  });

  it('returns the first turnStart event', () => {
    expect(started().events.map((e) => e.type)).toEqual(['turnStart']);
  });

  it('starts the stored fields', () => {
    expect(started().game.toDocument()).toMatchObject({ ownerUid: 'uid-1', version: 1, eventSeq: 1, llmCalls: 0 });
  });
});

describe('Game: actions delegate to the engine', () => {
  it('reinforce places the soldiers and returns the reinforce event', () => {
    const game = loadGame({ round: 2, phase: 'reinforce', pendingReinforcements: 4 });
    const events = game.reinforce({ AAA: 4 });
    expect(events.map((e) => e.type)).toEqual(['reinforce']);
    expect(game.nation('AAA').soldiers).toBe(8);
    expect(game.phase).toBe('manoeuvre');
  });

  it('transfer moves soldiers and returns the transfer event', () => {
    const game = loadGame();
    const events = game.transfer('AAA', 'EEE', 2);
    expect(events).toEqual([{ type: 'transfer', player: 'human', from: 'AAA', to: 'EEE', count: 2 }]);
    expect(game.nation('AAA').soldiers).toBe(2);
    expect(game.nation('EEE').soldiers).toBe(3);
  });

  it('attack starts a battle and returns the attackStart event', () => {
    const game = loadGame();
    const events = game.attack('AAA', 'BBB');
    expect(events).toEqual([{ type: 'attackStart', player: 'human', from: 'AAA', to: 'BBB' }]);
    expect(game.phase).toBe('attacking');
  });

  it('roll changes the soldiers and returns the roll event', () => {
    const game = attacking();
    const events = game.roll(scripted(6, 1, 1, 6)); // 6>1 defender −1; 1<6 attacker −1
    expect(events.map((e) => e.type)).toEqual(['roll']);
    expect(game.nation('AAA').soldiers).toBe(3);
    expect(game.nation('BBB').soldiers).toBe(1);
  });

  it('stop ends the turn and returns attackStopped, then turnStart', () => {
    const game = attacking();
    const events = game.stop();
    expect(events.map((e) => e.type)).toEqual(['attackStopped', 'turnStart']);
    expect(game.currentPlayer.id).toBe('npc:BBB');
  });

  it('occupy moves in, places the bonus and returns the occupy event first', () => {
    const game = conquering();
    const events = game.occupy(1, { BBB: 2 });
    expect(events[0]).toMatchObject({ type: 'occupy', count: 1, placements: { BBB: 2 } });
    expect(game.nation('AAA').soldiers).toBe(3);
    expect(game.nation('BBB').soldiers).toBe(3);
  });

  it('skip ends the turn and returns skip, then turnStart', () => {
    const game = loadGame();
    expect(game.skip().map((e) => e.type)).toEqual(['skip', 'turnStart']);
    expect(game.currentPlayer.id).toBe('npc:BBB');
  });

  it('playNpcTurn updates the game and returns the events', () => {
    const game = loadGame({ currentTurn: 1 }); // npc:BBB, a Warlord, whose best target is EEE
    const events = game.playNpcTurn(scripted(6, 1));
    expect(events.map((e) => e.type)).toEqual(['attackStart', 'roll', 'conquest', 'occupy', 'turnStart']);
    expect(game.nation('BBB').soldiers).toBe(1);
    expect(game.nation('EEE').soldiers).toBe(3);
    expect(game.currentPlayer.id).toBe('npc:CCC');
  });
});

describe('Game: rejected moves', () => {
  it('passes IllegalMoveError and WrongPhaseError through', () => {
    const game = loadGame();
    expect(() => game.transfer('AAA', 'EEE', 4)).toThrow(IllegalMoveError);
    expect(() => game.roll(scripted())).toThrow(WrongPhaseError);
  });

  it('leaves the game unchanged when the engine rejects a move', () => {
    const game = loadGame();
    const before = game.toDocument();
    expect(() => game.transfer('AAA', 'BBB', 1)).toThrow(IllegalMoveError);
    expect(game.toDocument()).toStrictEqual(before);
  });
});

describe('Nation', () => {
  it('reads its fields from the game', () => {
    expect(loadGame().nation('AAA')).toMatchObject({
      code: 'AAA', name: 'Country A', value: 4, owner: 'human', soldiers: 4,
    });
  });

  it('knows its neighbours from the map', () => {
    const nation = loadGame().nation('AAA');
    expect(nation.neighbours).toEqual(['BBB', 'CCC', 'EEE']);
    expect(nation.isNeighbourOf('BBB')).toBe(true);
    expect(nation.isNeighbourOf('DDD')).toBe(false);
  });

  it('can be built on its own and has no public fields', () => {
    const nation = new Nation('XXX', { name: 'X', value: 1, owner: 'human', soldiers: 1 }, []);
    expect(nation.code).toBe('XXX');
    expect(Object.keys(nation)).toEqual([]);
  });
});

describe('Player', () => {
  it('reads its fields from the game', () => {
    expect(loadGame().player('npc:BBB')).toMatchObject({
      id: 'npc:BBB', type: 'npc', profile: 'warlord', homeCode: 'BBB', eliminated: false,
    });
  });

  it('lists only the nations it owns', () => {
    const owned = loadGame().player('human').ownedNations;
    expect(owned.map((n) => n.code).sort()).toEqual(['AAA', 'EEE']);
  });

  it('knows the human from the NPCs', () => {
    const game = loadGame();
    expect(game.player('human').isHuman).toBe(true);
    expect(game.player('npc:BBB').isHuman).toBe(false);
  });

  it('is the current player on its turn', () => {
    expect(loadGame({ currentTurn: 1 }).currentPlayer.id).toBe('npc:BBB');
  });

  it('can be built on its own and has no public fields', () => {
    const player = new Player('human', { type: 'human', profile: null, homeCode: 'XXX', eliminated: false }, []);
    expect(player.id).toBe('human');
    expect(Object.keys(player)).toEqual([]);
  });
});

describe('Battle (GAME_RULES §5.4)', () => {
  it('has no battle when no attack is in progress', () => {
    expect(loadGame().battle).toBeNull();
  });

  it('has no battle once the attack is stopped', () => {
    const game = attacking();
    game.stop();
    expect(game.battle).toBeNull();
  });

  it('knows which countries are fighting', () => {
    expect(attacking().battle).toMatchObject({ from: 'AAA', to: 'BBB' });
  });

  it('counts rolls', () => {
    const game = attacking();
    expect(game.battle.rolls).toBe(0);
    game.roll(scripted(6, 1, 1, 6));
    expect(game.battle.rolls).toBe(1);
  });

  it('is not finished while it is still being rolled', () => {
    const game = attacking();
    game.roll(scripted(6, 1, 1, 6));
    expect(game.battle.isFinished).toBe(false);
    expect(game.battle.outcome).toBeNull();
  });

  it('is finished with outcome conquered once the country falls', () => {
    const { battle } = conquering();
    expect(battle.isFinished).toBe(true);
    expect(battle.outcome).toBe('conquered');
  });

  it('can be built on its own and has no public fields', () => {
    const battle = new Battle({ from: 'AAA', to: 'BBB', rolls: 0, bonus: null });
    expect(battle.from).toBe('AAA');
    expect(Object.keys(battle)).toEqual([]);
  });
});

describe('layering (ARCHITECTURE §1)', () => {
  it.each(['src/domain', 'src/game'])('imports no Express or Firebase in %s', (folder) => {
    for (const file of readdirSync(folder)) {
      expect(readFileSync(join(folder, file), 'utf8')).not.toMatch(/from '(express|firebase)/);
    }
  });
});
