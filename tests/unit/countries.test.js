import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import data from '../../src/data/countries.json' with { type: 'json' };

const { countries } = data;
const byCode = Object.fromEntries(countries.map((c) => [c.code, c]));

describe('countries.json (GAME_RULES §1.1)', () => {
  it('records the source and the date it was retrieved', () => {
    expect(data.source).toMatch(/^https:\/\/www\.worldometers\.info\//);
    expect(data.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has at least 190 countries', () => {
    expect(countries.length).toBeGreaterThanOrEqual(190);
  });

  it('gives every country a unique ISO alpha-3 code', () => {
    for (const c of countries) expect(c.code).toMatch(/^[A-Z]{3}$/);
    expect(new Set(countries.map((c) => c.code)).size).toBe(countries.length);
  });

  it('gives every country a name', () => {
    for (const c of countries) expect(c.name.trim().length).toBeGreaterThan(0);
  });

  it('gives every country an integer population above 0', () => {
    for (const c of countries) {
      expect(Number.isInteger(c.population)).toBe(true);
      expect(c.population).toBeGreaterThan(0);
    }
  });

  it('keeps every capital latitude between -90 and 90', () => {
    for (const c of countries) {
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
    }
  });

  it('keeps every capital longitude between -180 and 180', () => {
    for (const c of countries) {
      expect(c.lng).toBeGreaterThanOrEqual(-180);
      expect(c.lng).toBeLessThanOrEqual(180);
    }
  });

  // Decision S03: sovereign states only (193 UN members + the 2 observer states), so the
  // random picks in §3.2 aren't flooded with 1-soldier territories.
  it('has exactly the 195 sovereign states', () => {
    expect(countries.length).toBe(195);
  });

  it('includes island states and both UN observer states', () => {
    for (const code of ['TUV', 'NRU', 'FJI', 'ISL', 'JPN', 'MDV', 'VAT', 'PSE']) {
      expect(byCode[code], `${code} is missing`).toBeDefined();
    }
  });

  it('leaves out territories that are not sovereign states', () => {
    for (const code of ['HKG', 'MAC', 'TWN', 'ESH', 'PRI', 'GRL', 'FLK', 'TKL', 'SHN', 'BES']) {
      expect(byCode[code], `${code} should not be in the catalogue`).toBeUndefined();
    }
  });

  it('has only the five fields from §1.1 on each entry', () => {
    for (const c of countries) {
      expect(Object.keys(c).sort()).toEqual(['code', 'lat', 'lng', 'name', 'population']);
    }
  });
});

// Spot-checks against the §1.2 brackets. These test the data, not soldierValue (that is S04),
// so they only assert the population sits inside the bracket the rules expect.
describe('population spot-checks (GAME_RULES §1.2)', () => {
  const brackets = [
    // [code, bracket value, lower bound (exclusive), upper bound (inclusive)]
    ['IND', 9, 150_000_000, Infinity],
    ['CHN', 9, 150_000_000, Infinity],
    ['MEX', 8, 125_000_000, 150_000_000],
    ['JPN', 7, 100_000_000, 125_000_000],
    ['DEU', 6, 75_000_000, 100_000_000],
    ['ZAF', 5, 50_000_000, 75_000_000],
    ['CAN', 4, 25_000_000, 50_000_000],
    ['PRT', 3, 10_000_000, 25_000_000],
    ['CHE', 2, 5_000_000, 10_000_000],
    ['ISL', 1, 0, 5_000_000],
    ['VAT', 1, 0, 5_000_000],
  ];

  for (const [code, value, low, high] of brackets) {
    it(`puts ${code} in the value-${value} bracket`, () => {
      expect(byCode[code], `${code} is missing`).toBeDefined();
      expect(byCode[code].population).toBeGreaterThan(low);
      expect(byCode[code].population).toBeLessThanOrEqual(high);
    });
  }
});

// Catches swapped lat/lng, or a country's centre used instead of its capital.
describe('capital spot-checks (GAME_RULES §1.1)', () => {
  const capitals = [
    // [code, capital, lat, lng] — within 1 degree
    ['ZAF', 'Pretoria', -25.7, 28.2],
    ['JPN', 'Tokyo', 35.7, 139.7],
    ['USA', 'Washington, D.C.', 38.9, -77.0],
    ['BRA', 'Brasília', -15.8, -47.9],
    ['RUS', 'Moscow', 55.8, 37.6],
  ];

  for (const [code, capital, lat, lng] of capitals) {
    it(`places ${code} at ${capital}`, () => {
      expect(byCode[code], `${code} is missing`).toBeDefined();
      expect(Math.abs(byCode[code].lat - lat)).toBeLessThanOrEqual(1);
      expect(Math.abs(byCode[code].lng - lng)).toBeLessThanOrEqual(1);
    });
  }
});

describe('GET /api/countries', () => {
  it('answers with 200 and the whole catalogue', async () => {
    const res = await request(createApp()).get('/api/countries');
    expect(res.status).toBe(200);
    expect(res.body.countries).toEqual(countries);
    expect(res.body.source).toBe(data.source);
    expect(res.body.retrievedOn).toBe(data.retrievedOn);
  });

  it('needs no login', async () => {
    const res = await request(createApp()).get('/api/countries');
    expect(res.status).not.toBe(401);
  });
});
