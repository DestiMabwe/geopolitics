import { describe, it, expect } from 'vitest';
import { normalisePrivateKey } from '../../src/config/firebase.js';

describe('normalisePrivateKey()', () => {
  it('turns literal \\n in the private key into real newlines', () => {
    // How Vercel and .env store it: one line, backslash + n between parts.
    const stored = '-----BEGIN PRIVATE KEY-----\\nABC\\nDEF\\n-----END PRIVATE KEY-----\\n';
    expect(normalisePrivateKey(stored)).toBe(
      '-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n',
    );
  });

  it('leaves a key that already has real newlines unchanged', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n';
    expect(normalisePrivateKey(key)).toBe(key);
  });

  it('returns undefined when the key is not set', () => {
    expect(normalisePrivateKey(undefined)).toBeUndefined();
  });
});

describe('src/config/firebase.js', () => {
  it('can be imported without credentials (Firebase starts on first use)', async () => {
    // Unit tests have no FIREBASE_* variables; importing must not throw.
    await expect(import('../../src/config/firebase.js')).resolves.toBeDefined();
  });
});
