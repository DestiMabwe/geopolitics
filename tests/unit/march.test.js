import { describe, it, expect } from 'vitest';
import { marchFor, MAX_FIGURES } from '../../public/js/march.js';

// Which soldiers walk where, for the castle map. Decoration only: every number on screen still comes
// from the server, and a squad is capped so a big army is a picture, not a count.

const ev = (type, data) => ({ seq: 1, type, data });

describe('marchFor (agreed design, 2026-11-03)', () => {
  it('sends a squad out along the road when an attack is declared', () => {
    expect(marchFor(ev('attackStart', { player: 'npc1', from: 'ARG', to: 'PER' }))).toEqual({
      action: 'advance', from: 'ARG', to: 'PER', figures: 3, owner: 'npc1',
    });
  });

  it('marches the waiting squad into the castle on a conquest', () => {
    expect(marchFor(ev('conquest', { player: 'npc1', from: 'ARG', to: 'PER', bonus: 3 }))).toMatchObject({
      action: 'enter', from: 'ARG', to: 'PER', owner: 'npc1',
    });
  });

  it('sends the squad back when the attack fails or is stopped', () => {
    for (const type of ['attackFailed', 'attackStopped']) {
      expect(marchFor(ev(type, { player: 'npc1', from: 'ARG', to: 'PER' }))).toMatchObject({
        action: 'retreat', from: 'ARG', to: 'PER',
      });
    }
  });

  it('marches the soldiers who move in after a conquest, and those in a transfer', () => {
    expect(marchFor(ev('occupy', { player: 'human', from: 'BRA', to: 'PER', count: 2 }))).toMatchObject({
      action: 'march', from: 'BRA', to: 'PER', figures: 2, owner: 'human',
    });
    expect(marchFor(ev('transfer', { player: 'human', from: 'BRA', to: 'ARG', count: 4 }))).toMatchObject({
      action: 'march', from: 'BRA', to: 'ARG', figures: 4,
    });
  });

  it('never draws more figures than the cap, and never fewer than one', () => {
    expect(marchFor(ev('transfer', { player: 'human', from: 'A', to: 'B', count: 40 })).figures).toBe(MAX_FIGURES);
    expect(marchFor(ev('transfer', { player: 'human', from: 'A', to: 'B', count: 0 })).figures).toBe(1);
  });

  it('gives nothing for events that move no soldiers between castles', () => {
    for (const type of ['roll', 'turnStart', 'reinforce', 'skip', 'elimination', 'gameOver']) {
      expect(marchFor(ev(type, { player: 'npc1', from: 'A', to: 'B' }))).toBeNull();
    }
  });

  it('gives nothing when the event does not say where', () => {
    expect(marchFor(ev('transfer', { player: 'human', count: 2 }))).toBeNull();
    expect(marchFor({ seq: 1, type: 'attackStart' })).toBeNull();
  });
});
