import { describe, it, expect } from 'vitest';
import { headerBadge, spectatorStatus } from '../../public/js/spectator.js';

// QA 2026-11-03 ISSUE-F: a visitor on a finished game read "Live" and a red DEFEAT badge.

describe('headerBadge', () => {
  it('shows no badge while the game is being played', () => {
    expect(headerBadge({ status: 'active', isOwner: true })).toBeNull();
    expect(headerBadge({ status: 'active', isOwner: false })).toBeNull();
    expect(headerBadge({ status: null })).toBeNull();
    expect(headerBadge({})).toBeNull();
  });

  it('tells the owner "Victory" or "Defeat"', () => {
    expect(headerBadge({ status: 'won', isOwner: true })).toEqual({ text: 'Victory', tone: 'won' });
    expect(headerBadge({ status: 'lost', isOwner: true })).toEqual({ text: 'Defeat', tone: 'lost' });
  });

  it('treats a missing isOwner as the owner, as the header always has', () => {
    expect(headerBadge({ status: 'lost' })).toEqual({ text: 'Defeat', tone: 'lost' });
  });

  it('tells a visitor "Game over", never that they won or lost', () => {
    for (const status of ['won', 'lost']) {
      expect(headerBadge({ status, isOwner: false })).toEqual({ text: 'Game over', tone: 'over' });
    }
  });
});

describe('spectatorStatus', () => {
  it('says "Live" while the game is on and polls are arriving', () => {
    expect(spectatorStatus({ status: 'active', live: true })).toEqual({ label: 'Live', state: 'live' });
  });

  it('says "Reconnecting…" after a missed poll on a game that is still on', () => {
    expect(spectatorStatus({ status: 'active', live: false })).toEqual({ label: 'Reconnecting…', state: 'stale' });
  });

  it('says "Game over" on a finished game, whatever the polls are doing', () => {
    for (const status of ['won', 'lost']) {
      for (const live of [true, false]) {
        expect(spectatorStatus({ status, live })).toEqual({ label: 'Game over', state: 'over' });
      }
    }
  });

  it('treats an unknown status as a game still on', () => {
    expect(spectatorStatus({ status: undefined, live: true }).state).toBe('live');
  });
});
