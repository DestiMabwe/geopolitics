import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { apiRouter } from '../../src/routes/api.js';
import { requireAuth } from '../../src/middleware/requireAuth.js';
import { toPublicGame } from '../../src/controllers/gamesController.js';

// PLAN S30, the authority audit: the server decides everything, the client only sends intent (CLAUDE.md
// hard rules). These tests fail the day someone breaks one of those rules by accident.

const root = join(import.meta.dirname, '../..');

function jsFilesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFilesIn(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

// Comments are allowed to mention a banned name ("no Math.random here"); only code counts.
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Plain string literals are blanked too, so a CSS class like 'nation-card__soldiers' is not read as arithmetic.
const withoutStrings = (text) => text.replace(/(['"])(?:\\.|(?!\1).)*\1/g, '""');

const scan = (dir, banned, { allow = [] } = {}) =>
  jsFilesIn(join(root, dir))
    .filter((path) => !allow.includes(relative(root, path).replaceAll('\\', '/')))
    .flatMap((path) => {
      const code = withoutStrings(withoutComments(readFileSync(path, 'utf8')));
      return banned.filter(([, pattern]) => pattern.test(code)).map(([name]) => `${relative(root, path)}: ${name}`);
    });

describe('src/game stays pure (CLAUDE.md hard rules)', () => {
  it('imports no firebase-admin, express, Anthropic SDK or node:crypto', () => {
    expect(
      scan('src/game', [
        ['firebase-admin', /from\s+['"]firebase-admin/],
        ['express', /from\s+['"]express/],
        ['@anthropic-ai/sdk', /from\s+['"]@anthropic-ai/],
        ['node:crypto', /from\s+['"](node:)?crypto['"]/],
      ]),
    ).toEqual([]);
  });

  it('uses no Math.random, Date.now, new Date or fetch', () => {
    expect(
      scan('src/game', [
        ['Math.random', /Math\.random\s*\(/],
        ['Date.now', /Date\.now\s*\(/],
        ['new Date', /new\s+Date\s*\(/],
        ['fetch', /\bfetch\s*\(/],
      ]),
    ).toEqual([]);
  });
});

describe('the client does no dice or soldier maths (CLAUDE.md hard rules)', () => {
  it('rolls no dice and picks nothing at random', () => {
    expect(
      scan('public/js', [
        ['Math.random', /Math\.random\s*\(/],
        ['crypto', /\bcrypto\./],
        ['randomInt', /randomInt/],
      ]),
    ).toEqual([]);
  });

  it('adds up, takes away or compares no soldier counts', () => {
    // `soldiers` next to an arithmetic operator. Assigning or showing a server number is fine.
    // placements.js is the one exception, by decision (S26b): it counts the soldiers a player has put on
    // the steppers so the form can say how many are left to place. The server re-checks the final split.
    expect(
      scan(
        'public/js',
        [['arithmetic on soldiers', /soldiers\s*[-+*/]\s*[\w(]|[\w)]\s*[-+*/]\s*[\w.]*soldiers\b/]],
        { allow: ['public/js/placements.js'] },
      ),
    ).toEqual([]);
  });
});

describe('every POST goes through requireAuth (CLAUDE.md hard rules)', () => {
  const posts = apiRouter.stack.filter((layer) => layer.route?.methods.post);

  it('has POST routes to check', () => {
    expect(posts.length).toBeGreaterThanOrEqual(10);
  });

  it.each(posts.map((layer) => [layer.route.path, layer.route.stack.map((s) => s.handle)]))(
    'POST %s runs requireAuth first',
    (path, handlers) => {
      expect(handlers[0]).toBe(requireAuth);
    },
  );
});

describe('the public game never carries ownerUid (CLAUDE.md hard rules)', () => {
  const doc = { id: 'g1', ownerUid: 'secret-uid', status: 'active', round: 1, createdAt: null, updatedAt: null };

  it('strips it for the owner, a visitor and a logged-in stranger', () => {
    for (const uid of ['secret-uid', null, 'someone-else']) {
      expect(JSON.stringify(toPublicGame(doc, uid))).not.toContain('secret-uid');
    }
  });

  it('only says whether the caller is the owner', () => {
    expect(toPublicGame(doc, 'secret-uid').isOwner).toBe(true);
    expect(toPublicGame(doc, null).isOwner).toBe(false);
    expect(toPublicGame(doc, 'someone-else').isOwner).toBe(false);
  });
});
