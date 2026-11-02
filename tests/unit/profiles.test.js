import { describe, it, expect } from 'vitest';
import { profileLabel, profileBlurb } from '../../public/js/profiles.js';

// GAME_RULES §8: Warlord (aggressive, targets the human), Fortress (cautious, sure wins only),
// Opportunist (picks off the weak and the leader). The human has no profile.

const PROFILES = ['warlord', 'fortress', 'opportunist'];

describe('profileLabel', () => {
  it('gives each profile its display name', () => {
    expect(profileLabel('warlord')).toBe('Warlord');
    expect(profileLabel('fortress')).toBe('Fortress');
    expect(profileLabel('opportunist')).toBe('Opportunist');
  });

  it('is empty for the human, who has no profile', () => {
    expect(profileLabel(null)).toBe('');
    expect(profileLabel(undefined)).toBe('');
  });

  it('is empty for an unknown code instead of throwing', () => {
    expect(profileLabel('pacifist')).toBe('');
  });
});

describe('profileBlurb', () => {
  it('gives every profile a non-empty one-line blurb', () => {
    for (const p of PROFILES) {
      const blurb = profileBlurb(p);
      expect(blurb.length).toBeGreaterThan(0);
      expect(blurb).not.toContain('\n');
    }
  });

  it('gives each profile a different blurb', () => {
    const blurbs = PROFILES.map(profileBlurb);
    expect(new Set(blurbs).size).toBe(3);
  });

  it('says what makes each profile different (§8)', () => {
    expect(profileBlurb('warlord').toLowerCase()).toContain('human');
    expect(profileBlurb('fortress').toLowerCase()).toMatch(/sure|safe|cautio/);
    expect(profileBlurb('opportunist').toLowerCase()).toMatch(/weak|leader/);
  });

  it('is empty for the human and for an unknown code', () => {
    expect(profileBlurb(null)).toBe('');
    expect(profileBlurb('pacifist')).toBe('');
  });
});
