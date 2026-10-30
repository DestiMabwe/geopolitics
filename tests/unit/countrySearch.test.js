import { describe, it, expect } from 'vitest';
import { searchCountries, formatPopulation } from '../../public/js/countrySearch.js';

const countries = [
  { code: 'ZAF', name: 'South Africa', value: 5 },
  { code: 'IND', name: 'India', value: 9 },
  { code: 'KEN', name: 'Kenya', value: 5 },
  { code: 'VAT', name: 'Holy See', value: 1 },
];
const codes = (list) => list.map((c) => c.code);

describe('searchCountries (DESIGN §3.2)', () => {
  it('keeps every country for an empty query, A–Z by name', () => {
    expect(codes(searchCountries(countries, ''))).toEqual(['VAT', 'IND', 'KEN', 'ZAF']);
  });

  it('matches part of the name, ignoring case and surrounding spaces', () => {
    expect(codes(searchCountries(countries, '  AFR '))).toEqual(['ZAF']);
  });

  it('matches the code', () => {
    expect(codes(searchCountries(countries, 'vat'))).toEqual(['VAT']);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchCountries(countries, 'atlantis')).toEqual([]);
  });

  it('sorts by soldier value, highest first, ties A–Z', () => {
    expect(codes(searchCountries(countries, '', 'value'))).toEqual(['IND', 'KEN', 'ZAF', 'VAT']);
  });

  it('does not reorder the input', () => {
    const input = [...countries];
    searchCountries(input, '');
    expect(input).toEqual(countries);
  });
});

describe('formatPopulation', () => {
  it.each([
    [64_007_187, '64.0M'],
    [1_463_865_525, '1.46B'],
    [850_000, '850K'],
    [501, '501'],
  ])('shows %i as %s', (population, text) => {
    expect(formatPopulation(population)).toBe(text);
  });
});
