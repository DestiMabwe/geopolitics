import { describe, it, expect } from 'vitest';
import { distanceKm, buildBorders } from '../../src/game/map.js';
import data from '../../src/data/countries.json' with { type: 'json' };

// GAME_RULES §3.9: fixtures sit on the equator, so distance order = longitude gap.
const at = (code, lng) => ({ code, lat: 0, lng });
const row = (codes, lngs) => codes.map((code, i) => at(code, lngs[i]));

function edges(borders) {
  const out = [];
  for (const [a, list] of Object.entries(borders)) {
    for (const b of list) if (a < b) out.push([a, b]);
  }
  return out;
}

function isConnected(borders) {
  const codes = Object.keys(borders);
  const seen = new Set([codes[0]]);
  const queue = [codes[0]];
  while (queue.length) {
    for (const next of borders[queue.shift()]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === codes.length;
}

// Six in a row, 1 degree apart.
const LINE = row(['AAA', 'AAB', 'AAC', 'AAD', 'AAE', 'AAF'], [0, 1, 2, 3, 4, 5]);

// HUB's own nearest 3 are HA1, HA2, HA3, but FAR (and HA4) pick HUB.
const HUB = row(['HUB', 'HA1', 'HA2', 'HA3', 'HA4', 'FAR'], [0, 1, -1, 2, -2, 20]);

// Two clusters of 5, 96 degrees apart at their closest (AAE at 4, ZZA at 100).
const CLUSTERS = [
  ...row(['AAA', 'AAB', 'AAC', 'AAD', 'AAE'], [0, 1, 2, 3, 4]),
  ...row(['ZZA', 'ZZB', 'ZZC', 'ZZD', 'ZZE'], [100, 101, 102, 103, 104]),
];

const REAL_10 = ['ZAF', 'BRA', 'JPN', 'ISL', 'NZL', 'USA', 'EGY', 'IND', 'FJI', 'CHL'].map(
  (code) => data.countries.find((c) => c.code === code),
);

describe('distanceKm (GAME_RULES §3.7.1)', () => {
  it('is 0 between a point and itself', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });

  it('is about 111.19 km per degree of longitude on the equator', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
  });

  it('is a quarter of the circumference from lng 0 to lng 90', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(10007.54, 1);
  });

  it('is the same in both directions', () => {
    const a = { lat: -33.9, lng: 18.4 };
    const b = { lat: 51.5, lng: -0.1 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6);
  });

  it('takes the short way round across the date line', () => {
    expect(distanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 })).toBeCloseTo(222.39, 1);
  });
});

describe('buildBorders: nearest 3 (GAME_RULES §3.7.2)', () => {
  it('gives every country a list, keyed by code', () => {
    const borders = buildBorders(LINE);
    expect(Object.keys(borders).sort()).toEqual(['AAA', 'AAB', 'AAC', 'AAD', 'AAE', 'AAF']);
  });

  it('links each country to its 3 nearest others', () => {
    // AAA's nearest are 1, 2 and 3 degrees away, and nobody further picks AAA.
    expect(buildBorders(LINE).AAA).toEqual(['AAB', 'AAC', 'AAD']);
  });

  // MMM is at 0 with PPP and QQQ 1 and 2 away. BBB and YYY tie at 10 for the third slot.
  // YYY has three friends closer than MMM, so symmetry can't add MMM back.
  it.each([
    ['BBB on the left', { PPP: 1, QQQ: 2, BBB: -10, YYY: 10, YYA: 11, YYB: 12, YYC: 13 }],
    ['BBB on the right', { PPP: -1, QQQ: -2, BBB: 10, YYY: -10, YYA: -11, YYB: -12, YYC: -13 }],
  ])('breaks a distance tie in favour of the lower code (%s)', (_, lngs) => {
    const countries = [at('MMM', 0), ...Object.entries(lngs).map(([code, lng]) => at(code, lng))];
    const borders = buildBorders(countries);
    expect(borders.MMM).toEqual(['BBB', 'PPP', 'QQQ']);
    expect(borders.MMM).not.toContain('YYY');
  });

  it('respects a custom k', () => {
    const countries = row(['AAA', 'AAB', 'AAC', 'AAD'], [0, 1, 3, 6]);
    expect(buildBorders(countries, 1)).toEqual({
      AAA: ['AAB'],
      AAB: ['AAA', 'AAC'],
      AAC: ['AAB', 'AAD'],
      AAD: ['AAC'],
    });
  });
});

describe('buildBorders: symmetry (GAME_RULES §3.7.3)', () => {
  it('is symmetric: if A lists B then B lists A', () => {
    for (const fixture of [LINE, HUB, CLUSTERS, REAL_10]) {
      const borders = buildBorders(fixture);
      for (const [a, list] of Object.entries(borders)) {
        for (const b of list) expect(borders[b]).toContain(a);
      }
    }
  });

  it("adds the reverse link even when A is not in B's nearest 3", () => {
    expect(buildBorders(HUB).HUB).toEqual(['FAR', 'HA1', 'HA2', 'HA3', 'HA4']);
  });

  it('never lists a country as its own neighbour', () => {
    for (const [code, list] of Object.entries(buildBorders(HUB))) {
      expect(list).not.toContain(code);
    }
  });

  it('has no duplicates in a list', () => {
    for (const list of Object.values(buildBorders(HUB))) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('returns each list sorted by code', () => {
    for (const list of Object.values(buildBorders(REAL_10))) {
      expect(list).toEqual([...list].sort());
    }
  });
});

describe('buildBorders: connected (GAME_RULES §3.7.4)', () => {
  it('is always connected', () => {
    for (const fixture of [LINE, HUB, CLUSTERS, REAL_10]) {
      expect(isConnected(buildBorders(fixture))).toBe(true);
    }
  });

  it('joins two far-apart clusters of 5 with exactly one extra link', () => {
    const cross = edges(buildBorders(CLUSTERS)).filter(([a, b]) => a[0] !== b[0]);
    expect(cross).toEqual([['AAE', 'ZZA']]);
  });

  // With k = 1 there are two groups either side of the date line. The two closest
  // cross links are both 178 degrees, so the alphabetically first pair wins.
  it.each([
    ['AAA on the left', row(['AAA', 'AAB', 'ZZA', 'ZZB'], [-1, 1, 179, -179]), ['AAA', 'ZZB']],
    ['AAA on the right', row(['AAB', 'AAA', 'ZZA', 'ZZB'], [-1, 1, 179, -179]), ['AAA', 'ZZA']],
  ])('picks the alphabetically first pair when two shortest links tie (%s)', (_, countries, link) => {
    const cross = edges(buildBorders(countries, 1)).filter(([a, b]) => a[0] !== b[0]);
    expect(cross).toEqual([link]);
  });
});

describe('buildBorders: purity', () => {
  it('does not mutate the input array or its objects', () => {
    const input = HUB.map((c) => Object.freeze({ ...c }));
    Object.freeze(input);
    const before = structuredClone(input);
    buildBorders(input);
    expect(input).toEqual(before);
  });
});
