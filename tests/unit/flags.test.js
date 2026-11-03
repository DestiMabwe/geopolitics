import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { flagPath } from '../../public/js/flags.js';

// Real country flags on the castles (agreed 2026-11-03): one SVG per country, by the game's own 3-letter
// code, vendored from the MIT-licensed flag-icons set so the game makes no outside request for them.

const catalogue = JSON.parse(readFileSync(new URL('../../src/data/countries.json', import.meta.url))).countries;
const file = (code) => new URL(`../../public/flags/${code}.svg`, import.meta.url);

describe('flagPath', () => {
  it('points at the vendored file for a country code', () => {
    expect(flagPath('ARG')).toBe('/flags/ARG.svg');
  });
  it('refuses anything that is not a 3-letter code, so a path can never be built from odd input', () => {
    for (const bad of ['', 'ar', 'ARGX', 'arg', '../x', 'A/G', null, undefined, 42]) {
      expect(flagPath(bad)).toBeNull();
    }
  });
});

describe('the flag files', () => {
  it.each(catalogue.map((c) => [c.code, c.name]))('has a real SVG flag for %s (%s)', (code) => {
    expect(existsSync(file(code))).toBe(true);
    const svg = readFileSync(file(code), 'utf8');
    expect(svg).toMatch(/<svg[\s>]/);
    expect(svg).toMatch(/viewBox="0 0 640 480"/); // the 4:3 set, so every flag has the same shape
  });

  it('carries no script or event handler, since these files are served from our own origin', () => {
    for (const { code } of catalogue) {
      const svg = readFileSync(file(code), 'utf8');
      expect(svg).not.toMatch(/<script/i);
      expect(svg).not.toMatch(/\son\w+\s*=/i);
      expect(svg).not.toMatch(/javascript:/i);
    }
  });

  it('keeps the flag set licence next to the files', () => {
    expect(readFileSync(new URL('../../public/flags/LICENSE', import.meta.url), 'utf8')).toMatch(/MIT License/);
  });
});
