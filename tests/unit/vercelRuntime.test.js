import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

// Vercel's Node runtime has require(esm) switched off. firebase-admin/auth pulls in jwks-rsa,
// which require()s jose; jose v6 is ESM-only and crashed every /api/* route with
// ERR_REQUIRE_ESM (S31a). package.json "overrides" pins jwks-rsa's jose to v5 (has a CJS build).
describe('Vercel runtime compatibility', () => {
  it('loads firebase-admin/auth without require(esm)', () => {
    const run = spawnSync(
      process.execPath,
      ['--no-experimental-require-module', '-e', "require('firebase-admin/auth')"],
      { encoding: 'utf8' },
    );
    expect(run.stderr).not.toMatch(/ERR_REQUIRE_ESM/);
    expect(run.status).toBe(0);
  });
});
