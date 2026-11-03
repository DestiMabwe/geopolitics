import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// DESIGN §0: every colour comes from tokens.css, so a raw hex anywhere else in public/ is a bug.

const publicDir = join(import.meta.dirname, '../../public');
const tokensPath = join(publicDir, 'css/tokens.css');
const mainPath = join(publicDir, 'css/main.css');

function filesIn(dir, exts) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(path, exts);
    return exts.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
  });
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

describe('design tokens (DESIGN §0, §1)', () => {
  it('has tokens.css and main.css', () => {
    expect(existsSync(tokensPath)).toBe(true);
    expect(existsSync(mainPath)).toBe(true);
  });

  it('uses no raw hex colours outside tokens.css', () => {
    const offenders = filesIn(publicDir, ['.css', '.js', '.html'])
      .filter((path) => path !== tokensPath)
      .flatMap((path) => {
        const text = readFileSync(path, 'utf8');
        return (text.match(HEX) ?? []).map((hex) => `${relative(publicDir, path)}: ${hex}`);
      });
    expect(offenders).toEqual([]);
  });

  it('defines every token main.css uses', () => {
    const tokens = readFileSync(tokensPath, 'utf8');
    const main = readFileSync(mainPath, 'utf8');
    const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...main.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    const missing = [...used].filter((name) => !defined.has(name));
    expect(missing).toEqual([]);
  });

  // DESIGN §2 accessibility, PLAN S29: the dice tumble and every other animation stop for people who ask.
  it('turns animations and transitions off under prefers-reduced-motion', () => {
    const main = readFileSync(mainPath, 'utf8');
    const block = main.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/transition:\s*none/);
  });
});

// QA 2026-11-03 ISSUE-D: narrow country cards broke words mid-letter ("Jorda / n", "Warlor / d", "ZA / F").
// `li` sets overflow-wrap: anywhere, which cards inherit, and the board forced five ~95px columns.
describe('NationCard text (QA ISSUE-D)', () => {
  const css = readFileSync(mainPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  /** Every declaration of every rule whose selector list includes `selector`, as one string. */
  function declarationsFor(selector) {
    const found = [];
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selectors.split(',').some((s) => s.trim() === selector)) found.push(body);
    }
    return found.join(';');
  }

  it('lets a card break lines only at spaces, not inside words', () => {
    expect(declarationsFor('.nation-card')).toMatch(/overflow-wrap:\s*normal/);
  });

  it('never breaks a country code or a profile badge', () => {
    expect(declarationsFor('.nation-card__code')).toMatch(/white-space:\s*nowrap/);
    expect(declarationsFor('.profile-badge')).toMatch(/white-space:\s*nowrap/);
  });

  it('lets the badge drop under the owner name instead of squeezing it', () => {
    expect(declarationsFor('.nation-card__owner-row')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('keeps every board column at least 7rem wide, whatever the screen', () => {
    const columns = [...declarationsFor('.nation-board').matchAll(/grid-template-columns:\s*([^;]+)/g)].map((m) => m[1]);
    expect(columns.length).toBeGreaterThan(0);
    for (const value of columns) {
      const floor = value.match(/minmax\(\s*([\d.]+)rem/);
      expect(floor, `"${value}" has no rem floor`).not.toBeNull();
      expect(Number(floor[1])).toBeGreaterThanOrEqual(7);
    }
  });
});
