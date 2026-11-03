import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// QA 2026-11-03 (found while checking ISSUE-H): ActionBar did `bar.append(hint, npcPaused && button)`.
// `el()` skips a false child, but a raw `append(false)` writes the text "false", so every NPC turn
// showed a stray "false" in the action bar. There is no DOM in the unit tests, so this scans the source.

const jsDir = join(import.meta.dirname, '../../public/js');

function filesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

/** The arguments of one call, from just after its "(" to its matching ")". */
function argsFrom(source, start) {
  let depth = 1;
  let end = start;
  while (end < source.length && depth > 0) {
    if ('([{'.includes(source[end])) depth += 1;
    if (')]}'.includes(source[end])) depth -= 1;
    end += 1;
  }
  return source.slice(start, end - 1);
}

/** What is left of the arguments once everything inside nested brackets is dropped. */
function topLevel(args) {
  let depth = 0;
  let out = '';
  for (const ch of args) {
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (depth === 0) out += ch;
  }
  return out;
}

describe('DOM append calls', () => {
  it('never pass `a && b` or `a || b` straight to append, prepend or replaceChildren', () => {
    const offenders = [];
    for (const path of filesIn(jsDir)) {
      // Comments are not code (a comment may well quote the bad pattern while explaining it).
      const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
      for (const call of source.matchAll(/\.(append|prepend|replaceChildren)\(/g)) {
        const top = topLevel(argsFrom(source, call.index + call[0].length));
        if (/&&|\|\|/.test(top)) {
          const line = source.slice(0, call.index).split('\n').length;
          offenders.push(`${relative(jsDir, path)}:${line}`);
        }
      }
    }
    // A false, null or undefined argument becomes the text "false", "null" or "undefined".
    // Use el()'s falsy-skipping children, or spread an array: ...(cond ? [node] : []).
    expect(offenders).toEqual([]);
  });
});
