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
});
